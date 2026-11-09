import { memo } from 'react';
import { monsterSpriteAsset, spriteAsset } from '../games/defense/art';
import type { CombatAttack, Effect, Element, Point, Projectile } from '../games/defense/types';

export const FX_COLORS: Record<Element, string> = { physical:'#fff0be', fire:'#ff9d38', lightning:'#90eaff', impact:'#ecc58b', water:'#7edcff' };
const clamp = (v:number) => Math.max(0,Math.min(1,v));
const noise = (n:number) => { const x=Math.sin(n*127.1)*43758.5453; return x-Math.floor(x); };
const effectKind = (effect:Effect) => effect.kind??(effect.text?.startsWith('+')?'coin':'impact');

/** Dynamic FX use simulation ages, never wall-clock CSS animation. */
export const DefenseFxDefs = memo(function DefenseFxDefs(){return <defs>
  <radialGradient id="def-ground-shadow"><stop stopColor="#142b29" stopOpacity=".4"/><stop offset=".52" stopColor="#20372e" stopOpacity=".25"/><stop offset="1" stopColor="#20372e" stopOpacity="0"/></radialGradient>
  <radialGradient id="def-fire-core"><stop stopColor="#fffce8"/><stop offset=".3" stopColor="#ffe996"/><stop offset=".65" stopColor="#ff9b35"/><stop offset="1" stopColor="#f16a1a" stopOpacity="0"/></radialGradient>
  <radialGradient id="def-blue-core"><stop stopColor="#fff"/><stop offset=".4" stopColor="#b3f6ff"/><stop offset="1" stopColor="#61bbf4" stopOpacity="0"/></radialGradient>
  <radialGradient id="def-green-core"><stop stopColor="#f4ffc7"/><stop offset=".45" stopColor="#b3ee82"/><stop offset="1" stopColor="#4da57a" stopOpacity="0"/></radialGradient>
  <radialGradient id="def-impact-core"><stop stopColor="#fffbdf" stopOpacity=".95"/><stop offset=".55" stopColor="#f8c87d" stopOpacity=".5"/><stop offset="1" stopColor="#e5ad60" stopOpacity="0"/></radialGradient>
  <linearGradient id="def-flame-tail"><stop stopColor="#f46a16" stopOpacity="0"/><stop offset=".6" stopColor="#ffb336" stopOpacity=".8"/><stop offset="1" stopColor="#fff0b1"/></linearGradient>
  <linearGradient id="def-water-tail"><stop stopColor="#6db8e7" stopOpacity="0"/><stop offset="1" stopColor="#aaf3ff" stopOpacity=".85"/></linearGradient>
  <linearGradient id="def-magic-tail"><stop stopColor="#a0df6d" stopOpacity="0"/><stop offset="1" stopColor="#e4ffb8"/></linearGradient>
</defs>});

export function DashTrail({effect,position,remaining,reduced}:{effect?:Effect;position:Point;remaining:number;reduced:boolean}){
 if(!effect)return null;
 const age=effect.age??0,life=effect.maxLife??.35,fade=clamp((life-age)/Math.max(.001,life));
 const dx=effect.to.x-effect.from.x,dy=effect.to.y-effect.from.y,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length;
 // A wave can end mid-dash: render only the distance actually travelled, never the future target.
 const travelled=Math.max(0,Math.min(length,(position.x-effect.from.x)*ux+(position.y-effect.from.y)*uy));
 const head={x:effect.from.x+ux*travelled,y:effect.from.y+uy*travelled},travel=Math.min(110,travelled);
 const tail={x:head.x-ux*travel,y:head.y-uy*travel},angle=Math.atan2(dy,dx)*180/Math.PI;
 return <g className="def-dash-trail" pointerEvents="none" aria-hidden="true" data-effect="dash" data-moving={remaining>0} opacity={Math.min(1,fade*2.2)}>
  {!reduced&&travel>2?<>
   <path d={`M${tail.x} ${tail.y}L${head.x} ${head.y}`} stroke="#a5e3ce" strokeWidth="10" strokeLinecap="round" opacity=".16"/>
   <path d={`M${tail.x} ${tail.y}L${head.x} ${head.y}`} stroke="#eaffd0" strokeWidth="2.4" strokeLinecap="round" opacity=".55"/>
   <g transform={`translate(${head.x},${head.y-22}) rotate(${angle})`} fill="none" stroke="#f0ffdf" strokeLinecap="round"><path d={`M${-Math.min(72,travel)}-8H-17M${-Math.min(52,travel)} 8H-10`} strokeWidth="1.7" opacity=".7"/></g>
  </>:null}
  <ellipse cx={effect.to.x} cy={effect.to.y} rx="19" ry="8" fill="#e8ffc817" stroke="#eaffbe" strokeWidth="1.8"/>
  <path d="m-6-4 6 4-6 4m7-8 6 4-6 4" transform={`translate(${effect.to.x},${effect.to.y}) rotate(${angle})`} fill="none" stroke="#f5ffd9" strokeWidth="1.5" strokeLinecap="round"/>
 </g>;
}

