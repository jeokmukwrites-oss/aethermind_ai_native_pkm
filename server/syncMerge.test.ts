import { describe, it, expect } from "vitest";
import { mergeSyncState, splitNotesAndTombstones, parseTimestamp, SyncRow } from "./syncMerge";

function row(payload: object, updatedAt: number, deletedAt: number | null = null): SyncRow {
  return { payload: JSON.stringify(payload), updatedAt, deletedAt };
}

describe("parseTimestamp", () => {
  it("parses ISO date strings", () => {
    expect(parseTimestamp("2026-01-02T00:00:00.000Z")).toBe(Date.parse("2026-01-02T00:00:00.000Z"));
  });

  it("passes numbers through", () => {
    expect(parseTimestamp(12345)).toBe(12345);
  });

  it("treats missing/invalid values as 0", () => {
    expect(parseTimestamp(undefined)).toBe(0);
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp("")).toBe(0);
    expect(parseTimestamp("not a date")).toBe(0);
  });
});

describe("mergeSyncState", () => {
  it("adds a brand-new note the server has never seen", () => {
    const current = new Map<string, SyncRow>();
    const result = mergeSyncState(current, [{ id: "a", title: "hi", updatedAt: "2026-01-01T00:00:00Z" }], []);
    expect(result.has("a")).toBe(true);
    expect(result.get("a")!.deletedAt).toBeNull();
    expect(JSON.parse(result.get("a")!.payload)).toMatchObject({ title: "hi" });
  });

  it("client wins when its edit is newer than the server copy", () => {
    const current = new Map([["a", row({ title: "old" }, 1000)]]);
    const result = mergeSyncState(
      current,
      [{ id: "a", title: "new", updatedAt: new Date(2000).toISOString() }],
      []
    );
    expect(JSON.parse(result.get("a")!.payload).title).toBe("new");
    expect(result.get("a")!.updatedAt).toBe(2000);
  });

  it("server wins when the client's copy is stale", () => {
    const current = new Map([["a", row({ title: "authoritative" }, 5000)]]);
    const result = mergeSyncState(
      current,
      [{ id: "a", title: "stale", updatedAt: new Date(1000).toISOString() }],
      []
    );
    expect(JSON.parse(result.get("a")!.payload).title).toBe("authoritative");
    expect(result.get("a")!.updatedAt).toBe(5000);
  });

  it("deletes a note when the tombstone is newer than its last edit", () => {
    const current = new Map([["a", row({ title: "bye" }, 1000)]]);
    const result = mergeSyncState(current, [], [{ id: "a", deletedAt: new Date(2000).toISOString() }]);
    expect(result.get("a")!.deletedAt).toBe(2000);
  });

  it("ignores a deletion tombstone older than the server's content (no resurrection loop)", () => {
    const current = new Map([["a", row({ title: "still alive" }, 5000)]]);
    const result = mergeSyncState(current, [], [{ id: "a", deletedAt: new Date(1000).toISOString() }]);
    expect(result.get("a")!.deletedAt).toBeNull();
  });

  it("keeps a note deleted when the incoming edit predates the deletion", () => {
    const current = new Map([["a", row({ title: "gone" }, 1000, 2000)]]);
    const result = mergeSyncState(
      current,
      [{ id: "a", title: "late edit from an offline device", updatedAt: new Date(1500).toISOString() }],
      []
    );
    expect(result.get("a")!.deletedAt).toBe(2000);
  });

  it("revives a note when the incoming edit is newer than its deletion", () => {
    const current = new Map([["a", row({ title: "was deleted" }, 1000, 2000)]]);
    const result = mergeSyncState(
      current,
      [{ id: "a", title: "restored", updatedAt: new Date(3000).toISOString() }],
      []
    );
    expect(result.get("a")!.deletedAt).toBeNull();
    expect(JSON.parse(result.get("a")!.payload).title).toBe("restored");
  });

  it("creates a tombstone for a note the server never had", () => {
    const current = new Map<string, SyncRow>();
    const result = mergeSyncState(current, [], [{ id: "ghost", deletedAt: new Date(1000).toISOString() }]);
    expect(result.get("ghost")!.deletedAt).toBe(1000);
  });

  it("keeps the later of two deletion timestamps for an already-deleted note", () => {
    const current = new Map([["a", row({}, 0, 1000)]]);
    const result = mergeSyncState(current, [], [{ id: "a", deletedAt: new Date(500).toISOString() }]);
    // The incoming tombstone is older than the existing one — no change.
    expect(result.get("a")!.deletedAt).toBe(1000);
  });

  it("falls back to createdAt when updatedAt is missing", () => {
    const current = new Map<string, SyncRow>();
    const result = mergeSyncState(current, [{ id: "a", createdAt: new Date(4242).toISOString() }], []);
    expect(result.get("a")!.updatedAt).toBe(4242);
  });
});

describe("splitNotesAndTombstones", () => {
  it("separates live notes from deleted ids", () => {
    const state = new Map<string, SyncRow>([
      ["a", row({ title: "alive" }, 1000)],
      ["b", row({ title: "dead" }, 1000, 2000)],
    ]);
    const { notes, deletedIds } = splitNotesAndTombstones(state);
    expect(notes).toEqual([{ title: "alive" }]);
    expect(deletedIds).toEqual(["b"]);
  });

  it("skips a corrupt payload instead of throwing", () => {
    const state = new Map<string, SyncRow>([["a", { payload: "{not json", updatedAt: 1000, deletedAt: null }]]);
    const { notes, deletedIds } = splitNotesAndTombstones(state);
    expect(notes).toEqual([]);
    expect(deletedIds).toEqual([]);
  });
});
