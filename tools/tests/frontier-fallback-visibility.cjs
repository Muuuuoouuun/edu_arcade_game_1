// Start Vite before running; BASE_URL can select the local server.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:844,height:390}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/frontier-terrain.glb',route=>route.abort());
  await page.route('**/__frontier-fallback-check.html',route=>route.fulfill({contentType:'text/html',body:`
   <body style="margin:0"><div id="host" style="width:844px;height:390px"></div>
   <script type="module">
    import {FrontierScene} from '/src/games/frontier/scene.ts';
    import {createFrontier,heightAt} from '/src/games/frontier/engine.ts';
    // Use Vite's exact Three.js module URL so instanceof checks share one copy.
    const source=await (await fetch('/src/games/frontier/scene.ts')).text();
    const match=source.match(/from\\s*["']([^"']*three\\.js[^"']*)["']/);
    if(!match)throw Error('Cannot resolve the scene Three.js module');
    const THREE=await import(match[1]);
    const world=new FrontierScene(document.querySelector('#host'),'solo',()=>{},()=>{},'forest');
    const state=createFrontier('solo');state.phase='playing';state.hero.x=27;state.hero.z=-7;state.hero.target={x:27,z:-7};state.enemies=[];world.reduced=true;
    function frame(){world.render(state,.016);requestAnimationFrame(frame)}requestAnimationFrame(frame);
    window.inspect=()=>{world.root.updateMatrixWorld(true);
     const target=new THREE.Vector3(27,heightAt(27,-7)+1.5,-7),direction=target.clone().sub(world.camera.position);
     const hits=new THREE.Raycaster(world.camera.position,direction.clone().normalize(),.01,direction.length()-.15).intersectObject(world.root,true);
     const ground=new THREE.Raycaster(new THREE.Vector3(45.8,30,-7),new THREE.Vector3(0,-1,0)).intersectObject(world.root,true);
     return{occlusion:hits.length,vergeHeight:ground[0]?.point.y,expectedHeight:heightAt(45.8,-7),canvas:document.querySelectorAll('canvas').length};
    };
   </script>`}));
  await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:3100'}/__frontier-fallback-check.html`);
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.terrainModel==='geometry'&&document.querySelector('canvas')?.dataset.heroMotion==='entry',null,{timeout:60000});
  const result=await page.evaluate(()=>window.inspect());
  assert.equal(result.occlusion,0,'fallback forest hides the hero');
  assert.ok(Math.abs(result.vergeHeight-result.expectedHeight)<.0001,'fallback tree verge does not meet the terrain');
  assert.equal(result.canvas,1);assert.deepEqual(errors,[]);
  console.log('PASS fallback forest visibility and slope',JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
