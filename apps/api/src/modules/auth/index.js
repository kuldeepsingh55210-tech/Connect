// TEMPORARY DEV AUTH — replace with real Firebase phone OTP + Google auth before public launch. See TRD Section 6.1 /auth/otp/send and /auth/otp/verify. This must not ship to production.

const express = require("express");
const jwt = require("jsonwebtoken");
const { User } = require("../../models");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

/**
 * POST /api/auth/dev-login
 * Temporary dev login: accepts phone number, creates user if not exists, returns JWT session token.
 */
router.post("/dev-login", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({
        error: "Bad Request",
        message: "A valid phone number string is required.",
      });
    }

    const normalizedPhone = phone.trim();

    // Look for existing user with authId === phone
    let user = await User.findOne({ authId: normalizedPhone });

    if (!user) {
      user = await User.create({
        authId: normalizedPhone,
        name: "Dev User",
        dob: new Date("2000-01-01"),
        gender: "prefer_not_to_say",
        city: "Bangalore",
        intent: ["networking"],
      });
    }

    const secret = process.env.JWT_SECRET || "connectlocal_dev_secret_key_2026";
    const token = jwt.sign(
      {
        id: user._id.toString(),
        userId: user._id.toString(),
        authId: user.authId,
      },
      secret,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Dev login successful",
      token,
      user: {
        id: user._id,
        authId: user.authId,
        name: user.name,
        city: user.city,
      },
    });
  } catch (err) {
    console.error("[auth] dev-login error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Sample protected route to verify auth middleware and req.user.id
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: "ok",
      user: {
        id: user._id,
        authId: user.authId,
        name: user.name,
        city: user.city,
        intent: user.intent,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

module.exports = router;
