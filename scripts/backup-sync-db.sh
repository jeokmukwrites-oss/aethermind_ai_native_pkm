#!/usr/bin/env bash
# Snapshots data/aethermind-sync.db into data/backups/ and prunes old ones.
# The sync DB is the single source of truth for the whole vault once devices
# sync through it — this is the only thing standing between a disk hiccup and
# losing every note. Uses sqlite3's `.backup` (not `cp`) so it's safe to run
# while the server is live and the DB is in WAL mode.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$PROJECT_DIR/data/aethermind-sync.db"
BACKUP_DIR="$PROJECT_DIR/data/backups"
KEEP=14

if [ ! -f "$DB_PATH" ]; then
  echo "No sync DB at $DB_PATH yet — nothing to back up."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/aethermind-sync-$STAMP.db"

sqlite3 "$DB_PATH" ".backup '$DEST'"
echo "Backed up to $DEST"

# Keep only the most recent $KEEP snapshots.
ls -1t "$BACKUP_DIR"/aethermind-sync-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "Pruned old backup: $old"
done
