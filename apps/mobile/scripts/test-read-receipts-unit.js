/**
 * Unit tests for ChatScreen read receipts and reconcile helpers:
 * 1. applyReadReceipt (marks only MY unread messages; ignores readerId === me; ignores another connectionId)
 * 2. getMessageTickState (null readAt -> single, set readAt -> double, temp -> single)
 * 3. getLastReadMyMessageId ("Seen" label chooses the LAST of my messages with readAt)
 * 4. reconcileSocketMessage and reconcileRestMessage keep readAt
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

function loadChatScreenExports() {
  const filePath = path.resolve(__dirname, '../src/screens/ChatScreen.tsx');
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
      };
    },
    module: moduleObj,
    exports: moduleObj.exports,
    console,
    Date,
    Set,
    Array,
    Object,
    Boolean,
    String,
    Number,
    setTimeout,
    clearTimeout,
  });

  vm.runInContext(js, ctx);
  return moduleObj.exports;
}

function runUnitTests() {
  console.log('=== STARTING CHAT READ RECEIPTS & RECONCILE UNIT TESTS ===\n');

  const {
    applyReadReceipt,
    getMessageTickState,
    getLastReadMyMessageId,
    reconcileSocketMessage,
    reconcileRestMessage,
  } = loadChatScreenExports();

  assert.strictEqual(typeof applyReadReceipt, 'function', 'applyReadReceipt must be exported');
  assert.strictEqual(typeof getMessageTickState, 'function', 'getMessageTickState must be exported');
  assert.strictEqual(typeof getLastReadMyMessageId, 'function', 'getLastReadMyMessageId must be exported');
  assert.strictEqual(typeof reconcileSocketMessage, 'function', 'reconcileSocketMessage must be exported');
  assert.strictEqual(typeof reconcileRestMessage, 'function', 'reconcileRestMessage must be exported');

  const myId = 'user-me-123';
  const otherId = 'user-other-456';
  const connId = 'conn-abc-789';

  // -------------------------------------------------------------
  // Test 1: applyReadReceipt
  // -------------------------------------------------------------
  console.log('--- 1. Testing applyReadReceipt ---');

  const sampleMessages = [
    { id: 'm1', senderId: myId, text: 'Hey there', readAt: null },
    { id: 'm2', senderId: otherId, text: 'Hello back', readAt: null },
    { id: 'm3', senderId: myId, text: 'Already read earlier', readAt: '2026-10-25T08:00:00.000Z' },
    { id: 'm4', senderId: myId, text: 'Second unread message', readAt: null },
  ];

  const readAtTimestamp = '2026-10-26T12:30:00.000Z';

  // 1a: Marks ONLY my unread messages when other user reads
  const receiptEvent = { connectionId: connId, readerId: otherId, readAt: readAtTimestamp };
  const updated = applyReadReceipt(sampleMessages, receiptEvent, myId, connId);

  assert.strictEqual(updated.length, 4, 'Message count must remain identical');
  assert.strictEqual(updated[0].readAt, readAtTimestamp, 'My first unread message must be marked read');
  assert.strictEqual(updated[1].readAt, null, "Other user's message must NOT have readAt set");
  assert.strictEqual(updated[2].readAt, '2026-10-25T08:00:00.000Z', 'Previously read message keeps original timestamp');
  assert.strictEqual(updated[3].readAt, readAtTimestamp, 'My second unread message must be marked read');
  console.log('  ✓ (1a) applyReadReceipt marks only MY unread messages and preserves previously read timestamps');

  // 1b: Ignores readerId === myId (e.g. self-echo from REST markThreadRead)
  const selfEvent = { connectionId: connId, readerId: myId, readAt: readAtTimestamp };
  const afterSelfEvent = applyReadReceipt(sampleMessages, selfEvent, myId, connId);
  assert.strictEqual(afterSelfEvent, sampleMessages, 'Must return identical messages reference when readerId === myId');
  assert.strictEqual(afterSelfEvent[0].readAt, null, 'Messages must remain untouched on self-receipt');
  console.log('  ✓ (1b) applyReadReceipt ignores events where readerId === me');

  // 1c: Ignores event for a different connectionId
  const otherConnEvent = { connectionId: 'different-conn-999', readerId: otherId, readAt: readAtTimestamp };
  const afterOtherConn = applyReadReceipt(sampleMessages, otherConnEvent, myId, connId);
  assert.strictEqual(afterOtherConn, sampleMessages, 'Must return identical messages reference for different connectionId');
  console.log('  ✓ (1c) applyReadReceipt ignores events for a different connectionId');

  // 1d: Gracefully handles missing/malformed payload
  const malformed1 = applyReadReceipt(sampleMessages, null, myId, connId);
  const malformed2 = applyReadReceipt(sampleMessages, {}, myId, connId);
  assert.strictEqual(malformed1, sampleMessages);
  assert.strictEqual(malformed2, sampleMessages);
  console.log('  ✓ (1d) applyReadReceipt handles malformed events safely');

  // -------------------------------------------------------------
  // Test 2: getMessageTickState
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing getMessageTickState ---');

  // 2a: Other user's message -> no ticks
  const otherMsg = { id: 'm-other', senderId: otherId, text: 'Hi', readAt: null };
  const tickOther = getMessageTickState(otherMsg, false);
  assert.strictEqual(tickOther.showTick, false, 'Other user message must NOT show ticks');
  console.log('  ✓ (2a) Incoming messages do not show ticks');

  // 2b: My message with readAt: null -> single tick (checkmark, secondary color)
  const unreadMsg = { id: 'm-mine-1', senderId: myId, text: 'Hi', readAt: null };
  const tickUnread = getMessageTickState(unreadMsg, true);
  assert.strictEqual(tickUnread.showTick, true, 'My message must show tick');
  assert.strictEqual(tickUnread.isDouble, false, 'Unread message must NOT have double tick');
  assert.strictEqual(tickUnread.iconName, 'checkmark', 'Unread message must use checkmark icon');
  assert.strictEqual(tickUnread.color, '#5d5e66', 'Unread message must use secondary color');
  console.log('  ✓ (2b) Unread message (null readAt) shows single checkmark with secondary color');

  // 2c: My message with readAt: timestamp -> double tick (checkmark-done, #18181B)
  const readMsg = { id: 'm-mine-2', senderId: myId, text: 'Hi', readAt: '2026-10-26T12:00:00Z' };
  const tickRead = getMessageTickState(readMsg, true);
  assert.strictEqual(tickRead.showTick, true, 'My message must show tick');
  assert.strictEqual(tickRead.isDouble, true, 'Read message must have double tick');
  assert.strictEqual(tickRead.iconName, 'checkmark-done', 'Read message must use checkmark-done icon');
  assert.strictEqual(tickRead.color, '#18181B', 'Read message must use #18181B primary dark color');
  console.log('  ✓ (2c) Read message (set readAt) shows double checkmark-done with #18181B');

  // 2d: Optimistic temp message (temp-*) -> single tick even if readAt is passed
  const tempMsg = { id: 'temp-1710000000000', senderId: myId, text: 'Hi', readAt: '2026-10-26T12:00:00Z' };
  const tickTemp = getMessageTickState(tempMsg, true);
  assert.strictEqual(tickTemp.showTick, true, 'Temp message must show tick');
  assert.strictEqual(tickTemp.isDouble, false, 'Optimistic temp message must NEVER show double tick');
  assert.strictEqual(tickTemp.iconName, 'checkmark', 'Optimistic temp message must use single checkmark icon');
  console.log('  ✓ (2d) Optimistic temp- messages always show single checkmark');

  // -------------------------------------------------------------
  // Test 3: getLastReadMyMessageId ("Seen" label)
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing getLastReadMyMessageId ("Seen" selection) ---');

  const thread = [
    { id: 'm1', senderId: myId, text: 'Msg 1', readAt: '2026-10-26T10:00:00Z' },
    { id: 'm2', senderId: otherId, text: 'Msg 2', readAt: '2026-10-26T10:01:00Z' },
    { id: 'm3', senderId: myId, text: 'Msg 3', readAt: '2026-10-26T10:05:00Z' },
    { id: 'm4', senderId: otherId, text: 'Msg 4', readAt: null },
    { id: 'm5', senderId: myId, text: 'Msg 5 unread', readAt: null },
  ];

  // 3a: Chooses m3 (last of MY messages that has readAt)
  const lastReadId = getLastReadMyMessageId(thread, myId);
  assert.strictEqual(lastReadId, 'm3', 'Must select m3 as the LAST read message from me');
  console.log('  ✓ (3a) getLastReadMyMessageId returns m3 (the last of my messages with readAt set)');

  // 3b: When no messages from me have readAt, returns null
  const unreadThread = [
    { id: 'm1', senderId: myId, text: 'Msg 1', readAt: null },
    { id: 'm2', senderId: otherId, text: 'Msg 2', readAt: '2026-10-26T10:00:00Z' },
    { id: 'm3', senderId: myId, text: 'Msg 3', readAt: null },
  ];
  assert.strictEqual(getLastReadMyMessageId(unreadThread, myId), null, 'Must return null when none of my messages are read');
  console.log('  ✓ (3b) Returns null when none of my messages have readAt set');

  // 3c: Ignores temp- messages
  const threadWithTemp = [
    { id: 'm1', senderId: myId, text: 'Msg 1', readAt: '2026-10-26T10:00:00Z' },
    { id: 'temp-2', senderId: myId, text: 'Msg 2', readAt: '2026-10-26T10:05:00Z' },
  ];
  assert.strictEqual(getLastReadMyMessageId(threadWithTemp, myId), 'm1', 'Must ignore temp messages for Seen label');
  console.log('  ✓ (3c) Ignores optimistic temp- messages');

  // -------------------------------------------------------------
  // Test 4: Reconcile helpers keep readAt
  // -------------------------------------------------------------
  console.log('\n--- 4. Testing reconcile helpers preserve readAt ---');

  // 4a: reconcileSocketMessage replaces pending temp message and keeps readAt
  const prevWithTemp = [
    { id: 'm0', senderId: otherId, text: 'Previous msg' },
    { id: 'temp-123', senderId: myId, text: 'Hey are you free?', readAt: null },
  ];

  const socketMsgFromMe = {
    id: 'real-999',
    senderId: myId,
    text: 'Hey are you free?',
    readAt: '2026-10-26T14:00:00.000Z',
  };

  const afterSocket = reconcileSocketMessage(prevWithTemp, socketMsgFromMe, myId);
  assert.strictEqual(afterSocket.length, 2, 'Must replace temp message with socket echo, not duplicate');
  assert.strictEqual(afterSocket[1].id, 'real-999', 'Replaced message must have real-999 ID');
  assert.strictEqual(afterSocket[1].readAt, '2026-10-26T14:00:00.000Z', 'Must preserve readAt from socket echo');
  console.log('  ✓ (4a) reconcileSocketMessage replaces temp message and preserves readAt from server');

  // 4b: reconcileRestMessage replaces temp message and preserves readAt
  const restSavedMsg = {
    id: 'real-888',
    senderId: myId,
    text: 'Coffee tomorrow?',
    readAt: null,
  };
  const prevForRest = [
    { id: 'temp-456', senderId: myId, text: 'Coffee tomorrow?', readAt: null },
  ];
  const afterRest = reconcileRestMessage(prevForRest, restSavedMsg, 'temp-456');
  assert.strictEqual(afterRest.length, 1);
  assert.strictEqual(afterRest[0].id, 'real-888');
  assert.strictEqual(afterRest[0].readAt, null);

  // 4c: reconcileRestMessage when socket arrived first (real ID already in state)
  // Ensures the temp message is removed without wiping the socket's readAt
  const prevSocketFirst = [
    { id: 'real-777', senderId: myId, text: 'Great!', readAt: '2026-10-26T15:00:00.000Z' },
    { id: 'temp-777', senderId: myId, text: 'Great!', readAt: null },
  ];
  const restArrivedLate = { id: 'real-777', senderId: myId, text: 'Great!', readAt: null };
  const afterLateRest = reconcileRestMessage(prevSocketFirst, restArrivedLate, 'temp-777');
  assert.strictEqual(afterLateRest.length, 1, 'Must remove temp message when real message already exists');
  assert.strictEqual(afterLateRest[0].id, 'real-777');
  assert.strictEqual(afterLateRest[0].readAt, '2026-10-26T15:00:00.000Z', 'Must retain socket readAt without being overwritten by REST null');
  console.log('  ✓ (4b & 4c) reconcileRestMessage preserves readAt when socket arrives first or REST resolves');

  console.log('\n=== ALL CHAT READ RECEIPTS & RECONCILE UNIT TESTS PASSED! ===');
}

runUnitTests();
