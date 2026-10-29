export type HeroId = 'mage' | 'elf' | 'dwarf' | 'tao' | 'barbarian' | 'druid';
export type Difficulty = 'relaxed' | 'standard' | 'veteran';
export type Element = 'physical' | 'fire' | 'lightning' | 'impact' | 'water';
export type TowerKind = 'crossbow' | 'magic' | 'cannon';
export type Branch = 'pierce' | 'rapid' | 'fire' | 'lightning' | 'crush' | 'water';
export type EnemyKind = 'sprout' | 'wood' | 'ice' | 'stone' | 'metal' | 'insulator' | 'boss' | 'frostwolf' | 'frostboss';
export type Point = { x:number; y:number };
export type Slot = Point & { id:number; terrain:'plain'|'high'|'water'|'ice'; unlock:number };
export type Tower = { slot:number; kind:TowerKind; level:number; branch:Branch|null; cooldown:number; recoil?:number; aim?:Point };
export type Enemy = Point & { id:number; kind:EnemyKind; hp:number; maxHp:number; progress:number; path:number; speed:number; wet:number; burn:number; slow:number; hit:number; knockVelocity?:number; knockCooldown?:number; recoil?:number; facing?:-1|1 };
export type Effect = { id:number; from:Point; to:Point; element:Element; life:number; text?:string; kind?:'impact'|'coin'|'death'|'skill'|'shockwave'|'chain'|'freeze'|'interrupt'|'build'|'upgrade'|'dash'; age?:number; maxLife?:number; force?:number; targetSprite?:number; targetId?:number; sourceSlot?:number; targetKind?:EnemyKind; targetFacing?:-1|1 };
export type DefenseState = {
 stage:number; phase:'prep'|'wave'|'intermission'|'promotion'|'won'|'lost'; paused:boolean; speed:1|2;
 time:number; wave:number; coins:number; hp:number; outpostHp:number; kills:number; leaks:number;
 difficulty:Difficulty; heroVelocity:Point; dashCooldown:number; dashTime:number;
 enemies:Enemy[]; towers:Tower[]; effects:Effect[]; attacks:CombatAttack[]; projectiles:Projectile[]; hero:HeroId; heroPosition:Point; heroTarget:Point; heroFacing:-1|1; mercenaryPosition:Point; mercenaryFacing:-1|1; pet:PetState|null; heroCooldown:number;
 mercenary:HeroId|null; mercCooldown:number; petCooldown:number; skillCooldown:number; bossCharge:number; freeze:number; bossCycle:number; promotion:'power'|'control'|null;
 spawned:number; spawnTimer:number; nextId:number; training:number; notice:string; questProgress:number;
};
export type DefenseAction =
 |{type:'start-wave'}|{type:'build';slot:number;kind:TowerKind}|{type:'upgrade';slot:number;branch?:Branch}
 |{type:'sell';slot:number}|{type:'hire';hero:HeroId}|{type:'skill'}|{type:'move';point:Point}
 |{type:'dash';point:Point}
 |{type:'promote';choice:'power'|'control'}|{type:'pause'}|{type:'resume'}|{type:'speed'};
export type Campaign = {version:1;gold:number;cleared:number[];questClaimed:number[];visitors:HeroId[];seenVisitors:HeroId[];training:number;selectedHero:HeroId;processedRuns:string[];difficulty:Difficulty};

export type StageDef = {id:number;region:'forest'|'snow';label:string;chapter:1|2;order:number;expanded:boolean;climate:'clear'|'rain'|'snow'|'blizzard';name:string;weather:string;story:string;quest:string;questReward:number;visitor:HeroId|null;questType:'village'|'outpost'|'hunt';questGoal:number};

export type AttackSource = 'hero' | 'mercenary' | 'pet' | 'tower';
export type AttackActor = HeroId | 'wolf' | TowerKind;
export type DamageProfile = { damage:number; element:Element; area:number; force:number; chain:boolean; pierce:boolean; splashLimit:number; splashDamage:number };
export type CombatAttack = DamageProfile & { id:number; source:AttackSource; sourceSlot?:number; actor:AttackActor; kind:'melee'|'shot'|'spell'|'slam'; from:Point; to:Point; targetId:number; range:number; elapsed:number; duration:number; hitAt:number; fired:boolean };
export type Projectile = DamageProfile & { id:number; source:AttackSource; sourceSlot?:number; actor:AttackActor; kind:'arrow'|'bolt'|'shell'; from:Point; to:Point; position:Point; previous:Point; velocity:Point; targetId:number|null; elapsed:number; duration:number; progress:number; arcHeight:number; height:number; radius:number; speed:number; hitIds:number[]; remainingHits:number };
export type PetState = { position:Point; target:Point; facing:-1|1 };
