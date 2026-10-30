const assert = require('assert');
const { RANGES, assertThrowaway, cleanupThrowaway, disconnectThrowaway } = require('./lib/throwaway');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_PHONE = RANGES.MOBILE_CREATE_PROFILE[0]; // +919876543481
assertThrowaway(TEST_PHONE);

async function runE2ETest() {
  console.log('=== STARTING SIGNUP -> CREATE PROFILE END-TO-END FLOW TEST (THROWAWAY USER) ===\n');

  await cleanupThrowaway([TEST_PHONE]);

  try {
    console.log(`1. Authenticating test user with dev-login (${TEST_PHONE})...`);

    const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE }),
    });

    const loginData = await loginRes.json();
    console.log(`Dev login response status: ${loginRes.status}`);
    assert.strictEqual(loginRes.status, 200, 'Dev login must return 200');
    assert.ok(loginData.token, 'Must receive session JWT token');
    const token = loginData.token;
    console.log('- Dev login succeeded: PASS\n');

    // Step 1: Signup collected data
    const signupData = {
      name: 'Throwaway Priya',
      dob: '1998-08-14', // Adult (> 18)
      gender: 'female',
      city: 'Delhi',
    };
    console.log('2. Step 1 (Signup) Collected Data:', signupData);

    // Step 2: Create Profile collected data
    const profileData = {
      intent: ['friendship', 'networking'],
      skills: ['AI', 'Product', 'Design'],
      interests: ['Travel', 'Yoga', 'Reading'],
      about: 'Design lead passionate about local public spaces and AI interfaces.',
      photoUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80',
    };
    console.log('3. Step 2 (Create Profile) Collected Data:', profileData);

    // Combined payload per TRD / backend contract
    const combinedPayload = {
      ...signupData,
      ...profileData,
    };
    console.log('\n4. Submitting combined POST /api/users payload...');

    const createRes = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(combinedPayload),
    });

    const createData = await createRes.json();
    console.log(`POST /api/users status: ${createRes.status}`);
    console.log('Create Profile response:', JSON.stringify(createData, null, 2));

    assert.strictEqual(createRes.status, 201, 'POST /api/users must return 201 Created');
    const createdProfile = createData.profile || createData;
    assert.ok(createdProfile, 'Must return created profile object');
    assert.strictEqual(createdProfile.name, 'Throwaway Priya');
    assert.strictEqual(createdProfile.city, 'Delhi');
    assert.strictEqual(createdProfile.profileCompleted, true);
    console.log('- Profile created successfully (201): PASS\n');

    // Step 5: Verify persisted profile in MongoDB via GET /api/users/me
    console.log('5. Verifying persisted profile in MongoDB via GET /api/users/me...');
    const meRes = await fetch(`${API_BASE_URL}/api/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const meData = await meRes.json();
    console.log(`GET /api/users/me status: ${meRes.status}`);
    console.log('GET /api/users/me response:', JSON.stringify(meData, null, 2));

    const user = meData.profile || meData;
    assert.strictEqual(meRes.status, 200, 'GET /api/users/me must return 200');
    assert.strictEqual(user.name, 'Throwaway Priya');
    assert.strictEqual(user.city, 'Delhi');
    assert.strictEqual(user.gender, 'female');
    assert.deepStrictEqual(user.skills, ['AI', 'Product', 'Design']);
    assert.deepStrictEqual(user.interests, ['Travel', 'Yoga', 'Reading']);
    assert.deepStrictEqual(user.intent, ['friendship', 'networking']);
    assert.strictEqual(
      user.about,
      'Design lead passionate about local public spaces and AI interfaces.'
    );
    console.log('- MongoDB profile persistence verified: PASS\n');

    // Step 6: Test duplicate profile creation returns 409 Conflict
    console.log('6. Testing duplicate profile creation rejection (409 Conflict)...');
    const dupRes = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(combinedPayload),
    });

    const dupData = await dupRes.json();
    console.log(`Duplicate request status: ${dupRes.status}`);
    console.log('Duplicate response:', JSON.stringify(dupData, null, 2));
    assert.strictEqual(dupRes.status, 409, 'Duplicate profile must return 409 Conflict');
    assert.strictEqual(dupData.error, 'CONFLICT');
    console.log('- Duplicate profile correctly rejected with 409: PASS\n');

    console.log('=== ALL E2E SIGNUP -> CREATE PROFILE TESTS PASSED ===');
  } finally {
    try {
      await cleanupThrowaway([TEST_PHONE]);
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    }
    await disconnectThrowaway();
    process.exit(0);
  }
}

runE2ETest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
