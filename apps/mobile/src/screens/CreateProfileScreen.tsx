import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import {
  INTENT_OPTIONS,
  SKILLS_BY_CATEGORY,
  INTERESTS_BY_CATEGORY,
} from '../constants/vocabulary';
import { createProfile, postDevLogin, uploadProfilePhoto, getAuthToken } from '../services/api';
import { useAuth } from '../auth/AuthContext';

interface CreateProfileScreenProps {
  route?: {
    params?: {
      name?: string;
      dob?: string;
      gender?: string;
      city?: string;
      phone?: string;
    };
  };
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: any) => void;
  };
}

export const CreateProfileScreen: React.FC<CreateProfileScreenProps> = ({
  route,
  navigation,
}) => {
  const { login } = useAuth();

  // Inherit data collected from Step 1 (SignupScreen)
  const signupData = route?.params || {
    name: 'Dev User',
    dob: '2000-01-01',
    gender: 'prefer_not_to_say',
    city: 'Delhi',
    phone: '',
  };

  // State for Step 2 profile fields
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [selectedIntents, setSelectedIntents] = useState<string[]>([
    'networking',
    'friendship',
  ]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    'Design',
    'Frontend Dev',
  ]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Travel',
    'Music',
  ]);
  const [about, setAbout] = useState(
    'Building my first startup and looking to meet people interested in technology.'
  );

  // Category picker expanders
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showInterestPicker, setShowInterestPicker] = useState(false);

  // Loading and error state
  const [loading, setLoading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConflictError, setIsConflictError] = useState(false);

  // Toggle Intent
  const toggleIntent = (intentId: string) => {
    if (selectedIntents.includes(intentId)) {
      setSelectedIntents(selectedIntents.filter((id) => id !== intentId));
    } else {
      setSelectedIntents([...selectedIntents, intentId]);
    }
  };

  // Toggle Skill (max 10)
  const toggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      if (selectedSkills.length >= 10) return;
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  // Toggle Interest (max 10)
  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter((i) => i !== interest));
    } else {
      if (selectedInterests.length >= 10) return;
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  // Handle Photo Click & Real Cloudinary Upload
  // NOTE: real-time AI moderation (NSFW/violence detection) is a paid Cloudinary add-on we're NOT enabling yet
  // TEMPORARY — add Cloudinary moderation add-on before public launch. See TRD Section 7.3.
  // NOTE: "Tap to change photo" is Create-Profile-only for now since no settings/edit-profile screen has been built yet.
  const handlePhotoUpload = async () => {
    if (isUploadingPhoto) return;

    try {
      // 1. Request media library permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Permission to access your photo library is required to upload a profile photo. Please grant permission in your device settings.'
        );
        return;
      }

      // 2. Launch image picker with cropping enabled
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const selectedAsset = pickerResult.assets[0];
      setIsUploadingPhoto(true);
      setErrorMessage(null);

      // 3. Ensure active session if uploading photo before finish setup
      if (!getAuthToken()) {
        const phoneToUse = signupData.phone?.trim();
        if (phoneToUse) {
          await postDevLogin(phoneToUse);
        } else {
          setErrorMessage('Phone number is missing. Please return to the previous step.');
          return;
        }
      }

      // 4. Upload to backend POST /api/users/me/photo
      const uploadedUrl = await uploadProfilePhoto(selectedAsset.uri);
      console.log('[CreateProfile] Successfully uploaded photo to Cloudinary:', uploadedUrl);
      setPhotoUrl(uploadedUrl);
    } catch (err: any) {
      console.error('[CreateProfile] Photo upload failed:', err);
      setErrorMessage(err.message || 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Validation
  const isIntentValid = selectedIntents.length >= 1;
  const isSkillsValid = selectedSkills.length >= 1;
  const isInterestsValid = selectedInterests.length >= 1;
  const isFormValid = isIntentValid && isSkillsValid && isInterestsValid;

  // Submit Handler
  const handleFinishSetup = async () => {
    if (!isFormValid || loading) return;

    const phoneToUse = signupData.phone?.trim();
    if (!phoneToUse) {
      setIsConflictError(false);
      setErrorMessage('Phone number is missing. Please return to the previous step.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setIsConflictError(false);

    const payload = {
      name: signupData.name || 'Dev User',
      dob: signupData.dob || '2000-01-01',
      gender: signupData.gender || 'prefer_not_to_say',
      city: signupData.city || 'Delhi',
      skills: selectedSkills,
      interests: selectedInterests,
      intent: selectedIntents,
      photoUrl: photoUrl || undefined,
      about: about.trim() || undefined,
    };

    console.log('[CreateProfile] Submitting combined profile payload:', payload);

    try {
      // Ensure we have an active dev auth session
      // TEMPORARY — replace with real auth token from phone verification
      const authData = await postDevLogin(phoneToUse);

      // Call POST /api/users
      const res = await createProfile(payload);
      console.log('[CreateProfile] Profile created successfully:', res);

      // Persist session to SecureStore and update AuthContext
      await login(authData.token);

      // On 201 success, navigate to MainTabs (Discover)
      navigation.navigate('MainTabs');
    } catch (err: any) {
      console.error('[CreateProfile] Error saving profile:', err);
      if (err.status === 409) {
        setIsConflictError(true);
        setErrorMessage(
          'This phone number already has an account. Please log in instead.'
        );
        // On 409: stay on form, do not login, do not navigate, do not overwrite session
      } else {
        setIsConflictError(false);
        setErrorMessage(err.message || 'Failed to save profile. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Top Navigation & Progress */}
        <View style={styles.topNav}>
          <View style={styles.topNavRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="create-profile-back-btn"
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.onSurface} />
            </TouchableOpacity>

            <View style={styles.stepPill}>
              <Ionicons name="shield" size={13} color={COLORS.primary} />
              <Text style={styles.stepPillText}>STEP 3 OF 4</Text>
            </View>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => navigation.navigate('MainTabs')}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Stepper bar with Step 1, 2, 3 active */}
          <View style={styles.stepperBar}>
            <View style={[styles.stepSegment, styles.stepSegmentActive]} />
            <View style={[styles.stepSegment, styles.stepSegmentActive]} />
            <View style={[styles.stepSegment, styles.stepSegmentActive]} />
            <View style={styles.stepSegment} />
          </View>
        </View>

        {/* 2. Avatar / Photo Upload Circle */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarCircle}
            activeOpacity={0.8}
            onPress={handlePhotoUpload}
            disabled={isUploadingPhoto}
            testID="photo-upload-btn"
          >
            {isUploadingPhoto ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.avatarTapText}>Uploading...</Text>
              </View>
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons
                  name="person-circle-outline"
                  size={52}
                  color={COLORS.outline}
                />
                <Text style={styles.avatarTapText}>Tap to add</Text>
              </View>
            )}

            {/* Camera Floating Badge */}
            <View style={styles.cameraBadge}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : photoUrl ? (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              ) : (
                <Ionicons name="camera" size={16} color="#ffffff" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarTitle}>Add profile photo</Text>
          <Text style={styles.avatarSubtitle}>Clear friendly photos connect best</Text>
        </View>

        {/* 3. Page Header */}
        <View style={styles.headerSection}>
          <Text style={styles.mainHeading}>Tell people what you're about</Text>
          <Text style={styles.subtitle}>
            Helps your city match you with relevant peers and authentic neighborhood projects.
          </Text>
        </View>

        {/* Error Notification Banner */}
        {errorMessage && (
          <View style={styles.errorBanner} testID="error-banner">
            <Ionicons name="alert-circle" size={18} color="#ba1a1a" style={styles.errorBannerIcon} />
            <View style={styles.errorBannerBody}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
              {isConflictError && (
                <TouchableOpacity
                  style={styles.goToLoginBtn}
                  onPress={() => navigation.navigate('Login')}
                  testID="conflict-go-to-login-btn"
                >
                  <Text style={styles.goToLoginBtnText}>Go to Log in</Text>
                  <Ionicons name="arrow-forward" size={14} color="#ba1a1a" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* 4. Section: What are you looking for? (Intent) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>What are you looking for?</Text>
            <Text style={styles.sectionHint}>Select multiple</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Signals your current intention in the local community.
          </Text>

          <View style={styles.intentGrid}>
            {INTENT_OPTIONS.map((intent) => {
              const isSelected = selectedIntents.includes(intent.id);
              return (
                <TouchableOpacity
                  key={intent.id}
                  style={[
                    styles.intentPill,
                    isSelected && styles.intentPillSelected,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => toggleIntent(intent.id)}
                  testID={`intent-${intent.id}`}
                >
                  <Text style={styles.intentEmoji}>{intent.emoji}</Text>
                  <Text
                    style={[
                      styles.intentText,
                      isSelected && styles.intentTextSelected,
                    ]}
                  >
                    {intent.label}
                  </Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={15}
                      color="#ffffff"
                      style={styles.intentCheckIcon}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* 5. Section: Your skills */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Your skills</Text>
            <Text style={styles.sectionHint}>{selectedSkills.length} / 10 added</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Show what knowledge or crafts you can exchange with neighbors.
          </Text>

          {/* Selected Skills Chips */}
          <View style={styles.selectedChipsContainer}>
            {selectedSkills.map((skill) => (
              <View key={skill} style={styles.selectedChip} testID={`selected-skill-${skill}`}>
                <Text style={styles.selectedChipText}>{skill}</Text>
                <TouchableOpacity
                  onPress={() => toggleSkill(skill)}
                  style={styles.chipRemoveBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={14} color={COLORS.onSurface} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addTagButton}
              onPress={() => setShowSkillPicker(!showSkillPicker)}
              testID="add-skill-toggle-btn"
            >
              <Ionicons
                name={showSkillPicker ? 'chevron-up' : 'add'}
                size={16}
                color={COLORS.onSurface}
              />
              <Text style={styles.addTagText}>
                {showSkillPicker ? 'Done selecting' : 'Add skill'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Categorized Skills Picker */}
          {showSkillPicker && (
            <View style={styles.categoryPickerBox}>
              {Object.entries(SKILLS_BY_CATEGORY).map(([category, skills]) => (
                <View key={category} style={styles.categoryGroup}>
                  <Text style={styles.categoryTitle}>{category}</Text>
                  <View style={styles.categoryChipsRow}>
                    {skills.map((skill) => {
                      const isSelected = selectedSkills.includes(skill);
                      return (
                        <TouchableOpacity
                          key={skill}
                          style={[
                            styles.vocabChip,
                            isSelected && styles.vocabChipSelected,
                          ]}
                          onPress={() => toggleSkill(skill)}
                          testID={`vocab-skill-${skill}`}
                        >
                          <Text
                            style={[
                              styles.vocabChipText,
                              isSelected && styles.vocabChipTextSelected,
                            ]}
                          >
                            {skill}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark" size={13} color="#ffffff" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* 6. Section: Your interests */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Your interests</Text>
            <Text style={styles.sectionHint}>
              {selectedInterests.length} / 10 added
            </Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Common grounds make spontaneous coffee chats effortless.
          </Text>

          {/* Selected Interests Chips */}
          <View style={styles.selectedChipsContainer}>
            {selectedInterests.map((interest) => (
              <View key={interest} style={styles.selectedChip} testID={`selected-interest-${interest}`}>
                <Text style={styles.selectedChipText}>{interest}</Text>
                <TouchableOpacity
                  onPress={() => toggleInterest(interest)}
                  style={styles.chipRemoveBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={14} color={COLORS.onSurface} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addTagButton}
              onPress={() => setShowInterestPicker(!showInterestPicker)}
              testID="add-interest-toggle-btn"
            >
              <Ionicons
                name={showInterestPicker ? 'chevron-up' : 'add'}
                size={16}
                color={COLORS.onSurface}
              />
              <Text style={styles.addTagText}>
                {showInterestPicker ? 'Done selecting' : 'Add interest'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Categorized Interests Picker */}
          {showInterestPicker && (
            <View style={styles.categoryPickerBox}>
              {Object.entries(INTERESTS_BY_CATEGORY).map(([category, items]) => (
                <View key={category} style={styles.categoryGroup}>
                  <Text style={styles.categoryTitle}>{category}</Text>
                  <View style={styles.categoryChipsRow}>
                    {items.map((item) => {
                      const isSelected = selectedInterests.includes(item);
                      return (
                        <TouchableOpacity
                          key={item}
                          style={[
                            styles.vocabChip,
                            isSelected && styles.vocabChipSelected,
                          ]}
                          onPress={() => toggleInterest(item)}
                          testID={`vocab-interest-${item}`}
                        >
                          <Text
                            style={[
                              styles.vocabChipText,
                              isSelected && styles.vocabChipTextSelected,
                            ]}
                          >
                            {item}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark" size={13} color="#ffffff" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* 7. Section: About you */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>About you</Text>
            <Text style={styles.sectionHint}>{about.length}/300</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            A concise snapshot of your journey, current explorations, or weekend rituals.
          </Text>

          <TextInput
            style={styles.aboutInput}
            multiline
            numberOfLines={4}
            maxLength={300}
            placeholder="Building my first startup and looking to meet people interested in technology."
            placeholderTextColor={COLORS.outlineVariant}
            value={about}
            onChangeText={setAbout}
            testID="about-textarea"
          />
        </View>

        {/* 8. Action CTA Button */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={[
              styles.finishButton,
              (!isFormValid || loading) && styles.finishButtonDisabled,
            ]}
            activeOpacity={isFormValid ? 0.85 : 1}
            onPress={handleFinishSetup}
            testID="finish-setup-btn"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Text style={styles.finishButtonText}>Finish setup</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.footerNotice}>
            You can fine-tune your answers anytime later
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
  skipButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
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
  avatarSection: {
    alignItems: 'center',
    marginVertical: SPACING.md,
  },
  avatarCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    padding: 3,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTapText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
    marginTop: -2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.surfaceContainerLowest,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  avatarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
    marginTop: SPACING.xs,
  },
  avatarSubtitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  headerSection: {
    marginVertical: SPACING.sm,
  },
  mainHeading: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.onSurfaceVariant,
    marginTop: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff0ef',
    borderColor: '#ffdad6',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: 12,
    gap: 8,
    marginVertical: SPACING.xs,
  },
  errorBannerIcon: {
    marginTop: 1,
  },
  errorBannerBody: {
    flex: 1,
    gap: 6,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#ba1a1a',
    lineHeight: 16,
  },
  goToLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  goToLoginBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ba1a1a',
    textDecorationLine: 'underline',
  },
  section: {
    marginVertical: SPACING.sm,
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.onSurfaceVariant,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 4,
  },
  intentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
  },
  intentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  intentPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  intentEmoji: {
    fontSize: 15,
  },
  intentText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  intentTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  intentCheckIcon: {
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceContainerHighest,
    marginVertical: SPACING.md,
  },
  selectedChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHighest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
  },
  selectedChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  chipRemoveBtn: {
    padding: 2,
  },
  addTagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
  },
  addTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  categoryPickerBox: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.xs,
    gap: SPACING.md,
  },
  categoryGroup: {
    gap: 6,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  vocabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
  },
  vocabChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  vocabChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  vocabChipTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  aboutInput: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderColor: COLORS.outlineVariant,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: 12,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.onSurface,
    minHeight: 88,
    textAlignVertical: 'top',
    fontFamily: 'Inter',
  },
  footerContainer: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  finishButton: {
    width: '100%',
    height: 50,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  finishButtonDisabled: {
    opacity: 0.4,
  },
  finishButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  footerNotice: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
});
