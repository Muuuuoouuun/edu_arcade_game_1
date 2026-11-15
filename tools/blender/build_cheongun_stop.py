"""Regenerate Cheongun's grounded stop from the editable eight-phase walk source."""
import bpy, math, json, hashlib, argparse, sys, subprocess, shutil, struct
from pathlib import Path
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--samples',type=int,default=48)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/cheongun-stop-frames';FRAMES.mkdir(exist_ok=True)
source=ROOT/'art-source/defense/cheongun-tao-walk.blend'
cast_source=ROOT/'art-source/defense/cheongun-tao.blend'
bpy.ops.wm.open_mainfile(filepath=str(cast_source));scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
names=[o.name for o in bpy.data.collections['Cheongun tao / editable parts'].objects if o.animation_data and o.animation_data.action]
neutral={n:(bpy.data.objects[n].location.copy(),bpy.data.objects[n].rotation_euler.copy(),bpy.data.objects[n].scale.copy()) for n in names}
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;scene.cycles.samples=args.samples;scene.render.threads_mode='FIXED';scene.render.threads=4
ROOT_OBJ=bpy.data.objects['cheongun-tao'];COL=ROOT_OBJ.users_collection[0];camera=scene.camera
joints=[bpy.data.objects[n] for n in names];legs=[bpy.data.objects[n+'-leg'] for n in ['right','left']];body=bpy.data.objects['body']
starts=[]
for i in range(8):
 scene.frame_set(1+i*10);bpy.context.view_layer.update();starts.append({o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints})
for o in joints:o.animation_data_clear()
scene.render.fps=100;scene.frame_start=1;scene.frame_end=25

def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def first_leg(entry):
 return max(range(2),key=lambda n:(starts[entry][legs[n].name][0].z,-starts[entry][legs[n].name][0].y))
def pose(entry,t):
 q=smooth(t/.24);first=first_leg(entry)
 for o in joints:
  p,r,scale=starts[entry][o.name];np,nr,ns=neutral[o.name]
  blend=smooth((t-.035)/.205) if o.name in ['back-robe','hair','seal-flap'] else smooth(t/.16) if o.name in ['body','head'] else q
  o.location=p.lerp(np,blend);o.rotation_euler=tuple(a+(b-a)*blend for a,b in zip(r,nr));o.scale=scale.lerp(ns,blend)
 # The support leg stays still until the other boot has reached its neutral sole.
 for n,leg in enumerate(legs):
  local=max(0,min(1,(t-(0 if n==first else .12))/.12));p=starts[entry][leg.name][0];np=neutral[leg.name][0]
  leg.location=p.lerp(np,smooth(local));leg.location.z+=.10*math.sin(math.pi*local)
 # Shift weight toward the planted boot, then let robe, hair and paper settle behind the trunk.
 weight_arc=math.sin(math.pi*min(1,t/.16))
 body.location.x+=(-1 if first==1 else 1)*.025*weight_arc
 body.location.z-=.018*weight_arc
 if 0<t<.24:
  # Preserve both sleeve chains while their endpoints settle.
  for side in ['seal','brush']:
   upper,fore,hand=[bpy.data.objects[side+suffix] for suffix in ['-upper-arm','-forearm','-hand']]
   shoulder,elbow,palm=upper.location.copy(),fore.location.copy(),hand.location.copy()
   for joint,a,b in [(upper,shoulder,elbow),(fore,elbow,palm)]:
    delta=b-a;joint.location=a;joint.rotation_euler=delta.to_track_quat('Z','Y').to_euler();joint.scale=(1,1,delta.length)
  bpy.data.objects['back-robe'].rotation_euler.x+=.025*math.sin(math.pi*q)
  bpy.data.objects['seal-flap'].rotation_euler.x+=.045*math.sin(math.pi*q)
 bpy.context.view_layer.update()

sole_objects=[o for o in COL.objects if o.type=='MESH' and 'boot / sole' in o.name.lower()]
assert len(sole_objects)==2
actions=[];checks=[]
for entry in range(8):
 min_sole=float('inf');max_support_drift=0
 for o in joints:o.animation_data_clear()
 for frame in range(1,26):
  pose(entry,(frame-1)/100)
  support=legs[1-first_leg(entry)] if frame<=13 else legs[first_leg(entry)]
  expected=starts[entry][support.name][0] if frame<=13 else neutral[support.name][0]
  max_support_drift=max(max_support_drift,(support.location-expected).length)
  assert max_support_drift<1e-6,(entry,frame,'support slid')
  graph=bpy.context.evaluated_depsgraph_get()
  for sole in sole_objects:
   evaluated=sole.evaluated_get(graph);bottom=min((evaluated.matrix_world@Vector(v)).z for v in evaluated.bound_box);min_sole=min(min_sole,bottom);assert bottom>=0,(entry,frame,'sole below floor')
  for o in joints:
   for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
 checks.append({'entry':entry,'first_leg':legs[first_leg(entry)].name,'support_stationary':True,'frames_checked':25,'min_sole_z':min_sole,'max_support_drift':max_support_drift})
 entry_actions=[]
 for o in joints:
  a=o.animation_data.action;a.name=f'Cheongun stop {entry} / {o.name}';a.use_fake_user=True;entry_actions.append(a)
  for curve in a.fcurves:
   for k in curve.keyframe_points:k.interpolation='LINEAR'
 actions.append(entry_actions)
def activate(entry):
 for o,a in zip(joints,actions[entry]):o.animation_data_create();o.animation_data.action=a
 scene.frame_set(1);bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()

