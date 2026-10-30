import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import {
  getNotifications,
  getConnections,
  markNotificationRead,
  markAllNotificationsRead,
  InAppNotification,
  NotificationType,
  ConnectionItem,
} from '../services/api';
import { openChatForConnection } from './ConnectionsScreen';
import { refreshNotificationUnread } from '../hooks/useNotificationUnread';

/**
 * Pure helper: builds human-readable notification text.
 */
export function getNotificationText(type: NotificationType | string, actorName?: string): string {
  const name = (actorName && actorName.trim()) || '';
  switch (type) {
    case 'connect_request':
      return name ? `${name} wants to connect with you` : 'Someone wants to connect with you';
    case 'connection_accepted':
      return name ? `${name} accepted your request` : 'Someone accepted your request';
    case 'new_message':
      return name ? `New message from ${name}` : 'New message';
    default:
      return name ? `Notification from ${name}` : 'New notification';
  }
}

/**
 * Pure helper: formats relative time ("Just now", "2m", "3h", "Yesterday", "5d", or "Oct 26").
 */
export function formatNotificationRelativeTime(
  dateString?: string,
  nowMs: number = Date.now()
): string {
  if (!dateString) return '';
  const date = new Date(dateString).getTime();
  if (isNaN(date)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - date) / 1000));

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;

  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Pure helper: checks if notification is unread.
 */
export function isNotificationUnread(notification: { readAt?: string | null }): boolean {
  return !notification.readAt;
}

export type NavigationDecision =
  | { action: 'requests' }
  | { action: 'chat'; connection: any }
  | { action: 'unavailable' };

/**
 * Pure helper: decides where tapping a notification navigates.
 */
export function getNotificationNavigationDecision(
  type: string,
  connectionId: string,
  acceptedConnections: Array<any> = []
): NavigationDecision {
  if (type === 'connect_request') {
    return { action: 'requests' };
  }

  if (type === 'connection_accepted' || type === 'new_message') {
    const conn = acceptedConnections.find(
      (c) => (c.connectionId || c._id || c.id)?.toString() === connectionId?.toString()
    );
    if (conn) {
      return { action: 'chat', connection: conn };
    }
    return { action: 'unavailable' };
  }

  return { action: 'unavailable' };
}

