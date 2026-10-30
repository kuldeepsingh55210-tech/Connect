/**
 * apps/api/scripts/test-notifications-e2e.js
 *
 * In-app Notifications E2E Verification Script
 *
 * Uses ONLY throwaway test users (+919876543441 to +919876543449).
 * Seed users (Priya, Aarav, Neha, Rohan, Kabir, Ananya, divya) are NOT touched.
 * All throwaways and associated connections, messages, and notifications are deleted at start and end.
 */

process.env.NODE_ENV = "test";
process.env.PORT = "4020";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const assert = require("assert");
const mongoose = require("mongoose");
const { io: ClientIO } = require("socket.io-client");
const { app, httpServer } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User, Connection, Message, Notification } = require("../src/models");

const PORT = 4020;
const BASE_URL = `http://localhost:${PORT}`;

const THROWAWAY_PHONES = [
  "+919876543441", // User A (Alpha)
  "+919876543442", // User B (Beta)
  "+919876543443", // User C (Charlie)
  "+919876543444", // User D (Delta)
  "+919876543445", // User E (Echo)
  "+919876543446", // User F (Foxtrot)
];

const FORBIDDEN_PRIVACY_FIELDS = ["dob", "gender", "authId", "phone", "age", "area", "status"];

function assertNoPrivacyLeaks(obj, label = "payload") {
  if (!obj || typeof obj !== "object") return;
  for (const forbidden of FORBIDDEN_PRIVACY_FIELDS) {
    assert.strictEqual(
      obj[forbidden],
      undefined,
      `Privacy violation: ${label} must NOT contain field '${forbidden}'`
    );
  }
  if (obj.actor && typeof obj.actor === "object") {
    for (const forbidden of FORBIDDEN_PRIVACY_FIELDS) {
      assert.strictEqual(
        obj.actor[forbidden],
        undefined,
        `Privacy violation: ${label}.actor must NOT contain field '${forbidden}'`
      );
    }
  }
}

async function cleanupThrowawayData() {
  console.log("[cleanup] Removing throwaway users (+91987654344x) and associated data...");
  const users = await User.find({ authId: { $in: THROWAWAY_PHONES } });
  const userIds = users.map((u) => u._id);

  if (userIds.length > 0) {
    const connections = await Connection.find({
      $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
    });
    const connectionIds = connections.map((c) => c._id);

    await Notification.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        { actorId: { $in: userIds } },
        { connectionId: { $in: connectionIds } },
      ],
    });

    await Message.deleteMany({
      $or: [
        { connectionId: { $in: connectionIds } },
        { senderId: { $in: userIds } },
      ],
    });

    await Connection.deleteMany({ _id: { $in: connectionIds } });
    await User.deleteMany({ _id: { $in: userIds } });
  }

  await User.deleteMany({ authId: { $in: THROWAWAY_PHONES } });
  console.log("[cleanup] Completed.\n");
}

async function createThrowawayUser(phone, name, city = "Bangalore", skills = ["AI", "Backend Dev"], interests = ["Reading", "Travel"]) {
  // 1. dev-login
  const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // 2. Complete profile via POST /api/users
  const profileRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      dob: "1996-04-12",
      gender: "male",
      city,
      skills,
      interests,
      intent: ["networking", "friendship"],
      about: `Throwaway user ${name}`,
    }),
  });
  const profileData = await profileRes.json();
  const userDoc = await User.findOne({ authId: phone });

  return {
    phone,
    token,
    id: userDoc._id.toString(),
    user: profileData.profile || profileData.user || userDoc,
  };
}

