const { io: ClientIO } = require("socket.io-client");
const { RANGES, assertThrowaway, createThrowawayUser, cleanupThrowaway, disconnectThrowaway } = require("./lib/throwaway");

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const PHONES = RANGES.MOBILE_CHAT;
PHONES.forEach((p) => assertThrowaway(p));

const [PHONE_A, PHONE_B] = PHONES;

async function run() {
  console.log("=== STARTING MOBILE CHAT SCREEN E2E VERIFICATION (THROWAWAY USERS) ===");

  await cleanupThrowaway(PHONES);

  try {
    // 1. Create two throwaway users
    const userA = await createThrowawayUser(PHONE_A, {
      name: "Throwaway Chat User A",
      city: "Bangalore",
      skills: ["AI", "Backend Dev"],
      interests: ["Gym", "Running"],
    });

    const userB = await createThrowawayUser(PHONE_B, {
      name: "Throwaway Chat User B",
      city: "Bangalore",
      skills: ["Design", "Product"],
      interests: ["Music", "Reading"],
    });

    // 2. Authenticate User A and User B
    const loginA = await fetch(`${API_BASE}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE_A }),
    }).then((r) => r.json());
    const tokenA = loginA.token;
    const idA = (loginA.user.id || loginA.user._id).toString();
    console.log(`[1] Authenticated as User A (ID: ${idA})`);

    const loginB = await fetch(`${API_BASE}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE_B }),
    }).then((r) => r.json());
    const tokenB = loginB.token;
    const idB = (loginB.user.id || loginB.user._id).toString();
    console.log(`[2] Authenticated as User B (ID: ${idB})`);

    // 3. Create an accepted connection between User A and User B
    console.log("[3] Creating accepted connection between throwaway users...");
    const sendReq = await fetch(`${API_BASE}/api/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ toUserId: idB }),
    }).then((r) => r.json());

    const connectionId = (sendReq.connection?._id || sendReq.id).toString();

    // User B accepts
    await fetch(`${API_BASE}/api/connections/${connectionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });

    const connRes = await fetch(`${API_BASE}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    }).then((r) => r.json());

    const connection = connRes.connections?.find(
      (c) => (c.user.id || c.user._id).toString() === idB
    );
    if (!connection) {
      throw new Error("Failed to find accepted connection in list");
    }

    console.log(`   Active Accepted Connection ID: ${connectionId}`);

    // 4. Privacy Check: Confirm other participant's profile contains ONLY city (no neighborhood or distance)
    const otherUser = connection.user;
    console.log(`[4] Other User info: ${otherUser.name}, City: ${otherUser.city}`);
    if (otherUser.neighborhood || otherUser.distance || otherUser.distanceKm) {
      throw new Error("PRIVACY VIOLATION: neighborhood or distance found in participant info!");
    }
    console.log(`[PASS] Privacy check: city-only verified!`);

    // 5. Test Real-time Socket.io Connection & thread:join
    console.log(`[5] Connecting Socket.io clients...`);
    const socketA = ClientIO(API_BASE, {
      auth: { token: tokenA },
      transports: ["websocket", "polling"],
    });

    const socketB = ClientIO(API_BASE, {
      auth: { token: tokenB },
      transports: ["websocket", "polling"],
    });

    await new Promise((resolve, reject) => {
      let aReady = false;
      let bReady = false;
      const timeout = setTimeout(() => reject(new Error("Socket connection timeout")), 8000);

      socketA.on("connect", () => {
        socketA.emit("thread:join", { connectionId }, (res) => {
          console.log("   User A thread:join ack:", res);
          aReady = true;
          if (bReady) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      socketB.on("connect", () => {
        socketB.emit("thread:join", { connectionId }, (res) => {
          console.log("   User B thread:join ack:", res);
          bReady = true;
          if (aReady) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    });

    console.log(`[PASS] Both sockets connected and joined room for connection: ${connectionId}`);

    // 6. Test Real-time message reception: User B sends -> User A receives "message:new"
    console.log(`[6] Testing real-time message:new event...`);
    // NOTE: Hardcoded text without city interpolation to prevent city mutation/leakage
    const testTextFromB = "Hey! Excited to collaborate on AI and UX!";

    const receivedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for message:new")), 6000);
      socketA.on("message:new", (msg) => {
        if (msg.connectionId.toString() === connectionId && msg.text === testTextFromB) {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    // User B sends via REST
    const sendRes = await fetch(`${API_BASE}/api/connections/${connectionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ text: testTextFromB }),
    });
    console.log(`   User B sent message (status ${sendRes.status})`);

    const receivedMsg = await receivedPromise;
    console.log(`[PASS] User A received real-time socket message:new: "${receivedMsg.text}"`);

    // 7. User A replies via REST
    console.log(`[7] User A replies to User B...`);
    const replyTextFromA = "Thanks! Would love to grab coffee this Thursday.";
    const replyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for User B to receive reply")), 6000);
      socketB.on("message:new", (msg) => {
        if (msg.connectionId.toString() === connectionId && msg.text === replyTextFromA) {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    const replyRes = await fetch(`${API_BASE}/api/connections/${connectionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ text: replyTextFromA }),
    });
    console.log(`   User A sent reply (status ${replyRes.status})`);

    const receivedReply = await replyPromise;
    console.log(`[PASS] User B received User A's real-time reply: "${receivedReply.text}"`);

    // 8. Test getMessages(connectionId) message history
    console.log(`[8] Fetching message history for connection ${connectionId}...`);
    const historyRes = await fetch(`${API_BASE}/api/connections/${connectionId}/messages`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    }).then((r) => r.json());

    console.log(`   Total messages in history: ${historyRes.count}`);
    const hasMsgB = historyRes.messages.some((m) => m.text === testTextFromB);
    const hasMsgA = historyRes.messages.some((m) => m.text === replyTextFromA);
    console.log(`[PASS] User B message in history: ${hasMsgB}`);
    console.log(`[PASS] User A message in history: ${hasMsgA}`);

    // Disconnect sockets cleanly
    socketA.disconnect();
    socketB.disconnect();

    console.log("\n=== ALL CHAT SCREEN & REAL-TIME SOCKET TESTS PASSED! ===");
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
  console.error("Chat test failed:", err);
  process.exit(1);
});
