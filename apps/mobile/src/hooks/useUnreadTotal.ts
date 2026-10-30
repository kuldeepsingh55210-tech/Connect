import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { getUnreadCount, getAuthToken } from '../services/api';

/**
 * Shared hook to track and periodically poll the total unread message count.
 * - Polls getUnreadCount() on mount
 * - Polls whenever the screen gains focus / is active
 * - Polls every 20s while the app is active
 * - Stops polling when the app is in the background (AppState !== 'active' or document.hidden on web)
 */
export function useUnreadTotal(isFocused: boolean = true): number {
  const [unreadTotal, setUnreadTotal] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTotal = useCallback(async () => {
    // Only fetch if authenticated and app is active
    if (!getAuthToken()) return;
    if (AppState.currentState !== 'active') return;
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return;

    try {
      const res = await getUnreadCount();
      if (typeof res?.total === 'number') {
        setUnreadTotal(res.total);
      }
    } catch {
      // Ignore background or transient fetch errors
    }
  }, []);

  // Poll on mount and when screen focus state changes to true
  useEffect(() => {
    if (isFocused) {
      fetchTotal();
    }
  }, [isFocused, fetchTotal]);

  // Active polling every 20s while app is in foreground
  useEffect(() => {
    function startPolling() {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        fetchTotal();
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
        fetchTotal();
        startPolling();
      } else {
        stopPolling();
      }
    });

    let visibilityHandler: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (!document.hidden) {
          fetchTotal();
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
  }, [fetchTotal]);

  return unreadTotal;
}
