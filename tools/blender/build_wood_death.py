"""Author a grounded death from the existing articulated wood soldier.

Run npm run models:wood-death (or add -- --check for geometry validation).
This is presentation only: the engine removes and rewards the enemy immediately.
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/wood-soldier.blend'
OUT=ROOT/'public/defense/models'
FRAMES=ROOT/'art-source/defense/wood-death-frames'
FRAMES.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene;col=bpy.data.collections['Wood soldier / editable parts'];scene.frame_set(1)
for obj in col.objects:obj.animation_data_clear()
root=bpy.data.objects['wood-root'];head=bpy.data.objects['head'];club=bpy.data.objects['club-grip']
arms={side:bpy.data.objects['arm-'+side] for side in ('near','far')}
legs={side:bpy.data.objects['leg-'+side] for side in ('near','far')}
# Reconstruct the exact old hit pose rather than interrupting the saved walk at frame 1.
root.location=(-.3,0,0);root.rotation_euler=(0,math.radians(-13),0)
head.rotation_euler=(0,math.radians(16),0);club.rotation_euler=(0,math.radians(34),0)
bpy.data.objects['leaf-back'].rotation_euler=(0,0,0)
for side,y,angle,armangle in [('near',-.7,10,48),('far',.7,-6,40)]:
 leg=legs[side];leg.location=(0,y,1.4);leg.rotation_euler=(0,math.radians(angle),0);arms[side].rotation_euler=(0,math.radians(armangle),0)
bpy.context.view_layer.update()
for side in ('near','far'):
 foot=bpy.data.objects['foot-'+side]
 lowest=min((o.matrix_world@v.co).z for o in [foot,*foot.children_recursive] if o.type=='MESH' for v in o.data.vertices)
 legs[side].location+=root.matrix_world.inverted().to_3x3()@Vector((0,0,-lowest));bpy.context.view_layer.update()
# Group only the body geometry under a new central pivot, preserving every original world transform.
body=bpy.data.objects.new('death-body',None);col.objects.link(body);body.parent=root;body.location=(0,0,1.55);bpy.context.view_layer.update()
for obj in list(root.children):
 if obj.type!='MESH':continue
 matrix=obj.matrix_world.copy();obj.parent=body;obj.matrix_world=matrix
bpy.context.view_layer.update()
parts={'root':root,'body':body,'head':head,'arm-near':arms['near'],'arm-far':arms['far'],'leg-near':legs['near'],'leg-far':legs['far'],'club':club}
initial={name:(obj.location.copy(),obj.rotation_euler.copy()) for name,obj in parts.items()}
groups={name:[o for o in [obj,*obj.children_recursive] if o.type=='MESH'] for name,obj in parts.items() if name not in ('root','club')}
assert all(groups.values()) and club.parent==arms['near']
scene.frame_start=1;scene.frame_end=20;scene.render.fps=30;scene.cycles.samples=64
smooth=lambda x:(lambda t:t*t*(3-2*t))(max(0,min(1,x)))
def pose(t):
 drop=smooth((t-.06)/.48);loosen=smooth(t/.22)
 for name,obj in parts.items():
  loc,rot=initial[name];obj.location=loc.copy();obj.rotation_euler=rot.copy()
 root.rotation_euler.y+=math.radians(13)*drop;root.location.x+=.08*drop
 body.location.z-=.72*drop;body.rotation_euler.y+=math.radians(65)*drop
 head.location.x+=.20*drop;head.location.z-=2.60*drop;head.rotation_euler.y+=math.radians(54)*drop
 for side,sign in [('near',-1),('far',1)]:
  arm=arms[side];arm.location.y+=sign*.20*loosen;arm.location.z-=1.44*drop;arm.rotation_euler.x+=sign*math.radians(55)*drop;arm.rotation_euler.y-=math.radians(25)*drop
  leg=legs[side];leg.location.y+=sign*.14*drop;leg.location.z-=.35*drop;leg.rotation_euler.x+=sign*math.radians(35)*drop
 club.rotation_euler.y+=math.radians(12)*drop
 bpy.context.view_layer.update()
 for name,meshes in groups.items():
  minz=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
  if minz<0:
   parts[name].location+=root.matrix_world.inverted().to_3x3()@Vector((0,0,-minz+.001));bpy.context.view_layer.update()
records=[]
for frame in range(1,21):
 scene.frame_set(frame);t=(frame-1)/30;pose(t);coords=[];minz=100
 for obj in col.objects:
  if obj.type!='MESH':continue
  for v in obj.data.vertices:
   world=obj.matrix_world@v.co;view=world_to_camera_view(scene,scene.camera,world)
   coords.append((view.x*384,(1-view.y)*384));minz=min(minz,world.z)
 box=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords)]
 assert minz>-.005,(frame,minz)
 assert box[0]>1 and box[1]>1 and box[2]<383 and box[3]<383,(frame,box)
 records.append({'frame':frame,'time':round(t,5),'bounds':[round(v,3) for v in box],'lowest_vertex':round(minz,5)})
 for obj in parts.values():
  for prop in ('location','rotation_euler'):obj.keyframe_insert(data_path=prop,frame=frame)
 if frame in (1,5,10,15,20) and not args.check:
  scene.render.filepath=str(FRAMES/f'wood-death-{(1,5,10,15,20).index(frame)}.png');bpy.ops.render.render(write_still=True)
if args.check:print('WOOD_DEATH_POSE_CHECK_PASS',json.dumps(records));sys.exit(0)
for obj in parts.values():
 if obj.animation_data and obj.animation_data.action:
  obj.animation_data.action.name='Wood death / '+obj.name
  for curve in obj.animation_data.action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
glb=OUT/'wood-soldier-death.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='wood-soldier-death',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
blend=ROOT/'art-source/defense/wood-soldier-death.blend';scene['regeneration_command']='npm run models:wood-death';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
files=[FRAMES/f'wood-death-{i}.png' for i in range(5)];atlas=OUT/'wood-soldier-death-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=5','-frames:v','1','-c:v','libwebp','-quality','90',str(atlas)],check=True)
poster=OUT/'wood-soldier-death.png';shutil.copyfile(files[0],poster)
hashfile=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
manifest={'source':str(blend.relative_to(ROOT)),'source_sha256':hashfile(blend),'base_source':'art-source/defense/wood-soldier.blend','base_source_sha256':hashfile(SOURCE),'regeneration_command':'npm run models:wood-death','reference':'docs/arcana-direction-loop/model-drafts/wood-log-compare-cycle34.webp','frame':{'width':384,'height':384,'ground':[192,317.61],'crop':[0,0,384,384],'orthographic_scale':scene.camera.data.ortho_scale},'clip':'wood-soldier-death','duration':19/30,'baked_frames':[1,5,10,15,20],'effect_duration':.7,'grip_parent':club.parent.name,'samples':records,'files':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashfile(f)} for f in [glb,atlas,poster]],'renders':[{'path':str(f.relative_to(ROOT)),'sha256':hashfile(f)} for f in files],'camera':{'location':list(scene.camera.location),'rotation_euler':list(scene.camera.rotation_euler),'samples':scene.cycles.samples,'view_transform':scene.view_settings.view_transform}}
(OUT/'wood-soldier-death.json').write_text(json.dumps(manifest,indent=2)+'\n');print('WOOD_DEATH_COMPLETE')
