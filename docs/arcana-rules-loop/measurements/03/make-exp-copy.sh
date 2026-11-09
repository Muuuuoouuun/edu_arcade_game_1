#!/usr/bin/env bash
# Cycle 03: throwaway copy of origin/main with optional measurement hooks. Never apply to game source.
#   __DMG(s,e,element)  -> damage factor for one hit (default 1)
#   __SPEED(stage,e,s)  -> enemy speed factor (default 1)
#   __BREACH(s,e)       -> {hp,coins} cost of one breach (default: engine rule)
#   __SKILL(s)          -> enemies the ultimate hits (default: every enemy on the field)
set -euo pipefail
cd "$(dirname "$0")"
rm -rf exp-copy && mkdir exp-copy
git -C "$(git rev-parse --show-toplevel)" archive origin/main src | tar -x -C exp-copy
python3 - <<'PY'
p='exp-copy/src/games/defense/engine.ts'; s=open(p).read()
pairs=[
 ("e.hp-=amount*multiplier;","e.hp-=amount*multiplier*((globalThis as any).__DMG?.(s,e,element)??1);"),
 ("const forward=e.speed*delta*","const forward=((globalThis as any).__SPEED?.(s.stage,e,s)??1)*e.speed*delta*"),
 ("const loss=e.kind==='boss'||e.kind==='frostboss'?8:1;","const custom=(globalThis as any).__BREACH?.(s,e);const loss=custom?custom.hp:(e.kind==='boss'||e.kind==='frostboss'?8:1);if(custom?.coins)s.coins=Math.max(0,s.coins-custom.coins);"),
 ("    for(const e of s.enemies) {\n      hit(s,e,skillPower*boost,","    for(const e of ((globalThis as any).__SKILL?(globalThis as any).__SKILL(s):s.enemies)) {\n      hit(s,e,skillPower*boost,"),
]
for a,b in pairs:
    assert s.count(a)==1,a
    s=s.replace(a,b)
open(p,'w').write(s)
PY
echo "exp-copy ready"
