/**
 * apps/api/src/config/secrets.js
 *
 * Centralized secret getters for JWT and admin authentication.
 * Fails fast with clear error messages if required secrets are unset or too short (<16 chars).
 * NEVER prints or leaks secret values in error messages or logs.
 */

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string" || secret.length < 16) {
    throw new Error("JWT_SECRET is missing or shorter than 16 characters");
  }
  return secret;
}

function getAdminKey() {
  const key = process.env.ADMIN_KEY;
  if (!key || typeof key !== "string" || key.length < 16) {
    throw new Error("ADMIN_KEY is missing or shorter than 16 characters");
  }
  return key;
}

module.exports = {
  getJwtSecret,
  getAdminKey,
};

