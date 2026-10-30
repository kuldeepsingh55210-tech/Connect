/**
 * apps/api/scripts/lib/throwaway.js
 *
 * Shared Throwaway User Guard & Lifecycle Helper
 *
 * Guarantees that automated test suites:
 * 1. ONLY interact with throwaway phone numbers in the reserved range +919876543401 to +919876543499.
 * 2. NEVER modify, overwrite, reset, or delete real seed accounts (Aarav, Priya, Rohan, Neha, Kabir, etc.).
 * 3. Scope all deletions strictly to target throwaway user IDs (NO deleteMany without filter).
 * 4. Refuse execution when NODE_ENV is "production".
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const { connectDB } = require("../../src/db/connect");
const { User, Connection, Message, Report, Notification } = require("../../src/models");
const { ALL_SKILLS, ALL_INTERESTS, INTENTS } = require("../../src/config/vocabulary");

async function ensureConnected() {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }
}

// Production safety guard
function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: Refusing to run throwaway test helper in production environment!");
  }
}

// Known seed accounts that must NEVER be touched by any test script
const SEED_AUTH_IDS = new Set([
  "+919876543201", // Rohan Verma
  "+919876543202", // Ananya Iyer
  "+919876543203", // Kabir Mehta
  "+919876543204", // Neha Gupta
  "+919876543210", // Aarav Sharma
  "+919876543211", // Dev User
  "+919876543215", // Priya Sharma (Delhi)
  "+919876543219", // divya sharma
  "+919876543287", // Priya Sharma (duplicate seed)
  "+919876543299", // priya (Bhopal)
  "+919876513514", // Rohan Mehra
  "+919876521142", // Cloudinary Test User
  "+919876542701", // Dev User
  "+919876543301", // Aanya Sen
  "+919876543302", // Vikram Das
  "+919876549684", // Dev User
  "+919999999999", // Dev User
  "919876543203",  // Dev User (no +)
]);

/**
 * Reserved Throwaway Phone Number Registry (+919876543401 to +919876543499)
 *
 * Existing suites:
 * - Safety E2E:                401 - 417 (17 phones)
 * - Read Receipts E2E:         421 - 425 (5 phones)
 * - Mobile Read Receipts Flow: 431 - 433 (3 phones)
 * - Notifications E2E:         441 - 446 (6 phones)
 * - Mobile Notifications Flow: 451 - 453 (3 phones)
 *
 * Converted suites (newly allocated non-overlapping sub-ranges):
 * - API Profile Integration:       461 (1 phone)
 * - API Connections:               462 - 465 (4 phones)
 * - API Chat:                      466 - 468 (3 phones)
 * - API Trust & Safety:            469 - 473 (5 phones)
 * - API Photo Upload:              474 (1 phone)
 * - API Discover Integration:      475 - 480 (6 phones)
 * - Mobile Create Profile E2E:     481 (1 phone)
 * - Mobile Create Profile Photo:   482 (1 phone)
 * - Mobile Chat E2E:               483 - 484 (2 phones)
 * - Mobile Connections E2E:        485 - 487 (3 phones)
 * - Mobile Profile View E2E:       488 - 490 (3 phones)
 * - Mobile Signup Flow E2E:        491 - 493 (3 phones)
 * - Mobile Discover E2E:           494 - 496 (3 phones)
 */
function makePhone(suffix) {
  return `+919876543${String(suffix).padStart(3, "0")}`;
}

const RANGES = {
  SAFETY: Array.from({ length: 17 }, (_, i) => makePhone(401 + i)),
  READ_RECEIPTS: Array.from({ length: 5 }, (_, i) => makePhone(421 + i)),
  MOBILE_READ_RECEIPTS_FLOW: Array.from({ length: 3 }, (_, i) => makePhone(431 + i)),
  NOTIFICATIONS: Array.from({ length: 6 }, (_, i) => makePhone(441 + i)),
  MOBILE_NOTIFICATIONS_FLOW: Array.from({ length: 3 }, (_, i) => makePhone(451 + i)),

  PROFILE: [makePhone(461)],
  API_CONNECTIONS: Array.from({ length: 4 }, (_, i) => makePhone(462 + i)),
  API_CHAT: Array.from({ length: 3 }, (_, i) => makePhone(466 + i)),
  API_TRUST_SAFETY: Array.from({ length: 5 }, (_, i) => makePhone(469 + i)),
  API_PHOTO_UPLOAD: [makePhone(474)],
  API_DISCOVER: Array.from({ length: 6 }, (_, i) => makePhone(475 + i)),

  MOBILE_CREATE_PROFILE: [makePhone(481)],
  MOBILE_CREATE_PROFILE_PHOTO: [makePhone(482)],
  MOBILE_CHAT: Array.from({ length: 2 }, (_, i) => makePhone(483 + i)),
  MOBILE_CONNECTIONS: Array.from({ length: 4 }, (_, i) => makePhone(485 + i)),
  MOBILE_PROFILE_VIEW: Array.from({ length: 3 }, (_, i) => makePhone(489 + i)),
  MOBILE_SIGNUP_FLOW: Array.from({ length: 3 }, (_, i) => makePhone(492 + i)),
  MOBILE_DISCOVER: Array.from({ length: 3 }, (_, i) => makePhone(495 + i)),
};

/**
 * Validates that a phone number is inside the reserved throwaway range
 * and not belonging to any known seed account. Throws immediately on violation.
 */
