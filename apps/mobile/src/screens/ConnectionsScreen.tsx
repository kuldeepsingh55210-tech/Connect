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
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import {
  getConnections,
  respondConnection,
  getMe,
  ConnectionItem,
} from '../services/api';
import { UnreadBadge } from '../components/UnreadBadge';
import { useUnreadTotal } from '../hooks/useUnreadTotal';

interface ConnectionsScreenProps {
  navigation: any;
  onTabChange?: (tab: 'discover' | 'connections' | 'chat' | 'profile') => void;
}

type TabType = 'requests' | 'connected' | 'sent';

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

export function openChatForConnection(navigation: any, item: ConnectionItem) {
  const user = item.user || {};
  const otherUserId = user.id || (item as any).id;
  navigation?.navigate?.('Chat', {
    connectionId: item.connectionId,
    otherUserId,
    otherUser: {
      id: otherUserId,
      name: user.name || item.name,
      city: user.city || item.city,
      photoUrl: user.photoUrl || item.photoUrl,
      skills: user.skills || item.skills,
      interests: user.interests || item.interests,
    },
  });
}

export const ConnectionsScreen: React.FC<ConnectionsScreenProps> = ({
  navigation,
  onTabChange,
}) => {
  const unreadTotal = useUnreadTotal();
  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [requests, setRequests] = useState<ConnectionItem[]>([]);
  const [connected, setConnected] = useState<ConnectionItem[]>([]);
  const [sent, setSent] = useState<ConnectionItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastOpacity] = useState(new Animated.Value(0));

  const showToast = useCallback(
    (msg: string) => {
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
    },
    [toastOpacity]
  );

  // Requirement 1: Call all three on mount so counts are accurate immediately
  const loadAllConnections = useCallback(async () => {
    try {
      const [meRes, reqRes, connRes, sentRes] = await Promise.all([
        getMe().catch(() => null),
        getConnections('pending').catch(() => ({ connections: [] })),
        getConnections('accepted').catch(() => ({ connections: [] })),
        getConnections('sent').catch(() => ({ connections: [] })),
      ]);

      if (meRes) {
        const user = meRes.profile || meRes.user || meRes;
        setCurrentUser(user);
      }

      setRequests(reqRes.connections || []);
      setConnected(connRes.connections || []);
      setSent(sentRes.connections || []);
    } catch (err: any) {
      console.error('[ConnectionsScreen] Failed to load connections:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllConnections();
  }, [loadAllConnections]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadAllConnections();
  }, [loadAllConnections]);

  // Requirement 2: Accept connection
  const handleAccept = async (item: ConnectionItem) => {
    if (processingId) return;
    setProcessingId(item.connectionId);
    try {
      await respondConnection(item.connectionId, 'accept');

      // Optimistically update lists and counts
      setRequests((prev) => prev.filter((r) => r.connectionId !== item.connectionId));
      setConnected((prev) => [{ ...item, status: 'accepted' }, ...prev]);
      showToast(`Connected with ${item.user.name || item.name}!`);
    } catch (err: any) {
      showToast(err.message || 'Failed to accept connection');
    } finally {
      setProcessingId(null);
    }
  };

  // Requirement 2: Ignore connection (low-friction, silent)
  const handleIgnore = async (item: ConnectionItem) => {
    if (processingId) return;
    setProcessingId(item.connectionId);
    try {
      await respondConnection(item.connectionId, 'ignore');

      // Optimistically remove from requests list
      setRequests((prev) => prev.filter((r) => r.connectionId !== item.connectionId));
    } catch (err: any) {
      showToast(err.message || 'Failed to ignore connection');
    } finally {
      setProcessingId(null);
    }
  };

  // Requirement 3: Chat navigation for connected
  const handleOpenChat = (item: ConnectionItem) => {
    openChatForConnection(navigation, item);
  };

  // View user profile
  const handleOpenProfile = (targetUserId?: string) => {
    if (targetUserId) {
      navigation?.navigate?.('ProfileView', { userId: targetUserId });
    }
  };

  // Active list according to current tab
  const getActiveList = () => {
    switch (activeTab) {
      case 'requests':
        return requests;
      case 'connected':
        return connected;
      case 'sent':
        return sent;
      default:
        return [];
    }
  };

  const activeItems = getActiveList();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Fixed Top Header */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <View style={styles.headerLogoBadge}>
            <Text style={styles.headerLogoText}>C</Text>
          </View>
          <Text style={styles.headerTitle}>Connections</Text>
        </View>

        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={styles.iconButton}
            accessibilityLabel="Notifications"
          >
            <Feather name="bell" size={19} color={COLORS.onSurface} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarButton}
            accessibilityLabel="Profile"
            onPress={() => navigation?.navigate?.('Profile')}
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
        {/* 2. Header Intro & Match Rate Metric */}
        <View style={styles.introRow}>
          <View style={styles.introTextCol}>
            <Text style={styles.introHeading}>Connections</Text>
            <Text style={styles.introSub}>
              Your neighborhood network is flourishing
            </Text>
          </View>
          <View style={styles.metricBadge}>
            <Ionicons name="leaf-outline" size={14} color={COLORS.primary} />
            <Text style={styles.metricText}>84% Match rate</Text>
          </View>
        </View>

        {/* 3. Segmented Top Tab Bar: Requests (N) | Connected (N) | Sent (N) */}
        <View style={styles.tabBarContainer}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'requests' && styles.tabBtnActive,
            ]}
            onPress={() => setActiveTab('requests')}
            activeOpacity={0.8}
            testID="tab-requests-btn"
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'requests' && styles.tabBtnTextActive,
              ]}
            >
              Requests
            </Text>
            <View
              style={[
                styles.countBadge,
                activeTab === 'requests'
                  ? styles.countBadgeActive
                  : styles.countBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.countBadgeText,
                  activeTab === 'requests' && styles.countBadgeTextActive,
                ]}
              >
                {requests.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'connected' && styles.tabBtnActive,
            ]}
            onPress={() => setActiveTab('connected')}
            activeOpacity={0.8}
            testID="tab-connected-btn"
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'connected' && styles.tabBtnTextActive,
              ]}
            >
              Connected
            </Text>
            <View
              style={[
                styles.countBadge,
                activeTab === 'connected'
                  ? styles.countBadgeActive
                  : styles.countBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.countBadgeText,
                  activeTab === 'connected' && styles.countBadgeTextActive,
                ]}
              >
                {connected.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'sent' && styles.tabBtnActive]}
            onPress={() => setActiveTab('sent')}
            activeOpacity={0.8}
            testID="tab-sent-btn"
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'sent' && styles.tabBtnTextActive,
              ]}
            >
              Sent
            </Text>
            <View
              style={[
                styles.countBadge,
                activeTab === 'sent'
                  ? styles.countBadgeActive
                  : styles.countBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.countBadgeText,
                  activeTab === 'sent' && styles.countBadgeTextActive,
                ]}
              >
                {sent.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 4. Tab Section Header */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleText}>
            {activeTab === 'requests' && `INCOMING REQUESTS (${requests.length})`}
            {activeTab === 'connected' && `CONNECTED NEIGHBORS (${connected.length})`}
            {activeTab === 'sent' && `SENT REQUESTS (${sent.length})`}
          </Text>
        </View>

        {/* 5. Tab Content Lists */}
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading connections...</Text>
          </View>
        ) : activeItems.length === 0 ? (
          /* Empty States (Requirement 5) */
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBox}>
              <Ionicons
                name={
                  activeTab === 'requests'
                    ? 'mail-unread-outline'
                    : activeTab === 'connected'
                    ? 'people-outline'
                    : 'send-outline'
                }
                size={34}
                color={COLORS.outline}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'requests' && 'No requests yet'}
              {activeTab === 'connected' &&
                'No connections yet — start connecting from Discover'}
              {activeTab === 'sent' && 'No pending requests'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'requests' &&
                "When local peers reach out to connect, you'll see them here."}
              {activeTab === 'connected' &&
                'Mutual connections will appear here. Explore nearby peers to connect.'}
              {activeTab === 'sent' &&
                'Requests you send to other users will be listed here.'}
            </Text>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {activeTab === 'requests' &&
              requests.map((item) => {
                const user = item.user || {};
                const tags = [
                  ...(user.skills || item.skills || []),
                  ...(user.interests || item.interests || []),
                ].slice(0, 2);
                const isItemProcessing = processingId === item.connectionId;

                return (
                  <View
                    key={item.connectionId}
                    style={styles.requestCard}
                    testID={`request-card-${item.connectionId}`}
                  >
                    <TouchableOpacity
                      style={styles.cardHeaderRow}
                      activeOpacity={0.88}
                      onPress={() => handleOpenProfile(user.id)}
                    >
                      <View style={styles.avatarWrap}>
                        {user.photoUrl || item.photoUrl ? (
                          <Image
                            source={{ uri: user.photoUrl || item.photoUrl }}
                            style={styles.avatarImg}
                          />
                        ) : (
                          <View style={styles.avatarFallback}>
                            <Ionicons
                              name="person"
                              size={24}
                              color={COLORS.secondary}
                            />
                          </View>
                        )}
                        <View style={styles.onlineDot} />
                      </View>

                      <View style={styles.cardMainCol}>
                        <View style={styles.nameTimeRow}>
                          <Text style={styles.nameText} numberOfLines={1}>
                            {user.name || item.name}
                          </Text>
                          <Text style={styles.timeText}>
                            {formatRelativeTime(item.createdAt)}
                          </Text>
                        </View>

                        {/* Privacy Constraint: City ONLY (no distance or neighborhood) */}
                        <View style={styles.locationRow}>
                          <Ionicons
                            name="location-sharp"
                            size={12}
                            color={COLORS.onSurfaceVariant}
                          />
                          <Text style={styles.cityText}>
                            {user.city || item.city}
                          </Text>
                        </View>

                        {tags.length > 0 && (
                          <View style={styles.tagsRow}>
                            <View style={styles.skillTag}>
                              <Text style={styles.skillTagText}>
                                {tags.join(' · ')}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Actions: Accept & Ignore */}
                    <View style={styles.requestActionsRow}>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        activeOpacity={0.88}
                        disabled={isItemProcessing}
                        onPress={() => handleAccept(item)}
                        testID={`accept-btn-${item.connectionId}`}
                      >
                        {isItemProcessing ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <Ionicons
                              name="person-add"
                              size={15}
                              color="#ffffff"
                            />
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.ignoreBtn}
                        activeOpacity={0.88}
                        disabled={isItemProcessing}
                        onPress={() => handleIgnore(item)}
                        testID={`ignore-btn-${item.connectionId}`}
                      >
                        <Text style={styles.ignoreBtnText}>Ignore</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

            {activeTab === 'connected' &&
              connected.map((item) => {
                const user = item.user || {};
                const tag =
                  (user.skills || item.skills || [])[0] ||
                  (user.interests || item.interests || [])[0];

                return (
                  <TouchableOpacity
                    key={item.connectionId}
                    style={styles.connectedRow}
                    activeOpacity={0.88}
                    onPress={() => handleOpenChat(item)}
                    testID={`connected-row-${item.connectionId}`}
                  >
                    <View style={styles.avatarWrap}>
                      {user.photoUrl || item.photoUrl ? (
                        <Image
                          source={{ uri: user.photoUrl || item.photoUrl }}
                          style={styles.avatarImgSmall}
                        />
                      ) : (
                        <View style={styles.avatarFallbackSmall}>
                          <Ionicons
                            name="person"
                            size={20}
                            color={COLORS.secondary}
                          />
                        </View>
                      )}
                      <View style={styles.onlineDot} />
                    </View>

                    <View style={styles.connectedTextCol}>
                      <Text style={styles.nameText} numberOfLines={1}>
                        {user.name || item.name}
                      </Text>
                      {/* Privacy Constraint: Strictly City name only */}
                      <Text style={styles.connectedSubText} numberOfLines={1}>
                        {user.city || item.city}
                        {tag ? ` · ${tag}` : ''}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.chatIconBtn}
                      accessibilityLabel="Chat"
                      onPress={() => handleOpenChat(item)}
                      testID={`chat-btn-${item.connectionId}`}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={19}
                        color={COLORS.onSurface}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}

            {activeTab === 'sent' &&
              sent.map((item) => {
                const user = item.user || {};
                const tag =
                  (user.skills || item.skills || [])[0] ||
                  (user.interests || item.interests || [])[0];

                return (
                  <TouchableOpacity
                    key={item.connectionId}
                    style={styles.connectedRow}
                    activeOpacity={0.88}
                    onPress={() => handleOpenProfile(user.id)}
                    testID={`sent-row-${item.connectionId}`}
                  >
                    <View style={styles.avatarWrap}>
                      {user.photoUrl || item.photoUrl ? (
                        <Image
                          source={{ uri: user.photoUrl || item.photoUrl }}
                          style={styles.avatarImgSmall}
                        />
                      ) : (
                        <View style={styles.avatarFallbackSmall}>
                          <Ionicons
                            name="person"
                            size={20}
                            color={COLORS.secondary}
                          />
                        </View>
                      )}
                    </View>

                    <View style={styles.connectedTextCol}>
                      <Text style={styles.nameText} numberOfLines={1}>
                        {user.name || item.name}
                      </Text>
                      <Text style={styles.connectedSubText} numberOfLines={1}>
                        {user.city || item.city}
                        {tag ? ` · ${tag}` : ''}
                      </Text>
                    </View>

                    {/* Pending Amber Badge */}
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time-outline" size={13} color="#b45309" />
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>
        )}

        {/* 6. Friendly Community Prompt Card */}
        <View style={styles.promptCard}>
          <View style={styles.promptIconBox}>
            <Ionicons
              name="people-circle-outline"
              size={26}
              color={COLORS.primary}
            />
          </View>
          <View style={styles.promptTextCol}>
            <Text style={styles.promptTitle}>Grow your local circle</Text>
            <Text style={styles.promptDesc}>
              Introduce yourself to neighbors who share your skills and passions.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons
            name="checkmark-circle-outline"
            size={17}
            color="#ffffff"
          />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* 7. Bottom Navigation Bar matching design-connections */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.8}
          onPress={() => onTabChange?.('discover')}
        >
          <Ionicons name="compass-outline" size={23} color={COLORS.outline} />
          <Text style={styles.navLabel}>Discover</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} activeOpacity={0.8}>
          <Ionicons name="people" size={23} color={COLORS.primary} />
          <Text style={[styles.navLabel, styles.navLabelActive]}>
            Connections
          </Text>
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
  headerLogoBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
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
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 14,
    paddingBottom: 90,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  introTextCol: {
    flex: 1,
  },
  introHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  introSub: {
    fontSize: 12.5,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  metricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  metricText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceContainer,
    padding: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    gap: 5,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: BORDER_RADIUS.full,
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countBadgeInactive: {
    backgroundColor: COLORS.surfaceContainerHighest,
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  countBadgeTextActive: {
    color: '#ffffff',
  },
  sectionTitleRow: {
    marginBottom: 10,
  },
  sectionTitleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.zincMedium,
    letterSpacing: 0.8,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  emptyCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    marginVertical: 10,
  },
  emptyIconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardsList: {
    gap: 10,
  },
  requestCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  avatarImg: {
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
  avatarImgSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainer,
  },
  avatarFallbackSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cardMainCol: {
    flex: 1,
    gap: 2,
  },
  nameTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  timeText: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  cityText: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  skillTag: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  skillTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  requestActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  acceptBtn: {
    flex: 1,
    height: 38,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  ignoreBtn: {
    height: 38,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ignoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  connectedRow: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedTextCol: {
    flex: 1,
    gap: 2,
  },
  connectedSubText: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  chatIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
  },
  promptCard: {
    marginTop: 18,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  promptIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTextCol: {
    flex: 1,
    gap: 2,
  },
  promptTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  promptDesc: {
    fontSize: 11.5,
    color: COLORS.onSurfaceVariant,
    lineHeight: 16,
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
