import redis from "../redis.js";
import admin from "../firebase.js";
import Stripe from "stripe";
import type { Event } from "../types/event.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });
const db = admin.firestore();

// ⚙️ CONFIGURATION
const LOCK_TTL_MS = 2000;
const SLIDING_TTL_SEC = 600;

export const EventManager = {
    // ... (keep your existing getEvent) ...
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

    /**
     * 🟢 STEP 1: RESERVE SEAT
     * Decrement seats, Generate Stripe Link, Don't add to attendees yet.
     */
    async reserveSeat(eventId: string, userId: string, userEmail: string): Promise<{ url?: string; error?: string }> {
        const lockKey = `lock:event:${eventId}`;
        const dataKey = `event:${eventId}`;

        // 1. Lock
        const lock = await redis.set(lockKey, "LOCKED", "PX", LOCK_TTL_MS, "NX");
        if (!lock) return { error: "System busy" };

        try {
            // 2. Get State
            let event = await this.getEvent(eventId);
            if (!event) return { error: "Event not found" };

            // 3. Checks
            if (event.availableSeats <= 0) return { error: "Sold Out" };
            if (event.attendees?.includes(userId)) return { error: "Already joined" };

            // 4. Reserve (Decrement Logic)
            event.availableSeats--;

            // 5. Create Stripe Session
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
                metadata: { eventId, userId }, // 👈 CRITICAL: We need this in the webhook
                success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.CLIENT_URL}/cancel`,
                expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 Min Limit
            });

            // 6. Save State (Reserved but not confirmed)
            await redis.set(dataKey, JSON.stringify(event), "EX", SLIDING_TTL_SEC);

            // Note: We do NOT sync to DB yet. We only sync confirmed changes or wait for the cache to flush.
            // If you want to be extra safe, you can sync the "reserved" count, but typically we wait for money.

            return { url: session.url! };

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

        // Spinlock could be better here, but simple lock for now
        await redis.set(lockKey, "LOCKED", "PX", LOCK_TTL_MS);

        try {
            let event = await this.getEvent(eventId);
            if (!event) return; // Should not happen

            if (!event.attendees) event.attendees = [];

            // Idempotency check: Don't add twice
            if (!event.attendees.includes(userId)) {
                event.attendees.push(userId);

                // Save & Sync
                await redis.set(dataKey, JSON.stringify(event), "EX", SLIDING_TTL_SEC);
                await redis.xadd("stream:events", "*", "eventId", eventId, "action", "CONFIRM_PAYMENT");
                console.log(`✅ User ${userId} confirmed for ${eventId}`);
            }
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

            // Increment back!
            event.availableSeats++;

            // Save & Sync
            await redis.set(dataKey, JSON.stringify(event), "EX", SLIDING_TTL_SEC);
            await redis.xadd("stream:events", "*", "eventId", eventId, "action", "RELEASE_SEAT");
            console.log(`♻️ Seat released for ${eventId}`);
        } finally {
            await redis.del(lockKey);
        }
    }
};