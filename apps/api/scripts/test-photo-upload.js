process.env.NODE_ENV = "test";
process.env.PORT = "4006";

const http = require("http");
const assert = require("assert");
const mongoose = require("mongoose");
const { app } = require("../src/server");
const { connectDB } = require("../src/db/connect");
const { User } = require("../src/models");

const { RANGES, assertThrowaway, cleanupThrowaway } = require("./lib/throwaway");

const BASE_URL = "http://localhost:4006";
const TEST_PHONE = RANGES.API_PHOTO_UPLOAD[0]; // +919876543474
assertThrowaway(TEST_PHONE);

// 1x1 transparent PNG as buffer (valid image)
const TINY_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function runPhotoUploadTests() {
  console.log("=== STARTING PHOTO UPLOAD TESTS (THROWAWAY USER) ===\n");

  await connectDB();
  await cleanupThrowaway([TEST_PHONE]);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4006, resolve));
  console.log("[test-server] Running on port 4006\n");

  try {
    const testPhone = TEST_PHONE;
    console.log(`1. Dev Login with new test phone (${testPhone})...`);
    const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginData.token);
    const token = loginData.token;
    console.log("   Dev login successful.\n");

    // 2. Reject missing file
    console.log("2. Testing rejection of missing file (400)...");
    const emptyForm = new FormData();
    const emptyRes = await fetch(`${BASE_URL}/api/users/me/photo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: emptyForm,
    });
    const emptyData = await emptyRes.json();
    console.log(`   Status: ${emptyRes.status}, Error: ${emptyData.message}`);
    assert.strictEqual(emptyRes.status, 400);
    assert.strictEqual(emptyData.error, "BAD_REQUEST");
    console.log("   Missing file rejected: PASS\n");

    // 3. Reject non-image file (e.g. text/plain)
    console.log("3. Testing rejection of non-image file (400)...");
    const textBlob = new Blob(["Hello world this is not an image"], {
      type: "text/plain",
    });
    const textForm = new FormData();
    textForm.append("photo", textBlob, "test.txt");
    const textRes = await fetch(`${BASE_URL}/api/users/me/photo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: textForm,
    });
    const textData = await textRes.json();
    console.log(`   Status: ${textRes.status}, Error: ${textData.message}`);
    assert.strictEqual(textRes.status, 400);
    assert.strictEqual(textData.error, "BAD_REQUEST");
    assert.strictEqual(textData.message, "Only image files are allowed.");
    console.log("   Non-image file rejected: PASS\n");

    // 4. Reject file > 5MB
    console.log("4. Testing rejection of file > 5MB (400)...");
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024); // 5.5MB
    const largeBlob = new Blob([largeBuffer], { type: "image/jpeg" });
    const largeForm = new FormData();
    largeForm.append("photo", largeBlob, "large.jpg");
    const largeRes = await fetch(`${BASE_URL}/api/users/me/photo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: largeForm,
    });
    const largeData = await largeRes.json();
    console.log(`   Status: ${largeRes.status}, Error: ${largeData.message}`);
    assert.strictEqual(largeRes.status, 400);
    assert.strictEqual(largeData.error, "BAD_REQUEST");
    assert.strictEqual(largeData.message, "File size exceeds 5MB limit.");
    console.log("   File > 5MB rejected: PASS\n");

    // 5. Upload valid image to Cloudinary
    console.log("5. Testing upload of valid image to Cloudinary...");
    const pngBlob = new Blob([TINY_PNG_BUFFER], { type: "image/png" });
    const validForm = new FormData();
    validForm.append("photo", pngBlob, "avatar.png");
    const uploadRes = await fetch(`${BASE_URL}/api/users/me/photo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: validForm,
    });
    const uploadData = await uploadRes.json();
    console.log(`   Status: ${uploadRes.status}`);
    console.log(`   Response:`, JSON.stringify(uploadData, null, 2));
    assert.strictEqual(uploadRes.status, 200);
    assert.ok(uploadData.photoUrl, "Must return photoUrl");
    assert.ok(
      uploadData.photoUrl.includes("res.cloudinary.com"),
      "photoUrl must be a Cloudinary URL"
    );
    assert.ok(
      uploadData.photoUrl.includes("connectlocal/profile-photos"),
      "photoUrl must be uploaded to connectlocal/profile-photos folder"
    );
    console.log(`   Uploaded Cloudinary URL: ${uploadData.photoUrl}`);
    console.log("   Valid image uploaded to Cloudinary: PASS\n");

    // 6. Verify MongoDB persistence
    console.log("6. Verifying MongoDB persistence of photoUrl...");
    const dbUser = await User.findOne({ authId: testPhone });
    assert.ok(dbUser, "User must exist in MongoDB");
    assert.strictEqual(
      dbUser.photoUrl,
      uploadData.photoUrl,
      "dbUser.photoUrl must match uploaded Cloudinary URL"
    );
    console.log("   MongoDB photoUrl matches Cloudinary URL: PASS\n");

    // 7. Complete profile creation and verify photoUrl is preserved
    console.log("7. Completing profile creation (POST /api/users)...");
    const profileRes = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: "Cloudinary Test User",
        dob: "1995-03-20",
        gender: "female",
        city: "Bangalore",
        skills: ["Design", "AI"],
        interests: ["Travel", "Music"],
        intent: ["networking"],
        about: "Testing real Cloudinary photo upload.",
        photoUrl: uploadData.photoUrl,
      }),
    });
    const profileData = await profileRes.json();
    assert.strictEqual(profileRes.status, 201);
    assert.strictEqual(profileData.photoUrl, uploadData.photoUrl);
    console.log("   Profile created with real Cloudinary photoUrl: PASS\n");

    // 8. Verify GET /api/users/me returns the Cloudinary photoUrl
    console.log("8. Verifying GET /api/users/me returns the Cloudinary photoUrl...");
    const meRes = await fetch(`${BASE_URL}/api/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const meData = await meRes.json();
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meData.photoUrl, uploadData.photoUrl);
    console.log("   GET /api/users/me confirmed photoUrl: PASS\n");

    console.log("=== ALL PHOTO UPLOAD TESTS PASSED SUCCESSFULLY! ===");
  } finally {
    try {
      await cleanupThrowaway([TEST_PHONE]);
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    server.close();
    await mongoose.connection.close();
  }
}

runPhotoUploadTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
