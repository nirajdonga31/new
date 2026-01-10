import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors"; // Import CORS
import { firebaseAuth } from "./auth.js";
import eventRoutes from "./routes/event.route.js";
import webhookRoutes from "./routes/webhook.route.js";

const server = Fastify({ logger: true });

// --- FIX: Register CORS ---
server.register(cors, {
    origin: true, // Allow all origins (or specify ["http://localhost:3000"] for stricter security)
});

server.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", firebaseAuth);
    protectedRoutes.get("/api/user", async (request) => {
        return { user: request.user };
    });
});

server.register(eventRoutes);
server.register(webhookRoutes);

const PORT = Number(process.env.PORT || 3001);

server.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
    server.log.info(`Server running on port ${PORT}`);
}).catch((err) => {
    server.log.error(err);
    process.exit(1);
});