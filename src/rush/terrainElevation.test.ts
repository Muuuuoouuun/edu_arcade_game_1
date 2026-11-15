import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Ray, Raycaster, Vector3 } from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { APPROACH, createCliffGeometry, createGroundGeometry, heightAt, normalAt, raycastTerrain } from './terrainElevation.ts';
import { ARENA, PADS, TOWN } from './data.ts';

test('approach is continuous and grounds the castle and all four pads on one plateau',()=>{
  for(const x of [-15,0,15]) {
    assert.equal(heightAt(x,-26),0);assert.equal(heightAt(x,1),0);assert.equal(heightAt(x,3),.6);assert.equal(heightAt(x,5),1.2);
    for(const z of [1,5])assert.ok(Math.abs(heightAt(x,z-1e-7)-heightAt(x,z+1e-7))<1e-6);
  }
  assert.equal(heightAt(TOWN.x,TOWN.z),1.2);
  for(const p of PADS)assert.equal(heightAt(p.x,p.z),1.2);
  assert.ok(normalAt(0,3).dot(new Vector3(0,.3,1))<1e-12);
});

test('surface vertices and winding match the analytic walk plane within the bounded budget',()=>{
  const ground=createGroundGeometry(),cliffs=createCliffGeometry(),p=ground.getAttribute('position'),n=ground.getAttribute('normal');
  assert.equal(ground.index!.count/3,2340);
  assert.ok((ground.index!.count+cliffs.index!.count)/3<3000);
  for(let i=0;i<p.count;i++) {
    assert.ok(Math.abs(p.getY(i)-heightAt(p.getX(i),p.getZ(i)))<1e-6);assert.ok(n.getY(i)>.95);
  }
  const c=cliffs.getAttribute('position');for(let i=0;i<c.count;i++) {
    assert.ok(c.getX(i)<=ARENA.minX||c.getX(i)>=ARENA.maxX||c.getZ(i)<=ARENA.minZ||c.getZ(i)>=ARENA.maxZ);
    assert.ok(c.getX(i)>=ARENA.minX-1.101&&c.getX(i)<=ARENA.maxX+1.101&&c.getZ(i)>=ARENA.minZ-1.101&&c.getZ(i)<=ARENA.maxZ+1.101);
    assert.ok(c.getY(i)>=APPROACH.baseY-1e-6);assert.ok(c.getY(i)<=heightAt(c.getX(i),c.getZ(i))+1e-6);
  }
  ground.dispose();cliffs.dispose();
});

test('mouse ray hits the rendered triangles at the same point on lower field, ramp and plateau',()=>{
  const geo=createGroundGeometry(),mesh=new Mesh(geo,new MeshBasicMaterial({side:DoubleSide}));mesh.updateMatrixWorld();
  for(const z of [-25,0,1,2.75,5,7,12.5])for(const x of [-14,0,14]) {
    const target=new Vector3(x,heightAt(x,z),z),origin=target.clone().add(new Vector3(.2,8,4));
    const ray=new Ray(origin,target.clone().sub(origin).normalize()),hit=raycastTerrain(ray);
    assert.ok(hit);assert.ok(hit.distanceTo(target)<1e-6);
    const intersections=new Raycaster(ray.origin,ray.direction).intersectObject(mesh);
    assert.ok(intersections.length);assert.ok(intersections[0].point.distanceTo(hit)<1e-6);
  }
  geo.dispose();
});

test('out-of-bounds, sky-facing and horizontal non-intersecting rays never create an aim point',()=>{
  assert.equal(raycastTerrain(new Ray(new Vector3(16,5,6),new Vector3(0,-1,0))),null);
  assert.equal(raycastTerrain(new Ray(new Vector3(0,5,6),new Vector3(0,1,0))),null);
  assert.equal(raycastTerrain(new Ray(new Vector3(0,5,6),new Vector3(1,0,0))),null);
});

test('editable Blender export contains the same actual ground and skirt, with no animation or image plane',async()=>{
  const bytes=await readFile(new URL('../../public/defense/models/rush-approach.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);let count=0,triangles=0,groundFound=false;
  gltf.scene.traverse(o=>{
    if(!(o instanceof Mesh))return;
    count++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    assert.ok(o.geometry.getAttribute('color'));
    if(!o.name.startsWith('Walkable'))return;
    groundFound=true;const p=o.geometry.getAttribute('position'),v=new Vector3();
    for(let i=0;i<p.count;i++) {v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);assert.ok(Math.abs(v.y-heightAt(v.x,v.z))<1e-5);}
  });
  assert.equal(count,2);assert.equal(triangles,2892);assert.equal(groundFound,true);assert.equal(gltf.animations.length,0);
});
