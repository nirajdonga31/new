import redis from "../redis.js";
import admin from "../firebase.js";
import Stripe from "stripe";
import type { Event } from "../types/event.js";

// Ensure Stripe is initialized after dotenv (if using dotenv/config in server.ts, this is usually fine)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });
const db = admin.firestore();

// ⚙️ CONFIGURATION
// FIX: Increased Lock TTL to 10s to account for Stripe API network latency
const LOCK_TTL_MS = 10000;
// FIX: Increased Cache TTL to 1 hour (Must be > Stripe Session Limit of 30 mins)
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

        // Ensure data is typed correctly
        const eventData = { id: doc.id, ...doc.data() } as Event;

        // Cache it
        await redis.set(key, JSON.stringify(eventData), "EX", SLIDING_TTL_SEC);
        return eventData;
    },

    /**
     * 🟢 STEP 1: RESERVE SEAT
     * Decrement seats in DB & Redis, Generate Stripe Link.
     */
    async reserveSeat(eventId: string, userId: string, userEmail: string): Promise<{ url?: string; error?: string }> {
        const lockKey = `lock:event:${eventId}`;
        const dataKey = `event:${eventId}`;

        // 1. Acquire Lock
        const lock = await redis.set(lockKey, "LOCKED", "PX", LOCK_TTL_MS, "NX");
        if (!lock) return { error: "System busy, please try again." };

        try {
            // 2. Get State
            let event = await this.getEvent(eventId);
            if (!event) return { error: "Event not found" };

            // 3. Checks
            if (event.availableSeats <= 0) return { error: "Sold Out" };
            if (event.attendees?.includes(userId)) return { error: "Already joined" };

            // 4. Create Stripe Session FIRST
            // We do this before DB writes to avoid rolling back DB if Stripe fails.
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                line_items: [{
                    price_data: {
                        currency: "usd",
                        product_data: { name: event.name },
                        unit_amount: event.price * 100, // cents
                    },
                    quantity: 1,
                }],
                metadata: { eventId, userId },
                success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.CLIENT_URL}/cancel`,
                expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 Min Limit
            });

            // 5. Update Database (Persistence)
            // FIX: We MUST decrement in DB now. If we wait for payment, we risk overselling.
            // If payment fails/expires, the webhook calls 'releaseSeat' which increments it back.
            await db.collection("events").doc(eventId).update({
                availableSeats: admin.firestore.FieldValue.increment(-1)
            });

            // 6. Update Local Object & Redis
            event.availableSeats--;
            await redis.set(dataKey, JSON.stringify(event), "EX", SLIDING_TTL_SEC);

            return { url: session.url! };

        } catch (err) {
            console.error("Reserve Error:", err);
            return { error: "Failed to reserve seat" };
        } finally {
            await redis.del(lockKey);
        }
    },

    /**
     * 🟢 STEP 2: PAYMENT SUCCESS (Called by Webhook)
     * Add user to attendees list.
     */
    async confirmSeat(eventId: string, userId: string) {
        const lockKey = `lock:event:${eventId}`;
        const dataKey = `event:${eventId}`;

        // Simple Spinlock-ish wait (optional improvement: retry logic)
        await redis.set(lockKey, "LOCKED", "PX", LOCK_TTL_MS);

        try {
            let event = await this.getEvent(eventId);
            if (!event) return;

            if (!event.attendees) event.attendees = [];

            // Idempotency check
            if (!event.attendees.includes(userId)) {

                // FIX: Update Database First
                await db.collection("events").doc(eventId).update({
                    attendees: admin.firestore.FieldValue.arrayUnion(userId)
                });

                // Update Redis
                event.attendees.push(userId);
                await redis.set(dataKey, JSON.stringify(event), "EX", SLIDING_TTL_SEC);

                // Log to stream (for other consumers)
                await redis.xadd("stream:events", "*", "eventId", eventId, "action", "CONFIRM_PAYMENT", "userId", userId);
                console.log(`✅ User ${userId} confirmed for ${eventId}`);
            }
        } catch (err) {
            console.error("Confirm Error:", err);
        } finally {
            await redis.del(lockKey);
        }
    },

    /**
     * 🔴 STEP 3: PAYMENT FAILED / EXPIRED (Called by Webhook)
     * Release the seat (Increment availableSeats).
     */
    async releaseSeat(eventId: string) {
        const lockKey = `lock:event:${eventId}`;
        const dataKey = `event:${eventId}`;

        await redis.set(lockKey, "LOCKED", "PX", LOCK_TTL_MS);

        try {
            let event = await this.getEvent(eventId);
            if (!event) return;

            // FIX: Update Database First
            await db.collection("events").doc(eventId).update({
                availableSeats: admin.firestore.FieldValue.increment(1)
            });

            // Update Redis
            event.availableSeats++;
            await redis.set(dataKey, JSON.stringify(event), "EX", SLIDING_TTL_SEC);

            await redis.xadd("stream:events", "*", "eventId", eventId, "action", "RELEASE_SEAT");
            console.log(`♻️ Seat released for ${eventId}`);

        } catch (err) {
            console.error("Release Error:", err);
        } finally {
            await redis.del(lockKey);
        }
    }
};