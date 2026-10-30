/**
 * apps/mobile/scripts/test-read-receipts-flow.js
 *
 * End-to-end flow test for read receipts and unread counts.
 * Uses ONLY throwaway phones +919876543431 to +919876543433.
 *
 * Scenarios tested:
 * 1. Throwaway users A (+919876543431) and B (+919876543432) are created.
 * 2. A and B connect (A sends request, B accepts).
 * 3. A sends 2 messages to B.
 * 4. B's accepted list shows unreadCount = 2, lastMessagePreview matching msg 2, lastMessageIsMine = false.
 * 5. B's getUnreadCount (GET /api/connections/unread-count) returns total = 2.
 * 6. B calls markThreadRead (POST /api/connections/:id/read) -> returns { status: 'ok', readAt, count: 2 }.
 * 7. B's accepted list now shows unreadCount = 0.
 * 8. A's GET messages shows readAt timestamp set on both messages.
 * 9. B's getUnreadCount returns total = 0.
 *
 * Seed users are NEVER touched. All throwaways cleaned up at start and end (finally block).
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '4019';

const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../../api/.env') });

const mongoose = require('mongoose');
const { app, httpServer } = require('../../api/src/server');
const { connectDB } = require('../../api/src/db/connect');
const { User, Connection, Message } = require('../../api/src/models');

const PORT = 4019;
const BASE_URL = `http://localhost:${PORT}`;

const THROWAWAY_PHONES = [
  '+919876543431', // User A
  '+919876543432', // User B
  '+919876543433', // User C
];

async function cleanupThrowawayData() {
  console.log('[cleanup] Removing throwaway users (+919876543431..33) and associated data...');
  const users = await User.find({ authId: { $in: THROWAWAY_PHONES } });
  const userIds = users.map((u) => u._id);

  if (userIds.length > 0) {
    const connections = await Connection.find({
      $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
    });
    const connectionIds = connections.map((c) => c._id);

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
  console.log('[cleanup] Throwaway data cleaned up.\n');
}

async function loginAndActivateUser(phone, name, city, skills, interests) {
  // 1. dev-login
  const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  assert.strictEqual(loginRes.status, 200, `Dev login for ${phone} must succeed`);
  const loginData = await loginRes.json();
  const token = loginData.token;
  let user = loginData.user;

  // 2. If profile is not active, activate it
  if (!user.isProfileComplete && !user.profileCompleted) {
    const profileRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        city,
        dob: '1995-05-15',
        gender: 'male',
        skills,
        interests,
        intent: ['networking'],
        about: `Hello, I am ${name}`,
      }),
    });
    const profileData = await profileRes.json();
    if (profileRes.status !== 200 && profileRes.status !== 201) {
      throw new Error(`Profile activation for ${phone} failed (${profileRes.status}): ${JSON.stringify(profileData)}`);
    }
    user = profileData.profile || profileData.user || user;
  }

  const userId = (user.id || user._id || loginData.user.id || loginData.user._id).toString();
  return { token, user, userId };
}

async function run() {
  console.log('=== STARTING READ RECEIPTS & UNREAD BADGES FLOW TEST ===\n');
  console.log(`Using throwaway phones: ${THROWAWAY_PHONES.join(', ')}`);

  // Connect DB and start server
  await connectDB();
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Test API listening at ${BASE_URL}\n`);

  try {
    // 0. Initial cleanup
    await cleanupThrowawayData();

    // 1. Create and authenticate User A and User B
    console.log('1. Setting up throwaway users Alpha (A) and Beta (B)...');
    const userA = await loginAndActivateUser(
      '+919876543431',
      'Test Alpha',
      'Bangalore',
      ['AI', 'Backend Dev'],
      ['Reading', 'Travel']
    );
    const userB = await loginAndActivateUser(
      '+919876543432',
      'Test Beta',
      'Mumbai',
      ['Design', 'Frontend Dev'],
      ['Food', 'Music']
    );
    console.log(`  ✓ User A: ${userA.user.name} (${userA.userId})`);
    console.log(`  ✓ User B: ${userB.user.name} (${userB.userId})\n`);

    // 2. A and B connect
    console.log('2. A sends connection request to B, and B accepts...');
    const reqRes = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ toUserId: userB.userId }),
    });
    assert.strictEqual(reqRes.status, 201, 'Connection request from A must return 201');
    const reqData = await reqRes.json();
    const connectionId = (reqData.connection?._id || reqData.connection?.id || reqData.id).toString();

    // B accepts
    const acceptRes = await fetch(`${BASE_URL}/api/connections/${connectionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ action: 'accept' }),
    });
    assert.strictEqual(acceptRes.status, 200, 'Accept connection from B must return 200');
    console.log(`  ✓ Connection accepted. Connection ID: ${connectionId}\n`);

    // 3. A sends 2 messages to B
    console.log('3. User A sends 2 messages to User B...');
    const msg1Text = 'Hey Beta, welcome to ConnectLocal!';
    const msg2Text = 'Let us discuss our collaborative projects.';

    const msg1Res = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: msg1Text }),
    });
    assert.strictEqual(msg1Res.status, 201, 'Message 1 must return 201');

    const msg2Res = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: msg2Text }),
    });
    assert.strictEqual(msg2Res.status, 201, 'Message 2 must return 201');
    console.log('  ✓ User A sent 2 messages.\n');

    // 4. B's accepted list shows unreadCount 2 and a preview
    console.log("4. Fetching B's accepted connections list...");
    const connsBRes = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.strictEqual(connsBRes.status, 200);
    const connsB = await connsBRes.json();
    const threadForB = connsB.connections.find(
      (c) => (c.connectionId || c.id || c._id).toString() === connectionId
    );
    assert.ok(threadForB, 'Connection must exist in B accepted list');
    console.log(`  Thread unreadCount: ${threadForB.unreadCount}`);
    console.log(`  Thread lastMessagePreview: "${threadForB.lastMessagePreview}"`);
    console.log(`  Thread lastMessageIsMine: ${threadForB.lastMessageIsMine}`);

    assert.strictEqual(threadForB.unreadCount, 2, 'B unreadCount must be 2');
    assert.strictEqual(threadForB.lastMessagePreview, msg2Text, 'Preview must match last message');
    assert.strictEqual(threadForB.lastMessageIsMine, false, 'lastMessageIsMine must be false for B');
    assert.strictEqual(threadForB.dob, undefined, 'Privacy: dob must NOT be exposed');
    assert.strictEqual(threadForB.gender, undefined, 'Privacy: gender must NOT be exposed');
    assert.strictEqual(threadForB.authId, undefined, 'Privacy: authId must NOT be exposed');
    console.log("  ✓ B's accepted list correctly shows unreadCount: 2 and preview.\n");

    // 5. getUnreadCount for B = 2
    console.log('5. Calling GET /api/connections/unread-count for B...');
    const unreadCountBRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.strictEqual(unreadCountBRes.status, 200);
    const unreadCountB = await unreadCountBRes.json();
    console.log(`  Total unread count for B: ${unreadCountB.total}`);
    assert.strictEqual(unreadCountB.total, 2, 'Total unread count for B must be 2');
    console.log('  ✓ getUnreadCount for B is 2.\n');

    // 6. B calls markThreadRead
    console.log(`6. B calls markThreadRead (POST /api/connections/${connectionId}/read)...`);
    const markReadRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`,
      },
    });
    assert.strictEqual(markReadRes.status, 200, 'markThreadRead must return 200');
    const markReadData = await markReadRes.json();
    console.log(`  markThreadRead response:`, markReadData);
    assert.strictEqual(markReadData.status, 'ok');
    assert.strictEqual(markReadData.count, 2, 'Must have marked 2 messages read');
    assert.ok(markReadData.readAt, 'readAt timestamp must be returned');
    console.log('  ✓ markThreadRead marked 2 messages read.\n');

    // 7. B's unreadCount = 0
    console.log("7. Verifying B's accepted connection list has unreadCount = 0...");
    const connsBAfterRead = await fetch(`${BASE_URL}/api/connections?status=accepted`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    }).then((r) => r.json());
    const threadBAfter = connsBAfterRead.connections.find(
      (c) => (c.connectionId || c.id || c._id).toString() === connectionId
    );
    assert.strictEqual(threadBAfter.unreadCount, 0, 'B unreadCount must now be 0');
    console.log("  ✓ B's unreadCount is now 0.\n");

    // 8. A's GET messages shows readAt on both
    console.log(`8. Verifying A's message history shows readAt on both messages...`);
    const msgsARes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert.strictEqual(msgsARes.status, 200);
    const msgsA = await msgsARes.json();
    const messages = msgsA.messages || [];
    assert.strictEqual(messages.length, 2, 'Must have 2 messages in history');
    for (const m of messages) {
      console.log(`  Message "${m.text}": readAt = ${m.readAt}`);
      assert.ok(m.readAt, `Message "${m.text}" must have readAt timestamp set`);
      assert.strictEqual(typeof m.readAt, 'string');
    }
    console.log("  ✓ Both messages have readAt timestamps set for User A.\n");

    // 9. Total for B = 0
    console.log('9. Calling GET /api/connections/unread-count for B...');
    const unreadFinalRes = await fetch(`${BASE_URL}/api/connections/unread-count`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const unreadFinal = await unreadFinalRes.json();
    console.log(`  Final unread count for B: ${unreadFinal.total}`);
    assert.strictEqual(unreadFinal.total, 0, 'Total unread count for B must now be 0');
    console.log('  ✓ getUnreadCount for B is 0.\n');

    console.log('=== ALL FLOW TEST SCENARIOS PASSED SUCCESSFULLY! ===\n');
  } finally {
    // Cleanup throwaway data and stop server
    console.log('--- Cleaning up in finally block ---');
    await cleanupThrowawayData();
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
    console.log('--- Teardown complete ---');
  }
}

run().catch((err) => {
  console.error('Flow test failed:', err);
  process.exit(1);
});
