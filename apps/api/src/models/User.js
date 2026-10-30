const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ALL_SKILLS, ALL_INTERESTS, INTENTS } = require("../config/vocabulary");

const MIN_AGE = 18;

const UserSchema = new Schema(
  {
    // External auth provider UID (Firebase Auth / Clerk).
    // In dev auth, stores the phone number as a placeholder (TRD Section 6.1).
    authId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "Dev User",
    },
    // Required for age-gate enforcement (TRD 7.1). Validated at signup:
    // age = now - dob must be >= MIN_AGE.
    dob: {
      type: Date,
      default: () => new Date("2000-01-01"),
      validate: {
        validator: function (value) {
          if (!value) return true;
          const ageInMs = Date.now() - value.getTime();
          const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);
          return ageInYears >= MIN_AGE;
        },
        message: `User must be at least ${MIN_AGE} years old.`,
      },
    },
    gender: {
      type: String,
      enum: ["male", "female", "non_binary", "prefer_not_to_say"],
      default: "prefer_not_to_say",
    },
    // Hard filter for Discover (TRD Section 5). Always normalize casing on write
    city: {
      type: String,
      trim: true,
      index: true,
      default: "Bangalore",
    },
    // Reserved for future neighborhood-level granularity (e.g. "Connaught Place").
    // Not surfaced in MVP UI or used in any query yet.
    area: {
      type: String,
      trim: true,
      default: null,
    },
    // Cloudinary secure URL. Only set AFTER moderation passes (TRD Section 7.3).
    photoUrl: {
      type: String,
      default: null,
    },
    about: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    // Professional tags — controlled vocabulary only, no free text.
    skills: {
      type: [String],
      enum: ALL_SKILLS,
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "A maximum of 10 skills is allowed.",
      },
    },
    // Hobby tags — controlled vocabulary only, no free text.
    interests: {
      type: [String],
      enum: ALL_INTERESTS,
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "A maximum of 10 interests is allowed.",
      },
    },
    intent: {
      type: [String],
      enum: INTENTS,
      default: ["networking"],
      validate: {
        validator: (arr) => arr.length >= 1,
        message: "At least one intent must be selected.",
      },
    },
    status: {
      type: String,
      enum: ["active", "soft_deleted", "hidden_pending_review", "banned"],
      default: "active",
      index: true,
    },
    // Resets daily via scheduled job or lazy check in rate-limit middleware (TRD Section 6.2).
    dailyConnectCount: {
      type: Number,
      default: 0,
    },
    dailyConnectCountResetAt: {
      type: Date,
      default: Date.now,
    },
    // Rate limit: max 10 reports per user per rolling 24h (TRD Section 6.2 / 7.2)
    dailyReportCount: {
      type: Number,
      default: 0,
    },
    dailyReportCountResetAt: {
      type: Date,
      default: Date.now,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Soft-delete bookkeeping (TRD Section 7.5)
    deletedAt: {
      type: Date,
      default: null,
    },
    // Consent timestamp for Terms/Privacy Policy (TRD Section 7.6)
    consentAcceptedAt: {
      type: Date,
      default: null,
    },
    // Profile completion tracking (TRD Section 2 signup_started -> profile_completed)
    profileCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes powering Discover Tier 1 / Tier 2 queries (TRD 4.6)
UserSchema.index({ city: 1, skills: 1 });
UserSchema.index({ city: 1, interests: 1 });

// Never expose sensitive fields in API responses to OTHER users
UserSchema.methods.toPublicProfile = function () {
  return {
    id: this._id,
    name: this.name,
    city: this.city,
    photoUrl: this.photoUrl,
    about: this.about,
    skills: this.skills,
    interests: this.interests,
    intent: this.intent,
  };
};

// Full profile response for the authenticated user themselves
UserSchema.methods.toFullProfile = function () {
  return {
    id: this._id,
    _id: this._id,
    authId: this.authId,
    name: this.name,
    dob: this.dob,
    gender: this.gender,
    city: this.city,
    area: this.area,
    photoUrl: this.photoUrl,
    about: this.about,
    skills: this.skills,
    interests: this.interests,
    intent: this.intent,
    status: this.status,
    profileCompleted: this.profileCompleted,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);

