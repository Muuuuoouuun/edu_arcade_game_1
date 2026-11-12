"""Base cannon Lv.1: an aimed iron barrel with axial recoil on a fixed wooden keep.
Run: npm run models:base-cannon-action (Blender 4.3+, ffmpeg).
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=32);p.add_argument('--check',action='store_true');p.add_argument('--reuse-renders',action='store_true',help='Repack unchanged poses after clip-only edits');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
model_id='crush-cannon';asset_id='base-cannon-action';prefix='base-cannon-action';command='npm run models:base-cannon-action';display_scale=1.16;FRAMES=ROOT/'art-source/defense'/asset_id
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections[model_id];root=bpy.data.objects[model_id];root.location=(0,0,0)
root.name='base-cannon'
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False
# A lower, broader Lv.1 keep follows the squat field-cannon concept.
# Its meshes remain individually editable; the articulated carriage is lowered with the deck.
for obj in col.objects:
 if obj.parent==root:
  obj.location.z*=.78
  if obj.type=='MESH':obj.scale.z*=.78
camera=scene.camera;camera.data.ortho_scale=7.5;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
bpy.context.view_layer.update()
platform=bpy.data.objects.new('aim-platform',None);col.objects.link(platform);platform.parent=root;platform.location=(0,0,1.75);bpy.context.view_layer.update()
for obj in list(col.objects):
 if obj.parent==root and (obj.get('animation_role')=='turret' or obj.name.startswith(('Shot rack /',))):
  matrix=obj.matrix_world.copy();obj.parent=platform;obj.matrix_world=matrix
barrel=next(o for o in col.objects if o.get('animation_role')=='barrel');barrel.name='barrel';rest=barrel.location.copy()
bpy.context.view_layer.update();tip=Vector((0,-1.48,2.42-1.93*.22))
muzzle_local=barrel.matrix_world.inverted()@(root.matrix_world@tip)
# Remove the advanced crusher's shot rack; build the simpler Lv.1 iron carriage.
# Reuse the original modeled oak-and-stone foundation, not a flat reference image.
for obj in list(col.objects):
 if obj.name.startswith('Shot rack /'):bpy.data.objects.remove(obj,do_unlink=True)
 elif obj.type=='MESH':
  for slot in obj.material_slots:
   if slot.material and slot.material.name=='Cloth / ember red banner':slot.material=bpy.data.materials['Cloth / river blue banner']
   if obj.name.startswith('Barrel / basalt') and slot.material and slot.material.name=='Stone / ash basalt':slot.material=bpy.data.materials['Metal / dark wrought iron']
   if obj.name.startswith('Barrel / broad iron collar') and slot.material:slot.material=bpy.data.materials['Metal / aged gold brass']
# Two dark iron cannonballs on the fixed deck identify the physical ammunition.
for x in (-.27,.27):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=.25,location=tuple(root.matrix_world@Vector((x,.42,1.514))))
 ball=bpy.context.object;ball.name='Ammunition / iron shot';ball.data.materials.append(bpy.data.materials['Metal / dark wrought iron'])
 for collection in list(ball.users_collection):collection.objects.unlink(ball)
 col.objects.link(ball);bpy.context.view_layer.update();world=ball.matrix_world.copy();ball.parent=platform;ball.matrix_world=world
# Source animation roles are replaced by the actual authored clip, never doubled procedurally.
for obj in col.objects:
 if 'animation_role' in obj:del obj['animation_role']
bpy.context.view_layer.update()
fixed=[o for o in col.objects if o.type=='MESH' and o.parent==root];fixed_matrices={o:o.matrix_world.copy() for o in fixed}
# The shot rests on the wooden deck and rides the rotating carriage.
deck=next(o for o in col.objects if o.type=='MESH' and o.name.startswith('Deck / oak turntable'))
balls=[o for o in col.objects if o.type=='MESH' and o.name.startswith('Ammunition / iron shot')]
deck_top=max((deck.matrix_world@v.co).z for v in deck.data.vertices)
ground_errors=[min((o.matrix_world@v.co).z for v in o.data.vertices)-deck_top for o in balls]
assert len(balls)==2 and all(o.parent==platform for o in balls) and all(abs(e)<.005 for e in ground_errors),ground_errors
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*640,(1-p.y)*640))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
def recoil(value):barrel.location=rest+Vector((0,value,-value*.4/1.26))
poses={'ready':0,'recoil':.22,'return':.10,'settle':.025}
manifest={'source':f'art-source/defense/{asset_id}.blend','level':1,'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_base_cannon_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','render':{'engine':'Cycles CPU','samples':args.samples,'denoising':False},'frame':{'width':640,'height':640,'ground':list(ground),'crop':[32,24,576,576],'orthographic_scale':7.5},'delivery_frame':{'width':192,'height':192,'crop':[9.6,7.2,172.8,172.8]},'animation':{'clip':'base-cannon-fire','fps':100,'first_frame':1,'last_frame':53,'duration_seconds':.52,'hit_at':.28,'peak_recoil_at':.29},'directions':[],'files':[]}
manifest['ammunition_grounding']={'deck_top':deck_top,'contact_errors':ground_errors,'parent':'aim-platform'}
FRAMES.mkdir(parents=True,exist_ok=True)
previous=json.loads((OUT/f'{asset_id}.json').read_text()) if args.reuse_renders else None
if previous:assert previous['base_source_sha256']==manifest['base_source_sha256'] and previous['render']==manifest['render'],'Cannot reuse changed source or render settings'
for index in range(8):
 angle=index*math.tau/8;screen=Vector((math.cos(angle),math.sin(angle)));world=inverse@screen;world.normalize();yaw=math.atan2(world.x,-world.y);platform.rotation_euler.z=yaw
 entry={'index':index,'yaw':yaw,'poses':[]}
 for pose,value in poses.items():
  recoil(value);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in col.objects:
   if obj.type=='MESH':
    ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@v.co) for v in ev.data.vertices)
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
  assert bounds[0]>32 and bounds[1]>24 and bounds[2]<608 and bounds[3]<600,(index,pose,bounds)
  muzzle=project(barrel.matrix_world@muzzle_local)
  drift=max(max(abs(o.matrix_world[r][c]-m[r][c]) for r in range(4) for c in range(4)) for o,m in fixed_matrices.items());assert drift<1e-6
  entry['poses'].append({'name':pose,'muzzle':list(muzzle),'bounds':bounds,'recoil':value,'foundation_drift':drift,'fixed_meshes':len(fixed)})
  if previous:
   expected=previous['directions'][index]['poses'][len(entry['poses'])-1]
   assert max(abs(x-y) for x,y in zip(bounds,expected['bounds']))<1e-5 and (muzzle-Vector(expected['muzzle'])).length<1e-5,'Only unchanged poses can reuse renders'
   assert (FRAMES/f'{prefix}-{index}-{pose}.png').is_file()
  elif not args.check:
   scene.render.filepath=str(FRAMES/f'{prefix}-{index}-{pose}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not args.check:
  dst=OUT/f'{prefix}-{index}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'{prefix}-{index}-{pose}.png')] for pose in poses),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=4,scale=768:192:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
  manifest['files'].append({'file':dst.name,'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
 print('DIRECTION_DONE',index,flush=True)
if args.check:print('CHECK_PASS');sys.exit(0)
# A real object animation, shared by the editable source and exported workshop GLB.
platform.rotation_euler.z=0;scene.render.fps=100;scene.frame_start=1;scene.frame_end=53
for frame,value in [(1,0),(29,0),(30,.22),(37,.10),(45,.025),(53,0)]:
 recoil(value);barrel.keyframe_insert(data_path='location',frame=frame)
barrel.animation_data.action.name='Base cannon axial recoil'
for curve in barrel.animation_data.action.fcurves:
 for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()
# Batch evaluated surfaces under their actual joints; keep source parts editable.
original=list(col.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original};graph=bpy.context.evaluated_depsgraph_get();export=bpy.data.collections.new('Runtime temporary');scene.collection.children.link(export);clones={}
for obj in original:obj.name=names[obj]+'__editable'
for obj in original:
 clone=bpy.data.objects.new(names[obj],bpy.data.meshes.new_from_object(obj.evaluated_get(graph),depsgraph=graph)) if obj.type=='MESH' else obj.copy();clone.name=names[obj];export.objects.link(clone);clones[obj]=clone
for obj,clone in clones.items():clone.parent=clones.get(obj.parent);clone.matrix_world=matrices[obj]
bpy.context.view_layer.update();batches={}
for obj in clones.values():
 if obj.type=='MESH':batches.setdefault((obj.parent.name,tuple(m.name for m in obj.data.materials)),[]).append(obj)
for i,objects in enumerate(batches.values()):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name=f'Base cannon surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
meshes=[o for o in export.objects if o.type=='MESH'];triangles=0
for obj in meshes:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
manifest['runtime']={'mesh_objects':len(meshes),'triangles':triangles,'materials':len({m.name for o in meshes for m in o.data.materials})}
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='base-cannon-fire',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);recoil(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/f'{prefix}-4-ready.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png']:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest()
manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Runtime muzzle offsets are generated from the very same camera and joints.
coords=[[[round((p['muzzle'][0]-320)/576*display_scale,6),round(.1+(p['muzzle'][1]-600)/576*display_scale,6)] for p in d['poses']] for d in manifest['directions']]
muzzle_file='baseCannonMuzzles.ts';constant='BASE_CANNON_MUZZLES'
(ROOT/'src/games/defense'/muzzle_file).write_text('// Generated by tools/blender/build_base_cannon_action.py; offsets per tower display size.\nexport const '+constant+' = '+json.dumps(coords)+' as const;\n')
print('BASE_CANNON_ACTION_COMPLETE',flush=True)
