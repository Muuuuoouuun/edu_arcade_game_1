"""Rebuild a reversible Kar detail prototype without touching the supplied source.

blender -b art-source/defense/model-bridge-20261110/blender/frontier-kar.blend --python tools/blender/detail_kar_frontier_20261111.py
"""
import bpy, math, json, struct, copy, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art-source/defense/kar-detail-20261111';OUT.mkdir(parents=True,exist_ok=True)
ORIGINAL=ROOT/'art-source/defense/model-bridge-20261110/models/frontier-kar-game.glb'
s=bpy.context.scene;s.frame_set(1);s.cycles.samples=16;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=384;s.render.resolution_y=384;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
def render(name):
 s.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
render('before.png')
mesh=bpy.data.objects['surface-war-hammer'];inv=mesh.matrix_local.inverted();nshaft=nhead=0
for v in mesh.data.vertices:
 p=mesh.matrix_local@v.co
 if abs(p.x)<.18 and abs(p.y)<.18 and -.68<p.z<1.15:
  p.x*=1.22;p.y*=1.22;nshaft+=1
 if abs(p.x)>.4 and .9<p.z<1.85:
  p.x*=1+0.12*min(1,(abs(p.x)-.4)/.2);nhead+=1
 v.co=inv@p
mesh.data.update()
assert nshaft and nhead,(nshaft,nhead)
# Keep the authorable parts in the saved copy aligned with the geometry adjustment.
for o in bpy.data.objects:
 n=o.name
 if not n.endswith('__editable'):continue
 if n.startswith(('Hammer / long ash haft','Hammer / wrapped grip','Hammer / brass pommel')):o.scale.x*=1.22;o.scale.y*=1.22
 if n.startswith(('Hammer / forged head','Hammer / steel end face')):o.scale.x*=1.12
 if n.startswith(('Hammer / steel end face','Hammer / brass binding','Hammer / corner bolt')):o.location.x*=1.12
render('after.png')
# Export exactly the original runtime collection, with unchanged pivots and rig nodes.
runtime=bpy.data.collections['Kar battlefield / joint surfaces'];bpy.ops.object.select_all(action='DESELECT')
for o in runtime.objects:o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['kar-barbarian']
basepath=OUT/'kar-detail-base.glb';bpy.ops.export_scene.gltf(filepath=str(basepath),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
def read(path):
 data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);off=20+n;length=struct.unpack_from('<I',data,off)[0];return doc,bytearray(data[off+8:off+8+length])
base,blob=read(basepath);old,oldbinary=read(ORIGINAL);byname={n['name']:i for i,n in enumerate(base['nodes']) if 'name' in n};base['animations']=[]
for sourceclip in old['animations']:
 clip=copy.deepcopy(sourceclip);mapping={}
 for sampler in clip['samplers']:
  for key in ('input','output'):
   i=sampler[key]
   if i not in mapping:
    a=dict(old['accessors'][i]);view=old['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]*4;assert a['componentType']==5126
    offset=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',size);payload=b''.join(oldbinary[offset+j*stride:offset+j*stride+size] for j in range(a['count']))
    while len(blob)%4:blob.append(0)
    a['bufferView']=len(base['bufferViews']);a.pop('byteOffset',None);base['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(payload)});blob.extend(payload);mapping[i]=len(base['accessors']);base['accessors'].append(a)
   sampler[key]=mapping[i]
 for channel in clip['channels']:
  name=old['nodes'][channel['target']['node']]['name'];assert name in byname,name;channel['target']['node']=byname[name]
 base['animations'].append(clip)
base['buffers'][0]['byteLength']=len(blob);j=json.dumps(base,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
dest=OUT/'kar-detail.glb';dest.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob);basepath.unlink()
assert [a['name'] for a in old['animations']]==[a['name'] for a in base['animations']]
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'kar-detail.blend'))
meta={'source_commit':'bec804114a26a85a800379058463f4e9fd0bf2cf','shaft_vertices':nshaft,'head_vertices':nhead,'animations':[a['name'] for a in base['animations']],'meshes':len(base['meshes']),'primitives':sum(len(x['primitives']) for x in base['meshes']),'outputs':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [dest,OUT/'kar-detail.blend',OUT/'before.png',OUT/'after.png']}}
(OUT/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n');print('KAR_DETAIL_SUCCESS',json.dumps(meta),flush=True)
