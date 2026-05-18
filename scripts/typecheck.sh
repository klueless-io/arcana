#!/usr/bin/env bash
# Type-checks all workspace packages. Exits 0 vacuously when no packages exist yet.
set -euo pipefail

if compgen -G "packages/*/tsconfig.json" > /dev/null; then
  exec tsc -b "$@"
fi

echo "scripts/typecheck.sh: no packages with tsconfig.json yet — skipping"
exit 0
