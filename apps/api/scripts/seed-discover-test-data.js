/**
 * apps/api/scripts/seed-discover-test-data.js
 *
 * EXPLICIT SEED RESET UTILITY ONLY.
 * NO TEST SCRIPT MAY IMPORT OR CALL THIS SCRIPT (or its exported seed() function).
 * Running this script resets Aarav, Rohan, Ananya, Kabir, and Neha in the database.
 * Use npm run seed:discover ONLY for manual developer database resets.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { connectDB } = require("../src/db/connect");
const { User } = require("../src/models");
const mongoose = require("mongoose");

/**
 * Seed script to create test users for Discover module verification:
 * - 2 users in Bangalore sharing "AI" skill (Aarav Sharma & Rohan Verma, Tier 1 for each other)
 * - 1 user in Bangalore with completely different skills/interests (Ananya Iyer, appears in neither tier)
 * - 2 users in Delhi sharing "AI" skill (Kabir Mehta & Neha Gupta, Tier 2 for Bangalore AI users)
 */
const seedUsers = [
  // User 1: Main dev user (Bangalore, AI)
  {
    authId: "+919876543210",
    name: "Aarav Sharma",
    dob: new Date("1998-05-15"),
    gender: "male",
    city: "Bangalore",
    area: null,
    photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
    about: "Building cool local networking products in Bangalore.",
    skills: ["AI", "Backend Dev"],
    interests: ["Gym", "Running"],
    intent: ["networking", "startup"],
    status: "active",
    profileCompleted: true,
    lastActiveAt: new Date(),
  },
  // User 2: Second Bangalore AI user (Tier 1 for Aarav)
  {
    authId: "+919876543201",
    name: "Rohan Verma",
    dob: new Date("1996-08-20"),
    gender: "male",
    city: "Bangalore",
    area: null,
    photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
    about: "Product leader exploring AI startups in Bangalore.",
    skills: ["AI", "Product"],
    interests: ["Football"],
    intent: ["startup", "networking"],
    status: "active",
    profileCompleted: true,
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  // User 3: Bangalore user with completely different skills/interests (Neither tier)
  {
    authId: "+919876543202",
    name: "Ananya Iyer",
    dob: new Date("2000-03-12"),
    gender: "female",
    city: "Bangalore",
    area: null,
    photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
    about: "Finance enthusiast and avid reader in Bangalore.",
    skills: ["Finance", "Sales"],
    interests: ["Yoga", "Reading"],
    intent: ["friendship"],
    status: "active",
    profileCompleted: true,
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60),
  },
  // User 4: Delhi AI user 1 (Tier 2 for Bangalore AI users)
  {
    authId: "+919876543203",
    name: "Kabir Mehta",
    dob: new Date("1995-11-28"),
    gender: "male",
    city: "Delhi",
    area: null,
    photoUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    about: "Data scientist working on AI models in Delhi.",
    skills: ["AI", "Data"],
    interests: ["Cricket"],
    intent: ["networking"],
    status: "active",
    profileCompleted: true,
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 45),
  },
  // User 5: Delhi AI user 2 (Tier 2 for Bangalore AI users)
  {
    authId: "+919876543204",
    name: "Neha Gupta",
    dob: new Date("1998-04-16"),
    gender: "female",
    city: "Delhi",
    area: null,
    photoUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80",
    about: "Frontend developer building AI user interfaces in Delhi.",
    skills: ["AI", "Frontend Dev"],
    interests: ["Music"],
    intent: ["startup"],
    status: "active",
    profileCompleted: true,
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 90),
  },
];

async function seed(shouldDisconnect = false) {
  console.log("=== SEEDING DISCOVER TEST DATA ===");
  await connectDB();

  for (const u of seedUsers) {
    const user = await User.findOneAndUpdate(
      { authId: u.authId },
      { $set: u },
      { upsert: true, new: true }
    );
    console.log(`Seeded user: ${user.name} (${user.city}) - Skills: [${user.skills.join(", ")}]`);
  }

  console.log("\nSuccessfully seeded all 5 test users.");
  if (shouldDisconnect) {
    await mongoose.disconnect();
    console.log("Database disconnected.\n");
  }
}

if (require.main === module) {
  seed(true).catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
}

module.exports = { seed, seedUsers };
