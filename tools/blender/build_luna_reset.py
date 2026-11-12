"""Settle Luna's stationary spell into ready stance with an arcing staff hand and trailing cloth.
Regenerate: npm run models:luna-reset. Existing cast/entry/walk assets stay intact.
"""
import bpy,math,json,hashlib,argparse,sys,subprocess,shutil,struct
from pathlib import Path
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--samples',type=int,default=64)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/luna-reset-frames';FRAMES.mkdir(exist_ok=True)
cast_source=ROOT/'art-source/defense/luna-druid.blend'
bpy.ops.wm.open_mainfile(filepath=str(cast_source));scene=bpy.context.scene
names=[o.name for o in bpy.data.collections['Luna tao / editable parts'].objects if o.animation_data and o.animation_data.action]
def transforms():return {name:(bpy.data.objects[name].location.copy(),bpy.data.objects[name].rotation_euler.copy(),bpy.data.objects[name].scale.copy()) for name in names}
scene.frame_set(1);bpy.context.view_layer.update();targets=[transforms()]
scene.frame_set(16);bpy.context.view_layer.update();start=transforms()
scene.cycles.samples=args.samples;scene.render.threads_mode='FIXED';scene.render.threads=4
ROOT_OBJ=bpy.data.objects['luna-druid'];COL=ROOT_OBJ.users_collection[0];camera=scene.camera
joints=[bpy.data.objects[name] for name in names];legs=[bpy.data.objects[n+'-leg'] for n in ['right','left']]
for o in joints:o.animation_data_clear()
scene.render.fps=100;scene.frame_start=1;scene.frame_end=13

def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def pose(entry,frame):
 t=(frame-1)/100;target=targets[0]
 for o in joints:
  delay=.015 if o.name in ['staff-hand','spell-hand','staff-upper-arm','spell-upper-arm','staff-forearm','spell-forearm','living-staff'] else .025 if o.name in ['leaf-cape','flowing-hair','right-fox-ear','left-fox-ear','right-robe-hem','left-robe-hem'] else 0
  duration=.085 if o.name in ['body','head'] else .12-delay
  q=smooth((t-delay)/duration)
  p,r,s=start[o.name];np,nr,ns=target[o.name]
  o.location=p.lerp(np,q);o.rotation_euler=tuple(a+(b-a)*q for a,b in zip(r,nr));o.scale=s.lerp(ns,q)
 # Keep both soles planted; the staff hand folds back on a shallow outward arc.
 arc=math.sin(math.pi*smooth(t/.12))
 bpy.data.objects['body'].location.z-=.012*arc
 if 0<t<.12:
  bpy.data.objects['staff-hand'].location+=Vector((-.045*arc,0,.045*arc))
  bpy.data.objects['spell-hand'].location.z+=.025*arc
  for side in ['staff','spell']:
   upper,fore,hand=[bpy.data.objects[side+suffix] for suffix in ['-upper-arm','-forearm','-hand']]
   shoulder,elbow,palm=upper.location.copy(),fore.location.copy(),hand.location.copy()
   for joint,a,b in [(upper,shoulder,elbow),(fore,elbow,palm)]:
    delta=b-a;joint.location=a;joint.rotation_euler=delta.to_track_quat('Z','Y').to_euler();joint.scale=(1,1,delta.length)
 bpy.context.view_layer.update()
sole_objects=[o for o in COL.objects if o.type=='MESH' and 'boot / sole' in o.name.lower()];assert len(sole_objects)==2
actions=[];checks=[]
for entry in range(1):
 for o in joints:o.animation_data_clear()
 min_sole=float('inf');start_error=0;end_error=0
 for frame in range(1,14):
  pose(entry,frame)
  if frame in [1,13]:
   expected=start if frame==1 else targets[entry]
   for o in joints:
    error=max(abs(a-b) for v,w in zip((o.location,o.rotation_euler,o.scale),expected[o.name]) for a,b in zip(v,w))
    if frame==1:start_error=max(start_error,error)
    else:end_error=max(end_error,error)
   assert max(start_error,end_error)<1e-6
  graph=bpy.context.evaluated_depsgraph_get()
  for sole in sole_objects:
   ev=sole.evaluated_get(graph);bottom=min((ev.matrix_world@Vector(v)).z for v in ev.bound_box);min_sole=min(min_sole,bottom);assert bottom>=0
  for o in joints:
   for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
 checks.append({'target':'ready','frames':13,'min_sole_z':min_sole,'strike_start_error':start_error,'ready_end_error':end_error})
 entry_actions=[]
 for o in joints:
  a=o.animation_data.action;a.name=f'Luna reset {entry} / {o.name}';a.use_fake_user=True;entry_actions.append(a)
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
   objects[0].name=f'Luna surface {i+1:02}'
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

manifest={'generator':'tools/blender/build_luna_reset.py','command':'npm run models:luna-reset','source_cast_sha256':hashlib.sha256(cast_source.read_bytes()).hexdigest(),'reference':'art-source/defense/atlases/ranged-motion.png','frame':{'width':384,'height':384,'ground':[192,330],'orthographic_scale':6.8},'delivery_frame':{'width':192,'height':192,'ground':[96,165],'columns':2,'rows':1},'duration_seconds':.12,'battle_start_seconds':.21,'battle_end_seconds':.33,'followthrough_delay_seconds':{'hands_staff':.015,'cape_hair_ears_hems':.025},'body_settle_seconds':.085,'hit_at':.15,'samples_seconds':[.04,.10],'return_checks':checks,'files':[],'clips':[],'directions':[],'fps':100,'render':{'engine':'Cycles CPU','samples':args.samples},'display_scale':1.2*6.8/5.8,'reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if args.check:
 print('LUNA_RESET_CHECK_PASS',json.dumps(checks));sys.exit(0)
activate(0);ROOT_OBJ.rotation_euler.z=0;asset_id='luna-reset';clip_name='luna-reset-0'
stats=export_runtime();dest=OUT/'luna-reset.glb';manifest['clips'].append({'name':clip_name,'duration':.12})
manifest['runtime']=stats
for direction in range(8):
 angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y)
 inputs=[];direction_meta={'direction':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[]}
 for entry in range(1):
  activate(entry)
  for sample,frame in enumerate([5,11]):
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(direction,entry,sample,bounds)
   direction_meta['poses'].append({'entry':entry,'sample':sample,'frame':frame,'bounds':bounds})
   path=FRAMES/f'luna-reset-{direction}-{entry}-{sample}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);inputs+=['-i',str(path)]
 dst=OUT/f'luna-reset-{direction}-atlas.webp'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=2,scale=384:192:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(dst)],check=True)
 manifest['directions'].append(direction_meta)
 print('DIRECTION_COMPLETE',direction,flush=True)
activate(0);ROOT_OBJ.rotation_euler.z=0;scene['regeneration_command']='npm run models:luna-reset';scene['entry_action_selection']='Assign Luna reset N / JOINT to all named joint objects; N=0.';bpy.context.preferences.filepaths.save_version=0
blend=ROOT/'art-source/defense/luna-reset.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));shutil.copyfile(FRAMES/'luna-reset-1-0-1.png',OUT/'luna-reset.png')
for path in [blend,dest,OUT/'luna-reset.png',*sorted(FRAMES.glob('*.png')),*sorted(OUT.glob('luna-reset-*-atlas.webp'))]:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'luna-reset.json').write_text(json.dumps(manifest,indent=2)+'\n');print('LUNA_RESET_BAKE_PASS',flush=True)
