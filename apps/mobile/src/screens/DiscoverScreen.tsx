import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import {
  getDiscover,
  getMe,
  sendConnectRequest,
  DiscoverProfile,
} from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { UnreadBadge } from '../components/UnreadBadge';
import { useUnreadTotal } from '../hooks/useUnreadTotal';
import { useNotificationUnread } from '../hooks/useNotificationUnread';

interface DiscoverScreenProps {
  navigation?: any;
  onTabChange?: (tab: 'discover' | 'connections' | 'chat' | 'profile') => void;
}

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({
  navigation,
  onTabChange,
}) => {
  const { logout } = useAuth();
  const unreadTotal = useUnreadTotal();
  const notificationUnreadCount = useNotificationUnread();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tier1, setTier1] = useState<DiscoverProfile[]>([]);
  const [tier2, setTier2] = useState<DiscoverProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [requestedUserIds, setRequestedUserIds] = useState<Set<string>>(new Set());
  const [connectingUserId, setConnectingUserId] = useState<string | null>(null);

  // Toast banner state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [toastOpacity] = useState(new Animated.Value(0));

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
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

  const loadData = useCallback(async () => {
    try {
      const [meRes, discoverRes] = await Promise.all([
        getMe().catch((err) => {
          if (err?.message === 'NOT_AUTHENTICATED') throw err;
          return null;
        }),
        getDiscover().catch((err) => {
          if (err?.message === 'NOT_AUTHENTICATED') throw err;
          return { tier1: [], tier2: [] };
        }),
      ]);

      if (meRes) {
        const user = meRes.profile || meRes.user || meRes;
        setCurrentUser(user);
      }

      setTier1(discoverRes?.tier1 || []);
      setTier2(discoverRes?.tier2 || []);
    } catch (err: any) {
      console.error('[DiscoverScreen] Failed to load data:', err);
      if (err?.message === 'NOT_AUTHENTICATED') {
        logout();
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [logout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const handleConnect = async (profile: DiscoverProfile) => {
    if (requestedUserIds.has(profile.id) || connectingUserId) return;

    setConnectingUserId(profile.id);
    try {
      const res = await sendConnectRequest(profile.id);

      if (res.status === 201) {
        setRequestedUserIds((prev) => new Set(prev).add(profile.id));
        showToast('Connection invitation sent!', 'success');
      } else if (res.status === 409) {
        // Already pending/connected -> treat as success visually per requirements
        setRequestedUserIds((prev) => new Set(prev).add(profile.id));
        showToast('Connection request already exists', 'success');
      } else if (res.status === 429) {
        // Daily rate limit reached
        showToast('Daily connect limit reached.', 'error');
      } else {
        showToast(res.error || 'Could not send request', 'error');
      }
    } catch (err: any) {
      showToast('Network error while connecting.', 'error');
    } finally {
      setConnectingUserId(null);
    }
  };

  // Helper to check if a skill or interest overlaps with the current user's profile
  const isSharedTag = (tag: string): boolean => {
    if (!currentUser) return false;
    const skills = currentUser.skills || [];
    const interests = currentUser.interests || [];
    return skills.includes(tag) || interests.includes(tag);
  };

  const renderProfileCard = (item: DiscoverProfile, isTier2: boolean = false) => {
    const isRequested = requestedUserIds.has(item.id);
    const isConnecting = connectingUserId === item.id;

    // Authoritative set of shared tags from backend response
    const sharedSet = new Set<string>([
      ...(item.sharedSkills || []),
      ...(item.sharedInterests || []),
    ]);
    const checkIsShared = (tag: string): boolean => {
      if (sharedSet.size > 0) return sharedSet.has(tag);
      return isSharedTag(tag);
    };

    const rawTags = [...(item.skills || []), ...(item.interests || [])];
    const uniqueRawTags = Array.from(new Set(rawTags));

    // Shared tags come first, then non-shared
    const sharedTags = uniqueRawTags.filter((tag) => checkIsShared(tag));
    const nonSharedTags = uniqueRawTags.filter((tag) => !checkIsShared(tag));
    const prioritizedTags = [...sharedTags, ...nonSharedTags];

    // Max 3 chips displayed
    const displayedChips = prioritizedTags.slice(0, 3);

    // Number of shared chips displayed
    const sharedChipsCount = displayedChips.filter((tag) => checkIsShared(tag)).length;
    const hasMoreShared = (item.sharedCount || 0) > sharedChipsCount;
    const remainingTagsCount = Math.max(
      uniqueRawTags.length - displayedChips.length,
      (item.sharedCount || 0) - sharedChipsCount
    );

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => navigation?.navigate?.('ProfileView', { userId: item.id })}
        testID={`discover-card-${item.id}`}
      >
        <View style={styles.cardTop}>
          {/* Avatar and status indicator */}
          <View style={styles.avatarContainer}>
            {item.photoUrl ? (
              <Image
                source={{ uri: item.photoUrl }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={26} color={COLORS.secondary} />
              </View>
            )}
          </View>

          {/* Badge: "X shared" */}
          <View style={styles.sharedBadge}>
            <Ionicons name="sparkles" size={11} color={COLORS.onSurface} />
            <Text style={styles.sharedBadgeText}>
              {item.sharedCount} shared
            </Text>
          </View>
        </View>

        {/* Profile Info: Name & strictly City only */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.cardLocationRow}>
            <Ionicons name="location-sharp" size={12} color={COLORS.onSurface} />
            {/* TRD 7.4 / PRD 10.4: Strictly City name ONLY — no distance, no neighborhood */}
            <Text style={styles.cardCityText} numberOfLines={1}>
              {item.city}
            </Text>
          </View>
        </View>

        {/* Skill / Interest Tags */}
        <View style={styles.tagsContainer}>
          {displayedChips.map((tag, idx) => {
            const shared = checkIsShared(tag);
            return (
              <View
                key={`${item.id}-tag-${idx}`}
                style={[
                  styles.tagPill,
                  shared ? styles.tagPillShared : styles.tagPillNeutral,
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    shared ? styles.tagTextShared : styles.tagTextNeutral,
                  ]}
                  numberOfLines={1}
                >
                  {tag}
                </Text>
              </View>
            );
          })}
          {hasMoreShared && remainingTagsCount > 0 && (
            <View
              key={`${item.id}-more-chip`}
              style={[styles.tagPill, styles.tagPillNeutral]}
            >
              <Text
                style={[styles.tagText, styles.tagTextNeutral]}
                numberOfLines={1}
              >
                +{remainingTagsCount}
              </Text>
            </View>
          )}
        </View>

        {/* Connect / Requested Button */}
        <TouchableOpacity
          style={[
            styles.connectBtn,
            isRequested && styles.connectBtnRequested,
          ]}
          activeOpacity={0.8}
          disabled={isRequested || isConnecting}
          onPress={() => handleConnect(item)}
          testID={`connect-btn-${item.id}`}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : isRequested ? (
            <>
              <Ionicons name="checkmark" size={15} color={COLORS.onSurface} />
              <Text style={styles.connectBtnTextRequested}>Requested</Text>
            </>
          ) : (
            <>
              <Ionicons name="person-add" size={15} color="#ffffff" />
              <Text style={styles.connectBtnText}>Connect</Text>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const displayCity = currentUser?.city || 'Delhi';
  const isFeedEmpty = tier1.length === 0 && tier2.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Fixed Top Header */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <View style={styles.logoBadge}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
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
          <Text style={styles.headerTitle}>Discover</Text>
        </View>

        <View style={styles.headerActionsRow}>
          {/* Notification bell */}
          <TouchableOpacity
            style={styles.iconButton}
            accessibilityLabel="Notifications"
            onPress={() => navigation?.navigate?.('Notifications')}
          >
            <Feather name="bell" size={19} color={COLORS.onSurface} />
            <UnreadBadge
              count={notificationUnreadCount}
              style={styles.bellBadge}
            />
          </TouchableOpacity>

          {/* Profile avatar button */}
          <TouchableOpacity
            style={styles.avatarButton}
            accessibilityLabel="Profile"
            onPress={() =>
              onTabChange ? onTabChange('profile') : navigation?.navigate?.('Profile')
            }
          >
            {currentUser?.photoUrl ? (
              <Image
                source={{ uri: currentUser.photoUrl }}
                style={styles.headerAvatarImg}
              />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Ionicons name="person" size={16} color={COLORS.onSurface} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Scroll View with Pull-to-Refresh */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* 2. Top Sub-Bar & Location */}
        <View style={styles.subBar}>
          <View style={styles.subBarLeft}>
            <View style={styles.cityPill}>
              <Ionicons name="location-sharp" size={14} color={COLORS.primary} />
              <Text style={styles.cityPillText}>{displayCity}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.filterBtn} accessibilityLabel="Filter peers">
            <Ionicons name="options-outline" size={18} color={COLORS.onSurface} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Finding peers near you...</Text>
          </View>
        ) : isFeedEmpty ? (
          /* 4. Empty State per PRD Section 5.3 */
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="planet-outline" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No one nearby yet</Text>
            <Text style={styles.emptyMessage}>
              No one nearby yet — invite a friend to grow your city's network
            </Text>
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={onRefresh}
            >
              <Ionicons name="refresh" size={15} color="#ffffff" />
              <Text style={styles.emptyActionBtnText}>Refresh Feed</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* 5. Section 1: 🔥 Same city, same skill (Tier 1) */}
            {tier1.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleGroup}>
                    <Text style={styles.sectionEmoji}>🔥</Text>
                    <Text style={styles.sectionHeading}>
                      Same city, same skill
                    </Text>
                  </View>
                </View>
                <Text style={styles.sectionSubtitle}>
                  People in your city who share your skills or interests
                </Text>

                {/* Horizontal Scroll Carousel */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContainer}
                >
                  {tier1.map((item) => renderProfileCard(item, false))}
                </ScrollView>
              </View>
            )}

            {/* 6. Section 2: 🌍 Same skill, other cities (Tier 2) */}
            {tier2.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleGroup}>
                    <Text style={styles.sectionEmoji}>🌍</Text>
                    <Text style={styles.sectionHeading}>
                      Same skill, other cities
                    </Text>
                  </View>
                </View>
                <Text style={styles.sectionSubtitle}>
                  Exchange perspectives with remote peers
                </Text>

                {/* Horizontal Scroll Carousel */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContainer}
                >
                  {tier2.map((item) => renderProfileCard(item, true))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Floating Micro-Interaction Toast / Banner */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            { opacity: toastOpacity },
            toastType === 'error' && styles.toastError,
          ]}
        >
          <Ionicons
            name={
              toastType === 'error'
                ? 'alert-circle-outline'
                : 'checkmark-circle-outline'
            }
            size={18}
            color="#ffffff"
          />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* 7. Bottom Navigation Bar matching design-discover */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.8}
        >
          <Ionicons name="compass" size={23} color={COLORS.primary} />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Discover</Text>
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
          onPress={() =>
            onTabChange ? onTabChange('profile') : navigation?.navigate?.('Profile')
          }
        >
          <Ionicons
            name="person-circle-outline"
            size={23}
            color={COLORS.outline}
          />
          <Text style={styles.navLabel}>Profile</Text>
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
  logoBadge: {
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
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  headerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 90,
  },
  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  subBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  cityPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionContainer: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionEmoji: {
    fontSize: 18,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: SPACING.marginMobile,
    marginTop: 2,
    marginBottom: SPACING.sm,
  },
  carouselContainer: {
    paddingHorizontal: SPACING.marginMobile,
    gap: 12,
    paddingBottom: 4,
  },
  card: {
    width: 240,
    minHeight: 250,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceContainer,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  sharedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  cardInfo: {
    marginBottom: 6,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardCityText: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginVertical: 6,
  },
  tagPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: BORDER_RADIUS.full,
  },
  tagPillShared: {
    backgroundColor: COLORS.primary,
  },
  tagPillNeutral: {
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  tagTextShared: {
    color: COLORS.onPrimary,
  },
  tagTextNeutral: {
    color: COLORS.onSurfaceVariant,
  },
  connectBtn: {
    height: 38,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  connectBtnRequested: {
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.onSurface,
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onPrimary,
  },
  connectBtnTextRequested: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  emptyStateCard: {
    margin: SPACING.marginMobile,
    padding: 24,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    alignItems: 'center',
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  emptyMessage: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.full,
    marginTop: 8,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 80,
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
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 999,
  },
  toastError: {
    backgroundColor: '#1f1616',
    borderWidth: 1,
    borderColor: '#7a2222',
  },
  toastText: {
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
