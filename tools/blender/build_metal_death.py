"""Animate the existing metal soldier's armor settling after a lethal hit.

Run: npm run models:metal-death. This is presentation only; the combat engine
still removes the enemy and awards its reward at the instant of lethal damage.
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/metal-soldier.blend'
OUT=ROOT/'public/defense/models'
FRAMES=ROOT/'art-source/defense/metal-death-frames'
FRAMES.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene;col=bpy.data.collections['Metal soldier / editable parts']
names=['metal-soldier','body','head','arm-near','arm-far','leg-near','leg-far']
parts={name:bpy.data.objects[name] for name in names}
for obj in col.objects:obj.animation_data_clear()
initial={name:(obj.location.copy(),obj.rotation_euler.copy()) for name,obj in parts.items()}
# All articulated parts are real meshes in the source model, not flat artwork.
groups={name:[o for o in col.objects if o.type=='MESH' and o.parent==parts[name]] for name in names[1:]}
assert all(groups.values()),{k:len(v) for k,v in groups.items()}
scene.frame_start=1;scene.frame_end=20;scene.render.fps=30;scene.cycles.samples=48
smooth=lambda x:(lambda t:t*t*(3-2*t))(max(0,min(1,x)))
def pose(t):
 impact=smooth(t/.14);settle=smooth((t-.07)/.48)
 for name,obj in parts.items():
  loc,rot=initial[name];obj.location=loc.copy();obj.rotation_euler=rot.copy()
 root=parts['metal-soldier'];root.location.x+=.16*settle;root.rotation_euler.y+=math.radians(14)*settle
 body=parts['body'];body.location.x-=.2*settle;body.location.z-=1.05*settle;body.rotation_euler.y+=math.radians(72)*settle
 head=parts['head'];head.location.x+=.12*settle;head.location.z-=2.52*settle;head.rotation_euler.y+=math.radians(48)*settle
 for sign,side in ((-1,'near'),(1,'far')):
  arm=parts['arm-'+side];arm.location.y+=sign*.28*impact;arm.location.z-=1.43*settle;arm.rotation_euler.x+=sign*math.radians(65)*settle;arm.rotation_euler.y+=math.radians(25)*settle
  leg=parts['leg-'+side];leg.location.y+=sign*.18*settle;leg.location.z-=.35*settle;leg.rotation_euler.x+=sign*math.radians(38)*settle
 bpy.context.view_layer.update()
 # Clamp every solid piece group to the floor, not the projected 2D image.
 for name,objects in groups.items():
  minz=min((o.matrix_world@v.co).z for o in objects for v in o.data.vertices)
  if minz<0:parts[name].location.z+=-minz+.002;bpy.context.view_layer.update()
records=[]
for frame in range(1,21):
 scene.frame_set(frame);t=(frame-1)/30;pose(t);bounds=[];minz=100
 for obj in col.objects:
  if obj.type!='MESH':continue
  for v in obj.data.vertices:
   world=obj.matrix_world@v.co;view=world_to_camera_view(scene,scene.camera,world)
   bounds.append((view.x*384,(1-view.y)*384));minz=min(minz,world.z)
 box=[min(x for x,y in bounds),min(y for x,y in bounds),max(x for x,y in bounds),max(y for x,y in bounds)]
 assert minz>-.005,(frame,minz)
 assert box[0]>2 and box[1]>2 and box[2]<382 and box[3]<382,(frame,box)
 records.append({'frame':frame,'time':round(t,5),'bounds':[round(v,3) for v in box],'lowest_vertex':round(minz,5)})
 for obj in parts.values():
  for prop in ('location','rotation_euler'):obj.keyframe_insert(data_path=prop,frame=frame)
 if frame in (1,5,10,15,20) and not args.check:
  scene.render.filepath=str(FRAMES/f'metal-death-{(1,5,10,15,20).index(frame)}.png');bpy.ops.render.render(write_still=True)
if args.check:print('METAL_DEATH_POSE_CHECK_PASS',json.dumps(records));sys.exit(0)
for obj in parts.values():
 if obj.animation_data and obj.animation_data.action:
  obj.animation_data.action.name='Metal death / '+obj.name
  for curve in obj.animation_data.action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=parts['metal-soldier']
glb=OUT/'metal-soldier-death.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='metal-soldier-death',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
blend=ROOT/'art-source/defense/metal-soldier-death.blend';scene['regeneration_command']='npm run models:metal-death';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
files=[FRAMES/f'metal-death-{i}.png' for i in range(5)];atlas=OUT/'metal-soldier-death-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=5','-frames:v','1','-c:v','libwebp','-quality','90',str(atlas)],check=True)
poster=OUT/'metal-soldier-death.png';shutil.copyfile(files[0],poster)
hashfile=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
manifest={'source':str(blend.relative_to(ROOT)),'source_sha256':hashfile(blend),'base_source_sha256':hashfile(SOURCE),'regeneration_command':'npm run models:metal-death','reference':'b175a9f7a3b400dff1a819d4d79b8e79ac8e5d9e:docs/arcana-enemy-design/enemy-destruction-storyboard.webp','frame':{'width':384,'height':384,'ground':[192,292.91],'crop':[0,0,384,384],'orthographic_scale':scene.camera.data.ortho_scale},'clip':'metal-soldier-death','duration':19/30,'baked_frames':[1,5,10,15,20],'effect_duration':.7,'samples':records,'files':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashfile(f)} for f in [glb,atlas,poster]],'renders':[{'path':str(f.relative_to(ROOT)),'sha256':hashfile(f)} for f in files],'camera':{'location':list(scene.camera.location),'rotation_euler':list(scene.camera.rotation_euler),'samples':scene.cycles.samples,'view_transform':scene.view_settings.view_transform}}
(OUT/'metal-soldier-death.json').write_text(json.dumps(manifest,indent=2)+'\n');print('METAL_DEATH_COMPLETE')
