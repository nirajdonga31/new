import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { EventManager } from "../lib/eventManager.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any
});
const ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET!.trim();

export default async function webhookRoutes(fastify: FastifyInstance) {
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
        done(null, body);
    });

    fastify.post("/api/webhook", async (request, reply) => {
        const sig = request.headers['stripe-signature'] as string;
        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(request.body as Buffer, sig, ENDPOINT_SECRET);
        } catch (err: any) {
            request.log.error(`Webhook Signature Verification Failed: ${err.message}`);
            return reply.code(400).send(`Webhook Error: ${err.message}`);
        }

        const session = event.data.object as Stripe.Checkout.Session;
        // Extract orderId from metadata
        const { eventId, userId, quantity, orderId } = session.metadata || {};

        const seatsToProcess = quantity ? parseInt(quantity, 10) : 1;

        if (!eventId || !userId) {
            if (event.type.startsWith('checkout.session')) {
                request.log.warn(`Webhook ${event.id} missing metadata.`);
            }
            return reply.send({ received: true });
        }

        switch (event.type) {
            case 'checkout.session.completed':
                // Pass orderId to update order status
                await EventManager.confirmSeat(eventId, userId, event.id, seatsToProcess, orderId);
                break;

            case 'checkout.session.expired':
                // Pass orderId to mark order as expired
                await EventManager.releaseSeat(eventId, event.id, seatsToProcess, orderId);
                break;

            case 'checkout.session.async_payment_failed':
                await EventManager.releaseSeat(eventId, event.id, seatsToProcess, orderId);
                break;
        }

        return { received: true };
    });
}