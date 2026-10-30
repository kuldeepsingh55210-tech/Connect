process.env.NODE_ENV = "test";
process.env.PORT = "4006";

const http = require("http");
const mongoose = require("mongoose");
const { app } = require("./src/server");
const { connectDB } = require("./src/db/connect");
const { Connection, User } = require("./src/models");
const { RANGES, assertThrowaway, createThrowawayUser, cleanupThrowaway } = require("./scripts/lib/throwaway");

const BASE_URL = "http://localhost:4006";
const PHONES = RANGES.API_DISCOVER;
PHONES.forEach((p) => assertThrowaway(p));

const [PHONE_MAIN, PHONE_ACCEPTED, PHONE_UNRELATED, PHONE_TIER2_1, PHONE_TIER2_2, PHONE_INCOMPLETE] = PHONES;

async function runDiscoverVerification() {
  console.log("=== STARTING DISCOVER MODULE VERIFICATION (THROWAWAY USERS) ===\n");

  await connectDB();
  await cleanupThrowaway(PHONES);

  // Setup throwaway users for Discover verification
  const mainUser = await createThrowawayUser(PHONE_MAIN, {
    name: "Disc Main User",
    city: "Bangalore",
    skills: ["AI", "Backend Dev"],
    interests: ["Gym", "Running"],
  });

  const acceptedPeer = await createThrowawayUser(PHONE_ACCEPTED, {
    name: "Disc Accepted Peer",
    city: "Bangalore",
    skills: ["AI", "Product"],
    interests: ["Football"],
  });

  const unrelatedPeer = await createThrowawayUser(PHONE_UNRELATED, {
    name: "Disc Unrelated Peer",
    city: "Bangalore",
    skills: ["Finance", "Sales"],
    interests: ["Yoga", "Reading"],
  });

  const tier2Peer1 = await createThrowawayUser(PHONE_TIER2_1, {
    name: "Disc Tier2 Peer1",
    city: "Delhi",
    skills: ["AI", "Data"],
    interests: ["Cricket"],
  });

  const tier2Peer2 = await createThrowawayUser(PHONE_TIER2_2, {
    name: "Disc Tier2 Peer2",
    city: "Delhi",
    skills: ["AI", "Frontend Dev"],
    interests: ["Music"],
  });

  // Set up accepted connection between Main User and Accepted Peer
  const acceptedPair = Connection.sortedPair(mainUser._id, acceptedPeer._id);
  await Connection.findOneAndUpdate(
    acceptedPair,
    {
      $set: {
        ...acceptedPair,
        initiatedBy: mainUser._id,
        status: "accepted",
        respondedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // Set up ignored connection between Main User and Tier2 Peer1
  const ignoredPair = Connection.sortedPair(mainUser._id, tier2Peer1._id);
  await Connection.findOneAndUpdate(
    ignoredPair,
    {
      $set: {
        ...ignoredPair,
        initiatedBy: tier2Peer1._id,
        status: "ignored",
        respondedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4006, resolve));
  console.log("[test-server] Running on port 4006\n");

  let hasError = false;

  try {
    // 1. Dev Login as Main User
    console.log("--- 1. POST /api/auth/dev-login as Main User ---");
    const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE_MAIN }),
    });
    const loginData = await loginRes.json();
    console.log("Logged in user:", loginData.user);

    const token = loginData.token;
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // 2. Call GET /api/discover
    console.log("\n--- 2. GET /api/discover as Main User ---");
    const discoverRes = await fetch(`${BASE_URL}/api/discover`, {
      method: "GET",
      headers: authHeaders,
    });
    const discoverData = await discoverRes.json();
    console.log(`Status: ${discoverRes.status}`);
    console.log("Full Discover Response:\n", JSON.stringify(discoverData, null, 2));
    if (discoverRes.status !== 200) {
      throw new Error(`Expected 200, got ${discoverRes.status}`);
    }

    // 3. Automated Verification Checks
    console.log("\n--- 3. Verifying Exclusion Results ---");
    const tier1Names = discoverData.tier1.map((u) => u.name);
    const tier2Names = discoverData.tier2.map((u) => u.name);

    console.log(`Tier 1 names: [${tier1Names.join(", ")}]`);
    console.log(`Tier 2 names: [${tier2Names.join(", ")}]`);

    // Accepted peer must NOT appear in Tier 1
    const acceptedExcluded = !tier1Names.includes("Disc Accepted Peer");
    console.log(`- Accepted peer excluded from Tier 1: ${acceptedExcluded ? "PASS" : "FAIL"}`);
    if (!acceptedExcluded) throw new Error("Accepted peer was NOT excluded from Tier 1");

    // Tier2 Peer 1 ('ignored') & Tier2 Peer 2 (no connection) MUST still appear in Tier 2
    const tier2_1Included = tier2Names.includes("Disc Tier2 Peer1");
    const tier2_2Included = tier2Names.includes("Disc Tier2 Peer2");
    console.log(`- Tier2 Peer1 ('ignored') in Tier 2: ${tier2_1Included ? "PASS" : "FAIL"}`);
    console.log(`- Tier2 Peer2 (no connection) in Tier 2: ${tier2_2Included ? "PASS" : "FAIL"}`);
    if (!tier2_1Included || !tier2_2Included) throw new Error("Tier 2 peers missing from Tier 2");

    // Unrelated peer must appear in neither tier
    const hasUnrelatedInNeither =
      !tier1Names.includes("Disc Unrelated Peer") && !tier2Names.includes("Disc Unrelated Peer");
    console.log(`- Unrelated peer appears in neither tier: ${hasUnrelatedInNeither ? "PASS" : "FAIL"}`);
    if (!hasUnrelatedInNeither) throw new Error("Unrelated peer appeared in discover tiers");

    // Check privacy: Ensure no sensitive fields (dob, gender, authId) exist in any result
    const allUsers = [...discoverData.tier1, ...discoverData.tier2];
    const hasSensitiveFields = allUsers.some(
      (u) => u.dob !== undefined || u.gender !== undefined || u.authId !== undefined
    );
    console.log(`- Privacy check (no dob, gender, authId leaked): ${!hasSensitiveFields ? "PASS" : "FAIL"}`);
    if (hasSensitiveFields) throw new Error("Privacy leak in discover results!");

    // 4. Blocked Connection Test: Block Tier2 Peer 2 and verify exclusion
    console.log("\n--- 4. Testing 'blocked' Connection Exclusion ---");
    const blockPair = Connection.sortedPair(mainUser._id, tier2Peer2._id);

    await Connection.findOneAndUpdate(
      blockPair,
      {
        $set: {
          ...blockPair,
          initiatedBy: mainUser._id,
          status: "blocked",
          respondedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    const discoverAfterBlockRes = await fetch(`${BASE_URL}/api/discover`, {
      method: "GET",
      headers: authHeaders,
    });
    const discoverAfterBlockData = await discoverAfterBlockRes.json();
    const tier2NamesAfterBlock = discoverAfterBlockData.tier2.map((u) => u.name);
    console.log(`Tier 2 names after blocking Tier2 Peer2: [${tier2NamesAfterBlock.join(", ")}]`);
    const tier2_2ExcludedAfterBlock = !tier2NamesAfterBlock.includes("Disc Tier2 Peer2");
    console.log(`- Tier2 Peer2 ('blocked' connection) excluded from Tier 2: ${tier2_2ExcludedAfterBlock ? "PASS" : "FAIL"}`);
    if (!tier2_2ExcludedAfterBlock) throw new Error("Blocked user was not excluded from Tier 2");

    // 5. Incomplete Profile Check (Expect 403 PROFILE_REQUIRED)
    console.log("\n--- 5. Incomplete Profile Check (New User with profileCompleted: false) ---");
    const newUserRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE_INCOMPLETE }),
    });
    const newUserData = await newUserRes.json();
    const newUserToken = newUserData.token;

    const uncompletedDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${newUserToken}`,
      },
    });
    const uncompletedDiscoverData = await uncompletedDiscoverRes.json();
    console.log(`Status: ${uncompletedDiscoverRes.status}`);
    console.log("Response:", JSON.stringify(uncompletedDiscoverData, null, 2));
    const incompleteBlocked = uncompletedDiscoverRes.status === 403;
    console.log(`- Incomplete profile blocked with 403 PROFILE_REQUIRED: ${incompleteBlocked ? "PASS" : "FAIL"}`);
    if (!incompleteBlocked) throw new Error("Incomplete profile did not return 403 PROFILE_REQUIRED");

    console.log("\n=== ALL DISCOVER VERIFICATIONS PASSED ===");
  } catch (err) {
    console.error("Verification error:", err);
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

runDiscoverVerification();
