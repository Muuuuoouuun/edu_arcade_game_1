"""Kar battlefield geometry: editable source, rigid-joint batching and original motions.
Regenerate with npm run models:frontier-kar (Blender 4.3+, ffmpeg).
"""
import bpy, hashlib, json, struct, subprocess, copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/defense/models'; ART=ROOT/'art-source/defense/frontier-kar';ART.mkdir(exist_ok=True)
SOURCE=ROOT/'art-source/defense/kar-barbarian-walk.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
col=bpy.data.collections['Kar winter warrior / editable parts'];scene.frame_set(1);bpy.context.view_layer.update()
original=list(col.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original}
scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=scene.render.resolution_y=384
scene.render.filepath=str(ART/'before-walk.png');bpy.ops.render.render(write_still=True)
# The battlefield has direct/ambient lights without an environment map. A half-metal
# finish keeps the brass emblem and pale striking faces readable at mobile scale.
# Preserve every authoring part. Runtime surfaces have evaluated bevels, vertex colors, and two materials.
graph=bpy.context.evaluated_depsgraph_get();runtime=bpy.data.collections.new('Kar battlefield / joint surfaces');scene.collection.children.link(runtime);nodes={}
for o in original:o.name=names[o]+'__editable'
for o in original:
 if o.type!='MESH':
  c=o.copy();c.name=names[o];runtime.objects.link(c);nodes[o]=c
for o,c in nodes.items():c.parent=nodes.get(o.parent);c.matrix_world=matrices[o]
bpy.context.view_layer.update()
paints=[]
for label,metal,rough in [('organic',0,.83),('forged metal',.5,.4)]:
 m=bpy.data.materials.new('Kar battlefield / '+label);m.use_nodes=True;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 v=m.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';m.node_tree.links.new(v.outputs['Color'],n.inputs['Base Color']);paints.append(m)
batches={}
for o in original:
 if o.type!='MESH':continue
 owner=o.parent
 while owner not in nodes:owner=owner.parent
 mesh=bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph);c=bpy.data.objects.new('surface-'+names[o],mesh);runtime.objects.link(c);c.parent=nodes[owner];c.matrix_world=matrices[o]
 bpy.ops.object.select_all(action='DESELECT');c.select_set(True);bpy.context.view_layer.objects.active=c
 # Keep silhouettes of boots, hands, hammer faces and solar emblem; simplify dense curved detail only.
 if len(mesh.polygons)>48 and 'sole' not in names[o].lower():
  mod=c.modifiers.new('Battlefield curved detail','DECIMATE');mod.ratio=.4;bpy.ops.object.modifier_apply(modifier=mod.name)
 colors=c.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');groups=[]
 for face in c.data.polygons:
  n=c.data.materials[face.material_index].node_tree.nodes['Principled BSDF'];color=tuple(n.inputs['Base Color'].default_value);groups.append(int(n.inputs['Metallic'].default_value>.5))
  for i in face.loop_indices:colors.data[i].color=color
 c.data.materials.clear()
 for m in paints:c.data.materials.append(m)
 for face,group in zip(c.data.polygons,groups):face.material_index=group
 batches.setdefault(owner,[]).append(c)
bpy.context.view_layer.update()
for parent,objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name='surface-'+names[parent]
# Export rest hierarchy only: merge the shipping animations byte-for-byte by node name below.
bpy.ops.object.select_all(action='DESELECT')
for o in runtime.objects:o.select_set(True)
bpy.context.view_layer.objects.active=nodes[next(o for o in nodes if names[o]=='kar-barbarian')]
DEST=OUT/'frontier-kar-game.glb'
bpy.ops.export_scene.gltf(filepath=str(DEST),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
def read_glb(path):
 data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);off=20+length;blen=struct.unpack_from('<I',data,off)[0];return doc,bytearray(data[off+8:off+8+blen])