async function runTests() {
  console.log("=== STARTING IN-APP NOTIFICATIONS E2E VERIFICATION ===\n");
  console.log(`Using throwaway phones: ${THROWAWAY_PHONES.join(", ")}`);

  let socketB = null;

  await connectDB();
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Test server listening on port ${PORT}\n`);

  try {
    // 0. Initial cleanup
    await cleanupThrowawayData();

    // Setup Test Users
    console.log("Setting up throwaway users...");
    const userA = await createThrowawayUser("+919876543441", "Alpha User", "Bangalore");
    const userB = await createThrowawayUser("+919876543442", "Beta User", "Mumbai");
    const userC = await createThrowawayUser("+919876543443", "Charlie User", "Delhi");
    const userD = await createThrowawayUser("+919876543444", "Delta User", "Pune");
    console.log("  ✓ Created test users A, B, C, D\n");

    // -------------------------------------------------------------
    // Test Scenario H: Realtime socket receiving notification:new
    // (Set up socket connection for B before A connects to B)
    // -------------------------------------------------------------
    console.log("--- TEST H: Realtime socket 'notification:new' ---");
    socketB = ClientIO(`http://localhost:${PORT}`, {
      auth: { token: userB.token },
      transports: ["websocket"],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Socket connection timeout for B")), 5000);
      socketB.on("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    console.log("  ✓ User B connected to Socket.io and joined per-user room");

    const realtimePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for notification:new on socket B")), 5000);
      socketB.on("notification:new", (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    // -------------------------------------------------------------
    // Test Scenario A: A connects to B
    // -------------------------------------------------------------
    console.log("\n--- TEST A: A connects to B (connect_request) ---");
    const connectRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ toUserId: userB.id }),
    });
    const connectData = await connectRes.json();
    console.log("POST /api/connections response status:", connectRes.status);
    console.log("POST /api/connections response body:", JSON.stringify(connectData));
    assert.strictEqual(connectRes.status, 201);
    const connIdAB = (connectData.connection?._id || connectData.connection?.id || connectData.id).toString();

    // Verify Realtime event received on B's socket
    const realtimePayload = await realtimePromise;
    console.log("Realtime notification:new payload received on B:", JSON.stringify(realtimePayload));
    assert.strictEqual(realtimePayload.type, "connect_request");
    assert.strictEqual(realtimePayload.connectionId.toString(), connIdAB);
    assert.strictEqual(realtimePayload.actor.id.toString(), userA.id);
    assert.strictEqual(realtimePayload.actor.name, "Alpha User");
    assertNoPrivacyLeaks(realtimePayload, "realtime notification:new");
    console.log("  ✓ Realtime notification:new verified on B's socket");

    // Verify B's unread count = 1
    const unreadCountBRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const unreadCountB = await unreadCountBRes.json();
    console.log("GET /api/notifications/unread-count (B):", JSON.stringify(unreadCountB));
    assert.strictEqual(unreadCountB.total, 1);

    // Verify B's notification list
    const notifsBRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const notifsB = await notifsBRes.json();
    console.log("GET /api/notifications (B):", JSON.stringify(notifsB));
    assert.strictEqual(notifsB.status, "ok");
    assert.strictEqual(notifsB.count, 1);
    const notifB1 = notifsB.notifications[0];
    assert.strictEqual(notifB1.type, "connect_request");
    assert.strictEqual(notifB1.readAt, null);
    assert.strictEqual(notifB1.actor.id.toString(), userA.id);
    assert.strictEqual(notifB1.actor.name, "Alpha User");
    assert.strictEqual(notifB1.actor.city, "Bangalore");
    assertNoPrivacyLeaks(notifB1, "B connect_request notification");

    // Verify A has 0 notifications
    const unreadCountARes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const unreadCountA = await unreadCountARes.json();
    console.log("GET /api/notifications/unread-count (A):", JSON.stringify(unreadCountA));
    assert.strictEqual(unreadCountA.total, 0);
    console.log("  ✓ Scenario A passed: B has 1 unread connect_request; A has 0");

    // -------------------------------------------------------------
    // Test Scenario B: B accepts -> A gets connection_accepted; B connect_request marked read
    // -------------------------------------------------------------
    console.log("\n--- TEST B: B accepts (connection_accepted) ---");
    const acceptRes = await fetch(`${BASE_URL}/api/connections/${connIdAB}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    const acceptData = await acceptRes.json();
    console.log("PATCH /api/connections/:id accept status:", acceptRes.status);
    assert.strictEqual(acceptRes.status, 200);

    // B unread-count should now be 0 (its connect_request was marked read)
    const unreadBAfterAccept = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications/unread-count (B after accept):", JSON.stringify(unreadBAfterAccept));
    assert.strictEqual(unreadBAfterAccept.total, 0);

    // Check that B's connect_request in DB has readAt set
    const dbNotifB = await Notification.findOne({
      userId: userB.id,
      type: "connect_request",
    });
    assert.ok(dbNotifB, "B's connect_request must exist in DB");
    assert.ok(dbNotifB.readAt !== null, "B's connect_request in DB must have readAt set");
    console.log("  ✓ B's connect_request in DB is marked read with readAt:", dbNotifB.readAt);

    // A unread-count should now be 1 (received connection_accepted)
    const unreadAAfterAccept = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications/unread-count (A after accept):", JSON.stringify(unreadAAfterAccept));
    assert.strictEqual(unreadAAfterAccept.total, 1);

    const notifsA = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications (A after accept):", JSON.stringify(notifsA));
    assert.strictEqual(notifsA.count, 1);
    assert.strictEqual(notifsA.notifications[0].type, "connection_accepted");
    assert.strictEqual(notifsA.notifications[0].actor.id.toString(), userB.id);
    assert.strictEqual(notifsA.notifications[0].actor.name, "Beta User");
    assertNoPrivacyLeaks(notifsA.notifications[0], "A connection_accepted notification");
    console.log("  ✓ Scenario B passed: B connect_request marked read (total=0); A received connection_accepted (total=1)");

    // -------------------------------------------------------------
    // Test Scenario C: A sends 5 messages to B -> B has ONE new_message notification; POST /read marks it read
    // -------------------------------------------------------------
    console.log("\n--- TEST C: Messages & upserted new_message notification ---");
    for (let i = 1; i <= 5; i++) {
      const sendRes = await fetch(`${BASE_URL}/api/connections/${connIdAB}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({ text: `Message number ${i}` }),
      });
      assert.strictEqual(sendRes.status, 201);
    }
    console.log("  Sent 5 messages from A to B");

    // Check B's notification list: should have exactly 1 new_message notification (and 1 read connect_request = total 2 items, 1 unread)
    const notifsBAfterMsgs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications (B after 5 messages):", JSON.stringify(notifsBAfterMsgs));
    const newMessageNotifs = notifsBAfterMsgs.notifications.filter((n) => n.type === "new_message");
    assert.strictEqual(newMessageNotifs.length, 1, "Must have exactly ONE new_message notification, not 5");
    assert.strictEqual(newMessageNotifs[0].readAt, null);
    assert.strictEqual(newMessageNotifs[0].actor.name, "Alpha User");
    assertNoPrivacyLeaks(newMessageNotifs[0], "B new_message notification");

    const unreadCountBAfterMsgs = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    assert.strictEqual(unreadCountBAfterMsgs.total, 1);

    // B calls POST /api/connections/:id/read on the thread
    console.log("B calls POST /api/connections/:id/read...");
    const readThreadRes = await fetch(`${BASE_URL}/api/connections/${connIdAB}/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
    });
    assert.strictEqual(readThreadRes.status, 200);

    // Check B's notifications: new_message should now have readAt set and unread-count is 0
    const unreadCountBAfterRead = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications/unread-count (B after thread read):", JSON.stringify(unreadCountBAfterRead));
    assert.strictEqual(unreadCountBAfterRead.total, 0);

    const notifsBAfterRead = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    const msgNotifAfterRead = notifsBAfterRead.notifications.find((n) => n.type === "new_message");
    assert.ok(msgNotifAfterRead.readAt !== null, "new_message notification must have readAt set");
    console.log("  ✓ Scenario C passed: Exactly 1 new_message notification created and marked read via thread /read");

    // -------------------------------------------------------------
    // Test Scenario D: Ignore path: C connects to D, D ignores -> C gets NOTHING; D's connect_request is gone
    // -------------------------------------------------------------
    console.log("\n--- TEST D: Ignore path ---");
    const connectCDRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ toUserId: userD.id }),
    });
    const connectCDData = await connectCDRes.json();
    const connIdCD = (connectCDData.connection?._id || connectCDData.connection?.id || connectCDData.id).toString();

    // Verify D has 1 unread connect_request
    const unreadDInit = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    }).then((r) => r.json());
    assert.strictEqual(unreadDInit.total, 1);

    // D ignores the request
    const ignoreRes = await fetch(`${BASE_URL}/api/connections/${connIdCD}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({ action: "ignore" }),
    });
    assert.strictEqual(ignoreRes.status, 200);

    // Verify C has 0 notifications (sender gets NOTHING)
    const notifsC = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userC.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications (C after ignore):", JSON.stringify(notifsC));
    assert.strictEqual(notifsC.count, 0, "C must receive no notification on ignore");

    // Verify D's connect_request is DELETED (not just read)
    const notifsD = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    }).then((r) => r.json());
    console.log("GET /api/notifications (D after ignore):", JSON.stringify(notifsD));
    assert.strictEqual(notifsD.count, 0, "D's connect_request must be deleted on ignore");
    console.log("  ✓ Scenario D passed: Ignore deletes connect_request for D and sends nothing to C");

    // -------------------------------------------------------------
    // Test Scenario E: Block path: B blocks A -> notifications between A and B are deleted; new message attempt creates none
    // -------------------------------------------------------------
    console.log("\n--- TEST E: Block path ---");
    // Verify notifications exist before block
    const notifsBeforeBlock = await Notification.find({ connectionId: connIdAB });
    assert.ok(notifsBeforeBlock.length > 0, "Notifications must exist before block");

    // B blocks A
    const blockRes = await fetch(`${BASE_URL}/api/connections/${connIdAB}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ action: "block" }),
    });
    assert.strictEqual(blockRes.status, 200);

    // Verify all notifications for connIdAB are deleted
    const notifsAfterBlock = await Notification.find({ connectionId: connIdAB });
    console.log("Notifications remaining for blocked connection:", notifsAfterBlock.length);
    assert.strictEqual(notifsAfterBlock.length, 0, "All notifications between pair must be deleted upon block");

    // Attempting to send message on blocked connection must fail and create 0 notifications
    const blockedMsgRes = await fetch(`${BASE_URL}/api/connections/${connIdAB}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: "Are you still there?" }),
    });
    console.log("POST /messages on blocked connection status:", blockedMsgRes.status);
    assert.strictEqual(blockedMsgRes.status, 403);
    const notifsAfterBlockedMsg = await Notification.find({ connectionId: connIdAB });
    assert.strictEqual(notifsAfterBlockedMsg.length, 0);
    console.log("  ✓ Scenario E passed: Block deletes all notifications between pair and prevents new ones");

    // -------------------------------------------------------------
    // Test Scenario F: Ownership & read-all
    // -------------------------------------------------------------
    console.log("\n--- TEST F: Ownership & read-all ---");
    // Create a new notification for User B (e.g., from C connecting to B)
    const connectCBRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ toUserId: userB.id }),
    });
    assert.strictEqual(connectCBRes.status, 201);
    const notifsBNew = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    assert.strictEqual(notifsBNew.count, 1);
    const notifForB = notifsBNew.notifications[0];

    // User C attempts to mark B's notification as read
    const hackReadRes = await fetch(`${BASE_URL}/api/notifications/${notifForB.id}/read`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
    });
    console.log("PATCH /api/notifications/:id/read by non-owner status:", hackReadRes.status);
    assert.strictEqual(hackReadRes.status, 404, "Must return 404 to avoid revealing existence");

    // Owner B marks it read via PATCH /:id/read
    const ownerReadRes = await fetch(`${BASE_URL}/api/notifications/${notifForB.id}/read`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
    });
    console.log("PATCH /api/notifications/:id/read by owner status:", ownerReadRes.status);
    assert.strictEqual(ownerReadRes.status, 200);
    const ownerReadData = await ownerReadRes.json();
    assert.strictEqual(ownerReadData.status, "ok");
    assert.ok(ownerReadData.notification.readAt !== null);

    // Test POST /api/notifications/read-all
    // Create an accepted connection for user D so notifications are valid
    const connAD = await Connection.create({
      userA: userA.id,
      userB: userD.id,
      initiatedBy: userA.id,
      status: "accepted",
      respondedAt: new Date(),
    });
    await Notification.create([
      { userId: userD.id, actorId: userA.id, connectionId: connAD._id, type: "connection_accepted", readAt: null },
      { userId: userD.id, actorId: userB.id, connectionId: connAD._id, type: "connection_accepted", readAt: null },
    ]);
    const unreadDBeforeReadAll = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    }).then((r) => r.json());

    const readAllRes = await fetch(`${BASE_URL}/api/notifications/read-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
    });
    console.log("POST /api/notifications/read-all status:", readAllRes.status);
    const readAllData = await readAllRes.json();
    console.log("POST /api/notifications/read-all body:", JSON.stringify(readAllData));
    assert.strictEqual(readAllRes.status, 200);
    assert.strictEqual(readAllData.status, "ok");
    assert.ok(readAllData.count >= 2);

    const unreadDAfterReadAll = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    }).then((r) => r.json());
    assert.strictEqual(unreadDAfterReadAll.total, 0);
    console.log("  ✓ Scenario F passed: Non-owner gets 404; read-all marks all unread for caller");

    // -------------------------------------------------------------
    // Test Scenario G: Pagination (35 notifications, limit=30 and before cursor)
    // -------------------------------------------------------------
    console.log("\n--- TEST G: Pagination (35 items) ---");
    const userE = await createThrowawayUser("+919876543445", "Echo User", "Bangalore");
    const userF = await createThrowawayUser("+919876543446", "Foxtrot User", "Bangalore");

    // Create an accepted connection between E and F so notifications are valid
    const connEF = await Connection.create({
      userA: userE.id,
      userB: userF.id,
      initiatedBy: userE.id,
      status: "accepted",
      respondedAt: new Date(),
    });

    // Bulk insert 35 notifications for user E with distinct timestamps
    const nowMs = Date.now();
    const bulkNotifs = [];
    for (let i = 0; i < 35; i++) {
      bulkNotifs.push({
        userId: userE.id,
        actorId: userF.id,
        connectionId: connEF._id,
        type: "connection_accepted",
        readAt: i % 2 === 0 ? null : new Date(),
        createdAt: new Date(nowMs - (35 - i) * 1000), // oldest to newest
      });
    }
    await Notification.insertMany(bulkNotifs);

    // Page 1: limit = 30
    const page1Res = await fetch(`${BASE_URL}/api/notifications?limit=30`, {
      headers: { Authorization: `Bearer ${userE.token}` },
    });
    const page1Data = await page1Res.json();
    console.log(`Page 1 count: ${page1Data.count} (expected 30)`);
    assert.strictEqual(page1Data.count, 30);
    assert.strictEqual(page1Data.notifications.length, 30);

    // Verify ordering: newest first
    for (let i = 0; i < page1Data.notifications.length - 1; i++) {
      const current = new Date(page1Data.notifications[i].createdAt).getTime();
      const next = new Date(page1Data.notifications[i + 1].createdAt).getTime();
      assert.ok(current >= next, "Notifications must be sorted descending by createdAt");
    }

    // Page 2: use before = createdAt of last item in page 1
    const lastItemPage1 = page1Data.notifications[29];
    const page2Res = await fetch(`${BASE_URL}/api/notifications?limit=30&before=${lastItemPage1.createdAt}`, {
      headers: { Authorization: `Bearer ${userE.token}` },
    });
    const page2Data = await page2Res.json();
    console.log(`Page 2 count: ${page2Data.count} (expected 5)`);
    assert.strictEqual(page2Data.count, 5);
    assert.strictEqual(page2Data.notifications.length, 5);

    // Verify privacy on paginated items
    for (const item of page1Data.notifications.concat(page2Data.notifications)) {
      assertNoPrivacyLeaks(item, "paginated notification");
    }
    console.log("  ✓ Scenario G passed: Pagination (limit=30 + cursor before) correctly handles 35 items");

    // Close socket cleanly
    socketB.disconnect();

    console.log("\n=== ALL NOTIFICATION TEST SCENARIOS PASSED SUCCESSFULLY! ===");
  } finally {
    console.log("--- Running teardown in finally block ---");
    if (socketB) {
      socketB.disconnect();
    }
    await cleanupThrowawayData();
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
    console.log("--- Teardown complete ---");
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
