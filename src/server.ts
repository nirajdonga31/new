import "dotenv/config";
import Fastify from "fastify";
import { firebaseAuth } from "./auth.js";
import admin from "./firebase.js";
import eventRoutes from "./routes/event.route.js";
import webhookRoutes from "./routes/webhook.route.js";

const server = Fastify({ logger: true });

server.post("/api/register", async (request) => {
    const body = request.body as { email: string; password: string };
    const user = await admin.auth().createUser({
        email: body.email,
        password: body.password
    });
    return { uid: user.uid, email: user.email };
});

server.post("/api/login", async (request) => {
    const body = request.body as { email: string; password: string };
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) throw new Error("FIREBASE_API_KEY is not set in environment variables");
    const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: body.email, password: body.password, returnSecureToken: true })
        }
    );
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || "Authentication failed");
    }
    const data = await resp.json();
    return {
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        localId: data.localId,
        email: data.email
    };
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

server.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
    server.log.info(`Server running on port ${PORT}`);
}).catch((err) => {
    server.log.error(err);
    process.exit(1);
});
