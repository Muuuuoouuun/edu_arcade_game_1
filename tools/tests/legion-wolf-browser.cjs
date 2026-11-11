const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://127.0.0.1:3123/';
const dir=process.env.ARTIFACT_DIR||null;
async function create(browser,profile){
 const c=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:profile.mobile,reducedMotion:profile.reduced?'reduce':'no-preference'});
 const errors=[];await c.addInitScript(()=>{const original=CanvasRenderingContext2D.prototype.drawImage;window.__wolfDraws=[];CanvasRenderingContext2D.prototype.drawImage=function(image,...args){const src=image?.currentSrc||image?.src||'';if(/frost-wolf-(?:trot-)?atlas\.webp|snow-atlas\.png/.test(src)){window.__wolfDraws.push({src,sx:args[0]});if(window.__wolfDraws.length>12000)window.__wolfDraws.shift();}return original.call(this,image,...args);};});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));if(profile.block){await p.route('**/frost-wolf-trot-atlas.webp',r=>r.abort());if(profile.block==='all'||profile.block==='all-plus')await p.route('**/frost-wolf-atlas.webp',r=>r.abort());if(profile.block==='all-plus'){await p.route('**/snow-atlas.png',r=>r.abort());await p.route('**/defense/atlas.png',r=>r.abort());await p.route('**/defense/legion/forest-arena.webp',r=>r.abort());}}
 await p.goto(BASE,{waitUntil:'networkidle'});await p.getByRole('button',{name:/수비대 결성하기|모험 이어가기/}).click();await p.getByRole('button',{name:/군단 방어/}).click();const game=p.locator('[data-screen=legion]');await game.waitFor();
 const board=p.locator('canvas.legion-board'),rect=await board.boundingBox();await board.click({position:{x:rect.width*.72,y:rect.height*.5}});await p.getByRole('button',{name:/전투 시작/}).click();await p.waitForTimeout(4500);
 return {c,p,game,errors};
}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 for(const profile of [{name:'pc',width:1280,height:720},{name:'mobile',width:844,height:390,mobile:true},{name:'reduced',width:844,height:390,mobile:true,reduced:true},{name:'walk-fail',width:844,height:390,mobile:true,block:'walk'},{name:'both-fail',width:844,height:390,mobile:true,block:'all'},{name:'all-fail',width:844,height:390,mobile:true,block:'all-plus'}].filter(profile=>!process.env.PROFILE||profile.name===process.env.PROFILE)){
  const {c,p,game,errors}=await create(browser,profile);const draws=await p.evaluate(()=>window.__wolfDraws);const walk=draws.filter(d=>d.src.includes('frost-wolf-trot-atlas'));const base=draws.filter(d=>d.src.endsWith('frost-wolf-atlas.webp'));const fallback=draws.filter(d=>d.src.endsWith('snow-atlas.png'));
  if(!profile.block){assert.ok(walk.length>0,`${profile.name}: walk drawn`);const frames=[...new Set(walk.map(d=>d.sx))];if(profile.reduced)assert.equal(frames.length,1,'reduced gait stays fixed');else assert.ok(frames.length>=5,`${profile.name}: only ${frames.length} walk frames`);}else if(profile.block==='walk')assert.ok(base.length>0,'base atlas fallback');else if(profile.block==='all')assert.ok(fallback.length>0,'illustrated snow fallback');else {assert.equal(walk.length+base.length+fallback.length,0,'blocked images remain unused');assert.ok(await p.locator('canvas.legion-board').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some(value=>value!==0)),'fallback canvas is not blank');assert.equal(await p.locator('.legion-portrait-fallback').count(),3,'all failed portraits have distinct visible fallbacks');if(dir)await p.screenshot({path:`${dir}/all-assets-failed.png`});}
  for(const selector of ['.legion-resource','.legion-field-top','.legion-wave-progress','.legion-supply'])assert.equal(await p.locator(selector).first().isVisible(),false,`${selector} hidden`);
  assert.equal(await p.getByRole('status').count(),1,'screen-reader status remains available');
  const time=()=>game.getAttribute('data-time').then(Number);const t0=await time();await p.waitForTimeout(750);const t1=await time();assert.ok(t1>t0,'battle advances');
  await p.getByRole('button',{name:'군단 전투 일시정지'}).click();const paused=await time();await p.waitForTimeout(500);assert.equal(await time(),paused,'pause freezes simulation');await p.getByRole('button',{name:'계속하기'}).click();
  await p.getByRole('button',{name:/전투 속도 1배/}).click();const speedStart=await time();await p.waitForTimeout(750);const speedEnd=await time();assert.ok(speedEnd-speedStart>(t1-t0)*1.4,`speed not applied ${speedEnd-speedStart}/${t1-t0}`);
  if(profile.name==='mobile'){
    await p.setViewportSize({width:390,height:844});await p.waitForTimeout(350);assert.ok(await p.locator('.landscape-gate').isVisible(),'rotation gate visible');const locked=await time();await p.waitForTimeout(400);assert.equal(await time(),locked,'rotation pauses battle');await p.setViewportSize({width:844,height:390});await p.waitForTimeout(300);await p.getByRole('button',{name:'계속하기'}).click();
    if(dir)await p.screenshot({path:`${dir}/actual-mobile-verified.png`});
  }
  assert.deepEqual(errors,[],`${profile.name}: page errors`);console.log(JSON.stringify({profile:profile.name,walkFrames:[...new Set(walk.map(d=>d.sx))],walkDraws:walk.length,baseDraws:base.length,illustratedDraws:fallback.length,normal:t1-t0,fast:speedEnd-speedStart,errors}));await c.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
