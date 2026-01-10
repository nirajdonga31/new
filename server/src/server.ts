import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { firebaseAuth } from "./auth.js";
import eventRoutes from "./routes/event.route.js";
import webhookRoutes from "./routes/webhook.route.js";

const server = Fastify({ logger: true });

server.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
});

server.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", firebaseAuth);

    protectedRoutes.get("/api/user", async (request) => {
        return { user: request.user };
    });
});

server.register(eventRoutes);
server.register(webhookRoutes);

const PORT = Number(process.env.PORT || 3000);

server.listen({ port: PORT, host: "0.0.0.0" })
    .then(() => {
        server.log.info(`Server running on port ${PORT}`);
    })
    .catch((err) => {
        server.log.error(err);
        process.exit(1);
    });
