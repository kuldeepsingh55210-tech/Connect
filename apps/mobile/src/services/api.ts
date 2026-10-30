import { Platform } from 'react-native';

// Set to host LAN IP for physical device testing via Expo Go or local Wi-Fi.
// Override via EXPO_PUBLIC_API_URL if defined.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://10.146.195.195:4000';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function requireAuthToken(): string {
  const token = getAuthToken();
  if (!token) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return token;
}

// TEMPORARY — replace with real Firebase phone OTP before public launch. See TRD Section 6.1.
export async function postDevLogin(phone: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Dev login failed.');
  }

  setAuthToken(data.token);
  return data;
}

export interface CreateProfilePayload {
  name: string;
  dob: string;
  gender: string;
  city: string;
  skills: string[];
  interests: string[];
  intent: string[];
  photoUrl?: string;
  about?: string;
}

export async function createProfile(payload: CreateProfilePayload) {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Profile creation failed.');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * Upload profile photo to POST /api/users/me/photo.
 * Accepts an image URI (local file URI on mobile, or blob/object URI on web),
 * constructs multipart/form-data, uploads to Cloudinary via the backend,
 * and returns the new secure photoUrl.
 */
export async function uploadProfilePhoto(imageUri: string): Promise<string> {
  const token = requireAuthToken();

  const formData = new FormData();

  if (Platform.OS === 'web') {
    // On web, fetch the blob from the uri and append as File/Blob
    const response = await fetch(imageUri);
    const blob = await response.blob();
    formData.append('photo', blob, 'profile_photo.jpg');
  } else {
    // On native mobile (iOS / Android), react-native's FormData accepts { uri, name, type }
    const filename = imageUri.split('/').pop() || 'profile_photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg';
    formData.append('photo', {
      uri: imageUri,
      name: filename,
      type,
    } as any);
  }

  const res = await fetch(`${API_BASE_URL}/api/users/me/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Note: do NOT set Content-Type header; fetch sets multipart boundary automatically
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to upload photo.');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data.photoUrl;
}

export interface MyProfileResponse {
  id: string;
  _id?: string;
  name: string;
  city: string;
  photoUrl?: string;
  about?: string;
  skills: string[];
  interests: string[];
  intent: string[];
  profile?: any;
  [key: string]: any;
}

export async function getMe(): Promise<MyProfileResponse | null> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('NOT_AUTHENTICATED');
    }
    return null;
  }

  return res.json();
}

export interface DiscoverProfile {
  id: string;
  name: string;
  city: string;
  photoUrl?: string;
  skills: string[];
  interests: string[];
  intent: string[];
  sharedCount: number;
  sharedSkills?: string[];
  sharedInterests?: string[];
}

export interface DiscoverResponse {
  tier1: DiscoverProfile[];
  tier2: DiscoverProfile[];
}

export interface ConnectResult {
  success: boolean;
  status: number;
  isDuplicate?: boolean;
  error?: string;
  data?: any;
}

export async function getDiscover(): Promise<DiscoverResponse> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/discover`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('NOT_AUTHENTICATED');
    }
    const error: any = new Error(data.message || 'Failed to fetch discover feed');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function sendConnectRequest(toUserId: string): Promise<ConnectResult> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ toUserId }),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 201) {
    return { success: true, status: 201, data };
  } else if (res.status === 409) {
    // Already pending or accepted — treat as success visually (set to Requested state)
    return { success: true, status: 409, isDuplicate: true, data };
  } else if (res.status === 429) {
    return {
      success: false,
      status: 429,
      error: 'Daily connect limit reached.',
      data,
    };
  } else {
    return {
      success: false,
      status: res.status,
      error: data?.message || 'Failed to send connection request.',
      data,
    };
  }
}

export interface PublicUserProfile {
  id: string;
  name: string;
  city: string;
  photoUrl?: string;
  skills: string[];
  interests: string[];
  intent: string[];
  about?: string;
}

