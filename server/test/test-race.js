// test-suite.js
const BASE_URL = "http://localhost:3000/api";

// --- HELPERS ---

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

// Generates a random email to ensure fresh users every run
const getEmail = (prefix) => `${prefix}_${Math.random().toString(36).substring(7)}@test.com`;

async function setupUsers() {
    console.log("\n🛠️  Setting up Users...");

    // Host
    const hostCreds = { email: getEmail('host'), password: "password123" };
    await request("/register", "POST", hostCreds);
    const hostLogin = await request("/login", "POST", hostCreds);

    // User A
    const userACreds = { email: getEmail('userA'), password: "password123" };
    await request("/register", "POST", userACreds);
    const userALogin = await request("/login", "POST", userACreds);

    // User B
    const userBCreds = { email: getEmail('userB'), password: "password123" };
    await request("/register", "POST", userBCreds);
    const userBLogin = await request("/login", "POST", userBCreds);

    return {
        host: hostLogin,
        userA: userALogin,
        userB: userBLogin
    };
}

// --- TEST CASES ---

async function testPaidRace(users) {
    console.log("\n🧪 TEST CASE 1: Paid Event Race (1 Seat vs 2 Users)");

    // Create Paid Event ($100, 1 Seat)
    const eventRes = await request("/events", "POST", {
        name: "Paid Concert",
        price: 100,
        location: "Arena",
        eventType: "fun",
        seats: 1
    }, users.host.idToken);

    if (!eventRes.id) { console.error("Failed to create event"); return; }
    console.log(`   Event Created: ${eventRes.id} ($100, 1 Seat)`);

    // Race
    console.log("   🏁 Firing requests...");
    const p1 = request(`/events/${eventRes.id}/join`, "POST", {}, users.userA.idToken);
    const p2 = request(`/events/${eventRes.id}/join`, "POST", {}, users.userB.idToken);
    const [resA, resB] = await Promise.all([p1, p2]);

    // Validation
    // For paid events, success means we got a paymentUrl
    const successA = !!resA.paymentUrl;
    const successB = !!resB.paymentUrl;

    console.log(`   User A: ${successA ? "✅ Got URL" : "❌ " + (resA.error || "Failed")}`);
    console.log(`   User B: ${successB ? "✅ Got URL" : "❌ " + (resB.error || "Failed")}`);

    if (successA && successB) console.log("   🚨 FAIL: Double Booking!");
    else if (!successA && !successB) console.log("   ⚠️  FAIL: No one got it.");
    else console.log("   ✅ PASS: Race condition handled correctly.");
}

async function testFreeRace(users) {
    console.log("\n🧪 TEST CASE 2: Free Event Race (1 Seat vs 2 Users)");

    // Create Free Event ($0, 1 Seat)
    const eventRes = await request("/events", "POST", {
        name: "Free Meetup",
        price: 0,
        location: "Park",
        eventType: "fun",
        seats: 1
    }, users.host.idToken);

    if (!eventRes.id) { console.error("Failed to create event"); return; }
    console.log(`   Event Created: ${eventRes.id} ($0, 1 Seat)`);

    // Race
    console.log("   🏁 Firing requests...");
    const p1 = request(`/events/${eventRes.id}/join`, "POST", {}, users.userA.idToken);
    const p2 = request(`/events/${eventRes.id}/join`, "POST", {}, users.userB.idToken);
    const [resA, resB] = await Promise.all([p1, p2]);

    // Validation
    // For free events, success means success:true (no paymentUrl needed)
    const successA = resA.success === true && !resA.error;
    const successB = resB.success === true && !resB.error;

    console.log(`   User A: ${successA ? "✅ Confirmed" : "❌ " + (resA.error || "Failed")}`);
    console.log(`   User B: ${successB ? "✅ Confirmed" : "❌ " + (resB.error || "Failed")}`);

    if (successA && successB) console.log("   🚨 FAIL: Double Booking!");
    else if (!successA && !successB) console.log("   ⚠️  FAIL: No one got it.");
    else console.log("   ✅ PASS: Race condition handled correctly.");
}

async function testAlreadyJoined(users) {
    console.log("\n🧪 TEST CASE 3: Idempotency (Same User Joining Twice)");

    // Create Free Event ($0, 10 Seats)
    const eventRes = await request("/events", "POST", {
        name: "Big Party",
        price: 0,
        location: "Club",
        eventType: "fun",
        seats: 10
    }, users.host.idToken);

    console.log(`   Event Created: ${eventRes.id} ($0, 10 Seats)`);

    // First Join
    console.log("   User A joining 1st time...");
    const res1 = await request(`/events/${eventRes.id}/join`, "POST", {}, users.userA.idToken);

    // Second Join (Race mode: immediately after)
    console.log("   User A joining 2nd time...");
    const res2 = await request(`/events/${eventRes.id}/join`, "POST", {}, users.userA.idToken);

    const success1 = res1.success === true;
    const success2 = res2.success === true;

    console.log(`   Attempt 1: ${success1 ? "✅ Success" : "❌ " + res1.error}`);
    console.log(`   Attempt 2: ${success2 ? "❌ Success (Should Fail)" : "✅ Failed (" + (res2.error || "Unknown") + ")"}`);

    if (success1 && !success2) console.log("   ✅ PASS: User cannot join twice.");
    else console.log("   🚨 FAIL: Idempotency check failed.");
}

// --- MAIN RUNNER ---

async function runSuite() {
    console.log("🚀 STARTING COMPREHENSIVE TEST SUITE...");
    try {
        const users = await setupUsers();
        await testPaidRace(users);
        await testFreeRace(users);
        await testAlreadyJoined(users);
    } catch (err) {
        console.error("Critical Test Error:", err);
    }
    console.log("\n🏁 SUITE COMPLETE");
}

runSuite();