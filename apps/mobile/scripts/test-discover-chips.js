const assert = require("assert");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";

// Pure frontend chip-computation logic as implemented in DiscoverScreen.tsx
function computeDisplayedChips(item, currentUser) {
  const sharedSet = new Set([
    ...(item.sharedSkills || []),
    ...(item.sharedInterests || []),
  ]);

  const checkIsShared = (tag) => {
    if (sharedSet.size > 0) return sharedSet.has(tag);
    if (!currentUser) return false;
    const skills = currentUser.skills || [];
    const interests = currentUser.interests || [];
    return skills.includes(tag) || interests.includes(tag);
  };

  const rawTags = [...(item.skills || []), ...(item.interests || [])];
  const uniqueRawTags = Array.from(new Set(rawTags));

  // Shared tags come first, then non-shared
  const sharedTags = uniqueRawTags.filter((tag) => checkIsShared(tag));
  const nonSharedTags = uniqueRawTags.filter((tag) => !checkIsShared(tag));
  const prioritizedTags = [...sharedTags, ...nonSharedTags];

  // Max 3 chips displayed
  const displayedChips = prioritizedTags.slice(0, 3);

  // Highlighting: each chip is highlighted ONLY if checkIsShared is true
  const chipResults = displayedChips.map((tag) => ({
    tag,
    isHighlighted: checkIsShared(tag),
  }));

  // Shared chips count displayed
  const sharedChipsCount = chipResults.filter((c) => c.isHighlighted).length;
  const hasMoreShared = (item.sharedCount || 0) > sharedChipsCount;
  const remainingTagsCount = Math.max(
    uniqueRawTags.length - displayedChips.length,
    (item.sharedCount || 0) - sharedChipsCount
  );

  return {
    chipResults,
    sharedChipsCount,
    hasMoreShared,
    remainingTagsCount,
    badgeCount: item.sharedCount,
  };
}