function assertThrowaway(phone) {
  assertNotProduction();

  if (!phone || typeof phone !== "string") {
    throw new Error(`SAFETY VIOLATION: Phone number must be a non-empty string. Received: ${phone}`);
  }

  const normalized = phone.trim();

  if (SEED_AUTH_IDS.has(normalized)) {
    throw new Error(`CRITICAL SAFETY VIOLATION: Phone ${normalized} is a protected seed user! Tests must never use seed phones.`);
  }

  // Must match +919876543401 to +919876543499
  const match = normalized.match(/^\+9198765434(\d{2})$/);
  if (!match) {
    throw new Error(
      `SAFETY VIOLATION: Phone ${normalized} is outside the reserved throwaway range (+919876543401 to +919876543499)!`
    );
  }

  const suffix = parseInt(match[1], 10);
  if (suffix < 1 || suffix > 99) {
    throw new Error(`SAFETY VIOLATION: Phone suffix ${suffix} is out of bounds (1..99).`);
  }

  return normalized;
}

/**
 * Creates or resets a throwaway user in the database using valid controlled vocabulary.
 */
async function createThrowawayUser(phone, overrides = {}) {
  assertNotProduction();
  const validPhone = assertThrowaway(phone);
  await ensureConnected();

  const defaultSkills = ["AI", "Backend Dev"];
  const defaultInterests = ["Gym", "Running"];
  const defaultIntent = ["networking"];

  // Validate vocabulary if overrides are specified
  if (overrides.skills) {
    for (const s of overrides.skills) {
      if (!ALL_SKILLS.includes(s)) {
        throw new Error(`Invalid skill tag in throwaway user creation: "${s}"`);
      }
    }
  }
  if (overrides.interests) {
    for (const i of overrides.interests) {
      if (!ALL_INTERESTS.includes(i)) {
        throw new Error(`Invalid interest tag in throwaway user creation: "${i}"`);
      }
    }
  }
  if (overrides.intent) {
    for (const it of overrides.intent) {
      if (!INTENTS.includes(it)) {
        throw new Error(`Invalid intent in throwaway user creation: "${it}"`);
      }
    }
  }

  const doc = {
    authId: validPhone,
    name: overrides.name || `Throwaway ${validPhone.slice(-3)}`,
    dob: overrides.dob || new Date("1998-05-15"),
    gender: overrides.gender || "female",
    city: overrides.city || "Bangalore",
    area: overrides.area !== undefined ? overrides.area : null,
    photoUrl:
      overrides.photoUrl !== undefined
        ? overrides.photoUrl
        : "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
    about: overrides.about !== undefined ? overrides.about : "Throwaway test account.",
    skills: overrides.skills || defaultSkills,
    interests: overrides.interests || defaultInterests,
    intent: overrides.intent || defaultIntent,
    status: overrides.status || "active",
    profileCompleted: overrides.profileCompleted !== undefined ? overrides.profileCompleted : true,
    lastActiveAt: overrides.lastActiveAt || new Date(),
    dailyConnectCount: overrides.dailyConnectCount || 0,
    dailyReportCount: overrides.dailyReportCount || 0,
  };

  const user = await User.findOneAndUpdate(
    { authId: validPhone },
    { $set: doc },
    { upsert: true, new: true }
  );

  return user;
}

/**
 * Completely cleans up throwaway users and their associated records.
 * EVERY deletion query is strictly scoped by user ID IN (throwaway users).
 * Never issues un-scoped deleteMany({}).
 */
async function cleanupThrowaway(phones) {
  assertNotProduction();

  if (!phones || !Array.isArray(phones) || phones.length === 0) {
    throw new Error("cleanupThrowaway requires an array of throwaway phones to clean.");
  }

  await ensureConnected();

  // Validate every phone before proceeding
  const validatedPhones = phones.map((p) => assertThrowaway(p));

  const users = await User.find({ authId: { $in: validatedPhones } });
  const userIds = users.map((u) => u._id);

  if (userIds.length > 0) {
    // 1. Find connections where either participant is one of our throwaway users
    const connections = await Connection.find({
      $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }],
    });
    const connectionIds = connections.map((c) => c._id);

    // 2. Delete messages in those connections OR sent by those users
    if (connectionIds.length > 0) {
      await Message.deleteMany({
        $or: [
          { connectionId: { $in: connectionIds } },
          { senderId: { $in: userIds } },
        ],
      });
      // 3. Delete notifications tied to those connections OR users
      await Notification.deleteMany({
        $or: [
          { connectionId: { $in: connectionIds } },
          { userId: { $in: userIds } },
          { actorId: { $in: userIds } },
        ],
      });
      // 4. Delete the connections
      await Connection.deleteMany({ _id: { $in: connectionIds } });
    } else {
      await Message.deleteMany({ senderId: { $in: userIds } });
      await Notification.deleteMany({
        $or: [
          { userId: { $in: userIds } },
          { actorId: { $in: userIds } },
        ],
      });
    }

    // 5. Delete reports filed by or against these throwaway users
    await Report.deleteMany({
      $or: [
        { reporterId: { $in: userIds } },
        { reportedUserId: { $in: userIds } },
      ],
    });

    // 6. Delete the throwaway users by _id
    await User.deleteMany({ _id: { $in: userIds } });
  }

  // Final check: delete any remaining docs matching authId
  await User.deleteMany({ authId: { $in: validatedPhones } });
}

async function disconnectThrowaway() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  RANGES,
  SEED_AUTH_IDS,
  assertThrowaway,
  createThrowawayUser,
  cleanupThrowaway,
  disconnectThrowaway,
};
