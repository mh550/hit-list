#!/usr/bin/env bash
# Run by the harness before every session, in the run's worktree. Installs deps when they are missing or stale.
set -euo pipefail
cd "$(dirname "$0")/.."
SCRATCH=${HARNESS_SCRATCH:-/tmp/harness/hit_list/manual}
mkdir -p "$SCRATCH"
# package-lock changes mid-run (a new dependency) → reinstall
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci --no-audit --no-fund > "$SCRATCH/npm.log" 2>&1 || { tail -20 "$SCRATCH/npm.log"; exit 1; }
fi
echo "deps ok · suite: npx expo lint && npx tsc --noEmit && npx jest --silent"
