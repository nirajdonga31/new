// test-race.js
const BASE_URL = "http://localhost:3000/api";

// Helper for API calls
async function request(endpoint, method, body, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        return await res.json();
    } catch (err) {
        return { error: err.message };
    }
}

async function runTest() {
    console.log("🚀 STARTING RACE CONDITION TEST...");

    // 1. REGISTER HOST & LOGIN
    console.log("\n1️⃣  Setting up Host...");
    const hostEmail = `host_${Date.now()}@test.com`;
    await request("/register", "POST", { email: hostEmail, password: "password123" });
    const hostLogin = await request("/login", "POST", { email: hostEmail, password: "password123" });

    // 2. CREATE EVENT (1 SEAT ONLY)
    console.log("2️⃣  Creating Event with 1 Seat...");
    const eventRes = await request("/events", "POST", {
        name: "Test Concert",
        price: 100,
        location: "Arena",
        eventType: "fun",
        seats: 1 // <--- CRITICAL: Only 1 seat available
    }, hostLogin.idToken);

    if (!eventRes.id) {
        console.error("❌ Failed to create event:", eventRes);
        return;
    }
    const eventId = eventRes.id;
    console.log(`   Event ID: ${eventId}`);

    // 3. REGISTER 2 BUYERS
    console.log("\n3️⃣  Registering User A & User B...");
    const emailA = `userA_${Date.now()}@test.com`;
    const emailB = `userB_${Date.now()}@test.com`;

    await request("/register", "POST", { email: emailA, password: "password123" });
    await request("/register", "POST", { email: emailB, password: "password123" });

    const loginA = await request("/login", "POST", { email: emailA, password: "password123" });
    const loginB = await request("/login", "POST", { email: emailB, password: "password123" });

    // 4. THE RACE (Fire both requests at once)
    console.log("\n4️⃣  🏁 FIRING SIMULTANEOUS REQUESTS...");

    const p1 = request(`/events/${eventId}/join`, "POST", {}, loginA.idToken);
    const p2 = request(`/events/${eventId}/join`, "POST", {}, loginB.idToken);

    const [resA, resB] = await Promise.all([p1, p2]);

    // 5. ANALYZE RESULTS
    console.log("\n--- RESULTS ---");
    const successA = resA.paymentUrl ? true : false;
    const successB = resB.paymentUrl ? true : false;

    console.log(`User A: ${successA ? "✅ Got Link" : "❌ " + (resA.error || "Failed")}`);
    console.log(`User B: ${successB ? "✅ Got Link" : "❌ " + (resB.error || "Failed")}`);

    if (successA && successB) {
        console.log("\n🚨 FAIL: BOTH USERS GOT A SEAT! (Double Booking occurred)");
    } else if (!successA && !successB) {
        console.log("\n⚠️  FAIL: NO ONE GOT A SEAT (System locked too aggressively)");
    } else {
        console.log("\n✅ PASS: Only one user secured the seat!");
    }
}

runTest();