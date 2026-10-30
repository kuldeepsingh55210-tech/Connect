import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import { refreshNotificationUnread } from '../hooks/useNotificationUnread';
import {
  API_BASE_URL,
  getAuthToken,
  getMe,
  getUserProfile,
  getConnections,
  getMessages,
  sendMessage,
  unmatchConnection,
  blockUser,
  reportUser,
  markThreadRead,
  ChatMessage,
  PublicUserProfile,
} from '../services/api';

interface ChatScreenProps {
  navigation: any;
  route?: {
    params?: {
      connectionId: string;
      otherUserId?: string;
      otherUser?: any;
    };
  };
}

const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'fake_profile', label: 'Fake or misleading profile' },
  { key: 'harassment', label: 'Harassment or offensive behavior' },
  { key: 'inappropriate_photo', label: 'Inappropriate photo' },
  { key: 'other', label: 'Other issue' },
];

function formatMessageTime(dateString?: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Deduplicates messages by real ID as a safety net.
 * Two messages with the same real ID can never render twice.
 */
export function dedupeMessages(msgs: ChatMessage[]): ChatMessage[] {
  const seenIds = new Set<string>();
  const result: ChatMessage[] = [];

  for (const m of msgs) {
    const mid = (m.id || m._id || '').toString();
    if (!mid) {
      result.push(m);
      continue;
    }
    if (seenIds.has(mid)) {
      continue;
    }
    seenIds.add(mid);
    result.push(m);
  }

  return result;
}

/**
 * Reconciles incoming socket messages:
 * 1. If a message with the same real id already exists, ignore it.
 * 2. If newMsg.senderId is the current user and there is a pending optimistic message
 *    (id starts with 'temp-') with the same text, replace that optimistic message with newMsg.
 * 3. Otherwise append as before.
 * Preserves readAt if present.
 */
export function reconcileSocketMessage(
  prev: ChatMessage[],
  newMsg: ChatMessage,
  currentUserId?: string
): ChatMessage[] {
  const newMsgId = (newMsg.id || newMsg._id)?.toString();
  if (!newMsgId) return prev;

  // 1. If a message with the same real id already exists, ignore it (keep this).
  const alreadyExists = prev.some(
    (m) => (m.id || m._id)?.toString() === newMsgId
  );
  if (alreadyExists) return prev;

  // 2. ALSO, if newMsg.senderId is the current user and there is a pending optimistic message
  // (id starts with 'temp-') with the same text, replace that optimistic message with newMsg instead of appending.
  const isFromMe =
    (Boolean(currentUserId) && newMsg.senderId?.toString() === currentUserId?.toString()) ||
    prev.some(
      (m) =>
        (m.id || m._id || '').toString().startsWith('temp-') &&
        m.senderId?.toString() === newMsg.senderId?.toString()
    );

  if (isFromMe) {
    const pendingIdx = prev.findIndex((m) => {
      const mid = (m.id || m._id || '').toString();
      return mid.startsWith('temp-') && m.text === newMsg.text;
    });

    if (pendingIdx !== -1) {
      const next = [...prev];
      next[pendingIdx] = {
        ...newMsg,
        readAt: newMsg.readAt !== undefined ? newMsg.readAt : prev[pendingIdx].readAt,
      };
      return next;
    }
  }

  // 3. Otherwise append as before.
  return [...prev, newMsg];
}

/**
 * Reconciles REST response after sending a message:
 * 1. If the saved message's real id already exists in state (socket arrived first),
 *    REMOVE the optimistic temp message instead of replacing it (so no second copy).
 * 2. If it does not exist yet, replace the temp message with savedMsg as today.
 * Preserves readAt if present.
 */
export function reconcileRestMessage(
  prev: ChatMessage[],
  savedMsg: ChatMessage,
  tempId: string
): ChatMessage[] {
  const savedId = (savedMsg.id || savedMsg._id)?.toString();
  if (!savedId) return prev;

  // If the saved message's real id already exists in state (socket arrived first)
  const alreadyExists = prev.some(
    (m) => (m.id || m._id)?.toString() === savedId && (m.id || m._id) !== tempId
  );

  if (alreadyExists) {
    // REMOVE the optimistic temp message instead of replacing it (so no second copy)
    return prev.filter((m) => (m.id || m._id) !== tempId);
  }

  // If it does not exist yet, replace the temp message with savedMsg, preserving readAt
  return prev.map((m) => {
    if ((m.id || m._id) === tempId) {
      return {
        ...savedMsg,
        readAt: savedMsg.readAt !== undefined ? savedMsg.readAt : m.readAt,
      };
    }
    return m;
  });
}

/**
 * Applies a read receipt from Socket.io event 'message:read':
 * - If readerId !== currentUserId and connectionId matches, sets readAt on all
 *   messages sent by currentUserId that currently have no readAt.
 * - Ignores events where readerId is currentUserId (e.g. self-read from REST).
 * - Ignores events for other connection IDs.
 */
export function applyReadReceipt(
  messages: ChatMessage[],
  event: { connectionId: string; readerId: string; readAt: string | Date },
  currentUserId: string,
  targetConnectionId: string
): ChatMessage[] {
  if (!event || !event.connectionId || !event.readerId) {
    return messages;
  }

  if (event.connectionId.toString() !== targetConnectionId.toString()) {
    return messages;
  }

  if (event.readerId.toString() === currentUserId.toString()) {
    return messages;
  }

  const readAtStr =
    typeof event.readAt === 'string'
      ? event.readAt
      : event.readAt instanceof Date
      ? event.readAt.toISOString()
      : new Date().toISOString();

  let hasChanged = false;
  const updated = messages.map((m) => {
    const isMine = m.senderId?.toString() === currentUserId.toString();
    if (isMine && !m.readAt) {
      hasChanged = true;
      return {
        ...m,
        readAt: readAtStr,
      };
    }
    return m;
  });

  return hasChanged ? updated : messages;
}

/**
 * Computes tick icon and color for a message:
 * - Single tick (checkmark, secondary color) when readAt is null or optimistic temp message.
 * - Double tick (checkmark-done, primary #18181B) when readAt is set.
 */
export function getMessageTickState(
  msg: ChatMessage,
  isMine: boolean
): { showTick: boolean; isDouble: boolean; color: string; iconName: 'checkmark' | 'checkmark-done' } {
  if (!isMine) {
    return { showTick: false, isDouble: false, color: '', iconName: 'checkmark' };
  }
  const isTemp = (msg.id || msg._id || '').toString().startsWith('temp-');
  const isRead = Boolean(msg.readAt) && !isTemp;
  return {
    showTick: true,
    isDouble: isRead,
    color: isRead ? '#18181B' : COLORS.secondary,
    iconName: isRead ? 'checkmark-done' : 'checkmark',
  };
}

/**
 * Finds the ID of the LAST message sent by current user that has readAt set.
 * Returns null if no such message exists.
 */
export function getLastReadMyMessageId(
  messages: ChatMessage[],
  currentUserId: string
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const isMine =
      m.senderId?.toString() === currentUserId.toString() &&
      !(m.id || m._id || '').toString().startsWith('temp-');
    if (isMine && m.readAt) {
      return (m.id || m._id || '').toString();
    }
  }
  return null;
}

