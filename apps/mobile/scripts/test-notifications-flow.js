/**
 * apps/mobile/scripts/test-notifications-flow.js
 *
 * E2E integration test for In-App Notifications using mobile api.ts typed helpers.
 * Uses ONLY throwaway phones +919876543451 to +919876543453.
 *
 * Scenarios tested:
 * 1. Throwaway users A (+919876543451), B (+919876543452), C (+919876543453) created & activated.
 * 2. A connects to B -> B's list has 1 connect_request and unreadCount = 1.
 * 3. B accepts -> A has 1 connection_accepted notification and unreadCount = 1.
 * 4. A sends messages to B -> B has ONE new_message notification (upserted).
 * 5. C connects to B -> B's unread count increases.
 * 6. markNotificationRead updates unread count.
 * 7. markAllNotificationsRead resets unread count to 0.
 * 8. Pagination via `before` returns remainder of notifications.
 *
 * Never touches seed users. Thorough cleanup at start and in finally block.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '4025';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const ts = require('typescript');
const vm = require('vm');
require('dotenv').config({ path: path.join(__dirname, '../../api/.env') });

const mongoose = require('mongoose');
const { httpServer } = require('../../api/src/server');
const { connectDB } = require('../../api/src/db/connect');
const { User, Connection, Message, Notification } = require('../../api/src/models');

const PORT = 4025;
const BASE_URL = `http://localhost:${PORT}`;

const THROWAWAY_PHONES = [
  '+919876543451', // User A
  '+919876543452', // User B
  '+919876543453', // User C
];

function loadApiModule(baseUrl) {
  const filePath = path.resolve(__dirname, '../src/services/api.ts');
  const code = fs.readFileSync(filePath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  const ctx = vm.createContext({
    require: (id) => {
      if (id === 'react-native') {
        return { Platform: { OS: 'web' } };
      }
      return require(id);
    },
    process: {
      env: {
        EXPO_PUBLIC_API_URL: baseUrl,
      },
    },
    fetch: global.fetch,
    URLSearchParams: global.URLSearchParams,
    module: moduleObj,
    exports: moduleObj.exports,
    console,
    Date,
  });

  vm.runInContext(js, ctx);
  return moduleObj.exports;
}

async function cleanupThrowawayData() {
  console.log('[cleanup] Removing throwaway users (+919876543451..53) and associated data...');
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

    await Notification.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        { actorId: { $in: userIds } },
        { connectionId: { $in: connectionIds } },
      ],
    });

    await Connection.deleteMany({ _id: { $in: connectionIds } });
    await User.deleteMany({ _id: { $in: userIds } });
  }

  await User.deleteMany({ authId: { $in: THROWAWAY_PHONES } });
  console.log('[cleanup] Throwaway data cleaned up.\n');
}

async function loginAndActivateUser(phone, name, city, skills, interests) {
  const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  assert.strictEqual(loginRes.status, 200, `Dev login for ${phone} must succeed`);
  const loginData = await loginRes.json();
  const token = loginData.token;
  let user = loginData.user;

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
        dob: '1996-08-20',
        gender: 'female',
        skills,
        interests,
        intent: ['networking'],
        about: `Hello, I am ${name} from ${city}`,
      }),
    });
    const profileData = await profileRes.json();
    if (profileRes.status !== 200 && profileRes.status !== 201) {
      throw new Error(`Profile activation for ${phone} failed: ${JSON.stringify(profileData)}`);
    }
    user = profileData.profile || profileData.user || user;
  }

  const userId = (user.id || user._id || loginData.user.id || loginData.user._id).toString();
  return { token, user, userId, name, city };
}

async function run() {
  console.log('=== STARTING NOTIFICATIONS FLOW TEST ===\n');
  console.log(`Using throwaway phones: ${THROWAWAY_PHONES.join(', ')}`);

  await connectDB();
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Test API listening at ${BASE_URL}\n`);

  const api = loadApiModule(BASE_URL);

  try {
    // 0. Initial cleanup
    await cleanupThrowawayData();

    // 1. Create throwaway users A, B, C
    console.log('1. Creating throwaway users A, B, and C...');
    const userA = await loginAndActivateUser(
      '+919876543451',
      'User Alpha',
      'Delhi',
      ['AI', 'Backend Dev'],
      ['Music', 'Reading']
    );
    const userB = await loginAndActivateUser(
      '+919876543452',
      'User Beta',
      'Delhi',
      ['Frontend Dev', 'Design'],
      ['Travel', 'Food']
    );
    const userC = await loginAndActivateUser(
      '+919876543453',
      'User Gamma',
      'Delhi',
      ['Data', 'AI'],
      ['Travel', 'Music']
    );

    console.log(`  ✓ User A: ${userA.name} (${userA.userId})`);
    console.log(`  ✓ User B: ${userB.name} (${userB.userId})`);
    console.log(`  ✓ User C: ${userC.name} (${userC.userId})\n`);

    // 2. A connects to B -> B's list has 1 connect_request and unread 1
    console.log('2. User A sends connection request to User B...');
    const reqRes = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ toUserId: userB.userId }),
    });
    assert.strictEqual(reqRes.status, 201, 'Connection request must return 201');
    const reqData = await reqRes.json();
    const connectionId = (reqData.connection?._id || reqData.connection?.id || reqData.id).toString();

    // Verify User B's notifications via api.ts helpers
    api.setAuthToken(userB.token);
    const unreadCountB1 = await api.getNotificationUnreadCount();
    console.log(`  ✓ B getNotificationUnreadCount: ${unreadCountB1.total}`);
    assert.strictEqual(unreadCountB1.total, 1, 'User B unread notification count must be 1');

    const notifsB1 = await api.getNotifications({ limit: 30 });
    console.log(`  ✓ B getNotifications count: ${notifsB1.notifications.length}`);
    assert.strictEqual(notifsB1.notifications.length, 1, "B must have 1 notification");
    const nB1 = notifsB1.notifications[0];
    assert.strictEqual(nB1.type, 'connect_request', 'Notification type must be connect_request');
    assert.strictEqual(nB1.readAt, null, 'Notification readAt must be null initially');
    assert.strictEqual(nB1.actor.id.toString(), userA.userId, 'Actor must be User A');
    assert.strictEqual(nB1.actor.name, userA.name, 'Actor name must match');
    assert.strictEqual(nB1.actor.city, userA.city, 'Actor city must match');
    // Privacy check
    assert.strictEqual(nB1.actor.dob, undefined, 'Actor dob must not be exposed');
    assert.strictEqual(nB1.actor.gender, undefined, 'Actor gender must not be exposed');
    assert.strictEqual(nB1.actor.authId, undefined, 'Actor authId must not be exposed');
    assert.strictEqual(nB1.actor.phone, undefined, 'Actor phone must not be exposed');
    console.log('  ✓ Verified connect_request notification and privacy guarantees.\n');

    // 3. B accepts -> A has connection_accepted notification and unreadCount = 1
    console.log('3. User B accepts connection request...');
    const acceptRes = await fetch(`${BASE_URL}/api/connections/${connectionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`,
      },
      body: JSON.stringify({ action: 'accept' }),
    });
    assert.strictEqual(acceptRes.status, 200, 'Accept connection must return 200');

    // Verify User A's notifications via api.ts helpers
    api.setAuthToken(userA.token);
    const unreadCountA1 = await api.getNotificationUnreadCount();
    console.log(`  ✓ A getNotificationUnreadCount: ${unreadCountA1.total}`);
    assert.strictEqual(unreadCountA1.total, 1, 'User A unread notification count must be 1');

    const notifsA1 = await api.getNotifications({ limit: 30 });
    console.log(`  ✓ A getNotifications count: ${notifsA1.notifications.length}`);
    assert.strictEqual(notifsA1.notifications.length, 1, 'A must have 1 notification');
    const nA1 = notifsA1.notifications[0];
    assert.strictEqual(nA1.type, 'connection_accepted', 'Notification type must be connection_accepted');
    assert.strictEqual(nA1.readAt, null, 'Notification readAt must be null initially');
    assert.strictEqual(nA1.actor.id.toString(), userB.userId, 'Actor must be User B');
    console.log('  ✓ Verified connection_accepted notification.\n');

    // 4. A sends a message -> B has ONE new_message notification
    console.log('4. User A sends 2 messages to User B...');
    const send1 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: 'Hello Beta! First message.' }),
    });
    assert.strictEqual(send1.status, 201);

    const send2 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`,
      },
      body: JSON.stringify({ text: 'Second message right after!' }),
    });
    assert.strictEqual(send2.status, 201);

    api.setAuthToken(userB.token);
    const notifsB2 = await api.getNotifications({ limit: 30 });
    const messageNotifs = notifsB2.notifications.filter((n) => n.type === 'new_message');
    console.log(`  ✓ B has ${messageNotifs.length} new_message notification(s)`);
    assert.strictEqual(messageNotifs.length, 1, 'User B must have exactly ONE unread new_message notification');
    assert.strictEqual(messageNotifs[0].actor.id.toString(), userA.userId);
    console.log('  ✓ Verified message notification upsert behavior.\n');

    // 5. User C sends connection request to User B so B has multiple unread notifications
    console.log('5. User C sends connection request to User B...');
    const reqCRes = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userC.token}`,
      },
      body: JSON.stringify({ toUserId: userB.userId }),
    });
    assert.strictEqual(reqCRes.status, 201);

    api.setAuthToken(userB.token);
    const unreadCountB3 = await api.getNotificationUnreadCount();
    console.log(`  ✓ B unread count with 2 unread notifications: ${unreadCountB3.total}`);
    assert.strictEqual(unreadCountB3.total, 2, 'User B must have 2 unread notifications');

    // 6. Test markNotificationRead updates unread count
    console.log('6. Testing markNotificationRead on one notification...');
    const notifsB3 = await api.getNotifications({ limit: 30 });
    const targetToMark = notifsB3.notifications.find((n) => n.readAt === null);
    assert.ok(targetToMark, 'Must find an unread notification');

    const markSingleRes = await api.markNotificationRead(targetToMark.id);
    console.log(`  ✓ markNotificationRead result status: ${markSingleRes.status}`);
    assert.strictEqual(markSingleRes.status, 'ok', "markNotificationRead must return status 'ok'");

    const unreadCountB4 = await api.getNotificationUnreadCount();
    console.log(`  ✓ B unread count after marking 1 notification: ${unreadCountB4.total}`);
    assert.strictEqual(unreadCountB4.total, 1, 'User B unread count must decrease to 1');
    console.log('  ✓ Verified markNotificationRead.\n');

    // 7. Test markAllNotificationsRead updates unread count to 0
    console.log('7. Testing markAllNotificationsRead...');
    const markAllRes = await api.markAllNotificationsRead();
    console.log(`  ✓ markAllNotificationsRead result count: ${markAllRes.count}`);
    assert.strictEqual(markAllRes.count, 1, 'markAllNotificationsRead must return count = 1');

    const unreadCountB5 = await api.getNotificationUnreadCount();
    console.log(`  ✓ B unread count after markAllNotificationsRead: ${unreadCountB5.total}`);
    assert.strictEqual(unreadCountB5.total, 0, 'User B unread count must now be 0');
    console.log('  ✓ Verified markAllNotificationsRead.\n');

    // 8. Test pagination via `before` returns the remainder
    console.log('8. Testing pagination via `before` parameter...');
    const page1 = await api.getNotifications({ limit: 1 });
    assert.strictEqual(page1.notifications.length, 1, 'Page 1 must return 1 item');
    const firstItem = page1.notifications[0];
    const cursor = firstItem.createdAt;

    const page2 = await api.getNotifications({ limit: 10, before: cursor });
    console.log(`  ✓ Page 2 with before=${cursor} returned ${page2.notifications.length} item(s)`);
    assert.ok(page2.notifications.length >= 1, 'Page 2 must return remainder of notifications');
    for (const item of page2.notifications) {
      assert.ok(
        new Date(item.createdAt).getTime() < new Date(cursor).getTime(),
        'Page 2 items must be strictly older than the before cursor'
      );
      assert.notStrictEqual(item.id, firstItem.id, 'Page 2 items must not include the cursor item');
    }
    console.log('  ✓ Verified pagination via `before` cursor.\n');

    console.log('=== ALL NOTIFICATIONS FLOW TESTS PASSED SUCCESSFULLY! ===\n');
  } finally {
    console.log('Cleaning up in finally block...');
    await cleanupThrowawayData();
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.connection.close();
    console.log('Test teardown complete.');
  }
}

run().catch((err) => {
  console.error('\nFLOW TEST FAILED with error:');
  console.error(err);
  process.exit(1);
});
