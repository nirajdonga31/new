import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { EventManager } from "../lib/eventManager.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any
});
const ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function webhookRoutes(fastify: FastifyInstance) {
    // Encapsulate the content type parser here to avoid global conflict
    // Fastify async plugins provide a new encapsulation context automatically.
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
        done(null, body);
    });

    fastify.post("/api/webhook", async (request, reply) => {
        const sig = request.headers['stripe-signature'] as string;
        let event: Stripe.Event;

        try {
            // "request.body as Buffer" works because of the content type parser above
            event = stripe.webhooks.constructEvent(request.body as Buffer, sig, ENDPOINT_SECRET);
        } catch (err: any) {
            request.log.error(`Webhook Signature Verification Failed: ${err.message}`);
            return reply.code(400).send(`Webhook Error: ${err.message}`);
        }

        const session = event.data.object as Stripe.Checkout.Session;
        const { eventId, userId } = session.metadata || {};

        // Added error logging for debugging missing metadata
        if (!eventId || !userId) {
            if (event.type.startsWith('checkout.session')) {
                request.log.warn(`Webhook ${event.id} missing metadata. EventID: ${eventId}, UserID: ${userId}`);
            }
            return reply.send({ received: true });
        }

        // Pass event.id to EventManager for idempotency tracking
        switch (event.type) {
            case 'checkout.session.completed':
                // 💰 Payment Received: Confirm user
                await EventManager.confirmSeat(eventId, userId, event.id);
                break;

            case 'checkout.session.expired':
                // ⏳ Time ran out: Release seat
                await EventManager.releaseSeat(eventId, event.id);
                break;

            case 'checkout.session.async_payment_failed':
                // ❌ Failed: Release seat
                await EventManager.releaseSeat(eventId, event.id);
                break;
        }

        return { received: true };
    });
}