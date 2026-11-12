#!/usr/bin/env bash
# Builds ./exp-copy: a throwaway copy of origin/main whose engine reads two optional
# measurement hooks: __JOIN (mid-path spawn), __ICY (extra ice segment), __RANGE (tower range delta), __SPEED (enemy speed factor).
# Run from this folder; never apply this patch to the game source.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf exp-copy && mkdir exp-copy
git -C "$(git rev-parse --show-toplevel)" archive origin/main src | tar -x -C exp-copy
python3 - <<'PY'
p='exp-copy/src/games/defense/engine.ts'; s=open(p).read()
a="s.enemies.push({id:s.nextId++,kind,hp,maxHp:hp,progress:0,path,speed:base.speed*settings.enemySpeed,...positionOnPath(path,0,s.stage),"
b="const join=(globalThis as any).__JOIN?.(s.stage,s.spawned,kind,path)||0;s.enemies.push({id:s.nextId++,kind,hp,maxHp:hp,progress:join,path,speed:base.speed*settings.enemySpeed,...positionOnPath(path,join,s.stage),"
c="const water=stage.region==='forest'&&e.x>650&&e.x<735,icy=stage.region==='snow'&&e.x>=300&&e.x<=520;"
d="const icyX=(globalThis as any).__ICY?.(s.stage,e)||false;const water=stage.region==='forest'&&e.x>650&&e.x<735,icy=(stage.region==='snow'&&e.x>=300&&e.x<=520)||icyX;"
e="export const towerRange = (tower:Tower,stage=1) => ("
f="export const towerRange = (tower:Tower,stage=1) => ((globalThis as any).__RANGE?.(stage,getSlots(stage)[tower.slot])||0) + ("
g="const forward=e.speed*delta*"
h="const forward=((globalThis as any).__SPEED?.(s.stage,e)??1)*e.speed*delta*"
assert a in s and c in s and e in s and g in s
open(p,'w').write(s.replace(a,b).replace(c,d).replace(e,f).replace(g,h))
PY
echo "exp-copy ready: node --experimental-strip-types map-experiment.ts"
