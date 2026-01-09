import redis from "../redis.js";
import admin from "../firebase.js";
import Stripe from "stripe";
import { randomUUID } from "crypto"; // Native Node module for lock tokens
import type { Event } from "../types/event.js";

// Ensure Stripe is initialized
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any
});
const db = admin.firestore();

const LOCK_TTL_MS = 10000;
const SLIDING_TTL_SEC = 3600;

export const EventManager = {
    async getEvent(eventId: string): Promise<Event | null> {
        const key = `event:${eventId}`;
        const cached = await redis.get(key);
        if (cached) {
            await redis.expire(key, SLIDING_TTL_SEC);
            return JSON.parse(cached);
        }

        const doc = await db.collection("events").doc(eventId).get();
        if (!doc.exists) return null;

        const eventData = { id: doc.id, ...doc.data() } as Event;

        // Cache it
        await redis.set(key, JSON.stringify(eventData), "EX", SLIDING_TTL_SEC);
        return eventData;
    },

    /**
     * 🟢 STEP 1: RESERVE SEAT
     * Optimistic locking + Firestore Transaction + Rollback capability
     */
    async reserveSeat(eventId: string, userId: string, userEmail: string): Promise<{ url?: string; status?: string; error?: string }> {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID(); // Unique token for this specific operation

        // 1. Acquire Redis Lock (Mutual Exclusion for performance)
        const acquired = await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS, "NX");
        if (!acquired) return { error: "System busy, please try again." };

        let session: Stripe.Checkout.Session | null = null;

        try {
            // 2. Optimistic Check (Read from Cache/DB without transaction first to fail fast)
            const event = await this.getEvent(eventId);
            if (!event) throw new Error("Event not found");
            if (event.availableSeats <= 0) throw new Error("Sold Out");
            if (event.attendees?.includes(userId)) throw new Error("Already joined");

            const isFree = event.price === 0;

            // 3. Create Stripe Session ONLY if paid (Slow Network Call)
            if (!isFree) {
                // We do this outside the DB transaction to keep the DB lock time minimal.
                session = await stripe.checkout.sessions.create({
                    payment_method_types: ["card"],
                    mode: "payment",
                    line_items: [{
                        price_data: {
                            currency: "usd",
                            product_data: { name: event.name },
                            unit_amount: event.price * 100,
                        },
                        quantity: 1,
                    }],
                    metadata: { eventId, userId },
                    success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.CLIENT_URL}/cancel`,
                    expires_at: Math.floor(Date.now() / 1000) + (60 * 60), // 30 Min Limit
                });
            }

            // 4. Firestore Transaction (The "Moment of Truth")
            // This guarantees we never go below 0 seats, regardless of race conditions.
            const eventRef = db.collection("events").doc(eventId);

            await db.runTransaction(async (t) => {
                const doc = await t.get(eventRef);
                if (!doc.exists) throw new Error("Event not found");

                const data = doc.data() as Event;
                if (data.availableSeats <= 0) {
                    throw new Error("Sold Out"); // Abort transaction
                }

                // Check double-booking inside the transaction
                if (data.attendees?.includes(userId)) {
                    throw new Error("Already joined");
                }

                // Prepare updates
                const updates: any = {
                    availableSeats: admin.firestore.FieldValue.increment(-1)
                };

                // IF FREE: Add attendee immediately (No Webhook needed)
                if (isFree) {
                    updates.attendees = admin.firestore.FieldValue.arrayUnion(userId);
                }

                t.update(eventRef, updates);
            });

            // 5. Invalidate Cache (Safe pattern)
            await redis.del(`event:${eventId}`);

            // Return appropriate response
            if (isFree) {
                console.log(`✅ Free seat confirmed immediately for ${userId} in ${eventId}`);
                return { status: "confirmed" };
            } else {
                return { url: session!.url! };
            }

        } catch (err: any) {
            console.error("Reserve Error:", err.message);

            // 🔴 ROLLBACK: If DB write failed, we MUST cancel the Stripe session
            if (session?.id) {
                try {
                    await stripe.checkout.sessions.expire(session.id);
                    console.log(`⚠️ Expired orphan session ${session.id}`);
                } catch (expireErr) {
                    console.error("Failed to expire session:", expireErr);
                }
            }

            return { error: err.message || "Failed to reserve seat" };
        } finally {
            // 6. Safe Unlock
            const script = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    /**
     * 🟢 STEP 2: PAYMENT SUCCESS (Called by Webhook)
     */
    async confirmSeat(eventId: string, userId: string, stripeEventId: string) {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();

        // Spinlock-ish wait (Simple implementation)
        // Ideally use a queue processing system for webhooks, but this works for simple cases.
        await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS);

        try {
            // 1. Idempotency Check (Critical for Webhooks)
            // We store processed stripe event IDs to ensure we don't process the same one twice.
            const webhookRef = db.collection("webhook_events").doc(stripeEventId);

            // Run in transaction to ensure exact-once processing
            await db.runTransaction(async (t) => {
                const webhookDoc = await t.get(webhookRef);
                if (webhookDoc.exists) {
                    console.log(`Skipping duplicate event ${stripeEventId}`);
                    return;
                }

                const eventRef = db.collection("events").doc(eventId);
                const eventDoc = await t.get(eventRef);
                if (!eventDoc.exists) return;

                // Add user to attendees
                t.update(eventRef, {
                    attendees: admin.firestore.FieldValue.arrayUnion(userId)
                });

                // Mark event as processed
                t.set(webhookRef, { processedAt: new Date(), type: 'confirmSeat' });
            });

            // Invalidate Cache
            await redis.del(`event:${eventId}`);

            // Log to stream
            await redis.xadd("stream:events", "*", "eventId", eventId, "action", "CONFIRM_PAYMENT", "userId", userId);
            console.log(`✅ User ${userId} confirmed for ${eventId}`);

        } catch (err) {
            console.error("Confirm Error:", err);
        } finally {
            // Safe Unlock
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    /**
     * 🔴 STEP 3: PAYMENT FAILED / EXPIRED (Called by Webhook)
     */
    async releaseSeat(eventId: string, stripeEventId: string) {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();

        await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS);

        try {
            // 1. Idempotency Check
            const webhookRef = db.collection("webhook_events").doc(stripeEventId);

            await db.runTransaction(async (t) => {
                const webhookDoc = await t.get(webhookRef);
                if (webhookDoc.exists) {
                    console.log(`Skipping duplicate release ${stripeEventId}`);
                    return;
                }

                const eventRef = db.collection("events").doc(eventId);

                // Increment available seats
                t.update(eventRef, {
                    availableSeats: admin.firestore.FieldValue.increment(1)
                });

                // Mark processed
                t.set(webhookRef, { processedAt: new Date(), type: 'releaseSeat' });
            });

            // Invalidate Cache
            await redis.del(`event:${eventId}`);

            await redis.xadd("stream:events", "*", "eventId", eventId, "action", "RELEASE_SEAT");
            console.log(`♻️ Seat released for ${eventId}`);

        } catch (err) {
            console.error("Release Error:", err);
        } finally {
            // Safe Unlock
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    }
};