import { Note, ChatMessage, AgentReport } from '../types';
import { INITIAL_NOTES } from '../data/initialNotes';

const DB_NAME = 'AetherMind_PKM_DB';
const DB_VERSION = 1;
const NOTES_STORE = 'notes';
const CHAT_STORE = 'chats';
const REPORT_STORE = 'reports';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Fallback memory / localStorage cache in case iframe security blocks IndexedDB
const STORAGE_KEY_NOTES = 'aethermind_notes_cache';
const TOMBSTONE_KEY = 'aethermind_sync_tombstones';
const SEEDED_FLAG_KEY = 'aethermind_seeded_initial';

export async function getStoredNotes(): Promise<Note[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readonly');
      const store = tx.objectStore(NOTES_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as Note[];
        if (!results || results.length === 0) {
          // Initialize with INITIAL_NOTES
          seedInitialNotes().then(resolve).catch(() => resolve(INITIAL_NOTES));
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Falling back to localStorage for notes:', err);
    const local = localStorage.getItem(STORAGE_KEY_NOTES);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        // ignore
      }
    }
    localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(INITIAL_NOTES));
    localStorage.setItem(SEEDED_FLAG_KEY, '1');
    return INITIAL_NOTES;
  }
}

// Raw read of live notes WITHOUT seeding — used by the sync engine so a fresh
// device never uploads the sample dataset as if it were its own vault.
export async function getAllLiveNotesRaw(): Promise<Note[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readonly');
      const store = tx.objectStore(NOTES_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as Note[]);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB raw read failed, using localStorage:', err);
    const local = localStorage.getItem(STORAGE_KEY_NOTES);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        // ignore
      }
    }
    return [];
  }
}

// Replace the entire notes store with an authoritative snapshot (post-sync).
export async function writeAllNotes(notes: Note[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readwrite');
      const store = tx.objectStore(NOTES_STORE);
      store.clear();
      for (const note of notes) {
        store.put(note);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB snapshot write failed:', err);
  }
  localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
}

// Merge server-authoritative state into local storage. Compared against the
// current local copy so that a note edited WHILE a sync was in flight is not
// clobbered (local newer wins and will be pushed on the next sync round).
export async function applyServerState(
  serverNotes: Note[],
  deletedIds: string[]
): Promise<Note[]> {
  const localNotes = await getAllLiveNotesRaw();

  const map = new Map<string, Note>();
  for (const n of localNotes) {
    if (n?.id) map.set(n.id, n);
  }

  for (const s of serverNotes || []) {
    if (!s?.id) continue;
    const local = map.get(s.id);
    const localUpdatedAt =
      local && local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    const serverUpdatedAt = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    if (!local || serverUpdatedAt >= localUpdatedAt) {
      map.set(s.id, s);
    }
  }

  for (const id of deletedIds || []) {
    map.delete(id);
  }

  const merged = Array.from(map.values());
  await writeAllNotes(merged);
  return merged;
}

export function recordTombstone(id: string): void {
  try {
    const existing = getLocalTombstones();
    existing[id] = new Date().toISOString();
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

export function getLocalTombstones(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function clearLocalTombstones(): void {
  try {
    localStorage.removeItem(TOMBSTONE_KEY);
  } catch {
    // ignore
  }
}

export function markSeededInitial(): void {
  try {
    localStorage.setItem(SEEDED_FLAG_KEY, '1');
  } catch {
    // ignore
  }
}

export function isSeededInitial(): boolean {
  try {
    return localStorage.getItem(SEEDED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSeededInitial(): void {
  try {
    localStorage.removeItem(SEEDED_FLAG_KEY);
  } catch {
    // ignore
  }
}

export async function seedInitialNotes(): Promise<Note[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);
    for (const note of INITIAL_NOTES) {
      store.put(note);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Could not seed to IndexedDB:', err);
  }
  localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(INITIAL_NOTES));
  markSeededInitial();
  return INITIAL_NOTES;
}

export async function saveNoteToDB(note: Note): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);
    store.put(note);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB save failed, using localStorage:', err);
  }

  // Also update localStorage cache
  try {
    const current = await getStoredNotes();
    const index = current.findIndex((n) => n.id === note.id);
    if (index >= 0) {
      current[index] = note;
    } else {
      current.unshift(note);
    }
    localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(current));
  } catch (e) {
    // ignore
  }
}

export async function deleteNoteFromDB(noteId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);
    store.delete(noteId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete failed:', err);
  }

  try {
    const local = localStorage.getItem(STORAGE_KEY_NOTES);
    if (local) {
      const current = JSON.parse(local);
      if (Array.isArray(current)) {
        const filtered = current.filter((n: any) => n.id !== noteId);
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.warn('localStorage delete sync failed:', e);
  }

  // Record a deletion tombstone so the server-side merge can propagate the
  // removal to other devices instead of resurrecting the note.
  recordTombstone(noteId);
}

// Vector math and in-memory cosine similarity
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const minLen = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// In-memory hybrid search (keyword match + vector cosine similarity)
export function searchNotesHybrid(
  query: string,
  notes: Note[],
  queryEmbedding?: number[],
  topK = 5
): Array<{ note: Note; score: number; matchReasons: string[] }> {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const queryTokens = lowerQuery
    .replace(/[^\w\s가-힣]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const scored = notes.map((note) => {
    let score = 0;
    const matchReasons: string[] = [];

    // 1. Title match
    if (note.title.toLowerCase().includes(lowerQuery)) {
      score += 0.5;
      matchReasons.push('제목 직접 일치');
    }

    // 2. Token overlap in entities & claims
    for (const token of queryTokens) {
      if (note.entities.some((e) => e.toLowerCase().includes(token))) {
        score += 0.25;
        matchReasons.push(`개념 태그 [${token}] 일치`);
      }
      if (note.claims.some((c) => c.toLowerCase().includes(token))) {
        score += 0.2;
        matchReasons.push(`핵심 주장 일치`);
      }
      if (note.content.toLowerCase().includes(token)) {
        score += 0.1;
      }
    }

    // 3. Vector embedding similarity if both query and note have vectors
    if (queryEmbedding && note.embedding && note.embedding.length > 0) {
      const cos = cosineSimilarity(queryEmbedding, note.embedding);
      if (cos > 0.4) {
        score += cos * 0.7;
        matchReasons.push(`시맨틱 벡터 유사도 (${Math.round(cos * 100)}%)`);
      }
    }

    return { note, score, matchReasons };
  });

  return scored
    .filter((item) => item.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
