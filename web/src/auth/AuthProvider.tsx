import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginResponse, PublicUser } from '@lean/shared';
import { api, ApiError, onUnauthorized } from '../lib/api';
import { clearToken, getToken, setToken } from '../lib/session';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  retry(): void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<PublicUser | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Ignore responses from a previous session or an unmounted provider.
  const generation = useRef(0);
  const closeSession = useCallback(() => {
    generation.current += 1;
    clearToken();
    try {
      localStorage.removeItem('lean.shopping.v1');
    } catch {
      // Storage may be unavailable.
    }
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  useEffect(() => onUnauthorized(closeSession), [closeSession]);

  useEffect(() => {
    if (!getToken()) return;
    const current = ++generation.current;
    setStatus('loading');
    void api.get<PublicUser>('/api/me').then(
      (profile) => {
        if (current !== generation.current) return;
        setUser(profile);
        setStatus('authenticated');
      },
      (error: unknown) => {
        if (current !== generation.current) return;
        if (error instanceof ApiError && error.status === 401) closeSession();
        else setStatus('error');
      },
    );
    return () => {
      generation.current += 1;
    };
  }, [attempt, closeSession]);

  async function login(username: string, password: string) {
    const current = ++generation.current;
    const response = await api.post<LoginResponse>('/api/auth/login', { username, password });
    if (current !== generation.current) return;
    setToken(response.token);
    queryClient.clear();
    setUser(response.user);
    setStatus('authenticated');
  }

  async function endSession(path: string) {
    const token = getToken();
    closeSession();
    if (token) void api.post(path, undefined, { token }).catch(() => {});
  }

  async function logoutAll() {
    const token = getToken();
    const current = generation.current;
    try {
      if (token) await api.post('/api/auth/logout-all', undefined, { token });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    if (current === generation.current) closeSession();
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        login,
        logout: () => endSession('/api/auth/logout'),
        logoutAll,
        changePassword: (currentPassword, newPassword) =>
          api.post<void>('/api/auth/password', { currentPassword, newPassword }),
        retry: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return auth;
}
