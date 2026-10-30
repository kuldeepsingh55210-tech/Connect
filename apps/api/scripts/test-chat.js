process.env.NODE_ENV = "test";
process.env.PORT = "4008";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { io: ClientIO } = require("socket.io-client");
const { app, httpServer, io } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User, Connection, Message } = require("../src/models");
const { RANGES, assertThrowaway, createThrowawayUser, cleanupThrowaway } = require("./lib/throwaway");

const BASE_URL = "http://localhost:4008";
const PHONES = RANGES.API_CHAT;
PHONES.forEach((p) => assertThrowaway(p));

const [PHONE_A, PHONE_B, PHONE_C] = PHONES;

async function runChatTests() {
  console.log("=== STARTING CHAT MODULE (REST + SOCKET.IO) TESTS (THROWAWAY USERS) ===\n");

  await connectDB();
  await cleanupThrowaway(PHONES);

  // Create clean throwaway users for this test
  const userA = await createThrowawayUser(PHONE_A, { name: "Chat User A", city: "Bangalore" });
  const userB = await createThrowawayUser(PHONE_B, { name: "Chat User B", city: "Bangalore" });
  const userC = await createThrowawayUser(PHONE_C, { name: "Chat User C", city: "Delhi" });

  // Start the server with Socket.io on port 4008
  await new Promise((resolve) => httpServer.listen(4008, resolve));
  console.log("[test-server] Running with Socket.io on port 4008\n");

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

    // Set up User A <-> User B connection as 'accepted'
    const pairAB = Connection.sortedPair(userA._id, userB._id);
    const connAB = await Connection.findOneAndUpdate(
      pairAB,
      {
        $set: {
          ...pairAB,
          initiatedBy: userA._id,
          status: "accepted",
          respondedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // Set up User A <-> User C connection as 'ignored'
    const pairAC = Connection.sortedPair(userA._id, userC._id);
    const connAC = await Connection.findOneAndUpdate(
      pairAC,
      {
        $set: {
          ...pairAC,
          initiatedBy: userC._id,
          status: "ignored",
          respondedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // --- 1. REST Send & Retrieve: User A sends to User B (Accepted) ---
    console.log("--- 1. REST: User A sends message to User B on accepted connection (Expect 201) ---");
    const sendRes = await fetch(`${BASE_URL}/api/connections/${connAB._id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ text: "Hey User B, let's collaborate on AI projects!" }),
    });
    const sendData = await sendRes.json();
    console.log(`Status: ${sendRes.status}`);
    console.log("Response:", JSON.stringify(sendData, null, 2));
    if (sendRes.status !== 201) {
      throw new Error(`Expected 201 for REST message send, got ${sendRes.status}`);
    }

    console.log("\n--- 1b. REST: User A fetches messages for accepted connection (Expect 200) ---");
    const getRes = await fetch(`${BASE_URL}/api/connections/${connAB._id}/messages`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authA.token}`,
      },
    });
    const getData = await getRes.json();
    console.log(`Status: ${getRes.status}`);
    console.log(`Total messages returned: ${getData.count}`);
    if (getRes.status !== 200 || getData.count !== 1) {
      throw new Error(`Expected 200 with 1 message, got status ${getRes.status}, count ${getData.count}`);
    }

    // --- 2. REST: Attempt send on ignored connection (Expect 403 Forbidden) ---
    console.log("\n--- 2. REST: Attempt send message on 'ignored' connection (Expect 403 Forbidden) ---");
    const rejectRes = await fetch(`${BASE_URL}/api/connections/${connAC._id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ text: "This should fail because status is ignored." }),
    });
    const rejectData = await rejectRes.json();
    console.log(`Status: ${rejectRes.status}`);
    console.log("Response:", JSON.stringify(rejectData, null, 2));
    if (rejectRes.status !== 403) {
      throw new Error(`Expected 403 for ignored connection send, got ${rejectRes.status}`);
    }

    // --- 3. Socket.io Real-time Messaging ---
    console.log("\n--- 3. Socket.io Real-time Messaging ---");

    const socketA = ClientIO("http://localhost:4008", {
      auth: { token: authA.token },
      transports: ["websocket"],
    });

    const socketB = ClientIO("http://localhost:4008", {
      auth: { token: authB.token },
      transports: ["websocket"],
    });

    await Promise.all([
      new Promise((resolve) => socketA.on("connect", resolve)),
      new Promise((resolve) => socketB.on("connect", resolve)),
    ]);
    console.log("Both client sockets connected successfully.");

    // Join room for connAB
    const joinResA = await new Promise((resolve) => {
      socketA.emit("thread:join", { connectionId: connAB._id.toString() }, resolve);
    });
    console.log("User A thread:join ack:", joinResA);

    const joinResB = await new Promise((resolve) => {
      socketB.emit("thread:join", { connectionId: connAB._id.toString() }, resolve);
    });
    console.log("User B thread:join ack:", joinResB);

    // Set up listener on User B's socket for message:new
    const messagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for message:new")), 5000);
      socketB.on("message:new", (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });

    // User A sends real-time message via socket
    console.log("User A emits message:send via socket...");
    const sendAck = await new Promise((resolve) => {
      socketA.emit(
        "message:send",
        {
          connectionId: connAB._id.toString(),
          text: "Real-time socket message from User A!",
        },
        resolve
      );
    });
    console.log("User A message:send ack:", sendAck);

    const receivedMessage = await messagePromise;
    console.log("User B received real-time 'message:new':", receivedMessage);
    if (receivedMessage.text !== "Real-time socket message from User A!") {
      throw new Error(`Received unexpected message text: ${receivedMessage.text}`);
    }

    // --- 4. Socket.io: Attempt to join ignored connection room (Expect Error) ---
    console.log("\n--- 4. Socket.io: User A attempts thread:join on 'ignored' connection ---");
    const joinIgnoredRes = await new Promise((resolve) => {
      socketA.emit("thread:join", { connectionId: connAC._id.toString() }, resolve);
    });
    console.log("User A thread:join on ignored connection ack:", joinIgnoredRes);
    if (joinIgnoredRes.status === "ok" || !joinIgnoredRes.error) {
      throw new Error(`Expected error for ignored room join, got ${JSON.stringify(joinIgnoredRes)}`);
    }

    // --- 5. Verify message persistence in DB ---
    console.log("\n--- 5. Verify Message History Persistence ---");
    const finalHistoryRes = await fetch(`${BASE_URL}/api/connections/${connAB._id}/messages`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const finalHistoryData = await finalHistoryRes.json();
    console.log(`Total messages in history for accepted connection: ${finalHistoryData.count}`);
    if (finalHistoryData.count !== 2) {
      throw new Error(`Expected 2 messages in history, got ${finalHistoryData.count}`);
    }

    // Disconnect sockets cleanly
    socketA.disconnect();
    socketB.disconnect();

    // --- 6. Socket Auth Rejection Tests ---
    console.log("\n--- 6. Socket Auth Rejection Tests ---");

    // a. Missing token
    const missingTokenSocket = ClientIO("http://localhost:4008", {
      transports: ["websocket"],
      reconnection: false,
    });
    const missingTokenErr = await new Promise((resolve) => {
      missingTokenSocket.on("connect_error", (err) => resolve(err.message));
      missingTokenSocket.on("connect", () => resolve("Connected unexpectedly"));
    });
    console.log("Missing token connection attempt result:", missingTokenErr);
    missingTokenSocket.disconnect();

    // b. Invalid token
    const invalidTokenSocket = ClientIO("http://localhost:4008", {
      auth: { token: "invalid_jwt_token_payload_xyz" },
      transports: ["websocket"],
      reconnection: false,
    });
    const invalidTokenErr = await new Promise((resolve) => {
      invalidTokenSocket.on("connect_error", (err) => resolve(err.message));
      invalidTokenSocket.on("connect", () => resolve("Connected unexpectedly"));
    });
    console.log("Invalid token connection attempt result:", invalidTokenErr);
    invalidTokenSocket.disconnect();

    const authRejectSuccess =
      missingTokenErr.includes("Authentication error") &&
      invalidTokenErr.includes("Authentication error");
    console.log(`- Socket auth rejection: ${authRejectSuccess ? "PASS" : "FAIL"}`);
    if (!authRejectSuccess) {
      throw new Error("Socket auth rejection failed");
    }

    console.log("\n=== ALL CHAT MODULE TESTS PASSED ===");
  } catch (err) {
    console.error("Test error:", err);
    hasError = true;
  } finally {
    try {
      await cleanupThrowaway(PHONES);
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    httpServer.close();
    await mongoose.disconnect();
    process.exit(hasError ? 1 : 0);
  }
}

runChatTests();