export function ProjectileLayer({projectiles,reduced}:{projectiles:Projectile[];reduced:boolean}) {
  return <g className="def-projectiles" aria-hidden="true" pointerEvents="none">{projectiles.map((p,index)=>{
    const detail=!reduced&&index>=projectiles.length-24;
    const x=p.position.x,y=p.position.y-27-p.height;
    const heightSpeed=p.arcHeight?4*p.arcHeight*(1-2*p.progress)/Math.max(.1,p.duration):0;
    const angle=Math.atan2(p.velocity.y-heightSpeed,p.velocity.x)*180/Math.PI;
    const water=p.element==='water',lightning=p.element==='lightning',green=p.actor==='druid';
    return <g key={p.id} data-projectile={p.kind} data-element={p.element} data-progress={p.progress.toFixed(3)}>
      {p.kind==='shell'?<ellipse cx={p.position.x} cy={p.position.y-1} rx={Math.max(3,9-p.height*.025)} ry="3.3" fill="#142e39" opacity={Math.max(.12,.35-p.height*.002)}/>:null}
      <g transform={`translate(${x},${y}) rotate(${angle})`}>
        {p.kind==='arrow'?<>
          {detail?<path d="M-34 0H-10" stroke="#fff2c2" strokeWidth="3" strokeLinecap="round" opacity=".32"/>:null}
          <path d="M-16 0H9" stroke="#473f31" strokeWidth="3.5" strokeLinecap="round"/><path d="M-16 -.5H9" stroke="#ebd39a" strokeWidth="1.6"/>
          <path d="m7-4 9 4-9 4 2-4Z" fill="#faf7db" stroke="#91875d" strokeWidth=".8"/><path d="m-14 0-7-5 1 5-1 5Z" fill="#c5e3b0" stroke="#648773" strokeWidth=".8"/>
        </>:p.kind==='shell'?<>
          {detail?<><circle cx="-14" cy="2" r="5" fill={water?'#99dff3':'#e1c99e'} opacity=".25"/><circle cx="-25" cy="5" r="3" fill={water?'#99dff3':'#e1c99e'} opacity=".12"/></>:null}
          <circle r={water?9:8} fill={water?'#5ca8c4':'#33494c'} stroke={water?'#c6f8ff':'#1f2f30'} strokeWidth="1.8"/><path d="M-4-4Q1-8 5-3" fill="none" stroke={water?'#eaffff':'#b6cbbe'} strokeWidth="2" strokeLinecap="round"/>
          {water?<path d="M-5 2Q0-1 5 2" fill="none" stroke="#b1edff" strokeWidth="1.2"/>:<><path d="M-7-3-11-7" stroke="#c8a45e" strokeWidth="1.6"/><circle cx="-12" cy="-8" r="2.5" fill="#ffdb82"/></>}
        </>:lightning?<>
          <circle r="18" fill="url(#def-blue-core)" opacity=".8"/>
          {detail?<path d="M-40 1-29-5-23 4-15-5-8 1" fill="none" stroke="#82dcf6" strokeWidth="3" strokeLinecap="round" opacity=".65"/>:null}
          <path d="m-12-6 12 2-4-7 16 13-13-1 4 8Z" fill="#ecfcff" stroke="#8edff2" strokeWidth="1.3"/>
        </>:<>
          {detail?<path d="M-43 0Q-20-14 3-7L9 0 3 7Q-20 14-43 0Z" fill={`url(#${water?'def-water-tail':green?'def-magic-tail':'def-flame-tail'})`}/>:null}
          <circle r="17" fill={`url(#${water?'def-blue-core':green?'def-green-core':'def-fire-core'})`}/><ellipse rx="7" ry="6" fill={water?'#dffaff':green?'#d7ffae':'#fff6bf'}/>
          {detail?<><circle cx="-22" cy="-6" r="2.5" fill={water?'#acf0ff':green?'#b1e89d':'#ffce67'} opacity=".65"/><circle cx="-33" cy="5" r="1.8" fill={water?'#acf0ff':green?'#b1e89d':'#ffce67'} opacity=".35"/></>:null}
        </>}
      </g>
    </g>;
  })}</g>;
}

