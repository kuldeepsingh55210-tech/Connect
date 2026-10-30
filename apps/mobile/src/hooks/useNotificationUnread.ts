import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { getNotificationUnreadCount, getAuthToken } from '../services/api';

type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();

/**
 * Exported way for NotificationsScreen (or anywhere) to immediately trigger
 * a refresh of all mounted useNotificationUnread hooks (e.g. after mark-as-read).
 */
export function refreshNotificationUnread() {
  refreshListeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export interface UseNotificationUnreadOptions {
  isFocused?: boolean;
  socket?: any;
  activeConnectionId?: string;
}

/**
 * Shared hook to track and periodically poll the unread notification count.
 * - Polls getNotificationUnreadCount() on mount
 * - Polls whenever the screen gains focus / is active
 * - Polls every 20s while the app is active
 * - Stops polling when the app is in the background (AppState !== 'active' or document.hidden on web)
 * - Refreshes immediately when refreshNotificationUnread() is called
 * - If an active socket is provided, refreshes immediately on 'notification:new'
 *   (ignoring new_message for the active connection if activeConnectionId is provided)
 */
export function useNotificationUnread(
  optionsOrFocused: boolean | UseNotificationUnreadOptions = true
): number {
  const options: UseNotificationUnreadOptions =
    typeof optionsOrFocused === 'boolean'
      ? { isFocused: optionsOrFocused }
      : optionsOrFocused;

  const isFocused = options.isFocused !== false;
  const socket = options.socket;
  const activeConnectionId = options.activeConnectionId;

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCount = useCallback(async () => {
    // Only fetch if authenticated and app is active
    if (!getAuthToken()) return;
    if (AppState.currentState !== 'active') return;
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return;

    try {
      const res = await getNotificationUnreadCount();
      if (typeof res?.total === 'number') {
        setUnreadCount(res.total);
      }
    } catch {
      // Ignore transient fetch errors
    }
  }, []);

  // Register listener for external manual refresh (e.g. markAllRead or markNotificationRead)
  useEffect(() => {
    refreshListeners.add(fetchCount);
    return () => {
      refreshListeners.delete(fetchCount);
    };
  }, [fetchCount]);

  // Poll on mount and when screen focus state changes to true
  useEffect(() => {
    if (isFocused) {
      fetchCount();
    }
  }, [isFocused, fetchCount]);

  // Socket listener IF a socket is already open on that screen
  useEffect(() => {
    if (!socket) return;

    const handleNotificationNew = (data: any) => {
      // Rule 5: If currently inside Chat for connection X, ignore new_message for connection X
      if (
        data?.type === 'new_message' &&
        activeConnectionId &&
        data?.connectionId?.toString() === activeConnectionId.toString()
      ) {
        return;
      }
      fetchCount();
      refreshNotificationUnread();
    };

    socket.on('notification:new', handleNotificationNew);
    return () => {
      socket.off('notification:new', handleNotificationNew);
    };
  }, [socket, activeConnectionId, fetchCount]);

  // Active polling every 20s while app is in foreground
  useEffect(() => {
    function startPolling() {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        fetchCount();
      }, 20000);
    }

    function stopPolling() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    if (AppState.currentState === 'active') {
      startPolling();
    }

    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchCount();
        startPolling();
      } else {
        stopPolling();
      }
    });

    let visibilityHandler: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (!document.hidden) {
          fetchCount();
          startPolling();
        } else {
          stopPolling();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }

    return () => {
      stopPolling();
      appStateSub.remove();
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    };
  }, [fetchCount]);

  return unreadCount;
}
