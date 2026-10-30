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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { getMe } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { UnreadBadge } from '../components/UnreadBadge';
import { useUnreadTotal } from '../hooks/useUnreadTotal';

interface MyProfileScreenProps {
  navigation?: any;
  onTabChange?: (tab: 'discover' | 'connections' | 'chat' | 'profile') => void;
}

interface OwnProfile {
  id: string;
  name: string;
  city: string;
  photoUrl?: string;
  about?: string;
  skills: string[];
  interests: string[];
  intent: string[];
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

export const MyProfileScreen: React.FC<MyProfileScreenProps> = ({
  navigation,
  onTabChange,
}) => {
  const { logout } = useAuth();
  const unreadTotal = useUnreadTotal();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await getMe();
      if (res) {
        const user = res.profile || res;
        setProfile({
          id: user.id || user._id,
          name: user.name || 'Anonymous User',
          city: user.city || '',
          photoUrl: user.photoUrl,
          about: user.about,
          skills: user.skills || [],
          interests: user.interests || [],
          intent: user.intent || [],
        });
      }
    } catch (err: any) {
      if (err?.message === 'NOT_AUTHENTICATED') {
        logout();
      }
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setShowLogoutModal(false);
    } catch (err) {
      console.error('[MyProfileScreen] Logout failed:', err);
    } finally {
      setIsLoggingOut(false);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Header */}
      <View style={styles.header}>
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
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>
      </View>

      {/* 2. Main Scroll Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section: Avatar, Name & strictly City only */}
        <View style={styles.heroSection}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarBorderRing}>
              {profile?.photoUrl ? (
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
          </View>

          {/* User Name */}
          <Text style={styles.profileName} numberOfLines={1}>
            {profile?.name}
          </Text>

          {/* Location pill (Strictly City name only per PRD 10.4 / TRD 7.4) */}
          {profile?.city ? (
            <View style={styles.locationPill}>
              <Ionicons name="location-sharp" size={14} color={COLORS.primary} />
              <Text style={styles.locationText}>{profile.city}</Text>
            </View>
          ) : null}
        </View>

        {/* Profile Detail Cards Stack */}
        <View style={styles.cardsStack}>
          {/* Card 1: Intent / Looking For */}
          {profile?.intent && profile.intent.length > 0 && (
            <View style={styles.detailCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Ionicons name="compass-outline" size={17} color={COLORS.primary} />
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
          {profile?.about && profile.about.trim().length > 0 ? (
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

          {/* Card 3: Craft & Skills */}
          {profile?.skills && profile.skills.length > 0 && (
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

          {/* Card 4: Passions & Interests */}
          {profile?.interests && profile.interests.length > 0 && (
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

          {/* Card 5: Account Actions — Log Out */}
          <View style={styles.accountCard}>
            <TouchableOpacity
              style={styles.logoutBtn}
              activeOpacity={0.8}
              onPress={() => setShowLogoutModal(true)}
              testID="profile-logout-btn"
            >
              <Ionicons name="log-out-outline" size={18} color={COLORS.onSurface} />
              <Text style={styles.logoutBtnText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* 3. In-App Confirmation Modal for Logout */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="log-out-outline" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.modalTitle}>Log Out</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to log out of ConnectLocal?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleLogout}
                disabled={isLoggingOut}
                activeOpacity={0.8}
                testID="confirm-logout-btn"
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Log Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Bottom Navigation Bar matching design */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.8}
          onPress={() =>
            onTabChange ? onTabChange('discover') : navigation?.navigate?.('MainTabs')
          }
        >
          <Ionicons name="compass-outline" size={23} color={COLORS.outline} />
          <Text style={styles.navLabel}>Discover</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.8}
          onPress={() =>
            onTabChange ? onTabChange('connections') : navigation?.navigate?.('Connections')
          }
        >
          <Ionicons name="people-outline" size={23} color={COLORS.outline} />
          <Text style={styles.navLabel}>Connections</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.8}
          onPress={() =>
            onTabChange ? onTabChange('chat') : navigation?.navigate?.('ChatList')
          }
        >
          <View style={styles.tabIconWrap}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color={COLORS.outline}
            />
            <UnreadBadge count={unreadTotal} style={styles.navBadge} testID="nav-chat-badge" />
          </View>
          <Text style={styles.navLabel}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.8}
        >
          <Ionicons
            name="person-circle"
            size={23}
            color={COLORS.primary}
          />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>
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
    gap: 12,
    padding: SPACING.marginMobile,
  },
  centerText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
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
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogoBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingBottom: 90,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.marginMobile,
  },
  avatarWrapper: {
    marginBottom: SPACING.md,
  },
  avatarBorderRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: COLORS.surfaceContainerHighest,
    padding: 3,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  heroAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
  },
  heroAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceContainerLowest,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  cardsStack: {
    paddingHorizontal: SPACING.marginMobile,
    gap: 14,
  },
  detailCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    padding: 16,
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
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.2,
  },
  cardTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.zincMedium,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  intentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  intentEmoji: {
    fontSize: 14,
  },
  intentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  aboutText: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    lineHeight: 21,
  },
  skillPill: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  skillPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onPrimary,
  },
  interestPill: {
    backgroundColor: COLORS.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  interestPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  accountCard: {
    marginTop: 8,
    marginBottom: 16,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.marginMobile,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  modalIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 62,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceContainerHighest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 12 : 0,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 64,
  },
  tabIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadge: {
    position: 'absolute',
    top: -5,
    right: -12,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.outline,
  },
  navLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
