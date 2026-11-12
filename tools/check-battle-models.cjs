// Run against `npm run dev -- --port 3110`. Uses an isolated browser profile and
// a synthetic unlocked save; never writes the developer's/user's real save.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.ARCANA_BASE_URL || 'http://localhost:3110';
const output = process.env.ARCANA_EVIDENCE_DIR || '/tmp/arcana-battle-models';
const save = {version:1,gold:500,cleared:[1,2,3,4,5,6,7],questClaimed:[],seenVisitors:['mage','elf','dwarf','tao','barbarian','druid'],training:0,selectedHero:'barbarian',difficulty:'relaxed',processedRuns:[]};
const reports=[];

async function enter(page, hero='barbarian', snow=false){
 await page.addInitScript(value=>localStorage.setItem('playground:defense:v1',JSON.stringify(value)),{...save,selectedHero:hero});
 await page.goto(base);
 await page.getByRole('button',{name:/모험 이어가기/}).click();
 await page.locator('[data-camp-menu="expedition"]').click();
 await page.locator('.camp-region-tabs button').nth(snow?1:0).click();
 await page.locator('.camp-stages button').first().click();
 await page.locator('.camp-depart:visible, .camp-departure-dock > button:visible').click();
 await page.locator('[data-testid="defense-board"]').waitFor();
}
async function model(page,selector='.def-hero'){
 await page.locator(`${selector}[data-renderer="model"]`).waitFor({state:'attached'});
}
async function pierce(page){
 await page.getByRole('button',{name:/3번 건설 지점/}).click();
 await page.locator('.tactical-towers button').filter({hasText:'석궁탑'}).click();
 await page.locator('.def-tower[data-renderer="sprite"][data-branch="base"]').waitFor({state:'attached'});
 await page.getByRole('button',{name:/3번 건설 지점/}).click();
 await page.locator('.tactical-upgrades button').filter({hasText:'관통 석궁'}).click();
 await model(page,'.def-tower');
}
async function renderInfo(page){return page.locator('.def-terrain-3d-battle').evaluate(el=>({...el.dataset}));}

(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await enter(page);await model(page);await pierce(page);
  assert.equal(await page.locator('.def-terrain-3d canvas').count(),1);
  const prep=await renderInfo(page);assert.ok(Number(prep.renderCalls)<100);
  await page.getByRole('button',{name:'웨이브 시작',exact:true}).click();
  await page.locator('.def-monster[data-enemy="wood"][data-renderer="model"]').first().waitFor({timeout:30000});
  await page.screenshot({path:path.join(output,'forest-battle.png')});
  await page.locator('.battle-pause').click();
  await page.locator('.battle-page[data-paused="true"]').waitFor();
  const frozen=await renderInfo(page);await page.waitForTimeout(250);
  assert.equal((await renderInfo(page)).actorStates,frozen.actorStates);
  // A lost context must show complete SVG fallbacks, then recover in place.
  await page.locator('.def-terrain-3d canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');window.__restoreArcana=gl.getExtension('WEBGL_lose_context');window.__restoreArcana.loseContext();});
  await page.locator('[data-terrain-ready="false"] .def-hero[data-renderer="sprite"]').waitFor();
  await page.evaluate(()=>window.__restoreArcana.restoreContext());await model(page);await model(page,'.def-tower');
  assert.equal(await page.locator('.def-terrain-3d canvas').count(),1);
  await page.getByRole('button',{name:'계속 방어하기',exact:true}).click();
  const xBefore=Number(await page.locator('.battle-page').getAttribute('data-hero-x'));
  await page.locator('.def-map').focus();await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(x=>Number(document.querySelector('.battle-page').dataset.heroX)<x-5,xBefore);
  reports.push({case:'desktop_campaign',checks:['build base sprite','upgrade pierce GLB','wood GLB','pause','context loss/restore','keyboard movement','single renderer'],prep:JSON.parse(prep.actorStates),drawCalls:Number(prep.renderCalls),errors});
  assert.deepEqual(errors,[]);await page.close();console.log('desktop campaign passed');

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),mobileErrors=[];
  mobile.on('pageerror',error=>mobileErrors.push(error.message));
  await enter(mobile,'dwarf',true);await model(mobile);
  const before=JSON.parse((await renderInfo(mobile)).actorStates)[0].position;
  const target=await mobile.locator('.def-map').evaluate(svg=>{const p=new DOMPoint(400,420).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};});
  await mobile.touchscreen.tap(target.x,target.y);
  await mobile.waitForFunction(x=>Number(document.querySelector('.battle-page').dataset.heroX)<x-5,before[0]);
  await mobile.screenshot({path:path.join(output,'snow-mobile.png')});
  assert.equal(await mobile.locator('.def-terrain-3d canvas').count(),1);
  reports.push({case:'mobile_snow_bron',checks:['GLB','touch movement','single renderer'],render:await renderInfo(mobile),errors:mobileErrors});
  assert.deepEqual(mobileErrors,[]);await mobile.close();console.log('mobile snow passed');

  const failed=await browser.newPage({viewport:{width:1100,height:800}});
  await failed.route('**/defense/models/battle/kar.glb',route=>route.abort());
  await enter(failed);await failed.locator('[data-terrain-ready="true"]').waitFor();await pierce(failed);
  await failed.locator('.def-hero[data-renderer="sprite"]').waitFor();
  reports.push({case:'asset_failure',checks:['hero SVG fallback','independent tower GLB'],render:await renderInfo(failed)});await failed.close();

  const fallback=await browser.newPage({viewport:{width:390,height:844}});
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return String(kind).includes('webgl')?null:original.call(this,kind,...args);};});
  await enter(fallback);await fallback.locator('[data-terrain-ready="false"] .def-hero[data-renderer="sprite"]').waitFor();
  await fallback.screenshot({path:path.join(output,'no-webgl.png')});
  reports.push({case:'no_webgl',checks:['terrain fallback','hero SVG fallback'],canvases:await fallback.locator('.def-terrain-3d canvas').count()});await fallback.close();

  const lab=await browser.newPage({viewport:{width:1100,height:850}}),labErrors=[];lab.on('pageerror',error=>labErrors.push(error.message));
  await lab.goto(`${base}/model-lab.html?model=human-guard`);await lab.locator('#model-stage[data-loaded="human-guard"]').waitFor();
  await lab.locator('#clip-walk-preview').click();await lab.locator('#model-stage[data-action="walking"]').waitFor();
  await lab.locator('#clip-idle-preview').click();await lab.locator('#model-stage[data-action="breathing"]').waitFor();
  await lab.locator('#attack-preview').click();await lab.locator('#model-stage[data-action="firing"]').waitFor();
  await lab.locator('#model-stage[data-action="idle"]').waitFor();
  await lab.screenshot({path:path.join(output,'human-guard-workshop.png')});
  await lab.emulateMedia({reducedMotion:'reduce'});
  await lab.waitForFunction(()=>document.querySelector('#clip-walk-preview').disabled);
  reports.push({case:'human_guard_workshop',checks:['GLB','walk','idle','thrust','return','reduced-motion'],errors:labErrors});assert.deepEqual(labErrors,[]);await lab.close();
  await fs.writeFile(path.join(output,'browser-verification.json'),JSON.stringify({date:'2026-11-12',environment:'Chromium SwiftShader; desktop and emulated mobile, not device GPU',reports},null,2)+'\n');
  console.log(JSON.stringify({passed:reports.map(report=>report.case),output},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