/** A short readable motion arc follows a real attack's contact interval. */
export function AttackTrails({attacks,reduced}:{attacks:CombatAttack[];reduced:boolean}) {
 return <g className="def-attack-trails" aria-hidden="true" pointerEvents="none">{attacks.filter(a=>a.kind==='melee'||a.kind==='slam').map(a=>{
  const contact=a.elapsed-a.hitAt;if(contact<-.08||contact>.22)return null;
  const direction=Math.atan2(a.to.y-a.from.y,a.to.x-a.from.x)*180/Math.PI;
  const progress=clamp((contact+.08)/.3),opacity=(1-progress)*.85;
  return <g key={a.id} transform={`translate(${a.from.x},${a.from.y-22}) rotate(${direction})`} opacity={opacity} data-attack-trail={a.actor}>
    {a.actor==='wolf'?<><path d="M26-22Q55-10 69 8M31-28Q62-14 75 4M36-33Q66-20 80-1" stroke="#eafee0" strokeWidth="3" fill="none" strokeLinecap="round"/></>:<>
      <path d={reduced?'M24-28Q60-8 72 22':'M16-43Q72-45 85 18Q62-12 16-43Z'} fill={reduced?'none':'#ffefb266'} stroke="#fff5d6" strokeWidth="3" strokeLinecap="round"/>
      {!reduced?<path d="M12-51Q80-44 91 22" fill="none" stroke="#f8c96f" strokeWidth="2" opacity=".6"/>:null}
    </>}
  </g>;
 })}</g>;
}

