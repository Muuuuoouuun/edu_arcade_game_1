// Preserve authored originals. Copy the three Lv1 towers and append only Ian's
// walk animation buffers to the cast mesh, binding targets by unique node name.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url),output=new URL('public/defense/models/battle/',root);
const check=process.argv.includes('--check'),sha=buffer=>createHash('sha256').update(buffer).digest('hex');
function parse(buffer){
 assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
 let document,binary;for(let offset=12;offset<buffer.length;){const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4),chunk=buffer.subarray(offset+8,offset+8+length);if(type===0x4e4f534a)document=JSON.parse(chunk.toString());else if(type===0x004e4942)binary=chunk;offset+=8+length;}
 assert.ok(document&&binary);assert.equal(document.buffers.length,1);assert.ok(!document.buffers[0].uri);return {document,binary};
}
function combineCastAndWalk(cast,walk){
 const {document:target,binary:baseBinary}=parse(cast),{document:source,binary:walkBinary}=parse(walk);
 const nodeNames=new Map(target.nodes.map((node,index)=>[node.name,index]));assert.equal(nodeNames.size,target.nodes.length,'target node names must be unique');
 const parents=doc=>new Map(doc.nodes.flatMap((node,index)=>(node.children??[]).map(child=>[child,index])));
 const sourceParents=parents(source),targetParents=parents(target),chunks=[baseBinary.subarray(0,target.buffers[0].byteLength)];let length=chunks[0].length;
 const accessors=new Map(),views=new Map();
 const appendAccessor=index=>{
  if(accessors.has(index))return accessors.get(index);
  const accessor=structuredClone(source.accessors[index]);assert.ok(!accessor.sparse&&accessor.bufferView!==undefined);
  if(!views.has(accessor.bufferView)){
   const view=structuredClone(source.bufferViews[accessor.bufferView]);assert.equal(view.buffer,0);
   const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
   const data=walkBinary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
   assert.equal(data.length,view.byteLength);chunks.push(data);view.byteOffset=length;length+=data.length;
   views.set(accessor.bufferView,target.bufferViews.length);target.bufferViews.push(view);
  }
  accessor.bufferView=views.get(accessor.bufferView);const result=target.accessors.length;target.accessors.push(accessor);accessors.set(index,result);return result;
 };
 assert.deepEqual(source.animations.map(clip=>clip.name),['ian-walk']);
 for(const animation of source.animations){
  const clip=structuredClone(animation);
  for(const channel of clip.channels){
   const original=channel.target.node,name=source.nodes[original].name,destination=nodeNames.get(name);assert.ok(destination!==undefined,`missing ${name}`);
   assert.equal(source.nodes[sourceParents.get(original)]?.name,target.nodes[targetParents.get(destination)]?.name,`different parent: ${name}`);
   channel.target.node=destination;
  }
  for(const sampler of clip.samplers){sampler.input=appendAccessor(sampler.input);sampler.output=appendAccessor(sampler.output);}
  target.animations.push(clip);
 }
 target.buffers[0].byteLength=length;
 const json=Buffer.from(JSON.stringify(target)),jsonPadding=(4-json.length%4)%4,binPadding=(4-length%4)%4;
 const jsonChunk=Buffer.alloc(8),binChunk=Buffer.alloc(8),header=Buffer.alloc(12);
 jsonChunk.writeUInt32LE(json.length+jsonPadding,0);jsonChunk.writeUInt32LE(0x4e4f534a,4);
 binChunk.writeUInt32LE(length+binPadding,0);binChunk.writeUInt32LE(0x004e4942,4);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+jsonPadding+8+length+binPadding,8);
 return Buffer.concat([header,jsonChunk,json,Buffer.alloc(jsonPadding,32),binChunk,...chunks,Buffer.alloc(binPadding)]);
}

const definitions=[
 {id:'ian',source:'ian-mage.glb',walk:'ian-mage-walk.glb',attack:{duration:.33,contact:.15}},
 {id:'base-crossbow',source:'base-crossbow-action.glb',attack:{duration:.4,contact:.1}},
 {id:'base-cannon',source:'base-cannon-action.glb',attack:{duration:.52,contact:.28}},
 {id:'base-magic',source:'base-magic-action.glb',attack:{duration:.39,contact:.15}},
];
const manifest=JSON.parse(await readFile(new URL('manifest.json',output),'utf8'));
for(const definition of definitions){
 const sourcePath=`public/defense/models/${definition.source}`,source=await readFile(new URL(sourcePath,root));
 const sources=[{file:sourcePath,sha256:sha(source)}];let buffer=source;
 if(definition.walk){const file=`public/defense/models/${definition.walk}`,walk=await readFile(new URL(file,root));sources.push({file,sha256:sha(walk)});buffer=combineCastAndWalk(source,walk);}
 const {document}=parse(buffer),entry={id:definition.id,file:`${definition.id}.glb`,source:sourcePath,source_files:sources,provenance:'origin/main ae5cffd9 (2026-11-12)',generator:'tools/build-battle-starter-models.mjs',bytes:buffer.length,sha256:sha(buffer),animations:document.animations.map(clip=>clip.name),attack_timing:definition.attack,status:'campaign_runtime_starter_models'};
 const index=manifest.models.findIndex(model=>model.id===entry.id);
 if(check){assert.deepEqual(await readFile(new URL(entry.file,output)),buffer);assert.deepEqual(manifest.models[index],entry);}
 else{await writeFile(new URL(entry.file,output),buffer);if(index<0)manifest.models.push(entry);else manifest.models[index]=entry;}
 console.log(`${check?'Verified':'Built'} ${entry.file}: ${entry.bytes} bytes, ${entry.animations.join(', ')}`);
}
if(!check)await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
