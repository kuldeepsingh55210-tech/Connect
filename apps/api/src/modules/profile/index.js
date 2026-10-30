// TEMPORARY — replace with real Cloudinary upload + moderation before public launch. See TRD Section 7.3.

const express = require("express");
const mongoose = require("mongoose");
const { User } = require("../../models");
const { requireAuth } = require("../../middleware/auth");
const { ALL_SKILLS, ALL_INTERESTS, INTENTS } = require("../../config/vocabulary");
const { uploadImageStream } = require("../../config/cloudinary");
const { handlePhotoUpload } = require("../../middleware/upload");

const router = express.Router();
const MIN_AGE = 18;
const ALLOWED_GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"];

/**
 * Helper to normalize city casing on write (e.g. "bangalore" -> "Bangalore", "new delhi" -> "New Delhi")
 * Per TRD Section 4.1 & 5.
 */
function normalizeCity(city) {
  if (!city || typeof city !== "string") return "";
  return city
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Calculate age in full years from date of birth.
 */
function calculateAge(dobDate) {
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const m = today.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * POST /api/users
 * Create the profile for the logged-in user (req.user.id).
 * Required: name, dob, gender, city, skills[], interests[], intent[]
 * Optional: photoUrl, about (max 300 chars)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User account not found.",
      });
    }

    // 1. Reject if profile already exists for this user (409 Conflict)
    if (user.profileCompleted) {
      return res.status(409).json({
        error: "CONFLICT",
        message: "A profile already exists for this user.",
      });
    }

    const { name, dob, gender, city, skills, interests, intent, photoUrl, about } = req.body;

    // 2. Validate required fields presence
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "name is required and must be a non-empty string.",
      });
    }
    if (name.trim().length > 60) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "name cannot exceed 60 characters.",
      });
    }

    if (!dob) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "dob (date of birth) is required.",
      });
    }

    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "A valid date of birth (dob) is required.",
      });
    }

    // 3. Reject if age < 18 (HTTP 403, clean error before Mongoose schema validator)
    const age = calculateAge(birthDate);
    const ageInMs = Date.now() - birthDate.getTime();
    const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);
    if (age < MIN_AGE || ageInYears < MIN_AGE) {
      return res.status(403).json({
        error: "AGE_RESTRICTED",
        message: "You must be 18 or older to join.",
      });
    }

    // 4. Validate gender
    if (!gender || !ALLOWED_GENDERS.includes(gender)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: `gender is required and must be one of: ${ALLOWED_GENDERS.join(", ")}`,
      });
    }

    // 5. Validate city
    if (!city || typeof city !== "string" || !city.trim()) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "city is required and must be a non-empty string.",
      });
    }

    // 6. Validate skills against controlled vocabulary
    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "skills is required and must be a non-empty array.",
      });
    }
    if (skills.length > 10) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "A maximum of 10 skills is allowed.",
      });
    }
    const invalidSkill = skills.find((s) => !ALL_SKILLS.includes(s));
    if (invalidSkill) {
      return res.status(400).json({
        error: "INVALID_VOCABULARY",
        message: `Invalid skill tag: '${invalidSkill}'. Must be selected from controlled vocabulary.`,
      });
    }

    // 7. Validate interests against controlled vocabulary
    if (!Array.isArray(interests) || interests.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "interests is required and must be a non-empty array.",
      });
    }
    if (interests.length > 10) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "A maximum of 10 interests is allowed.",
      });
    }
    const invalidInterest = interests.find((i) => !ALL_INTERESTS.includes(i));
    if (invalidInterest) {
      return res.status(400).json({
        error: "INVALID_VOCABULARY",
        message: `Invalid interest tag: '${invalidInterest}'. Must be selected from controlled vocabulary.`,
      });
    }

    // 8. Validate intent
    if (!Array.isArray(intent) || intent.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "intent is required and must be a non-empty array.",
      });
    }
    const invalidIntent = intent.find((item) => !INTENTS.includes(item));
    if (invalidIntent) {
      return res.status(400).json({
        error: "INVALID_VOCABULARY",
        message: `Invalid intent tag: '${invalidIntent}'. Must be one of: ${INTENTS.join(", ")}`,
      });
    }

    // 9. Validate optional fields
    if (about !== undefined && about !== null) {
      if (typeof about !== "string") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "about must be a string.",
        });
      }
      if (about.trim().length > 300) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "about cannot exceed 300 characters.",
        });
      }
    }

    // TEMPORARY — replace with real Cloudinary upload + moderation before public launch. See TRD Section 7.3.
    if (photoUrl !== undefined && photoUrl !== null && typeof photoUrl !== "string") {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "photoUrl must be a string.",
      });
    }

    // Populate user profile and save
    user.name = name.trim();
    user.dob = birthDate;
    user.gender = gender;
    user.city = normalizeCity(city);
    user.skills = [...new Set(skills)];
    user.interests = [...new Set(interests)];
    user.intent = [...new Set(intent)];
    user.about = about ? about.trim() : "";
    user.photoUrl = photoUrl || user.photoUrl || null;
    user.profileCompleted = true;

    await user.save();

    const fullProfile = user.toFullProfile();
    return res.status(201).json({
      message: "Profile created successfully",
      profile: fullProfile,
      ...fullProfile,
    });
  } catch (err) {
    console.error("[profile] POST / error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * POST /api/users/me/photo
 * Protected by requireAuth.
 * Uploads user profile photo to Cloudinary ('connectlocal/profile-photos')
 * and updates user.photoUrl in MongoDB.
 */
// TEMPORARY — add Cloudinary moderation add-on before public launch. See TRD Section 7.3.
router.post("/me/photo", requireAuth, handlePhotoUpload, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User account not found.",
      });
    }

    // Upload buffer to Cloudinary
    const result = await uploadImageStream(req.file.buffer, {
      public_id: `user_${user._id}_${Date.now()}`,
    });

    user.photoUrl = result.secure_url;
    await user.save();

    return res.status(200).json({
      message: "Photo uploaded successfully",
      photoUrl: result.secure_url,
    });
  } catch (err) {
    console.error("[profile] POST /me/photo error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message || "Failed to upload photo to Cloudinary.",
    });
  }
});

