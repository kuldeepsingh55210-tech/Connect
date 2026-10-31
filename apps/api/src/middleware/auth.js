// TEMPORARY DEV AUTH — replace with real Firebase phone OTP + Google auth before public launch. See TRD Section 6.1 /auth/otp/send and /auth/otp/verify. This must not ship to production.

const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/secrets");

/**
 * Standard Auth Middleware
 * Validates JWT session token on incoming requests and sets req.user.id.
 * Designed so a real Firebase-based middleware can swap in later without
 * changing how other routes consume req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authorization token missing or malformed",
    });
  }

  const token = authHeader.split(" ")[1];
  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token, secret);
    req.user = {
      id: decoded.id || decoded.userId,
      authId: decoded.authId,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  }
}

module.exports = { requireAuth };
