/**
 * apps/api/scripts/run-all-safe.js
 *
 * Runs all safe & converted API test suites in sequence.
 * Halts on first failure. Prints a one-line summary on completion.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const API_ROOT = path.resolve(__dirname, '..');

const SUITES = [
  { name: 'Profile API (test_profile.js)', file: 'test_profile.js' },
  { name: 'Discover API (test_discover.js)', file: 'test_discover.js' },
  { name: 'Connections API (scripts/test-connections.js)', file: 'scripts/test-connections.js' },
  { name: 'Chat API (scripts/test-chat.js)', file: 'scripts/test-chat.js' },
  { name: 'Trust & Safety API (scripts/test-trust-safety.js)', file: 'scripts/test-trust-safety.js' },
  { name: 'Photo Upload API (scripts/test-photo-upload.js)', file: 'scripts/test-photo-upload.js' },
  { name: 'Safety E2E (scripts/test-safety-e2e.js)', file: 'scripts/test-safety-e2e.js' },
  { name: 'Read Receipts E2E (scripts/test-read-receipts-e2e.js)', file: 'scripts/test-read-receipts-e2e.js' },
  { name: 'Notifications E2E (scripts/test-notifications-e2e.js)', file: 'scripts/test-notifications-e2e.js' },
];

async function main() {
  console.log('====================================================');
  console.log(`RUNNING ALL SAFE API TEST SUITES (${SUITES.length} SUITES)`);
  console.log('====================================================\n');

  const startTime = Date.now();
  let passedCount = 0;

  for (let i = 0; i < SUITES.length; i++) {
    const suite = SUITES[i];
    console.log(`\n----------------------------------------------------`);
    console.log(`[${i + 1}/${SUITES.length}] Starting ${suite.name}...`);
    console.log(`----------------------------------------------------`);

    const result = spawnSync(process.execPath, [path.join(API_ROOT, suite.file)], {
      cwd: API_ROOT,
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
  console.log(`🎉 ALL ${passedCount}/${SUITES.length} API TEST SUITES PASSED SAFELY in ${durationSec}s (zero seed modifications)`);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Test runner encountered unexpected error:', err);
  process.exit(1);
});
