import redis from "./redis.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any
});

const JOB_QUEUE_KEY = "scheduler:session_expiration";

export async function startExpirationWorker() {

    // Run this check every 10 seconds
    setInterval(async () => {
        try {
            const now = Date.now();

            // 1. Fetch sessions that are overdue (Score <= Now)
            // ZRANGEBYSCORE key min max
            const overdueSessions = await redis.zrangebyscore(JOB_QUEUE_KEY, 0, now);

            if (overdueSessions.length > 0) {
                console.log(`Processing ${overdueSessions.length} expired sessions...`);

                for (const sessionId of overdueSessions) {
                    try {
                        await stripe.checkout.sessions.expire(sessionId);
                        console.log(` -> Expired session: ${sessionId}`);
                    } catch (err: any) {
                        if (err.code !== 'resource_missing' && err.message.includes('expire')) {
                            console.log(` -> Skipped ${sessionId}: ${err.message}`);
                        }
                    }
                }

                // 3. Remove processed items from Redis
                // We remove exactly the IDs we just fetched
                await redis.zrem(JOB_QUEUE_KEY, ...overdueSessions);
            }
        } catch (err) {
            console.error("Worker Error:", err);
        }
    }, 10000);
}