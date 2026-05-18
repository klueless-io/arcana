#!/usr/bin/env bash
# Builds all workspace packages via project references. Exits 0 vacuously when no packages exist yet.
set -euo pipefail

if compgen -G "packages/*/tsconfig.json" > /dev/null; then
  exec tsc -b "$@"
fi

echo "scripts/build.sh: no packages with tsconfig.json yet — skipping"
exit 0
