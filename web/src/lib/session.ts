const SESSION_KEY = 'lean.session';

export function getToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // Storage may be unavailable or full; the app can still render.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage may be unavailable in privacy modes.
  }
}
