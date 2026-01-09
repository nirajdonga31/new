import type { FastifyReply, FastifyRequest } from "fastify";
import admin from "./firebase.js";

export async function firebaseAuth(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.code(401).send({ error: "Unauthorized" });
        return;
    }
    const idToken = authHeader.split(" ")[1];
    try {
        const decoded = await admin.auth().verifyIdToken(idToken as string);
        request.user = decoded;
    } catch (err) {
        reply.code(401).send({ error: "Invalid token" });
    }
}