interface NotificationsScreenProps {
  navigation: any;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ navigation }) => {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState<boolean>(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastOpacity] = useState(new Animated.Value(0));

  const showToast = useCallback(
    (msg: string) => {
      setToastMessage(msg);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
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

  const fetchInitialNotifications = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await getNotifications({ limit: 30 });
      const items = res.notifications || [];
      setNotifications(items);
      setHasMore(items.length >= 30);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load notifications');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialNotifications();
  }, [fetchInitialNotifications]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchInitialNotifications();
    refreshNotificationUnread();
  }, [fetchInitialNotifications]);

  const onLoadMore = useCallback(async () => {
    if (isFetchingMore || !hasMore || notifications.length === 0) return;

    const oldest = notifications[notifications.length - 1];
    if (!oldest?.createdAt) return;

    setIsFetchingMore(true);
    try {
      const res = await getNotifications({ limit: 30, before: oldest.createdAt });
      const moreItems = res.notifications || [];
      if (moreItems.length === 0) {
        setHasMore(false);
      } else {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => (n.id || n._id)?.toString()));
          const uniqueNew = moreItems.filter(
            (n) => !existingIds.has((n.id || n._id)?.toString())
          );
          return [...prev, ...uniqueNew];
        });
        if (moreItems.length < 30) {
          setHasMore(false);
        }
      }
    } catch {
      // Ignore background pagination error
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMore, notifications]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0 || isMarkingAllRead) return;
    setIsMarkingAllRead(true);

    const prevNotifications = [...notifications];
    const nowIso = new Date().toISOString();

    // Optimistically mark all read
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: nowIso }))
    );

    try {
      await markAllNotificationsRead();
      refreshNotificationUnread();
    } catch {
      // Rollback on failure
      setNotifications(prevNotifications);
      showToast('Failed to mark all as read');
    } finally {
      setIsMarkingAllRead(false);
    }
  }, [unreadCount, isMarkingAllRead, notifications, showToast]);

  const handleNotificationPress = useCallback(
    async (item: InAppNotification) => {
      const notificationId = (item.id || item._id)?.toString();

      // Optimistically mark as read if unread
      if (!item.readAt && notificationId) {
        setNotifications((prev) =>
          prev.map((n) =>
            (n.id || n._id)?.toString() === notificationId
              ? { ...n, readAt: new Date().toISOString() }
              : n
          )
        );
        markNotificationRead(notificationId)
          .then(() => refreshNotificationUnread())
          .catch(() => {});
      }

      if (item.type === 'connect_request') {
        navigation?.navigate?.('Connections', { tab: 'requests' });
        return;
      }

      if (item.type === 'connection_accepted' || item.type === 'new_message') {
        try {
          const res = await getConnections('accepted');
          const accepted = res.connections || [];
          const decision = getNotificationNavigationDecision(
            item.type,
            item.connectionId,
            accepted
          );

          if (decision.action === 'chat') {
            openChatForConnection(navigation, decision.connection);
          } else {
            showToast('This conversation is no longer available');
          }
        } catch {
          showToast('This conversation is no longer available');
        }
      }
    },
    [navigation, showToast]
  );

  const renderItem = ({ item }: { item: InAppNotification }) => {
    const unread = isNotificationUnread(item);
    const actorName = item.actor?.name;
    const titleText = getNotificationText(item.type, actorName);
    const relativeTime = formatNotificationRelativeTime(item.createdAt);
    const city = item.actor?.city;

    return (
      <TouchableOpacity
        style={[styles.card, unread && styles.unreadCard]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {item.actor?.photoUrl ? (
            <Image source={{ uri: item.actor.photoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={20} color={COLORS.secondary} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          <Text
            style={[styles.titleText, unread && styles.unreadTitleText]}
            numberOfLines={2}
          >
            {titleText}
          </Text>

          <View style={styles.metaRow}>
            {Boolean(city) && (
              <>
                <Text style={styles.metaCityText}>{city}</Text>
                <Text style={styles.metaDotText}>·</Text>
              </>
            )}
            <Text style={styles.metaTimeText}>{relativeTime}</Text>
          </View>
        </View>

        {/* Unread Black Dot */}
        {unread && (
          <View style={styles.dotContainer}>
            <View style={styles.unreadDot} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack?.()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.markAllButton,
            (unreadCount === 0 || isMarkingAllRead) && styles.markAllButtonDisabled,
          ]}
          onPress={handleMarkAllRead}
          disabled={unreadCount === 0 || isMarkingAllRead}
          accessibilityLabel="Mark all as read"
        >
          <Text
            style={[
              styles.markAllButtonText,
              (unreadCount === 0 || isMarkingAllRead) && styles.markAllButtonTextDisabled,
            ]}
          >
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Body */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Unable to load notifications</Text>
          <Text style={styles.errorMessage}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchInitialNotifications}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="bell" size={28} color={COLORS.secondary} />
          </View>
          <Text style={styles.emptyTitle}>No notifications yet.</Text>
          <Text style={styles.emptySubtitle}>
            When peers connect with you or send messages, you'll see them here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => (item.id || item._id || '').toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={
            isFetchingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      )}

      {/* Toast */}
      {toastMessage && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
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
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHighest,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.onSurface,
    letterSpacing: -0.3,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: 'transparent',
  },
  markAllButtonDisabled: {
    borderColor: COLORS.surfaceContainerHighest,
    opacity: 0.5,
  },
  markAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  markAllButtonTextDisabled: {
    color: COLORS.outline,
  },
  listContent: {
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: 14,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  unreadCard: {
    backgroundColor: '#ffffff',
    borderColor: COLORS.outlineVariant,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.onSurface,
    lineHeight: 19,
  },
  unreadTitleText: {
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  metaCityText: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  metaDotText: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  metaTimeText: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  dotContainer: {
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#18181B',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginBottom: 6,
  },
  errorMessage: {
    fontSize: 13,
    color: COLORS.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#18181B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    maxWidth: '85%',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
