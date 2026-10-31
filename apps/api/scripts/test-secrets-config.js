const assert = require("assert");
const { getJwtSecret, getAdminKey } = require("../src/config/secrets");

console.log("=== TESTING SECRETS CONFIG MODULE ===\n");

// Save original env values to preserve state
const origJwt = process.env.JWT_SECRET;
const origAdmin = process.env.ADMIN_KEY;

try {
  // Test 1: JWT_SECRET unset throws
  delete process.env.JWT_SECRET;
  assert.throws(
    () => getJwtSecret(),
    (err) => {
      assert(err instanceof Error);
      assert.strictEqual(err.message, "JWT_SECRET is missing or shorter than 16 characters");
      return true;
    },
    "Expected getJwtSecret() to throw when JWT_SECRET is unset"
  );
  console.log("✔ Test 1: getJwtSecret() throws when JWT_SECRET is unset");

  // Test 2: JWT_SECRET with 5 characters throws
  process.env.JWT_SECRET = "12345";
  assert.throws(
    () => getJwtSecret(),
    (err) => {
      assert(err instanceof Error);
      assert.strictEqual(err.message, "JWT_SECRET is missing or shorter than 16 characters");
      return true;
    },
    "Expected getJwtSecret() to throw when JWT_SECRET has 5 chars"
  );
  console.log("✔ Test 2: getJwtSecret() throws when JWT_SECRET is 5 chars");

  // Test 3: JWT_SECRET with 20 characters returns it without leaking
  const testVal20 = "0123456789abcdefghij";
  process.env.JWT_SECRET = testVal20;
  const returnedJwt = getJwtSecret();
  assert.strictEqual(returnedJwt, testVal20);
  console.log("✔ Test 3: getJwtSecret() returns value when length >= 16 chars (20 chars tested)");

  // Test 4: ADMIN_KEY unset throws
  delete process.env.ADMIN_KEY;
  assert.throws(
    () => getAdminKey(),
    (err) => {
      assert(err instanceof Error);
      assert.strictEqual(err.message, "ADMIN_KEY is missing or shorter than 16 characters");
      return true;
    },
    "Expected getAdminKey() to throw when ADMIN_KEY is unset"
  );
  console.log("✔ Test 4: getAdminKey() throws when ADMIN_KEY is unset");

  // Test 5: ADMIN_KEY with 5 characters throws
  process.env.ADMIN_KEY = "12345";
  assert.throws(
    () => getAdminKey(),
    (err) => {
      assert(err instanceof Error);
      assert.strictEqual(err.message, "ADMIN_KEY is missing or shorter than 16 characters");
      return true;
    },
    "Expected getAdminKey() to throw when ADMIN_KEY is 5 chars"
  );
  console.log("✔ Test 5: getAdminKey() throws when ADMIN_KEY is 5 chars");

  // Test 6: ADMIN_KEY with 20 characters returns it
  process.env.ADMIN_KEY = testVal20;
  const returnedAdmin = getAdminKey();
  assert.strictEqual(returnedAdmin, testVal20);
  console.log("✔ Test 6: getAdminKey() returns value when length >= 16 chars (20 chars tested)");

  console.log("\nALL SECRETS VALIDATION TESTS PASSED!");
} finally {
  // Restore original env
  if (origJwt !== undefined) {
    process.env.JWT_SECRET = origJwt;
  } else {
    delete process.env.JWT_SECRET;
  }
  if (origAdmin !== undefined) {
    process.env.ADMIN_KEY = origAdmin;
  } else {
    delete process.env.ADMIN_KEY;
  }
}

