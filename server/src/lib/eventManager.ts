import redis from "../redis.js";
import admin from "../firebase.js";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import type { Event } from "../types/event.js";

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
        await redis.set(key, JSON.stringify(eventData), "EX", SLIDING_TTL_SEC);
        return eventData;
    },

    async reserveSeat(eventId: string, userId: string, userEmail: string, quantity: number): Promise<{ url?: string; sessionId?: string; orderId?: string; status?: string; error?: string }> {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();

        // 1. Acquire Lock
        const acquired = await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS, "NX");
        if (!acquired) return { error: "System busy, please try again." };

        let session: Stripe.Checkout.Session | null = null;
        let orderRef: admin.firestore.DocumentReference | null = null;

        try {
            const event = await this.getEvent(eventId);
            if (!event) throw new Error("Event not found");

            if (event.createdBy === userId) {
                throw new Error("You cannot buy tickets for your own event.");
            }

            // 2. Check Availability
            if (event.availableSeats < quantity) {
                throw new Error(`Only ${event.availableSeats} seats available`);
            }

            // 3. Check Duplicate
            const attendeeDoc = await db.collection("events").doc(eventId).collection("attendees").doc(userId).get();
            if (attendeeDoc.exists) throw new Error("Already joined");

            const isFree = event.price === 0;

            // 4. Create Pending Order Record
            orderRef = db.collection("orders").doc();
            await orderRef.set({
                id: orderRef.id,
                eventId,
                userId,
                quantity,
                status: 'pending',
                amount: isFree ? 0 : event.price * quantity,
                createdAt: new Date()
            });

            // 5. Create Stripe Session (if paid)
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
                        quantity: quantity.toString(),
                        orderId: orderRef.id
                    },
                    success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,

                    // --- CHANGED: Add ?orderId=... to cancel_url ---
                    cancel_url: `${process.env.CLIENT_URL}/cancle?orderId=${orderRef.id}`,

                    expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
                });

                await orderRef.update({ sessionId: session.id });

                // Add to Redis for worker cleanup (10 min)
                const JOB_QUEUE_KEY = "scheduler:session_expiration";
                const expireAt = Date.now() + (10 * 60 * 1000);
                await redis.zadd(JOB_QUEUE_KEY, expireAt, session.id);
            }

            // 6. DB Transaction: Reserve Seats
            const eventRef = db.collection("events").doc(eventId);
            await db.runTransaction(async (t) => {
                const doc = await t.get(eventRef);
                if (!doc.exists) throw new Error("Event not found");
                const attRef = eventRef.collection("attendees").doc(userId);
                const attDoc = await t.get(attRef);
                if (attDoc.exists) throw new Error("Already joined");
                const data = doc.data() as Event;
                if (data.availableSeats < quantity) throw new Error("Sold Out");

                t.update(eventRef, { availableSeats: admin.firestore.FieldValue.increment(-quantity) });

                if (isFree) {
                    t.set(attRef, { joinedAt: new Date(), email: userEmail, orderId: orderRef!.id });
                    t.update(orderRef!, { status: 'confirmed' });
                }
            });

            await redis.del(`event:${eventId}`);

            if (isFree) return { status: "confirmed", orderId: orderRef.id };
            else return { url: session!.url!, sessionId: session!.id, orderId: orderRef.id };

        } catch (err: any) {
            console.error("Reserve Error:", err.message);
            if (session?.id) try { await stripe.checkout.sessions.expire(session.id); } catch { }
            if (orderRef) try { await orderRef.update({ status: 'failed', error: err.message }); } catch { }
            return { error: err.message || "Failed to reserve seat" };
        } finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    async confirmSeat(eventId: string, userId: string, stripeEventId: string, quantity: number, orderId?: string) {
        // ... (Same as your original code) ...
        // Re-adding here for completeness if needed, but it's unchanged.
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();
        await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS);
        try {
            const webhookRef = db.collection("webhook_events").doc(stripeEventId);
            await db.runTransaction(async (t) => {
                const webhookDoc = await t.get(webhookRef);
                if (webhookDoc.exists) return;
                const eventRef = db.collection("events").doc(eventId);
                const attendeeRef = eventRef.collection("attendees").doc(userId);
                t.set(attendeeRef, { joinedAt: new Date(), stripeEventId }, { merge: true });
                t.set(webhookRef, { processedAt: new Date(), type: 'confirmSeat', quantity });
                if (orderId) {
                    const orderRef = db.collection("orders").doc(orderId);
                    t.update(orderRef, { status: 'paid' });
                }
            });
            await redis.del(`event:${eventId}`);
        } catch (err) { console.error("Confirm Error:", err); }
        finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    async releaseSeat(eventId: string, stripeEventId: string, quantity: number, orderId?: string) {
        // ... (Same as your original code) ...
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
                if (orderId) {
                    const orderRef = db.collection("orders").doc(orderId);
                    t.update(orderRef, { status: 'expired' });
                }
            });
            await redis.del(`event:${eventId}`);
        } catch (err) { console.error("Release Error:", err); }
        finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    async cancelReservation(orderId: string, userId: string) {
        const orderRef = db.collection("orders").doc(orderId);
        const order = await orderRef.get();

        if (!order.exists) throw new Error("Order not found");
        const data = order.data()!;

        if (data.userId !== userId) throw new Error("Unauthorized");

        if (data.status === 'expired' || data.status === 'cancelled') {
            return { success: true, message: "Already cancelled" };
        }

        // Allow cancelling if it's pending OR if it's stuck in a 'failed' state but has a session
        if (data.status !== 'pending' && data.status !== 'failed') {
            throw new Error("Cannot cancel completed or expired order");
        }

        if (data.sessionId) {
            try {
                // Attempt to tell Stripe to expire the session
                await stripe.checkout.sessions.expire(data.sessionId);
            } catch (err: any) {
                // 3. HANDLE STRIPE ERRORS GRACEFULLY
                console.log("Stripe Expire Error (Handling safely):", err.message);

                // If Stripe says "resource_missing" (already expired) or "status invalid",
                // it means the session is dead, but our DB didn't know.
                // WE MUST FORCE RELEASE THE SEATS NOW.
                const isStale = err.code === 'resource_missing' ||
                    (err.raw && err.raw.code === 'resource_missing') ||
                    err.message.includes('expire') ||
                    err.message.includes('status');

                if (isStale) {
                    console.log("⚠️ Found stale session. Force-releasing seats in DB...");

                    // --- FORCE DB CLEANUP ---
                    await db.runTransaction(async (t) => {
                        const eventRef = db.collection("events").doc(data.eventId);

                        // Increment seats back
                        t.update(eventRef, {
                            availableSeats: admin.firestore.FieldValue.increment(data.quantity)
                        });

                        // Mark order as expired so we don't try again
                        t.update(orderRef, { status: 'expired' });
                    });

                    return { success: true, message: "Fixed stale order and released seats" };
                }

                // If it's some other real error (like network), throw it
                throw err;
            }

            return { success: true, message: "Reservation cancelled" };
        }

        return { success: false, error: "No active session to cancel" };
    }
};