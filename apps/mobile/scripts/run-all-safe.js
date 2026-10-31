/**
 * apps/mobile/scripts/run-all-safe.js
 *
 * Runs all safe & converted Mobile test suites in sequence.
 * Halts on first failure. Prints a one-line summary on completion.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const MOBILE_ROOT = path.resolve(__dirname, '..');

const SUITES = [
  { name: 'Signup Form Unit (test-signup.js)', file: 'scripts/test-signup.js' },
  { name: 'Create Profile E2E (test-create-profile-e2e.js)', file: 'scripts/test-create-profile-e2e.js' },
  { name: 'Create Profile Photo E2E (test-create-profile-photo-e2e.js)', file: 'scripts/test-create-profile-photo-e2e.js' },
  { name: 'Signup Flow & 409 E2E (test-signup-flow-e2e.js)', file: 'scripts/test-signup-flow-e2e.js' },
  { name: 'Discover E2E (test-discover-e2e.js)', file: 'scripts/test-discover-e2e.js' },
  { name: 'Discover Chips & Badges (test-discover-chips.js)', file: 'scripts/test-discover-chips.js' },
  { name: 'Profile View E2E (test-profile-view-e2e.js)', file: 'scripts/test-profile-view-e2e.js' },
  { name: 'Connections E2E (test-connections-e2e.js)', file: 'scripts/test-connections-e2e.js' },
  { name: 'Chat E2E (test-chat-e2e.js)', file: 'scripts/test-chat-e2e.js' },
  { name: 'Chat List E2E (test-chat-list-e2e.js)', file: 'scripts/test-chat-list-e2e.js' },
  { name: 'My Profile E2E (test-my-profile-e2e.js)', file: 'scripts/test-my-profile-e2e.js' },
  { name: 'Auth Session E2E (test-auth-session-e2e.js)', file: 'scripts/test-auth-session-e2e.js' },
  { name: 'Composer Focus (test-composer-focus.js)', file: 'scripts/test-composer-focus.js' },
  { name: 'Read Receipts Unit (test-read-receipts-unit.js)', file: 'scripts/test-read-receipts-unit.js' },
  { name: 'Read Receipts Flow (test-read-receipts-flow.js)', file: 'scripts/test-read-receipts-flow.js' },
  { name: 'Notifications Unit (test-notifications-unit.js)', file: 'scripts/test-notifications-unit.js' },
  { name: 'Notifications Flow (test-notifications-flow.js)', file: 'scripts/test-notifications-flow.js' },
  { name: 'No Placeholders Check (test-no-placeholders.js)', file: 'scripts/test-no-placeholders.js' },
  { name: 'Discover Empty State (test-discover-empty-state.js)', file: 'scripts/test-discover-empty-state.js' },
];

async function main() {
  console.log('====================================================');
  console.log(`RUNNING ALL SAFE MOBILE TEST SUITES (${SUITES.length} SUITES)`);
  console.log('====================================================\n');

  const startTime = Date.now();
  let passedCount = 0;

  for (let i = 0; i < SUITES.length; i++) {
    const suite = SUITES[i];
    console.log(`\n----------------------------------------------------`);
    console.log(`[${i + 1}/${SUITES.length}] Starting ${suite.name}...`);
    console.log(`----------------------------------------------------`);

    const result = spawnSync(process.execPath, [path.join(MOBILE_ROOT, suite.file)], {
      cwd: MOBILE_ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });

    if (result.status !== 0) {
      console.error(`\n❌ FAILED: ${suite.name} exited with status ${result.status}`);
      process.exit(result.status || 1);
    }

    passedCount++;
    console.log(`✅ PASSED: ${suite.name}`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedCount}/${SUITES.length} MOBILE TEST SUITES PASSED SAFELY in ${durationSec}s (zero seed modifications)`);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Test runner encountered unexpected error:', err);
  process.exit(1);
});
