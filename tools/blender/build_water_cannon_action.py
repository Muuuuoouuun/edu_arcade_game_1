"""Articulate the existing water cannon: fixed keep, rotating hydraulic deck, axial recoil.
Run: npm run models:water-action (Lv.2) / npm run models:water-action-lv3 (Lv.3)
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--level',type=int,choices=(2,3),default=2);p.add_argument('--samples',type=int,default=48);p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
model_id='water-cannon' if args.level==2 else 'water-cannon-lv3';asset_id=model_id+'-action';prefix='water-action' if args.level==2 else 'water-lv3-action';command='npm run models:water-action'+('-lv3' if args.level==3 else '');display_scale=1.16*(1.025 if args.level==3 else 1);FRAMES=ROOT/'art-source/defense'/asset_id
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections[model_id];root=bpy.data.objects[model_id];root.location=(0,0,0)
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False
camera=scene.camera;camera.data.ortho_scale=7.5;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples
bpy.context.view_layer.update()
platform=bpy.data.objects.new('aim-platform',None);col.objects.link(platform);platform.parent=root;platform.location=(0,0,1.75);bpy.context.view_layer.update()
for obj in list(col.objects):
 if obj.parent==root and (obj.get('animation_role')=='turret' or obj.name.startswith(('Reservoir /','Plumbing /','Valve /','Gauge /','Ascended / tidal crown','Ascended / crown side','Ascended / orbiting water'))):
  matrix=obj.matrix_world.copy();obj.parent=platform;obj.matrix_world=matrix
barrel=next(o for o in col.objects if o.get('animation_role')=='barrel');barrel.name='barrel';rest=barrel.location.copy()
bpy.context.view_layer.update();tip=Vector((0,-1.48,2.42))
if args.level==3:tip+=Vector((0,-1.26,.4)).normalized()*.06
muzzle_local=barrel.matrix_world.inverted()@(root.matrix_world@tip)
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*640,(1-p.y)*640))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
def recoil(value):barrel.location=rest+Vector((0,value,-value*.4/1.26))
poses={'ready':0,'recoil':.28,'recover':.12}
manifest={'source':f'art-source/defense/{asset_id}.blend','level':args.level,'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_water_cannon_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','frame':{'width':640,'height':640,'ground':list(ground),'crop':[32,24,576,576],'orthographic_scale':7.5},'delivery_frame':{'width':384,'height':384,'crop':[19.2,14.4,345.6,345.6]},'clip':'water-cannon-fire','directions':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
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
  entry['poses'].append({'name':pose,'muzzle':list(muzzle),'bounds':bounds})
  if not args.check:
   scene.render.filepath=str(FRAMES/f'{prefix}-{index}-{pose}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not args.check:
  dst=OUT/f'{prefix}-{index}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'{prefix}-{index}-{pose}.png')] for pose in poses),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=3,scale=1152:384:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
  manifest['files'].append({'file':dst.name,'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
 print('DIRECTION_DONE',index,flush=True)
if args.check:print('CHECK_PASS');sys.exit(0)
# A real object animation, shared by the editable source and exported workshop GLB.
platform.rotation_euler.z=0;scene.render.fps=30;scene.frame_start=1;scene.frame_end=19
for frame,value in [(1,0),(9,0),(10,.28),(13,.12),(17,0),(19,0)]:
 recoil(value);barrel.keyframe_insert(data_path='location',frame=frame)
barrel.animation_data.action.name='Water cannon axial recoil'
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
 objects[0].name=f'Water surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='water-cannon-fire',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);recoil(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/f'{prefix}-4-ready.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png']:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Runtime muzzle offsets are generated from the very same camera and joints.
coords=[[[round((p['muzzle'][0]-320)/576*display_scale,6),round(.1+(p['muzzle'][1]-600)/576*display_scale,6)] for p in d['poses']] for d in manifest['directions']]
muzzle_file='waterCannonMuzzles.ts' if args.level==2 else 'waterCannonLv3Muzzles.ts';constant='WATER_CANNON_MUZZLES' if args.level==2 else 'WATER_CANNON_LV3_MUZZLES'
(ROOT/'src/games/defense'/muzzle_file).write_text('// Generated by tools/blender/build_water_cannon_action.py; offsets per tower display size.\nexport const '+constant+' = '+json.dumps(coords)+' as const;\n')
print('WATER_ACTION_COMPLETE',flush=True)
