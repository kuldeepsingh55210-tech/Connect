/**
 * apps/mobile/scripts/test-notifications-unit.js
 *
 * Unit tests for Notifications pure helper functions:
 * 1. getNotificationText:
 *    - 'connect_request' with actor name -> "<name> wants to connect with you"
 *    - 'connect_request' without actor name -> "Someone wants to connect with you"
 *    - 'connection_accepted' with actor name -> "<name> accepted your request"
 *    - 'connection_accepted' without actor name -> "Someone accepted your request"
 *    - 'new_message' with actor name -> "New message from <name>"
 *    - 'new_message' without actor name -> "New message"
 *    - Unknown type fallback
 * 2. formatNotificationRelativeTime:
 *    - Under 60s -> "Just now"
 *    - Minutes -> "<N>m"
 *    - Hours -> "<N>h"
 *    - 1 day -> "Yesterday"
 *    - 2-6 days -> "<N>d"
 *    - 7+ days -> formatted month/day (e.g. "Oct 26")
 * 3. isNotificationUnread:
 *    - null / undefined readAt -> true
 *    - ISO timestamp readAt -> false
 * 4. getNotificationNavigationDecision:
 *    - 'connect_request' -> { action: 'requests' }
 *    - 'connection_accepted' when connection is accepted -> { action: 'chat', connection }
 *    - 'connection_accepted' when connection is not accepted -> { action: 'unavailable' }
 *    - 'new_message' when connection is accepted -> { action: 'chat', connection }
 *    - 'new_message' when connection is not accepted -> { action: 'unavailable' }
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

function loadNotificationsScreenExports() {
  const filePath = path.resolve(__dirname, '../src/screens/NotificationsScreen.tsx');
  const code = fs.readFileSync(filePath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  const ctx = vm.createContext({
    require: (id) => {
      if (id.includes('theme')) {
        return {
          COLORS: {
            secondary: '#5d5e66',
            zincBlack: '#18181b',
            primary: '#000000',
            surface: '#f9f9fa',
            surfaceContainerLowest: '#ffffff',
            surfaceContainerHigh: '#e8e8e9',
            surfaceContainerHighest: '#e2e2e3',
            border: '#e4e4e7',
            outline: '#77767b',
            outlineVariant: '#c8c5cb',
            onSurface: '#1a1c1d',
            onSurfaceVariant: '#47464b',
            zincMedium: '#71717a',
            zincLight: '#f4f4f5',
          },
          SPACING: { marginMobile: 16 },
          BORDER_RADIUS: { full: 9999 },
        };
      }
      return {
        Platform: { OS: 'ios' },
        StyleSheet: { create: (s) => s },
        Animated: { Value: function () {} },
        openChatForConnection: () => {},
        refreshNotificationUnread: () => {},
      };
    },
    module: moduleObj,
    exports: moduleObj.exports,
    console,
    Date,
    Math,
    setTimeout,
    clearTimeout,
  });

  vm.runInContext(js, ctx);
  return moduleObj.exports;
}

function runUnitTests() {
  console.log('=== STARTING NOTIFICATIONS UNIT TESTS ===\n');

  const {
    getNotificationText,
    formatNotificationRelativeTime,
    isNotificationUnread,
    getNotificationNavigationDecision,
  } = loadNotificationsScreenExports();

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  PASS: ${name}`);
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error(`        ${err.message}`);
      throw err;
    }
  }

  // --- 1. Notification text builder tests ---
  console.log('1. getNotificationText:');
  test('connect_request with actor name', () => {
    assert.strictEqual(
      getNotificationText('connect_request', 'Priya'),
      'Priya wants to connect with you'
    );
  });

  test('connect_request with missing actor name', () => {
    assert.strictEqual(
      getNotificationText('connect_request', ''),
      'Someone wants to connect with you'
    );
    assert.strictEqual(
      getNotificationText('connect_request', undefined),
      'Someone wants to connect with you'
    );
  });

  test('connection_accepted with actor name', () => {
    assert.strictEqual(
      getNotificationText('connection_accepted', 'Aarav'),
      'Aarav accepted your request'
    );
  });

  test('connection_accepted with missing actor name', () => {
    assert.strictEqual(
      getNotificationText('connection_accepted', null),
      'Someone accepted your request'
    );
  });

  test('new_message with actor name', () => {
    assert.strictEqual(
      getNotificationText('new_message', 'Neha'),
      'New message from Neha'
    );
  });

  test('new_message with missing actor name', () => {
    assert.strictEqual(
      getNotificationText('new_message', '   '),
      'New message'
    );
  });

  test('unknown type fallback', () => {
    assert.strictEqual(
      getNotificationText('custom_event', 'Rohan'),
      'Notification from Rohan'
    );
    assert.strictEqual(
      getNotificationText('custom_event', ''),
      'New notification'
    );
  });

  // --- 2. Relative time formatter tests ---
  console.log('\n2. formatNotificationRelativeTime:');
  const now = new Date('2026-10-26T12:00:00Z').getTime();

  test('under 60 seconds returns "Just now"', () => {
    const d = new Date(now - 30 * 1000).toISOString();
    assert.strictEqual(formatNotificationRelativeTime(d, now), 'Just now');
  });

  test('minutes returns "<N>m"', () => {
    const d2 = new Date(now - 2 * 60 * 1000).toISOString();
    assert.strictEqual(formatNotificationRelativeTime(d2, now), '2m');
    const d45 = new Date(now - 45 * 60 * 1000).toISOString();
    assert.strictEqual(formatNotificationRelativeTime(d45, now), '45m');
  });

  test('hours returns "<N>h"', () => {
    const d3h = new Date(now - 3 * 3600 * 1000).toISOString();
    assert.strictEqual(formatNotificationRelativeTime(d3h, now), '3h');
  });

  test('1 day returns "Yesterday"', () => {
    const d1d = new Date(now - 25 * 3600 * 1000).toISOString();
    assert.strictEqual(formatNotificationRelativeTime(d1d, now), 'Yesterday');
  });

  test('2 to 6 days returns "<N>d"', () => {
    const d4d = new Date(now - 4 * 86400 * 1000).toISOString();
    assert.strictEqual(formatNotificationRelativeTime(d4d, now), '4d');
  });

  test('older dates (7+ days) returns formatted date string', () => {
    const d10d = new Date(now - 10 * 86400 * 1000).toISOString();
    const formatted = formatNotificationRelativeTime(d10d, now);
    assert.ok(formatted.length > 0, 'Formatted string should not be empty');
    assert.notStrictEqual(formatted, 'Just now');
  });

  test('missing or invalid date returns empty string', () => {
    assert.strictEqual(formatNotificationRelativeTime(undefined, now), '');
    assert.strictEqual(formatNotificationRelativeTime('not-a-date', now), '');
  });

  // --- 3. isNotificationUnread tests ---
  console.log('\n3. isNotificationUnread:');
  test('null readAt is unread (true)', () => {
    assert.strictEqual(isNotificationUnread({ readAt: null }), true);
  });

  test('undefined readAt is unread (true)', () => {
    assert.strictEqual(isNotificationUnread({}), true);
  });

  test('set readAt ISO timestamp is read (false)', () => {
    assert.strictEqual(
      isNotificationUnread({ readAt: '2026-10-26T12:00:00.000Z' }),
      false
    );
  });

  // --- 4. getNotificationNavigationDecision tests ---
  console.log('\n4. getNotificationNavigationDecision:');
  const dummyAccepted = [
    {
      connectionId: 'conn-100',
      user: { id: 'u-1', name: 'Aarav', city: 'Bangalore' },
    },
    {
      connectionId: 'conn-200',
      user: { id: 'u-2', name: 'Neha', city: 'Delhi' },
    },
  ];

  test('connect_request always returns requests tab target', () => {
    const decision = getNotificationNavigationDecision(
      'connect_request',
      'conn-999',
      dummyAccepted
    );
    assert.strictEqual(decision.action, 'requests');
  });

  test('connection_accepted returns chat target when connection is in accepted list', () => {
    const decision = getNotificationNavigationDecision(
      'connection_accepted',
      'conn-100',
      dummyAccepted
    );
    assert.strictEqual(decision.action, 'chat');
    assert.strictEqual(decision.connection.connectionId, 'conn-100');
  });

  test('connection_accepted returns unavailable when connection is NOT in accepted list', () => {
    const decision = getNotificationNavigationDecision(
      'connection_accepted',
      'conn-not-found',
      dummyAccepted
    );
    assert.strictEqual(decision.action, 'unavailable');
  });

  test('new_message returns chat target when connection is in accepted list', () => {
    const decision = getNotificationNavigationDecision(
      'new_message',
      'conn-200',
      dummyAccepted
    );
    assert.strictEqual(decision.action, 'chat');
    assert.strictEqual(decision.connection.connectionId, 'conn-200');
  });

  test('new_message returns unavailable when connection is NOT in accepted list', () => {
    const decision = getNotificationNavigationDecision(
      'new_message',
      'conn-archived',
      dummyAccepted
    );
    assert.strictEqual(decision.action, 'unavailable');
  });

  console.log(`\nAll ${passed}/${total} notifications unit tests PASSED successfully.\n`);
}

runUnitTests();
