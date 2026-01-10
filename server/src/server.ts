import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import eventRoutes from "./routes/event.route.js";
import webhookRoutes from "./routes/webhook.route.js";
import { startExpirationWorker } from "./worker.js";

const server = Fastify({ logger: true });

server.register(cors, {
    origin: [process.env.CLIENT_URL as string],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
});

server.register(eventRoutes);
server.register(webhookRoutes);

const PORT = Number(process.env.PORT || 3001);

server.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
    server.log.info(`Server running on port ${PORT}`);
    startExpirationWorker();
}).catch((err) => {
    server.log.error(err);
    process.exit(1);
});