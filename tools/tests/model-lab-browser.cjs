const { chromium } = require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [w,h] of [[390,844],[844,390]])for(const id of ['polar-bear','gecko-ranger']){
 const page=await browser.newPage({viewport:{width:w,height:h}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3100/model-lab.html?model='+id);await page.waitForFunction(id=>document.querySelector('#model-stage').dataset.loaded===id,id,{timeout:20000});
 await page.evaluate(()=>localStorage.setItem('arcana-motion-test','preserved'));
 const hit=page.locator('#hit-preview'); await hit.click();await page.waitForFunction(()=>document.querySelector('#model-stage').dataset.action==='idle',null,{timeout:10000});
 await hit.click();await page.locator('#attack-preview').click();await page.waitForFunction(()=>document.querySelector('#model-stage').dataset.action==='idle',null,{timeout:10000});
 await page.screenshot({path:`/tmp/${id}-${w}.png`});console.log(JSON.stringify({id,w,h,hitEnabled:await hit.isEnabled(),action:await page.locator('#model-stage').getAttribute('data-action'),storage:await page.evaluate(()=>localStorage.getItem('arcana-motion-test')),errors}));await page.close();}
const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/polar-bear.glb',r=>r.abort());await page.goto('http://127.0.0.1:3100/model-lab.html?model=polar-bear');await page.waitForFunction(()=>document.querySelector('#model-stage').dataset.loaded==='fallback');console.log('fallback',await page.locator('#hit-preview').isDisabled());await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
