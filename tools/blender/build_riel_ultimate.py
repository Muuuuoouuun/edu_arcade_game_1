"""Riel's immediate star-arrow-rain release and recovery.

Regenerate with npm run models:riel-ultimate. Existing ordinary shot/walk are preserved.
"""
import bpy,math,json,hashlib,argparse,sys,subprocess,shutil
from pathlib import Path
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--samples',type=int,default=48)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/riel-ultimate-frames';FRAMES.mkdir(exist_ok=True)
cast_source=ROOT/'art-source/defense/riel-archer.blend'
bpy.ops.wm.open_mainfile(filepath=str(cast_source));scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
ROOT_OBJ=bpy.data.objects['riel-archer'];COL=bpy.data.collections['Riel archer / editable parts'];body=bpy.data.objects['body'];camera=scene.camera
joints=[o for o in COL.objects if o.animation_data and o.animation_data.action]
# Preserve the ready pose, then attach the actual bow and its real string, grip,
# ornaments, arrow and bow hand to one new pivot. No image plane is used.
for o in joints:o.animation_data_clear()
bowhand=bpy.data.objects['bow-hand'];pivot=bpy.data.objects.new('ultimate-bow-pivot',None);COL.objects.link(pivot);pivot.parent=body;pivot.location=bowhand.location.copy();bpy.context.view_layer.update()
for o in list(COL.objects):
 if o.parent==body and (o.name.startswith(('bow-limb-','bow-string-','Bow / gold leaf guard')) or o.name in ('bow-hand','bow-grip','nocked-arrow','arrow-socket')):
  world=o.matrix_world.copy();o.parent=pivot;o.matrix_world=world
bpy.context.view_layer.update();joints.append(pivot)
rest={o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints}
scene.cycles.samples=args.samples;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.fps=100;scene.frame_start=1;scene.frame_end=51
legs=[bpy.data.objects[n+'-leg'] for n in ['right','left']];arrow=bpy.data.objects['nocked-arrow']
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def endpoint(state,name):
 p,r,s=state[name];return p+r.to_matrix()@Vector((0,0,s.z))
def pose(frame):
 # Damage is immediate. Bow starts already raised; the free hand and cloak
 # follow through while the bow settles to its exact authored ready pose.
 t=(frame-1)/100;q=smooth((t-.08)/.42);release=1-q
 for o in joints:
  p,r,scale=rest[o.name];o.location=p.copy();o.rotation_euler=r.copy();o.scale=scale.copy()
 pivot.rotation_euler.x+=math.radians(34)*release
 pivot.location+=Vector((0,.10,.40))*release
 body.rotation_euler.x-=.055*release
 bpy.data.objects['cape'].rotation_euler.x+=.10*release
 bpy.data.objects['hair'].rotation_euler.x-=.055*release
 # A released arrow is absent; reload in the second half of the recovery.
 arrow.scale=rest[arrow.name][2]*(0.001 if t<.30 else 1.0)
 bpy.context.view_layer.update()
 # Both forearms meet their palms; the bow hand is a child of the raised bow.
 for side in ('bow','draw'):
  upper=bpy.data.objects[side+'-upper-arm'];fore=bpy.data.objects[side+'-forearm'];hand=bpy.data.objects[side+'-hand']
  shoulder=rest[upper.name][0];elbow=endpoint(rest,upper.name)
  if side=='bow':
   wrist=body.matrix_world.inverted()@hand.matrix_world.translation
   elbow=elbow+Vector((0,.02,.06))*release
  else:
   wrist=rest[hand.name][0]+Vector((.60,-.18,.28))*release
   hand.location=wrist;elbow=elbow+Vector((.12,-.10,.11))*release
  for joint,a,b in [(upper,shoulder,elbow),(fore,elbow,wrist)]:
   joint.location=a;joint.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();joint.scale=(1,1,(b-a).length)
 bpy.context.view_layer.update()
sole_objects=[o for o in COL.objects if o.type=='MESH' and 'boot / sole' in o.name.lower()];assert len(sole_objects)==2
checks=[];min_sole=float('inf');end_error=0
for frame in range(1,52):
 scene.frame_set(frame);pose(frame)
 if frame==51:
  for o in joints:
   p,r,scale=rest[o.name];error=max(abs(a-b) for v,w in zip((o.location,o.rotation_euler,o.scale),(p,r,scale)) for a,b in zip(v,w));end_error=max(end_error,error)
  assert end_error<1e-5,end_error
 graph=bpy.context.evaluated_depsgraph_get()
 for sole in sole_objects:
  ev=sole.evaluated_get(graph);bottom=min((ev.matrix_world@Vector(v)).z for v in ev.bound_box);min_sole=min(min_sole,bottom);assert bottom>=0,(frame,bottom)
 for o in joints:
  for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
checks.append({'frames':51,'min_sole_z':min_sole,'ready_end_error':end_error})
for o in joints:
 o.animation_data.action.name='Riel ultimate / '+o.name
 for curve in o.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='CONSTANT' if o==arrow and curve.data_path=='scale' else 'LINEAR'
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
   objects[0].name=f'Riel surface {i+1:02}'
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

manifest={'generator':'tools/blender/build_riel_ultimate.py','command':'npm run models:riel-ultimate','source_cast_sha256':hashlib.sha256(cast_source.read_bytes()).hexdigest(),'reference':'art-source/defense/atlases/ranged-motion.png','reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':[192,330],'orthographic_scale':6.8},'delivery_frame':{'width':192,'height':192,'ground':[96,165],'columns':3,'rows':1},'duration_seconds':.5,'samples_seconds':[.06,.26,.45],'checks':checks,'files':[],'clips':[],'directions':[],'fps':100,'render':{'engine':'Cycles CPU','samples':args.samples},'display_scale':1.2*6.8/5.8,'generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
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
 print('RIEL_ULTIMATE_CHECK_PASS',json.dumps(checks));sys.exit(0)
asset_id='riel-ultimate';clip_name='riel-ultimate-0';ROOT_OBJ.rotation_euler.z=0
stats=export_runtime();dest=OUT/'riel-ultimate.glb';manifest['clips'].append({'name':clip_name,'duration':.5});manifest['runtime']=stats
for direction in range(8):
 angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y)
 inputs=[];direction_meta={'direction':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[]}
 for sample,frame in enumerate([7,27,46]):
  scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in COL.objects:
   if obj.type=='MESH':
    ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(direction,sample,bounds)
  direction_meta['poses'].append({'sample':sample,'frame':frame,'bounds':bounds})
  path=FRAMES/f'riel-ultimate-{direction}-{sample}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);inputs+=['-i',str(path)]
 dst=OUT/f'riel-ultimate-{direction}-atlas.webp'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=3,scale=576:192:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(dst)],check=True)
 manifest['directions'].append(direction_meta);print('DIRECTION_COMPLETE',direction,flush=True)
ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);scene['regeneration_command']='npm run models:riel-ultimate';bpy.context.preferences.filepaths.save_version=0
blend=ROOT/'art-source/defense/riel-ultimate.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));shutil.copyfile(FRAMES/'riel-ultimate-1-0.png',OUT/'riel-ultimate.png')
for path in [blend,dest,OUT/'riel-ultimate.png',*sorted(FRAMES.glob('*.png')),*sorted(OUT.glob('riel-ultimate-*-atlas.webp'))]:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'riel-ultimate.json').write_text(json.dumps(manifest,indent=2)+'\n');print('RIEL_ULTIMATE_BAKE_PASS',flush=True)