def export_runtime():
 scene.frame_set(1);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
 original=list(COL.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original}
 export_col=bpy.data.collections.new('Runtime export temporary');scene.collection.children.link(export_col);clones={}
 for o in original:o.name=names[o]+'__editable'
 try:
  for o in original:
   if o.type=='MESH':
    d=bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph);c=bpy.data.objects.new(names[o],d)
   else:c=o.copy();c.name=names[o]
   export_col.objects.link(c);clones[o]=c
  for o,c in clones.items():c.parent=clones.get(o.parent);c.matrix_world=matrices[o]
  bpy.context.view_layer.update();batches={}
  for c in clones.values():
   if c.type=='MESH':batches.setdefault((c.parent.name,tuple(m.name for m in c.data.materials)),[]).append(c)
  for i,objects in enumerate(batches.values()):
   bpy.ops.object.select_all(action='DESELECT')
   for o in objects:o.select_set(True)
   bpy.context.view_layer.objects.active=objects[0]
   if len(objects)>1:bpy.ops.object.join()
   objects[0].name=f'Cheongun surface {i+1:02}'
  meshes=[o for o in export_col.objects if o.type=='MESH'];tris=0
  for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
  bpy.ops.object.select_all(action='DESELECT')
  for o in export_col.objects:o.select_set(True)
  bpy.context.view_layer.objects.active=clones[ROOT_OBJ]
  bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=clip_name,export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
  return {'mesh_objects':len(meshes),'triangles':tris,'materials':len({m.name for o in meshes for m in o.data.materials})}
 finally:
  for o in list(export_col.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(export_col)
  for o,name in names.items():o.name=name


manifest={'generator':'tools/blender/build_cheongun_stop.py','command':'npm run models:cheongun-stop','source_walk_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_cast_sha256':hashlib.sha256(cast_source.read_bytes()).hexdigest(),'reference':'art-source/defense/concepts/2026-10-29/motion/talisman-cast-keyposes.png','frame':{'width':384,'height':384,'ground':[192,330],'orthographic_scale':6.8},'delivery_frame':{'width':192,'height':192,'ground':[96,165],'columns':16,'rows':1},'duration_seconds':.24,'samples_seconds':[.08,.20],'entry_checks':checks,'files':[],'clips':[],'directions':[],'fps':100,'render':{'engine':'Cycles CPU','samples':args.samples},'display_scale':1.2*6.8/5.8,'reference_sha256':hashlib.sha256((ROOT/'art-source/defense/concepts/2026-10-29/motion/talisman-cast-keyposes.png').read_bytes()).hexdigest(),'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if args.check:
 print('CHEONGUN_STOP_CHECK_PASS',json.dumps(checks));sys.exit(0)
# Export each action set separately, then share the geometry and merge animation accessors.
exports=[]
for entry in range(8):
 activate(entry);ROOT_OBJ.rotation_euler.z=0;asset_id=f'cheongun-stop-{entry}';clip_name=asset_id
 stats=export_runtime();exports.append(OUT/f'{asset_id}.glb');manifest['clips'].append({'name':clip_name,'entry':entry,'duration':.24})
def read_glb(path):
 data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);off=20+length;blen=struct.unpack_from('<I',data,off)[0];return doc,bytearray(data[off+8:off+8+blen])
base,blob=read_glb(exports[0]);names={n['name']:i for i,n in enumerate(base['nodes']) if 'name' in n}
for path in exports[1:]:
 doc,binary=read_glb(path);mapping={};clip=doc['animations'][0]
 for sampler in clip['samplers']:
  for key in ['input','output']:
   old=sampler[key]
   if old not in mapping:
    a=dict(doc['accessors'][old]);v=doc['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]*4;assert a['componentType']==5126
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);payload=b''.join(binary[offset+i*stride:offset+i*stride+size] for i in range(a['count']))
    while len(blob)%4:blob.append(0)
    a['bufferView']=len(base['bufferViews']);a.pop('byteOffset',None);base['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(payload)});blob.extend(payload);mapping[old]=len(base['accessors']);base['accessors'].append(a)
   sampler[key]=mapping[old]
 for channel in clip['channels']:channel['target']['node']=names[doc['nodes'][channel['target']['node']]['name']]
 base['animations'].append(clip)
base['buffers'][0]['byteLength']=len(blob);j=json.dumps(base,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
dest=OUT/'cheongun-stop.glb';dest.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
for path in exports:path.unlink()
manifest['runtime']=stats
for direction in range(8):
 angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y)
 inputs=[];direction_meta={'direction':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[]}
 for entry in range(8):
  activate(entry)
  for sample,frame in enumerate([9,21]):
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(direction,entry,sample,bounds)
   direction_meta['poses'].append({'entry':entry,'sample':sample,'frame':frame,'bounds':bounds})
   path=FRAMES/f'cheongun-stop-{direction}-{entry}-{sample}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);inputs+=['-i',str(path)]
 dst=OUT/f'cheongun-stop-{direction}-atlas.webp'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=16,scale=3072:192:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(dst)],check=True)
 manifest['directions'].append(direction_meta)
 print('DIRECTION_COMPLETE',direction,flush=True)
activate(0);ROOT_OBJ.rotation_euler.z=0;scene['regeneration_command']='npm run models:cheongun-stop';scene['entry_action_selection']='Assign Cheongun stop N / JOINT to each of the 16 named joint objects; N=0..7.';bpy.context.preferences.filepaths.save_version=0
blend=ROOT/'art-source/defense/cheongun-stop.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));shutil.copyfile(FRAMES/'cheongun-stop-1-0-0.png',OUT/'cheongun-stop.png')
for path in [blend,dest,OUT/'cheongun-stop.png',*sorted(FRAMES.glob('*.png')),*sorted(OUT.glob('cheongun-stop-*-atlas.webp'))]:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'cheongun-stop.json').write_text(json.dumps(manifest,indent=2)+'\n');print('CHEONGUN_STOP_BAKE_PASS',flush=True)
