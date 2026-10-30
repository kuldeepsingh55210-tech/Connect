const assert = require('assert');
const { RANGES, createThrowawayUser, cleanupThrowaway, disconnectThrowaway } = require('./lib/throwaway');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

const VIEWER_PHONE = RANGES.MOBILE_DISCOVER[0];
const TIER1_PEER_PHONE = RANGES.MOBILE_DISCOVER[1];
const TIER2_PEER_PHONE = RANGES.MOBILE_DISCOVER[2];
const ALL_TEST_PHONES = [VIEWER_PHONE, TIER1_PEER_PHONE, TIER2_PEER_PHONE];

async function runDiscoverE2ETest() {
  console.log('=== STARTING DISCOVER SCREEN E2E TEST (THROWAWAY ISOLATED) ===\n');

  try {
    // Step 0: Ensure fresh throwaway state
    await cleanupThrowaway(ALL_TEST_PHONES);

    const viewer = await createThrowawayUser(VIEWER_PHONE, {
      name: 'Discover Viewer',
      city: 'Delhi',
      skills: ['Frontend Dev', 'AI'],
      interests: ['Reading', 'Travel'],
      intent: ['networking'],
    });

    const tier1Peer = await createThrowawayUser(TIER1_PEER_PHONE, {
      name: 'Delhi Discover Peer',
      city: 'Delhi',
      skills: ['Frontend Dev'],
      interests: ['Reading'],
      intent: ['networking'],
    });

    const tier2Peer = await createThrowawayUser(TIER2_PEER_PHONE, {
      name: 'Mumbai Discover Peer',
      city: 'Mumbai',
      skills: ['AI'],
      interests: ['Travel'],
      intent: ['networking'],
    });

    const tier1PeerId = tier1Peer._id.toString();
    const tier2PeerId = tier2Peer._id.toString();

    // Step 1: Login as Viewer
    console.log(`1. Authenticating as Discover Viewer (${VIEWER_PHONE})...`);
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: VIEWER_PHONE }),
    });

    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Dev login must return 200');
    assert.ok(loginData.token, 'Must receive JWT token');
    const token = loginData.token;
    console.log('- Authenticated successfully as Discover Viewer: PASS\n');

    // Step 2: Fetch current user profile to verify city is Delhi
    console.log('2. Fetching Viewer profile (GET /api/users/me)...');
    const meRes = await fetch(`${API_BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();
    const profile = meData.profile || meData;
    assert.strictEqual(meRes.status, 200, 'GET /api/users/me must return 200');
    assert.strictEqual(profile.city, 'Delhi', 'Viewer must be in Delhi');
    console.log(`- Profile verified: ${profile.name} in ${profile.city}: PASS\n`);

    // Step 3: Fetch Discover feed (GET /api/discover)
    console.log('3. Fetching Discover feed (GET /api/discover)...');
    const discRes = await fetch(`${API_BASE_URL}/api/discover`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const discData = await discRes.json();
    assert.strictEqual(discRes.status, 200, 'GET /api/discover must return 200');
    assert.ok(Array.isArray(discData.tier1), 'Response must include tier1 array');
    assert.ok(Array.isArray(discData.tier2), 'Response must include tier2 array');

    console.log(`- Tier 1 count: ${discData.tier1.length}`);
    console.log(`- Tier 2 count: ${discData.tier2.length}`);

    // Verify created throwaways are found
    const foundTier1 = discData.tier1.find((u) => u.id === tier1PeerId);
    assert.ok(foundTier1, 'Delhi peer must be found in Tier 1');
    const foundTier2 = discData.tier2.find((u) => u.id === tier2PeerId);
    assert.ok(foundTier2, 'Mumbai peer must be found in Tier 2');

    // Tier 1 verification: same city (Delhi) and sharedCount > 0
    assert.ok(discData.tier1.length >= 1, 'Tier 1 must have at least 1 candidate');
    for (const card of discData.tier1) {
      console.log(`  [Tier 1 Card] ${card.name} | City: ${card.city} | Shared: ${card.sharedCount}`);
      assert.strictEqual(card.city, 'Delhi', 'Tier 1 card must be in same city (Delhi)');
      assert.ok(card.sharedCount >= 1, 'Tier 1 card must have sharedCount >= 1');
      assert.strictEqual(card.neighborhood, undefined, 'Must NEVER contain neighborhood');
      assert.strictEqual(card.distanceKm, undefined, 'Must NEVER contain distanceKm');
    }
    console.log('- Tier 1 results verified: PASS\n');

    // Tier 2 verification: other cities and sharedCount > 0
    assert.ok(discData.tier2.length >= 1, 'Tier 2 must have at least 1 candidate');
    for (const card of discData.tier2) {
      console.log(`  [Tier 2 Card] ${card.name} | City: ${card.city} | Shared: ${card.sharedCount}`);
      assert.notStrictEqual(card.city, 'Delhi', 'Tier 2 card must be from another city');
      assert.ok(card.sharedCount >= 1, 'Tier 2 card must have sharedCount >= 1');
      assert.strictEqual(card.neighborhood, undefined, 'Must NEVER contain neighborhood');
      assert.strictEqual(card.distanceKm, undefined, 'Must NEVER contain distanceKm');
    }
    console.log('- Tier 2 results verified: PASS\n');

    // Step 4: Test Connect Request (POST /api/connections) targeting throwaway Delhi peer
    console.log(`4. Sending connection request to ${foundTier1.name} (${foundTier1.id})...`);
    const connRes = await fetch(`${API_BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toUserId: foundTier1.id }),
    });

    const connData = await connRes.json();
    console.log(`- Connect response status: ${connRes.status}`);

    assert.strictEqual(connRes.status, 201, 'Fresh throwaway connect request should return 201');
    console.log('- Connection request created (201): PASS\n');

    // Step 5: Test duplicate connection request returns 409 Conflict
    console.log(`5. Sending duplicate connection request to ${foundTier1.name}...`);
    const dupRes = await fetch(`${API_BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toUserId: foundTier1.id }),
    });
    const dupData = await dupRes.json();
    console.log(`- Duplicate response status: ${dupRes.status}`);
    assert.strictEqual(dupRes.status, 409, 'Duplicate request must return 409 Conflict');
    assert.strictEqual(dupData.error, 'CONFLICT');
    console.log('- Duplicate request properly rejected with 409: PASS\n');

    // Step 6: Test Connect to self is rejected (400)
    console.log('6. Testing connect to self is rejected with 400...');
    const selfRes = await fetch(`${API_BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toUserId: profile._id || profile.id }),
    });
    assert.strictEqual(selfRes.status, 400, 'Connecting to self must return 400');
    console.log('- Self-connection correctly rejected with 400: PASS\n');

    console.log('=== ALL DISCOVER E2E TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    console.log('Cleaning up throwaway test records...');
    await cleanupThrowaway(ALL_TEST_PHONES);
    await disconnectThrowaway();
  }
}

runDiscoverE2ETest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Discover E2E Test failed:', err);
    process.exit(1);
  });
