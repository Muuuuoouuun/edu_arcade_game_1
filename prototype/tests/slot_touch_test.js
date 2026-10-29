// Run against the local prototype server: BASE_URL=http://127.0.0.1:8767/prototype/ node prototype/tests/slot_touch_test.js
// Touch ambiguity must require an explicit choice; no sim state is mutated by the chooser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const PAGE_URL = new URL('3d_game.html', process.env.BASE_URL || 'http://127.0.0.1:8767/prototype/').href;
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 try {
  const page = await browser.newPage({ viewport: {width:360,height:740}, hasTouch:true });
  const errors = []; page.on('pageerror', e=>errors.push(e.message));
  await page.goto(PAGE_URL); await page.click('#startBtn'); await page.waitForTimeout(700);
  // Freeze only the test clock, preserving real pointer and DOM handling.
  await page.evaluate(()=>{ __game3d.paused = true; });
  const pair = await page.evaluate(()=>{
   const slots = __game3d.run.geo.SLOTS.map((_,i)=>({i,...__game3d.slotClient(i)}));
   const rc = document.querySelector('#gl').getBoundingClientRect(); let nearest = null;
   for (const a of slots) for (const b of slots) if (a.i < b.i) {
    const d = Math.hypot(a.cx-b.cx,a.cy-b.cy), x=(a.cx+b.cx)/2, y=(a.cy+b.cy)/2;
    if (d < 52 && x > rc.left+5 && x < rc.right-5 && y > rc.top+5 && y < rc.bottom-5 && (!nearest || d < nearest.d)) nearest = {a,b,d,x,y};
   }
   return nearest;
  });
  assert(pair, 'a visible pair with overlapping targets must exist in the fixture');
  const tapOverlap = async()=>{ await page.touchscreen.tap(pair.x,pair.y); await page.waitForTimeout(100); };
  const title = ()=>page.locator('#popup .ptitle').innerText();
  for (const target of [pair.a,pair.b]) {
   await tapOverlap(); assert.match(await title(),/어느 받침대/);
   const candidates=page.locator('#popup [data-slot-choice]'); assert((await candidates.count())>=2);
   assert.equal(await page.evaluate(()=>__game3d.run.state.towers.filter(Boolean).length),0);
   for (const button of await candidates.all()) { const b=await button.boundingBox(); assert(b.height>=48 && b.x>=0 && b.y>=0 && b.x+b.width<=360 && b.y+b.height<=740); }
   await page.locator(`[data-slot-choice="${target.i}"]`).tap(); assert.match(await title(),new RegExp(`슬롯 ${target.i+1} · 소환`));
   await page.locator('#popup [data-x]').tap();
   await page.touchscreen.tap(target.cx,target.cy); assert.match(await title(),new RegExp(`슬롯 ${target.i+1} · 소환`));
   await page.locator('#popup [data-x]').tap();
  }
  await tapOverlap(); await page.locator('#popup [data-x]').tap(); assert(await page.locator('#popup').isHidden());
  await tapOverlap(); await page.click('#pauseBtn'); assert(await page.locator('#popup').isHidden());
  await page.click('#resumeBtn'); await tapOverlap();
  await page.setViewportSize({width:320,height:568}); await page.waitForTimeout(200); assert(await page.locator('#popup').isHidden());
  await page.setViewportSize({width:360,height:740}); await page.waitForTimeout(200);
  await tapOverlap(); await page.locator(`[data-slot-choice="${pair.a.i}"]`).focus(); await page.keyboard.press('Enter');
  assert.match(await title(),new RegExp(`슬롯 ${pair.a.i+1} · 소환`)); await page.locator('#popup [data-x]').click();
  await page.keyboard.press('KeyQ'); await tapOverlap();
  assert.equal(await page.evaluate(()=>__game3d.run.state.towers.filter(Boolean).length),0);
  const affordable = await page.evaluate(({a,b})=>[a.i,b.i].find(i=>__game3d.run.summonCost(i)<=__game3d.run.state.mana),pair);
  assert.notEqual(affordable,undefined); await page.locator(`[data-slot-choice="${affordable}"]`).tap();
  assert.equal(await page.evaluate(i=>__game3d.run.state.towers[i]?.type,affordable),'wand');
  assert.deepEqual(errors,[]); console.log(`✓ ambiguous touch: ${pair.d.toFixed(1)}px; both choices, center taps, no premature purchase, keyboard choice, selected card, cancel, pause and resize`);
 } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