function Sparks({effect,reduced,count=5}:{effect:Effect;reduced:boolean;count?:number}){
 if(reduced||count===0)return null;
 const age=effect.age??0,life=effect.maxLife??.5,p=clamp(age/life),color=FX_COLORS[effect.element];
 return <g opacity={1-p}>{Array.from({length:count},(_,i)=>{
  const angle=noise(effect.id+i*7)*Math.PI*2,velocity=35+noise(effect.id+i*13)*60;
  const x=Math.cos(angle)*velocity*age,y=Math.sin(angle)*velocity*age+75*age*age;
  const radius=1.7+noise(i+effect.id)*2;
  return effect.element==='impact'?<path key={i} d="M-3-3 3-2 4 2-2 4Z" transform={`translate(${x},${y}) rotate(${age*(i%2?180:-130)})`} fill={i%2?'#e7d0a1':'#958470'} stroke="#655646" strokeWidth=".6"/>:<path key={i} d={`M${x} ${y}l${Math.cos(angle)*radius*2} ${Math.sin(angle)*radius*2}`} stroke={color} strokeWidth={radius} strokeLinecap="round"/>;
 })}</g>;
}
const Lightning=memo(function Lightning({effect}:{effect:Effect}){
 const dx=effect.to.x-effect.from.x,dy=effect.to.y-effect.from.y;
 const distance=Math.max(1,Math.hypot(dx,dy));
 const nodes=Array.from({length:7},(_,i)=>{
  const p=i/6,offset=i===0||i===6?0:(noise(effect.id+i*13)-.5)*24;
  return `${effect.from.x+dx*p-dy/distance*offset},${effect.from.y-29+dy*p+dx/distance*offset}`;
 }).join(' ');
 return <><polyline points={nodes} fill="none" stroke="#6ed5ef" strokeWidth="7" opacity=".4" strokeLinejoin="round"/><polyline points={nodes} fill="none" stroke="#d8fbff" strokeWidth="2.6" strokeLinejoin="round"/></>;
},(before,after)=>before.effect.id===after.effect.id&&before.effect.from.x===after.effect.from.x&&before.effect.from.y===after.effect.from.y&&before.effect.to.x===after.effect.to.x&&before.effect.to.y===after.effect.to.y);
export function EffectLayer({effects,reduced,layer='front'}:{effects:Effect[];reduced:boolean;layer?:'ground'|'front'}){
 // Keep every damage number, hit core, coin and death; cap only decorative fragments.
 const sparkCounts=new Map<number,number>();
 if(!reduced&&layer==='front'){
  let remaining=64;
  for(let i=effects.length-1;i>=0&&remaining>0;i--){const kind=effectKind(effects[i]),wanted=kind==='death'?6:kind==='shockwave'?8:kind==='impact'?4:0;if(wanted){const count=Math.min(wanted,remaining);sparkCounts.set(effects[i].id,count);remaining-=count;}}
 }
 return <g className={`def-effects def-effects-${layer}`} aria-hidden="true" pointerEvents="none">{effects.map((e,index)=>{
  const life=e.maxLife??(e.text?.startsWith('+') ? .8 : .45),age=e.age??Math.max(0,life-e.life),p=clamp(age/life);
  const fade=Math.min(1,(1-p)*2.3),color=FX_COLORS[e.element];
  const kind=effectKind(e),detail=!reduced&&index>=effects.length-20,sparks=sparkCounts.get(e.id)??0;
  if(kind==='dash')return null;
  if(layer==='ground'){
   if(kind==='build'||kind==='upgrade')return <g key={e.id} transform={`translate(${e.to.x},${e.to.y+9})`} opacity={fade} data-effect-ground={kind}>
    <ellipse rx={30+(reduced?0:p*24)} ry={11+(reduced?0:p*9)} fill="none" stroke={kind==='build'?'#e8d9af':color} strokeWidth={kind==='build'?2:2.5}/>
    {!reduced&&kind==='build'?[-1,1].map(side=><path key={side} d="M-8 0Q0-5 8 0" transform={`translate(${side*(23+p*18)},${p*6})`} fill="none" stroke="#e1d4b6" strokeWidth={3*(1-p)} opacity=".5"/>):null}
   </g>;
   if(!['shockwave','skill','impact','freeze','interrupt'].includes(kind)||(kind==='impact'&&!detail))return null;
   const wide=kind==='skill'||kind==='shockwave'||kind==='interrupt';
   const radius=wide?35+p*(e.force?Math.min(145,e.force):100):12+p*30;
   return <g key={e.id} transform={`translate(${e.to.x},${e.to.y})`} opacity={fade*(wide?.75:.4)} data-effect-ground={kind}>
    <ellipse rx={reduced?radius*.65:radius} ry={radius*.38} fill="none" stroke={color} strokeWidth={wide?3:1.5}/>
    {wide&&!reduced?<><ellipse rx={radius*.72} ry={radius*.28} fill="none" stroke={color} strokeWidth="1" opacity=".7"/><path d={`M${-radius} 0h${radius*2}M0 ${-radius*.38}v${radius*.76}`} stroke={color} strokeWidth="1" opacity=".35"/></>:null}
   </g>;
  }
  if(kind==='build'||kind==='upgrade')return <g key={e.id} transform={`translate(${e.to.x},${e.to.y})`} opacity={fade} data-effect={kind}>
   {kind==='upgrade'?<>
    <g transform={`translate(0,${-67-(reduced?0:p*24)})`} stroke={color} strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m-8 0 8-7 8 7M-8-7l8-7 8 7"/></g>
    {!reduced?[-1,1].map(side=><g key={side} opacity={(1-p)*.7}><path d={`M${side*28} ${-15-p*30}v-15`} stroke={color} strokeWidth="1.8"/><path d={`M${side*36} ${-5-p*45}v-7`} stroke={color} strokeWidth="1.3"/></g>):null}
   </>:!reduced?<g opacity={(1-p)*.4}>{[-1,1].map(side=><ellipse key={side} cx={side*(24+p*22)} cy={5-p*4} rx={5+p*7} ry={3+p*3} fill="#dfd4b7"/>)}</g>:null}
  </g>;
  if(kind==='chain')return <g key={e.id} opacity={fade} data-effect="chain"><Lightning effect={e}/><circle cx={e.to.x} cy={e.to.y-25} r={12+p*12} fill="url(#def-blue-core)"/></g>;
  if(kind==='death'){
   const kind=e.targetKind??(e.targetSprite===20?'frostboss':e.targetSprite===14?'boss':undefined);
   const deathArt=kind?monsterSpriteAsset(kind,'death'):null;
   const art=deathArt??(typeof e.targetSprite==='number'?spriteAsset(e.targetSprite):null);
   const boss=kind==='boss'||kind==='frostboss';
   const fall=reduced?0:p*(deathArt?3:10),scale=reduced?1:1-p*(boss?.08:.24),bodySize=e.targetSprite===20?135:e.targetSprite===14?115:e.targetSprite===8?54:e.targetSprite===19?73:68,size=bodySize*(art?.displayScale??1);
   const [,,frameWidth,frameHeight]=art?.viewBox.split(' ').map(Number)??[0,0,1,1];
   const width=size*Math.min(1,frameWidth/frameHeight),height=size*Math.min(1,frameHeight/frameWidth);
   return <g key={e.id} transform={`translate(${e.to.x},${e.to.y})`} data-effect="death">
    {art?<g opacity={Math.min(1,(1-p)*(boss?1.6:.85))} transform={`translate(0,${fall}) rotate(${reduced||deathArt?0:(noise(e.id)>.5?1:-1)*p*13}) scale(${scale*(e.targetFacing===-1?-1:1)},${scale})`}><svg x={-width/2} y={bodySize*.1-height} width={width} height={height} viewBox={art.viewBox} preserveAspectRatio="xMidYMax meet" overflow="hidden"><image href={art.src} width={art.width} height={art.height}/></svg></g>:null}
    {sparks>0?<g transform="translate(0,-20)"><Sparks effect={e} reduced={reduced} count={sparks}/></g>:null}
   </g>;
  }
  if(kind==='coin')return <g key={e.id} transform={`translate(${e.to.x},${e.to.y-35-(reduced?0:p*37)})`} opacity={fade} data-effect="coin">
    <g transform={`translate(-15,${reduced?0:-Math.sin(p*Math.PI)*8})`}><ellipse rx={reduced?5:Math.max(1,Math.abs(Math.cos(p*Math.PI*2))*5)} ry="6" fill="#ffdc76" stroke="#a4742d" strokeWidth="1.2"/><path d="M0-3v6" stroke="#fff5bc" strokeWidth="1.2"/></g>
    <text x="-6" y="5" className="def-float-number def-float-coin">{e.text}</text>
  </g>;
  if(kind==='skill'||kind==='interrupt')return <g key={e.id} transform={`translate(${e.to.x},${e.to.y-27})`} opacity={fade} data-effect={kind}>
   <circle r={reduced?22:15+p*65} fill={`url(#${e.element==='fire'?'def-fire-core':e.element==='water'||e.element==='lightning'?'def-blue-core':'def-impact-core'})`} opacity=".7"/>
   {!reduced?Array.from({length:6},(_,i)=>{const angle=i*Math.PI/3,r=18+p*50;return <path key={i} d={`M${Math.cos(angle)*r} ${Math.sin(angle)*r}l${Math.cos(angle)*13} ${Math.sin(angle)*13}`} stroke={color} strokeWidth="2" strokeLinecap="round"/>;}):null}
   {e.text?<text y={-45-(reduced?0:p*15)} textAnchor="middle" className="def-float-number def-float-skill">{e.text}</text>:null}
  </g>;
  if(kind==='freeze')return <g key={e.id} transform={`translate(${e.to.x},${e.to.y-35})`} opacity={fade} data-effect="freeze"><path d="M0-25v50M-22-13l44 26M-22 13l44-26M-6-18l6 5 6-5M-6 18l6-5 6 5" fill="none" stroke="#dafbff" strokeWidth="2" strokeLinecap="round"/>{e.text?<text y="-35" textAnchor="middle" className="def-float-number">{e.text}</text>:null}</g>;
  return <g key={e.id} transform={`translate(${e.to.x},${e.to.y-27})`} opacity={fade} data-effect={kind}>
   {e.element==='lightning'?<g transform={`translate(${-e.to.x},${-e.to.y+27})`}><Lightning effect={e}/></g>:null}
   <circle r={reduced?8:9+p*(kind==='shockwave'?38:21)} fill={`url(#${e.element==='fire'?'def-fire-core':e.element==='water'||e.element==='lightning'?'def-blue-core':'def-impact-core'})`} opacity={kind==='shockwave'?.8:.65}/>
   {detail&&e.element==='physical'?<path d="m-12-12 24 24m0-24-24 24" stroke="#fff8df" strokeWidth="2" strokeLinecap="round" opacity={Math.max(0,1-p*2)}/>:null}
   <Sparks effect={{...e,age,maxLife:life}} reduced={reduced} count={sparks}/>
   {e.text?<text x={Math.max(44,Math.min(856,e.to.x))-e.to.x} y={-29-(reduced?0:p*27)} textAnchor="middle" className={`def-float-number ${e.text.includes('약점')?'def-float-weak':''}`}>{e.text}</text>:null}
  </g>;
 })}</g>;
}
