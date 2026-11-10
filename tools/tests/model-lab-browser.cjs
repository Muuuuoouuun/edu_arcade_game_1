const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [w,h] of [[390,844],[844,390]])for(const id of ['polar-bear','gecko-ranger']){
 const page=await browser.newPage({viewport:{width:w,height:h}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3100/model-lab.html?model='+id);await page.waitForFunction(id=>document.querySelector('#model-stage').dataset.loaded===id,id,{timeout:20000});
 await page.evaluate(()=>localStorage.setItem('arcana-motion-test','preserved'));
 const hit=page.locator('#hit-preview'), attack=page.locator('#attack-preview'), pose=page.locator('#pose-progress'), stage=page.locator('#model-stage');
 await pose.fill('70');assert.equal(await pose.inputValue(),'70');assert.equal(await page.locator('#pose-value').textContent(),'70%');assert.equal(await stage.getAttribute('data-action'),'pose');
 await hit.click();assert.equal(await stage.getAttribute('data-action'),'hit');
 await attack.click();assert.equal(await stage.getAttribute('data-action'),'firing');
 await hit.click();assert.equal(await stage.getAttribute('data-action'),'hit');
 await page.waitForFunction(()=>document.querySelector('#model-stage').dataset.action==='idle',null,{timeout:10000});
 await hit.click();await page.waitForFunction(()=>document.querySelector('#model-stage').dataset.action==='idle',null,{timeout:10000});
 assert.equal(await page.evaluate(()=>localStorage.getItem('arcana-motion-test')),'preserved');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({id,w,h,slider:'70%',transitions:'pose→hit→attack→hit→idle',repeat:'passed',errors}));await page.close();}
const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/polar-bear.glb',r=>r.abort());await page.goto('http://127.0.0.1:3100/model-lab.html?model=polar-bear');await page.waitForFunction(()=>document.querySelector('#model-stage').dataset.loaded==='fallback');assert.equal(await page.locator('#hit-preview').isDisabled(),true);console.log('fallback passed');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
