import { Redis } from "ioredis";

// Ensure you have AOF enabled in your redis.conf for durability
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("error", (err) => console.error("Redis Error:", err));

export default redis;