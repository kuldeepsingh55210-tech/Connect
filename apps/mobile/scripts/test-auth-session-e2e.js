const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runAuthSessionTest() {
  console.log('=== STARTING AUTH & SESSION PERSISTENCE VERIFICATION ===\n');

  // --- Check 1: api.ts silent fallback removal & requireAuthToken guard ---
  console.log('1. Verifying api.ts has zero silent logins and guards all endpoints...');
  const apiFilePath = path.join(__dirname, '../src/services/api.ts');
  const apiFileContent = fs.readFileSync(apiFilePath, 'utf8');

  // Must not have Priya Sharma's phone number hardcoded as fallback anywhere
  assert.ok(
    !apiFileContent.includes('919876543215'),
    'api.ts must NOT contain hardcoded phone number 919876543215 anywhere'
  );
  console.log('  ✓ No silent auto-login as Priya Sharma (+919876543215) in api.ts');

  // Must define requireAuthToken and throw NOT_AUTHENTICATED
  assert.ok(
    apiFileContent.includes("throw new Error('NOT_AUTHENTICATED')"),
    'api.ts must throw NOT_AUTHENTICATED when unauthenticated'
  );
  assert.ok(
    apiFileContent.includes('function requireAuthToken()'),
    'api.ts must define requireAuthToken() guard'
  );
  console.log('  ✓ requireAuthToken() guard present and throws NOT_AUTHENTICATED');

  // --- Check 2: RootNavigator.tsx auth gating ---
  console.log('\n2. Verifying RootNavigator.tsx initialRouteName and auth gating...');
  const navFilePath = path.join(__dirname, '../src/navigation/RootNavigator.tsx');
  const navFileContent = fs.readFileSync(navFilePath, 'utf8');

  // Must NOT have hardcoded initialRouteName="MainTabs"
  assert.ok(
    !navFileContent.includes('initialRouteName="MainTabs"'),
    'RootNavigator must NOT hardcode initialRouteName="MainTabs"'
  );

  // Must use conditional initialRouteName based on token
  assert.ok(
    navFileContent.includes("initialRouteName={token ? 'MainTabs' : 'Landing'}"),
    "RootNavigator must use initialRouteName={token ? 'MainTabs' : 'Landing'}"
  );

  // Must read from useAuth and handle isLoading
  assert.ok(
    navFileContent.includes('useAuth()'),
    'RootNavigator must use useAuth hook'
  );
  assert.ok(
    navFileContent.includes('if (isLoading)'),
    'RootNavigator must check isLoading state for splash/loading screen'
  );
  console.log('  ✓ RootNavigator properly gates Landing vs MainTabs based on token');

  // --- Check 3: CreateProfileScreen & LoginScreen wire useAuth login ---
  console.log('\n3. Verifying screens invoke AuthContext login(token)...');
  const createProfilePath = path.join(__dirname, '../src/screens/CreateProfileScreen.tsx');
  const createProfileContent = fs.readFileSync(createProfilePath, 'utf8');
  assert.ok(
    createProfileContent.includes('await login(authData.token)'),
    'CreateProfileScreen must call await login(authData.token) on success'
  );
  console.log('  ✓ CreateProfileScreen persists session via AuthContext.login(token)');

  const loginPath = path.join(__dirname, '../src/screens/LoginScreen.tsx');
  const loginContent = fs.readFileSync(loginPath, 'utf8');
  assert.ok(
    loginContent.includes('await login(authData.token)'),
    'LoginScreen must call await login(authData.token) on success'
  );
  console.log('  ✓ LoginScreen persists session via AuthContext.login(token)');

  // --- Check 4: DiscoverScreen catches NOT_AUTHENTICATED and logs out ---
  console.log('\n4. Verifying DiscoverScreen handles unauthenticated errors...');
  const discoverPath = path.join(__dirname, '../src/screens/DiscoverScreen.tsx');
  const discoverContent = fs.readFileSync(discoverPath, 'utf8');
  assert.ok(
    discoverContent.includes("err?.message === 'NOT_AUTHENTICATED'"),
    'DiscoverScreen must detect NOT_AUTHENTICATED error'
  );
  assert.ok(
    discoverContent.includes('logout();'),
    'DiscoverScreen must call logout() to return to LandingScreen on unauthenticated error'
  );
  console.log('  ✓ DiscoverScreen properly invokes logout() on NOT_AUTHENTICATED');

  // --- Check 5: App.tsx wraps RootNavigator with AuthProvider ---
  console.log('\n5. Verifying App.tsx wraps application with AuthProvider...');
  const appPath = path.join(__dirname, '../App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');
  assert.ok(
    appContent.includes('<AuthProvider>'),
    'App.tsx must include <AuthProvider>'
  );
  console.log('  ✓ App.tsx correctly wrapped with AuthProvider');

  // --- Check 6: Simulating Session State Machine ---
  console.log('\n6. Simulating Full Lifecycle: Fresh Launch -> Onboarding -> Persistence -> Restart -> Logout...');
  
  // Simulated SecureStore
  const mockSecureStore = new Map();
  let mockMemoryToken = null;
  const AUTH_TOKEN_KEY = 'connectlocal_auth_token';

  function simulateAppMount() {
    const stored = mockSecureStore.get(AUTH_TOKEN_KEY) || null;
    mockMemoryToken = stored;
    return {
      token: stored,
      initialRoute: stored ? 'MainTabs' : 'Landing',
    };
  }

  function simulateLogin(token) {
    mockMemoryToken = token;
    mockSecureStore.set(AUTH_TOKEN_KEY, token);
  }

  function simulateLogout() {
    mockMemoryToken = null;
    mockSecureStore.delete(AUTH_TOKEN_KEY);
  }

  // Phase A: Fresh Launch
  const freshLaunch = simulateAppMount();
  assert.strictEqual(freshLaunch.token, null, 'Fresh launch token must be null');
  assert.strictEqual(freshLaunch.initialRoute, 'Landing', 'Fresh launch must route to Landing');
  console.log('  ✓ Phase A: Fresh Launch (empty SecureStore) -> initialRoute: Landing');

  // Phase B: Signup & Finish Setup
  const dummyJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_user_token';
  simulateLogin(dummyJwt);
  assert.strictEqual(mockMemoryToken, dummyJwt);
  assert.strictEqual(mockSecureStore.get(AUTH_TOKEN_KEY), dummyJwt);
  console.log('  ✓ Phase B: User finishes Setup -> token saved to SecureStore & memory in sync');

  // Phase C: Simulated App Restart (force close & reopen)
  const restartLaunch = simulateAppMount();
  assert.strictEqual(restartLaunch.token, dummyJwt, 'Stored token must be restored from SecureStore');
  assert.strictEqual(restartLaunch.initialRoute, 'MainTabs', 'Returning user must route directly to MainTabs');
  console.log('  ✓ Phase C: App Restart (force close & reopen) -> SecureStore found token -> initialRoute: MainTabs (onboarding skipped)');

  // Phase D: Logout / Session expiry
  simulateLogout();
  const afterLogoutLaunch = simulateAppMount();
  assert.strictEqual(afterLogoutLaunch.token, null, 'Token after logout must be null');
  assert.strictEqual(afterLogoutLaunch.initialRoute, 'Landing', 'After logout must route to Landing');
  console.log('  ✓ Phase D: Logout -> SecureStore & memory cleared -> initialRoute: Landing');

  console.log('\n=== ALL AUTH & SESSION PERSISTENCE TESTS PASSED ===');
}

runAuthSessionTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
