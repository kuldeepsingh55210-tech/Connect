/**
 * apps/api/scripts/test-safety-e2e.js
 *
 * Trust & Safety E2E Verification Script
 * Covers Block, Unmatch, Report, Auto-hide, Admin endpoints, Rate Limiting, and Privacy.
 *
 * Uses ONLY throwaway test users (+919876543401 to +919876543417).
 * Existing users (Aarav, Priya, etc.) are NOT touched.
 * All throwaway users, connections, messages, and reports are cleaned up
 * at start and end.
 */

process.env.NODE_ENV = "test";
process.env.PORT = "4015";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { io: ClientIO } = require("socket.io-client");
const { app, httpServer, io } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User, Connection, Message, Report } = require("../src/models");

const PORT = 4015;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_KEY = process.env.ADMIN_KEY || "connectlocal_dev_admin_key_2026";

const THROWAWAY_PHONES = [
  "+919876543401", // User A / User E1
  "+919876543402", // User B / User E2
  "+919876543403", // User C / User E3
  "+919876543404", // User D / Observer E4
  "+919876543405", // User T (target of reports)
  "+919876543406", // User R (rate limit reporter)
  "+919876543407", // Target T1
  "+919876543408", // Target T2
  "+919876543409", // Target T3
  "+919876543410", // Target T4
  "+919876543411", // Target T5
  "+919876543412", // Target T6
  "+919876543413", // Target T7
  "+919876543414", // Target T8
  "+919876543415", // Target T9
  "+919876543416", // Target T10
  "+919876543417", // Target T11
];

// Clean up throwaway data completely
async function cleanupThrowawayData() {
  console.log("[cleanup] Removing any existing throwaway users (+9198765434xx) and associated data...");
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

    const repRes = await Report.deleteMany({
      $or: [
        { reporterId: { $in: userIds } },
        { reportedUserId: { $in: userIds } },
      ],
    });

    const usrRes = await User.deleteMany({ _id: { $in: userIds } });
    console.log(`[cleanup] Deleted ${usrRes.deletedCount} users, ${connRes.deletedCount} connections, ${msgRes.deletedCount} messages, ${repRes.deletedCount} reports.`);
  }

  // Fallback cleanup by authId
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

// Privacy Assertion: No dob, gender, authId, phone, exact age for other users
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

// Results tracker
const results = {};

