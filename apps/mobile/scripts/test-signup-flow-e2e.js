const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RANGES, createThrowawayUser, cleanupThrowaway, disconnectThrowaway } = require('./lib/throwaway');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

const phone1 = RANGES.MOBILE_SIGNUP_FLOW[0];
const phone2 = RANGES.MOBILE_SIGNUP_FLOW[1];
const existingPhone = RANGES.MOBILE_SIGNUP_FLOW[2];
const ALL_TEST_PHONES = [phone1, phone2, existingPhone];

async function runTest() {
  console.log('=== STARTING SIGNUP FLOW E2E & 409 VERIFICATION (THROWAWAY ISOLATED) ===\n');

  try {
    // =========================================================================
    // SCENARIO 1: Sign up two NEW phones
    // Assert two distinct user _ids created and each GET /api/users/me returns its own name.
    // =========================================================================
    console.log(`1. Testing two independent new signups with distinct throwaway phones (${phone1}, ${phone2})...`);

    // Ensure fresh state for the test phones
    await cleanupThrowaway(ALL_TEST_PHONES);
    console.log('  [Setup] Cleared previous throwaway records for allocated range.');

    // User 1
    const name1 = 'Aanya Sen';
    const city1 = 'Kolkata';

    console.log(`  Signing up User 1 (${phone1}, ${name1}, ${city1})...`);
    const loginRes1 = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone1 }),
    });
    assert.strictEqual(loginRes1.status, 200, 'dev-login for user 1 must succeed with 200');
    const loginData1 = await loginRes1.json();
    const token1 = loginData1.token;
    assert.ok(token1, 'User 1 must receive auth token');

    const createRes1 = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: name1,
        dob: '1999-05-12',
        gender: 'female',
        city: city1,
        skills: ['Design'],
        interests: ['Music'],
        intent: ['networking'],
      }),
    });
    assert.strictEqual(createRes1.status, 201, 'POST /api/users for user 1 must return 201 Created');
    const createData1 = await createRes1.json();
    const userId1 = createData1.profile?._id || createData1.profile?.id || createData1.id || createData1._id;

    const meRes1 = await fetch(`${BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert.strictEqual(meRes1.status, 200, 'GET /api/users/me for user 1 must return 200');
    const meData1 = await meRes1.json();
    const userName1 = meData1.name || meData1.profile?.name;
    const userCity1 = meData1.city || meData1.profile?.city;
    assert.strictEqual(userName1, name1, `User 1 name must match "${name1}"`);
    assert.strictEqual(userCity1, city1, `User 1 city must match "${city1}"`);
    console.log(`  ✓ User 1 created: ID=${userId1}, Name="${userName1}", City="${userCity1}"`);

    // User 2
    const name2 = 'Vikram Das';
    const city2 = 'Pune';

    console.log(`  Signing up User 2 (${phone2}, ${name2}, ${city2})...`);
    const loginRes2 = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone2 }),
    });
    assert.strictEqual(loginRes2.status, 200, 'dev-login for user 2 must succeed with 200');
    const loginData2 = await loginRes2.json();
    const token2 = loginData2.token;
    assert.ok(token2, 'User 2 must receive auth token');

    const createRes2 = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        name: name2,
        dob: '1997-11-20',
        gender: 'male',
        city: city2,
        skills: ['Frontend Dev'],
        interests: ['Travel'],
        intent: ['friendship'],
      }),
    });
    assert.strictEqual(createRes2.status, 201, 'POST /api/users for user 2 must return 201 Created');
    const createData2 = await createRes2.json();
    const userId2 = createData2.profile?._id || createData2.profile?.id || createData2.id || createData2._id;

    const meRes2 = await fetch(`${BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    assert.strictEqual(meRes2.status, 200, 'GET /api/users/me for user 2 must return 200');
    const meData2 = await meRes2.json();
    const userName2 = meData2.name || meData2.profile?.name;
    const userCity2 = meData2.city || meData2.profile?.city;
    assert.strictEqual(userName2, name2, `User 2 name must match "${name2}"`);
    assert.strictEqual(userCity2, city2, `User 2 city must match "${city2}"`);
    console.log(`  ✓ User 2 created: ID=${userId2}, Name="${userName2}", City="${userCity2}"`);

    // Assert distinct users
    assert.notStrictEqual(userId1, userId2, 'User 1 and User 2 must have different _ids');
    console.log('  ✓ Verified: User 1 and User 2 have different _ids and distinct profile data.');

    // =========================================================================
    // SCENARIO 2: Attempt signup with an already-completed throwaway phone
    // Assert API returns 409 and code path does not call login() or navigate to MainTabs.
    // =========================================================================
    console.log(`\n2. Testing signup attempt with already-completed throwaway phone (${existingPhone})...`);

    // Create existing completed user in DB
    await createThrowawayUser(existingPhone, {
      name: 'Existing Throwaway',
      city: 'Mumbai',
      skills: ['AI'],
      interests: ['Reading'],
      intent: ['networking'],
    });

    const existingLoginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: existingPhone }),
    });
    assert.strictEqual(existingLoginRes.status, 200, 'dev-login for existing phone succeeds with 200');
    const existingLoginData = await existingLoginRes.json();
    const existingToken = existingLoginData.token;

    // Attempt to create a duplicate profile for existing account
    const conflictRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${existingToken}`,
      },
      body: JSON.stringify({
        name: 'Duplicate Profile Attempt',
        dob: '2000-01-01',
        gender: 'male',
        city: 'Mumbai',
        skills: ['AI'],
        interests: ['Reading'],
        intent: ['networking'],
      }),
    });
    assert.strictEqual(conflictRes.status, 409, 'API must return HTTP 409 CONFLICT');
    const conflictData = await conflictRes.json();
    console.log(`  ✓ API returned status ${conflictRes.status}: "${conflictData.message}"`);

    // Static code analysis of CreateProfileScreen.tsx 409 handler
    console.log('\n3. Verifying CreateProfileScreen.tsx 409 branch (static code verification)...');
    const createProfilePath = path.join(__dirname, '../src/screens/CreateProfileScreen.tsx');
    const createProfileCode = fs.readFileSync(createProfilePath, 'utf8');

    // Extract the catch block
    const catchIndex = createProfileCode.indexOf('if (err.status === 409)');
    assert.ok(catchIndex !== -1, 'CreateProfileScreen must have an explicit if (err.status === 409) check');

    const catchBlock = createProfileCode.substring(catchIndex, catchIndex + 500);

    // Must NOT call login() on 409
    assert.ok(
      !catchBlock.includes('login('),
      'CreateProfileScreen 409 block must NOT call login()'
    );
    console.log('  ✓ 409 branch does NOT call login()');

    // Must NOT navigate to MainTabs on 409
    assert.ok(
      !catchBlock.includes("navigation.navigate('MainTabs')"),
      "CreateProfileScreen 409 block must NOT navigate to 'MainTabs'"
    );
    console.log("  ✓ 409 branch does NOT navigate to 'MainTabs'");

    // Must set error message advising user to log in instead
    assert.ok(
      catchBlock.includes('This phone number already has an account. Please log in instead.'),
      'CreateProfileScreen 409 block must set correct error message'
    );
    console.log('  ✓ 409 branch sets clear error message: "This phone number already has an account. Please log in instead."');

    // Must set isConflictError flag and render Go to Log in button
    assert.ok(
      createProfileCode.includes('setIsConflictError(true)'),
      'CreateProfileScreen must set isConflictError flag on 409'
    );
    assert.ok(
      createProfileCode.includes("navigation.navigate('Login')"),
      'CreateProfileScreen must navigate to Login on conflict action tap'
    );
    console.log('  ✓ "Go to Log in" button present and navigates to Login');

    // =========================================================================
    // SCENARIO 4: Check that '+919876543299' is nowhere in src/
    // =========================================================================
    console.log('\n4. Verifying +919876543299 is completely removed from mobile source files...');
    const mobileSrcDir = path.join(__dirname, '../src');
    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(
            !content.includes('+919876543299'),
            `File ${entry.name} must not contain +919876543299`
          );
        }
      }
    }
    checkDir(mobileSrcDir);
    console.log('  ✓ No occurrences of +919876543299 in apps/mobile/src/');

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
  } finally {
    console.log('Cleaning up throwaway test records...');
    await cleanupThrowaway(ALL_TEST_PHONES);
    await disconnectThrowaway();
  }
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
