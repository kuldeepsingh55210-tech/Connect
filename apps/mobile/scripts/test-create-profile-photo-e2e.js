const assert = require('assert');
const { RANGES, assertThrowaway, cleanupThrowaway, disconnectThrowaway } = require('./lib/throwaway');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_PHONE = RANGES.MOBILE_CREATE_PROFILE_PHOTO[0]; // +919876543482
assertThrowaway(TEST_PHONE);

// Sample 1x1 test image png
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runMobilePhotoE2ETest() {
  console.log('=== STARTING MOBILE REAL PHOTO UPLOAD E2E TEST (THROWAWAY USER) ===\n');

  await cleanupThrowaway([TEST_PHONE]);

  try {
    // 1. Authenticate test user with dev-login
    console.log(`1. Authenticating test user with dev-login (${TEST_PHONE})...`);

    const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE }),
    });

    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Dev login must return 200');
    const token = loginData.token;
    assert.ok(token, 'Must receive auth token');
    console.log('   Dev login succeeded: PASS\n');

    // 2. Simulate mobile user picking an image from image picker and uploading
    console.log('2. Simulating mobile photo upload via POST /api/users/me/photo...');
    const imageBlob = new Blob([TINY_PNG_BUFFER], { type: 'image/png' });
    const formData = new FormData();
    formData.append('photo', imageBlob, 'profile_avatar.png');

    const photoRes = await fetch(`${API_BASE_URL}/api/users/me/photo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const photoData = await photoRes.json();
    console.log(`   Photo upload status: ${photoRes.status}`);
    console.log(`   Photo upload response:`, JSON.stringify(photoData, null, 2));

    assert.strictEqual(photoRes.status, 200, 'Photo upload must return 200');
    assert.ok(photoData.photoUrl, 'Must return photoUrl');
    assert.ok(
      photoData.photoUrl.startsWith('https://res.cloudinary.com/'),
      'photoUrl must start with https://res.cloudinary.com/'
    );
    assert.ok(
      photoData.photoUrl.includes('connectlocal/profile-photos'),
      'photoUrl must be stored in connectlocal/profile-photos folder'
    );
    const realCloudinaryUrl = photoData.photoUrl;
    console.log(`   Cloudinary photoUrl: ${realCloudinaryUrl}`);
    console.log('   Real photo uploaded to Cloudinary: PASS\n');

    // 3. User finishes setup with Create Profile screen
    console.log('3. Submitting full profile setup (POST /api/users) with real photoUrl...');
    const createRes = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Throwaway Photo User',
        dob: '1997-11-12',
        gender: 'male',
        city: 'Delhi',
        skills: ['Frontend Dev', 'Design'],
        interests: ['Travel', 'Music'],
        intent: ['networking', 'friendship'],
        about: 'Product designer based in Delhi.',
        photoUrl: realCloudinaryUrl,
      }),
    });

    const createData = await createRes.json();
    console.log(`   POST /api/users status: ${createRes.status}`);
    assert.strictEqual(createRes.status, 201, 'Profile creation must return 201');
    assert.strictEqual(
      createData.photoUrl,
      realCloudinaryUrl,
      'Returned profile photoUrl must match Cloudinary URL'
    );
    console.log('   Profile created with real Cloudinary photoUrl: PASS\n');

    // 4. Confirm profile in MongoDB via GET /api/users/me
    console.log('4. Verifying persisted profile in MongoDB via GET /api/users/me...');
    const meRes = await fetch(`${API_BASE_URL}/api/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const meData = await meRes.json();
    console.log(`   GET /api/users/me status: ${meRes.status}`);
    const user = meData.profile || meData;
    assert.strictEqual(meRes.status, 200, 'GET /api/users/me must return 200');
    assert.strictEqual(
      user.photoUrl,
      realCloudinaryUrl,
      'MongoDB photoUrl must be the real Cloudinary URL, NOT a placeholder'
    );
    assert.ok(
      !user.photoUrl.includes('unsplash.com'),
      'Must not be the old placeholder URL'
    );
    console.log(`   Verified MongoDB photoUrl: ${user.photoUrl}`);
    console.log('   MongoDB photoUrl verified as real Cloudinary URL: PASS\n');

    console.log('=== ALL MOBILE REAL PHOTO UPLOAD E2E TESTS PASSED ===');
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

runMobilePhotoE2ETest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