export async function getUserProfile(userId: string): Promise<PublicUserProfile> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to load user profile');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function blockUser(toUserId: string): Promise<{ success: boolean; message: string }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections/block`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ toUserId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to block user');
  }

  return { success: true, message: data.message || 'User blocked successfully' };
}

export interface ReportUserPayload {
  reportedUserId: string;
  reason: 'spam' | 'fake_profile' | 'harassment' | 'inappropriate_photo' | 'other' | string;
  details?: string;
}

export async function reportUser(payload: ReportUserPayload): Promise<{ success: boolean; message: string }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to submit report');
  }

  return { success: true, message: data.message || 'Report submitted successfully' };
}

export interface ConnectionUser {
  id: string;
  name: string;
  city: string;
  photoUrl?: string;
  skills?: string[];
  interests?: string[];
  intent?: string[];
}

export interface ConnectionItem {
  connectionId: string;
  status: 'pending' | 'accepted' | 'sent' | 'ignored' | 'blocked' | 'unmatched';
  createdAt: string;
  respondedAt?: string | null;
  user: ConnectionUser;
  name?: string;
  city?: string;
  photoUrl?: string;
  skills?: string[];
  interests?: string[];
  unreadCount?: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  lastMessageIsMine?: boolean;
}

export async function getConnections(
  status: 'pending' | 'accepted' | 'sent' = 'pending'
): Promise<{ connections: ConnectionItem[] }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections?status=${status}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to fetch connections');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function respondConnection(
  connectionId: string,
  action: 'accept' | 'ignore'
): Promise<{ success: boolean; message: string; connection: any }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Failed to ${action} connection`);
  }

  return {
    success: true,
    message: data.message || `Connection request ${action}ed successfully`,
    connection: data.connection,
  };
}

export interface ChatMessage {
  id: string;
  _id?: string;
  connectionId: string;
  senderId: string;
  text: string;
  readAt?: string | null;
  createdAt: string;
}

export async function getMessages(
  connectionId: string,
  before?: string
): Promise<{ messages: ChatMessage[]; count: number }> {
  const token = requireAuthToken();

  const url = before
    ? `${API_BASE_URL}/api/connections/${connectionId}/messages?before=${before}`
    : `${API_BASE_URL}/api/connections/${connectionId}/messages`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to fetch messages');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function sendMessage(
  connectionId: string,
  text: string
): Promise<{ message: string; data: ChatMessage } | any> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to send message');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function unmatchConnection(
  connectionId: string
): Promise<{ success: boolean; message: string }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'unmatch' }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to unmatch connection');
  }

  return { success: true, message: data.message || 'Connection unmatched successfully' };
}

export async function markThreadRead(
  connectionId: string
): Promise<{ status: string; readAt: string; count: number }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections/${connectionId}/read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to mark thread as read');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function getUnreadCount(): Promise<{ total: number }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/connections/unread-count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to fetch unread count');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export type NotificationType =
  | 'connect_request'
  | 'connection_accepted'
  | 'new_message';

export interface NotificationActor {
  id: string;
  name: string;
  city: string;
  photoUrl?: string | null;
}

export interface InAppNotification {
  id: string;
  _id?: string;
  type: NotificationType;
  connectionId: string;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActor;
}

export async function getNotifications(params?: {
  limit?: number;
  before?: string;
}): Promise<{ status: string; notifications: InAppNotification[]; count: number }> {
  const token = requireAuthToken();
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.before) queryParams.append('before', params.before);

  const qs = queryParams.toString();
  const url = `${API_BASE_URL}/api/notifications${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.message || 'Failed to fetch notifications');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function getNotificationUnreadCount(): Promise<{ total: number }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(
      data.message || 'Failed to fetch notification unread count'
    );
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function markNotificationRead(
  id: string
): Promise<{ status: string; notification?: any; count?: number }> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(
      data.message || 'Failed to mark notification as read'
    );
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function markAllNotificationsRead(): Promise<{
  status: string;
  count: number;
}> {
  const token = requireAuthToken();

  const res = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(
      data.message || 'Failed to mark all notifications as read'
    );
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}
