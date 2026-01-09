import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { EventManager } from "../lib/eventManager.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });
const ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function webhookRoutes(fastify: FastifyInstance) {
    // Fastify must parse the raw body for Stripe signature verification
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
        done(null, body);
    });

    fastify.post("/api/webhook", async (request, reply) => {
        const sig = request.headers['stripe-signature'] as string;
        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(request.body as Buffer, sig, ENDPOINT_SECRET);
        } catch (err: any) {
            request.log.error(`Webhook Error: ${err.message}`);
            return reply.code(400).send(`Webhook Error: ${err.message}`);
        }

        const session = event.data.object as Stripe.Checkout.Session;
        const { eventId, userId } = session.metadata || {};

        if (!eventId || !userId) return reply.send(); // Ignore unrelated events

        switch (event.type) {
            case 'checkout.session.completed':
                // 💰 Payment Received: Confirm user
                await EventManager.confirmSeat(eventId, userId);
                break;

            case 'checkout.session.expired':
                // ⏳ Time ran out: Release seat
                await EventManager.releaseSeat(eventId);
                break;

            case 'checkout.session.async_payment_failed':
                // ❌ Failed: Release seat
                await EventManager.releaseSeat(eventId);
                break;
        }

        return { received: true };
    });
}