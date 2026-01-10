import admin from "firebase-admin";
import "fastify";

declare module "fastify" {
    interface FastifyRequest {
        user?: admin.auth.DecodedIdToken;
    }
}
