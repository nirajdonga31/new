import type { FastifyReply, FastifyRequest } from "fastify";
import admin from "./firebase.js";

export async function firebaseAuth(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    // Improved Validation
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.code(401).send({ error: "Unauthorized: Missing or invalid header format" });
        return;
    }

    // Safety check to ensure we have a token part
    const parts = authHeader.split(" ");
    if (parts.length < 2) {
        reply.code(401).send({ error: "Unauthorized: Token missing" });
        return;
    }

    const idToken = parts[1];

    try {
        const decoded = await admin.auth().verifyIdToken(idToken as string);
        request.user = decoded;
    } catch (err) {
        request.log.warn(`Auth failed: ${err}`);
        reply.code(401).send({ error: "Invalid or expired token" });
    }
}