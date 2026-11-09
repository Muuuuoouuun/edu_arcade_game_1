import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';import{Raycaster,Vector3,Box3}from'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),meta=JSON.parse(read('public/defense/models/frontier-frost-cliffs.json'));
for(const f of meta.files)assert.equal(createHash('sha256').update(read(f.path)).digest('hex'),f.sha256,f.path);
const load=async n=>{const b=read(`public/defense/models/${n}.glb`),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');g.scene.updateMatrixWorld(true);return g.scene;};
const next=await load('frontier-frost-cliffs'),old=await load('frontier-frost');
const at=(root,x,z)=>new Raycaster(new Vector3(x,30,z),new Vector3(0,-1,0)).intersectObject(root,true)[0]?.point.y;
let ground=0,maxError=0;
for(let x=-27.9;x<28;x+=1.7)for(let z=-27.9;z<28;z+=1.7){if(x>3&&x<9)continue;const delta=Math.abs(at(next,x,z)-at(old,x,z));assert.ok(delta<.0001,`${x},${z}: ${delta}`);maxError=Math.max(maxError,delta);ground++;}
for(let x=2.01;x<9.99;x+=.125)assert.ok(Math.abs(at(next,x,0)-.36)<.001,'bridge contact stays .36');
let count=0,triangles=0;next.traverse(o=>{if(o.isMesh){count++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.geometry.attributes.color);}});assert.equal(count,1);assert.ok(triangles<18000);assert.equal(meta.new_cliff_meshes,66);
const hit=new Raycaster(new Vector3(-27,2.5,3),new Vector3(-1,0,0)).intersectObject(next,true)[0];assert.ok(hit&&hit.point.x< -28,'cliff occludes a horizontal view outside walkable area');
console.log(JSON.stringify({hashes:meta.files.length,ground,maxGroundError:maxError,triangles,surfaces:count,size:new Box3().setFromObject(next).getSize(new Vector3()).toArray(),depthHit:hit.point.toArray()},null,2));
