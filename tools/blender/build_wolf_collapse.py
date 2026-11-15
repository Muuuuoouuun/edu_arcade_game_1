"""Add a grounded collapse to a copy of the silverfrost model; preserve the trot source.
Run: npm run models:wolf-collapse. Rigid upper/lower/foot joints; no runtime IK.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/frost-wolf.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/wolf-collapse';FRAMES.mkdir(exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update();col=bpy.data.collections['Frost wolf / editable parts'];root=bpy.data.objects['wolf-root']
for obj in col.objects:obj.animation_data_clear()
neck=bpy.data.objects['neck'];head=bpy.data.objects['head'];jaw=bpy.data.objects['jaw'];tail=bpy.data.objects['tail'];legs={};knees={};feet={};anchors={}
def reparent(obj,parent):
 matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix
for key in ('near-front','far-front','near-back','far-back'):
 leg=bpy.data.objects['leg-'+key];legs[key]=leg
 # Preserve the rest transforms when splitting the original rigid leg into joints.
 leg.rotation_euler=(0,0,0);leg.location.z=1.58;bpy.context.view_layer.update()
 knee=bpy.data.objects.new('knee-'+key,None);col.objects.link(knee);knee.parent=leg;knee.location=(0,0,-.85);knees[key]=knee
 foot=bpy.data.objects.new('foot-'+key,None);col.objects.link(foot);foot.parent=leg;foot.location=(.2,0,-1.42);feet[key]=foot;bpy.context.view_layer.update()
 for obj in list(leg.children):
  if obj.name.startswith(('paw-','claw-')):reparent(obj,foot)
  elif obj.name.startswith(('lower-','ankle-fur-')):reparent(obj,knee)
 reparent(foot,knee)
 # Fit the leg segments between the hip, knee and planted foot centers.
 upper=bpy.data.objects['upper-'+key];upper.location.z=-.425;upper.scale.z=.85/.95
 lower=bpy.data.objects['lower-'+key]
 lower.scale.x=.85;lower.scale.y=.85
 lower.location=(.1,0,-.285);lower.rotation_euler=(0,-math.atan2(.2,.57),0);lower.scale.z=math.hypot(.2,.57)/.7
 bpy.context.view_layer.update()
 # Staggered fore/hind feet remain planted throughout the collapse.
 anchors[key]=Vector((leg.location.x+.2,leg.location.y,.18))
scene.render.fps=30;scene.frame_start=1;scene.frame_end=19
scene.cycles.samples=96
smooth=lambda t:(lambda x:x*x*(3-2*x))(max(0,min(1,t)))
def pose(t):
 drop=smooth(t/.38);pitch=math.radians(6*smooth(t/.36));root.location=(.08*drop,0,-.70*drop);root.rotation_euler=(0,pitch,0)
 neck.rotation_euler=(0,math.radians(-3+12*smooth(t/.30)),0);head.rotation_euler=(0,math.radians(6*smooth(t/.38)),0)
 jaw.rotation_euler=(0,math.radians(4*(1-drop)),0);tail.rotation_euler=(0,math.radians(-8*smooth(t/.48)),0)
 for name in ('eye-near','eye-far'):
  bpy.data.objects[name].scale.z=.045*(1-.88*smooth(t/.22))
  bpy.data.objects[name.replace('eye-','eye-socket-')].scale.z=.085*(1-.88*smooth(t/.22))
 bpy.context.view_layer.update()
 for key,leg in legs.items():
  target=root.matrix_world.inverted()@anchors[key]-leg.location;tx,tz=target.x,target.z
  l1=.85;l2=math.hypot(.2,.57);beta=-math.atan2(.2,.57)
  cosine=(tx*tx+tz*tz-l1*l1-l2*l2)/(2*l1*l2);assert -1<=cosine<=1,(key,t,cosine)
  bend=(-1 if 'front' in key else 1)*math.acos(cosine)
  theta=math.atan2(-tx,-tz)-math.atan2(l2*math.sin(bend),l1+l2*math.cos(bend))
  leg.rotation_euler=(0,theta,0);knees[key].rotation_euler=(0,bend-beta,0);feet[key].rotation_euler=(0,-pitch-theta-bend+beta,0)
 bpy.context.view_layer.update()
animated=[root,neck,head,jaw,tail,*legs.values(),*knees.values(),*feet.values(),bpy.data.objects['eye-near'],bpy.data.objects['eye-far'],bpy.data.objects['eye-socket-near'],bpy.data.objects['eye-socket-far']]
records=[]
for frame in range(1,20):
 scene.frame_set(frame);t=(frame-1)/30;pose(t);points=[];min_z=100;contacts={}
 for obj in col.objects:
  if obj.type=='MESH':
   for vertex in obj.data.vertices:
    world=obj.matrix_world@vertex.co;v=world_to_camera_view(scene,scene.camera,world);points.append((v.x*384,(1-v.y)*384));min_z=min(min_z,world.z)
 for key,foot in feet.items():
  center=foot.matrix_world.translation;contacts[key]=list(center);assert (center-anchors[key]).length<1e-5,(key,t,center,anchors[key])
 bounds=[min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
 assert bounds[0]>8 and bounds[1]>100 and bounds[2]<376 and bounds[3]<328,(frame,bounds)
 assert min_z>-.005,(frame,min_z,[(o.name,min((o.matrix_world@v.co).z for v in o.data.vertices)) for o in col.objects if o.type=='MESH' and min((o.matrix_world@v.co).z for v in o.data.vertices)<-.005])
 records.append({'frame':frame,'time':t,'bounds':bounds,'lowest_vertex':min_z,'feet':contacts})
 for obj in animated:
  for prop in ('location','rotation_euler','scale'):obj.keyframe_insert(data_path=prop,frame=frame)
 if frame in (1,6,11,16) and not args.check:
  scene.render.filepath=str(FRAMES/f'wolf-collapse-{(frame-1)//5}.png');bpy.ops.render.render(write_still=True)
if args.check:print('WOLF_COLLAPSE_CHECK_PASS',json.dumps(records));sys.exit(0)
for obj in animated:
 obj.animation_data.action.name='Wolf collapse / '+obj.name
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'frost-wolf-collapse.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frost-wolf-collapse',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
scene['regeneration_command']='npm run models:wolf-collapse';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art-source/defense/frost-wolf-collapse.blend'))
files=[FRAMES/f'wolf-collapse-{i}.png' for i in range(4)]
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=4','-frames:v','1','-c:v','libwebp','-quality','90',str(OUT/'frost-wolf-collapse-atlas.webp')],check=True)
shutil.copyfile(files[-1],OUT/'frost-wolf-collapse.png')
manifest={'source':'art-source/defense/frost-wolf-collapse.blend','base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'regeneration_command':'npm run models:wolf-collapse','reference':'art-source/defense/concepts/2026-10-29/beasts/silverfrost-wolf.png','frame':{'width':384,'height':384,'ground':[192,284.49],'crop':[8,100,368,228],'orthographic_scale':scene.camera.data.ortho_scale},'clip':'frost-wolf-collapse','duration':.6,'baked_frames':[1,6,11,16],'effect_duration':.7,'samples':records,'files':[]}
for f in [OUT/'frost-wolf-collapse.glb',OUT/'frost-wolf-collapse-atlas.webp',OUT/'frost-wolf-collapse.png']:manifest['files'].append({'file':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest()
manifest['renders']=[{'path':str(f.relative_to(ROOT)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files]
manifest['camera']={'location':list(scene.camera.location),'rotation_euler':list(scene.camera.rotation_euler),'samples':scene.cycles.samples,'view_transform':scene.view_settings.view_transform}
(OUT/'frost-wolf-collapse.json').write_text(json.dumps(manifest,indent=2)+'\n');print('WOLF_COLLAPSE_COMPLETE')
