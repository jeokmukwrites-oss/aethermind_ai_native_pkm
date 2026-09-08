const SYNC_SERVER_KEY = 'aethermind_sync_server';
const SYNC_TOKEN_KEY = 'aethermind_sync_token';

export function normalizeServerUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

export function getServerBaseUrl(): string {
  try {
    return normalizeServerUrl(localStorage.getItem(SYNC_SERVER_KEY) || '');
  } catch {
    return '';
  }
}

export function setServerBaseUrl(url: string): void {
  const normalized = normalizeServerUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(SYNC_SERVER_KEY, normalized);
    } else {
      localStorage.removeItem(SYNC_SERVER_KEY);
    }
  } catch {
    // ignore
  }
}

export function apiPath(endpoint: string): string {
  const base = getServerBaseUrl();
  return base ? base + endpoint : endpoint;
}

export function getSyncToken(): string {
  try {
    return (localStorage.getItem(SYNC_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setSyncToken(token: string): void {
  try {
    const trimmed = (token || '').trim();
    if (trimmed) {
      localStorage.setItem(SYNC_TOKEN_KEY, trimmed);
    } else {
      localStorage.removeItem(SYNC_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

// Every /api/* call must carry this — the server rejects requests without a
// matching token (see server.ts's auth middleware).
export function authHeaders(): Record<string, string> {
  const token = getSyncToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}