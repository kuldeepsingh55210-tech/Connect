const express = require("express");
const { User, Connection } = require("../../models");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

/**
 * GET /api/discover
 * Protected by requireAuth.
 *
 * Tier 1: Users in same city AND sharing at least 1 skill or interest.
 * Tier 2: Users in ANY other city sharing at least 1 skill or interest, excluding Tier 1.
 *
 * Exclusions:
 * - The requesting user themselves
 * - Any user with status != 'active'
 * - Any user with an 'accepted' connection with the requesting user (already connected)
 * - Any user with a 'blocked' connection with the requesting user in either direction
 * - Users with 'pending', 'ignored', or 'unmatched' connections remain eligible
 *
 * Sorting within tiers:
 *   (a) count of overlapping skills+interests descending
 *   (b) lastActiveAt descending as tiebreaker
 * Limit: 20 per tier
 *
 * Response shape:
 * {
 *   tier1: [ { id, name, city, photoUrl, skills, interests, intent, sharedCount } ],
 *   tier2: [ ... same shape ... ]
 * }
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User not found.",
      });
    }

    if (!currentUser.profileCompleted) {
      return res.status(403).json({
        error: "PROFILE_REQUIRED",
        message: "Profile must be completed before accessing Discover.",
      });
    }

    const userSkillsSet = new Set(currentUser.skills || []);
    const userInterestsSet = new Set(currentUser.interests || []);

    const skillOrInterestFilter = [];
    if (currentUser.skills && currentUser.skills.length > 0) {
      skillOrInterestFilter.push({ skills: { $in: currentUser.skills } });
    }
    if (currentUser.interests && currentUser.interests.length > 0) {
      skillOrInterestFilter.push({ interests: { $in: currentUser.interests } });
    }

    if (skillOrInterestFilter.length === 0) {
      return res.status(200).json({
        tier1: [],
        tier2: [],
      });
    }

    // Find any user who has a 'blocked' or 'accepted' connection with the requesting user (either direction)
    const excludedConnections = await Connection.find({
      $or: [{ userA: currentUser._id }, { userB: currentUser._id }],
      status: { $in: ["blocked", "accepted"] },
    });

    const connectionExcludedUserIds = excludedConnections.map((conn) =>
      Connection.otherUserId(conn, currentUser._id)
    );

    const baseExcludedIds = [currentUser._id, ...connectionExcludedUserIds];

    // --- Tier 1: Same city + shared skill/interest ---
    const tier1Candidates = await User.find({
      _id: { $nin: baseExcludedIds },
      city: currentUser.city,
      status: "active",
      profileCompleted: true,
      $or: skillOrInterestFilter,
    });

    const scoredTier1 = tier1Candidates
      .map((candidate) => {
        const sharedSkills = (candidate.skills || []).filter((s) => userSkillsSet.has(s));
        const sharedInterests = (candidate.interests || []).filter((i) => userInterestsSet.has(i));
        const sharedCount = sharedSkills.length + sharedInterests.length;
        return { candidate, sharedCount, sharedSkills, sharedInterests };
      })
      .filter((item) => item.sharedCount > 0);

    scoredTier1.sort((a, b) => {
      if (b.sharedCount !== a.sharedCount) {
        return b.sharedCount - a.sharedCount;
      }
      return new Date(b.candidate.lastActiveAt || 0) - new Date(a.candidate.lastActiveAt || 0);
    });

    const tier1Results = scoredTier1.slice(0, 20).map(({ candidate, sharedCount, sharedSkills, sharedInterests }) => ({
      id: candidate._id,
      name: candidate.name,
      city: candidate.city,
      photoUrl: candidate.photoUrl,
      skills: candidate.skills,
      interests: candidate.interests,
      intent: candidate.intent,
      sharedCount,
      sharedSkills,
      sharedInterests,
    }));

    // --- Tier 2: Any other city + shared skill/interest, excluding Tier 1 & excluded connections ---
    const tier1CandidateIds = tier1Candidates.map((c) => c._id);
    const tier2ExcludedIds = [...baseExcludedIds, ...tier1CandidateIds];

    const tier2Candidates = await User.find({
      _id: { $nin: tier2ExcludedIds },
      city: { $ne: currentUser.city },
      status: "active",
      profileCompleted: true,
      $or: skillOrInterestFilter,
    });

    const scoredTier2 = tier2Candidates
      .map((candidate) => {
        const sharedSkills = (candidate.skills || []).filter((s) => userSkillsSet.has(s));
        const sharedInterests = (candidate.interests || []).filter((i) => userInterestsSet.has(i));
        const sharedCount = sharedSkills.length + sharedInterests.length;
        return { candidate, sharedCount, sharedSkills, sharedInterests };
      })
      .filter((item) => item.sharedCount > 0);

    scoredTier2.sort((a, b) => {
      if (b.sharedCount !== a.sharedCount) {
        return b.sharedCount - a.sharedCount;
      }
      return new Date(b.candidate.lastActiveAt || 0) - new Date(a.candidate.lastActiveAt || 0);
    });

    const tier2Results = scoredTier2.slice(0, 20).map(({ candidate, sharedCount, sharedSkills, sharedInterests }) => ({
      id: candidate._id,
      name: candidate.name,
      city: candidate.city,
      photoUrl: candidate.photoUrl,
      skills: candidate.skills,
      interests: candidate.interests,
      intent: candidate.intent,
      sharedCount,
      sharedSkills,
      sharedInterests,
    }));

    return res.status(200).json({
      tier1: tier1Results,
      tier2: tier2Results,
    });
  } catch (err) {
    console.error("[discover] GET / error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

module.exports = router;
