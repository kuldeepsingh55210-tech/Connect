process.env.NODE_ENV = "test";
process.env.PORT = "4005";

const http = require("http");
const mongoose = require("mongoose");
const { app } = require("./src/server");
const { connectDB } = require("./src/db/connect");
const { User } = require("./src/models");
const { RANGES, assertThrowaway, cleanupThrowaway } = require("./scripts/lib/throwaway");

const BASE_URL = "http://localhost:4005";
const TEST_PHONE = RANGES.PROFILE[0]; // +919876543461
assertThrowaway(TEST_PHONE);

async function runTests() {
  console.log("=== STARTING PROFILE MODULE INTEGRATION TESTS (THROWAWAY USER) ===\n");

  await connectDB();
  await cleanupThrowaway([TEST_PHONE]);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4005, resolve));
  console.log("[test-server] Running on port 4005\n");

  let hasError = false;

  try {
    // 1. Dev Login
    console.log("--- 1. POST /api/auth/dev-login ---");
    const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: TEST_PHONE }),
    });
    const loginData = await loginRes.json();
    console.log(`Status: ${loginRes.status}`);
    console.log(`Response:`, JSON.stringify(loginData, null, 2));

    if (!loginData.token) {
      throw new Error("Failed to get auth token from dev-login");
    }
    const token = loginData.token;
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // 2. Attempt invalid skill tag
    console.log("\n--- 2. POST /api/users with Invalid Skill Tag ---");
    const invalidSkillRes = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Throwaway Profile User",
        dob: "1998-05-15",
        gender: "male",
        city: "Bangalore",
        skills: ["AI", "NonExistentSkill123"],
        interests: ["Gym", "Running"],
        intent: ["networking"],
      }),
    });
    const invalidSkillData = await invalidSkillRes.json();
    console.log(`Status: ${invalidSkillRes.status}`);
    console.log(`Response:`, JSON.stringify(invalidSkillData, null, 2));
    if (invalidSkillRes.status !== 400) {
      throw new Error(`Expected 400 for invalid skill, got ${invalidSkillRes.status}`);
    }

    // 3. Attempt under-18 age gate (< 18)
    console.log("\n--- 3. POST /api/users with Age < 18 (Age Gate Check) ---");
    const ageRestrictedRes = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Young User",
        dob: "2015-01-01",
        gender: "male",
        city: "Bangalore",
        skills: ["AI"],
        interests: ["PC Gaming"],
        intent: ["gaming"],
      }),
    });
    const ageRestrictedData = await ageRestrictedRes.json();
    console.log(`Status: ${ageRestrictedRes.status}`);
    console.log(`Response:`, JSON.stringify(ageRestrictedData, null, 2));
    if (ageRestrictedRes.status !== 403) {
      throw new Error(`Expected 403 for under-18, got ${ageRestrictedRes.status}`);
    }

    // 4. Create Profile for dev-login user (Valid)
    console.log("\n--- 4. POST /api/users: Create Valid Profile for Dev User ---");
    const createRes = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Throwaway Profile User",
        dob: "1998-05-15",
        gender: "male",
        city: "bangalore",
        skills: ["AI", "Backend Dev"],
        interests: ["Gym", "Running"],
        intent: ["networking", "startup"],
        photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
        about: "Building cool local networking products in Bangalore.",
      }),
    });
    const createData = await createRes.json();
    console.log(`Status: ${createRes.status}`);
    console.log(`Response:`, JSON.stringify(createData, null, 2));
    if (createRes.status !== 201) {
      throw new Error(`Expected 201 for valid profile, got ${createRes.status}`);
    }

    // 5. Attempt duplicate profile creation (should return 409 Conflict)
    console.log("\n--- 5. POST /api/users: Attempt Duplicate Profile (Expect 409 Conflict) ---");
    const duplicateRes = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Throwaway Profile User Second Attempt",
        dob: "1998-05-15",
        gender: "male",
        city: "Delhi",
        skills: ["AI"],
        interests: ["Cricket"],
        intent: ["networking"],
      }),
    });
    const duplicateData = await duplicateRes.json();
    console.log(`Status: ${duplicateRes.status}`);
    console.log(`Response:`, JSON.stringify(duplicateData, null, 2));
    if (duplicateRes.status !== 409) {
      throw new Error(`Expected 409 for duplicate profile, got ${duplicateRes.status}`);
    }

    // 6. GET /api/users/me returning the created profile
    console.log("\n--- 6. GET /api/users/me: Return Created Profile ---");
    const getMeRes = await fetch(`${BASE_URL}/api/users/me`, {
      method: "GET",
      headers: authHeaders,
    });
    const getMeData = await getMeRes.json();
    console.log(`Status: ${getMeRes.status}`);
    console.log(`Response:`, JSON.stringify(getMeData, null, 2));
    if (getMeRes.status !== 200) {
      throw new Error(`Expected 200 for get profile, got ${getMeRes.status}`);
    }

    // 7. PATCH /api/users/me attempting to update dob or gender (should reject)
    console.log("\n--- 7. PATCH /api/users/me: Attempt Update of dob/gender (Expect 400) ---");
    const patchDobRes = await fetch(`${BASE_URL}/api/users/me`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        dob: "1995-01-01",
      }),
    });
    const patchDobData = await patchDobRes.json();
    console.log(`Status: ${patchDobRes.status}`);
    console.log(`Response:`, JSON.stringify(patchDobData, null, 2));
    if (patchDobRes.status !== 400) {
      throw new Error(`Expected 400 for patch dob, got ${patchDobRes.status}`);
    }

    // 8. PATCH /api/users/me updating allowed fields
    console.log("\n--- 8. PATCH /api/users/me: Update Allowed Fields (city, about, skills) ---");
    const patchRes = await fetch(`${BASE_URL}/api/users/me`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        city: "mumbai",
        about: "Updated bio: Building full-stack apps in Mumbai now.",
        skills: ["AI", "Frontend Dev", "Design"],
      }),
    });
    const patchData = await patchRes.json();
    console.log(`Status: ${patchRes.status}`);
    console.log(`Response:`, JSON.stringify(patchData, null, 2));
    if (patchRes.status !== 200) {
      throw new Error(`Expected 200 for patch allowed fields, got ${patchRes.status}`);
    }

    // 9. GET /api/users/me after update
    console.log("\n--- 9. GET /api/users/me: Verify Updated Profile ---");
    const getUpdatedRes = await fetch(`${BASE_URL}/api/users/me`, {
      method: "GET",
      headers: authHeaders,
    });
    const getUpdatedData = await getUpdatedRes.json();
    console.log(`Status: ${getUpdatedRes.status}`);
    console.log(`Response:`, JSON.stringify(getUpdatedData, null, 2));
    if (getUpdatedRes.status !== 200) {
      throw new Error(`Expected 200 for get updated profile, got ${getUpdatedRes.status}`);
    }

    console.log("\n=== ALL PROFILE TESTS COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Test error:", err);
    hasError = true;
  } finally {
    try {
      await cleanupThrowaway([TEST_PHONE]);
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    server.close();
    await mongoose.disconnect();
    process.exit(hasError ? 1 : 0);
  }
}

runTests();
