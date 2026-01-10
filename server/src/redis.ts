import { Redis } from "ioredis";

if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is not set. Application cannot start.");
}

// Ensure you have AOF enabled in your redis.conf for durability
const redis = new Redis(process.env.REDIS_URL);

redis.on("error", (err) => console.error("Redis Error:", err));

export default redis;