async function runSafetyVerification() {
  console.log("====================================================================================================");
  console.log("CONNECTLOCAL — TRUST & SAFETY E2E VERIFICATION SUITE");
  console.log("====================================================================================================\n");

  await connectDB();
  await cleanupThrowawayData();

  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`[test-server] Running on ${BASE_URL}\n`);

  try {
    // ------------------------------------------------------------------------------------------------
    // SETUP PRIMARY THROWAWAY USERS (Using valid vocabulary from src/config/vocabulary.js)
    // ------------------------------------------------------------------------------------------------
    console.log("=== CREATING PRIMARY THROWAWAY USERS ===");
    const userA = await createThrowawayUser("+919876543401", "Throwaway Alice", "Bangalore", ["AI", "Product"], ["Reading", "Music"]);
    const userB = await createThrowawayUser("+919876543402", "Throwaway Bob", "Bangalore", ["AI", "Backend Dev"], ["Reading", "Travel"]);
    const userC = await createThrowawayUser("+919876543403", "Throwaway Charlie", "Bangalore", ["AI", "Frontend Dev"], ["Reading", "PC Gaming"]);
    const userD = await createThrowawayUser("+919876543404", "Throwaway Dave", "Bangalore", ["AI", "Data"], ["Reading", "Gym"]);
    const userT = await createThrowawayUser("+919876543405", "Throwaway Target", "Bangalore", ["AI", "Design"], ["Reading", "Food"]);
    const userR = await createThrowawayUser("+919876543406", "Throwaway Reporter", "Bangalore", ["AI", "Sales"], ["Reading", "Cricket"]);
    console.log("Users created: Alice, Bob, Charlie, Dave, Target, Reporter.\n");

    // ------------------------------------------------------------------------------------------------
    // BLOCK SECTION (Checks 1 - 5)
    // ------------------------------------------------------------------------------------------------
    console.log("====================================================================================================");
    console.log("BLOCK TESTS (Checks 1 - 5)");
    console.log("====================================================================================================\n");

    // Check 1: A and B become accepted connections and exchange a message.
    console.log(">>> CHECK 1: A and B become accepted connections and exchange a message <<<");

    console.log(`-> A (Alice) requests connection to B (Bob) via POST /api/connections...`);
    const connABRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ toUserId: userB.id }),
    });
    const connABData = await connABRes.json();
    console.log(`Status: ${connABRes.status}`);
    console.log(`Body:`, JSON.stringify(connABData, null, 2));
    checkPrivacy(connABData, "Check 1: POST /api/connections");

    const connABId = connABData.connection?._id || connABData.connection?.id;

    console.log(`-> B (Bob) accepts connection request via PATCH /api/connections/${connABId}...`);
    const acceptRes = await fetch(`${BASE_URL}/api/connections/${connABId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    const acceptData = await acceptRes.json();
    console.log(`Status: ${acceptRes.status}`);
    console.log(`Body:`, JSON.stringify(acceptData, null, 2));
    checkPrivacy(acceptData, "Check 1: PATCH /api/connections/:id accept");

    console.log(`-> A sends message to B via POST /api/connections/${connABId}/messages...`);
    const msgRes = await fetch(`${BASE_URL}/api/connections/${connABId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: "Hello Bob! Nice to connect with you." }),
    });
    const msgData = await msgRes.json();
    console.log(`Status: ${msgRes.status}`);
    console.log(`Body:`, JSON.stringify(msgData, null, 2));
    checkPrivacy(msgData, "Check 1: POST /api/connections/:id/messages");

    const check1Pass = connABRes.status === 201 && acceptRes.status === 200 && msgRes.status === 201 && acceptData.connection?.status === "accepted";
    results[1] = { name: "A and B become accepted connections and exchange a message", pass: check1Pass };
    console.log(`[CHECK 1 RESULT]: ${check1Pass ? "PASS" : "FAIL"}\n`);

    // Check 2: A blocks B. B cannot send over REST & socket; A cannot send to B.
    console.log(">>> CHECK 2: A blocks B. Assert B cannot send message over REST or Socket; A cannot send to B <<<");

    console.log(`-> A blocks B via POST /api/connections/block...`);
    const blockRes = await fetch(`${BASE_URL}/api/connections/block`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ toUserId: userB.id }),
    });
    const blockData = await blockRes.json();
    console.log(`Status: ${blockRes.status}`);
    console.log(`Body:`, JSON.stringify(blockData, null, 2));
    checkPrivacy(blockData, "Check 2: POST /api/connections/block");

    console.log(`-> B attempts to send message to A over REST (POST /api/connections/${connABId}/messages)...`);
    const bToARestRes = await fetch(`${BASE_URL}/api/connections/${connABId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ text: "Are you there Alice?" }),
    });
    const bToARestData = await bToARestRes.json();
    console.log(`Status: ${bToARestRes.status}`);
    console.log(`Body:`, JSON.stringify(bToARestData, null, 2));
    checkPrivacy(bToARestData, "Check 2: B to A REST message attempt");

    console.log(`-> B attempts to send message to A over Socket.io (event message:send)...`);
    const clientSocketB = ClientIO(BASE_URL, {
      auth: { token: userB.token },
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket connection timeout for User B")), 4000);
      clientSocketB.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      clientSocketB.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const socketAckResult = await new Promise((resolve) => {
      let errorEvent = null;
      clientSocketB.once("message:error", (err) => {
        errorEvent = err;
      });

      clientSocketB.emit(
        "message:send",
        { connectionId: connABId, text: "Socket message attempt from Bob" },
        (ack) => {
          resolve({ ack, errorEvent });
        }
      );

      setTimeout(() => resolve({ ack: null, errorEvent, timeout: true }), 3000);
    });

    clientSocketB.disconnect();
    console.log(`Socket Response Ack:`, JSON.stringify(socketAckResult.ack, null, 2));
    console.log(`Socket message:error Event:`, JSON.stringify(socketAckResult.errorEvent, null, 2));

    console.log(`-> A attempts to send message to B over REST (POST /api/connections/${connABId}/messages)...`);
    const aToBRestRes = await fetch(`${BASE_URL}/api/connections/${connABId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: "Alice sending to Bob after blocking" }),
    });
    const aToBRestData = await aToBRestRes.json();
    console.log(`Status: ${aToBRestRes.status}`);
    console.log(`Body:`, JSON.stringify(aToBRestData, null, 2));
    checkPrivacy(aToBRestData, "Check 2: A to B REST message attempt");

    const bRestBlocked = bToARestRes.status === 403 && bToARestData.error === "NOT_CONNECTED";
    const bSocketBlocked = socketAckResult.ack?.error === "NOT_CONNECTED" || socketAckResult.errorEvent?.error === "NOT_CONNECTED";
    const aRestBlocked = aToBRestRes.status === 403 && aToBRestData.error === "NOT_CONNECTED";
    const check2Pass = blockRes.status === 200 && bRestBlocked && bSocketBlocked && aRestBlocked;
    results[2] = { name: "A blocks B: messages blocked over REST and Socket for both users", pass: check2Pass };
    console.log(`[CHECK 2 RESULT]: ${check2Pass ? "PASS" : "FAIL"}\n`);

    // Check 3: B does not appear in A's Discover, and A does not appear in B's Discover.
    console.log(">>> CHECK 3: B does not appear in A's Discover, and A does not appear in B's Discover <<<");

    console.log(`-> A calls GET /api/discover...`);
    const aDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const aDiscoverData = await aDiscoverRes.json();
    console.log(`Status: ${aDiscoverRes.status}`);
    const aTier1Ids = (aDiscoverData.tier1 || []).map((u) => u.id?.toString());
    const aTier2Ids = (aDiscoverData.tier2 || []).map((u) => u.id?.toString());
    const bInADiscover = aTier1Ids.includes(userB.id) || aTier2Ids.includes(userB.id);
    console.log(`Is Bob in Alice's Discover? ${bInADiscover} (tier1 count: ${aTier1Ids.length}, tier2 count: ${aTier2Ids.length})`);
    checkPrivacy(aDiscoverData, "Check 3: A Discover response");

    console.log(`-> B calls GET /api/discover...`);
    const bDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bDiscoverData = await bDiscoverRes.json();
    console.log(`Status: ${bDiscoverRes.status}`);
    const bTier1Ids = (bDiscoverData.tier1 || []).map((u) => u.id?.toString());
    const bTier2Ids = (bDiscoverData.tier2 || []).map((u) => u.id?.toString());
    const aInBDiscover = bTier1Ids.includes(userA.id) || bTier2Ids.includes(userA.id);
    console.log(`Is Alice in Bob's Discover? ${aInBDiscover} (tier1 count: ${bTier1Ids.length}, tier2 count: ${bTier2Ids.length})`);
    checkPrivacy(bDiscoverData, "Check 3: B Discover response");

    const check3Pass = aDiscoverRes.status === 200 && bDiscoverRes.status === 200 && !bInADiscover && !aInBDiscover;
    results[3] = { name: "B does not appear in A's Discover, and A does not appear in B's Discover", pass: check3Pass };
    console.log(`[CHECK 3 RESULT]: ${check3Pass ? "PASS" : "FAIL"}\n`);

    // Check 4: B receives no notification/indication that they were blocked (response shape must not say "blocked by")
    console.log(">>> CHECK 4: B receives no notification/indication that they were blocked in GET /api/connections <<<");

    console.log(`-> B calls GET /api/connections (accepted)...`);
    const bConnAcceptedRes = await fetch(`${BASE_URL}/api/connections`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bConnAcceptedData = await bConnAcceptedRes.json();
    console.log(`Status: ${bConnAcceptedRes.status}`);
    console.log(`Body:`, JSON.stringify(bConnAcceptedData, null, 2));
    checkPrivacy(bConnAcceptedData, "Check 4: B GET /api/connections");

    console.log(`-> B calls GET /api/connections?status=pending...`);
    const bConnPendingRes = await fetch(`${BASE_URL}/api/connections?status=pending`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bConnPendingData = await bConnPendingRes.json();
    console.log(`Status: ${bConnPendingRes.status}`);
    console.log(`Body:`, JSON.stringify(bConnPendingData, null, 2));
    checkPrivacy(bConnPendingData, "Check 4: B GET /api/connections?status=pending");

    console.log(`-> B calls GET /api/connections?status=sent...`);
    const bConnSentRes = await fetch(`${BASE_URL}/api/connections?status=sent`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const bConnSentData = await bConnSentRes.json();
    console.log(`Status: ${bConnSentRes.status}`);
    console.log(`Body:`, JSON.stringify(bConnSentData, null, 2));
    checkPrivacy(bConnSentData, "Check 4: B GET /api/connections?status=sent");

    const allBConns = [
      ...(bConnAcceptedData.connections || []),
      ...(bConnPendingData.connections || []),
      ...(bConnSentData.connections || []),
    ];

    const hasBlockedIndicator = allBConns.some((c) => {
      const str = JSON.stringify(c).toLowerCase();
      return str.includes("blocked") || str.includes("block");
    });

    console.log(`Any connection item in Bob's connection lists mentions 'blocked'? ${hasBlockedIndicator}`);
    const check4Pass = bConnAcceptedRes.status === 200 && !hasBlockedIndicator;
    results[4] = { name: "B receives no indication that they were blocked in GET /api/connections", pass: check4Pass };
    console.log(`[CHECK 4 RESULT]: ${check4Pass ? "PASS" : "FAIL"}\n`);

    // Check 5: B cannot send a new Connect request to A.
    console.log(">>> CHECK 5: B cannot send a new Connect request to A <<<");

    console.log(`-> B attempts POST /api/connections with { toUserId: A.id }...`);
    const bConnectARes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ toUserId: userA.id }),
    });
    const bConnectAData = await bConnectARes.json();
    console.log(`Status: ${bConnectARes.status}`);
    console.log(`Body:`, JSON.stringify(bConnectAData, null, 2));
    checkPrivacy(bConnectAData, "Check 5: B to A connect attempt");

    const check5Pass = bConnectARes.status === 403 && bConnectAData.error === "BLOCKED";
    results[5] = { name: "B cannot send a new Connect request to A (403 BLOCKED)", pass: check5Pass };
    console.log(`[CHECK 5 RESULT]: ${check5Pass ? "PASS" : "FAIL"}\n`);

    // ------------------------------------------------------------------------------------------------
    // UNMATCH SECTION (Checks 6 - 7)
    // ------------------------------------------------------------------------------------------------
    console.log("====================================================================================================");
    console.log("UNMATCH TESTS (Checks 6 - 7)");
    console.log("====================================================================================================\n");

    // Check 6: C and D connected, D unmatches. Chat closed for both, status becomes unmatched, messages blocked.
    console.log(">>> CHECK 6: C and D connected, D unmatches. Assert chat closed, status unmatched, messages blocked <<<");

    console.log(`-> C (Charlie) requests connection to D (Dave) via POST /api/connections...`);
    const connCDRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ toUserId: userD.id }),
    });
    const connCDData = await connCDRes.json();
    console.log(`Status: ${connCDRes.status}`);
    console.log(`Body:`, JSON.stringify(connCDData, null, 2));
    const connCDId = connCDData.connection?._id || connCDData.connection?.id;

    console.log(`-> D (Dave) accepts connection request via PATCH /api/connections/${connCDId}...`);
    const acceptCDRes = await fetch(`${BASE_URL}/api/connections/${connCDId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    const acceptCDData = await acceptCDRes.json();
    console.log(`Status: ${acceptCDRes.status}`);
    console.log(`Body:`, JSON.stringify(acceptCDData, null, 2));

    console.log(`-> C sends message to D before unmatch via POST /api/connections/${connCDId}/messages...`);
    const msgCDRes = await fetch(`${BASE_URL}/api/connections/${connCDId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ text: "Hello Dave, chatting before unmatch" }),
    });
    const msgCDData = await msgCDRes.json();
    console.log(`Status: ${msgCDRes.status}`);
    console.log(`Body:`, JSON.stringify(msgCDData, null, 2));

    console.log(`-> D unmatches C via PATCH /api/connections/${connCDId} (action: 'unmatch')...`);
    const unmatchRes = await fetch(`${BASE_URL}/api/connections/${connCDId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({ action: "unmatch" }),
    });
    const unmatchData = await unmatchRes.json();
    console.log(`Status: ${unmatchRes.status}`);
    console.log(`Body:`, JSON.stringify(unmatchData, null, 2));
    checkPrivacy(unmatchData, "Check 6: PATCH /api/connections/:id unmatch");

    console.log(`-> C attempts to send message to D after unmatch (POST /api/connections/${connCDId}/messages)...`);
    const cMsgAfterUnmatchRes = await fetch(`${BASE_URL}/api/connections/${connCDId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ text: "Can C send message after unmatch?" }),
    });
    const cMsgAfterUnmatchData = await cMsgAfterUnmatchRes.json();
    console.log(`Status: ${cMsgAfterUnmatchRes.status}`);
    console.log(`Body:`, JSON.stringify(cMsgAfterUnmatchData, null, 2));
    checkPrivacy(cMsgAfterUnmatchData, "Check 6: C message after unmatch");

    console.log(`-> D attempts to send message to C after unmatch (POST /api/connections/${connCDId}/messages)...`);
    const dMsgAfterUnmatchRes = await fetch(`${BASE_URL}/api/connections/${connCDId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({ text: "Can D send message after unmatch?" }),
    });
    const dMsgAfterUnmatchData = await dMsgAfterUnmatchRes.json();
    console.log(`Status: ${dMsgAfterUnmatchRes.status}`);
    console.log(`Body:`, JSON.stringify(dMsgAfterUnmatchData, null, 2));
    checkPrivacy(dMsgAfterUnmatchData, "Check 6: D message after unmatch");

    console.log(`-> C attempts to read messages via GET /api/connections/${connCDId}/messages...`);
    const cReadMessagesRes = await fetch(`${BASE_URL}/api/connections/${connCDId}/messages`, {
      headers: { Authorization: `Bearer ${userC.token}` },
    });
    const cReadMessagesData = await cReadMessagesRes.json();
    console.log(`Status: ${cReadMessagesRes.status}`);
    console.log(`Body:`, JSON.stringify(cReadMessagesData, null, 2));

    const check6Pass =
      unmatchRes.status === 200 &&
      unmatchData.connection?.status === "unmatched" &&
      cMsgAfterUnmatchRes.status === 403 &&
      cMsgAfterUnmatchData.error === "NOT_CONNECTED" &&
      dMsgAfterUnmatchRes.status === 403 &&
      dMsgAfterUnmatchData.error === "NOT_CONNECTED" &&
      cReadMessagesRes.status === 403;

    results[6] = { name: "C and D connected, D unmatches: chat closed, status unmatched, messages blocked", pass: check6Pass };
    console.log(`[CHECK 6 RESULT]: ${check6Pass ? "PASS" : "FAIL"}\n`);

    // Check 7: After unmatch, can they connect again? Report actual behavior.
    console.log(">>> CHECK 7: After unmatch, can they connect again? Report actual behavior <<<");

    console.log(`-> C attempts to send a new connect request to D via POST /api/connections...`);
    const cReconnectRes = await fetch(`${BASE_URL}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ toUserId: userD.id }),
    });
    const cReconnectData = await cReconnectRes.json();
    console.log(`Status: ${cReconnectRes.status}`);
    console.log(`Body:`, JSON.stringify(cReconnectData, null, 2));
    checkPrivacy(cReconnectData, "Check 7: Reconnect attempt after unmatch");

    const reconnectAllowed = cReconnectRes.status === 201 && cReconnectData.connection?.status === "pending";
    console.log(`[OBSERVATION] Reconnect after unmatch behavior: Reconnect request is ${reconnectAllowed ? "ALLOWED (Status 201 Created)" : "REJECTED (Status " + cReconnectRes.status + ")"}, resetting connection status to 'pending'.`);

    const check7Pass = cReconnectRes.status === 201 || cReconnectRes.status === 400 || cReconnectRes.status === 403 || cReconnectRes.status === 409;
    results[7] = {
      name: `After unmatch reconnect behavior: ${reconnectAllowed ? "Allowed (HTTP 201, resets to 'pending')" : "Status " + cReconnectRes.status}`,
      pass: check7Pass,
    };
    console.log(`[CHECK 7 RESULT]: ${check7Pass ? "PASS" : "FAIL"}\n`);

    // ------------------------------------------------------------------------------------------------
    // REPORT + AUTO-HIDE SECTION (Checks 8 - 13)
    // ------------------------------------------------------------------------------------------------
    console.log("====================================================================================================");
    console.log("REPORT & AUTO-HIDE TESTS (Checks 8 - 13)");
    console.log("====================================================================================================\n");

    // Check 8: 3 DIFFERENT users (E1, E2, E3) each report user T once.
    // Assert 3rd report sets T.status to hidden_pending_review, and T disappears from Discover.
    console.log(">>> CHECK 8: 3 different users report T once -> auto-hide to hidden_pending_review & disappears from Discover <<<");

    console.log(`-> Checking T (Target) in Dave's (Observer) Discover before any reports...`);
    const initDaveDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    });
    const initDaveDiscoverData = await initDaveDiscoverRes.json();
    console.log(`Status: ${initDaveDiscoverRes.status}`);
    const initDaveTier1Names = (initDaveDiscoverData.tier1 || []).map((u) => u.name);
    const initDaveTier2Names = (initDaveDiscoverData.tier2 || []).map((u) => u.name);
    const tInDaveDiscoverInitial = initDaveTier1Names.includes("Throwaway Target") || initDaveTier2Names.includes("Throwaway Target");
    console.log(`Target in Dave's Discover initially? ${tInDaveDiscoverInitial} (Tier 1: [${initDaveTier1Names.join(", ")}])`);

    console.log(`-> Report 1 on Target by E1 (Alice)...`);
    const rep1Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({
        reportedUserId: userT.id,
        reason: "harassment",
        details: "Report 1 by Alice",
      }),
    });
    const rep1Data = await rep1Res.json();
    console.log(`Status: ${rep1Res.status}`);
    console.log(`Body:`, JSON.stringify(rep1Data, null, 2));
    checkPrivacy(rep1Data, "Check 8: Report 1");

    let tDoc = await User.findById(userT.id);
    console.log(`Target status after 1st report: '${tDoc.status}'`);

    console.log(`-> Report 2 on Target by E2 (Bob)...`);
    const rep2Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({
        reportedUserId: userT.id,
        reason: "spam",
        details: "Report 2 by Bob",
      }),
    });
    const rep2Data = await rep2Res.json();
    console.log(`Status: ${rep2Res.status}`);
    console.log(`Body:`, JSON.stringify(rep2Data, null, 2));
    checkPrivacy(rep2Data, "Check 8: Report 2");

    tDoc = await User.findById(userT.id);
    console.log(`Target status after 2nd report: '${tDoc.status}'`);

    console.log(`-> Report 3 on Target by E3 (Charlie) [Triggers auto-hide threshold]...`);
    const rep3Res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({
        reportedUserId: userT.id,
        reason: "fake_profile",
        details: "Report 3 by Charlie",
      }),
    });
    const rep3Data = await rep3Res.json();
    console.log(`Status: ${rep3Res.status}`);
    console.log(`Body:`, JSON.stringify(rep3Data, null, 2));
    checkPrivacy(rep3Data, "Check 8: Report 3");

    tDoc = await User.findById(userT.id);
    console.log(`Target status after 3rd report in DB: '${tDoc.status}'`);

    console.log(`-> Dave (Observer) calls GET /api/discover after 3rd report...`);
    const postHideDaveDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    });
    const postHideDaveDiscoverData = await postHideDaveDiscoverRes.json();
    console.log(`Status: ${postHideDaveDiscoverRes.status}`);
    const postTier1Names = (postHideDaveDiscoverData.tier1 || []).map((u) => u.name);
    const postTier2Names = (postHideDaveDiscoverData.tier2 || []).map((u) => u.name);
    const tInDiscoverAfterHide = postTier1Names.includes("Throwaway Target") || postTier2Names.includes("Throwaway Target");
    console.log(`Target in Dave's Discover after auto-hide? ${tInDiscoverAfterHide} (Tier 1: [${postTier1Names.join(", ")}])`);
    checkPrivacy(postHideDaveDiscoverData, "Check 8: Discover after auto-hide");

    const check8Pass =
      rep1Res.status === 201 &&
      rep2Res.status === 201 &&
      rep3Res.status === 201 &&
      tDoc.status === "hidden_pending_review" &&
      !tInDiscoverAfterHide;

    results[8] = { name: "3 different users report T: auto-hide to 'hidden_pending_review' & disappears from Discover", pass: check8Pass };
    console.log(`[CHECK 8 RESULT]: ${check8Pass ? "PASS" : "FAIL"}\n`);

    // Check 9: Duplicate report by same reporter must be rejected (409 DUPLICATE_REPORT)
    // and one reporter cannot hide a user.
    console.log(">>> CHECK 9: Duplicate report by same reporter rejected (409) & one reporter cannot hide a user <<<");

    const userABeforeDup = await User.findById(userA.id);
    const initialAliceDailyReportCount = userABeforeDup.dailyReportCount;
    const initialAliceReportCountOnT = await Report.countDocuments({
      reporterId: userA.id,
      reportedUserId: userT.id,
    });

    console.log(`-> E1 (Alice) attempts to report Target a second time via POST /api/reports (Expect 409 DUPLICATE_REPORT)...`);
    const dupReportRes = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({
        reportedUserId: userT.id,
        reason: "other",
        details: "Alice reporting Target again (duplicate)",
      }),
    });
    const dupReportData = await dupReportRes.json();
    console.log(`Status: ${dupReportRes.status}`);
    console.log(`Body:`, JSON.stringify(dupReportData, null, 2));
    checkPrivacy(dupReportData, "Check 9: Duplicate report");

    const userAAfterDup = await User.findById(userA.id);
    const finalAliceReportCountOnT = await Report.countDocuments({
      reporterId: userA.id,
      reportedUserId: userT.id,
    });

    const is409Duplicate =
      dupReportRes.status === 409 &&
      dupReportData.error === "DUPLICATE_REPORT" &&
      dupReportData.message === "You have already reported this user.";

    const noSecondReportCreated = finalAliceReportCountOnT === initialAliceReportCountOnT;
    const quotaNotConsumed = userAAfterDup.dailyReportCount === initialAliceDailyReportCount;

    console.log(`- 409 DUPLICATE_REPORT returned: ${is409Duplicate ? "YES" : "NO"}`);
    console.log(`- No second report created in DB: ${noSecondReportCreated ? "YES" : "NO"} (Initial: ${initialAliceReportCountOnT}, Final: ${finalAliceReportCountOnT})`);
    console.log(`- Quota NOT consumed: ${quotaNotConsumed ? "YES" : "NO"} (Initial: ${initialAliceDailyReportCount}, After: ${userAAfterDup.dailyReportCount})`);

    // Verify one reporter cannot hide a user:
    console.log(`-> Testing single reporter cannot hide a user (Alice attempts 3 reports against fresh Target User S)...`);
    const userS = await createThrowawayUser("+919876543417", "Throwaway SoloTarget", "Bangalore", ["AI", "Design"], ["Yoga", "Travel"]);

    const soloRep1 = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ reportedUserId: userS.id, reason: "spam", details: "Solo rep 1" }),
    });
    console.log(`Solo Report 1 Status: ${soloRep1.status}`);

    const soloRep2 = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ reportedUserId: userS.id, reason: "spam", details: "Solo rep 2" }),
    });
    console.log(`Solo Report 2 Status: ${soloRep2.status}`);

    const soloRep3 = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ reportedUserId: userS.id, reason: "spam", details: "Solo rep 3" }),
    });
    console.log(`Solo Report 3 Status: ${soloRep3.status}`);

    const sDocInDb = await User.findById(userS.id);
    const soloTargetStaysActive = sDocInDb.status === "active";
    console.log(`User S status after 3 attempts by same reporter: '${sDocInDb.status}' (Expect 'active': ${soloTargetStaysActive ? "YES" : "NO"})`);

    // Clean up temporary userS so +919876543417 is fresh for Check 11
    await Report.deleteMany({ reportedUserId: userS.id });
    await User.deleteOne({ _id: userS.id });

    const check9Pass = is409Duplicate && noSecondReportCreated && quotaNotConsumed && soloTargetStaysActive;
    results[9] = {
      name: "Duplicate report rejected (409 DUPLICATE_REPORT), quota not consumed, one reporter cannot hide user",
      pass: check9Pass,
    };
    console.log(`[CHECK 9 RESULT]: ${check9Pass ? "PASS" : "FAIL"}\n`);

    // Check 10: Reporting yourself: must be rejected.
    console.log(">>> CHECK 10: Reporting yourself: must be rejected <<<");

    console.log(`-> Alice attempts to report herself via POST /api/reports...`);
    const selfReportRes = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({
        reportedUserId: userA.id,
        reason: "spam",
        details: "Attempting to report myself",
      }),
    });
    const selfReportData = await selfReportRes.json();
    console.log(`Status: ${selfReportRes.status}`);
    console.log(`Body:`, JSON.stringify(selfReportData, null, 2));
    checkPrivacy(selfReportData, "Check 10: Self report attempt");

    const check10Pass = selfReportRes.status === 400 && selfReportData.message?.includes("Cannot report yourself");
    results[10] = { name: "Reporting yourself is rejected with 400 Bad Request", pass: check10Pass };
    console.log(`[CHECK 10 RESULT]: ${check10Pass ? "PASS" : "FAIL"}\n`);

    // Check 11: Rate limit: one user files 11 reports against 11 targets in a day; 11th rejected (limit 10/day).
    console.log(">>> CHECK 11: Rate limit: 10 reports allowed per day; 11th must be rejected (429 RATE_LIMITED) <<<");

    console.log(`-> Creating 11 throwaway target users (T1 to T11)...`);
    const rateTargets = [];
    for (let i = 1; i <= 11; i++) {
      const phoneNum = `+9198765434${(i + 6).toString().padStart(2, "0")}`;
      const targetUser = await createThrowawayUser(phoneNum, `RateTarget ${i}`, "Delhi", ["Design", "Product"], ["Yoga", "Travel"]);
      rateTargets.push(targetUser);
    }
    console.log(`Created 11 targets: phones ${rateTargets[0].phone} to ${rateTargets[10].phone}.`);

    console.log(`-> Reporter (User R) files 10 reports...`);
    let allFirst10Passed = true;
    for (let i = 0; i < 10; i++) {
      const rRes = await fetch(`${BASE_URL}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userR.token}`,
        },
        body: JSON.stringify({
          reportedUserId: rateTargets[i].id,
          reason: "spam",
          details: `Rate limit test report #${i + 1}`,
        }),
      });
      const rData = await rRes.json();
      if (rRes.status !== 201) {
        allFirst10Passed = false;
        console.error(`Report #${i + 1} failed with status ${rRes.status}:`, rData);
      }
      if (i === 0 || i === 9) {
        console.log(`Report #${i + 1} Status: ${rRes.status}`);
        console.log(`Report #${i + 1} Body:`, JSON.stringify(rData, null, 2));
      }
      checkPrivacy(rData, `Check 11: Report #${i + 1}`);
    }

    console.log(`-> Reporter (User R) attempts 11th report (expected: 429 RATE_LIMITED)...`);
    const eleventhReportRes = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userR.token}`,
      },
      body: JSON.stringify({
        reportedUserId: rateTargets[10].id,
        reason: "spam",
        details: "11th report exceeding daily limit",
      }),
    });
    const eleventhReportData = await eleventhReportRes.json();
    console.log(`Status: ${eleventhReportRes.status}`);
    console.log(`Body:`, JSON.stringify(eleventhReportData, null, 2));
    checkPrivacy(eleventhReportData, "Check 11: 11th report attempt");

    const check11Pass = allFirst10Passed && eleventhReportRes.status === 429 && eleventhReportData.error === "RATE_LIMITED";
    results[11] = { name: "Report rate limit: 10 succeed, 11th rejected with 429 RATE_LIMITED", pass: check11Pass };
    console.log(`[CHECK 11 RESULT]: ${check11Pass ? "PASS" : "FAIL"}\n`);

    // Check 12: GET /api/admin/reports without x-admin-key rejected; with key lists T's reports. Do NOT print key.
    console.log(">>> CHECK 12: GET /api/admin/reports without key rejected (401); with key lists T's reports <<<");

    console.log(`-> GET /api/admin/reports without x-admin-key header...`);
    const noKeyAdminRes = await fetch(`${BASE_URL}/api/admin/reports`);
    const noKeyAdminData = await noKeyAdminRes.json();
    console.log(`Status: ${noKeyAdminRes.status}`);
    console.log(`Body:`, JSON.stringify(noKeyAdminData, null, 2));
    checkPrivacy(noKeyAdminData, "Check 12: Admin reports without key");

    console.log(`-> GET /api/admin/reports with x-admin-key: [REDACTED]...`);
    const withKeyAdminRes = await fetch(`${BASE_URL}/api/admin/reports`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    const withKeyAdminData = await withKeyAdminRes.json();
    console.log(`Status: ${withKeyAdminRes.status}`);
    console.log(`Total reports count: ${withKeyAdminData.count}`);
    const tReports = (withKeyAdminData.reports || []).filter(
      (r) => r.reportedUser?.id?.toString() === userT.id || r.reportedUser?.name === "Throwaway Target"
    );
    console.log(`Reports found for Target (${userT.id}): ${tReports.length}`);
    if (tReports.length > 0) {
      console.log(`Sample Target report from admin:`, JSON.stringify(tReports[0], null, 2));
    }
    checkPrivacy(withKeyAdminData, "Check 12: Admin reports with key");

    const check12Pass = noKeyAdminRes.status === 401 && withKeyAdminRes.status === 200 && tReports.length >= 3;
    results[12] = { name: "GET /api/admin/reports rejected without key (401); lists T's reports with key", pass: check12Pass };
    console.log(`[CHECK 12 RESULT]: ${check12Pass ? "PASS" : "FAIL"}\n`);

    // Check 13: PATCH /api/admin/reports/:id can restore T to active. Assert T reappears in Discover,
    // and after restore, one NEW report from a 4th user must NOT re-hide the target.
    console.log(">>> CHECK 13: PATCH /api/admin/reports/:id restores T to active & 4th report does NOT re-hide T <<<");

    const reportToRestore = tReports[0];
    const reportId = reportToRestore?.id || reportToRestore?._id;
    console.log(`-> Admin restores user via PATCH /api/admin/reports/${reportId} (action: 'restore_user', status: 'reviewed_no_action')...`);

    const restoreRes = await fetch(`${BASE_URL}/api/admin/reports/${reportId}`, {
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
    console.log(`Status: ${restoreRes.status}`);
    console.log(`Body:`, JSON.stringify(restoreData, null, 2));
    checkPrivacy(restoreData, "Check 13: Admin restore response");

    tDoc = await User.findById(userT.id);
    console.log(`Target status in DB after restore: '${tDoc.status}'`);

    console.log(`-> Dave (Observer) calls GET /api/discover after Target is restored...`);
    const postRestoreDiscoverRes = await fetch(`${BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${userD.token}` },
    });
    const postRestoreDiscoverData = await postRestoreDiscoverRes.json();
    console.log(`Status: ${postRestoreDiscoverRes.status}`);
    const postRestoreTier1Names = (postRestoreDiscoverData.tier1 || []).map((u) => u.name);
    const postRestoreTier2Names = (postRestoreDiscoverData.tier2 || []).map((u) => u.name);
    const tReappeared = postRestoreTier1Names.includes("Throwaway Target") || postRestoreTier2Names.includes("Throwaway Target");
    console.log(`Target in Dave's Discover after restore? ${tReappeared} (Tier 1: [${postRestoreTier1Names.join(", ")}])`);
    checkPrivacy(postRestoreDiscoverData, "Check 13: Discover after restore");

    // NEW RESTORE SCENARIO (Problem B verification):
    // After auto-hide and admin restore_user, a 4th user (Dave) submits a new report on Target.
    // Assert: Dave's report is accepted, but Target MUST NOT be re-hidden.
    console.log(`-> Dave (4th user) submits a new report against Target after restore...`);
    const fourthUserReportRes = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userD.token}`,
      },
      body: JSON.stringify({
        reportedUserId: userT.id,
        reason: "spam",
        details: "New report from 4th user after admin restore",
      }),
    });
    const fourthUserReportData = await fourthUserReportRes.json();
    console.log(`Status: ${fourthUserReportRes.status}`);
    console.log(`Body:`, JSON.stringify(fourthUserReportData, null, 2));
    checkPrivacy(fourthUserReportData, "Check 13: 4th user report");

    const tDocAfterFourthReport = await User.findById(userT.id);
    console.log(`Target status in DB after 4th user's report: '${tDocAfterFourthReport.status}' (Expect: 'active', NOT 'hidden_pending_review')`);
    const targetDidNotRehide = tDocAfterFourthReport.status === "active";

    const check13Pass = restoreRes.status === 200 && tDoc.status === "active" && tReappeared && fourthUserReportRes.status === 201 && targetDidNotRehide;
    results[13] = { name: "Admin restore_user restores T to active; 4th report does NOT re-hide T", pass: check13Pass };
    console.log(`[CHECK 13 RESULT]: ${check13Pass ? "PASS" : "FAIL"}\n`);

    // ------------------------------------------------------------------------------------------------
    // PRIVACY SECTION (Check 14)
    // ------------------------------------------------------------------------------------------------
    console.log("====================================================================================================");
    console.log("PRIVACY AUDIT (Check 14)");
    console.log("====================================================================================================\n");

    console.log(`Total privacy checks performed across all test responses.`);
    console.log(`Privacy violations found: ${privacyViolations.length}`);
    if (privacyViolations.length > 0) {
      console.error("Violations detail:", JSON.stringify(privacyViolations, null, 2));
    } else {
      console.log("✅ Verified: None of dob, gender, authId, phone, or exact age were exposed in any response for other users.");
    }

    const check14Pass = privacyViolations.length === 0;
    results[14] = { name: "Every response contains none of dob, gender, authId, phone, exact age for other users", pass: check14Pass };
    console.log(`[CHECK 14 RESULT]: ${check14Pass ? "PASS" : "FAIL"}\n`);

  } catch (err) {
    console.error("FATAL SUITE ERROR:", err);
  } finally {
    // ------------------------------------------------------------------------------------------------
    // FINAL CLEANUP
    // ------------------------------------------------------------------------------------------------
    await cleanupThrowawayData();

    // PRINT SUMMARY TABLE
    console.log("====================================================================================================");
    console.log("FINAL PASS/FAIL TABLE — TRUST & SAFETY VERIFICATION");
    console.log("====================================================================================================");
    console.log("Check #  | Result | Description");
    console.log("---------|--------|---------------------------------------------------------------------------------");
    for (let i = 1; i <= 14; i++) {
      const res = results[i];
      const statusStr = res?.pass ? "PASS  " : "FAIL  ";
      const numStr = `Check ${i}`.padEnd(8, " ");
      console.log(`${numStr} | ${statusStr} | ${res?.name || "Not run"}`);
    }
    console.log("====================================================================================================\n");

    httpServer.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

runSafetyVerification();
