import type { FastifyInstance } from "fastify";
import admin from "../firebase.js";
import { firebaseAuth } from "../auth.js";
import type { Event } from "../types/event.js";
import { EventManager } from "../lib/eventManager.js";

export default async function eventRoutes(fastify: FastifyInstance) {
    const db = admin.firestore();

    // --- POST: Create a new Event ---
    fastify.post<{ Body: Event }>("/api/events", {
        preHandler: firebaseAuth,
        schema: {
            body: {
                type: "object",
                required: ["name", "price", "location", "eventType", "seats"],
                properties: {
                    name: { type: "string" },
                    price: { type: "number" },
                    location: { type: "string" },
                    eventType: { type: "string", enum: ["fun", "sports", "educational", "other"] },
                    seats: { type: "integer", minimum: 1 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const body = request.body;
            const user = request.user;

            const newEvent = {
                ...body,
                createdBy: user?.uid,
                createdAt: new Date(),
                attendees: [],
                availableSeats: body.seats
            };

            // Save to "events" collection
            const docRef = await db.collection("events").add(newEvent);

            return reply.code(201).send({ success: true, id: docRef.id });
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Failed to create event" });
        }
    });

    // --- GET: Fetch Event by ID ---
    fastify.get<{ Params: { id: string } }>("/api/events/:id", async (request, reply) => {
        try {
            const { id } = request.params;
            const doc = await db.collection("events").doc(id).get();

            if (!doc.exists) {
                return reply.code(404).send({ error: "Event not found" });
            }

            // Return data with the ID included
            return { id: doc.id, ...doc.data() };
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Database error" });
        }
    });

    fastify.post<{ Params: { id: string }, Body: { quantity?: number } }>("/api/events/:id/join", {
        preHandler: firebaseAuth,
        schema: {
            body: {
                type: "object",
                properties: {
                    quantity: { type: "integer", minimum: 1, maximum: 4 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const eventId = request.params.id;
            const userId = request.user?.uid;
            const userEmail = request.user?.email || "unknown";

            // 🔴 FIX: Safety check for body using "?."
            const quantity = request.body?.quantity || 1;

            if (!userId) {
                return reply.code(401).send({ error: "Unauthorized" });
            }

            const result = await EventManager.reserveSeat(eventId, userId, userEmail, quantity);

            if (result.error) {
                // Return 409 for logical errors (Sold Out), 500 is only for crashes
                return reply.code(409).send({ error: result.error });
            }

            return {
                success: true,
                paymentUrl: result.url,
                message: `Reserved ${quantity} seats. Please complete payment.`
            };

        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Failed to join event" });
        }
    });

}