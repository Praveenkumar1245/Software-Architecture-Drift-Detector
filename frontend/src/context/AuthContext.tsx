import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, RegisterResponse } from '../types';
import { api, setStoredSessionToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionExpiredNotice: string | null;
  clearSessionExpiredNotice: () => void;
  login: (credentials: { email: string; password: string; remember_me?: boolean }) => Promise<void>;
  register: (data: { email: string; password: string; full_name?: string }) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(null);
  }, []);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.getAuthStatus();
      if (res.authenticated && res.user) {
        setUser(res.user);
        return true;
      } else {
        setUser(null);
        setStoredSessionToken(null);
        return false;
      }
    } catch {
      setUser(null);
      setStoredSessionToken(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api.getMe();
      setUser(currentUser);
    } catch {
      setUser(null);
      setStoredSessionToken(null);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Global listener for session expiration / unauthenticated API rejections
  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const customEvent = event as CustomEvent;
      const msg = customEvent.detail?.message || 'Your session has expired. Please sign in again to access your account.';
      setUser(null);
      setStoredSessionToken(null);
      setSessionExpiredNotice(msg);
    };

    window.addEventListener('auth:session_expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session_expired', handleSessionExpired);
  }, []);

  const login = async (credentials: { email: string; password: string; remember_me?: boolean }) => {
    const res = await api.login(credentials);
    setUser(res.user);
    setSessionExpiredNotice(null);
  };

  const register = async (data: { email: string; password: string; full_name?: string }): Promise<RegisterResponse> => {
    const res = await api.register(data);
    return res;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      setUser(null);
      setStoredSessionToken(null);
      setSessionExpiredNotice(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && user.is_verified,
        isLoading,
        sessionExpiredNotice,
        clearSessionExpiredNotice,
        login,
        register,
        logout,
        refreshUser,
        checkAuth,
      }}
    >
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
