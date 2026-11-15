"""Create a grounded heavy walk for the existing ice knight.

Run npm run models:ice-walk; add -- --check to validate without exporting.
Battle selects the baked poses by actual distance; this clip changes no movement rules.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/ice-knight.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/ice-walk-frames';FRAMES.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections['Ice knight / editable parts'];scene.frame_set(1);bpy.context.view_layer.update()
for o in col.objects:o.animation_data_clear()
root=bpy.data.objects['ice-root'];head=bpy.data.objects['head'];arms={s:bpy.data.objects['arm-'+s] for s in ('near','far')};legs={s:bpy.data.objects['leg-'+s] for s in ('near','far')}
root.location=(0,0,0);root.rotation_euler=(0,0,0);head.rotation_euler=(0,0,0)
# The original shin extends below the sole; move it up inside the boot.
for side in ('near','far'):
 shin=bpy.data.objects['shin-'+side];shin.location.z+=.32
for side,y in [('near',-.7),('far',.7)]:legs[side].location=(0,y,1.4);legs[side].rotation_euler=(0,0,0);arms[side].rotation_euler=(0,0,0)
bpy.context.view_layer.update();feet={};footmeshes={}
for side in ('near','far'):
 leg=legs[side];mesh=bpy.data.objects['foot-'+side];joint=bpy.data.objects.new('foot-joint-'+side,None);col.objects.link(joint);joint.parent=leg;joint.location=mesh.location.copy();bpy.context.view_layer.update()
 world=mesh.matrix_world.copy();mesh.parent=joint;mesh.matrix_world=world;feet[side]=joint;footmeshes[side]=mesh
scene.frame_start=1;scene.frame_end=33;scene.render.fps=32;scene.cycles.samples=64
animated=[root,head,*arms.values(),*legs.values(),*feet.values()]
def pose(phase):
 roll=math.radians(2*math.sin(phase));lean=math.radians(4+1.2*math.sin(phase*2))
 root.location=(0,0,.035*(1-math.cos(phase*2)));root.rotation_euler=(roll,lean,0)
 head.rotation_euler=(0,math.radians(-3+1.5*math.sin(phase-.4)),0)
 for side,offset,y in [('near',0,-.7),('far',math.pi,.7)]:
  c=phase+offset;leg=legs[side];leg.location=(0,y,1.4);angle=math.radians(24*math.cos(c));leg.rotation_euler=(0,angle,0)
  arms[side].rotation_euler=(0,math.radians((-7 if side=='near' else -15)*math.cos(c-.22)),0)
  feet[side].rotation_euler=(-roll,-lean-angle,0)
 bpy.context.view_layer.update()
 contacts={}
 for side,offset in [('near',0),('far',math.pi)]:
  c=phase+offset;lift=.20*max(0,math.sin(c))**2;mesh=footmeshes[side];z=min((mesh.matrix_world@v.co).z for v in mesh.data.vertices)
  legs[side].location+=root.matrix_world.inverted().to_3x3()@Vector((0,0,lift-z));bpy.context.view_layer.update()
  contacts[side]=min((mesh.matrix_world@v.co).z for v in mesh.data.vertices)
 return contacts
records=[]
for frame in range(1,34):
 scene.frame_set(frame);phase=(frame-1)/32*math.tau;contacts=pose(phase);coords=[];minz=100;lowest=''
 for obj in col.objects:
  if obj.type!='MESH':continue
  for v in obj.data.vertices:
   world=obj.matrix_world@v.co;view=world_to_camera_view(scene,scene.camera,world);coords.append((view.x*384,(1-view.y)*384))
   if world.z<minz:minz=world.z;lowest=obj.name
 box=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords)]
 assert minz>-.005,(frame,minz,lowest)
 assert min(contacts.values())<.002 and max(contacts.values())<=.201,(frame,contacts)
 # Delivery is shifted 22px down to match the existing 2.5D hit anchor.
 assert box[0]>1 and box[1]>1 and box[2]<383 and box[3]+22<383,(frame,box)
 records.append({'frame':frame,'phase':round(phase,6),'bounds':[round(v,3) for v in box],'lowest_vertex':round(minz,6),'feet':{k:round(v,6) for k,v in contacts.items()}})
 for obj in animated:
  for prop in ('location','rotation_euler'):obj.keyframe_insert(data_path=prop,frame=frame)
 if frame in (1,5,9,13,17,21,25,29) and not args.check:
  scene.render.filepath=str(FRAMES/f'ice-walk-{(frame-1)//4}.png');bpy.ops.render.render(write_still=True)
if args.check:print('ICE_WALK_POSE_CHECK_PASS',json.dumps(records));sys.exit(0)
for obj in animated:
 if obj.animation_data and obj.animation_data.action:
  obj.animation_data.action.name='Ice knight walk / '+obj.name
  for curve in obj.animation_data.action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root;glb=OUT/'ice-knight-walk.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='ice-knight-walk',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
blend=ROOT/'art-source/defense/ice-knight-walk.blend';scene['regeneration_command']='npm run models:ice-walk';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
files=[FRAMES/f'ice-walk-{i}.png' for i in range(8)];atlas=OUT/'ice-knight-walk-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=8,format=rgba,pad=3072:406:0:22:color=black@0,crop=3072:384:0:0,scale=2048:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90',str(atlas)],check=True)
poster=OUT/'ice-knight-walk.png';shutil.copyfile(files[0],poster)
hashfile=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
manifest={'source':str(blend.relative_to(ROOT)),'source_sha256':hashfile(blend),'base_source':'art-source/defense/ice-knight.blend','base_source_sha256':hashfile(SOURCE),'regeneration_command':'npm run models:ice-walk','reference':'public/defense/monster-models.webp','frame':{'width':384,'height':384,'ground':[192,317.61],'display_anchor_y':339.61,'delivery_shift_y':22,'crop':[0,0,384,384],'orthographic_scale':scene.camera.data.ortho_scale},'sword_parent':bpy.data.objects['sword'].parent.name,'clip':'ice-knight-walk','duration':1,'stride_world':24.83730,'stride_reference_size':68,'baked_frames':[1,5,9,13,17,21,25,29],'samples':records,'files':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashfile(f)} for f in [glb,atlas,poster]],'renders':[{'path':str(f.relative_to(ROOT)),'sha256':hashfile(f)} for f in files],'camera':{'location':list(scene.camera.location),'rotation_euler':list(scene.camera.rotation_euler),'samples':scene.cycles.samples,'view_transform':scene.view_settings.view_transform}}
manifest['delivery_frame']={'width':256,'height':256,'columns':8,'source_scale':2/3,'ground_y':339.61*2/3}
(OUT/'ice-knight-walk.json').write_text(json.dumps(manifest,indent=2)+'\n');print('ICE_WALK_COMPLETE')
