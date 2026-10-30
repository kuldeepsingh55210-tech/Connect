const assert = require('assert');

// 1. Logic extracted directly from SignupScreen.tsx
function calculateAge(dob) {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function validateSignupForm({ name, dob, gender, city }) {
  const isNameEmpty = !name || name.trim().length === 0;
  const isNameValid = !isNameEmpty;

  const isDobEmpty = !dob;
  const computedAge = dob ? calculateAge(dob) : null;
  const isUnder18 = computedAge !== null && computedAge < 18;
  const isDobValid = !isDobEmpty && !isUnder18;

  const isGenderValid = Boolean(gender && gender.trim().length > 0);
  const isCityValid = Boolean(city && city.trim().length > 0);

  const isFormValid = isNameValid && isDobValid && isGenderValid && isCityValid;

  let ageErrorMessage = null;
  if (dob && isUnder18) {
    ageErrorMessage = "You must be 18 or older to join.";
  } else if (!dob) {
    ageErrorMessage = "Date of birth is required.";
  }

  return {
    isNameValid,
    isDobValid,
    isUnder18,
    computedAge,
    ageErrorMessage,
    isGenderValid,
    isCityValid,
    isFormValid,
    canContinue: isFormValid && !isUnder18,
  };
}

function simulateSignupSubmission({ name, dob, gender, city, navigation }) {
  const validation = validateSignupForm({ name, dob, gender, city });

  if (!validation.canContinue) {
    return {
      success: false,
      validation,
      message: validation.ageErrorMessage || "Form is invalid. Continue is blocked.",
    };
  }

  const formattedDob = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(
    dob.getDate()
  ).padStart(2, '0')}`;

  const formData = {
    name: name.trim(),
    dob: formattedDob,
    gender,
    city: city.trim(),
  };

  console.log("[Signup] Captured signup form data:", formData);
  navigation.navigate('CreateProfile', formData);

  return {
    success: true,
    validation,
    formData,
  };
}

console.log("=== STARTING SIGNUP SCREEN VALIDATION & FLOW TESTS ===\n");

// --- TEST 1: Under-18 DOB (e.g. 17 years old) ---
console.log("--- Test 1: Under-18 DOB rejection ---");
const seventeenYearsAgo = new Date();
seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17);

const under18State = {
  name: "Maya Lin",
  dob: seventeenYearsAgo,
  gender: "female",
  city: "Delhi",
};

let navigatedScreen = null;
let navigatedParams = null;
const mockNavigation = {
  navigate: (screen, params) => {
    navigatedScreen = screen;
    navigatedParams = params;
  },
  goBack: () => {},
};

const under18Result = simulateSignupSubmission({
  ...under18State,
  navigation: mockNavigation,
});

console.log(`Computed Age: ${under18Result.validation.computedAge}`);
console.log(`isUnder18: ${under18Result.validation.isUnder18}`);
console.log(`Inline Error: "${under18Result.validation.ageErrorMessage}"`);
console.log(`canContinue: ${under18Result.validation.canContinue}`);
console.log(`Continue blocked: ${under18Result.success === false ? "PASS" : "FAIL"}`);
assert.strictEqual(under18Result.success, false);
assert.strictEqual(under18Result.validation.isUnder18, true);
assert.strictEqual(
  under18Result.validation.ageErrorMessage,
  "You must be 18 or older to join."
);
assert.strictEqual(navigatedScreen, null, "Should not navigate when under 18");
console.log("- Test 1 Passed: Under-18 DOB shows inline error and blocks Continue.\n");

// --- TEST 2: Missing Required Fields ---
console.log("--- Test 2: Missing required fields ---");
const adultDob = new Date();
adultDob.setFullYear(adultDob.getFullYear() - 24); // 24 years old

// Missing name
const noName = validateSignupForm({ name: "", dob: adultDob, gender: "male", city: "Delhi" });
assert.strictEqual(noName.isNameValid, false);
assert.strictEqual(noName.canContinue, false);

// Missing DOB
const noDob = validateSignupForm({ name: "Aarav", dob: null, gender: "male", city: "Delhi" });
assert.strictEqual(noDob.isDobValid, false);
assert.strictEqual(noDob.canContinue, false);

// Missing Gender
const noGender = validateSignupForm({ name: "Aarav", dob: adultDob, gender: "", city: "Delhi" });
assert.strictEqual(noGender.isGenderValid, false);
assert.strictEqual(noGender.canContinue, false);

// Missing City
const noCity = validateSignupForm({ name: "Aarav", dob: adultDob, gender: "male", city: "" });
assert.strictEqual(noCity.isCityValid, false);
assert.strictEqual(noCity.canContinue, false);

console.log("- Test 2 Passed: Missing any required field correctly blocks submission.\n");

// --- TEST 3: Valid Adult DOB with all fields filled ---
console.log("--- Test 3: Valid adult DOB and all fields filled ---");
navigatedScreen = null;
navigatedParams = null;

const adultState = {
  name: "Aarav Sharma",
  dob: new Date(2000, 4, 15), // May 15, 2000 (~26 years old)
  gender: "male",
  city: "Bangalore",
};

const adultResult = simulateSignupSubmission({
  ...adultState,
  navigation: mockNavigation,
});

console.log(`Computed Age: ${adultResult.validation.computedAge}`);
console.log(`isUnder18: ${adultResult.validation.isUnder18}`);
console.log(`canContinue: ${adultResult.validation.canContinue}`);
console.log(`Navigated to: ${navigatedScreen}`);
console.log("Captured Data:", JSON.stringify(adultResult.formData, null, 2));

assert.strictEqual(adultResult.success, true);
assert.strictEqual(adultResult.validation.canContinue, true);
assert.strictEqual(navigatedScreen, "CreateProfile");
assert.strictEqual(navigatedParams.name, "Aarav Sharma");
assert.strictEqual(navigatedParams.dob, "2000-05-15");
assert.strictEqual(navigatedParams.gender, "male");
assert.strictEqual(navigatedParams.city, "Bangalore");

console.log("- Test 3 Passed: Valid adult submission enables Continue and navigates to CreateProfile with captured data.\n");

// --- TEST 4: Quick city suggestions chips ---
console.log("--- Test 4: Quick city suggestions ---");
const CITY_SUGGESTIONS = ['Delhi', 'Bangalore', 'Mumbai', 'Pune', 'Hyderabad'];
CITY_SUGGESTIONS.forEach(city => {
  const res = validateSignupForm({ name: "Test", dob: adultDob, gender: "prefer_not_to_say", city });
  assert.strictEqual(res.isCityValid, true);
});
console.log(`Verified ${CITY_SUGGESTIONS.length} city suggestion chips: [${CITY_SUGGESTIONS.join(", ")}]`);
console.log("- Test 4 Passed: City suggestion chips are valid.\n");

console.log("=== ALL SIGNUP SCREEN TESTS PASSED SUCCESSFULLY ===");
