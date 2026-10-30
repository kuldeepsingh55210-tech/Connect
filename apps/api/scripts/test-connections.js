process.env.NODE_ENV = "test";
process.env.PORT = "4007";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const http = require("http");
const mongoose = require("mongoose");
const { app } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User, Connection } = require("../src/models");
const { RANGES, assertThrowaway, createThrowawayUser, cleanupThrowaway } = require("./lib/throwaway");

const BASE_URL = "http://localhost:4007";
const PHONES = RANGES.API_CONNECTIONS;
PHONES.forEach((p) => assertThrowaway(p));

const [PHONE_A, PHONE_B, PHONE_C, PHONE_D] = PHONES;

async function runConnectionsTests() {
  console.log("=== STARTING CONNECTIONS MODULE TESTS (THROWAWAY USERS) ===\n");

  await connectDB();
  await cleanupThrowaway(PHONES);

  // Create clean throwaway users for this suite
  const userA = await createThrowawayUser(PHONE_A, { name: "Conn User A", city: "Bangalore" });
  const userB = await createThrowawayUser(PHONE_B, { name: "Conn User B", city: "Bangalore" });
  const userC = await createThrowawayUser(PHONE_C, { name: "Conn User C", city: "Delhi" });
  const userD = await createThrowawayUser(PHONE_D, { name: "Conn User D", city: "Delhi" });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4007, resolve));
  console.log("[test-server] Running on port 4007\n");

  let hasError = false;

  try {
    async function login(phone) {
      const res = await fetch(`${BASE_URL}/api/auth/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      return { token: data.token, user: data.user };
    }

    const authA = await login(PHONE_A);
    const authB = await login(PHONE_B);
    const authC = await login(PHONE_C);
    const authD = await login(PHONE_D);

    // --- 1. User A sends a connect request to User B → 201 ---
    console.log("--- 1. POST /api/connections: User A sends request to User B (Expect 201) ---");
    const req1Res = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ toUserId: userB._id.toString() }),
    });
    const req1Data = await req1Res.json();
    console.log(`Status: ${req1Res.status}`);
    console.log("Response:", JSON.stringify(req1Data, null, 2));
    if (req1Res.status !== 201) {
      throw new Error(`Expected 201, got ${req1Res.status}`);
    }
    const connectionId = req1Data.connection?._id;

    // --- 2. User A sends a second request to User B → 409 ---
    console.log("\n--- 2. POST /api/connections: User A sends second request to User B (Expect 409 Conflict) ---");
    const req2Res = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ toUserId: userB._id.toString() }),
    });
    const req2Data = await req2Res.json();
    console.log(`Status: ${req2Res.status}`);
    console.log("Response:", JSON.stringify(req2Data, null, 2));
    if (req2Res.status !== 409) {
      throw new Error(`Expected 409, got ${req2Res.status}`);
    }

    // --- 3. User B accepts User A's request → connection status 'accepted' ---
    console.log("\n--- 3. PATCH /api/connections/:id: User B accepts User A's request (Expect 200, status: accepted) ---");
    const acceptRes = await fetch(`${BASE_URL}/api/connections/${connectionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authB.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    const acceptData = await acceptRes.json();
    console.log(`Status: ${acceptRes.status}`);
    console.log("Response:", JSON.stringify(acceptData, null, 2));
    if (acceptRes.status !== 200 || acceptData.connection?.status !== "accepted") {
      throw new Error(`Expected 200 accepted, got status ${acceptRes.status}`);
    }

    // --- 4. GET /api/connections?status=accepted for User A → shows User B ---
    console.log("\n--- 4. GET /api/connections?status=accepted for User A (Expect User B in list) ---");
    const listRes = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authA.token}`,
      },
    });
    const listData = await listRes.json();
    console.log(`Status: ${listRes.status}`);
    console.log("Response:", JSON.stringify(listData, null, 2));
    if (listRes.status !== 200) {
      throw new Error(`Expected 200 for accepted list, got ${listRes.status}`);
    }
    const foundUserB = (listData.connections || []).some(
      (c) => (c.user?._id || c.user?.id) === userB._id.toString() || c.name === "Conn User B"
    );
    if (!foundUserB) {
      throw new Error("User B not found in accepted list for User A");
    }

    // --- 5. User C sends a request to User A, User A ignores it → status 'ignored' ---
    console.log("\n--- 5. User C sends request to User A, User A ignores it (Expect 201 then 200, status: ignored) ---");
    const cReqRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authC.token}`,
      },
      body: JSON.stringify({ toUserId: userA._id.toString() }),
    });
    const cReqData = await cReqRes.json();
    console.log(`User C Request Status: ${cReqRes.status}`);
    if (cReqRes.status !== 201) {
      throw new Error(`Expected 201 from User C connect request, got ${cReqRes.status}`);
    }
    const cConnId = cReqData.connection?._id;

    const ignoreRes = await fetch(`${BASE_URL}/api/connections/${cConnId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ action: "ignore" }),
    });
    const ignoreData = await ignoreRes.json();
    console.log(`Ignore Status: ${ignoreRes.status}`);
    console.log("Ignore Response:", JSON.stringify(ignoreData, null, 2));
    if (ignoreRes.status !== 200 || ignoreData.connection?.status !== "ignored") {
      throw new Error(`Expected 200 ignored, got ${ignoreRes.status}`);
    }

    // --- 6. Rate Limit Test: Attempt connect request when daily limit is exhausted ---
    console.log("\n--- 6. Rate limit verification (User D with dailyConnectCount = 20 expects 429 RATE_LIMITED) ---");
    await User.updateOne(
      { authId: PHONE_D },
      { $set: { dailyConnectCount: 20, dailyConnectCountResetAt: new Date() } }
    );

    const rateLimitRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authD.token}`,
      },
      body: JSON.stringify({ toUserId: userA._id.toString() }),
    });
    const rateLimitData = await rateLimitRes.json();
    console.log(`Rate Limit Status: ${rateLimitRes.status}`);
    console.log("Rate Limit Response:", JSON.stringify(rateLimitData, null, 2));
    if (rateLimitRes.status !== 429 || rateLimitData.error !== "RATE_LIMITED") {
      throw new Error(`Expected 429 RATE_LIMITED, got ${rateLimitRes.status}`);
    }
    console.log("Rate limit verification: PASS");

    console.log("\n=== ALL CONNECTIONS TESTS COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Test error:", err);
    hasError = true;
  } finally {
    try {
      await cleanupThrowaway(PHONES);
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    server.close();
    await mongoose.disconnect();
    process.exit(hasError ? 1 : 0);
  }
}

runConnectionsTests();
