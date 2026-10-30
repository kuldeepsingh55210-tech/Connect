/**
 * apps/api/scripts/test-read-receipts-e2e.js
 *
 * Read receipts + unread counts E2E Verification Script
 *
 * Uses ONLY throwaway test users (+919876543421 to +919876543429).
 * Seed users (Priya, Aarav, Neha, Rohan, Kabir, Ananya, divya) are NOT touched.
 * All throwaway users, connections, and messages are deleted at start and end.
 */

process.env.NODE_ENV = "test";
process.env.PORT = "4018";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { io: ClientIO } = require("socket.io-client");
const { app, httpServer, io } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User, Connection, Message, Report } = require("../src/models");

const PORT = 4018;
const BASE_URL = `http://localhost:${PORT}`;

const THROWAWAY_PHONES = [
  "+919876543421", // User A
  "+919876543422", // User B
  "+919876543423", // User C (third party)
  "+919876543424", // User D (second thread for ordering)
  "+919876543425", // User E
];

// Clean up throwaway data completely
async function cleanupThrowawayData() {
  console.log("[cleanup] Removing any existing throwaway users (+91987654342x) and associated data...");
  const users = await User.find({ authId: { $in: THROWAWAY_PHONES } });
  const userIds = users.map((u) => u._id);

  if (userIds.length > 0) {
    const connections = await Connection.find({
      $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
    });
    const connectionIds = connections.map((c) => c._id);

    const msgRes = await Message.deleteMany({
      $or: [
        { connectionId: { $in: connectionIds } },
        { senderId: { $in: userIds } },
      ],
    });

    const connRes = await Connection.deleteMany({ _id: { $in: connectionIds } });

    const usrRes = await User.deleteMany({ _id: { $in: userIds } });
    console.log(`[cleanup] Deleted ${usrRes.deletedCount} users, ${connRes.deletedCount} connections, ${msgRes.deletedCount} messages.`);
  }

  await User.deleteMany({ authId: { $in: THROWAWAY_PHONES } });
  console.log("[cleanup] Completed.\n");
}

// Helper to create and activate a throwaway user with valid controlled vocabulary
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
      dob: "1998-05-15",
      gender: "non_binary",
      city,
      skills,
      interests,
      intent: ["networking", "friendship"],
      about: `Throwaway user ${name}`,
    }),
  });
  const profileData = await profileRes.json();

  if (profileRes.status !== 200 && profileRes.status !== 201) {
    throw new Error(`Failed to complete profile for ${name} (${phone}): status ${profileRes.status} body: ${JSON.stringify(profileData)}`);
  }

  const userDoc = await User.findOne({ authId: phone });

  return {
    phone,
    token,
    id: userDoc._id.toString(),
    user: profileData.user || loginData.user,
    doc: userDoc,
  };
}

// Privacy Assertion
const FORBIDDEN_FIELDS = ["dob", "gender", "authId", "phone", "age"];
const privacyViolations = [];

function checkPrivacy(obj, label = "response") {
  function recurse(current, path) {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach((item, idx) => recurse(item, `${path}[${idx}]`));
      return;
    }
    for (const key of Object.keys(current)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_FIELDS.includes(lower)) {
        privacyViolations.push({
          label,
          path: `${path}.${key}`,
          key,
          value: current[key],
        });
      }
      if (typeof current[key] === "object" && current[key] !== null) {
        recurse(current[key], `${path}.${key}`);
      }
    }
  }
  recurse(obj, label);
}

const results = {};