/**
 * GET /api/users/me
 * Return the logged-in user's own full profile.
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User account not found.",
      });
    }

    if (!user.profileCompleted) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Profile not found. Please create your profile first.",
      });
    }

    const fullProfile = user.toFullProfile();
    return res.status(200).json({
      profile: fullProfile,
      ...fullProfile,
    });
  } catch (err) {
    console.error("[profile] GET /me error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * PATCH /api/users/me
 * Update any subset of: name, city, skills, interests, intent, photoUrl, about.
 * Do not allow updating dob or gender through this route once set.
 */
router.patch("/me", requireAuth, async (req, res) => {
  try {
    // Reject immediately if dob or gender is in the request body
    if (req.body.dob !== undefined || req.body.gender !== undefined) {
      return res.status(400).json({
        error: "FORBIDDEN_FIELD_UPDATE",
        message: "Updating 'dob' or 'gender' is not allowed through this route once set. Age and gender changes must go through a separate verified flow.",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User account not found.",
      });
    }

    if (!user.profileCompleted) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Profile not found. Please create your profile first.",
      });
    }

    const { name, city, skills, interests, intent, photoUrl, about } = req.body;

    if (
      name === undefined &&
      city === undefined &&
      skills === undefined &&
      interests === undefined &&
      intent === undefined &&
      photoUrl === undefined &&
      about === undefined
    ) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "No valid profile fields provided for update.",
      });
    }

    // Validate and update fields
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "name must be a non-empty string.",
        });
      }
      if (name.trim().length > 60) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "name cannot exceed 60 characters.",
        });
      }
      user.name = name.trim();
    }

    if (city !== undefined) {
      if (typeof city !== "string" || !city.trim()) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "city must be a non-empty string.",
        });
      }
      user.city = normalizeCity(city);
    }

    if (skills !== undefined) {
      if (!Array.isArray(skills) || skills.length === 0) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "skills must be a non-empty array.",
        });
      }
      if (skills.length > 10) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "A maximum of 10 skills is allowed.",
        });
      }
      const invalidSkill = skills.find((s) => !ALL_SKILLS.includes(s));
      if (invalidSkill) {
        return res.status(400).json({
          error: "INVALID_VOCABULARY",
          message: `Invalid skill tag: '${invalidSkill}'. Must be selected from controlled vocabulary.`,
        });
      }
      user.skills = [...new Set(skills)];
    }

    if (interests !== undefined) {
      if (!Array.isArray(interests) || interests.length === 0) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "interests must be a non-empty array.",
        });
      }
      if (interests.length > 10) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "A maximum of 10 interests is allowed.",
        });
      }
      const invalidInterest = interests.find((i) => !ALL_INTERESTS.includes(i));
      if (invalidInterest) {
        return res.status(400).json({
          error: "INVALID_VOCABULARY",
          message: `Invalid interest tag: '${invalidInterest}'. Must be selected from controlled vocabulary.`,
        });
      }
      user.interests = [...new Set(interests)];
    }

    if (intent !== undefined) {
      if (!Array.isArray(intent) || intent.length === 0) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "intent must be a non-empty array.",
        });
      }
      const invalidIntent = intent.find((item) => !INTENTS.includes(item));
      if (invalidIntent) {
        return res.status(400).json({
          error: "INVALID_VOCABULARY",
          message: `Invalid intent tag: '${invalidIntent}'. Must be one of: ${INTENTS.join(", ")}`,
        });
      }
      user.intent = [...new Set(intent)];
    }

    if (about !== undefined) {
      if (about !== null && typeof about !== "string") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "about must be a string.",
        });
      }
      const trimmed = about ? about.trim() : "";
      if (trimmed.length > 300) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "about cannot exceed 300 characters.",
        });
      }
      user.about = trimmed;
    }

    // TEMPORARY — replace with real Cloudinary upload + moderation before public launch. See TRD Section 7.3.
    if (photoUrl !== undefined) {
      if (photoUrl !== null && typeof photoUrl !== "string") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "photoUrl must be a string.",
        });
      }
      user.photoUrl = photoUrl;
    }

    await user.save();

    const fullProfile = user.toFullProfile();
    return res.status(200).json({
      message: "Profile updated successfully",
      profile: fullProfile,
      ...fullProfile,
    });
  } catch (err) {
    console.error("[profile] PATCH /me error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * GET /api/users/:id
 * Protected by requireAuth.
 * Returns public profile shape: id, name, city, photoUrl, skills, interests, intent, about.
 * Returns 404 if not found or status !== 'active' or !profileCompleted.
 * Never returns dob, gender, authId, or any private field.
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User not found.",
      });
    }

    const user = await User.findById(id);

    if (!user || user.status !== "active" || !user.profileCompleted) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User not found or inactive.",
      });
    }

    return res.status(200).json({
      id: user._id,
      name: user.name,
      city: user.city,
      photoUrl: user.photoUrl,
      skills: user.skills || [],
      interests: user.interests || [],
      intent: user.intent || [],
      about: user.about || "",
    });
  } catch (err) {
    console.error("[profile] GET /:id error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

module.exports = router;