async function runTests() {
  console.log("=== STARTING DISCOVER CHIPS & BADGE VERIFICATION ===\n");

  // =========================================================================
  // TEST 1: User with 3 shared tags where 1 shared tag is 4th in raw order
  // =========================================================================
  console.log("Test 1: User with 3 shared tags where one shared tag is 4th in raw order...");
  const candidate1 = {
    skills: ["SkillA", "SkillB", "SkillC"], // raw order: 0, 1, 2
    interests: ["InterestD", "InterestE"], // raw order: 3, 4
    sharedSkills: ["SkillA", "SkillC"],
    sharedInterests: ["InterestD"], // 4th in raw order (index 3)
    sharedCount: 3,
  };

  const result1 = computeDisplayedChips(candidate1, null);
  console.log("Displayed chips:", result1.chipResults);
  console.log("Shared chips count:", result1.sharedChipsCount);
  console.log("Badge count:", result1.badgeCount);

  // Assertions:
  // Must show 3 chips
  assert.strictEqual(result1.chipResults.length, 3, "Must display 3 chips");
  // InterestD (4th in raw order) must appear in displayed chips
  const tagsShown1 = result1.chipResults.map((c) => c.tag);
  assert.ok(tagsShown1.includes("InterestD"), "InterestD (4th raw tag) must appear in displayed chips");
  // All 3 displayed chips must be highlighted
  assert.strictEqual(result1.chipResults.every((c) => c.isHighlighted), true, "All 3 shared chips must be highlighted");
  // InterestD must be highlighted
  const interestDChip = result1.chipResults.find((c) => c.tag === "InterestD");
  assert.strictEqual(interestDChip.isHighlighted, true, "InterestD must be highlighted");
  console.log("PASS: 4th tag appeared in displayed chips and is highlighted!\n");

  // =========================================================================
  // TEST 2: User with 0 shared tags in first 3 raw tags
  // =========================================================================
  console.log("Test 2: User with 0 shared tags in first 3 raw tags (no chip wrongly highlighted)...");
  // Sub-case A: 1 shared tag which is 4th in raw order
  const candidate2A = {
    skills: ["Unshared1", "Unshared2", "Unshared3"], // first 3 raw tags are unshared
    interests: ["SharedInterest"], // 4th raw tag is shared
    sharedSkills: [],
    sharedInterests: ["SharedInterest"],
    sharedCount: 1,
  };

  const result2A = computeDisplayedChips(candidate2A, null);
  console.log("Candidate 2A displayed chips:", result2A.chipResults);
  // Shared tag must be prioritized to first chip, remaining 2 unshared chips must NOT be highlighted
  assert.strictEqual(result2A.chipResults[0].tag, "SharedInterest");
  assert.strictEqual(result2A.chipResults[0].isHighlighted, true, "SharedInterest must be highlighted");
  assert.strictEqual(result2A.chipResults[1].isHighlighted, false, "Unshared chip 1 must NOT be highlighted");
  assert.strictEqual(result2A.chipResults[2].isHighlighted, false, "Unshared chip 2 must NOT be highlighted");

  // Sub-case B: 0 shared tags overall
  const candidate2B = {
    skills: ["Unshared1", "Unshared2", "Unshared3"],
    interests: ["Unshared4"],
    sharedSkills: [],
    sharedInterests: [],
    sharedCount: 0,
  };
  const result2B = computeDisplayedChips(candidate2B, null);
  console.log("Candidate 2B displayed chips (0 shared):", result2B.chipResults);
  // Verify that previous bug (idx === 0) is eliminated: index 0 MUST NOT be highlighted
  assert.strictEqual(result2B.chipResults[0].isHighlighted, false, "First chip must NOT be highlighted when unshared (idx === 0 bug fixed)");
  assert.strictEqual(result2B.chipResults.every((c) => !c.isHighlighted), true, "No chips should be highlighted for 0 shared");
  console.log("PASS: No chip is wrongly highlighted!\n");

  // =========================================================================
  // TEST 3: sharedCount > number of shared chips shown (+N chip condition)
  // =========================================================================
  console.log("Test 3: Candidate with 4 shared tags (only 3 chips can fit)...");
  const candidate3 = {
    skills: ["S1", "S2", "S3", "S4"],
    interests: ["I1", "I2"],
    sharedSkills: ["S1", "S2", "S3", "S4"],
    sharedInterests: [],
    sharedCount: 4,
  };
  const result3 = computeDisplayedChips(candidate3, null);
  console.log("Displayed chips:", result3.chipResults.map(c => c.tag));
  console.log("Badge count:", result3.badgeCount);
  console.log("Has more shared:", result3.hasMoreShared);
  console.log("Remaining tags count:", result3.remainingTagsCount);

  assert.strictEqual(result3.badgeCount, 4, "Badge count must stay as 4");
  assert.strictEqual(result3.sharedChipsCount, 3, "Only 3 shared chips can be displayed");
  assert.strictEqual(result3.hasMoreShared, true, "Must flag hasMoreShared as true");
  assert.strictEqual(result3.remainingTagsCount, 3, "Remaining tags count is total unique (6) - displayed (3) = 3");
  console.log("PASS: +N chip triggered with badge retaining full count!\n");

  // =========================================================================
  // TEST 4: Live GET /api/discover keys & privacy check
  // =========================================================================
  console.log("Test 4: Live GET /api/discover response keys & privacy check...");

  // Dev-login with test user (+919876543210 - Aarav Sharma)
  const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "+919876543210" }),
  });
  assert.strictEqual(loginRes.status, 200, "Login must succeed");
  const { token } = await loginRes.json();

  const discRes = await fetch(`${API_BASE_URL}/api/discover`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(discRes.status, 200, "Discover endpoint must return 200");
  const discData = await discRes.json();

  const expectedKeys = [
    "city",
    "id",
    "intent",
    "interests",
    "name",
    "photoUrl",
    "sharedCount",
    "sharedInterests",
    "sharedSkills",
    "skills",
  ].sort();

  const allCards = [...discData.tier1, ...discData.tier2];
  console.log(`Inspecting ${allCards.length} returned cards across Tier 1 and Tier 2...`);
  assert.ok(allCards.length > 0, "Discover feed must return cards");

  for (const card of allCards) {
    const cardKeys = Object.keys(card).sort();
    assert.deepStrictEqual(
      cardKeys,
      expectedKeys,
      `Keys for card ${card.name} (${card.id}) must match expected keys exactly`
    );

    // Verify types
    assert.ok(Array.isArray(card.sharedSkills), "sharedSkills must be an array");
    assert.ok(Array.isArray(card.sharedInterests), "sharedInterests must be an array");
    assert.strictEqual(
      card.sharedCount,
      card.sharedSkills.length + card.sharedInterests.length,
      "sharedCount must strictly equal sharedSkills.length + sharedInterests.length"
    );

    // Assert privacy: NONE of dob, gender, authId, phone, age
    assert.strictEqual(card.dob, undefined, "dob must NEVER be exposed");
    assert.strictEqual(card.gender, undefined, "gender must NEVER be exposed");
    assert.strictEqual(card.authId, undefined, "authId must NEVER be exposed");
    assert.strictEqual(card.phone, undefined, "phone must NEVER be exposed");
    assert.strictEqual(card.age, undefined, "age must NEVER be exposed");
    assert.strictEqual(card.exactAge, undefined, "exactAge must NEVER be exposed");
    assert.strictEqual(card.neighborhood, undefined, "neighborhood must NEVER be exposed");
    assert.strictEqual(card.distanceKm, undefined, "distanceKm must NEVER be exposed");
  }

  console.log("Sample card from API response:");
  console.log(JSON.stringify(allCards[0], null, 2));

  console.log("PASS: Response keys for every item match exactly and no sensitive fields leaked!\n");
  console.log("=== ALL DISCOVER CHIP & BADGE TESTS PASSED SUCCESSFULLY! ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
