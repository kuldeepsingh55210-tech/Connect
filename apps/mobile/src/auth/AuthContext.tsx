import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setAuthToken, getAuthToken } from '../services/api';

// TEMPORARY — AuthContext currently persists a dev-auth token (not a verified Firebase token). See TRD Section 6.1
const AUTH_TOKEN_KEY = 'connectlocal_auth_token';

interface AuthContextType {
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cross-platform SecureStore helpers with web fallback
async function getStoredToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(AUTH_TOKEN_KEY);
      }
      return null;
    }
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch (err) {
    console.warn('[AuthContext] Error retrieving stored token:', err);
    return null;
  }
}

async function storeToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      }
      return;
    }
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } catch (err) {
    console.warn('[AuthContext] Error saving token to storage:', err);
  }
}

async function removeStoredToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      return;
    }
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch (err) {
    console.warn('[AuthContext] Error deleting token from storage:', err);
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStoredSession() {
      try {
        const storedToken = await getStoredToken();
        if (storedToken && isMounted) {
          setToken(storedToken);
          setAuthToken(storedToken);
        } else if (isMounted) {
          setToken(null);
          setAuthToken(null);
        }
      } catch (err) {
        console.warn('[AuthContext] Failed to load stored session:', err);
        if (isMounted) {
          setToken(null);
          setAuthToken(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadStoredSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (newToken: string) => {
    // 1. Keep in-memory api.ts token in sync
    setAuthToken(newToken);
    // 2. Persist in SecureStore for restarts
    await storeToken(newToken);
    // 3. Update React context state
    setToken(newToken);
  };

  const logout = async () => {
    // 1. Clear in-memory api.ts token
    setAuthToken(null);
    // 2. Remove from SecureStore
    await removeStoredToken();
    // 3. Update React context state
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