base,blob=read_glb(DEST);by_name={n['name']:i for i,n in enumerate(base['nodes']) if 'name'in n};base['animations']=[]
inputs=[OUT/(n+'.glb') for n in ['kar-barbarian-walk','kar-barbarian','kar-entry','kar-reset']]
for path in inputs:
 doc,binary=read_glb(path)
 for original_clip in doc['animations']:
  clip=copy.deepcopy(original_clip);mapping={}
  for sampler in clip['samplers']:
   for key in ['input','output']:
    old=sampler[key]
    if old not in mapping:
     a=dict(doc['accessors'][old]);v=doc['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]*4;assert a['componentType']==5126
     offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);payload=b''.join(binary[offset+i*stride:offset+i*stride+size] for i in range(a['count']))
     while len(blob)%4:blob.append(0)
     a['bufferView']=len(base['bufferViews']);a.pop('byteOffset',None);base['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(payload)});blob.extend(payload);mapping[old]=len(base['accessors']);base['accessors'].append(a)
    sampler[key]=mapping[old]
  for channel in clip['channels']:channel['target']['node']=by_name[doc['nodes'][channel['target']['node']]['name']]
  base['animations'].append(clip)
base['buffers'][0]['byteLength']=len(blob);j=json.dumps(base,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
DEST.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
# The .blend contains authored parts, simplified geometry and all editable actions.
for source in ['kar-barbarian.blend','kar-entry.blend','kar-reset.blend']:
 with bpy.data.libraries.load(str(ROOT/'art-source/defense'/source),link=False) as (src,dst):dst.actions=src.actions
 for action in dst.actions:action.use_fake_user=True
for o in original:o.hide_render=True;o.hide_set(True)
animated={names[o]:c for o,c in nodes.items() if c.animation_data and c.animation_data.action};walk={n:o.animation_data.action for n,o in animated.items()}
def render(name,frame):
 scene.frame_set(frame);bpy.context.view_layer.update();scene.render.filepath=str(ART/(name+'.png'));bpy.ops.render.render(write_still=True)
render('walk',1);render('stride',21)
for n,o in animated.items():
 action=bpy.data.actions.get('Kar entry 0 / '+n);assert action,n;o.animation_data.action=action
scene.frame_end=57;render('prepare',20);render('contact',29)
for n,o in animated.items():
 action=bpy.data.actions.get('Kar reset 0 / '+n);assert action,n;o.animation_data.action=action
render('recover',8);render('ready',15)
for n,o in animated.items():o.animation_data.action=walk[n]
scene.frame_end=81;scene.frame_set(1);scene['regeneration_command']='npm run models:frontier-kar';scene['authoring']='Original 208 parts in editable collection; runtime collection uses same rigid joints. Assign Kar entry N / joint or Kar reset 0 / joint actions for attack/recovery editing.'
bpy.context.preferences.filepaths.save_version=0;BLEND=ROOT/'art-source/defense/frontier-kar.blend';bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
(OUT/'frontier-kar-game.png').write_bytes((ART/'walk.png').read_bytes())
args=sum((['-i',str(ART/(n+'.png'))] for n in ['walk','stride','prepare','contact','recover','ready']),[])
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*args,'-filter_complex','hstack=inputs=6','-frames:v','1','-c:v','libwebp','-quality','90',str(OUT/'frontier-kar-atlas.webp')],check=True)
primitives=[p for m in base['meshes'] for p in m['primitives']];tris=sum(base['accessors'][p['indices']]['count']//3 for p in primitives)
meta={'generator':'tools/blender/build_frontier_kar.py','command':'npm run models:frontier-kar','reference':'art-source/defense/atlases/melee-motion.png','runtime':{'mesh_objects':len(base['meshes']),'draws':len(primitives),'triangles':tris,'materials':len(base['materials']),'clips':[a['name'] for a in base['animations']]},'editable_meshes':sum(o.type=='MESH' for o in original),'frame':{'width':384,'height':384,'camera':list(scene.camera.location),'ortho_scale':scene.camera.data.ortho_scale,'poses':['walk 0s','walk .2s','entry0 .19s','entry0 .28s','reset .07s','reset .14s']},'files':[]}
assert len(primitives)<=24 and tris<=10000,meta['runtime']
for p in [SOURCE,ROOT/'art-source/defense/kar-barbarian.blend',ROOT/'art-source/defense/kar-entry.blend',ROOT/'art-source/defense/kar-reset.blend',*inputs,ROOT/meta['reference'],ROOT/meta['generator'],BLEND,DEST,*sorted(ART.glob('*.png')),OUT/'frontier-kar-game.png',OUT/'frontier-kar-atlas.webp']:
 meta['files'].append({'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'frontier-kar.json').write_text(json.dumps(meta,indent=2)+'\n');print('COMPLETE',meta['runtime'],flush=True)
