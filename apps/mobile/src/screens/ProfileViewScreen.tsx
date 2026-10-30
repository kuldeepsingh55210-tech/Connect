import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import {
  getUserProfile,
  sendConnectRequest,
  blockUser,
  reportUser,
  PublicUserProfile,
} from '../services/api';

interface ProfileViewScreenProps {
  route?: {
    params?: {
      userId?: string;
    };
  };
  navigation: any;
}

const INTENT_CONFIG: Record<string, { label: string; emoji: string }> = {
  friendship: { label: 'Friendship', emoji: '🤝' },
  networking: { label: 'Networking', emoji: '💼' },
  startup: { label: 'Startup / Business', emoji: '🚀' },
  sports: { label: 'Sports', emoji: '🏃' },
  gaming: { label: 'Gaming', emoji: '🎮' },
  hobbies: { label: 'Hobbies', emoji: '🎨' },
  dating: { label: 'Dating', emoji: '☕' },
  study: { label: 'Study', emoji: '📚' },
};

const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'fake_profile', label: 'Fake or misleading profile' },
  { key: 'harassment', label: 'Harassment or offensive behavior' },
  { key: 'inappropriate_photo', label: 'Inappropriate photo' },
  { key: 'other', label: 'Other issue' },
];

export const ProfileViewScreen: React.FC<ProfileViewScreenProps> = ({
  route,
  navigation,
}) => {
  const userId = route?.params?.userId || '';

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Connect state
  const [isRequested, setIsRequested] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Modals
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Report state
  const [reportReason, setReportReason] = useState<string>('spam');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [isSubmittingBlock, setIsSubmittingBlock] = useState<boolean>(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastOpacity] = useState(new Animated.Value(0));

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setToastMessage(null);
        });
      }, 2500);
    });
  }, [toastOpacity]);

  useEffect(() => {
    if (!userId) {
      setErrorMsg('No user ID provided');
      setIsLoading(false);
      return;
    }

    getUserProfile(userId)
      .then((data) => {
        setProfile(data);
      })
      .catch((err: any) => {
        setErrorMsg(err.message || 'Could not load profile');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [userId]);

  const handleConnect = async () => {
    if (!profile || isRequested || isConnecting) return;

    setIsConnecting(true);
    try {
      const res = await sendConnectRequest(profile.id);
      if (res.status === 201) {
        setIsRequested(true);
        showToast('Connection invitation sent!');
      } else if (res.status === 409) {
        setIsRequested(true);
        showToast('Connection request already exists');
      } else if (res.status === 429) {
        showToast('Daily connect limit reached.');
      } else {
        showToast(res.error || 'Failed to connect');
      }
    } catch {
      showToast('Network error while connecting');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!profile || isSubmittingBlock) return;

    setIsSubmittingBlock(true);
    try {
      await blockUser(profile.id);
      setShowBlockModal(false);
      showToast(`${profile.name} has been blocked.`);
      setTimeout(() => {
        navigation.navigate('MainTabs');
      }, 1000);
    } catch (err: any) {
      showToast(err.message || 'Failed to block user');
    } finally {
      setIsSubmittingBlock(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!profile || isSubmittingReport) return;

    setIsSubmittingReport(true);
    try {
      await reportUser({
        reportedUserId: profile.id,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setShowReportModal(false);
      showToast(`Thank you. ${profile.name} has been reported for review.`);
      setTimeout(() => {
        navigation.navigate('MainTabs');
      }, 1200);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centerText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (errorMsg || !profile) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={44} color={COLORS.outline} />
        <Text style={styles.errorTitle}>Profile Unavailable</Text>
        <Text style={styles.centerText}>{errorMsg || 'User not found'}</Text>
        <TouchableOpacity
          style={styles.backBtnPill}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={16} color="#ffffff" />
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Fixed Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            testID="profile-back-btn"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
          </TouchableOpacity>
          <View style={styles.headerBrandRow}>
            <View style={styles.headerLogoBadge}>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Circle cx="7" cy="14" r="4" fill="#ffffff" />
                <Circle cx="17" cy="14" r="4" fill="#ffffff" opacity={0.6} />
                <Path
                  d="M7 14h10"
                  stroke="#ffffff"
                  strokeLinecap="round"
                  strokeWidth={2.5}
                />
              </Svg>
            </View>
            <Text style={styles.headerTitle}>Profile Detail</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.headerIconBtn}
          accessibilityLabel="More options"
          onPress={() => setShowMenuModal(true)}
          testID="profile-menu-btn"
        >
          <Feather name="more-horizontal" size={20} color={COLORS.onSurface} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Active Status Badge */}
        <View style={styles.statusStrip}>
          <View style={styles.statusPill}>
            <View style={styles.pulsingDot} />
            <Text style={styles.statusText}>Active this week</Text>
          </View>
        </View>

        {/* Hero Avatar & Identity */}
        <View style={styles.heroSection}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarBorderRing}>
              {profile.photoUrl ? (
                <Image
                  source={{ uri: profile.photoUrl }}
                  style={styles.heroAvatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.heroAvatarFallback}>
                  <Ionicons name="person" size={54} color={COLORS.secondary} />
                </View>
              )}
            </View>
            {/* Verified badge (decorative per requirement) */}
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
            </View>
          </View>

          {/* Name & City — IMPORTANT: Age is omitted per requirements */}
          <Text style={styles.profileName} numberOfLines={1}>
            {profile.name}
          </Text>

          {/* Location pill (City only per privacy constraint) */}
          <View style={styles.locationPill}>
            <Ionicons name="location-sharp" size={14} color={COLORS.primary} />
            <Text style={styles.locationText}>{profile.city}</Text>
          </View>
        </View>

        {/* Profile Details Cards Stack */}
        <View style={styles.cardsStack}>
          {/* Card 1: Intent / Looking For */}
          {profile.intent && profile.intent.length > 0 && (
            <View style={styles.detailCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Ionicons name="compass-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.cardHeading}>Looking for</Text>
                </View>
                <Text style={styles.cardTag}>INTENT</Text>
              </View>
              <View style={styles.pillsWrap}>
                {profile.intent.map((it, idx) => {
                  const conf = INTENT_CONFIG[it.toLowerCase()] || {
                    label: it,
                    emoji: '✨',
                  };
                  return (
                    <View key={`intent-${idx}`} style={styles.intentPill}>
                      <Text style={styles.intentEmoji}>{conf.emoji}</Text>
                      <Text style={styles.intentLabel}>{conf.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Card 2: About Bio */}
          {profile.about ? (
            <View style={styles.detailCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Ionicons name="person-outline" size={17} color={COLORS.primary} />
                  <Text style={styles.cardHeading}>About</Text>
                </View>
              </View>
              <Text style={styles.aboutText}>{profile.about}</Text>
            </View>
          ) : null}

          {/* Card 3: Skills / Offerings */}
          {profile.skills && profile.skills.length > 0 && (
            <View style={styles.detailCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Ionicons name="hardware-chip-outline" size={17} color={COLORS.primary} />
                  <Text style={styles.cardHeading}>Craft & Skills</Text>
                </View>
                <Text style={styles.cardTag}>OFFERINGS</Text>
              </View>
              <View style={styles.pillsWrap}>
                {profile.skills.map((skill, idx) => (
                  <View key={`skill-${idx}`} style={styles.skillPill}>
                    <Text style={styles.skillPillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Card 4: Interests / Leisure */}
          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.detailCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Ionicons name="color-palette-outline" size={17} color={COLORS.primary} />
                  <Text style={styles.cardHeading}>Passions & Interests</Text>
                </View>
                <Text style={styles.cardTag}>LEISURE</Text>
              </View>
              <View style={styles.pillsWrap}>
                {profile.interests.map((interest, idx) => (
                  <View key={`interest-${idx}`} style={styles.interestPill}>
                    <Text style={styles.interestPillText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Trust & Safety Pledge Banner */}
          <View style={styles.safetyCard}>
            <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
            <View style={styles.safetyTextCol}>
              <Text style={styles.safetyTitle}>ConnectLocal Safety Pledge</Text>
              <Text style={styles.safetyDesc}>
                Profiles undergo civic phone verification. Your precise home address and exact GPS coordinates are never visible.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 2. Sticky Floating Connect Action Hub */}
      <View style={styles.stickyFooter}>
        <TouchableOpacity
          style={[
            styles.connectBtn,
            isRequested && styles.connectBtnRequested,
          ]}
          activeOpacity={0.88}
          disabled={isRequested || isConnecting}
          onPress={handleConnect}
          testID="profile-connect-btn"
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : isRequested ? (
            <>
              <Ionicons name="checkmark" size={18} color={COLORS.onSurface} />
              <Text style={styles.connectBtnTextRequested}>Requested</Text>
            </>
          ) : (
            <>
              <Ionicons name="person-add" size={17} color="#ffffff" />
              <Text style={styles.connectBtnText}>Connect</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={styles.optInRow}>
          <Ionicons name="people-outline" size={13} color={COLORS.onSurfaceVariant} />
          <Text style={styles.optInText}>
            Mutual opt-in: {profile.name} will be notified and can choose to connect.
          </Text>
        </View>
      </View>

      {/* 3. Overflow Menu Bottom Sheet (Report / Block) */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={styles.bottomSheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Member Settings</Text>
            <Text style={styles.sheetSubtitle}>
              Actions regarding {profile.name}'s profile
            </Text>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetOptionBtn}
                onPress={() => {
                  setShowMenuModal(false);
                  setShowReportModal(true);
                }}
                testID="menu-report-btn"
              >
                <Ionicons name="flag-outline" size={18} color={COLORS.onSurface} />
                <Text style={styles.sheetOptionText}>Report {profile.name}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetOptionBtn, styles.sheetOptionBlock]}
                onPress={() => {
                  setShowMenuModal(false);
                  setShowBlockModal(true);
                }}
                testID="menu-block-btn"
              >
                <Ionicons name="ban-outline" size={18} color="#ffffff" />
                <Text style={styles.sheetOptionBlockText}>Block {profile.name}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetCancelBtn}
                onPress={() => setShowMenuModal(false)}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 4. Block Confirmation Dialog */}
      <Modal
        visible={showBlockModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockModal(false)}
      >
        <View style={styles.modalCenterOverlay}>
          <View style={styles.confirmDialog}>
            <View style={styles.dialogIconCircle}>
              <Ionicons name="ban" size={28} color="#dc2626" />
            </View>
            <Text style={styles.dialogTitle}>Block {profile.name}?</Text>
            <Text style={styles.dialogDesc}>
              They won't be able to contact you and won't appear in your Discover feed.
            </Text>

            <View style={styles.dialogButtonsRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                disabled={isSubmittingBlock}
                onPress={() => setShowBlockModal(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dialogBlockBtn}
                disabled={isSubmittingBlock}
                onPress={handleConfirmBlock}
                testID="confirm-block-btn"
              >
                {isSubmittingBlock ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.dialogBlockText}>Block</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. Report Form Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowReportModal(false)}
        >
          <View style={styles.reportSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Report {profile.name}</Text>
            <Text style={styles.sheetSubtitle}>
              Please select a reason for reporting this account
            </Text>

            <View style={styles.reportOptionsList}>
              {REPORT_REASONS.map((r) => {
                const isSelected = reportReason === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[
                      styles.reasonOption,
                      isSelected && styles.reasonOptionSelected,
                    ]}
                    onPress={() => setReportReason(r.key)}
                    testID={`report-reason-${r.key}`}
                  >
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={17}
                      color={isSelected ? COLORS.primary : COLORS.outline}
                    />
                    <Text
                      style={[
                        styles.reasonText,
                        isSelected && styles.reasonTextSelected,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.detailsLabel}>Additional Details (optional):</Text>
            <TextInput
              style={styles.detailsInput}
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Describe the issue (max 500 characters)..."
              placeholderTextColor={COLORS.outline}
              multiline
              maxLength={500}
              testID="report-details-input"
            />
            <Text style={styles.charCount}>
              {reportDetails.length}/500
            </Text>

            <View style={styles.reportButtonsRow}>
              <TouchableOpacity
                style={styles.sheetCancelBtn}
                disabled={isSubmittingReport}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitReportBtn}
                disabled={isSubmittingReport}
                onPress={handleSubmitReport}
                testID="submit-report-btn"
              >
                {isSubmittingReport ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitReportText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons name="information-circle-outline" size={17} color="#ffffff" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: 12,
  },
  centerText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  backBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.full,
    marginTop: 8,
  },
  backBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
    backgroundColor: 'rgba(249, 249, 250, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHighest,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogoBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  statusStrip: {
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 12,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  pulsingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.primary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.marginMobile,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarBorderRing: {
    width: 118,
    height: 118,
    borderRadius: 59,
    padding: 3,
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  heroAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 56,
    backgroundColor: COLORS.surfaceContainer,
  },
  heroAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 56,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    marginTop: 6,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  cardsStack: {
    paddingHorizontal: SPACING.marginMobile,
    marginTop: 8,
    gap: 12,
  },
  detailCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  cardTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.zincMedium,
    letterSpacing: 0.8,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  intentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  intentEmoji: {
    fontSize: 14,
  },
  intentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  aboutText: {
    fontSize: 13.5,
    color: COLORS.onSurface,
    lineHeight: 20,
  },
  skillPill: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  skillPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  interestPill: {
    backgroundColor: COLORS.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  interestPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  safetyCard: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  safetyTextCol: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 2,
  },
  safetyDesc: {
    fontSize: 11.5,
    color: COLORS.onSurfaceVariant,
    lineHeight: 16,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(249, 249, 250, 0.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    alignItems: 'center',
    gap: 6,
  },
  connectBtn: {
    width: '100%',
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectBtnRequested: {
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.onSurface,
  },
  connectBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  connectBtnTextRequested: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  optInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  optInText: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetActions: {
    gap: 8,
    marginTop: 4,
  },
  sheetOptionBtn: {
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sheetOptionText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  sheetOptionBlock: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sheetOptionBlockText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  sheetCancelBtn: {
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  modalCenterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  dialogIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  dialogDesc: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 8,
  },
  dialogCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  dialogBlockBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBlockText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  reportSheet: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  reportOptionsList: {
    gap: 6,
    marginVertical: 10,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  reasonOptionSelected: {
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  reasonText: {
    fontSize: 13,
    color: COLORS.onSurface,
  },
  reasonTextSelected: {
    fontWeight: '600',
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
    marginTop: 6,
    marginBottom: 4,
  },
  detailsInput: {
    height: 70,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
    color: COLORS.onSurface,
    textAlignVertical: 'top',
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 10,
    color: COLORS.outline,
    marginTop: 2,
    marginBottom: 10,
  },
  reportButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  submitReportBtn: {
    flex: 1,
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitReportText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  toast: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    backgroundColor: COLORS.zincBlack,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 999,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
