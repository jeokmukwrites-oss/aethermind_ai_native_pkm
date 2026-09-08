import { Note } from '../types';
import {
  getAllLiveNotesRaw,
  applyServerState,
  getLocalTombstones,
  clearLocalTombstones,
  isSeededInitial,
  clearSeededInitial,
} from './storage';
import { getServerBaseUrl, apiPath, authHeaders } from './config';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSyncAt: string | null;
  message: string;
}

export interface SyncResult {
  ok: boolean;
  notes?: Note[];
  error?: string;
  serverUrl: string;
}

const SYNC_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One round of device synchronization.
 *
 * Protocol (latest-wins by updatedAt, tombstone-aware):
 *  1. A freshly seeded device (first-ever run) performs a pull-only round so
 *     the sample dataset is never uploaded as genuine user data.
 *  2. The client sends its FULL local note set + deletion tombstones.
 *  3. The server merges (authoritative) and returns its snapshot.
 *  4. The client replaces its local store with the merged snapshot, while
 *     keeping any note edited locally DURING the round (pushed next round).
 */
export async function syncNotes(): Promise<SyncResult> {
  const serverUrl = getServerBaseUrl();
  const endpoint = apiPath('/api/sync/merge');

  try {
    const pullOnly = isSeededInitial();
    const liveNotes = pullOnly ? [] : await getAllLiveNotesRaw();
    const tombstones = getLocalTombstones();
    const deletedNotes = pullOnly
      ? []
      : Object.entries(tombstones).map(([id, deletedAt]) => ({ id, deletedAt }));

    const res = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ liveNotes, deletedNotes }),
      },
      SYNC_TIMEOUT_MS
    );

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('인증 토큰이 올바르지 않습니다 (보관소 → 기기 간 동기화에서 토큰을 확인하세요)');
      }
      throw new Error(`동기화 서버 응답 오류 (HTTP ${res.status})`);
    }

    const data = await res.json();
    const merged = await applyServerState(data.notes || [], data.deletedIds || []);
    clearLocalTombstones();
    if (pullOnly) {
      clearSeededInitial();
    }

    return { ok: true, notes: merged, serverUrl };
  } catch (err: any) {
    const name = err?.name;
    const message = err?.message || String(err);
    const isOffline =
      name === 'AbortError' ||
      err instanceof TypeError ||
      /failed to fetch|network|timed out|load failed|fetch aborted/i.test(message);
    return {
      ok: false,
      error: isOffline
        ? '서버에 연결할 수 없습니다 (오프라인 또는 동기화 서버 미실행)'
        : message,
      serverUrl,
    };
  }
}