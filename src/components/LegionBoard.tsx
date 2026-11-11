import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { spriteAsset } from '../games/defense/art';
import type { SpriteAsset } from '../games/defense/art';
import { DEPLOY, LANES, UNIT_DEFS, WORLD } from '../games/legion/data';
import { deploymentIssue } from '../games/legion/engine';
import { legionWolfAsset, LEGION_WOLF_SIZE, WOLF_BASE, WOLF_ILLUSTRATION, WOLF_WALK } from '../games/legion/wolfMotion';
import { legionShieldAsset, LEGION_SHIELD_ATLAS } from '../games/legion/shieldMotion';
import type { LegionEffect, LegionState, Monster, MonsterKind, Point, Soldier, UnitKind } from '../games/legion/types';
import '../legion-board.css';

type Props = { state:LegionState; selected:UnitKind|null; onPlace:(point:Point)=>void; onInspect?:(id:number)=>void; disabled:boolean; reducedMotion:boolean };
type Viewport = {width:number;height:number;scale:number;x:number;y:number};
const TAU=Math.PI*2;
const ENEMY_INDEX:Record<MonsterKind,number>={sprout:8,wood:9,stone:11,metal:12,frostwolf:19,boss:14};
const BAKED:Partial<Record<MonsterKind,{file:string;crop:[number,number,number,number];span:number}>>={
 wood:{file:'wood-soldier',crop:[0,8,384,364],span:360},stone:{file:'stone-golem',crop:[22,68,340,255],span:260},
 metal:{file:'metal-soldier',crop:[22,67,340,255],span:260},frostwolf:{file:'frost-wolf',crop:[6,68,360,242],span:315},
};
const imageCache=new Map<string,HTMLImageElement>();
const failedImages=new Set<string>();
const pendingImages=new Map<string,Promise<void>>();
function loadImage(src:string):Promise<void>{
 if(imageCache.has(src)||failedImages.has(src))return Promise.resolve();
 const pending=pendingImages.get(src);if(pending)return pending;
 const promise=new Promise<void>(resolve=>{const image=new Image();image.onload=()=>{imageCache.set(src,image);pendingImages.delete(src);resolve();};image.onerror=()=>{failedImages.add(src);pendingImages.delete(src);resolve();};image.src=src;});
 pendingImages.set(src,promise);return promise;
}
const TERRAIN_ART='/defense/legion/forest-arena.webp';
const sources=[TERRAIN_ART,'/defense/atlas.png','/defense/snow-atlas.png','/defense/boss-models.webp',WOLF_WALK,LEGION_SHIELD_ATLAS,...Object.values(BAKED).map(x=>`/defense/models/${x.file}-atlas.webp`)];
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
function noise(seed:number){const n=Math.sin(seed*127.1+311.7)*43758.5453;return n-Math.floor(n);}
function round(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke?:string){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function oval(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();}
function line(ctx:CanvasRenderingContext2D,points:readonly Point[],width:number,color:string){if(!points.length)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))ctx.lineTo(point.x,point.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
function polygon(ctx:CanvasRenderingContext2D,points:number[][],fill:string,stroke?:string){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function tree(ctx:CanvasRenderingContext2D,x:number,y:number,size:number){
 oval(ctx,x+6,y+7,size*.68,size*.29,'#183f3835');round(ctx,x-5,y-size*.25,10,size*.4,3,'#675039');
 oval(ctx,x,y-size*.53,size*.64,size*.53,'#316841');oval(ctx,x-size*.28,y-size*.65,size*.41,size*.35,'#4a8645');oval(ctx,x+size*.26,y-size*.66,size*.41,size*.36,'#5b9646');oval(ctx,x,y-size*.92,size*.42,size*.34,'#77aa4b');
}
function rock(ctx:CanvasRenderingContext2D,x:number,y:number,size:number){
 oval(ctx,x+3,y+4,size*.58,size*.25,'#254e3530');polygon(ctx,[[x-size*.5,y],[x-size*.42,y-size*.65],[x,y-size*.93],[x+size*.52,y-size*.56],[x+size*.48,y]],'#838b79');polygon(ctx,[[x-size*.42,y-size*.65],[x,y-size*.93],[x+size*.52,y-size*.56],[x+size*.04,y-size*.3]],'#b5bd9b');
}
function house(ctx:CanvasRenderingContext2D,x:number,y:number,size:number){
 oval(ctx,x+5,y+5,size*.7,size*.3,'#173d3930');round(ctx,x-size*.47,y-size*.45,size*.94,size*.62,4,'#a88e66');round(ctx,x-size*.42,y-size*.45,size*.84,size*.5,3,'#e2cb96');
 polygon(ctx,[[x-size*.65,y-size*.45],[x,y-size*.99],[x+size*.66,y-size*.45],[x,y-size*.2]],'#217e87','#14565f');polygon(ctx,[[x-size*.65,y-size*.45],[x,y-size*.99],[x,y-size*.2]],'#31999a');
 line(ctx,[{x:x-size*.65,y:y-size*.45},{x,y:y-size*.99},{x:x+size*.66,y:y-size*.45}],5,'#e6bd64');
 round(ctx,x-7,y-size*.18,14,size*.35,3,'#735744');round(ctx,x+size*.21,y-size*.22,12,12,3,'#ffd684');
}
function plaza(ctx:CanvasRenderingContext2D,x:number,y:number,r:number){
 oval(ctx,x,y+5,r+7,r*.65+5,'#6a775a42');oval(ctx,x,y,r,r*.65,'#adab84');oval(ctx,x,y,r-8,(r-8)*.65,'#d5c89b');ctx.strokeStyle='#aa9a70';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,r*.67,r*.42,0,0,TAU);ctx.stroke();
 for(let i=0;i<8;i++){const a=i*Math.PI/4;line(ctx,[{x:x+Math.cos(a)*r*.72,y:y+Math.sin(a)*r*.48},{x:x+Math.cos(a)*r*.97,y:y+Math.sin(a)*r*.63}],2,'#b1a17d');}
 polygon(ctx,[[x,y-r*.29],[x+9,y-8],[x+r*.39,y],[x+9,y+8],[x,y+r*.29],[x-9,y+8],[x-r*.39,y],[x-9,y-8]],'#dfbd60');
}
function castle(ctx:CanvasRenderingContext2D){
 // Gate is the engine's endpoint (1450,450), kept clear of decorative roofs.
 const x=1484,y=450;round(ctx,x-30,y-165,118,330,12,'#d7c99f');
 for(const sy of [-160,-115,-70,75,120,165]){round(ctx,x-45,y+sy,68,31,4,'#7c8d86');round(ctx,x-45,y+sy-7,68,25,4,'#c8ccb3');for(let j=0;j<3;j++)round(ctx,x-43+j*23,y+sy-17,16,18,2,'#e5e1c4');}
 round(ctx,x-54,y-42,84,94,6,'#5d6b62');round(ctx,x-48,y-45,74,84,4,'#d8ca98');round(ctx,x-38,y-22,54,71,14,'#ad7936','#e5c979');
 for(let i=0;i<5;i++)line(ctx,[{x:x-34+i*10,y:y-13},{x:x-34+i*10,y:y+44}],2,'#765b32');line(ctx,[{x:x-35,y:y+7},{x:x+10,y:y+7}],5,'#e4ba64');
 for(const offset of [-82,81]){round(ctx,x-64,y+offset-22,48,58,5,'#80968f');round(ctx,x-64,y+offset-27,48,50,5,'#d5dac1');polygon(ctx,[[x-70,y+offset-23],[x-39,y+offset-46],[x-9,y+offset-23],[x-39,y+offset-6]],'#247f87','#efc86f');round(ctx,x-52,y+offset+3,20,26,1,'#1d6975');polygon(ctx,[[x-45,y+offset+7],[x-43,y+offset+21],[x-41,y+offset+7],[x-34,y+offset+14],[x-49,y+offset+14]],'#edc76c');}
 house(ctx,1550,225,59);house(ctx,1554,332,45);house(ctx,1548,615,62);house(ctx,1551,734,47);
}
let terrainCache:HTMLCanvasElement|null=null;
function terrain():HTMLCanvasElement{
 if(terrainCache)return terrainCache;
 const canvas=document.createElement('canvas');canvas.width=WORLD.width;canvas.height=WORLD.height;const ctx=canvas.getContext('2d')!;
 const green=ctx.createLinearGradient(0,0,WORLD.width,WORLD.height);green.addColorStop(0,'#598e52');green.addColorStop(.5,'#87ae59');green.addColorStop(1,'#68954b');ctx.fillStyle=green;ctx.fillRect(0,0,WORLD.width,WORLD.height);
 for(let i=0;i<150;i++){const x=noise(i*4)*1600,y=noise(i*4+1)*900;oval(ctx,x,y,30+noise(i*4+2)*100,20+noise(i*4+3)*44,i%2?'#a8c66a24':'#376f4020');}
 const river=[{x:410,y:-30},{x:450,y:170},{x:420,y:350},{x:470,y:540},{x:435,y:730},{x:480,y:940}];line(ctx,river,112,'#537f64');line(ctx,river,94,'#58bdb3');line(ctx,river,66,'#319baf');line(ctx,river.map(p=>({x:p.x-20,y:p.y})),5,'#a3dfc780');
 for(let i=0;i<23;i++){const y=i*42+10,x=435+Math.sin(y*.007)*25;line(ctx,[{x:x-9,y},{x:x+13,y:y+2}],2,'#b6e8dd75');}
 for(const lane of LANES){line(ctx,lane,99,'#688b4d');line(ctx,lane,87,'#bfae79');line(ctx,lane,73,'#dcc38a');line(ctx,lane,51,'#e3cb962f');}
 plaza(ctx,790,450,89);plaza(ctx,775,140,65);plaza(ctx,800,772,65);
 for(const lane of LANES){for(let i=1;i<lane.length;i++){const a=lane[i-1],b=lane[i];if(a.x<=450&&b.x>=450){const t=(450-a.x)/(b.x-a.x),y=a.y+(b.y-a.y)*t,angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.translate(450,y);ctx.rotate(angle);round(ctx,-66,-44,132,88,6,'#77644b');for(let k=0;k<9;k++)round(ctx,-63+k*14,-41,12,81,1,k%2?'#b6a781':'#d1c3a2');round(ctx,-69,-48,138,9,3,'#eee0b6');round(ctx,-69,39,138,9,3,'#eee0b6');ctx.restore();break;}}}
 // Vegetation hugs borders and the gaps between approaches, never the deploy area.
 for(let i=0;i<110;i++){const x=20+noise(i+500)*1560,y=20+noise(i+900)*860;const edge=y<70||y>845||x<32;const gap=(x<390||x>520&&x<840)&&((y>295&&y<340)||(y>580&&y<625));if(edge||gap)tree(ctx,x,y,20+noise(i+700)*30);}
 for(let i=0;i<24;i++){const x=570+noise(i+60)*810,y=i%2?120+noise(i+80)*55:745+noise(i+80)*70;rock(ctx,x,y,12+noise(i+100)*15);}
 for(let i=0;i<70;i++){const x=noise(i+810)*1400,y=noise(i+960)*850;if(y<90||y>800){oval(ctx,x,y,3,2,i%3?'#edda8c':'#eee7b6');}}
 castle(ctx);
 for(let i=0;i<LANES.length;i++){const p=LANES[i][0];polygon(ctx,[[p.x-18,p.y-7],[p.x+5,p.y-7],[p.x+5,p.y-15],[p.x+25,p.y],[p.x+5,p.y+15],[p.x+5,p.y+7],[p.x-18,p.y+7]],'#dc825d','#ffdb9e');}
 terrainCache=canvas;return canvas;
}
function renderAsset(ctx:CanvasRenderingContext2D,asset:SpriteAsset,x:number,y:number,size:number,flip=false){
 const image=imageCache.get(asset.src);if(!image)return false;
 const [sx,sy,sw,sh]=asset.viewBox.split(' ').map(Number);const scale=size*(asset.displayScale??1)/Math.max(sw,sh),w=sw*scale,h=sh*scale;
 ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.drawImage(image,sx,sy,sw,sh,-w/2,asset.groundY===undefined?-h+size*.13:-(asset.groundY-sy)*scale,w,h);ctx.restore();return true;
}
function monsterAsset(e:Monster,reduced:boolean,size:number):SpriteAsset{
 if(e.kind==='frostwolf')return legionWolfAsset(e.progress,e.hit,size,reduced,imageCache.has(WOLF_BASE)&&imageCache.has(WOLF_WALK));
 const model=BAKED[e.kind];if(model){const frame=e.hit>0?2:Math.floor(e.progress/15)%2,[x,y,w,h]=model.crop;return {src:`/defense/models/${model.file}-atlas.webp`,viewBox:`${x+frame*384} ${y} ${w} ${h}`,width:1152,height:384,displayScale:Math.max(w,h)/model.span};}
 if(e.kind==='boss')return {src:'/defense/boss-models.webp',viewBox:e.hit>0?'933 111 393 334':'42 105 349 340',width:1774,height:887};
 return spriteAsset(ENEMY_INDEX[e.kind]);
}
function shieldSoldier(ctx:CanvasRenderingContext2D,x:number,y:number,hit:number,facing:number){
 ctx.save();ctx.translate(x,y);ctx.scale(facing===1?-1:1,1);ctx.lineWidth=1.5;
 round(ctx,-11,-20,9,22,3,'#45575a');round(ctx,3,-20,9,22,3,'#45575a');round(ctx,-14,-32,28,22,5,'#237a9d','#b8d8d0');
 oval(ctx,0,-39,12,11,hit>0?'#fff5d5':'#d6ddd0');round(ctx,-11,-42,23,9,2,'#445e61');round(ctx,-7,-39,14,2,1,'#e7ce7b');
 polygon(ctx,[[17,-30],[23,-51],[27,-29],[23,-14]],'#e6ece1','#97aeac');
 polygon(ctx,[[-19,-31],[-1,-28],[-1,-9],[-10,-1],[-22,-10]],hit>0?'#fff5d5':'#276c91','#e8c375');line(ctx,[{x:-11,y:-25},{x:-11,y:-9}],2,'#f2d782');ctx.restore();
}
function fallbackActor(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,friendly:boolean,color:string){oval(ctx,x,y-size*.3,size*.22,size*.34,color);oval(ctx,x,y-size*.67,size*.19,size*.18,friendly?'#e9d8b1':'#aac06c');}
function actor(ctx:CanvasRenderingContext2D,unit:Soldier|Monster,friendly:boolean,time:number,reduced:boolean,attacking:boolean,shieldAttackAge:number|null){
 const boss=!friendly&&unit.kind==='boss';const size=boss?84:unit.kind==='beast'?60:!friendly&&unit.kind==='frostwolf'?LEGION_WOLF_SIZE:unit.kind==='stone'?49:43;
 const moving=friendly?Math.hypot(unit.x-(unit as Soldier).home.x,unit.y-(unit as Soldier).home.y)>8:true;
 const shieldModel=friendly&&unit.kind==='shield'&&imageCache.has(LEGION_SHIELD_ATLAS);
 const gait=reduced||shieldModel||(!friendly&&unit.kind==='frostwolf')?0:Math.sin((friendly?time*9+unit.id:(unit as Monster).progress*.12))* (moving?1.5:.35);
 ctx.save();oval(ctx,unit.x+2,unit.y+3,size*.36,size*.13,'#1d3c3c38');
 ctx.beginPath();ctx.ellipse(unit.x,unit.y,size*.29,size*.14,0,0,TAU);ctx.strokeStyle=friendly?'#79eee4':'#ef9378';ctx.lineWidth=friendly?2.2:1.5;ctx.stroke();
 if(friendly&&unit.kind==='shield'){
  const asset=legionShieldAsset(shieldAttackAge,reduced);ctx.save();if(unit.hit>0&&!reduced)ctx.filter='brightness(1.5)';
  const drawn=shieldModel&&renderAsset(ctx,asset,unit.x,unit.y,size,unit.facing===-1);ctx.restore();
  if(!drawn)shieldSoldier(ctx,unit.x,unit.y+gait,unit.hit,unit.facing);
 }
 else{const asset=friendly?spriteAsset(UNIT_DEFS[unit.kind as UnitKind].sprite):monsterAsset(unit as Monster,reduced,size);const fallback=!friendly&&unit.kind==='frostwolf'?WOLF_ILLUSTRATION:spriteAsset(friendly?UNIT_DEFS[unit.kind as UnitKind].sprite:ENEMY_INDEX[unit.kind as MonsterKind]);const scale=friendly?size:unit.kind==='sprout'?38:size;const drawn=renderAsset(ctx,asset,unit.x,unit.y+gait,scale,unit.facing===-1);if(!drawn&&!renderAsset(ctx,fallback,unit.x,unit.y+gait,scale,unit.facing===-1))fallbackActor(ctx,unit.x,unit.y+gait,size,friendly,friendly?'#347a9c':'#768749');}
 if(attacking&&!reduced){ctx.strokeStyle=friendly?'#f5e6a4':'#e99366';ctx.lineWidth=2;ctx.beginPath();ctx.arc(unit.x+unit.facing*13,unit.y-20,13,-.7,.7);ctx.stroke();}
 ctx.restore();
}
function effects(ctx:CanvasRenderingContext2D,list:LegionEffect[],reduced:boolean){
 // Only decoration is capped; every existing engine effect retains its readable core.
 let debris=0;
 for(const e of list){const t=clamp(e.age/e.duration,0,1);if(t>=1)continue;ctx.save();ctx.globalAlpha=(1-t)*.95;ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.lineCap='round';
  if(e.kind==='shot'){const x=e.from.x+(e.to.x-e.from.x)*t,y=e.from.y+(e.to.y-e.from.y)*t-16*Math.sin(t*Math.PI);const dx=e.to.x-e.from.x,dy=e.to.y-e.from.y,n=Math.max(1,Math.hypot(dx,dy));line(ctx,[{x:x-dx/n*13,y:y-dy/n*13},{x,y}],3,e.color);oval(ctx,x,y,3,3,'#fff1b4');}
  else if(e.kind==='chain'){const dx=e.to.x-e.from.x,dy=e.to.y-e.from.y,n=Math.max(1,Math.hypot(dx,dy));const nodes:Point[]=[];for(let i=0;i<6;i++){const q=i/5,k=i===0||i===5||reduced?0:(i%2?7:-7);nodes.push({x:e.from.x+dx*q-dy/n*k,y:e.from.y+dy*q+dx/n*k});}line(ctx,nodes,5,e.color+'88');line(ctx,nodes,2,'#d1ffff');}
  else if(e.kind==='death'){const r=9+t*25;ctx.beginPath();ctx.ellipse(e.to.x,e.to.y,r,r*.5,0,0,TAU);ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.stroke();
   if(!reduced){const colors=e.material==='wood'?(e.color==='#f2ab57'?['#9f642f','#ffb957','#eec76a']:['#99704a','#c7a067','#694e36']):e.material==='stone'?['#c6c4ab','#858f81','#ddd5b7']:e.material==='metal'?['#97b4b8','#e7d6a0','#657d86']:e.material==='frost'?['#b9efff','#76c5ed','#eefcff']:['#71d5d1','#d0f4e3','#f6dc8a'];for(let j=0;j<5&&debris<64;j++,debris++){const a=j*TAU/5+e.id,speed=18+noise(e.id+j)*25,dx=Math.cos(a)*speed*t,dy=Math.sin(a)*speed*t*.6-18*Math.sin(t*Math.PI);ctx.save();ctx.translate(e.to.x+dx,e.to.y+dy);ctx.rotate(a+t*2);ctx.fillStyle=colors[j%3];ctx.fillRect(-3,-3,5+(j%2)*3,4);ctx.restore();}}}
  else if(e.kind==='summon'){ctx.beginPath();ctx.ellipse(e.to.x,e.to.y,18+t*18,10+t*9,0,0,TAU);ctx.lineWidth=3;ctx.stroke();}
  else if(e.kind==='breach'){ctx.beginPath();ctx.ellipse(e.to.x,e.to.y,22+t*45,16+t*30,0,0,TAU);ctx.lineWidth=4;ctx.stroke();}
  else if(e.kind==='slash'){ctx.beginPath();ctx.arc(e.to.x,e.to.y-15,15+t*12,-1.5,.8);ctx.lineWidth=4*(1-t)+1;ctx.stroke();}
  else{const r=reduced?20:10+t*48;ctx.beginPath();ctx.ellipse(e.to.x,e.to.y,r,r*.58,0,0,TAU);ctx.lineWidth=4*(1-t)+1;ctx.stroke();oval(ctx,e.to.x,e.to.y,6*(1-t)+2,4*(1-t)+1,'#fff4d0');}
  ctx.restore();
 }
}

export default function LegionBoard({state,selected,onPlace,onInspect,disabled,reducedMotion}:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null),viewport=useRef<Viewport>({width:1600,height:900,scale:1,x:0,y:0});
 const pointer=useRef<{x:number;y:number;id:number}|null>(null);
 const [revision,setRevision]=useState(0),[hover,setHover]=useState<Point|null>(null),[keyboard,setKeyboard]=useState(false);
 const keyPoint=useRef<Point>({x:(DEPLOY.left+DEPLOY.right)/2,y:(DEPLOY.top+DEPLOY.bottom)/2});
 useEffect(()=>{let active=true;for(const src of sources)void loadImage(src).then(()=>{if(active)setRevision(value=>value+1);});return()=>{active=false;};},[]);
 const paint=useCallback(()=>{
  const canvas=canvasRef.current;if(!canvas)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#284638';ctx.fillRect(0,0,rect.width,rect.height);
  // Wide phones crop only decorative north/south margins; retain all three paths.
  // The 700-unit vertical safety floor also keeps extreme ultrawide windows playable.
  const wide=rect.width/rect.height>WORLD.width/WORLD.height;
  const scale=wide?Math.min(rect.width/WORLD.width,rect.height/700):Math.min(rect.width/WORLD.width,rect.height/WORLD.height),x=(rect.width-WORLD.width*scale)/2,y=(rect.height-WORLD.height*scale)/2;viewport.current={width:rect.width,height:rect.height,scale,x,y};
  ctx.translate(x,y);ctx.scale(scale,scale);const terrainArt=imageCache.get(TERRAIN_ART);if(terrainArt)ctx.drawImage(terrainArt,0,0,WORLD.width,WORLD.height);else ctx.drawImage(terrain(),0,0);ctx.save();ctx.beginPath();ctx.rect(0,0,WORLD.width,WORLD.height);ctx.clip();
  if(selected&&!disabled&&state.phase!=='won'&&state.phase!=='lost'){
   ctx.save();ctx.globalAlpha=state.phase==='wave'?.32:.7;ctx.fillStyle='#7cebd514';ctx.strokeStyle='#bcfff0';ctx.lineWidth=2;ctx.setLineDash([9,8]);ctx.beginPath();ctx.roundRect(DEPLOY.left,DEPLOY.top,DEPLOY.right-DEPLOY.left,DEPLOY.bottom-DEPLOY.top,20);ctx.fill();ctx.stroke();ctx.restore();
   for(const p of [{x:990,y:320},{x:1160,y:450},{x:1040,y:610}]){if(state.units.some(u=>Math.hypot(u.home.x-p.x,u.home.y-p.y)<65))continue;ctx.globalAlpha=.55;oval(ctx,p.x,p.y,17,11,'#e8e7ba');line(ctx,[{x:p.x-6,y:p.y},{x:p.x+6,y:p.y}],3,'#477760');line(ctx,[{x:p.x,y:p.y-5},{x:p.x,y:p.y+5}],3,'#477760');ctx.globalAlpha=1;}
  }
  const actors=[...state.units.map(unit=>({unit,friendly:true})),...state.enemies.map(unit=>({unit,friendly:false}))].sort((a,b)=>a.unit.y-b.unit.y||a.unit.id-b.unit.id);
  for(const a of actors){const attack=state.effects.find(e=>e.age<.2&&e.kind!=='death'&&e.kind!=='summon'&&Math.hypot(e.from.x-a.unit.x,e.from.y-a.unit.y)<16);const shieldAttack=a.friendly&&a.unit.kind==='shield'?state.effects.find(e=>e.kind==='slash'&&e.sourceId===a.unit.id&&e.age<.22):undefined;actor(ctx,a.unit,a.friendly,state.time,reducedMotion,Boolean(attack),shieldAttack?.age??null);}
  effects(ctx,state.effects,reducedMotion);
  if(hover&&selected&&!disabled){const issue=deploymentIssue(state,selected,hover),count=UNIT_DEFS[selected].count;ctx.save();ctx.setLineDash([5,4]);ctx.lineWidth=3;ctx.strokeStyle=issue?'#f7b1a0':'#caffed';for(let i=0;i<count;i++){ctx.beginPath();ctx.ellipse(hover.x,hover.y+(i-(count-1)/2)*32,21,12,0,0,TAU);ctx.stroke();}ctx.font='bold 15px system-ui';ctx.textAlign='center';const label=issue??`${UNIT_DEFS[selected].name} ${count}명 배치`,tw=ctx.measureText(label).width,tx=clamp(hover.x,tw/2+12,WORLD.width-tw/2-12),ty=clamp(hover.y-count*16-22,25,WORLD.height-20);round(ctx,tx-tw/2-8,ty-17,tw+16,24,5,issue?'#663f35e6':'#1d5147eb');ctx.fillStyle=issue?'#ffe0c8':'#d2ffef';ctx.fillText(label,tx,ty);ctx.restore();}
  ctx.restore();
 },[state,selected,disabled,reducedMotion,hover]);
 const paintRef=useRef(paint);paintRef.current=paint;
 useLayoutEffect(()=>{paint();},[paint,revision]);
 useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const observer=new ResizeObserver(()=>paintRef.current());observer.observe(canvas);return()=>observer.disconnect();},[]);
 const worldPoint=(event:PointerEvent<HTMLCanvasElement>):Point|null=>{const rect=event.currentTarget.getBoundingClientRect(),v=viewport.current;const point={x:(event.clientX-rect.left-v.x)/v.scale,y:(event.clientY-rect.top-v.y)/v.scale};return point.x<0||point.x>WORLD.width||point.y<0||point.y>WORLD.height?null:point;};
 const placeOrInspect=(p:Point)=>{if(disabled)return;const nearest=state.units.filter(u=>Math.hypot(u.x-p.x,u.y-p.y)<23).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(nearest&&onInspect&&(state.phase==='prep'||state.phase==='intermission')){onInspect(nearest.id);return;}if(selected)onPlace(p);};
 const keyDown=(event:KeyboardEvent<HTMLCanvasElement>)=>{if(disabled)return;const arrows:Record<string,Point>={ArrowLeft:{x:-40,y:0},ArrowRight:{x:40,y:0},ArrowUp:{x:0,y:-40},ArrowDown:{x:0,y:40}};if(arrows[event.key]){event.preventDefault();const d=arrows[event.key];keyPoint.current={x:clamp(keyPoint.current.x+d.x,DEPLOY.left+30,DEPLOY.right-30),y:clamp(keyPoint.current.y+d.y,DEPLOY.top+30,DEPLOY.bottom-30)};setKeyboard(true);setHover(keyPoint.current);}else if(event.key==='Enter'||event.key===' '){event.preventDefault();placeOrInspect(keyPoint.current);}};
 return <div className="legion-board-wrap"><canvas ref={canvasRef} className="legion-board" role="img" aria-label="군단 방어 전장. 부대 선택 후 밝은 배치 구역을 누르세요. 방향키로 위치를 고르고 Enter로 배치할 수 있습니다." tabIndex={disabled?-1:0} onKeyDown={keyDown} onBlur={()=>{setKeyboard(false);setHover(null);}} onPointerDown={event=>{if(disabled)return;pointer.current={x:event.clientX,y:event.clientY,id:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);setKeyboard(false);const p=worldPoint(event);if(p)setHover(p);}} onPointerMove={event=>{if(event.pointerType==='mouse'&&!keyboard)setHover(worldPoint(event));}} onPointerLeave={()=>{if(!keyboard)setHover(null);}} onPointerCancel={()=>{pointer.current=null;setHover(null);}} onPointerUp={event=>{const down=pointer.current;pointer.current=null;if(!down||down.id!==event.pointerId||Math.hypot(down.x-event.clientX,down.y-event.clientY)>14)return;const p=worldPoint(event);if(p)placeOrInspect(p);if(event.pointerType!=='mouse')setHover(null);}}/><span className="legion-board-description">아군 {state.units.length}명 · 몬스터 {state.enemies.length}마리 · 세 진입로에서 마을을 방어합니다.</span></div>;
}
