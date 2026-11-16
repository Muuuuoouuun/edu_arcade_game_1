// Verify that integration keeps every playable entry reachable. Isolated profiles;
// this does not migrate or edit a real player's saves. Software-rendered evidence.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.ARCANA_BASE_URL||'http://localhost:3110';
const out=process.env.ARCANA_EVIDENCE_DIR||'/tmp/arcana-recovery-entries';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const reports=[];
 try{
  for(const [name,width,height] of [['desktop',1280,720],['mobile',844,390]]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:name==='mobile'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`${base}/?modes=1`);await page.locator('.arcana-mode-picker').waitFor();
   assert.equal(await page.locator('.arcana-mode-picker a[href="/frontier.html"]').count(),1);
   assert.equal(await page.locator('.arcana-mode-picker a[href="/rush.html"]').count(),1);
   await page.screenshot({path:path.join(out,`${name}-title.png`)});
   await page.locator('.arcana-mode-picker a[href="/frontier.html"]').click();
   const modes=[];
   for(const [mode,label] of [['defense','성문 방어'],['command','변경 지휘'],['solo','수정 원정']]){
    if(modes.length)await page.goto(`${base}/frontier.html`);
    await page.locator('.frontier-menu button').filter({hasText:label}).click();
    await page.waitForFunction(()=>{const c=document.querySelector('.frontier-stage canvas');return c&&Number(c.dataset.assets)>=3&&c.dataset.terrainModel&&c.dataset.terrainModel!=='geometry';});
    if(mode!=='defense')await page.waitForFunction(()=>{const c=document.querySelector('.frontier-stage canvas');return c?.dataset.heroGeometry&&c.dataset.heroGeometry!=='fallback';});
    assert.equal(await page.locator('.frontier-stage canvas').count(),1);
    await page.getByRole('button',{name:'훈련 시작',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('.frontier').dataset.time)>.1);
    assert.equal(await page.locator('.frontier').getAttribute('data-mode'),mode);
    const info=await page.locator('.frontier-stage canvas').evaluate(el=>({assets:el.dataset.assets,terrain:el.dataset.terrainModel,wood:el.dataset.wood,hero:el.dataset.heroGeometry}));
    modes.push({mode,...info});
    if(mode==='solo')await page.screenshot({path:path.join(out,`${name}-frontier.png`)});
   }
   await page.goto(`${base}/?modes=1`);await page.locator('.arcana-mode-picker a[href="/rush.html"]').click();
   await page.locator('#btn-play').click();await page.locator('#screen-town').waitFor();
   await page.locator('#btn-battle').click();
   await page.waitForFunction(()=>window.__rush?.mode==='play'&&window.__rush.state.tick>4);
   assert.equal(await page.locator('canvas').count(),1);
   await page.screenshot({path:path.join(out,`${name}-rush.png`)});
   await page.locator('#pause').click();const tick=await page.evaluate(()=>window.__rush.state.tick);
   await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.__rush.state.tick),tick);
   await page.locator('#btn-resume').click();await page.waitForFunction(t=>window.__rush.state.tick>t,tick);
   await page.goto(`${base}/?modes=1`);await page.locator('button.arcana-mode').click();await page.locator('.camp-legion-entry').click();
   await page.locator('[data-screen="legion"]').waitFor();
   const board=page.locator('canvas.legion-board'),rect=await board.boundingBox();
   const position={x:rect.width*.72,y:rect.height*.5};
   if(name==='mobile')await board.tap({position});else await board.click({position});
   await page.locator('.legion-start').click();await page.locator('.legion-game[data-phase="wave"]').waitFor();
   await page.waitForFunction(()=>Number(document.querySelector('.legion-game').dataset.time)>.1);
   await page.screenshot({path:path.join(out,`${name}-legion.png`)});
   assert.deepEqual(errors,[]);reports.push({viewport:name,frontier:modes,rush:'town/battle/pause/resume',legion:'place/start',errors});
   await page.close();console.log(`${name}: all entries passed`);
  }
  await fs.writeFile(path.join(out,'entry-verification.json'),JSON.stringify({environment:'Chromium SwiftShader; mobile landscape emulation, not physical device',reports},null,2)+'\n');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
