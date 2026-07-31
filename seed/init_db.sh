#!/usr/bin/env bash
# Bootstrap the live activity_logs.db from the seed copy.
#
# The live database is gitignored (it is runtime data, not source — it receives
# continuous writes from agents in multiple repos and would produce unmergeable
# binary diffs if tracked). A fresh clone has no database until this script runs.
# log_activity.py checks for the DB's existence in the parent process and exits
# non-zero naming this script when it is missing, so a missing DB is a visible
# error rather than silent loss.
#
# Usage:
#   bash seed/init_db.sh            # create if absent
#   bash seed/init_db.sh --force    # overwrite the live DB with the seed
#
# Never run --force on a live database you want to keep — it destroys every row
# logged since the seed was last curated.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
seed="$script_dir/activity_logs.db"
live="$repo_root/activity_logs.db"

if [ ! -f "$seed" ]; then
  echo "error: seed database not found at $seed" >&2
  exit 1
fi

force=0
if [ "${1:-}" = "--force" ]; then
  force=1
fi

if [ -f "$live" ] && [ "$force" -ne 1 ]; then
  echo "activity_logs.db already exists at $live (use --force to overwrite from seed)"
  exit 0
fi

cp "$seed" "$live"
echo "created $live from $seed"
