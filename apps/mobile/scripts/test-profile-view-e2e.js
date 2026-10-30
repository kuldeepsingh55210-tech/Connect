const assert = require('assert');
const path = require('path');
const { RANGES, createThrowawayUser, cleanupThrowaway, disconnectThrowaway } = require('./lib/throwaway');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

const VIEWER_PHONE = RANGES.MOBILE_PROFILE_VIEW[0];
const TARGET_PUBLIC_PHONE = RANGES.MOBILE_PROFILE_VIEW[1];
const TARGET_REPORT_BLOCK_PHONE = RANGES.MOBILE_PROFILE_VIEW[2];
const ALL_TEST_PHONES = [VIEWER_PHONE, TARGET_PUBLIC_PHONE, TARGET_REPORT_BLOCK_PHONE];

async function runProfileViewE2ETest() {
  console.log('=== STARTING PROFILE VIEW SCREEN E2E TEST (THROWAWAY ISOLATED) ===\n');

  try {
    // Step 0: Pre-cleanup and create throwaway users
    await cleanupThrowaway(ALL_TEST_PHONES);

    const viewerUser = await createThrowawayUser(VIEWER_PHONE, {
      name: 'Throwaway Viewer',
      city: 'Delhi',
      skills: ['Frontend Dev', 'AI'],
      interests: ['Reading', 'Travel'],
      intent: ['networking'],
    });

    const publicUser = await createThrowawayUser(TARGET_PUBLIC_PHONE, {
      name: 'Throwaway Public Target',
      city: 'Delhi',
      skills: ['Frontend Dev'],
      interests: ['Reading'],
      intent: ['networking'],
      about: 'Public profile about me description for testing.',
    });

    const reportBlockUser = await createThrowawayUser(TARGET_REPORT_BLOCK_PHONE, {
      name: 'Throwaway Report Target',
      city: 'Delhi',
      skills: ['AI'],
      interests: ['Reading'],
      intent: ['networking'],
      about: 'Target for report and block testing.',
    });

    const publicUserId = publicUser._id.toString();
    const reportBlockUserId = reportBlockUser._id.toString();

    // Step 1: Login as Viewer
    console.log(`1. Authenticating as Viewer (${VIEWER_PHONE})...`);
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: VIEWER_PHONE }),
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Dev login must return 200');
    const token = loginData.token;
    console.log('- Authenticated successfully: PASS\n');

    // Step 2: Fetch Discover feed to locate peers
    console.log('2. Fetching Discover feed to locate peers...');
    const discRes = await fetch(`${API_BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const discData = await discRes.json();
    const publicInFeed = discData.tier1.find((u) => u.id === publicUserId);
    const reportInFeed = discData.tier1.find((u) => u.id === reportBlockUserId);

    assert.ok(publicInFeed, 'Public target user must be in Tier 1');
    assert.ok(reportInFeed, 'Report target user must be in Tier 1');
    console.log(`- Located Public User (${publicUserId}) and Report User (${reportBlockUserId}): PASS\n`);

    // Step 3: Test GET /api/users/:id for Public Target
    console.log(`3. Testing GET /api/users/${publicUserId} (Public Profile)...`);
    const publicProfileRes = await fetch(`${API_BASE_URL}/api/users/${publicUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const publicProfile = await publicProfileRes.json();
    console.log('Public profile payload:', publicProfile);

    assert.strictEqual(publicProfileRes.status, 200, 'Must return 200 OK');
    assert.strictEqual(publicProfile.id, publicUserId);
    assert.strictEqual(publicProfile.name, 'Throwaway Public Target');
    assert.strictEqual(publicProfile.city, 'Delhi');
    assert.ok(Array.isArray(publicProfile.skills), 'skills must be an array');
    assert.ok(Array.isArray(publicProfile.interests), 'interests must be an array');
    assert.ok(Array.isArray(publicProfile.intent), 'intent must be an array');
    assert.strictEqual(typeof publicProfile.about, 'string', 'about must be a string');

    // Privacy verification: NO dob, NO gender, NO authId, NO distance, NO neighborhood
    assert.strictEqual(publicProfile.dob, undefined, 'dob must NEVER be exposed');
    assert.strictEqual(publicProfile.gender, undefined, 'gender must NEVER be exposed');
    assert.strictEqual(publicProfile.authId, undefined, 'authId must NEVER be exposed');
    assert.strictEqual(publicProfile.distanceKm, undefined, 'distanceKm must NEVER be exposed');
    assert.strictEqual(publicProfile.neighborhood, undefined, 'neighborhood must NEVER be exposed');
    console.log('- Public profile privacy constraints verified: PASS\n');

    // Step 4: Test GET /api/users/:id returns 404 for invalid/missing ID
    console.log('4. Testing GET /api/users/nonexistent returns 404...');
    const notFoundRes = await fetch(`${API_BASE_URL}/api/users/6aa7affc64261bb64d082e99`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(notFoundRes.status, 404, 'Must return 404 for missing user');
    console.log('- 404 on missing user: PASS\n');

    // Step 5: Test Report flow: POST /api/reports on Report Target
    console.log(`5. Testing POST /api/reports for Report User (${reportBlockUserId})...`);
    const reportRes = await fetch(`${API_BASE_URL}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reportedUserId: reportBlockUserId,
        reason: 'inappropriate_photo',
        details: 'Automated test report details',
      }),
    });
    const reportData = await reportRes.json();
    console.log('Report response:', reportRes.status, reportData);
    assert.strictEqual(reportRes.status, 201, 'POST /api/reports must return 201');
    console.log('- User reported successfully (201): PASS\n');

    // Step 6: Test Block flow: POST /api/connections/block on Report Target
    console.log(`6. Testing POST /api/connections/block for Report User (${reportBlockUserId})...`);
    const blockRes = await fetch(`${API_BASE_URL}/api/connections/block`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toUserId: reportBlockUserId }),
    });
    const blockData = await blockRes.json();
    console.log('Block response:', blockRes.status, blockData);
    assert.strictEqual(blockRes.status, 200, 'POST /api/connections/block must return 200');
    console.log('- User blocked successfully (200): PASS\n');

    // Step 7: Verify Report Target no longer appears in Viewer's Discover feed
    console.log("7. Verifying blocked user is excluded from Viewer's Discover feed...");
    const postBlockDiscRes = await fetch(`${API_BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const postBlockDiscData = await postBlockDiscRes.json();
    const targetInTier1 = postBlockDiscData.tier1.find((u) => u.id === reportBlockUserId);
    const targetInTier2 = postBlockDiscData.tier2.find((u) => u.id === reportBlockUserId);

    assert.strictEqual(targetInTier1, undefined, 'Blocked user must NOT appear in Tier 1');
    assert.strictEqual(targetInTier2, undefined, 'Blocked user must NOT appear in Tier 2');
    console.log('- Blocked user completely excluded from Discover: PASS\n');

    console.log('=== ALL PROFILE VIEW E2E TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    console.log('Cleaning up throwaway test records...');
    await cleanupThrowaway(ALL_TEST_PHONES);
    await disconnectThrowaway();
  }
}

runProfileViewE2ETest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Profile View E2E Test failed:', err);
    process.exit(1);
  });
