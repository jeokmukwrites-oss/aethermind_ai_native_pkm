const SYNC_SERVER_KEY = 'aethermind_sync_server';

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