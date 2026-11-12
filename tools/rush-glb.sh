#!/usr/bin/env bash
# Rush-only compressed hero models (decision 2026-11-11, measured in cycle 31).
# Shared textured production copies are generated first with npm run models:characters, which copies the raw delivery
# over src/rush/models/; run this script again after it. Original studies stay untouched.
# Usage: bash tools/rush-glb.sh        (needs network once for npx; package.json is not touched)
set -euo pipefail
cd "$(dirname "$0")/.."
GT="npx -y @gltf-transform/cli@4.5.1"
OUT=src/rush/models
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
for pair in "characters-v2/gecko-ranger:gecko-ranger" "characters-v2/dwarf-guardian:dwarf-guardian" "characters-v2/polar-bear:polar-bear"; do
  src="public/defense/models/${pair%%:*}.glb"; name="${pair##*:}"
  # Preserve atlas UVs, material maps and named animation pivots. Stage 1 (cycle 81): no meshopt yet, since the shared
  # delivery contract (heroAssets.test.ts) reads raw UV arrays; --vertex-layout separate keeps one buffer view per
  # attribute (the default interleaves, and three's InterleavedBufferAttribute.array is then the whole buffer, cycle 76).
  L="--vertex-layout separate"
  $GT prune "$src" "$TMP/$name-1.glb" --keep-attributes true $L
  $GT dedup "$TMP/$name-1.glb" "$TMP/$name-2.glb" $L
  $GT weld "$TMP/$name-2.glb" "$TMP/$name-3.glb" $L
  $GT webp "$TMP/$name-3.glb" "$OUT/$name.glb" $L
  printf '%-16s %8d -> %8d bytes\n' "$name" "$(stat -c %s "$src")" "$(stat -c %s "$OUT/$name.glb")"
done
# Rush forest town (cycle 66): the Blender output stays the source (its tests, tools/check-rush-town.mjs and the model
# lab read it); the game loads this web copy (src/rush/townModel.ts).
src=src/rush/models/forest-town.glb; name=forest-town.web
$GT prune "$src" "$TMP/$name-1.glb" --keep-attributes true
$GT dedup "$TMP/$name-1.glb" "$TMP/$name-2.glb"
$GT weld "$TMP/$name-2.glb" "$TMP/$name-3.glb"
$GT meshopt "$TMP/$name-3.glb" "$OUT/$name.glb" --level high
printf '%-16s %8d -> %8d bytes\n' "$name" "$(stat -c %s "$src")" "$(stat -c %s "$OUT/$name.glb")"