/**
 * Checks whether both app and screen are currently active/visible.
 */
export function isAppAndScreenActive(isFocused: boolean): boolean {
  if (!isFocused) return false;
  if (AppState.currentState !== 'active') return false;
  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return false;
  return true;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ navigation, route }) => {
  const connectionId = route?.params?.connectionId || '';
  const initialOtherUser = route?.params?.otherUser;
  const initialOtherUserId = route?.params?.otherUserId || initialOtherUser?.id;

  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  const debouncedMarkReadTimer = useRef<NodeJS.Timeout | null>(null);

  const triggerDebouncedMarkRead = useCallback(() => {
    if (debouncedMarkReadTimer.current) {
      clearTimeout(debouncedMarkReadTimer.current);
    }
    debouncedMarkReadTimer.current = setTimeout(() => {
      if (connectionId && isAppAndScreenActive(isFocusedRef.current)) {
        markThreadRead(connectionId).catch(() => {});
      }
    }, 500);
  }, [connectionId]);

  useEffect(() => {
    return () => {
      if (debouncedMarkReadTimer.current) {
        clearTimeout(debouncedMarkReadTimer.current);
      }
    };
  }, []);

  // Mark thread read when screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (connectionId && isAppAndScreenActive(true)) {
        markThreadRead(connectionId).catch(() => {});
      }
    }, [connectionId])
  );

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const currentUserIdRef = useRef<string>('');
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);
  const [otherUser, setOtherUser] = useState<PublicUserProfile | any>(initialOtherUser || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);

  // Modals
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Report Form State
  const [reportReason, setReportReason] = useState<string>('spam');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [isSubmittingBlock, setIsSubmittingBlock] = useState<boolean>(false);
  const [isSubmittingUnmatch, setIsSubmittingUnmatch] = useState<boolean>(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastOpacity] = useState(new Animated.Value(0));

  const scrollViewRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<TextInput | null>(null);

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

  // 1. Initial Data Load & Socket Connection
  useEffect(() => {
    let isMounted = true;

    async function initializeChat() {
      setIsLoading(true);
      try {
        // A. Resolve current user
        const meRes = await getMe().catch(() => null);
        const myId = meRes?.profile?.id || meRes?.user?.id || meRes?.id || '';
        if (isMounted) {
          currentUserIdRef.current = myId.toString();
          setCurrentUserId(myId.toString());
        }

        // B. Resolve other participant if needed
        let resolvedOtherUser = otherUser;
        if (!resolvedOtherUser) {
          if (initialOtherUserId) {
            resolvedOtherUser = await getUserProfile(initialOtherUserId).catch(() => null);
          } else {
            // Find in accepted connections
            const connList = await getConnections('accepted').catch(() => ({ connections: [] }));
            const match = connList.connections?.find(
              (c: any) => c.connectionId.toString() === connectionId.toString()
            );
            if (match) {
              resolvedOtherUser = match.user || match;
            }
          }
          if (isMounted && resolvedOtherUser) {
            setOtherUser(resolvedOtherUser);
          }
        }

        // C. Fetch message history via getMessages(connectionId)
        if (connectionId) {
          const historyRes = await getMessages(connectionId).catch(() => ({ messages: [] }));
          if (isMounted) {
            setMessages(historyRes.messages || []);
            // When thread finishes loading and screen is active, mark read
            if (isAppAndScreenActive(isFocusedRef.current)) {
              markThreadRead(connectionId).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        console.error('[ChatScreen] Init failed:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initializeChat();

    // D. Connect Socket.io client using stored JWT, emit "thread:join" with { connectionId }
    const token = getAuthToken();
    if (token && connectionId) {
      const socket = io(API_BASE_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('thread:join', { connectionId });
      });

      socket.on('message:new', (newMsg: ChatMessage) => {
        if (newMsg && newMsg.connectionId?.toString() === connectionId.toString()) {
          setMessages((prev) =>
            reconcileSocketMessage(
              prev,
              newMsg,
              currentUserIdRef.current || currentUserId
            )
          );
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 120);

          // If message is from other participant and screen is active, trigger debounced mark read (~500ms)
          const isFromOther =
            newMsg.senderId?.toString() !== (currentUserIdRef.current || currentUserId);
          if (isFromOther && isAppAndScreenActive(isFocusedRef.current)) {
            triggerDebouncedMarkRead();
          }
        }
      });

      socket.on('message:read', (data: any) => {
        if (data && data.connectionId?.toString() === connectionId.toString()) {
          setMessages((prev) =>
            applyReadReceipt(
              prev,
              data,
              currentUserIdRef.current || currentUserId,
              connectionId
            )
          );
        }
      });

      socket.on('notification:new', (data: any) => {
        if (
          data?.type === 'new_message' &&
          connectionId &&
          data?.connectionId?.toString() === connectionId.toString()
        ) {
          return;
        }
        refreshNotificationUnread();
      });
    }

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connectionId, initialOtherUserId, triggerDebouncedMarkRead]);

  const displayMessages = useMemo(() => dedupeMessages(messages), [messages]);

  // Scroll to bottom on load
  useEffect(() => {
    if (!isLoading && displayMessages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 200);
    }
  }, [isLoading, displayMessages.length]);

  // 2. Sending Message
  const handleSend = async () => {
    const textToSend = inputText.trim();
    if (!textToSend || isSending || !connectionId) return;

    setInputText('');
    setIsSending(true);
    inputRef.current?.focus();
    const tempId = `temp-${Date.now()}`;

    try {
      // Optimistic message
      const optimisticMsg: ChatMessage = {
        id: tempId,
        _id: tempId,
        connectionId,
        senderId: currentUserId || currentUserIdRef.current,
        text: textToSend,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      // Call API (also emits to socket via server)
      const res = await sendMessage(connectionId, textToSend);
      const savedMsg = res.data || res;

      // Reconcile saved message with state
      if (savedMsg && (savedMsg.id || savedMsg._id)) {
        setMessages((prev) => reconcileRestMessage(prev, savedMsg, tempId));
      }
    } catch (err: any) {
      // Do not leave a stuck temp message if send fails
      setMessages((prev) => prev.filter((m) => (m.id || m._id) !== tempId));
      showToast(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  // 3. Overflow Menu Actions: Unmatch, Report, Block
  const handleUnmatch = async () => {
    setIsSubmittingUnmatch(true);
    try {
      await unmatchConnection(connectionId);
      setShowMenuModal(false);
      showToast('Unmatched successfully');
      setTimeout(() => {
        navigation?.navigate?.('MainTabs');
      }, 400);
    } catch (err: any) {
      showToast(err.message || 'Failed to unmatch');
    } finally {
      setIsSubmittingUnmatch(false);
    }
  };

  const handleConfirmBlock = async () => {
    const targetUserId = otherUser?.id || initialOtherUserId;
    if (!targetUserId) return;
    setIsSubmittingBlock(true);
    try {
      await blockUser(targetUserId);
      setShowBlockModal(false);
      showToast(`${otherUser?.name || 'User'} has been blocked.`);
      setTimeout(() => {
        navigation?.navigate?.('MainTabs');
      }, 400);
    } catch (err: any) {
      showToast(err.message || 'Failed to block user');
    } finally {
      setIsSubmittingBlock(false);
    }
  };

  const handleConfirmReport = async () => {
    const targetUserId = otherUser?.id || initialOtherUserId;
    if (!targetUserId) return;
    setIsSubmittingReport(true);
    try {
      await reportUser({
        reportedUserId: targetUserId,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setShowReportModal(false);
      setReportDetails('');
      showToast('Thank you. Report received for safety review.');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleOpenProfile = () => {
    const targetUserId = otherUser?.id || initialOtherUserId;
    if (targetUserId) {
      navigation?.navigate?.('ProfileView', { userId: targetUserId });
    }
  };

  const handleQuickSuggest = (text: string) => {
    setInputText(text);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 1. Header Bar matching design-chat */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack?.()}
            accessibilityLabel="Go back"
            testID="chat-back-btn"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerUserInfo}
            activeOpacity={0.8}
            onPress={handleOpenProfile}
            testID="chat-profile-trigger"
          >
            <View style={styles.avatarWrap}>
              {otherUser?.photoUrl ? (
                <Image
                  source={{ uri: otherUser.photoUrl }}
                  style={styles.headerAvatar}
                />
              ) : (
                <View style={styles.headerAvatarFallback}>
                  <Ionicons name="person" size={18} color={COLORS.secondary} />
                </View>
              )}
              <View style={styles.onlineDot} />
            </View>

            <View style={styles.headerTextCol}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerNameText} numberOfLines={1}>
                  {otherUser?.name || 'Connection'}
                </Text>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={COLORS.primary}
                />
              </View>
              {/* Privacy constraint: city name only (no neighborhood or distance) */}
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText} numberOfLines={1}>
                  {otherUser?.city ? `Active in ${otherUser.city}` : 'Connected neighbor'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.menuIconButton}
            onPress={() => setShowMenuModal(true)}
            accessibilityLabel="Thread options"
            testID="chat-menu-trigger"
          >
            <Ionicons name="ellipsis-vertical" size={20} color={COLORS.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Chat Stream */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Centered System Message at the top matching design */}
          <View style={styles.celebrationCard}>
            <View style={styles.celebrationPill}>
              <Text style={styles.celebrationEmoji}>🤝</Text>
              <Text style={styles.celebrationText}>
                You're connected! Say hello to your neighbor
              </Text>
            </View>
            <Text style={styles.celebrationSub}>
              Mutual opt-in connection · City of {otherUser?.city || 'ConnectLocal'}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading messages...</Text>
            </View>
          ) : displayMessages.length === 0 ? (
            <View style={styles.emptyPromptBox}>
              <Text style={styles.emptyPromptTitle}>No messages yet</Text>
              <Text style={styles.emptyPromptSub}>
                Start the conversation with {otherUser?.name || 'your peer'}!
              </Text>
            </View>
          ) : (
            (() => {
              const lastReadMyMsgId = getLastReadMyMessageId(
                displayMessages,
                currentUserId || currentUserIdRef.current
              );

              return displayMessages.map((m, idx) => {
                const msgSenderId = (m.senderId || '').toString();
                const isMine =
                  msgSenderId === currentUserId.toString() ||
                  (currentUserId === '' && msgSenderId !== (otherUser?.id || '').toString());
                const tickState = getMessageTickState(m, isMine);
                const showSeen = isMine && (m.id || m._id)?.toString() === lastReadMyMsgId;

                return (
                  <View
                    key={m.id || m._id || `msg-${idx}`}
                    style={[
                      styles.messageRow,
                      isMine ? styles.messageRowMine : styles.messageRowOther,
                    ]}
                  >
                    {/* Other user's avatar for received bubbles */}
                    {!isMine && (
                      <View style={styles.bubbleAvatarWrap}>
                        {otherUser?.photoUrl ? (
                          <Image
                            source={{ uri: otherUser.photoUrl }}
                            style={styles.bubbleAvatar}
                          />
                        ) : (
                          <View style={styles.bubbleAvatarFallback}>
                            <Ionicons name="person" size={14} color={COLORS.secondary} />
                          </View>
                        )}
                      </View>
                    )}

                    <View
                      style={[
                        styles.bubbleWrap,
                        isMine ? styles.bubbleWrapMine : styles.bubbleWrapOther,
                      ]}
                    >
                      <View
                        style={[
                          styles.bubble,
                          isMine ? styles.bubbleMine : styles.bubbleOther,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bubbleText,
                            isMine ? styles.bubbleTextMine : styles.bubbleTextOther,
                          ]}
                        >
                          {m.text}
                        </Text>
                      </View>

                      {/* Timestamp & Status */}
                      <View
                        style={[
                          styles.timeRow,
                          isMine ? styles.timeRowMine : styles.timeRowOther,
                        ]}
                      >
                        <Text style={styles.timeText}>
                          {formatMessageTime(m.createdAt)}
                        </Text>
                        {tickState.showTick && (
                          <Ionicons
                            name={tickState.iconName}
                            size={13}
                            color={tickState.color}
                            style={styles.checkIcon}
                          />
                        )}
                      </View>

                      {/* Seen indicator under the last of my messages that is read */}
                      {showSeen && (
                        <Text style={styles.seenLabel}>Seen</Text>
                      )}
                    </View>
                  </View>
                );
              });
            })()
          )}

          {/* Quick Suggestion Pill matching design */}
          <View style={styles.suggestionRow}>
            <TouchableOpacity
              style={styles.suggestionPill}
              activeOpacity={0.8}
              onPress={() =>
                handleQuickSuggest(
                  `Hey ${otherUser?.name || 'there'}, great to connect! Would love to grab coffee and chat skills soon.`
                )
              }
            >
              <Ionicons name="cafe-outline" size={15} color={COLORS.onSurface} />
              <Text style={styles.suggestionText}>
                Suggest: Coffee meetup ☕
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 3. Sticky Bottom Input Deck matching design-chat */}
        <View style={styles.inputDeck}>
          {!connectionId ? (
            <View style={styles.inputForm}>
              <View style={[styles.inputFieldWrap, styles.disabledComposerField]}>
                <Text style={styles.disabledComposerText}>
                  Open a conversation from your connections.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.sendBtn, styles.sendBtnDisabled]}
                disabled={true}
                testID="chat-send-btn"
                accessibilityLabel="Send message"
              >
                <Ionicons name="arrow-up" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputForm}>
              <View style={styles.inputFieldWrap}>
                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Type a message..."
                  placeholderTextColor={COLORS.outline}
                  multiline={false}
                  blurOnSubmit={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  onKeyPress={(e: any) => {
                    if (
                      Platform.OS === 'web' &&
                      e.nativeEvent?.key === 'Enter' &&
                      !e.nativeEvent?.shiftKey
                    ) {
                      e.preventDefault?.();
                      handleSend();
                    }
                  }}
                  testID="chat-text-input"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!inputText.trim() || isSending) && styles.sendBtnDisabled,
                ]}
                disabled={!inputText.trim() || isSending}
                onPress={handleSend}
                {...(Platform.OS === 'web'
                  ? {
                      onMouseDown: (e: any) => {
                        e?.preventDefault?.();
                      },
                    }
                  : {})}
                testID="chat-send-btn"
                accessibilityLabel="Send message"
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* 4. Overflow Menu Bottom Sheet: Unmatch, Report, Block, Cancel */}
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
            <Text style={styles.sheetTitle}>Conversation Options</Text>
            <Text style={styles.sheetSubtitle}>
              Manage connection with {otherUser?.name || 'this member'}
            </Text>

            <View style={styles.sheetActions}>
              {/* Unmatch Action */}
              <TouchableOpacity
                style={styles.sheetOptionBtn}
                onPress={handleUnmatch}
                disabled={isSubmittingUnmatch}
                testID="menu-unmatch-btn"
              >
                <Ionicons name="close-circle-outline" size={19} color={COLORS.onSurface} />
                <Text style={styles.sheetOptionText}>
                  {isSubmittingUnmatch ? 'Unmatching...' : 'Unmatch'}
                </Text>
              </TouchableOpacity>

              {/* Report Action */}
              <TouchableOpacity
                style={styles.sheetOptionBtn}
                onPress={() => {
                  setShowMenuModal(false);
                  setShowReportModal(true);
                }}
                testID="menu-report-btn"
              >
                <Ionicons name="flag-outline" size={19} color={COLORS.onSurface} />
                <Text style={styles.sheetOptionText}>Report {otherUser?.name || 'Member'}</Text>
              </TouchableOpacity>

              {/* Block Action */}
              <TouchableOpacity
                style={[styles.sheetOptionBtn, styles.sheetOptionBlock]}
                onPress={() => {
                  setShowMenuModal(false);
                  setShowBlockModal(true);
                }}
                testID="menu-block-btn"
              >
                <Ionicons name="ban-outline" size={19} color="#ffffff" />
                <Text style={styles.sheetOptionBlockText}>Block {otherUser?.name || 'Member'}</Text>
              </TouchableOpacity>

              {/* Cancel Action */}
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

      {/* 5. Block Confirmation Dialog */}
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
            <Text style={styles.dialogTitle}>Block {otherUser?.name || 'this member'}?</Text>
            <Text style={styles.dialogDesc}>
              They won't be able to contact you and will no longer appear in your Discover feed or Connections.
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

      {/* 6. Report Form Modal */}
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
            <Text style={styles.sheetTitle}>Report {otherUser?.name || 'Member'}</Text>
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
              placeholder="Provide more context (max 500 characters)..."
              placeholderTextColor={COLORS.outline}
              maxLength={500}
              multiline
            />
            <Text style={styles.charCountText}>
              {reportDetails.length}/500 characters
            </Text>

            <View style={styles.reportButtonsRow}>
              <TouchableOpacity
                style={styles.reportCancelBtn}
                disabled={isSubmittingReport}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.reportCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportSubmitBtn}
                disabled={isSubmittingReport}
                onPress={handleConfirmReport}
                testID="submit-report-btn"
              >
                {isSubmittingReport ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.reportSubmitText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Floating Toast */}
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
  flexOne: {
    flex: 1,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
    backgroundColor: 'rgba(249, 249, 250, 0.96)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHighest,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  headerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatarWrap: {
    position: 'relative',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceContainer,
  },
  headerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  headerTextCol: {
    flex: 1,
    gap: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.primary,
  },
  statusText: {
    fontSize: 11.5,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  scrollContent: {
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  celebrationCard: {
    alignItems: 'center',
    marginVertical: 8,
    gap: 6,
  },
  celebrationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  celebrationEmoji: {
    fontSize: 14,
  },
  celebrationText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  celebrationSub: {
    fontSize: 11,
    color: COLORS.outline,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
    color: COLORS.onSurfaceVariant,
  },
  emptyPromptBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 4,
  },
  emptyPromptTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  emptyPromptSub: {
    fontSize: 12.5,
    color: COLORS.onSurfaceVariant,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubbleAvatarWrap: {
    marginBottom: 4,
  },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainer,
  },
  bubbleAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleWrap: {
    maxWidth: '82%',
    gap: 3,
  },
  bubbleWrapMine: {
    alignItems: 'flex-end',
  },
  bubbleWrapOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: '#ffffff',
  },
  bubbleTextOther: {
    color: COLORS.onSurface,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  timeRowMine: {
    justifyContent: 'flex-end',
  },
  timeRowOther: {
    justifyContent: 'flex-start',
  },
  timeText: {
    fontSize: 10.5,
    color: COLORS.outline,
  },
  checkIcon: {
    marginLeft: 2,
  },
  seenLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.secondary,
    alignSelf: 'flex-end',
    marginTop: 2,
    marginRight: 2,
  },
  suggestionRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  inputDeck: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: 10,
  },
  inputForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputFieldWrap: {
    flex: 1,
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 14,
    color: COLORS.onSurface,
    padding: 0,
  },
  disabledComposerField: {
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  disabledComposerText: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outlineVariant,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  sheetSubtitle: {
    fontSize: 12.5,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 18,
  },
  sheetActions: {
    width: '100%',
    gap: 8,
  },
  sheetOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  sheetOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  sheetOptionBlock: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  sheetOptionBlockText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  sheetCancelBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 14,
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
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainerHighest,
  },
  dialogIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dialogTitle: {
    fontSize: 17,
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
    marginTop: 10,
    width: '100%',
  },
  dialogCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
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
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  reportOptionsList: {
    marginVertical: 12,
    gap: 8,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  reasonOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  reasonText: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  reasonTextSelected: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.onSurface,
    marginBottom: 6,
  },
  detailsInput: {
    height: 72,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: 10,
    fontSize: 13,
    color: COLORS.onSurface,
    textAlignVertical: 'top',
  },
  charCountText: {
    fontSize: 11,
    color: COLORS.outline,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 14,
  },
  reportButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reportCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  reportSubmitBtn: {
    flex: 1,
    height: 42,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  toast: {
    position: 'absolute',
    top: 68,
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
