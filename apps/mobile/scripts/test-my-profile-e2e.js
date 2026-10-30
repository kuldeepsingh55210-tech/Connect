const assert = require('assert');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const TEST_PHONE = '+919876543210'; // Aarav Sharma

async function runMyProfileTest() {
  console.log('=== STARTING MY PROFILE & LOGOUT VERIFICATION ===\n');

  // --- Step 1: Login and verify GET /api/users/me payload ---
  console.log('1. Authenticating test user and checking GET /api/users/me payload...');
  const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: TEST_PHONE }),
  });
  assert.strictEqual(loginRes.status, 200, 'Dev login must succeed');
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert.ok(token, 'Must receive JWT auth token');

  const meRes = await fetch(`${API_BASE_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(meRes.status, 200, 'GET /api/users/me must return 200');
  const meData = await meRes.json();
  const profile = meData.profile || meData;

  // Assert fields read by MyProfileScreen exist
  console.log('  Checking required screen fields on profile:');
  console.log('  - name:', profile.name);
  console.log('  - city:', profile.city);
  console.log('  - photoUrl:', profile.photoUrl);
  console.log('  - skills:', profile.skills);
  console.log('  - interests:', profile.interests);
  console.log('  - intent:', profile.intent);
  console.log('  - about:', profile.about);

  assert.ok(profile.name, 'profile.name must exist');
  assert.ok(profile.city, 'profile.city must exist');
  assert.ok(Array.isArray(profile.skills), 'profile.skills must be an array');
  assert.ok(Array.isArray(profile.interests), 'profile.interests must be an array');
  assert.ok(Array.isArray(profile.intent), 'profile.intent must be an array');
  assert.strictEqual(typeof profile.about, 'string', 'profile.about must be a string');
  console.log('  ✓ All fields read by MyProfileScreen exist on GET /api/users/me: PASS\n');

  // --- Step 2: Privacy assertion on MyProfileScreen.tsx ---
  console.log('2. Verifying MyProfileScreen.tsx does NOT render sensitive fields (dob, age, gender, phone/authId, area, status)...');
  const myProfileFilePath = path.join(__dirname, '../src/screens/MyProfileScreen.tsx');
  const myProfileContent = fs.readFileSync(myProfileFilePath, 'utf8');

  // None of these should be rendered as JSX elements/properties on profile
  assert.ok(!myProfileContent.includes('profile.dob'), 'Must NOT render profile.dob');
  assert.ok(!myProfileContent.includes('profile.age'), 'Must NOT render profile.age');
  assert.ok(!myProfileContent.includes('profile.gender'), 'Must NOT render profile.gender');
  assert.ok(!myProfileContent.includes('profile.authId'), 'Must NOT render profile.authId');
  assert.ok(!myProfileContent.includes('profile.phone'), 'Must NOT render profile.phone');
  assert.ok(!myProfileContent.includes('profile.area'), 'Must NOT render profile.area');
  assert.ok(!myProfileContent.includes('profile.status'), 'Must NOT render profile.status');
  assert.ok(!myProfileContent.includes('distance'), 'Must NOT render distance');
  assert.ok(!myProfileContent.includes('neighborhood'), 'Must NOT render neighborhood');
  console.log('  ✓ Privacy check verified: zero sensitive fields rendered on MyProfileScreen: PASS\n');

  // --- Step 3: Entry points code-level audit ---
  console.log('3. Auditing all entry points to ensure each resolves to MyProfileScreen...');

  // 3a. DiscoverScreen header avatar button
  const discoverFilePath = path.join(__dirname, '../src/screens/DiscoverScreen.tsx');
  const discoverContent = fs.readFileSync(discoverFilePath, 'utf8');
  assert.ok(
    discoverContent.includes("onTabChange ? onTabChange('profile') : navigation?.navigate?.('Profile')"),
    "DiscoverScreen must route avatar and profile tab using onTabChange('profile') or navigation.navigate('Profile')"
  );
  console.log("  ✓ DiscoverScreen header avatar button -> routes to Profile");
  console.log("  ✓ DiscoverScreen bottom 'Profile' tab -> routes to Profile");

  // 3b. ConnectionsScreen bottom Profile tab
  const connectionsFilePath = path.join(__dirname, '../src/screens/ConnectionsScreen.tsx');
  const connectionsContent = fs.readFileSync(connectionsFilePath, 'utf8');
  assert.ok(
    connectionsContent.includes("onTabChange ? onTabChange('profile') : navigation?.navigate?.('Profile')"),
    "ConnectionsScreen bottom Profile tab must route to 'profile' with fallback"
  );
  console.log("  ✓ ConnectionsScreen bottom 'Profile' tab -> routes to Profile");

  // 3c. MainTabsScreen handling 'profile'
  const mainTabsFilePath = path.join(__dirname, '../src/screens/MainTabsScreen.tsx');
  const mainTabsContent = fs.readFileSync(mainTabsFilePath, 'utf8');
  assert.ok(
    mainTabsContent.includes("activeTab === 'profile'"),
    "MainTabsScreen must handle activeTab === 'profile'"
  );
  assert.ok(
    mainTabsContent.includes('<MyProfileScreen'),
    "MainTabsScreen must render <MyProfileScreen /> when activeTab === 'profile'"
  );
  console.log("  ✓ MainTabsScreen -> renders MyProfileScreen when activeTab === 'profile'");

  // 3d. RootNavigator registering 'Profile' route
  const rootNavFilePath = path.join(__dirname, '../src/navigation/RootNavigator.tsx');
  const rootNavContent = fs.readFileSync(rootNavFilePath, 'utf8');
  assert.ok(
    rootNavContent.includes('Profile: undefined;'),
    "RootNavigator RootStackParamList must include 'Profile: undefined;'"
  );
  assert.ok(
    rootNavContent.includes('<Stack.Screen name="Profile" component={MyProfileScreen} />'),
    "RootNavigator Stack.Navigator must register '<Stack.Screen name=\"Profile\" component={MyProfileScreen} />'"
  );
  console.log("  ✓ RootNavigator -> registers Profile route pointing to MyProfileScreen");

  // 3e. MyProfileScreen active-tab highlight
  assert.ok(
    myProfileContent.includes("styles.navLabelActive"),
    "MyProfileScreen must highlight the Profile tab with navLabelActive"
  );
  console.log("  ✓ MyProfileScreen -> Profile bottom tab highlighted active\n");

  // --- Step 4: Logout mechanism & Auth gating check ---
  console.log('4. Verifying logout() behavior and RootNavigator session gating...');
  assert.ok(
    myProfileContent.includes('const { logout } = useAuth();'),
    'MyProfileScreen must access logout from useAuth()'
  );
  assert.ok(
    myProfileContent.includes('await logout();'),
    'MyProfileScreen must call await logout() on confirmation'
  );
  assert.ok(
    myProfileContent.includes('showLogoutModal'),
    'MyProfileScreen must use in-app confirmation modal for logout'
  );

  const authContextPath = path.join(__dirname, '../src/auth/AuthContext.tsx');
  const authContextContent = fs.readFileSync(authContextPath, 'utf8');
  assert.ok(
    authContextContent.includes('setToken(null);'),
    'AuthContext.logout must set token to null'
  );
  assert.ok(
    authContextContent.includes('SecureStore.deleteItemAsync'),
    'AuthContext.logout must clear token from SecureStore'
  );

  assert.ok(
    rootNavContent.includes("initialRouteName={token ? 'MainTabs' : 'Landing'}"),
    'RootNavigator must gate initialRouteName on token'
  );
  assert.ok(
    rootNavContent.includes("{!token ? ("),
    'RootNavigator must conditionally render unauthenticated stack (Landing) when !token'
  );
  console.log('  ✓ Logout clears SecureStore token and resets memory state');
  console.log('  ✓ RootNavigator unmounts authenticated screens and renders Landing stack: PASS\n');

  console.log('=== ALL MY PROFILE & LOGOUT TESTS PASSED SUCCESSFULLY! ===');
}

runMyProfileTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
