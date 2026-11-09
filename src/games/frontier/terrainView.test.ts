import test from'node:test';import assert from'node:assert/strict';import{Raycaster,Vector3,Box3}from'three';import{riverBanks,CROSSING}from'./terrainView.ts';import{walkable,heightAt}from'./engine.ts';
test('fallback rock banks expose both gorge faces and stay outside playable ground',()=>{
 const banks=riverBanks();banks.updateMatrixWorld(true);const p=banks.geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);assert.ok(x>=3&&x<=9);if(x>3&&x<9&&Math.abs(z)>2)assert.equal(walkable({x,z}),false);}
 for(const z of[-20,-7,12])for(const sign of[-1,1]){const hit=new Raycaster(new Vector3(6,-1,z),new Vector3(sign,0,0)).intersectObject(banks)[0];assert.ok(hit);assert.ok(hit.point.x>3&&hit.point.x<9);}
 const box=new Box3().setFromObject(banks);assert.ok(box.min.y<CROSSING.water);assert.equal(CROSSING.deck,heightAt(6,0));assert.ok(CROSSING.deck-CROSSING.water>2.9);assert.equal(p.count/3,384);banks.geometry.dispose();banks.material.dispose();
});
