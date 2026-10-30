/**
 * apps/api/scripts/check-seed-untouched.js
 *
 * Seed Data Integrity & Immutability Verifier
 *
 * Takes a snapshot of all non-throwaway users, connections, and message counts
 * BEFORE a test run, and compares against the database AFTER the test run.
 * Exits with non-zero code if any field or count was modified.
 *
 * Usage:
 *   node scripts/check-seed-untouched.js snapshot
 *   node scripts/check-seed-untouched.js compare
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { connectDB } = require("../src/db/connect");
const { User, Connection, Message } = require("../src/models");

const SNAPSHOT_PATH = path.join(__dirname, ".seed-snapshot-temp.json");
const THROWAWAY_REGEX = /^\+9198765434\d{2}$/;

async function takeSnapshot() {
  await connectDB();

  // 1. Fetch all non-throwaway users
  const rawUsers = await User.find({ authId: { $not: THROWAWAY_REGEX } }).sort({ authId: 1 }).lean();
  const userMapById = new Map();

  const users = rawUsers.map((u) => {
    userMapById.set(u._id.toString(), u.authId);
    return {
      _id: u._id.toString(),
      authId: u.authId,
      name: u.name || "",
      city: u.city || "",
      about: u.about || "",
      skills: (u.skills || []).slice().sort(),
      interests: (u.interests || []).slice().sort(),
      intent: (u.intent || []).slice().sort(),
      photoUrl: u.photoUrl || null,
      status: u.status || "active",
      profileCompleted: Boolean(u.profileCompleted),
      updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : null,
    };
  });

  const nonThrowawayUserIds = Array.from(userMapById.keys()).map((id) => new mongoose.Types.ObjectId(id));

  // 2. Fetch connections between non-throwaway users only
  const rawConns = await Connection.find({
    userA: { $in: nonThrowawayUserIds },
    userB: { $in: nonThrowawayUserIds },
  }).sort({ _id: 1 }).lean();

  const connections = [];
  for (const c of rawConns) {
    const authA = userMapById.get(c.userA.toString()) || c.userA.toString();
    const authB = userMapById.get(c.userB.toString()) || c.userB.toString();
    const pair = [authA, authB].sort().join("<->");
    const initiatedByAuth = userMapById.get((c.initiatedBy || "").toString()) || (c.initiatedBy || "").toString();

    const messageCount = await Message.countDocuments({ connectionId: c._id });

    connections.push({
      connectionId: c._id.toString(),
      pair,
      status: c.status,
      initiatedBy: initiatedByAuth,
      messageCount,
    });
  }

  connections.sort((a, b) => a.pair.localeCompare(b.pair));

  return {
    timestamp: new Date().toISOString(),
    usersCount: users.length,
    users,
    connectionsCount: connections.length,
    connections,
  };
}

function compareSnapshots(before, after) {
  const diffs = [];

  // Compare user count
  if (before.usersCount !== after.usersCount) {
    diffs.push(`User count mismatch: before=${before.usersCount}, after=${after.usersCount}`);
  }

  const beforeUserMap = new Map(before.users.map((u) => [u.authId, u]));
  const afterUserMap = new Map(after.users.map((u) => [u.authId, u]));

  // Check for deleted users
  for (const [authId, uBefore] of beforeUserMap) {
    if (!afterUserMap.has(authId)) {
      diffs.push(`Seed user DELETED: ${uBefore.name} (${authId})`);
    }
  }

  // Check for newly added non-throwaway users
  for (const [authId, uAfter] of afterUserMap) {
    if (!beforeUserMap.has(authId)) {
      diffs.push(`Unexpected non-throwaway user CREATED: ${uAfter.name} (${authId})`);
    }
  }

  // Compare each seed user's fields
  for (const [authId, uBefore] of beforeUserMap) {
    const uAfter = afterUserMap.get(authId);
    if (!uAfter) continue;

    const fieldsToCompare = [
      "name",
      "city",
      "about",
      "photoUrl",
      "status",
      "profileCompleted",
      "updatedAt",
    ];

    for (const field of fieldsToCompare) {
      if (uBefore[field] !== uAfter[field]) {
        diffs.push(
          `User ${uBefore.name} (${authId}) field "${field}" CHANGED: before="${uBefore[field]}", after="${uAfter[field]}"`
        );
      }
    }

    // Compare arrays
    const arrayFields = ["skills", "interests", "intent"];
    for (const arrField of arrayFields) {
      const beforeStr = JSON.stringify(uBefore[arrField]);
      const afterStr = JSON.stringify(uAfter[arrField]);
      if (beforeStr !== afterStr) {
        diffs.push(
          `User ${uBefore.name} (${authId}) array "${arrField}" CHANGED: before=${beforeStr}, after=${afterStr}`
        );
      }
    }
  }

  // Compare connections
  if (before.connectionsCount !== after.connectionsCount) {
    diffs.push(`Connection count mismatch: before=${before.connectionsCount}, after=${after.connectionsCount}`);
  }

  const beforeConnMap = new Map(before.connections.map((c) => [c.pair, c]));
  const afterConnMap = new Map(after.connections.map((c) => [c.pair, c]));

  for (const [pair, cBefore] of beforeConnMap) {
    const cAfter = afterConnMap.get(pair);
    if (!cAfter) {
      diffs.push(`Seed connection DELETED for pair: ${pair}`);
      continue;
    }

    if (cBefore.status !== cAfter.status) {
      diffs.push(`Connection status CHANGED for ${pair}: before="${cBefore.status}", after="${cAfter.status}"`);
    }
    if (cBefore.messageCount !== cAfter.messageCount) {
      diffs.push(
        `Message count CHANGED for ${pair}: before=${cBefore.messageCount}, after=${cAfter.messageCount}`
      );
    }
  }

  for (const [pair] of afterConnMap) {
    if (!beforeConnMap.has(pair)) {
      diffs.push(`Unexpected connection CREATED for seed pair: ${pair}`);
    }
  }

  return diffs;
}

async function main() {
  const mode = (process.argv[2] || "").toLowerCase();

  if (mode === "snapshot") {
    console.log("=== TAKING PRE-RUN SEED DATA SNAPSHOT ===");
    const snapshot = await takeSnapshot();
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`Snapshot saved to ${SNAPSHOT_PATH}:`);
    console.log(`  - Non-throwaway users: ${snapshot.usersCount}`);
    console.log(`  - Non-throwaway connections: ${snapshot.connectionsCount}`);
    const totalMsgs = snapshot.connections.reduce((acc, c) => acc + c.messageCount, 0);
    console.log(`  - Total messages in seed threads: ${totalMsgs}`);
    console.log("Snapshot successfully captured.\n");
    await mongoose.disconnect();
    process.exit(0);
  }

  if (mode === "compare" || mode === "verify") {
    console.log("=== COMPARING CURRENT SEED STATE AGAINST SNAPSHOT ===");
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      console.error(`ERROR: Snapshot file not found at ${SNAPSHOT_PATH}. Run 'snapshot' first.`);
      process.exit(1);
    }

    const before = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    const after = await takeSnapshot();
    const diffs = compareSnapshots(before, after);

    console.log(`\nComparison Results:`);
    console.log(`  - Before: ${before.usersCount} users, ${before.connectionsCount} connections`);
    console.log(`  - After:  ${after.usersCount} users, ${after.connectionsCount} connections`);

    if (diffs.length > 0) {
      console.error("\n❌ SEED DATA INTEGRITY FAILED! The following mutations were detected:");
      diffs.forEach((d, i) => console.error(`   ${i + 1}. ${d}`));
      await mongoose.disconnect();
      process.exit(1);
    } else {
      console.log("\n===========================================================");
      console.log("✅ SEED DATA INTEGRITY VERIFIED: ZERO CHANGES (Diff is empty)");
      console.log(`   - ${after.usersCount} non-throwaway users checked: 0 modified`);
      console.log(`   - ${after.connectionsCount} non-throwaway connections checked: 0 modified`);
      console.log("   - Thread message counts checked: 0 modified");
      console.log("===========================================================\n");
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  console.log("Usage: node scripts/check-seed-untouched.js [snapshot|compare]");
  process.exit(1);
}

main().catch((err) => {
  console.error("Snapshot error:", err);
  process.exit(1);
});
