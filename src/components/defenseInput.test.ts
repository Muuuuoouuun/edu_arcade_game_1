import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaths, getSlots } from '../games/defense/data.ts';
import { BoardTapTracker, clientToBoard, resolveBoardTap } from './defenseInput.ts';
import type { ScreenMatrix } from './defenseInput.ts';

const identity:ScreenMatrix={a:1,b:0,c:0,d:1,e:0,f:0};
const mobile:ScreenMatrix={a:304/900,b:0,c:0,d:304/900,e:8,f:120};
const project=(x:number,y:number,matrix=mobile)=>({x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f});

test('maps CSS positions through the latest CTM, rejecting contain letterboxes',()=>{
 assert.deepEqual(clientToBoard(project(450,300),mobile),{x:450,y:300});
 assert.equal(clientToBoard({x:7,y:140},mobile),null);
 assert.equal(clientToBoard({x:160,y:119},mobile),null);
 assert.equal(clientToBoard({x:160,y:324},mobile),null);
 assert.equal(clientToBoard({x:100,y:100},{...identity,a:0}),null);
 assert.equal(clientToBoard({x:100,y:100},{...identity,e:NaN}),null);
});

test('supports a rotated SVG matrix without treating screen axes as world axes',()=>{
 const rotated={a:0,b:.5,c:-.5,d:0,e:400,f:20};
 assert.deepEqual(clientToBoard(project(200,300,rotated),rotated),{x:200,y:300});
});

test('uses a centered 48px square rather than a scaled or circular touch region',()=>{
 const slots=[{id:2,x:300,y:300}],center=project(300,300);
 assert.deepEqual(resolveBoardTap({x:center.x+24,y:center.y+24},mobile,slots),{kind:'select',id:2});
 assert.equal(resolveBoardTap({x:center.x+24.01,y:center.y},mobile,slots)?.kind,'move');
});

test('forest and snow overlapping pads return all candidates independent of DOM order',()=>{
 for(const [stage,a,b] of [[4,2,3],[8,2,6]]){
  const slots=getSlots(stage).filter(slot=>slot.unlock<=stage),first=slots.find(slot=>slot.id===a)!,second=slots.find(slot=>slot.id===b)!;
  const point=project((first.x+second.x)/2,(first.y+second.y)/2);
  assert.deepEqual(resolveBoardTap(point,mobile,slots),{kind:'candidates',ids:[a,b]});
  assert.deepEqual(resolveBoardTap(point,mobile,[...slots].reverse()),{kind:'candidates',ids:[a,b]});
 }
});

test('dash aiming takes priority over single and overlapping build pads',()=>{
 const slots=getSlots(8),point=project(437.5,167.5);
 const command=resolveBoardTap(point,mobile,slots,true);
 assert.equal(command?.kind,'move');
 if(command?.kind==='move'){assert.ok(Math.abs(command.point.x-437.5)<1e-8);assert.ok(Math.abs(command.point.y-167.5)<1e-8);}
 assert.equal(resolveBoardTap({x:7,y:140},mobile,slots,true),null);
});

test('a valid pointer release resolves its latest position, with exactly 8px slop allowed',()=>{
 const tracker=new BoardTapTracker();
 assert.equal(tracker.begin(1,{x:100,y:100},identity),'start');
 assert.equal(tracker.move(1,{x:108,y:100}),false);
 assert.deepEqual(tracker.end(1,{x:108,y:100},identity),{kind:'tap',point:{x:108,y:100}});
 assert.deepEqual(tracker.end(1,{x:108,y:100},identity),{kind:'none'});
});

test('a drag cannot turn back into a tap after returning within the threshold',()=>{
 const tracker=new BoardTapTracker();tracker.begin(1,{x:100,y:100},identity);
 assert.equal(tracker.move(1,{x:106,y:106}),true);
 assert.equal(tracker.move(1,{x:100,y:100}),false);
 assert.deepEqual(tracker.end(1,{x:100,y:100},identity),{kind:'none'});
});

test('large up-only movement and changed layout cancel the command',()=>{
 const tracker=new BoardTapTracker();tracker.begin(1,{x:100,y:100},identity);
 assert.deepEqual(tracker.end(1,{x:109,y:100},identity),{kind:'cancel'});
 tracker.begin(2,{x:100,y:100},identity);
 assert.deepEqual(tracker.end(2,{x:100,y:100},{...identity,a:.5,d:.5}),{kind:'cancel'});
 tracker.begin(3,{x:100,y:100},identity);
 assert.deepEqual(tracker.end(3,{x:100,y:100},{...identity,e:30}),{kind:'cancel'});
});

test('resize and pointercancel discard old gestures but allow a fresh pointerdown',()=>{
 const tracker=new BoardTapTracker();tracker.begin(1,{x:100,y:100},identity);
 assert.equal(tracker.reset(),true);
 assert.deepEqual(tracker.end(1,{x:100,y:100},identity),{kind:'none'});
 assert.equal(tracker.begin(2,{x:110,y:110},identity),'start');
 assert.equal(tracker.end(2,{x:110,y:110},identity).kind,'tap');
});

test('a second finger cancels the first command and neither release becomes a tap',()=>{
 const tracker=new BoardTapTracker();tracker.begin(1,{x:100,y:100},identity);
 assert.equal(tracker.begin(2,{x:120,y:100},identity,false),'cancel');
 assert.deepEqual(tracker.end(1,{x:100,y:100},identity),{kind:'none'});
 assert.deepEqual(tracker.end(2,{x:120,y:100},identity),{kind:'none'});
 assert.equal(tracker.begin(3,{x:100,y:100},identity),'start');
 assert.equal(tracker.end(3,{x:100,y:100},identity).kind,'tap');
});

test('a tap in the pad square but nearer the road than the pad moves the hero',()=>{
 const slots=[{id:1,x:300,y:300}],paths=[[{x:0,y:340},{x:900,y:340}]],c=project(300,300,identity);
 // 40px road distance for the pad; a tap 30px south is 10px from the road and 30px (outside 21) from the pad art.
 assert.deepEqual(resolveBoardTap({x:c.x,y:c.y+22},identity,slots,false,paths),{kind:'move',point:{x:300,y:322}});
 assert.deepEqual(resolveBoardTap({x:c.x,y:c.y+22},identity,slots),{kind:'select',id:1},'without paths behaviour is unchanged');
 assert.deepEqual(resolveBoardTap({x:c.x,y:c.y-22},identity,slots,false,paths),{kind:'select',id:1},'road-far side still selects the pad');
 assert.deepEqual(resolveBoardTap({x:c.x,y:c.y+20},identity,slots,false,paths),{kind:'select',id:1},'pad art circle always selects');
 assert.deepEqual(resolveBoardTap(project(300,300,identity),identity,slots,false,paths),{kind:'select',id:1});
});

test('a pad sitting on the road is never stolen by the road rule',()=>{
 const slots=[{id:1,x:300,y:340}],paths=[[{x:0,y:340},{x:900,y:340}]];
 assert.deepEqual(resolveBoardTap({x:300,y:362},identity,slots,false,paths),{kind:'select',id:1});
});

test('real stage pads keep a usable touch square on the first map',()=>{
 const slots=getSlots(1);
 for(const slot of slots)assert.deepEqual(resolveBoardTap({x:slot.x,y:slot.y},identity,slots,false,getPaths(1)),{kind:'select',id:slot.id});
});
