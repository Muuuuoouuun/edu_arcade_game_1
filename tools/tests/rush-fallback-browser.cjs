// Start the integrated Vite server first; BASE may point at web or mobile build.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=(process.env.BASE||'http://127.0.0.1:3134').replace(/\/$/,'');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});const errors=[];let blocked=0;
  p.on('pageerror',e=>errors.push(e.message));
  // Vite's ?import&url is a JS module, not the model download; allow it to resolve.
  await p.route(/\.glb(?:\?|$)/,route=>{if(new URL(route.request().url()).searchParams.has('import'))return route.continue();blocked++;return route.abort();});
  await p.goto(`${BASE}/rush.html?play=1&seed=2`);
  await p.waitForFunction(()=>window.__rush&&__rush.state.tick>5);
  await p.waitForTimeout(1500);
  assert.ok(blocked>0,'hero model request blocked');
  assert.equal(await p.evaluate(()=>__rush.info().heroReady),false,'placeholder is active');
  const x=await p.evaluate(()=>__rush.state.hero.x);
  await p.keyboard.down('KeyD');await p.waitForTimeout(500);await p.keyboard.up('KeyD');
  assert.ok(await p.evaluate(before=>__rush.state.hero.x>before,x),'movement works without model');
  assert.equal(await p.locator('canvas').count(),1,'one rendered scene canvas');
  assert.ok(await p.locator('#fire').isVisible());
  assert.deepEqual(errors,[]);
  if(process.env.ARTIFACT_DIR)await p.screenshot({path:`${process.env.ARTIFACT_DIR}/rush-glb-fallback.png`});
  console.log(JSON.stringify({blocked,heroReady:await p.evaluate(()=>__rush.info().heroReady),errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
