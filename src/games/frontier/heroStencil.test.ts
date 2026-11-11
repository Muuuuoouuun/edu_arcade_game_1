import test from 'node:test';
import assert from 'node:assert/strict';
import {AlwaysStencilFunc,BoxGeometry,Group,KeepStencilOp,Mesh,MeshBasicMaterial,ReplaceStencilOp} from 'three';
import {HERO_STENCIL_BIT,HeroStencilMask} from './heroStencil.ts';

test('visible hero surfaces mark only the reserved bit after scenery and restore their original state',()=>{
 const hero=new Group(),material=new MeshBasicMaterial(),mesh=new Mesh(new BoxGeometry(),material),second=new Mesh(new BoxGeometry(),material);
 mesh.renderOrder=-2;second.renderOrder=8;material.stencilRef=5;material.stencilWriteMask=12;
 const shadowMaterial=new MeshBasicMaterial({transparent:true,depthWrite:false}),shadow=new Mesh(new BoxGeometry(),shadowMaterial);hero.add(mesh,second,shadow);
 const original={stencilWrite:material.stencilWrite,stencilWriteMask:material.stencilWriteMask,stencilFunc:material.stencilFunc,stencilRef:material.stencilRef,stencilFuncMask:material.stencilFuncMask,stencilFail:material.stencilFail,stencilZFail:material.stencilZFail,stencilZPass:material.stencilZPass};
 const mask=new HeroStencilMask();mask.sync(hero,true);mask.sync(hero,true);
 assert.equal(mesh.renderOrder,1);assert.equal(second.renderOrder,8);assert.equal(shadow.renderOrder,0);assert.equal(shadowMaterial.stencilWrite,false);
 assert.equal(material.stencilWrite,true);assert.equal(material.stencilWriteMask,HERO_STENCIL_BIT);assert.equal(material.stencilFunc,AlwaysStencilFunc);assert.equal(material.stencilRef,HERO_STENCIL_BIT);assert.equal(material.stencilFuncMask,HERO_STENCIL_BIT);assert.equal(material.stencilFail,KeepStencilOp);assert.equal(material.stencilZFail,KeepStencilOp);assert.equal(material.stencilZPass,ReplaceStencilOp);
 mask.sync(hero,false);for(const [key,value]of Object.entries(original))assert.equal(material[key as keyof typeof original],value,key);assert.equal(mesh.renderOrder,-2);assert.equal(second.renderOrder,8);
 mask.dispose();mesh.geometry.dispose();second.geometry.dispose();shadow.geometry.dispose();material.dispose();shadowMaterial.dispose();
});

test('asynchronous hero replacement restores the old materials and marks the new model only while active',()=>{
 const hero=new Group(),oldMaterial=new MeshBasicMaterial(),oldMesh=new Mesh(new BoxGeometry(),oldMaterial);hero.add(oldMesh);
 const mask=new HeroStencilMask();mask.sync(hero,true);assert.equal(oldMaterial.stencilWrite,true);
 hero.clear();const newMaterial=new MeshBasicMaterial(),replacement=new Mesh(new BoxGeometry(),newMaterial);hero.add(replacement);mask.sync(hero,true);
 assert.equal(oldMaterial.stencilWrite,false);assert.equal(oldMesh.renderOrder,0);assert.equal(newMaterial.stencilWrite,true);assert.equal(replacement.renderOrder,1);
 mask.dispose();mask.dispose();assert.equal(newMaterial.stencilWrite,false);assert.equal(replacement.renderOrder,0);
 oldMesh.geometry.dispose();replacement.geometry.dispose();oldMaterial.dispose();newMaterial.dispose();
});
