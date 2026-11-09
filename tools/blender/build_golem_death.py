"""Build a heavy, grounded stone-golem collapse from the existing editable model.

Run npm run models:golem-death; append -- --check for geometry-only validation.
Combat removal and rewards stay at the original hit; this is a visual afterimage.
"""
import argparse,bmesh,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/stone-golem.blend'
OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/golem-death-frames';FRAMES.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections['Stone golem / editable parts'];scene.frame_set(1);bpy.context.view_layer.update()
for obj in col.objects:obj.animation_data_clear()
root=bpy.data.objects['golem-root'];head=bpy.data.objects['head'];arms={s:bpy.data.objects['arm-'+s] for s in ('near','far')};legs={s:bpy.data.objects['leg-'+s] for s in ('near','far')}
# The saved source is the original hit pose. Split the actual torso mesh into
# closed upper and lower stones while preserving its world transform.
torso=bpy.data.objects['torso'];original=torso.matrix_world.copy()
for label,upper in [('upper',True),('lower',False)]:
 piece=torso.copy();piece.data=torso.data.copy();piece.name='fracture-torso-'+label;col.objects.link(piece);piece.matrix_world=original
 bm=bmesh.new();bm.from_mesh(piece.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,0,0),plane_no=(0,0,1),clear_inner=upper,clear_outer=not upper)
 cut=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z)<1e-5 for v in e.verts)]
 if cut:bmesh.ops.holes_fill(bm,edges=cut,sides=0)
 bm.normal_update();bm.to_mesh(piece.data);bm.free();piece.data.update();assert len(piece.data.polygons)>3
bpy.data.objects.remove(torso,do_unlink=True)
def pivot(name,position):
 o=bpy.data.objects.new(name,None);col.objects.link(o);o.parent=root;o.location=position;return o
low=pivot('fracture-lower',(0,0,1.4));high=pivot('fracture-upper',(.15,0,2.4));bpy.context.view_layer.update()
for obj in list(root.children):
 if obj.type!='MESH':continue
 target=low if obj.name in ('hips','fracture-torso-lower','moss-knee','moss-hips') or obj.name.startswith(('moss-knee-lobe-','moss-hips-lobe-')) else high
 world=obj.matrix_world.copy();obj.parent=target;obj.matrix_world=world
bpy.context.view_layer.update()
parts={'root':root,'low':low,'high':high,'head':head,'arm-near':arms['near'],'arm-far':arms['far'],'leg-near':legs['near'],'leg-far':legs['far']}
initial={name:(obj.location.copy(),obj.rotation_euler.copy()) for name,obj in parts.items()}
groups={name:[o for o in [obj,*obj.children_recursive] if o.type=='MESH'] for name,obj in parts.items() if name!='root'}
assert all(groups.values())
scene.frame_start=1;scene.frame_end=20;scene.render.fps=30;scene.cycles.samples=64
smooth=lambda x:(lambda t:t*t*(3-2*t))(max(0,min(1,x)))
def pose(t):
 fall=smooth((t-.05)/.52);split=smooth((t-.08)/.34);ground=smooth(t/.10)
 for name,obj in parts.items():
  loc,rot=initial[name];obj.location=loc.copy();obj.rotation_euler=rot.copy()
 root.location.x+=.05*fall;root.rotation_euler.y+=math.radians(10)*fall
 low.location.x-=.25*split;low.location.z-=.53*fall;low.rotation_euler.y-=math.radians(19)*fall
 high.location.x+=.38*split;high.location.z-=.9*fall;high.rotation_euler.y+=math.radians(47)*fall
 head.location.x+=.55*split;head.location.z-=2.0*fall;head.rotation_euler.y+=math.radians(38)*fall
 for side,sign in [('near',-1),('far',1)]:
  arm=arms[side];arm.location.y+=sign*.18*split;arm.location.z-=1.0*fall;arm.rotation_euler.x+=sign*math.radians(40)*fall;arm.rotation_euler.y+=math.radians(12)*fall
  leg=legs[side];leg.location.y+=sign*.10*fall;leg.location.z-=.28*fall;leg.rotation_euler.x+=sign*math.radians(24)*fall
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
 if frame>=4:assert minz>-.005,(frame,minz)
 assert box[0]>1 and box[1]>1 and box[2]<383 and box[3]<383,(frame,box)
 records.append({'frame':frame,'time':round(t,5),'bounds':[round(v,3) for v in box],'lowest_vertex':round(minz,5)})
 for obj in parts.values():
  for prop in ('location','rotation_euler'):obj.keyframe_insert(data_path=prop,frame=frame)
 if frame in (1,5,10,15,20) and not args.check:
  scene.render.filepath=str(FRAMES/f'golem-death-{(1,5,10,15,20).index(frame)}.png');bpy.ops.render.render(write_still=True)
if args.check:print('GOLEM_DEATH_POSE_CHECK_PASS',json.dumps(records));sys.exit(0)
for obj in parts.values():
 if obj.animation_data and obj.animation_data.action:
  obj.animation_data.action.name='Golem death / '+obj.name
  for curve in obj.animation_data.action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root;glb=OUT/'stone-golem-death.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='stone-golem-death',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
blend=ROOT/'art-source/defense/stone-golem-death.blend';scene['regeneration_command']='npm run models:golem-death';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
files=[FRAMES/f'golem-death-{i}.png' for i in range(5)];atlas=OUT/'stone-golem-death-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=5,scale=1280:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90',str(atlas)],check=True)
poster=OUT/'stone-golem-death.png';shutil.copyfile(files[0],poster)
hashfile=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
manifest={'source':str(blend.relative_to(ROOT)),'source_sha256':hashfile(blend),'base_source':str(SOURCE.relative_to(ROOT)),'base_source_sha256':hashfile(SOURCE),'regeneration_command':'npm run models:golem-death','reference':'public/defense/monster-models.webp','frame':{'width':384,'height':384,'ground':[192,292.91],'crop':[0,0,384,384],'orthographic_scale':scene.camera.data.ortho_scale},'clip':'stone-golem-death','duration':19/30,'baked_frames':[1,5,10,15,20],'effect_duration':.7,'initial_floor_penetration':records[0]['lowest_vertex'],'samples':records,'files':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashfile(f)} for f in [glb,atlas,poster]],'renders':[{'path':str(f.relative_to(ROOT)),'sha256':hashfile(f)} for f in files],'camera':{'location':list(scene.camera.location),'rotation_euler':list(scene.camera.rotation_euler),'samples':scene.cycles.samples,'view_transform':scene.view_settings.view_transform}}
manifest['frame']['battle_anchor']={'initial_y':297,'ground_y':292.91,'settle_seconds':.1}
manifest['delivery_frame']={'width':256,'height':256,'columns':5,'source_scale':2/3,'display_scale':384/260}
(OUT/'stone-golem-death.json').write_text(json.dumps(manifest,indent=2)+'\n');print('GOLEM_DEATH_COMPLETE')
