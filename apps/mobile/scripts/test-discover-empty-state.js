/**
 * apps/mobile/scripts/test-discover-empty-state.js
 *
 * Unit tests for DiscoverScreen empty states:
 * 1. Unit test of getDiscoverEmptyState(tier1Count, tier2Count)
 *    - (3, 2) -> 'none'
 *    - (0, 2) -> 'tier1-empty'
 *    - (0, 0) -> 'all-empty'
 *    - (2, 0) -> 'none'
 * 2. Static verification of DiscoverScreen.tsx:
 *    - Asserts 'No one nearby yet' copy is rendered for all-empty state
 *    - Asserts 'Invite a friend to grow your city\'s network.' body copy is present
 *    - Asserts Share.share / platform share call exists
 *    - Asserts that no other user's city is used in the tier1-empty message (only current user's city)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

console.log('=== STARTING DISCOVER EMPTY STATE UNIT & STATIC TESTS ===\n');

// 1. Load exported getDiscoverEmptyState
const discoverScreenPath = path.resolve(__dirname, '../src/screens/DiscoverScreen.tsx');
assert(fs.existsSync(discoverScreenPath), 'DiscoverScreen.tsx exists');

const sourceCode = fs.readFileSync(discoverScreenPath, 'utf8');

const jsOutput = ts.transpileModule(sourceCode, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const moduleObj = { exports: {} };
const ctx = vm.createContext({
  require: (id) => {
    if (id.includes('theme')) {
      return {
        COLORS: {
          primary: '#000000',
          surfaceContainerLowest: '#ffffff',
          surfaceContainerLow: '#f3f3f4',
          surfaceContainerHighest: '#e2e2e3',
          onSurface: '#1a1c1d',
          onSurfaceVariant: '#47464b',
        },
        SPACING: { marginMobile: 16, md: 16, xl: 24 },
        BORDER_RADIUS: { full: 9999 },
      };
    }
    return {
      Platform: { OS: 'ios' },
      StyleSheet: { create: (s) => s },
      Animated: { Value: function () { this.interpolate = () => {}; } },
      useFocusEffect: () => {},
    };
  },
  module: moduleObj,
  exports: moduleObj.exports,
  console,
  Date,
  Set,
  Promise,
});

try {
  vm.runInContext(jsOutput, ctx);
} catch (err) {
  // Ignore React component instantiation issues; helper should already be exported
}

const getDiscoverEmptyState = moduleObj.exports.getDiscoverEmptyState;
assert.strictEqual(
  typeof getDiscoverEmptyState,
  'function',
  'getDiscoverEmptyState must be exported from DiscoverScreen.tsx'
);

// 2. Unit test: getDiscoverEmptyState logic
console.log('--- Test 1: getDiscoverEmptyState Pure Helper ---');

// Case 1: Both tiers have items -> 'none'
const stateBoth = getDiscoverEmptyState(3, 2);
assert.strictEqual(stateBoth, 'none', 'getDiscoverEmptyState(3, 2) must return "none"');
console.log('  ✓ (3, 2) => "none": PASS');

// Case 2: Tier 1 empty, Tier 2 has items -> 'tier1-empty'
const stateTier1Empty = getDiscoverEmptyState(0, 2);
assert.strictEqual(stateTier1Empty, 'tier1-empty', 'getDiscoverEmptyState(0, 2) must return "tier1-empty"');
console.log('  ✓ (0, 2) => "tier1-empty": PASS');

// Case 3: Both tiers empty -> 'all-empty'
const stateAllEmpty = getDiscoverEmptyState(0, 0);
assert.strictEqual(stateAllEmpty, 'all-empty', 'getDiscoverEmptyState(0, 0) must return "all-empty"');
console.log('  ✓ (0, 0) => "all-empty": PASS');

// Case 4: Tier 1 has items, Tier 2 empty -> 'none'
const stateTier2Empty = getDiscoverEmptyState(2, 0);
assert.strictEqual(stateTier2Empty, 'none', 'getDiscoverEmptyState(2, 0) must return "none"');
console.log('  ✓ (2, 0) => "none": PASS');

// 3. Static source audit of DiscoverScreen.tsx
console.log('\n--- Test 2: DiscoverScreen.tsx Static Code Assertions ---');

// Assertion 1: Full empty state copy
assert(
  sourceCode.includes('No one nearby yet'),
  'DiscoverScreen.tsx must contain title "No one nearby yet"'
);
console.log('  ✓ Title "No one nearby yet" is rendered: PASS');

assert(
  sourceCode.includes("Invite a friend to grow your city's network."),
  'DiscoverScreen.tsx must contain body "Invite a friend to grow your city\'s network."'
);
console.log('  ✓ Body "Invite a friend to grow your city\'s network." is rendered: PASS');

// Assertion 2: Share call exists for platform sharing
assert(
  sourceCode.includes('Share.share'),
  'DiscoverScreen.tsx must invoke Share.share for native platform sharing'
);
assert(
  sourceCode.includes('navigator.share') || sourceCode.includes('navigator.clipboard'),
  'DiscoverScreen.tsx must support web platform sharing / clipboard fallback'
);
console.log('  ✓ Platform share invocation (Share.share & web handling): PASS');

// Assertion 3: Share generic message and TODO comment
assert(
  sourceCode.includes('Join me on ConnectLocal'),
  'Share message must be "Join me on ConnectLocal"'
);
assert(
  /TODO.*(?:app link|launch)/i.test(sourceCode),
  'Must include a TODO comment that a real app link is needed before launch'
);
console.log('  ✓ Generic share message "Join me on ConnectLocal" and TODO comment present: PASS');

// Assertion 4: Tier 1 empty copy and current user city usage
assert(
  sourceCode.includes('shares your skills yet'),
  'DiscoverScreen.tsx must render tier1-empty title "No one in {city} shares your skills yet"'
);
assert(
  sourceCode.includes('Showing people in other cities with the same skills or interests.'),
  'DiscoverScreen.tsx must render tier1-empty subtitle sentence'
);

// Match the city interpolation in the tier1-empty card
const tier1TitleMatch = sourceCode.match(/No one in\s+\{([^}]+)\}\s+shares your skills yet/);
assert(
  tier1TitleMatch,
  'Tier 1 empty card must match "No one in {city} shares your skills yet"'
);

const cityExpression = tier1TitleMatch[1].trim();
console.log(`  ✓ Tier 1 empty city expression: "${cityExpression}"`);

// Assert city expression refers to currentUser or displayCity, and NEVER another user
assert(
  cityExpression === 'displayCity' ||
  cityExpression === 'currentUser?.city' ||
  cityExpression.includes('currentUser') ||
  cityExpression.includes('displayCity'),
  `City must come from current user's profile, but found: ${cityExpression}`
);

assert(
  !cityExpression.includes('item.city') &&
  !cityExpression.includes('tier1') &&
  !cityExpression.includes('tier2') &&
  !cityExpression.includes('otherUser'),
  'City must never come from discovered or other user data'
);
console.log('  ✓ Verified: City in tier1-empty comes solely from current user profile: PASS');

console.log('\n====================================================');
console.log('✅ ALL DISCOVER EMPTY STATE TESTS PASSED SUCCESSFULLY');
console.log('====================================================');

