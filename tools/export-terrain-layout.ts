import { writeFileSync } from 'node:fs';
import { getPaths, getSlots, getStage } from '../src/games/defense/data.ts';

// Bake from the same logical coordinates used by combat and pointer input.
const variants = [1,4,5,8].map(stage => ({
  id: `${getStage(stage).region}-${getStage(stage).expanded?'expanded':'single'}`,
  stage, paths: getPaths(stage).slice(0,getStage(stage).expanded?2:1),
  highSlots: getSlots(stage).filter(slot=>slot.unlock<=stage&&slot.terrain==='high'),
}));
writeFileSync(new URL('../art-source/defense/terrain-layout.json',import.meta.url), JSON.stringify({width:900,height:600,variants},null,2)+'\n');
