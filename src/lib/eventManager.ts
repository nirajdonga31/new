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
    async reserveSeat(eventId: string, userId: string, userEmail: string, quantity: number): Promise<{ url?: string; status?: string; error?: string }> {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();

        const acquired = await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS, "NX");
        if (!acquired) return { error: "System busy, please try again." };

        let session: Stripe.Checkout.Session | null = null;

        try {
            const event = await this.getEvent(eventId);
            if (!event) throw new Error("Event not found");

            // Validate availability
            if (event.availableSeats < quantity) {
                throw new Error(`Only ${event.availableSeats} seats available`);
            }
            if (event.attendees?.includes(userId)) throw new Error("Already joined");

            const isFree = event.price === 0;

            if (!isFree) {
                session = await stripe.checkout.sessions.create({
                    payment_method_types: ["card"],
                    mode: "payment",
                    line_items: [{
                        price_data: {
                            currency: "usd",
                            product_data: { name: event.name },
                            unit_amount: event.price * 100 * quantity,
                        },
                        quantity: quantity,
                    }],
                    metadata: {
                        eventId,
                        userId,
                        quantity: quantity.toString()
                    },
                    success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.CLIENT_URL}/cancel`,
                    expires_at: Math.floor(Date.now() / 1000) + (10 * 60),
                });
            }

            const eventRef = db.collection("events").doc(eventId);

            await db.runTransaction(async (t) => {
                // 🔴 FIX: Typo was here (constPk -> const)
                const doc = await t.get(eventRef);
                if (!doc.exists) throw new Error("Event not found");

                const data = doc.data() as Event;

                if (data.availableSeats < quantity) {
                    throw new Error("Sold Out");
                }
                if (data.attendees?.includes(userId)) {
                    throw new Error("Already joined");
                }

                const updates: any = {
                    availableSeats: admin.firestore.FieldValue.increment(-quantity)
                };

                if (isFree) {
                    updates.attendees = admin.firestore.FieldValue.arrayUnion(userId);
                }

                t.update(eventRef, updates);
            });

            await redis.del(`event:${eventId}`);

            if (isFree) {
                return { status: "confirmed" };
            } else {
                return { url: session!.url! };
            }

        } catch (err: any) {
            console.error("Reserve Error:", err.message);
            if (session?.id) {
                try { await stripe.checkout.sessions.expire(session.id); } catch { }
            }
            return { error: err.message || "Failed to reserve seat" };
        } finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    async confirmSeat(eventId: string, userId: string, stripeEventId: string, quantity: number) {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();
        await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS);

        try {
            const webhookRef = db.collection("webhook_events").doc(stripeEventId);
            await db.runTransaction(async (t) => {
                const webhookDoc = await t.get(webhookRef);
                if (webhookDoc.exists) return;

                const eventRef = db.collection("events").doc(eventId);
                t.update(eventRef, { attendees: admin.firestore.FieldValue.arrayUnion(userId) });
                t.set(webhookRef, { processedAt: new Date(), type: 'confirmSeat', quantity });
            });
            await redis.del(`event:${eventId}`);
        } catch (err) { console.error("Confirm Error:", err); }
        finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    async releaseSeat(eventId: string, stripeEventId: string, quantity: number) {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();
        await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS);

        try {
            const webhookRef = db.collection("webhook_events").doc(stripeEventId);
            await db.runTransaction(async (t) => {
                const webhookDoc = await t.get(webhookRef);
                if (webhookDoc.exists) return;

                const eventRef = db.collection("events").doc(eventId);
                t.update(eventRef, { availableSeats: admin.firestore.FieldValue.increment(quantity) });
                t.set(webhookRef, { processedAt: new Date(), type: 'releaseSeat', quantity });
            });
            await redis.del(`event:${eventId}`);
        } catch (err) { console.error("Release Error:", err); }
        finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    }

};