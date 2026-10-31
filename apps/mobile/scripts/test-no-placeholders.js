/**
 * apps/mobile/scripts/test-no-placeholders.js
 *
 * Pure static verification asserting that no fake Stitch content,
 * fake stats, decorative filter buttons, presence indicators, verified badges,
 * stale IPs, or leftover 'neighbors' copy exist in apps/mobile/src.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== STARTING NO PLACEHOLDERS STATIC SOURCE AUDIT ===\n');

const SRC_DIR = path.resolve(__dirname, '../src');

const FORBIDDEN_STRINGS = [
  '1,420',
  '12,400',
  'Woodcraft',
  'Ceramics',
  'Permaculture',
  'Craft & Skills',
  'OFFERINGS',
  'LEISURE',
  'Active in',
  'Suggest: Coffee',
  'STEP 1 OF 4',
  'STEP 3 OF 4',
  '10.146.195.195',
  'onlineDot',
  'verifiedBadge',
];

const EXCLUDED_LEGAL_FILES = ['screens/TermsScreen.tsx', 'screens/PrivacyScreen.tsx'];
const FORBIDDEN_COPY_STRINGS = ['neighbors', 'Neighbors'];

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (/\.(tsx?|jsx?)$/.test(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allSourceFiles = getAllFiles(SRC_DIR);
console.log(`Auditing ${allSourceFiles.length} source files in apps/mobile/src...\n`);

let failureCount = 0;

// 1. Scan for forbidden strings across all source files
for (const forbidden of FORBIDDEN_STRINGS) {
  let matchedFiles = [];
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes(forbidden)) {
      const relPath = path.relative(SRC_DIR, file).replace(/\\/g, '/');
      matchedFiles.push(relPath);
    }
  }

  if (matchedFiles.length > 0) {
    console.error(`❌ FAILED: Found forbidden string "${forbidden}" in: ${matchedFiles.join(', ')}`);
    failureCount++;
  } else {
    console.log(`  ✓ Passed: "${forbidden}" is completely absent`);
  }
}

// 2. Scan for copy strings outside TermsScreen and PrivacyScreen
for (const forbidden of FORBIDDEN_COPY_STRINGS) {
  let matchedFiles = [];
  for (const file of allSourceFiles) {
    const relPath = path.relative(SRC_DIR, file).replace(/\\/g, '/');
    if (EXCLUDED_LEGAL_FILES.some((ex) => relPath.endsWith(ex))) {
      continue;
    }
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes(forbidden)) {
      matchedFiles.push(relPath);
    }
  }

  if (matchedFiles.length > 0) {
    console.error(
      `❌ FAILED: Found forbidden string "${forbidden}" outside legal screens in: ${matchedFiles.join(', ')}`
    );
    failureCount++;
  } else {
    console.log(`  ✓ Passed: "${forbidden}" is completely absent outside legal screens`);
  }
}

// 3. Specific assertion: DiscoverScreen has no filter button (no 'options-outline' icon)
const discoverPath = path.join(SRC_DIR, 'screens/DiscoverScreen.tsx');
if (fs.existsSync(discoverPath)) {
  const discoverContent = fs.readFileSync(discoverPath, 'utf-8');
  if (discoverContent.includes('options-outline')) {
    console.error(`❌ FAILED: DiscoverScreen.tsx contains "options-outline" filter icon`);
    failureCount++;
  } else {
    console.log(`  ✓ Passed: DiscoverScreen.tsx has no "options-outline" filter button`);
  }
} else {
  console.error(`❌ FAILED: DiscoverScreen.tsx not found at ${discoverPath}`);
  failureCount++;
}

console.log('\n====================================================');
if (failureCount > 0) {
  console.error(`❌ AUDIT FAILED with ${failureCount} placeholder violation(s).`);
  process.exit(1);
} else {
  console.log(`✅ AUDIT PASSED: Zero Stitch placeholders, badges, presence dots, or stale copy.`);
  console.log('====================================================');
}
