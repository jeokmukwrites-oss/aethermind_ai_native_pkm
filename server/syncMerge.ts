// Pure decision logic for the device-sync merge (latest-wins by updatedAt,
// with deletion tombstones). Deliberately has no database or network I/O so
// it can be unit tested directly — server.ts wraps this with the actual
// SQLite reads/writes.

export interface SyncRow {
  payload: string;
  updatedAt: number;
  deletedAt: number | null;
}

export function parseTimestamp(value: string | number | null | undefined): number {
  if (!value) return 0;
  const t = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Applies a client's live notes + deletion tombstones onto the current
 * server-side state and returns the resulting state. `current` only needs to
 * contain entries for ids referenced by `liveNotes`/`deletedNotes` — the
 * caller is responsible for loading exactly the rows it wants merged.
 */
export function mergeSyncState(
  current: Map<string, SyncRow>,
  liveNotes: any[],
  deletedNotes: Array<{ id: string; deletedAt: string | number }>
): Map<string, SyncRow> {
  const next = new Map(current);

  for (const n of liveNotes || []) {
    if (!n || !n.id) continue;
    const updatedAt = parseTimestamp(n.updatedAt || n.createdAt);
    const row = next.get(n.id);
    const serverUpdatedAt = row ? row.updatedAt : 0;
    const serverDeletedAt = row ? row.deletedAt : null;

    if (serverDeletedAt != null && updatedAt <= serverDeletedAt) {
      // Local edit predates the server-side deletion → keep it deleted.
      continue;
    }
    if (updatedAt >= serverUpdatedAt) {
      const revive = serverDeletedAt != null && updatedAt > serverDeletedAt;
      next.set(n.id, {
        payload: JSON.stringify(n),
        updatedAt,
        deletedAt: revive ? null : serverDeletedAt,
      });
    }
    // else: server's copy is newer → keep it, ignore this stale client copy.
  }

  for (const t of deletedNotes || []) {
    if (!t || !t.id) continue;
    const deletedAt = parseTimestamp(t.deletedAt);
    const row = next.get(t.id);
    if (!row) {
      next.set(t.id, { payload: "{}", updatedAt: 0, deletedAt });
    } else if (row.deletedAt == null) {
      if (deletedAt >= row.updatedAt) {
        next.set(t.id, { ...row, deletedAt });
      }
      // else: server has newer content than this deletion → keep it alive.
    } else if (deletedAt > row.deletedAt) {
      next.set(t.id, { ...row, deletedAt });
    }
  }

  return next;
}

/** Splits a full id→row state into the live-notes/deleted-ids shape the client expects. */
export function splitNotesAndTombstones(state: Map<string, SyncRow>): {
  notes: any[];
  deletedIds: string[];
} {
  const notes: any[] = [];
  const deletedIds: string[] = [];
  for (const [id, row] of state) {
    if (row.deletedAt == null) {
      try {
        notes.push(JSON.parse(row.payload));
      } catch {
        // Corrupt row — skip but leave it in place rather than losing data.
      }
    } else {
      deletedIds.push(id);
    }
  }
  return { notes, deletedIds };
}
