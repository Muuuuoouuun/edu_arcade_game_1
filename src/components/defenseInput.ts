import type { Point } from '../games/defense/types.ts';

export type ScreenMatrix = { a:number; b:number; c:number; d:number; e:number; f:number };
export type InputSlot = Point & { id:number };
export type BoardTap = { kind:'move'; point:Point } | { kind:'select'; id:number } | { kind:'candidates'; ids:number[] };
const MAP_WIDTH=900, MAP_HEIGHT=600;
export const TAP_SLOP=8;
export const SLOT_TOUCH_SIZE=48;

/** SVG CTM includes contain/letterbox offsets; reject its empty margins. */
export function clientToBoard(client:Point,matrix:ScreenMatrix|null):Point|null {
 if(!matrix||![client.x,client.y,matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite))return null;
 const {a,b,c,d,e,f}=matrix,det=a*d-b*c;
 if(Math.abs(det)<1e-9)return null;
 const x=(d*(client.x-e)-c*(client.y-f))/det,y=(-b*(client.x-e)+a*(client.y-f))/det;
 return x<0||x>MAP_WIDTH||y<0||y>MAP_HEIGHT?null:{x,y};
}

/** Touch geometry is measured in CSS pixels, independent of sprite/DOM order. */
export function resolveBoardTap(client:Point,matrix:ScreenMatrix|null,slots:readonly InputSlot[],aimingDash=false):BoardTap|null {
 const point=clientToBoard(client,matrix);
 if(!point||!matrix)return null;
 if(aimingDash)return {kind:'move',point};
 const half=SLOT_TOUCH_SIZE/2;
 const ids=slots.filter(slot=>{
  const x=matrix.a*slot.x+matrix.c*slot.y+matrix.e,y=matrix.b*slot.x+matrix.d*slot.y+matrix.f;
  return Math.abs(client.x-x)<=half&&Math.abs(client.y-y)<=half;
 }).map(slot=>slot.id).sort((a,b)=>a-b);
 return ids.length>1?{kind:'candidates',ids}:ids.length===1?{kind:'select',id:ids[0]}:{kind:'move',point};
}

const matrixSame=(a:ScreenMatrix,b:ScreenMatrix)=>
 (['a','b','c','d','e','f'] as const).every(key=>Math.abs(a[key]-b[key])<.01);
type Gesture={id:number;start:Point;matrix:ScreenMatrix};
type TapEnd={kind:'tap';point:Point}|{kind:'cancel'}|{kind:'none'};

/** A cancelled drag cannot become a tap again when the finger returns. */
export class BoardTapTracker {
 private gesture:Gesture|null=null;
 private contacts=new Set<number>();

 begin(id:number,point:Point,matrix:ScreenMatrix,primary=true):'start'|'cancel' {
  this.contacts.add(id);
  if(!primary||this.contacts.size!==1||this.gesture){this.gesture=null;return 'cancel';}
  this.gesture={id,start:{...point},matrix:{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f}};
  return 'start';
 }

 move(id:number,point:Point):boolean {
  if(!this.gesture||this.gesture.id!==id)return false;
  if(Math.hypot(point.x-this.gesture.start.x,point.y-this.gesture.start.y)<=TAP_SLOP)return false;
  this.gesture=null;
  return true;
 }

 end(id:number,point:Point,matrix:ScreenMatrix|null):TapEnd {
  this.contacts.delete(id);
  const gesture=this.gesture;
  if(!gesture||gesture.id!==id)return {kind:'none'};
  this.gesture=null;
  if(this.contacts.size||!matrix||!matrixSame(gesture.matrix,matrix)||
    Math.hypot(point.x-gesture.start.x,point.y-gesture.start.y)>TAP_SLOP)return {kind:'cancel'};
  return {kind:'tap',point};
 }

 has(id:number):boolean {return this.gesture?.id===id;}
 reset():boolean {
  const hadInput=this.gesture!==null||this.contacts.size>0;
  this.gesture=null;this.contacts.clear();
  return hadInput;
 }
}
