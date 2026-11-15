import type { AttackSource, CombatAttack, DefenseState, Point } from './types.ts';

/** Times in seconds from the authored clip. `contact` is measured on the clip,
 * not the engine's hitAt and not the time a projectile deals damage. */
export type AttackClipTiming = { duration: number; contact: number };
export type AttackOwner = { source: Exclude<AttackSource, 'tower'> } | { source: 'tower'; slot: number };
export type AttackAnimationSample = {
 attackId: number;
 actor: CombatAttack['actor'];
 phase: 'windup' | 'recovery';
 clipTime: number;
 targetId: number;
 /** Engine snapshot. For towers, current `tower.aim` also records retargets. */
 target: Point;
};

/** Map the authored contact pose to the engine's launch/hit instant. The two
 * halves are scaled independently; no wall clock is read and no combat event
 * is emitted. `null` means idle or an uncalibrated/invalid clip, never a hit.
 * Distinct ids allow a renderer to reset/crossfade when attacks overlap. */
export function sampleAttackAnimation(state: Pick<DefenseState, 'attacks' | 'towers'>, owner: AttackOwner, clip: AttackClipTiming): AttackAnimationSample | null {
 if(!Number.isFinite(clip.duration)||!Number.isFinite(clip.contact)||clip.duration<=0||clip.contact<=0||clip.contact>=clip.duration)return null;
 let attack:CombatAttack|undefined;
 for(const candidate of state.attacks){
  if(candidate.source!==owner.source||(owner.source==='tower'&&candidate.sourceSlot!==owner.slot))continue;
  if(!attack||candidate.id>attack.id)attack=candidate;
 }
 if(!attack||![attack.elapsed,attack.hitAt,attack.duration].every(Number.isFinite)||attack.elapsed<0||attack.hitAt<=0||attack.duration<=attack.hitAt)return null;
 const elapsed=Math.min(attack.elapsed,attack.duration);
 const clipTime=elapsed<=attack.hitAt
  ?clip.contact*elapsed/attack.hitAt
  :clip.contact+(clip.duration-clip.contact)*(elapsed-attack.hitAt)/(attack.duration-attack.hitAt);
 const tower=owner.source==='tower'?state.towers.find(t=>t.slot===owner.slot):undefined;
 const target=tower?.aim??attack.to;
 return {attackId:attack.id,actor:attack.actor,phase:attack.fired?'recovery':'windup',clipTime,targetId:attack.targetId,target:{...target}};
}
