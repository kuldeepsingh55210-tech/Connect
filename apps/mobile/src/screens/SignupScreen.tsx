import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { DatePickerInput } from '../components/DatePickerInput';

interface SignupScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: any) => void;
  };
}

const GENDER_OPTIONS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'non_binary', label: 'Non-binary' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

const CITY_SUGGESTIONS = [
  'Delhi',
  'Bangalore',
  'Mumbai',
  'Pune',
  'Hyderabad',
];

export function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export const SignupScreen: React.FC<SignupScreenProps> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState<string>('');
  const [city, setCity] = useState('');

  // Touched states for inline validation display
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [dobTouched, setDobTouched] = useState(false);
  const [genderTouched, setGenderTouched] = useState(false);
  const [cityTouched, setCityTouched] = useState(false);

  // Validation calculations
  const isNameEmpty = name.trim().length === 0;
  const isNameValid = !isNameEmpty;

  // TEMPORARY DEV AUTH — phone is not verified (no OTP). Replace with Firebase phone OTP, see TRD Section 6.1
  const normalizePhone = (val: string) => val.trim().replace(/\s+/g, '');
  const isPhoneEmpty = phone.trim().length === 0;
  const isPhoneValid = /^\+91\d{10}$/.test(normalizePhone(phone));

  const isDobEmpty = dob === null;
  const computedAge = dob ? calculateAge(dob) : null;
  const isUnder18 = computedAge !== null && computedAge < 18;
  const isDobValid = !isDobEmpty && !isUnder18;

  const isGenderValid = gender !== '';
  const isCityValid = city.trim().length > 0;

  const isFormValid = isNameValid && isPhoneValid && isDobValid && isGenderValid && isCityValid;

  const handleContinue = () => {
    setNameTouched(true);
    setPhoneTouched(true);
    setDobTouched(true);
    setGenderTouched(true);
    setCityTouched(true);

    if (!isFormValid || isUnder18 || !dob) {
      return;
    }

    const formattedDob = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(
      dob.getDate()
    ).padStart(2, '0')}`;

    const formData = {
      name: name.trim(),
      phone: normalizePhone(phone),
      dob: formattedDob,
      gender,
      city: city.trim(),
    };

    console.log('[Signup] Captured signup form data:', formData);
    navigation.navigate('CreateProfile', formData);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Top Navigation & Progress Bar */}
        <View style={styles.topNav}>
          <View style={styles.topNavRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="signup-back-btn"
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.onSurface} />
            </TouchableOpacity>

            <View style={styles.stepPill}>
              <Ionicons name="shield" size={13} color={COLORS.primary} />
              <Text style={styles.stepPillText}>STEP 1 OF 4</Text>
            </View>

            <View style={styles.topNavSpacer} />
          </View>

          {/* Segmented Stepper Bar */}
          <View style={styles.stepperBar}>
            <View style={[styles.stepSegment, styles.stepSegmentActive]} />
            <View style={styles.stepSegment} />
            <View style={styles.stepSegment} />
            <View style={styles.stepSegment} />
          </View>
        </View>

        {/* 2. Header Section */}
        <View style={styles.headerSection}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>CONNECTLOCAL ID</Text>
          </View>
          <Text style={styles.mainHeading}>Let's get to know you</Text>
          <Text style={styles.subtitle}>
            Create your verified local account to safely discover neighbors, share skills, and build community.
          </Text>
        </View>

        {/* 3. Community-first Privacy Banner */}
        <View style={styles.privacyBanner}>
          <View style={styles.privacyIconCircle}>
            <Ionicons name="shield-checkmark" size={18} color={COLORS.onSurface} />
          </View>
          <View style={styles.privacyTextContainer}>
            <Text style={styles.privacyTitle}>Your privacy is community-first</Text>
            <Text style={styles.privacyDescription}>
              Exact street addresses and age are never publicly displayed on your neighbor profile.
            </Text>
          </View>
        </View>

        {/* 4. Main Form Fields */}
        <View style={styles.formContainer}>
          {/* Field A: Full legal or preferred name */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Full legal or preferred name</Text>
              <Text style={styles.labelHint}>Public display</Text>
            </View>
            <View
              style={[
                styles.inputWrapper,
                nameTouched && !isNameValid && styles.inputWrapperError,
              ]}
            >
              <Feather
                name="user"
                size={18}
                color={nameTouched && !isNameValid ? '#ba1a1a' : COLORS.outline}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Maya Lin"
                placeholderTextColor={COLORS.outlineVariant}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (!nameTouched) setNameTouched(true);
                }}
                onBlur={() => setNameTouched(true)}
                autoCapitalize="words"
                testID="signup-name-input"
              />
            </View>
            {nameTouched && !isNameValid && (
              <Text style={styles.inlineErrorText} testID="name-error">
                Name is required.
              </Text>
            )}
          </View>

          {/* Field: Phone number */}
          {/* TEMPORARY DEV AUTH — phone is not verified (no OTP). Replace with Firebase phone OTP, see TRD Section 6.1 */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Phone number</Text>
              <Text style={styles.labelHint}>Private · Never displayed</Text>
            </View>
            <View
              style={[
                styles.phoneInputWrapper,
                phoneTouched && !isPhoneValid && styles.phoneInputWrapperError,
              ]}
            >
              <Feather
                name="phone"
                size={18}
                color={phoneTouched && !isPhoneValid ? '#ba1a1a' : COLORS.outline}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.phoneTextInput}
                placeholder="+919876543210"
                placeholderTextColor={COLORS.outlineVariant}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  if (!phoneTouched) setPhoneTouched(true);
                }}
                onBlur={() => setPhoneTouched(true)}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                testID="signup-phone-input"
              />
            </View>
            {phoneTouched && isPhoneEmpty && (
              <Text style={styles.inlineErrorText} testID="phone-required-error">
                Phone number is required.
              </Text>
            )}
            {phoneTouched && !isPhoneEmpty && !isPhoneValid && (
              <Text style={styles.inlineErrorText} testID="phone-format-error">
                Enter a valid 10-digit Indian mobile number (+91 followed by 10 digits).
              </Text>
            )}
          </View>

          {/* Field B: Date of birth */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Date of birth</Text>
            <DatePickerInput
              value={dob}
              onChange={(selectedDate) => {
                setDob(selectedDate);
                setDobTouched(true);
              }}
              hasError={dobTouched && !isDobValid}
            />
            {/* Age guidance / Error display */}
            {dobTouched && isDobEmpty && (
              <Text style={styles.inlineErrorText} testID="dob-required-error">
                Date of birth is required.
              </Text>
            )}
            {dob && isUnder18 && (
              <View style={styles.ageErrorRow} testID="dob-age-error">
                <Ionicons name="alert-circle" size={15} color="#ba1a1a" />
                <Text style={styles.inlineErrorTextBold}>
                  You must be 18 or older to join.
                </Text>
              </View>
            )}
            {(!dob || !isUnder18) && (
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={15} color={COLORS.onSurfaceVariant} />
                <Text style={styles.infoText}>
                  You must be 18 or older to join ConnectLocal
                </Text>
              </View>
            )}
          </View>

          {/* Field C: Gender identity */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Gender identity</Text>
            <View style={styles.genderGrid}>
              {GENDER_OPTIONS.map((opt) => {
                const isSelected = gender === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.genderPill,
                      isSelected && styles.genderPillSelected,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setGender(opt.id);
                      setGenderTouched(true);
                    }}
                    testID={`gender-${opt.id}`}
                  >
                    <View
                      style={[
                        styles.genderDot,
                        isSelected && styles.genderDotSelected,
                      ]}
                    />
                    <Text
                      style={[
                        styles.genderText,
                        isSelected && styles.genderTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {genderTouched && !isGenderValid && (
              <Text style={styles.inlineErrorText} testID="gender-error">
                Please select a gender identity.
              </Text>
            )}
          </View>

          {/* Field D: Your city or hub */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Your city or hub</Text>
              <Text style={styles.labelHint}>Sets local feed</Text>
            </View>
            <View
              style={[
                styles.inputWrapper,
                cityTouched && !isCityValid && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="location-outline"
                size={19}
                color={cityTouched && !isCityValid ? '#ba1a1a' : COLORS.onSurface}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Delhi or Bangalore"
                placeholderTextColor={COLORS.outlineVariant}
                value={city}
                onChangeText={(text) => {
                  setCity(text);
                  if (!cityTouched) setCityTouched(true);
                }}
                onBlur={() => setCityTouched(true)}
                autoCapitalize="words"
                testID="signup-city-input"
              />
            </View>
            {cityTouched && !isCityValid && (
              <Text style={styles.inlineErrorText} testID="city-error">
                City is required.
              </Text>
            )}

            {/* Quick city suggestions */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cityChipsContainer}
            >
              {CITY_SUGGESTIONS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.cityChip,
                    city.toLowerCase() === item.toLowerCase() &&
                      styles.cityChipActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    setCity(item);
                    setCityTouched(true);
                  }}
                  testID={`city-chip-${item}`}
                >
                  <Text
                    style={[
                      styles.cityChipText,
                      city.toLowerCase() === item.toLowerCase() &&
                        styles.cityChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* 5. Community Vibe Card */}
        <View style={styles.communityCard}>
          <View style={styles.communityIconBox}>
            <Ionicons name="people" size={22} color={COLORS.zincBlack} />
          </View>
          <View style={styles.communityTextBox}>
            <View style={styles.communityTitleRow}>
              <MaterialIcons name="handshake" size={16} color={COLORS.onSurface} />
              <Text style={styles.communityTitle}>12,400+ Active Neighbors</Text>
            </View>
            <Text style={styles.communityDescription}>
              Meet makers, helpers, and local friends right nearby.
            </Text>
          </View>
        </View>

        {/* 6. Action Button & Terms */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              (!isFormValid || isUnder18) && styles.continueButtonDisabled,
            ]}
            activeOpacity={isFormValid ? 0.85 : 1}
            onPress={handleContinue}
            testID="signup-continue-btn"
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By continuing, you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => navigation.navigate('Terms')}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => navigation.navigate('Privacy')}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollContent: {
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: SPACING.xl,
  },
  topNav: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  stepPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: 0.6,
  },
  topNavSpacer: {
    width: 40,
  },
  stepperBar: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
    paddingTop: 2,
  },
  stepSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceContainerHighest,
  },
  stepSegmentActive: {
    backgroundColor: COLORS.primary,
  },
  headerSection: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.xs,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: 0.8,
  },
  mainHeading: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.4,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.onSurfaceVariant,
    marginTop: 6,
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceContainerLow,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: 14,
    marginVertical: SPACING.md,
    gap: 12,
  },
  privacyIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
    marginBottom: 2,
  },
  privacyDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.onSurfaceVariant,
  },
  formContainer: {
    gap: SPACING.md,
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  labelHint: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 14,
  },
  inputWrapperError: {
    borderColor: '#ba1a1a',
    backgroundColor: '#fff8f7',
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: '#e4e4e7',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 16,
  },
  phoneInputWrapperError: {
    borderColor: '#ba1a1a',
    backgroundColor: '#fff8f7',
  },
  phoneTextInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: COLORS.onSurface,
    fontFamily: 'Inter',
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: COLORS.onSurface,
    fontFamily: 'Inter',
  },
  inlineErrorText: {
    fontSize: 12,
    color: '#ba1a1a',
    marginTop: 2,
    marginLeft: 2,
  },
  inlineErrorTextBold: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ba1a1a',
    marginLeft: 4,
  },
  ageErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    marginLeft: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 2,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  genderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genderPill: {
    flexBasis: '48%',
    flexGrow: 1,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  genderPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  genderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.outlineVariant,
  },
  genderDotSelected: {
    backgroundColor: '#ffffff',
  },
  genderText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  genderTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  cityChipsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
  },
  cityChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  cityChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  cityChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginVertical: SPACING.md,
    gap: 12,
  },
  communityIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityTextBox: {
    flex: 1,
  },
  communityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  communityTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  communityDescription: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  footerContainer: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  continueButton: {
    width: '100%',
    height: 50,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  termsText: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  termsLink: {
    color: COLORS.onSurface,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
