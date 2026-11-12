// Exercise the actual React/SVG renderer with Vite's normal TSX transform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cache=mkdtempSync(join(tmpdir(),'arcana-fx-test-'));
const vite=await createServer({cacheDir:cache,server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
 const {EffectLayer}=await vite.ssrLoadModule('/src/components/DefenseEffects.tsx');
 const art=await vite.ssrLoadModule('/src/games/defense/art.ts');
 const imageBefore=Object.getOwnPropertyDescriptor(globalThis,'Image');
 class ReadyImage {onload=null;onerror=null;set src(_value){queueMicrotask(()=>this.onload?.());}}
 Object.defineProperty(globalThis,'Image',{value:ReadyImage,configurable:true});
 try {await art.preloadDefenseMotion();} finally {if(imageBefore)Object.defineProperty(globalThis,'Image',imageBefore);else Reflect.deleteProperty(globalThis,'Image');}
 test('wood death keeps its hit point and mirrors the authored body in both directions',()=>{
  for(const facing of [-1,1])for(const reduced of [false,true]){
   const effects=[{id:1,kind:'death',from:{x:105,y:220},to:{x:105,y:220},element:'physical',life:.4,maxLife:.7,age:.3,targetKind:'wood',targetSprite:9,targetFacing:facing}];
   const html=renderToStaticMarkup(createElement('svg',null,createElement(EffectLayer,{effects,reduced,layer:'front'})));
   assert.match(html,/transform="translate\(105,220\)" data-effect="death"/);
   assert.match(html,reduced?/data-death-frame="4"/:/data-death-frame="2"/);
   assert.match(html,facing<0?/scale\(-1,1\)/:/scale\(1,1\)/);
   assert.match(html,/wood-soldier-death-atlas\.webp/);
  }
 });
 test('ice death keeps its hit location and mirrors both facings',()=>{
  for(const facing of [-1,1])for(const reduced of [false,true]){
   const effects=[{id:1,kind:'death',from:{x:105,y:220},to:{x:105,y:220},element:'physical',life:.4,maxLife:.7,age:.3,targetKind:'ice',targetSprite:10,targetFacing:facing}];
   const html=renderToStaticMarkup(createElement('svg',null,createElement(EffectLayer,{effects,reduced,layer:'front'})));
   assert.match(html,/transform="translate\(105,220\)" data-effect="death"/);
   assert.match(html,reduced?/data-death-frame="4"/:/data-death-frame="2"/);
   assert.match(html,facing<0?/scale\(-1,1\)/:/scale\(1,1\)/);
   assert.match(html,/ice-knight-death-atlas\.webp/);
  }
 });
 const heroes=['mage','elf','dwarf','tao','barbarian','druid'];
 for(const reduced of [false,true])test(`skill marks remain under combat poses (${reduced?'reduced':'normal'} motion)`,()=>{
  const signatures=new Set();
  for(const hero of heroes){
   const targets=[{id:7,x:102,y:204},{id:9,x:311,y:422}];
   const common={from:{x:40,y:50},to:{x:40,y:50},element:'impact',life:.85,maxLife:.85,age:.1};
   const effects=[{...common,id:1,kind:'skill',skillHero:hero,skillTargets:targets},{...common,id:2,kind:'death',targetKind:'metal',targetSprite:12,to:{x:102,y:204}},{...common,id:3,kind:'impact',text:'42',to:{x:311,y:422}}];
   const render=layer=>renderToStaticMarkup(createElement('svg',null,createElement(EffectLayer,{effects,reduced,unit:.8,layer})));
   const ground=render('ground'),front=render('front');
   assert.equal((ground.match(/data-skill-target=/g)||[]).length,2,`${hero}: one mark per actual target`);
   assert.match(ground,/data-skill-target="7"[^>]*translate\(102,204\)/);
   assert.match(ground,/data-skill-target="9"[^>]*translate\(311,422\)/);
   assert.doesNotMatch(front,/data-skill-target=/,'no target mark covers the foreground');
   assert.match(front,/data-effect="death"/);assert.match(front,/data-effect="impact"/);assert.match(front,/data-effect="skill"/);
   const signature=ground.match(/data-skill-target="7"[^>]*>([\s\S]*?)<\/g>/)?.[1];
   assert.ok(signature);signatures.add(signature);
  }
  assert.equal(signatures.size,heroes.length,'all six hero-specific marks remain distinct');
 });
} finally {await vite.close();rmSync(cache,{recursive:true,force:true});}
