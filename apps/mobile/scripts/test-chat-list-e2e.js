const assert = require('assert');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const PRIYA_PHONE = '+919876543215'; // Priya Sharma

async function runChatListTest() {
  console.log('=== STARTING CHAT TAB & CONVERSATIONS LIST VERIFICATION ===\n');

  // --- Step 1: Login as Priya via dev-login and verify accepted-connections endpoint ---
  console.log(`1. Authenticating as Priya Sharma (${PRIYA_PHONE}) via dev-login...`);
  const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PRIYA_PHONE }),
  });
  assert.strictEqual(loginRes.status, 200, 'Dev login must succeed with 200');
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert.ok(token, 'Must receive JWT auth token');
  console.log('  ✓ Authenticated as Priya Sharma successfully.\n');

  console.log('2. Calling GET /api/connections?status=accepted...');
  const connsRes = await fetch(`${API_BASE_URL}/api/connections?status=accepted`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(connsRes.status, 200, 'GET /api/connections?status=accepted must return 200');
  const connsData = await connsRes.json();
  const connections = connsData.connections || [];
  console.log(`  Received ${connections.length} accepted connection(s) for Priya Sharma.`);

  assert.ok(Array.isArray(connections), 'Connections must be an array');
  assert.ok(connections.length > 0, 'Priya must have at least one accepted connection to verify');

  // Verify each connection item has fields required by ChatListScreen and NONE of sensitive fields
  console.log('  Validating items for required display fields and strict absence of sensitive fields:');
  for (let i = 0; i < connections.length; i++) {
    const item = connections[i];
    const user = item.user || {};
    const name = user.name || item.name;
    const city = user.city || item.city;
    const connectionId = item.connectionId;

    console.log(`  [Item ${i + 1}] connectionId: ${connectionId}, name: "${name}", city: "${city}", photoUrl: ${user.photoUrl || item.photoUrl || 'none'}`);

    // Required fields
    assert.ok(connectionId, `Item ${i + 1} must have a connectionId`);
    assert.strictEqual(typeof name, 'string', `Item ${i + 1} must have a user name`);
    assert.ok(name.length > 0, `Item ${i + 1} name cannot be empty`);
    assert.strictEqual(typeof city, 'string', `Item ${i + 1} must have a city`);
    assert.ok(city.length > 0, `Item ${i + 1} city cannot be empty`);

    // Sensitive privacy fields MUST NOT exist
    assert.strictEqual(item.dob, undefined, `Item ${i + 1} root must NOT expose dob`);
    assert.strictEqual(user.dob, undefined, `Item ${i + 1} user must NOT expose dob`);
    assert.strictEqual(item.gender, undefined, `Item ${i + 1} root must NOT expose gender`);
    assert.strictEqual(user.gender, undefined, `Item ${i + 1} user must NOT expose gender`);
    assert.strictEqual(item.authId, undefined, `Item ${i + 1} root must NOT expose authId`);
    assert.strictEqual(user.authId, undefined, `Item ${i + 1} user must NOT expose authId`);
    assert.strictEqual(item.phone, undefined, `Item ${i + 1} root must NOT expose phone`);
    assert.strictEqual(user.phone, undefined, `Item ${i + 1} user must NOT expose phone`);
    assert.strictEqual(item.age, undefined, `Item ${i + 1} root must NOT expose age`);
    assert.strictEqual(user.age, undefined, `Item ${i + 1} user must NOT expose age`);
  }
  console.log('  ✓ All items contain required display fields and zero sensitive fields (PASS)\n');

  // --- Step 2: Verify ChatListScreen UI code and requirements ---
  console.log('3. Verifying ChatListScreen.tsx implementation & privacy...');
  const chatListFilePath = path.join(__dirname, '../src/screens/ChatListScreen.tsx');
  assert.ok(fs.existsSync(chatListFilePath), 'ChatListScreen.tsx must exist');
  const chatListContent = fs.readFileSync(chatListFilePath, 'utf8');

  // Privacy assertions: sensitive fields never referenced
  assert.ok(!chatListContent.includes('.dob'), 'ChatListScreen must NOT reference .dob');
  assert.ok(!chatListContent.includes('.gender'), 'ChatListScreen must NOT reference .gender');
  assert.ok(!chatListContent.includes('.authId'), 'ChatListScreen must NOT reference .authId');
  assert.ok(!chatListContent.includes('.phone'), 'ChatListScreen must NOT reference .phone');
  assert.ok(!chatListContent.includes('.age'), 'ChatListScreen must NOT reference .age');
  console.log('  ✓ Privacy check: zero references to dob, gender, authId, phone, or age');

  // Empty state requirement: exact wording
  const expectedEmptyText = 'No conversations yet. Connect with someone from Discover to start chatting.';
  assert.ok(
    chatListContent.includes(expectedEmptyText),
    `ChatListScreen must include empty state text: "${expectedEmptyText}"`
  );
  console.log('  ✓ Empty state requirement verified');

  // Loading and error states
  assert.ok(chatListContent.includes('Loading conversations...'), 'Must render loading indicator message');
  assert.ok(chatListContent.includes('Retry'), 'Must include retry action for error state');
  console.log('  ✓ Loading and error states verified');

  // Bottom navigation: 4 tabs with Chat active
  assert.ok(chatListContent.includes('Discover'), 'Bottom nav must include Discover tab');
  assert.ok(chatListContent.includes('Connections'), 'Bottom nav must include Connections tab');
  assert.ok(chatListContent.includes('Chat'), 'Bottom nav must include Chat tab');
  assert.ok(chatListContent.includes('Profile'), 'Bottom nav must include Profile tab');
  assert.ok(chatListContent.includes('styles.navLabelActive'), 'Chat tab label must be active');
  console.log('  ✓ Bottom navigation verified with Chat highlighted as active');

  // Chat navigation reuse
  assert.ok(
    chatListContent.includes('openChatForConnection'),
    'ChatListScreen must reuse openChatForConnection helper from ConnectionsScreen'
  );
  console.log('  ✓ Reuses openChatForConnection logic from ConnectionsScreen\n');

  // --- Step 3: MainTabsScreen verification ---
  console.log('4. Verifying MainTabsScreen.tsx wiring...');
  const mainTabsFilePath = path.join(__dirname, '../src/screens/MainTabsScreen.tsx');
  const mainTabsContent = fs.readFileSync(mainTabsFilePath, 'utf8');

  assert.ok(
    !mainTabsContent.includes("navigate('Chat', {})"),
    "MainTabsScreen must NOT contain navigate('Chat', {})"
  );
  assert.ok(
    mainTabsContent.includes('<ChatListScreen'),
    'MainTabsScreen must render ChatListScreen when activeTab === "chat"'
  );
  console.log('  ✓ MainTabsScreen renders ChatListScreen and has zero empty Chat navigations\n');

  // --- Step 4: ChatScreen safety verification ---
  console.log('5. Verifying ChatScreen.tsx missing connectionId safety...');
  const chatScreenFilePath = path.join(__dirname, '../src/screens/ChatScreen.tsx');
  const chatScreenContent = fs.readFileSync(chatScreenFilePath, 'utf8');

  const expectedInlineMsg = 'Open a conversation from your connections.';
  assert.ok(
    chatScreenContent.includes(expectedInlineMsg),
    `ChatScreen must show inline message: "${expectedInlineMsg}" when connectionId is missing`
  );
  assert.ok(
    chatScreenContent.includes('!connectionId'),
    'ChatScreen must guard against missing connectionId'
  );
  assert.ok(
    chatScreenContent.includes('sendBtnDisabled'),
    'ChatScreen must disable send button when connectionId is missing'
  );
  console.log('  ✓ ChatScreen safely disables composer and send button when connectionId is missing\n');

  // --- Step 5: Static code search for unsafe Chat navigation ---
  console.log('6. Static scan: Ensuring zero code paths call navigate(\'Chat\', {}) or navigate(\'Chat\') without connectionId...');
  const srcDir = path.join(__dirname, '../src');

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(scanDir(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allSourceFiles = scanDir(srcDir);
  let unsafeCalls = [];

  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(srcDir, file);

    // Look for navigate('Chat' or navigate("Chat"
    const regex = /navigate\s*\(\s*['"]Chat['"]\s*([,\)])/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const after = content.slice(match.index, match.index + 120);
      // Check if it's called with empty object or without connectionId
      if (match[1] === ')') {
        // navigate('Chat') without arguments
        unsafeCalls.push({ file: relativePath, snippet: after.slice(0, 40) });
      } else if (after.includes('navigate(\'Chat\', {})') || after.includes('navigate("Chat", {})')) {
        unsafeCalls.push({ file: relativePath, snippet: after.slice(0, 40) });
      } else if (!after.includes('connectionId')) {
        unsafeCalls.push({ file: relativePath, snippet: after.slice(0, 60) });
      }
    }
  }

  if (unsafeCalls.length > 0) {
    console.error('  Found unsafe Chat navigation calls:', unsafeCalls);
    assert.fail(`Found ${unsafeCalls.length} unsafe navigate('Chat') calls without connectionId`);
  }

  console.log(`  ✓ Scanned ${allSourceFiles.length} source files: ZERO unsafe Chat navigations found.\n`);

  console.log('=== ALL CHAT TAB & CONVERSATIONS LIST CHECKS PASSED SUCCESSFULLY ===');
}

runChatListTest().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
