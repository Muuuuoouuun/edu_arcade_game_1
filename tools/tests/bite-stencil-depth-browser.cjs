// Run against Vite with Playwright: BASE_URL=http://127.0.0.1:3100 node tools/tests/bite-stencil-depth-browser.cjs
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:400,height:400}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:3100/');
  const result=await page.evaluate(async()=>{
   const code=await(await fetch('/src/games/frontier/heroStencil.ts')).text();const threeUrl=code.match(/from\s+"([^\"]*three\.js\?v=[^\"]+)"/)[1];
   const T=await import(threeUrl),{HeroStencilMask}=await import('/src/games/frontier/heroStencil.ts'),{BiteReveal}=await import('/src/games/frontier/biteReveal.ts');
   const scene=new T.Scene();scene.background=new T.Color('#384851');const camera=new T.OrthographicCamera(-2,2,2,-2,.1,20);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
   const renderer=new T.WebGLRenderer({antialias:false,stencil:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(400,400);
   const hero=new T.Group(),heroMaterial=new T.MeshBasicMaterial({color:'#234fa0'}),body=new T.Mesh(new T.PlaneGeometry(2,2),heroMaterial);body.position.z=1;hero.add(body);scene.add(hero);hero.updateMatrixWorld(true);
   const wall=new T.Mesh(new T.PlaneGeometry(1,2),new T.MeshBasicMaterial({color:'#f02020'}));wall.position.set(1,0,.5);scene.add(wall);
   const pillar=new T.Mesh(new T.PlaneGeometry(.5,2),new T.MeshBasicMaterial({color:'#20d020'}));pillar.position.set(-.5,0,2);scene.add(pillar);
   const template=new T.Group(),root=new T.Group(),jaw=new T.Group();jaw.name='jaw';root.add(jaw);const surfaces=[];
   for(const [name,width,height,y] of [['wolf-surface-head',3,1.5,0],['wolf-surface-jaw',.5,.2,-.5]]){const source=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial());source.name=name;template.add(source);const surface=source.clone();surface.position.y=y;jaw.add(surface);surfaces.push(surface);}
   root.updateMatrixWorld(true);const view={root,surfaces,update(){},dispose(){}},enemy={id:1,x:0,z:0,hp:1,cooldown:0,path:0};
   const reveal=new BiteReveal(template),mask=new HeroStencilMask();scene.add(reveal.root);reveal.update(camera,hero,enemy,view);mask.sync(hero,reveal.visible);
   const gl=renderer.getContext(),pixel=x=>{const value=new Uint8Array(4);gl.readPixels(x,200,1,1,gl.RGBA,gl.UNSIGNED_BYTE,value);return [...value];};
   renderer.render(scene,camera);const visible=reveal.visible,on={hero:pixel(200),wall:pixel(325),pillar:pixel(150)};
   reveal.root.visible=false;renderer.render(scene,camera);const off={hero:pixel(200),wall:pixel(325),pillar:pixel(150)};
   hero.position.x=10;wall.position.x=0;reveal.root.visible=true;renderer.render(scene,camera);const movedOn=pixel(200);reveal.root.visible=false;renderer.render(scene,camera);const movedOff=pixel(200);
   const stencil=gl.getContextAttributes().stencil;
   mask.dispose();reveal.dispose();renderer.dispose();return{stencil,on,off,visible,movedOn,movedOff};
  });
  assert.equal(result.stencil,true);assert.equal(result.visible,true);assert.notDeepEqual(result.on.hero,result.off.hero,'wolf appears through visible hero');
  assert.deepEqual(result.on.wall,result.off.wall,'wolf never draws over another object behind the hero');
  assert.deepEqual(result.on.pillar,result.off.pillar,'foreground object blocks the hero stencil');
  assert.deepEqual(result.movedOn,result.movedOff,'each frame clears the previous hero silhouette');
  assert.deepEqual(errors,[]);console.log('PASS WebGL hero stencil',result);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
