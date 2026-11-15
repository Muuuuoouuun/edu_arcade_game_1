"""Animate Luna's immediate raised-staff ultimate and return to the authored ready stance.
Regenerate: npm run models:luna-ultimate. Existing cast/entry/walk assets stay intact.
"""
import bpy,math,json,hashlib,argparse,sys,subprocess,shutil,struct
from pathlib import Path
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--samples',type=int,default=48)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/luna-ultimate-frames';FRAMES.mkdir(exist_ok=True)
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
scene.render.fps=100;scene.frame_start=1;scene.frame_end=51

def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def pose(entry,frame):
 # Skill damage is instantaneous: the raised release is visible from frame 1.
 # Arms then return to the exact existing ready pose; feet never leave the floor.
 t=(frame-1)/100;q=smooth((t-.12)/.38);target=targets[0]
 for o in joints:
  p,r,scale=target[o.name];o.location=p.copy();o.rotation_euler=r.copy();o.scale=scale.copy()
 # The skill deals damage immediately: both hands start raised, then return
 # to the exact ready stance. The living staff remains a child of its real hand.
 for side,raised_hand,raised_elbow in [
  ('staff',Vector((-.92,.35,1.55)),Vector((-.73,.20,1.30))),
  ('spell',Vector((.94,.30,1.35)),Vector((.74,.16,1.15)))]:
  upper,fore,hand=[bpy.data.objects[side+suffix] for suffix in ['-upper-arm','-forearm','-hand']]
  shoulder=target[upper.name][0].copy();elbow=raised_elbow.lerp(target[fore.name][0],q);palm=raised_hand.lerp(target[hand.name][0],q)
  if q<1:
   hand.location=palm
   for joint,a,b in [(upper,shoulder,elbow),(fore,elbow,palm)]:
    delta=b-a;joint.location=a;joint.rotation_euler=delta.to_track_quat('Z','Y').to_euler();joint.scale=(1,1,delta.length)
 bpy.data.objects['living-staff'].rotation_euler.x+=.10*(1-q)
 bpy.data.objects['leaf-cape'].rotation_euler.x+=.05*(1-q)
 bpy.data.objects['flowing-hair'].rotation_euler.x-=.04*(1-q)
 bpy.context.view_layer.update()
sole_objects=[o for o in COL.objects if o.type=='MESH' and 'boot / sole' in o.name.lower()];assert len(sole_objects)==2
actions=[];checks=[]
for entry in range(1):
 for o in joints:o.animation_data_clear()
 min_sole=float('inf');end_error=0
 for frame in range(1,52):
  pose(entry,frame)
  if frame==51:
   for o in joints:
    p,r,scale=targets[0][o.name]
    end_error=max(end_error,max(abs(a-b) for v,w in zip((o.location,o.rotation_euler,o.scale),(p,r,scale)) for a,b in zip(v,w)))
   assert end_error<1e-5,end_error
  graph=bpy.context.evaluated_depsgraph_get()
  for sole in sole_objects:
   ev=sole.evaluated_get(graph);bottom=min((ev.matrix_world@Vector(v)).z for v in ev.bound_box);min_sole=min(min_sole,bottom);assert bottom>=0
  for o in joints:
   for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
 checks.append({'frames':51,'min_sole_z':min_sole,'ready_end_error':end_error})
 entry_actions=[]
 for o in joints:
  a=o.animation_data.action;a.name=f'Luna ultimate {entry} / {o.name}';a.use_fake_user=True;entry_actions.append(a)
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
   objects[0].name=f'Luna ultimate surface {i+1:02}'
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

manifest={'generator':'tools/blender/build_luna_ultimate.py','command':'npm run models:luna-ultimate','source_cast_sha256':hashlib.sha256(cast_source.read_bytes()).hexdigest(),'reference':'art-source/defense/atlases/ranged-motion.png','frame':{'width':384,'height':384,'ground':[192,330],'orthographic_scale':6.8},'delivery_frame':{'width':192,'height':192,'ground':[96,165],'columns':3,'rows':1},'duration_seconds':.5,'samples_seconds':[.06,.26,.45],'checks':checks,'files':[],'clips':[],'directions':[],'fps':100,'render':{'engine':'Cycles CPU','samples':args.samples},'display_scale':1.2*6.8/5.8,'reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if args.check:
 for direction in range(8):
  angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y)
  for frame in range(1,52):
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
   assert min(bounds[:2])>4 and max(bounds[2:])<380,(direction,frame,bounds)
 ROOT_OBJ.rotation_euler.z=0
 print('LUNA_ULTIMATE_CHECK_PASS',json.dumps(checks));sys.exit(0)
activate(0);ROOT_OBJ.rotation_euler.z=0;asset_id='luna-ultimate';clip_name='luna-ultimate-0'
stats=export_runtime();dest=OUT/'luna-ultimate.glb';manifest['clips'].append({'name':clip_name,'duration':.5})
manifest['runtime']=stats
for direction in range(8):
 angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y)
 inputs=[];direction_meta={'direction':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[]}
 for entry in range(1):
  activate(entry)
  for sample,frame in enumerate([7,27,46]):
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(direction,entry,sample,bounds)
   direction_meta['poses'].append({'entry':entry,'sample':sample,'frame':frame,'bounds':bounds,'socket':list(project(bpy.data.objects['cast-socket'].matrix_world.translation))})
   path=FRAMES/f'luna-ultimate-{direction}-{entry}-{sample}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);inputs+=['-i',str(path)]
 dst=OUT/f'luna-ultimate-{direction}-atlas.webp'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=3,scale=576:192:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(dst)],check=True)
 manifest['directions'].append(direction_meta)
 print('DIRECTION_COMPLETE',direction,flush=True)
# Convert the actual gem socket to sprite-size-normalized battle offsets.
coords=[[[round((p['socket'][0]-192)/384*manifest['display_scale'],7),round((p['socket'][1]-330)/384*manifest['display_scale'],7)] for p in d['poses']] for d in manifest['directions']]
socket_file=ROOT/'src/games/defense/druidUltimateSockets.ts'
socket_file.write_text('// Generated by tools/blender/build_luna_ultimate.py from the animated staff socket.\nexport const DRUID_ULTIMATE_SOCKETS = '+json.dumps(coords)+' as const;\n')
activate(0);ROOT_OBJ.rotation_euler.z=0;scene['regeneration_command']='npm run models:luna-ultimate';scene['entry_action_selection']='Assign Luna ultimate N / JOINT to all named joint objects; N=0.';bpy.context.preferences.filepaths.save_version=0
blend=ROOT/'art-source/defense/luna-ultimate.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));shutil.copyfile(FRAMES/'luna-ultimate-1-0-0.png',OUT/'luna-ultimate.png')
for path in [blend,dest,socket_file,OUT/'luna-ultimate.png',*sorted(FRAMES.glob('*.png')),*sorted(OUT.glob('luna-ultimate-*-atlas.webp'))]:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'luna-ultimate.json').write_text(json.dumps(manifest,indent=2)+'\n');print('LUNA_ULTIMATE_BAKE_PASS',flush=True)