async function runReadReceiptsSuite() {
  console.log("====================================================================================================");
  console.log("STARTING READ RECEIPTS & UNREAD COUNTS E2E TEST SUITE");
  console.log("====================================================================================================\n");

  let serverStarted = false;

  try {
    await connectDB();
    await cleanupThrowawayData();

    await new Promise((resolve) => httpServer.listen(PORT, resolve));
    serverStarted = true;
    console.log(`[test-server] Running on port ${PORT}\n`);

    // ------------------------------------------------------------------------------------------------
    // Setup users A, B, C, D
    // ------------------------------------------------------------------------------------------------
    console.log("-> Creating throwaway users A, B, C, D...");
    const userA = await createThrowawayUser("+919876543421", "User A", "Bangalore");
    const userB = await createThrowawayUser("+919876543422", "User B", "Bangalore");
    const userC = await createThrowawayUser("+919876543423", "User C", "Bangalore");
    const userD = await createThrowawayUser("+919876543424", "User D", "Bangalore");
    console.log(`✓ Users created: A(${userA.id}), B(${userB.id}), C(${userC.id}), D(${userD.id})\n`);

    // Establish accepted connection between A and B
    console.log("-> Connecting A and B (request & accept)...");
    const connectRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ toUserId: userB.id }),
    });
    const connectData = await connectRes.json();
    const connABId = connectData.connection._id;

    const acceptRes = await fetch(`${BASE_URL}/api/connections/${connABId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    const acceptData = await acceptRes.json();
    console.log(`✓ Connection AB accepted (ID: ${connABId})\n`);

    // ------------------------------------------------------------------------------------------------
    // Scenario a: A sends 3 messages to B
    // ------------------------------------------------------------------------------------------------
    console.log("====================================================================================================");
    console.log("SCENARIO A: A sends 3 messages to B. Check unreadCount, lastMessagePreview, lastMessageIsMine");
    console.log("====================================================================================================");

    const msgTexts = [
      "Hello B, this is message 1 from A",
      "Hey B, here is message 2 with some more details",
      "Message 3: The latest message from A to B!",
    ];

    for (let i = 0; i < msgTexts.length; i++) {
      console.log(`-> A sending message ${i + 1}: "${msgTexts[i]}"`);
      const sendRes = await fetch(`${BASE_URL}/api/connections/${connABId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({ text: msgTexts[i] }),
      });
      const sendData = await sendRes.json();
      console.log(`   Response Status: ${sendRes.status}`);
      console.log(`   Response Body: ${JSON.stringify(sendData)}`);
      checkPrivacy(sendData, `Scenario a: send message ${i + 1}`);
      // Small sleep so createdAt timestamps are distinct
      await new Promise((r) => setTimeout(r, 50));
    }

    // B fetches accepted connections
    console.log("\n-> B calls GET /api/connections?status=accepted...");
    const bAcceptedRes = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bAcceptedData = await bAcceptedRes.json();
    console.log(`   Response Status: ${bAcceptedRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(bAcceptedData, null, 2)}`);
    checkPrivacy(bAcceptedData, "Scenario a: B accepted connections");

    const bConnRow = bAcceptedData.connections?.find(
      (c) => c.connectionId.toString() === connABId.toString()
    );

    // A fetches accepted connections
    console.log("\n-> A calls GET /api/connections?status=accepted...");
    const aAcceptedRes = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const aAcceptedData = await aAcceptedRes.json();
    console.log(`   Response Status: ${aAcceptedRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(aAcceptedData, null, 2)}`);
    checkPrivacy(aAcceptedData, "Scenario a: A accepted connections");

    const aConnRow = aAcceptedData.connections?.find(
      (c) => c.connectionId.toString() === connABId.toString()
    );

    const bCheckPassed =
      bConnRow &&
      bConnRow.unreadCount === 3 &&
      bConnRow.lastMessagePreview === msgTexts[2] &&
      bConnRow.lastMessageIsMine === false &&
      bConnRow.lastMessageAt !== null;

    const aCheckPassed =
      aConnRow &&
      aConnRow.unreadCount === 0 &&
      aConnRow.lastMessagePreview === msgTexts[2] &&
      aConnRow.lastMessageIsMine === true &&
      aConnRow.lastMessageAt !== null;

    const passA = bCheckPassed && aCheckPassed;
    results["a"] = {
      name: "A sends 3 msgs; B sees unreadCount 3, lastMessagePreview, lastMessageIsMine=false; A sees unreadCount 0, lastMessageIsMine=true",
      pass: passA,
    };
    console.log(`\n[SCENARIO A RESULT]: ${passA ? "PASS" : "FAIL"}`);
    if (!passA) {
      console.log("   B row stats:", {
        unreadCount: bConnRow?.unreadCount,
        lastMessagePreview: bConnRow?.lastMessagePreview,
        lastMessageIsMine: bConnRow?.lastMessageIsMine,
      });
      console.log("   A row stats:", {
        unreadCount: aConnRow?.unreadCount,
        lastMessagePreview: aConnRow?.lastMessagePreview,
        lastMessageIsMine: aConnRow?.lastMessageIsMine,
      });
    }

    // ------------------------------------------------------------------------------------------------
    // Scenario b: GET /api/connections/unread-count for B = 3, for A = 0
    // ------------------------------------------------------------------------------------------------
    console.log("\n====================================================================================================");
    console.log("SCENARIO B: GET /api/connections/unread-count for B = 3, for A = 0");
    console.log("====================================================================================================");

    console.log("-> B calls GET /api/connections/unread-count...");
    const bUnreadRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bUnreadData = await bUnreadRes.json();
    console.log(`   Response Status: ${bUnreadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(bUnreadData)}`);
    checkPrivacy(bUnreadData, "Scenario b: B unread-count");

    console.log("-> A calls GET /api/connections/unread-count...");
    const aUnreadRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const aUnreadData = await aUnreadRes.json();
    console.log(`   Response Status: ${aUnreadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(aUnreadData)}`);
    checkPrivacy(aUnreadData, "Scenario b: A unread-count");

    const passB =
      bUnreadRes.status === 200 &&
      bUnreadData.total === 3 &&
      aUnreadRes.status === 200 &&
      aUnreadData.total === 0;

    results["b"] = {
      name: "GET /unread-count for B = 3, for A = 0",
      pass: passB,
    };
    console.log(`\n[SCENARIO B RESULT]: ${passB ? "PASS" : "FAIL"}`);

    // ------------------------------------------------------------------------------------------------
    // Scenario c: B calls POST /api/connections/:id/read -> count 3; B's unreadCount -> 0;
    //             A's socket receives "message:read" with readerId=B, readAt.
    //             A calling /read marks count 0.
    // ------------------------------------------------------------------------------------------------
    console.log("\n====================================================================================================");
    console.log("SCENARIO C: B calls POST /read, A socket receives message:read, A calling /read marks 0");
    console.log("====================================================================================================");

    console.log("-> Connecting Socket.io client for User A...");
    const socketA = ClientIO(BASE_URL, {
      auth: { token: userA.token },
      transports: ["websocket", "polling"],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout connecting socket A")), 5000);
      socketA.on("connect", () => {
        socketA.emit("thread:join", { connectionId: connABId.toString() }, (res) => {
          console.log("   User A joined thread room ack:", res);
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    console.log("-> Setting up listener on Socket A for 'message:read' event...");
    let socketReadEventPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for message:read on socket A")), 6000);
      socketA.on("message:read", (payload) => {
        console.log("   [Socket A Event Received] message:read:", JSON.stringify(payload));
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    console.log(`-> User B calls POST /api/connections/${connABId}/read...`);
    const bReadRes = await fetch(`${BASE_URL}/api/connections/${connABId}/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
    });
    const bReadData = await bReadRes.json();
    console.log(`   Response Status: ${bReadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(bReadData)}`);
    checkPrivacy(bReadData, "Scenario c: B marks read");

    const socketReadPayload = await socketReadEventPromise;

    // Check B's unreadCount now
    console.log("-> B calls GET /api/connections/unread-count after marking read...");
    const bUnreadAfterRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bUnreadAfterData = await bUnreadAfterRes.json();
    console.log(`   Response Status: ${bUnreadAfterRes.status}, Body: ${JSON.stringify(bUnreadAfterData)}`);

    console.log("-> B calls GET /api/connections?status=accepted after marking read...");
    const bAcceptedAfterRes = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bAcceptedAfterData = await bAcceptedAfterRes.json();
    const bRowAfter = bAcceptedAfterData.connections?.find(
      (c) => c.connectionId.toString() === connABId.toString()
    );
    console.log(`   B thread unreadCount in accepted list: ${bRowAfter?.unreadCount}`);

    // A calls /read on own messages
    console.log(`-> User A calls POST /api/connections/${connABId}/read on his own sent messages...`);
    const aReadRes = await fetch(`${BASE_URL}/api/connections/${connABId}/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
    });
    const aReadData = await aReadRes.json();
    console.log(`   Response Status: ${aReadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(aReadData)}`);
    checkPrivacy(aReadData, "Scenario c: A marks read on own messages");

    socketA.disconnect();

    const passC =
      bReadRes.status === 200 &&
      bReadData.status === "ok" &&
      bReadData.count === 3 &&
      socketReadPayload.connectionId === connABId.toString() &&
      socketReadPayload.readerId === userB.id &&
      Boolean(socketReadPayload.readAt) &&
      bUnreadAfterData.total === 0 &&
      bRowAfter?.unreadCount === 0 &&
      aReadRes.status === 200 &&
      aReadData.count === 0;

    results["c"] = {
      name: "B calls POST /read returns count 3, A socket receives message:read, B unread becomes 0, A calling /read marks count 0",
      pass: passC,
    };
    console.log(`\n[SCENARIO C RESULT]: ${passC ? "PASS" : "FAIL"}`);

    // ------------------------------------------------------------------------------------------------
    // Scenario d: Non-participant (C) calling /read gets 403; calling /read on pending connection gets 403
    // ------------------------------------------------------------------------------------------------
    console.log("\n====================================================================================================");
    console.log("SCENARIO D: Non-participant C calling /read gets 403; pending connection /read gets 403");
    console.log("====================================================================================================");

    console.log(`-> User C (not connected to AB) calls POST /api/connections/${connABId}/read...`);
    const cReadRes = await fetch(`${BASE_URL}/api/connections/${connABId}/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
    });
    const cReadData = await cReadRes.json();
    console.log(`   Response Status: ${cReadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(cReadData)}`);
    checkPrivacy(cReadData, "Scenario d: C calls read on AB");

    // Create a pending connection between C and A
    console.log("-> Creating pending connection between C and A...");
    const connCARes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ toUserId: userA.id }),
    });
    const connCAData = await connCARes.json();
    const connCAId = connCAData.connection._id;
    console.log(`   Pending connection created: ${connCAId} (status: ${connCAData.connection.status})`);

    console.log(`-> User C calls POST /api/connections/${connCAId}/read on pending connection...`);
    const pendingReadRes = await fetch(`${BASE_URL}/api/connections/${connCAId}/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
    });
    const pendingReadData = await pendingReadRes.json();
    console.log(`   Response Status: ${pendingReadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(pendingReadData)}`);
    checkPrivacy(pendingReadData, "Scenario d: C calls read on pending CA");

    const passD =
      cReadRes.status === 403 &&
      cReadData.error === "NOT_CONNECTED" &&
      pendingReadRes.status === 403 &&
      pendingReadData.error === "NOT_CONNECTED";

    results["d"] = {
      name: "Third user C calling /read gets 403 NOT_CONNECTED; calling /read on pending connection gets 403 NOT_CONNECTED",
      pass: passD,
    };
    console.log(`\n[SCENARIO D RESULT]: ${passD ? "PASS" : "FAIL"}`);

    // ------------------------------------------------------------------------------------------------
    // Scenario e: After B blocks A, thread no longer counts in B's unread-count and does not appear in accepted
    // ------------------------------------------------------------------------------------------------
    console.log("\n====================================================================================================");
    console.log("SCENARIO E: After B blocks A, thread excluded from B unread-count and accepted list");
    console.log("====================================================================================================");

    // A sends 2 new messages so there are unread messages
    console.log("-> A sends 2 new messages to B...");
    await fetch(`${BASE_URL}/api/connections/${connABId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: "Message before block 1" }),
    });
    await fetch(`${BASE_URL}/api/connections/${connABId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: "Message before block 2" }),
    });

    const bPreBlockUnreadRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bPreBlockUnreadData = await bPreBlockUnreadRes.json();
    console.log(`   B unread before block: ${bPreBlockUnreadData.total} (Expect: 2)`);

    console.log("-> B blocks A via POST /api/connections/block...");
    const blockRes = await fetch(`${BASE_URL}/api/connections/block`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ toUserId: userA.id }),
    });
    const blockData = await blockRes.json();
    console.log(`   Response Status: ${blockRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(blockData)}`);
    checkPrivacy(blockData, "Scenario e: B blocks A");

    console.log("-> B calls GET /api/connections/unread-count after block...");
    const bPostBlockUnreadRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bPostBlockUnreadData = await bPostBlockUnreadRes.json();
    console.log(`   Response Status: ${bPostBlockUnreadRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(bPostBlockUnreadData)}`);
    checkPrivacy(bPostBlockUnreadData, "Scenario e: B unread after block");

    console.log("-> B calls GET /api/connections?status=accepted after block...");
    const bPostBlockAcceptedRes = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bPostBlockAcceptedData = await bPostBlockAcceptedRes.json();
    console.log(`   Response Status: ${bPostBlockAcceptedRes.status}`);
    console.log(`   Response Body: ${JSON.stringify(bPostBlockAcceptedData, null, 2)}`);
    checkPrivacy(bPostBlockAcceptedData, "Scenario e: B accepted list after block");

    const abInAccepted = bPostBlockAcceptedData.connections?.some(
      (c) => c.connectionId.toString() === connABId.toString()
    );

    const passE =
      blockRes.status === 200 &&
      bPostBlockUnreadRes.status === 200 &&
      bPostBlockUnreadData.total === 0 &&
      abInAccepted === false;

    results["e"] = {
      name: "After B blocks A, thread excluded from unread-count (0) and does not appear in accepted list",
      pass: passE,
    };
    console.log(`\n[SCENARIO E RESULT]: ${passE ? "PASS" : "FAIL"}`);

    // ------------------------------------------------------------------------------------------------
    // Scenario f: List ordering: two threads; the one with newer message appears first
    // ------------------------------------------------------------------------------------------------
    console.log("\n====================================================================================================");
    console.log("SCENARIO F: List ordering: thread with newer message appears first");
    console.log("====================================================================================================");

    // Create 2 accepted connections for User B:
    // Thread 1: User B <-> User C
    // Thread 2: User B <-> User D
    console.log("-> Connecting B and C (accepted)...");
    const reqBC = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ toUserId: userC.id }),
    });
    const connBCData = await reqBC.json();
    const connBCId = connBCData.connection._id;
    await fetch(`${BASE_URL}/api/connections/${connBCId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });

    console.log("-> Connecting B and D (accepted)...");
    const reqBD = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ toUserId: userD.id }),
    });
    const connBDData = await reqBD.json();
    const connBDId = connBDData.connection._id;
    await fetch(`${BASE_URL}/api/connections/${connBDId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });

    // Step 1: Send message in Thread BC first (T1)
    console.log("-> Sending message in Thread BC (T1)...");
    await fetch(`${BASE_URL}/api/connections/${connBCId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ text: "Message in BC at T1" }),
    });

    await new Promise((r) => setTimeout(r, 100));

    // Step 2: Send message in Thread BD second (T2 > T1)
    console.log("-> Sending message in Thread BD (T2 > T1)...");
    await fetch(`${BASE_URL}/api/connections/${connBDId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({ text: "Message in BD at T2 (newer)" }),
    });

    // Check ordering: Thread BD should appear first
    console.log("-> B calls GET /api/connections?status=accepted to check ordering...");
    const orderRes1 = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const orderData1 = await orderRes1.json();
    console.log(`   Order 1: 1st=${orderData1.connections?.[0]?.connectionId}, 2nd=${orderData1.connections?.[1]?.connectionId}`);
    checkPrivacy(orderData1, "Scenario f: order 1");

    const order1Pass =
      orderData1.connections?.[0]?.connectionId.toString() === connBDId.toString() &&
      orderData1.connections?.[1]?.connectionId.toString() === connBCId.toString();

    // Step 3: Now send a newer message in Thread BC (T3 > T2)
    await new Promise((r) => setTimeout(r, 100));
    console.log("-> Sending newer message in Thread BC (T3 > T2)...");
    await fetch(`${BASE_URL}/api/connections/${connBCId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ text: "Message in BC at T3 (newest!)" }),
    });

    // Check ordering: Thread BC should now appear first
    console.log("-> B calls GET /api/connections?status=accepted to check updated ordering...");
    const orderRes2 = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const orderData2 = await orderRes2.json();
    console.log(`   Order 2: 1st=${orderData2.connections?.[0]?.connectionId}, 2nd=${orderData2.connections?.[1]?.connectionId}`);
    checkPrivacy(orderData2, "Scenario f: order 2");

    const order2Pass =
      orderData2.connections?.[0]?.connectionId.toString() === connBCId.toString() &&
      orderData2.connections?.[1]?.connectionId.toString() === connBDId.toString();

    const passF = order1Pass && order2Pass;
    results["f"] = {
      name: "List ordering: thread with newer message appears first (BD first after T2, then BC first after T3)",
      pass: passF,
    };
    console.log(`\n[SCENARIO F RESULT]: ${passF ? "PASS" : "FAIL"}`);

    // ------------------------------------------------------------------------------------------------
    // Scenario g: Privacy scan across all responses
    // ------------------------------------------------------------------------------------------------
    console.log("\n====================================================================================================");
    console.log("SCENARIO G: Privacy scan: none of dob, gender, authId, phone, age in any response");
    console.log("====================================================================================================");

    console.log(`Total privacy violations found across all tests: ${privacyViolations.length}`);
    if (privacyViolations.length > 0) {
      console.error("Violations:", JSON.stringify(privacyViolations, null, 2));
    } else {
      console.log("✓ Verified: No sensitive fields (dob, gender, authId, phone, age) leaked in any API response.");
    }

    const passG = privacyViolations.length === 0;
    results["g"] = {
      name: "Privacy scan: none of dob, gender, authId, phone, age in any response",
      pass: passG,
    };
    console.log(`\n[SCENARIO G RESULT]: ${passG ? "PASS" : "FAIL"}`);

  } catch (err) {
    console.error("FATAL SUITE ERROR:", err);
  } finally {
    // ------------------------------------------------------------------------------------------------
    // Final Cleanup
    // ------------------------------------------------------------------------------------------------
    await cleanupThrowawayData();

    console.log("====================================================================================================");
    console.log("FINAL RESULTS SUMMARY — READ RECEIPTS & UNREAD COUNTS");
    console.log("====================================================================================================");
    console.log("Check | Result | Description");
    console.log("------|--------|------------------------------------------------------------------------------------");
    for (const key of ["a", "b", "c", "d", "e", "f", "g"]) {
      const res = results[key];
      const statusStr = res?.pass ? "PASS  " : "FAIL  ";
      console.log(`  ${key.toUpperCase()}   | ${statusStr} | ${res?.name || "Not run"}`);
    }
    console.log("====================================================================================================\n");

    if (serverStarted) {
      httpServer.close();
    }
    await mongoose.disconnect();

    const allPassed = ["a", "b", "c", "d", "e", "f", "g"].every((k) => results[k]?.pass);
    process.exit(allPassed ? 0 : 1);
  }
}

runReadReceiptsSuite();
