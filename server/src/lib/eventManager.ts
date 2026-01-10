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
        // ... (Keep your reserveSeat logic exactly as it was) ...
        // (I am omitting the top part to save space, assuming it is unchanged from your last working version)

        // COPY-PASTE YOUR EXISTING reserveSeat CODE HERE
        // OR Use the one from the file below if you want the full file

        // --- Quick Mock of reserveSeat for context (Do not copy this comment block, use your full code) ---
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();
        const acquired = await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS, "NX");
        if (!acquired) return { error: "System busy, please try again." };

        let session: Stripe.Checkout.Session | null = null;
        let orderRef: admin.firestore.DocumentReference | null = null;

        try {
            const event = await this.getEvent(eventId);
            if (!event) throw new Error("Event not found");
            if (event.createdBy === userId) throw new Error("You cannot buy tickets for your own event.");
            if (event.availableSeats < quantity) throw new Error(`Only ${event.availableSeats} seats available`);

            const attendeeDoc = await db.collection("events").doc(eventId).collection("attendees").doc(userId).get();
            if (attendeeDoc.exists) throw new Error("Already joined");

            const isFree = event.price === 0;

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

            if (!isFree) {
                session = await stripe.checkout.sessions.create({
                    payment_method_types: ["card"],
                    mode: "payment",
                    line_items: [{
                        price_data: {
                            currency: "usd",
                            product_data: { name: event.name },
                            unit_amount: event.price * 100,
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
                    cancel_url: `${process.env.CLIENT_URL}/cancle?orderId=${orderRef.id}`,
                    expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
                });

                await orderRef.update({ sessionId: session.id });

                const JOB_QUEUE_KEY = "scheduler:session_expiration";
                const expireAt = Date.now() + (10 * 60 * 1000);
                await redis.zadd(JOB_QUEUE_KEY, expireAt, session.id);
            }

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

    // --- FIX 1: UPDATE releaseSeat TO BE IDEMPOTENT ---
    async releaseSeat(eventId: string, stripeEventId: string, quantity: number, orderId?: string) {
        const lockKey = `lock:event:${eventId}`;
        const lockToken = randomUUID();
        await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS);

        try {
            const webhookRef = db.collection("webhook_events").doc(stripeEventId);
            await db.runTransaction(async (t) => {
                // 1. Check if webhook already processed
                const webhookDoc = await t.get(webhookRef);
                if (webhookDoc.exists) return;

                // 2. IMPORTANT: Check if Order is ALREADY expired (by the manual cancel)
                let alreadyHandled = false;
                if (orderId) {
                    const orderRef = db.collection("orders").doc(orderId);
                    const orderDoc = await t.get(orderRef);
                    if (orderDoc.exists) {
                        const status = orderDoc.data()?.status;
                        if (status === 'expired' || status === 'cancelled') {
                            alreadyHandled = true;
                        } else {
                            // Mark as expired if not already
                            t.update(orderRef, { status: 'expired' });
                        }
                    }
                }

                // 3. Mark webhook as processed
                t.set(webhookRef, { processedAt: new Date(), type: 'releaseSeat', quantity });

                // 4. ONLY increment seats if the order wasn't already expired
                if (!alreadyHandled) {
                    const eventRef = db.collection("events").doc(eventId);
                    t.update(eventRef, { availableSeats: admin.firestore.FieldValue.increment(quantity) });
                    console.log(`[Webhook] Released ${quantity} seats for ${eventId}`);
                } else {
                    console.log(`[Webhook] Skipped releasing seats (already done by manual cancel)`);
                }
            });

            await redis.del(`event:${eventId}`);
        } catch (err) { console.error("Release Error:", err); }
        finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await redis.eval(script, 1, lockKey, lockToken);
        }
    },

    // --- FIX 2: UPDATE cancelReservation TO BE IDEMPOTENT ---
    async cancelReservation(orderId: string, userId: string) {
        console.log(`[Manager] Cancelling Order: ${orderId}`);

        const orderRef = db.collection("orders").doc(orderId);
        const order = await orderRef.get();

        if (!order.exists) throw new Error("Order not found");
        const data = order.data()!;

        if (data.userId !== userId) throw new Error("Unauthorized");
        if (data.status === 'expired' || data.status === 'cancelled') {
            return { success: true, message: "Already cancelled" };
        }
        if (data.status !== 'pending' && data.status !== 'failed') {
            throw new Error("Cannot cancel completed order");
        }

        if (data.sessionId) {
            try {
                await stripe.checkout.sessions.expire(data.sessionId);
            } catch (err: any) {
                // Check for "Already Expired" error
                const isStale = err.code === 'resource_missing' ||
                    err.message.includes('expire') ||
                    err.message.includes('status');

                if (isStale) {
                    console.log("⚠️ Session stale. Force-releasing seats...");

                    await db.runTransaction(async (t) => {
                        // 1. RE-READ Order inside transaction to prevent race condition
                        const freshOrder = await t.get(orderRef);
                        const freshData = freshOrder.data();

                        // If webhook updated it to 'expired' just now, DO NOTHING
                        if (freshData?.status === 'expired' || freshData?.status === 'cancelled') {
                            return;
                        }

                        // Otherwise, we do the work
                        const eventRef = db.collection("events").doc(data.eventId);
                        t.update(eventRef, {
                            availableSeats: admin.firestore.FieldValue.increment(data.quantity)
                        });
                        t.update(orderRef, { status: 'expired' });
                    });

                    return { success: true, message: "Fixed stale order" };
                }
                throw err;
            }
            return { success: true, message: "Reservation cancelled" };
        }
        return { success: false, error: "No active session" };
    }
};