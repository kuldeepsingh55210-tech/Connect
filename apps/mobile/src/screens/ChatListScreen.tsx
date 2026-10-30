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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { getConnections, ConnectionItem } from '../services/api';
import { openChatForConnection } from './ConnectionsScreen';
import { UnreadBadge } from '../components/UnreadBadge';
import { useUnreadTotal } from '../hooks/useUnreadTotal';

interface ChatListScreenProps {
  navigation?: any;
  onTabChange?: (tab: 'discover' | 'connections' | 'chat' | 'profile') => void;
}

export const ChatListScreen: React.FC<ChatListScreenProps> = ({
  navigation,
  onTabChange,
}) => {
  const [conversations, setConversations] = useState<ConnectionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unreadTotal = useUnreadTotal();

  const loadConversations = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await getConnections('accepted');
      setConversations(res.connections || []);
    } catch (err: any) {
      console.error('[ChatListScreen] Failed to load accepted connections:', err);
      setErrorMessage(err?.message || 'Failed to load conversations.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadConversations();
    });
    return unsubscribe;
  }, [navigation, loadConversations]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadConversations();
  }, [loadConversations]);

  const handleOpenChat = (item: ConnectionItem) => {
    openChatForConnection(navigation, item);
  };

  const handleGoToDiscover = () => {
    if (onTabChange) {
      onTabChange('discover');
    } else {
      navigation?.navigate?.('MainTabs');
    }
  };

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
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
      </View>

      {/* 2. Main Scroll Content */}
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
        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>Messages</Text>
          {!isLoading && !errorMessage && (
            <Text style={styles.conversationCount}>
              {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
            </Text>
          )}
        </View>

        {/* Loading State */}
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.centerMessage}>Loading conversations...</Text>
          </View>
        ) : errorMessage ? (
          /* Error State */
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={36} color={COLORS.outline} />
            <Text style={styles.errorTitle}>Could not load conversations</Text>
            <Text style={styles.errorSubtitle}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              activeOpacity={0.8}
              onPress={() => {
                setIsLoading(true);
                loadConversations();
              }}
              testID="chat-retry-btn"
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : conversations.length === 0 ? (
          /* Empty State (Required) */
          <View style={styles.emptyCard} testID="chat-empty-state">
            <View style={styles.emptyIconBox}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={36}
                color={COLORS.outline}
              />
            </View>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              No conversations yet. Connect with someone from Discover to start chatting.
            </Text>
            <TouchableOpacity
              style={styles.discoverBtn}
              activeOpacity={0.8}
              onPress={handleGoToDiscover}
              testID="chat-discover-btn"
            >
              <Text style={styles.discoverBtnText}>Explore Discover</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Conversation List */
          <View style={styles.conversationList}>
            {conversations.map((item) => {
              const otherUser = item.user || {};
              const name = otherUser.name || item.name || 'Member';
              const city = otherUser.city || item.city || '';
              const photoUrl = otherUser.photoUrl || item.photoUrl;
              const unreadCount = item.unreadCount || 0;
              const hasPreview = Boolean(item.lastMessagePreview);
              const previewText = hasPreview
                ? `${item.lastMessageIsMine ? 'You: ' : ''}${item.lastMessagePreview}`
                : null;

              return (
                <TouchableOpacity
                  key={item.connectionId}
                  style={styles.conversationCard}
                  activeOpacity={0.85}
                  onPress={() => handleOpenChat(item)}
                  testID={`conversation-row-${item.connectionId}`}
                >
                  <View style={styles.avatarWrap}>
                    {photoUrl ? (
                      <Image
                        source={{ uri: photoUrl }}
                        style={styles.avatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Ionicons
                          name="person"
                          size={22}
                          color={COLORS.secondary}
                        />
                      </View>
                    )}
                  </View>

                  <View style={styles.cardDetailsCol}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {name}
                    </Text>
                    {previewText ? (
                      <Text
                        style={[
                          styles.lastMessagePreview,
                          unreadCount > 0 && styles.lastMessagePreviewUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {previewText}
                      </Text>
                    ) : null}
                    {/* Strictly city name only per PRD 10.4 / TRD 7.4 */}
                    {city ? (
                      <View style={styles.locationRow}>
                        <Ionicons
                          name="location-sharp"
                          size={12}
                          color={COLORS.zincMedium}
                        />
                        <Text style={styles.userCity} numberOfLines={1}>
                          {city}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.cardRightWrap}>
                    {unreadCount > 0 && (
                      <UnreadBadge
                        count={unreadCount}
                        style={styles.rowBadge}
                        testID={`unread-badge-${item.connectionId}`}
                      />
                    )}
                    <View style={styles.arrowIconWrap}>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={COLORS.outline}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 3. Bottom Navigation Bar matching design */}
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
        >
          <View style={styles.tabIconWrap}>
            <Ionicons
              name="chatbubble-ellipses"
              size={22}
              color={COLORS.primary}
            />
            <UnreadBadge count={unreadTotal} style={styles.navBadge} testID="nav-chat-badge" />
          </View>
          <Text style={[styles.navLabel, styles.navLabelActive]}>Chat</Text>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 16,
    paddingBottom: 90,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.zincBlack,
    letterSpacing: -0.4,
  },
  conversationCount: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.zincMedium,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerMessage: {
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  errorBox: {
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.onSurface,
    marginTop: 4,
  },
  errorSubtitle: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryBtn: {
    height: 40,
    paddingHorizontal: 22,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyCard: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.zincLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.zincBlack,
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.zincMedium,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  discoverBtn: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  conversationList: {
    gap: 10,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.zincLight,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.zincLight,
  },
  cardDetailsCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.zincBlack,
    letterSpacing: -0.2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  userCity: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.zincMedium,
  },
  lastMessagePreview: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.onSurfaceVariant,
    lineHeight: 18,
  },
  lastMessagePreviewUnread: {
    fontWeight: '600',
    color: '#18181B',
  },
  cardRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBadge: {
    marginRight: 2,
  },
  arrowIconWrap: {
    paddingLeft: 8,
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
