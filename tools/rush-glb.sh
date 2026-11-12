#!/usr/bin/env bash
# Rush-only compressed hero models (decision 2026-11-11, measured in cycle 31).
# The campaign originals in public/defense/ stay untouched; rerun this when one of them changes.
# Usage: bash tools/rush-glb.sh        (needs network once for npx; package.json is not touched)
set -euo pipefail
cd "$(dirname "$0")/.."
GT="npx -y @gltf-transform/cli@4.5.1"
OUT=src/rush/models
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
for pair in "prototypes/gecko-ranger:gecko-ranger" "dwarf-guardian:dwarf-guardian" "prototypes/polar-bear:polar-bear"; do
  src="public/defense/models/${pair%%:*}.glb"; name="${pair##*:}"
  # No textures, so UVs are unused: prune drops them with the other unused data.
  $GT prune "$src" "$TMP/$name-1.glb" --keep-attributes false
  $GT dedup "$TMP/$name-1.glb" "$TMP/$name-2.glb"
  $GT weld "$TMP/$name-2.glb" "$TMP/$name-3.glb"
  $GT meshopt "$TMP/$name-3.glb" "$OUT/$name.glb" --level high
  printf '%-16s %8d -> %8d bytes\n' "$name" "$(stat -c %s "$src")" "$(stat -c %s "$OUT/$name.glb")"
done
