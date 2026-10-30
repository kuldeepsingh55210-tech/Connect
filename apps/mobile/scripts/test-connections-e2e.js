const assert = require("assert");
const { RANGES, assertThrowaway, createThrowawayUser, cleanupThrowaway, disconnectThrowaway } = require("./lib/throwaway");

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const PHONES = RANGES.MOBILE_CONNECTIONS;
PHONES.forEach((p) => assertThrowaway(p));

const [PHONE_A, PHONE_B, PHONE_C, PHONE_D] = PHONES;

async function run() {
  console.log("=== VERIFYING CONNECTIONS SCREEN REQUIREMENTS (THROWAWAY USERS) ===");

  await cleanupThrowaway(PHONES);

  try {
    // 1. Create 4 throwaway users
    const userA = await createThrowawayUser(PHONE_A, { name: "Throwaway Conn User A", city: "Delhi", skills: ["AI", "Design"], interests: ["Reading", "Yoga"] });
    const userB = await createThrowawayUser(PHONE_B, { name: "Throwaway Conn User B", city: "Bangalore", skills: ["AI", "Product"], interests: ["Football"] });
    const userC = await createThrowawayUser(PHONE_C, { name: "Throwaway Conn User C", city: "Bangalore", skills: ["Finance", "Sales"], interests: ["Reading"] });
    const userD = await createThrowawayUser(PHONE_D, { name: "Throwaway Conn User D", city: "Delhi", skills: ["AI", "Data"], interests: ["Cricket"] });

    // 2. Log in all 4 users
    async function login(phone) {
      const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      return { token: data.token, user: data.user, userId: (data.user.id || data.user._id).toString() };
    }

    const authA = await login(PHONE_A);
    const authB = await login(PHONE_B);
    const authC = await login(PHONE_C);
    const authD = await login(PHONE_D);

    console.log(`[1] Logged in as: ${authA.user.name}, ID: ${authA.userId}`);

    // 3. Seed initial connection states:
    // - User B sends connect request to User A (Incoming request 1)
    console.log("User B sending request to User A...");
    const sendB = await fetch(`${API_BASE}/api/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authB.token}` },
      body: JSON.stringify({ toUserId: authA.userId }),
    });
    assert.strictEqual(sendB.status, 201, "User B -> User A must return 201");

    // - User C sends connect request to User A (Incoming request 2)
    console.log("User C sending request to User A...");
    const sendC = await fetch(`${API_BASE}/api/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authC.token}` },
      body: JSON.stringify({ toUserId: authA.userId }),
    });
    assert.strictEqual(sendC.status, 201, "User C -> User A must return 201");

    // - User A sends connect request to User D (Sent request 1)
    console.log("User A sending request to User D...");
    const sendAtoD = await fetch(`${API_BASE}/api/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authA.token}` },
      body: JSON.stringify({ toUserId: authD.userId }),
    });
    assert.strictEqual(sendAtoD.status, 201, "User A -> User D must return 201");

    // Check state before operations
    const [reqInit, connInit, sentInit] = await Promise.all([
      fetch(`${API_BASE}/api/connections?status=pending`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }).then((r) => r.json()),
      fetch(`${API_BASE}/api/connections?status=accepted`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }).then((r) => r.json()),
      fetch(`${API_BASE}/api/connections?status=sent`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }).then((r) => r.json()),
    ]);

    console.log(`\nState Before Operations:`);
    console.log(` - Incoming Requests (${reqInit.connections.length}):`);
    reqInit.connections.forEach((c) => {
      console.log(`    • [ID: ${c.connectionId}] User: ${c.user.name}, City: ${c.user.city}`);
    });
    console.log(` - Connected (${connInit.connections.length}):`);
    console.log(` - Sent (${sentInit.connections.length}):`);
    sentInit.connections.forEach((c) => {
      console.log(`    • [ID: ${c.connectionId}] User: ${c.user.name}, City: ${c.user.city}`);
    });

    assert.strictEqual(reqInit.connections.length, 2, "Must have exactly 2 incoming requests");
    assert.strictEqual(connInit.connections.length, 0, "Must have 0 connected connections");
    assert.strictEqual(sentInit.connections.length, 1, "Must have exactly 1 sent request");

    // TEST 1: User A accepts pending request from User B
    const itemToAccept = reqInit.connections.find((c) => (c.user._id || c.user.id) === authB.userId);
    assert.ok(itemToAccept, "Must find User B's request in incoming list");
    console.log(`\n[TEST 1] Accepting pending request from: ${itemToAccept.user.name} (Connection ID: ${itemToAccept.connectionId})`);

    const acceptRes = await fetch(`${API_BASE}/api/connections/${itemToAccept.connectionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    const acceptData = await acceptRes.json();
    console.log(`Accept Response: status ${acceptRes.status}`, acceptData.message);
    assert.strictEqual(acceptRes.status, 200);

    // TEST 2: User A ignores pending request from User C
    const itemToIgnore = reqInit.connections.find((c) => (c.user._id || c.user.id) === authC.userId);
    assert.ok(itemToIgnore, "Must find User C's request in incoming list");
    console.log(`\n[TEST 2] Ignoring pending request from: ${itemToIgnore.user.name} (Connection ID: ${itemToIgnore.connectionId})`);

    const ignoreRes = await fetch(`${API_BASE}/api/connections/${itemToIgnore.connectionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ action: "ignore" }),
    });
    const ignoreData = await ignoreRes.json();
    console.log(`Ignore Response: status ${ignoreRes.status}`, ignoreData.message);
    assert.strictEqual(ignoreRes.status, 200);

    // Verify state after Accept & Ignore
    const [reqFinal, connFinal, sentFinal] = await Promise.all([
      fetch(`${API_BASE}/api/connections?status=pending`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }).then((r) => r.json()),
      fetch(`${API_BASE}/api/connections?status=accepted`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }).then((r) => r.json()),
      fetch(`${API_BASE}/api/connections?status=sent`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }).then((r) => r.json()),
    ]);

    console.log(`\nState After Operations:`);
    console.log(` - Incoming Requests: ${reqFinal.connections.length}`);
    console.log(` - Connected: ${connFinal.connections.length}`);
    console.log(` - Sent Requests: ${sentFinal.connections.length}`);

    // Confirm accepted item is now in Connected
    const isAcceptedPresentInConnected = connFinal.connections.some(
      (c) => c.connectionId.toString() === itemToAccept.connectionId.toString()
    );
    console.log(`\nVerification Results:`);
    console.log(`[PASS] Accepted connection is in Connected tab: ${isAcceptedPresentInConnected}`);
    assert.ok(isAcceptedPresentInConnected);

    // Confirm accepted item is removed from Requests
    const isAcceptedPresentInRequests = reqFinal.connections.some(
      (c) => c.connectionId.toString() === itemToAccept.connectionId.toString()
    );
    console.log(`[PASS] Accepted connection removed from Requests tab: ${!isAcceptedPresentInRequests}`);
    assert.ok(!isAcceptedPresentInRequests);

    // Confirm ignored item is removed from Requests
    const isIgnoredPresentInRequests = reqFinal.connections.some(
      (c) => c.connectionId.toString() === itemToIgnore.connectionId.toString()
    );
    console.log(`[PASS] Ignored connection removed from Requests tab: ${!isIgnoredPresentInRequests}`);
    assert.ok(!isIgnoredPresentInRequests);

    // Confirm ignored item is NOT in Connected tab
    const isIgnoredPresentInConnected = connFinal.connections.some(
      (c) => c.connectionId.toString() === itemToIgnore.connectionId.toString()
    );
    console.log(`[PASS] Ignored connection NOT in Connected tab: ${!isIgnoredPresentInConnected}`);
    assert.ok(!isIgnoredPresentInConnected);

    // Confirm privacy: All users have only city, no neighborhood/distance
    const allUsers = [
      ...reqFinal.connections.map((c) => c.user),
      ...connFinal.connections.map((c) => c.user),
      ...sentFinal.connections.map((c) => c.user),
    ];
    const privacyViolations = allUsers.filter((u) => u.neighborhood || u.distance || u.distanceKm);
    console.log(`[PASS] Privacy check (no neighborhood/distance): ${privacyViolations.length === 0}`);
    assert.strictEqual(privacyViolations.length, 0);

    console.log("\n=== ALL CONNECTIONS SCREEN BACKEND & WORKFLOW TESTS PASSED! ===");
  } finally {
    try {
      await cleanupThrowaway(PHONES);
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    await disconnectThrowaway();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
