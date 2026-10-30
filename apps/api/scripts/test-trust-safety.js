process.env.NODE_ENV = "test";
process.env.PORT = "4009";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const http = require("http");
const mongoose = require("mongoose");
const { app } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User, Connection, Report } = require("../src/models");
const { RANGES, assertThrowaway, createThrowawayUser, cleanupThrowaway } = require("./lib/throwaway");

const BASE_URL = "http://localhost:4009";
const ADMIN_KEY = process.env.ADMIN_KEY || "connectlocal_dev_admin_key_2026";
const PHONES = RANGES.API_TRUST_SAFETY;
PHONES.forEach((p) => assertThrowaway(p));

const [PHONE_A, PHONE_B, PHONE_C, PHONE_D, PHONE_TARGET] = PHONES;

async function runTrustSafetyTests() {
  console.log("=== STARTING TRUST & SAFETY MODULE TESTS (THROWAWAY USERS) ===\n");

  await connectDB();
  await cleanupThrowaway(PHONES);

  // Create clean throwaway users for this suite
  const userA = await createThrowawayUser(PHONE_A, { name: "Reporter User A", city: "Bangalore", skills: ["AI"], interests: ["Gym"] });
  const userB = await createThrowawayUser(PHONE_B, { name: "Reporter User B", city: "Bangalore", skills: ["AI"], interests: ["Football"] });
  const userC = await createThrowawayUser(PHONE_C, { name: "Reporter User C", city: "Delhi", skills: ["AI"], interests: ["Music"] });
  const userD = await createThrowawayUser(PHONE_D, { name: "Reporter User D", city: "Bangalore", skills: ["Finance"], interests: ["Yoga"] });
  const targetUser = await createThrowawayUser(PHONE_TARGET, { name: "Trust Target User", city: "Delhi", skills: ["AI"], interests: ["Cricket"], status: "active" });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4009, resolve));
  console.log("[test-server] Running on port 4009\n");

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
    const authTarget = await login(PHONE_TARGET);

    // --- 1. Attempt self-report → 400 Bad Request ---
    console.log("--- 1. POST /api/reports: Attempt Self-Report (Expect 400) ---");
    const selfReportRes = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authTarget.token}`,
      },
      body: JSON.stringify({
        reportedUserId: targetUser._id.toString(),
        reason: "spam",
        details: "Reporting myself should fail.",
      }),
    });
    const selfReportData = await selfReportRes.json();
    console.log(`Status: ${selfReportRes.status}`);
    console.log("Response:", JSON.stringify(selfReportData, null, 2));
    if (selfReportRes.status !== 400) {
      throw new Error(`Expected 400 for self-report, got ${selfReportRes.status}`);
    }
    console.log("- Self-report rejected: PASS");

    // --- 2. Initial Discover Check (Target appears in Tier 2 for User A) ---
    console.log("\n--- 2. GET /api/discover: Confirm Target initially appears in Tier 2 ---");
    const initDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const initDiscoverData = await initDiscoverRes.json();
    const initTier2Names = (initDiscoverData.tier2 || []).map((u) => u.name);
    console.log(`Initial Tier 2 names: [${initTier2Names.join(", ")}]`);
    const targetInitiallyInTier2 = initTier2Names.includes("Trust Target User");
    if (!targetInitiallyInTier2) {
      throw new Error("Target user not found in initial Tier 2 discover results for User A");
    }
    console.log("- Target initially in Tier 2: PASS");

    // --- 3. 3 different users each report Target for 'harassment' ---
    console.log("\n--- 3. 3 Different Users Report Target for 'harassment' ---");

    // Report 1: User A reports Target
    console.log("-> Report 1 by User A...");
    const rep1Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({
        reportedUserId: targetUser._id.toString(),
        reason: "harassment",
        details: "Harassing in messages.",
      }),
    });
    console.log(`Report 1 Status: ${rep1Res.status}`);
    if (rep1Res.status !== 201) throw new Error(`Report 1 failed with ${rep1Res.status}`);

    let targetDb = await User.findById(targetUser._id);
    console.log(`Target status after 1st report: '${targetDb.status}'`);

    // Report 2: User B reports Target
    console.log("-> Report 2 by User B...");
    const rep2Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authB.token}`,
      },
      body: JSON.stringify({
        reportedUserId: targetUser._id.toString(),
        reason: "harassment",
        details: "Repeated spammy messages.",
      }),
    });
    console.log(`Report 2 Status: ${rep2Res.status}`);
    if (rep2Res.status !== 201) throw new Error(`Report 2 failed with ${rep2Res.status}`);

    targetDb = await User.findById(targetUser._id);
    console.log(`Target status after 2nd report: '${targetDb.status}'`);

    // Report 3: User C reports Target (Auto-hide threshold reached: 3 distinct reporters)
    console.log("-> Report 3 by User C (Auto-hide threshold)...");
    const rep3Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authC.token}`,
      },
      body: JSON.stringify({
        reportedUserId: targetUser._id.toString(),
        reason: "harassment",
        details: "Inappropriate contact.",
      }),
    });
    const rep3Data = await rep3Res.json();
    console.log(`Report 3 Status: ${rep3Res.status}`);
    console.log("Report 3 response:", JSON.stringify(rep3Data, null, 2));
    if (rep3Res.status !== 201) throw new Error(`Report 3 failed with ${rep3Res.status}`);

    targetDb = await User.findById(targetUser._id);
    console.log(`Target status after 3rd report in DB: '${targetDb.status}'`);
    if (targetDb.status !== "hidden_pending_review") {
      throw new Error(`Expected Target status 'hidden_pending_review', got '${targetDb.status}'`);
    }
    console.log("- Target auto-hidden ('hidden_pending_review'): PASS");

    // --- 4. Confirm Target no longer appears in anyone's Discover results ---
    console.log("\n--- 4. GET /api/discover: Confirm Target is excluded while hidden ---");
    const postHideDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const postHideDiscoverData = await postHideDiscoverRes.json();
    const postHideTier2Names = (postHideDiscoverData.tier2 || []).map((u) => u.name);
    console.log(`Tier 2 names after auto-hide: [${postHideTier2Names.join(", ")}]`);
    if (postHideTier2Names.includes("Trust Target User")) {
      throw new Error("Target user STILL appearing in Discover while hidden!");
    }
    console.log("- Target excluded from Discover while hidden: PASS");

    // --- 5. Confirm a 4th report on Target still succeeds ---
    console.log("\n--- 5. POST /api/reports: 4th report on Target still succeeds ---");
    const rep4Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authD.token}`,
      },
      body: JSON.stringify({
        reportedUserId: targetUser._id.toString(),
        reason: "harassment",
        details: "Another user reporting Target.",
      }),
    });
    const rep4Data = await rep4Res.json();
    console.log(`Report 4 Status: ${rep4Res.status}`);
    console.log("Report 4 Response:", JSON.stringify(rep4Data, null, 2));
    if (rep4Res.status !== 201) {
      throw new Error(`Expected 201 for 4th report, got ${rep4Res.status}`);
    }
    console.log("- 4th report succeeds: PASS");

    // --- 6. Admin Endpoints Authentication Check ---
    console.log("\n--- 6. Admin API: Authorization check on GET /api/admin/reports?status=open ---");
    const noKeyAdminRes = await fetch(`${BASE_URL}/api/admin/reports?status=open`);
    console.log(`Without x-admin-key Status: ${noKeyAdminRes.status}`);
    if (noKeyAdminRes.status !== 401) {
      throw new Error(`Expected 401 without admin key, got ${noKeyAdminRes.status}`);
    }
    console.log("- Blocked without admin key (401): PASS");

    // With correct key
    const withKeyAdminRes = await fetch(`${BASE_URL}/api/admin/reports?status=open`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    const withKeyAdminData = await withKeyAdminRes.json();
    console.log(`With x-admin-key Status: ${withKeyAdminRes.status}`);
    console.log(`Open reports count: ${withKeyAdminData.count}`);
    if (withKeyAdminRes.status !== 200) {
      throw new Error(`Expected 200 with admin key, got ${withKeyAdminRes.status}`);
    }
    console.log("- Listed reports with admin key: PASS");

    const targetReport = withKeyAdminData.reports.find(
      (r) => (r.reportedUser?._id || r.reportedUser?.id) === targetUser._id.toString() || r.reportedUser?.name === "Trust Target User"
    );
    if (!targetReport) {
      throw new Error("Could not find open report for Target user in admin list");
    }

    // --- 7. Admin Action: Restore user (PATCH action=restore_user) ---
    console.log("\n--- 7. PATCH /api/admin/reports/:id with action=restore_user ---");
    const restoreRes = await fetch(`${BASE_URL}/api/admin/reports/${targetReport.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify({
        status: "reviewed_no_action",
        action: "restore_user",
      }),
    });
    const restoreData = await restoreRes.json();
    console.log(`Restore Status: ${restoreRes.status}`);
    console.log("Restore Response:", JSON.stringify(restoreData, null, 2));
    if (restoreRes.status !== 200) {
      throw new Error(`Expected 200 for restore_user, got ${restoreRes.status}`);
    }

    targetDb = await User.findById(targetUser._id);
    console.log(`Target status in DB after restore: '${targetDb.status}'`);
    if (targetDb.status !== "active") {
      throw new Error(`Expected Target status 'active' after restore, got '${targetDb.status}'`);
    }
    console.log("- Target status flipped back to 'active': PASS");

    // Verify Target reappears in Discover
    const postRestoreDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const postRestoreDiscoverData = await postRestoreDiscoverRes.json();
    const postRestoreTier2Names = (postRestoreDiscoverData.tier2 || []).map((u) => u.name);
    console.log(`Tier 2 names after restore: [${postRestoreTier2Names.join(", ")}]`);
    if (!postRestoreTier2Names.includes("Trust Target User")) {
      throw new Error("Target did not reappear in Discover after restore!");
    }
    console.log("- Target reappeared in Discover: PASS");

    console.log("\n=== ALL TRUST & SAFETY TESTS PASSED ===");
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

runTrustSafetyTests();
