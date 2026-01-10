import type { FastifyInstance } from "fastify";
import admin from "../firebase.js";
import { firebaseAuth } from "../auth.js";
import type { Event } from "../types/event.js";
import { EventManager } from "../lib/eventManager.js";

export default async function eventRoutes(fastify: FastifyInstance) {
    // --- CANCEL Order (Protected) ---
    fastify.post<{ Params: { id: string } }>("/api/orders/:id/cancel", {
        preHandler: firebaseAuth
    }, async (request, reply) => {
        try {
            const orderId = request.params.id;
            const userId = request.user?.uid;

            if (!userId) return reply.code(401).send({ error: "Unauthorized" });

            const result = await EventManager.cancelReservation(orderId, userId);
            return result;

        } catch (err: any) {
            request.log.error(err);

            // CRITICAL FIX: Ensure we always send a text message, never empty JSON
            const errorMessage = err.message || "Unknown server error";

            return reply.code(400).send({ error: errorMessage });
        }
    });

    const db = admin.firestore();

    // --- NEW: List All Events (Public) ---
    // Fixes the error on your Frontend Home Page
    fastify.get("/api/events", async (request, reply) => {
        try {
            const snapshot = await db.collection("events").get();
            // Map the documents to a clean array
            const events = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            return { events };
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Failed to fetch events" });
        }
    });

    fastify.get("/api/orders", {
        preHandler: firebaseAuth
    }, async (request, reply) => {
        try {
            const userId = request.user?.uid;
            if (!userId) return reply.code(401).send({ error: "Unauthorized" });

            const snapshot = await db.collection("orders")
                .where("userId", "==", userId)
                // .orderBy("createdAt", "desc")  <-- COMMENT THIS OUT FOR NOW
                .get();

            const orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            return { orders };
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Failed to fetch orders" });
        }
    });

    // --- GET Event by ID ---
    fastify.get<{ Params: { id: string } }>("/api/events/:id", async (request, reply) => {
        try {
            const { id } = request.params;
            const doc = await db.collection("events").doc(id).get();

            if (!doc.exists) {
                return reply.code(404).send({ error: "Event not found" });
            }
            return { id: doc.id, ...doc.data() };
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Database error" });
        }
    });

    // --- CREATE Event (Protected) ---
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
                availableSeats: body.seats
            };

            const docRef = await db.collection("events").add(newEvent);
            return reply.code(201).send({ success: true, id: docRef.id });
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Failed to create event" });
        }
    });

    // --- JOIN Event (Protected) ---
    fastify.post<{ Params: { id: string }, Body: { quantity: number } }>("/api/events/:id/join", {
        preHandler: firebaseAuth,
        schema: {
            body: {
                type: "object",
                required: ["quantity"],
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
            const { quantity } = request.body;

            if (!userId) return reply.code(401).send({ error: "Unauthorized" });

            const result = await EventManager.reserveSeat(eventId, userId, userEmail, quantity);

            if (result.error) return reply.code(409).send({ error: result.error });

            return {
                success: true,
                paymentUrl: result.url,
                orderId: result.orderId,
                message: `Reserved ${quantity} seats.`
            };

        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: "Failed to join event" });
        }
    });


}