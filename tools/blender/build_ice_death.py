"""Split and animate the ice knight's solid geometry after a lethal hit.

Run npm run models:ice-death, or append -- --check to validate without export.
The game still removes and rewards the target immediately on the lethal hit.
"""
import argparse,bmesh,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/ice-knight.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/ice-death-frames';FRAMES.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections['Ice knight / editable parts'];scene.frame_set(1);bpy.context.view_layer.update()
for o in col.objects:o.animation_data_clear()
root=bpy.data.objects['ice-root'];head=bpy.data.objects['head'];sword=bpy.data.objects['sword'];arms={side:bpy.data.objects['arm-'+side] for side in ('near','far')};legs={side:bpy.data.objects['leg-'+side] for side in ('near','far')}
# The source is saved in its old hit pose. Split its torso into two real closed meshes.
torso=bpy.data.objects['torso'];original=torso.matrix_world.copy();pieces={}
for label,upper in [('upper',True),('lower',False)]:
 piece=torso.copy();piece.data=torso.data.copy();piece.name='fracture-torso-'+label;col.objects.link(piece);piece.matrix_world=original
 bm=bmesh.new();bm.from_mesh(piece.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,0,0),plane_no=(0,0,1),clear_inner=upper,clear_outer=not upper)
 cut=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z)<1e-5 for v in e.verts)]
 if cut:bmesh.ops.holes_fill(bm,edges=cut,sides=0)
 bm.normal_update();bm.to_mesh(piece.data);bm.free();piece.data.update();assert len(piece.data.polygons)>3;pieces[label]=piece
bpy.data.objects.remove(torso,do_unlink=True)
# Build three recognizable chunks, preserving the original hit world transforms.
def pivot(name,position):
 o=bpy.data.objects.new(name,None);col.objects.link(o);o.parent=root;o.location=position;return o
low=pivot('fracture-lower',(0,0,1.4));high=pivot('fracture-upper',(.2,0,2.6));bpy.context.view_layer.update()
for o in list(root.children):
 if o.type!='MESH':continue
 parent=low if o.name in ('hips','fracture-torso-lower') else high
 world=o.matrix_world.copy();o.parent=parent;o.matrix_world=world
bpy.context.view_layer.update()
parts={'root':root,'low':low,'high':high,'head':head,'arm-near':arms['near'],'arm-far':arms['far'],'leg-near':legs['near'],'leg-far':legs['far'],'sword':sword}
initial={k:(o.location.copy(),o.rotation_euler.copy()) for k,o in parts.items()}
groups={k:[o for o in [v,*v.children_recursive] if o.type=='MESH'] for k,v in parts.items() if k not in ('root','sword')}
assert all(groups.values()) and sword.parent==arms['near']
scene.frame_start=1;scene.frame_end=20;scene.render.fps=30;scene.cycles.samples=64
smooth=lambda v:(lambda x:x*x*(3-2*x))(max(0,min(1,v)))
def pose(t):
 fall=smooth((t-.06)/.48);split=smooth((t-.03)/.28);ground=smooth(t/.1)
 for key,obj in parts.items():
  loc,rot=initial[key];obj.location=loc.copy();obj.rotation_euler=rot.copy()
 root.rotation_euler.y+=math.radians(12)*fall;root.location.x+=.06*fall
 low.location.x-=.32*split;low.location.z-=.55*fall;low.rotation_euler.y-=math.radians(25)*fall
 high.location.x+=.48*split;high.location.z-=.95*fall;high.rotation_euler.y+=math.radians(48)*fall
 head.location.x+=.76*split;head.location.z-=2.27*fall;head.rotation_euler.y+=math.radians(45)*fall
 for side,sign in [('near',-1),('far',1)]:
  arm=arms[side];arm.location.y+=sign*.16*split;arm.location.z-=1.25*fall;arm.rotation_euler.x+=sign*math.radians(50)*fall;arm.rotation_euler.y+=math.radians(16)*fall
  leg=legs[side];leg.location.y+=sign*.11*fall;leg.location.z-=.28*fall;leg.rotation_euler.x+=sign*math.radians(28)*fall
 sword.rotation_euler.y+=math.radians(8)*fall
 bpy.context.view_layer.update()
 for name,meshes in groups.items():
  minz=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
  if minz<0:parts[name].location+=root.matrix_world.inverted().to_3x3()@Vector((0,0,(-minz+.001)*ground));bpy.context.view_layer.update()
records=[]
for frame in range(1,21):
 scene.frame_set(frame);t=(frame-1)/30;pose(t);coords=[];minz=100
 for obj in col.objects:
  if obj.type!='MESH':continue
  for v in obj.data.vertices:
   world=obj.matrix_world@v.co;view=world_to_camera_view(scene,scene.camera,world);coords.append((view.x*384,(1-view.y)*384));minz=min(minz,world.z)
 box=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords)]
 assert minz>-.31,(frame,minz)
 if frame>=4:assert minz>-.005,(frame,minz)
 assert box[0]>1 and box[1]>1 and box[2]<383 and box[3]<383,(frame,box)
 records.append({'frame':frame,'time':round(t,5),'bounds':[round(v,3) for v in box],'lowest_vertex':round(minz,5)})
 for obj in parts.values():
  for prop in ('location','rotation_euler'):obj.keyframe_insert(data_path=prop,frame=frame)
 if frame in (1,5,10,15,20) and not args.check:
  scene.render.filepath=str(FRAMES/f'ice-death-{(1,5,10,15,20).index(frame)}.png');bpy.ops.render.render(write_still=True)
if args.check:print('ICE_DEATH_POSE_CHECK_PASS',json.dumps(records));sys.exit(0)
for obj in parts.values():
 if obj.animation_data and obj.animation_data.action:
  obj.animation_data.action.name='Ice death / '+obj.name
  for curve in obj.animation_data.action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root;glb=OUT/'ice-knight-death.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='ice-knight-death',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
blend=ROOT/'art-source/defense/ice-knight-death.blend';scene['regeneration_command']='npm run models:ice-death';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
files=[FRAMES/f'ice-death-{i}.png' for i in range(5)];atlas=OUT/'ice-knight-death-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=5','-frames:v','1','-c:v','libwebp','-quality','90',str(atlas)],check=True)
poster=OUT/'ice-knight-death.png';shutil.copyfile(files[0],poster)
hashfile=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
manifest={'source':str(blend.relative_to(ROOT)),'source_sha256':hashfile(blend),'base_source':'art-source/defense/ice-knight.blend','base_source_sha256':hashfile(SOURCE),'regeneration_command':'npm run models:ice-death','reference':'public/defense/monster-models.webp','frame':{'width':384,'height':384,'ground':[192,317.61],'crop':[0,0,384,384],'orthographic_scale':scene.camera.data.ortho_scale},'clip':'ice-knight-death','duration':19/30,'baked_frames':[1,5,10,15,20],'effect_duration':.7,'sword_parent':sword.parent.name,'initial_floor_penetration':records[0]['lowest_vertex'],'samples':records,'files':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashfile(f)} for f in [glb,atlas,poster]],'renders':[{'path':str(f.relative_to(ROOT)),'sha256':hashfile(f)} for f in files],'camera':{'location':list(scene.camera.location),'rotation_euler':list(scene.camera.rotation_euler),'samples':scene.cycles.samples,'view_transform':scene.view_settings.view_transform}}
manifest['frame']['battle_anchor']={'initial_y':340,'ground_y':317.61,'settle_seconds':.1}
(OUT/'ice-knight-death.json').write_text(json.dumps(manifest,indent=2)+'\n');print('ICE_DEATH_COMPLETE')
