"""Articulate a flat-paw directional trot; preserve the original wolf and collapse.
Run: npm run models:wolf-stride. Rigid upper/lower/foot joints; no runtime IK.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/frost-wolf.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/wolf-stride';FRAMES.mkdir(exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update();col=bpy.data.collections['Frost wolf / editable parts'];root=bpy.data.objects['wolf-root']
for obj in col.objects:obj.animation_data_clear()
neck=bpy.data.objects['neck'];head=bpy.data.objects['head'];jaw=bpy.data.objects['jaw'];tail=bpy.data.objects['tail'];legs={};knees={};feet={};anchors={}
def reparent(obj,parent):
 matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix
for key in ('near-front','far-front','near-back','far-back'):
 leg=bpy.data.objects['leg-'+key];legs[key]=leg
 # Preserve the rest transforms when splitting the original rigid leg into joints.
 leg.rotation_euler=(0,0,0);leg.location.z=1.48;bpy.context.view_layer.update()
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
 # Rest anchors are preserved for the articulated joints.
 anchors[key]=Vector((leg.location.x+.2,leg.location.y,.18))
# Move a planted foot backwards at the authored travel speed; recover it above the floor.
scene.render.fps=100;scene.frame_start=1;scene.frame_end=81;scene.cycles.samples=48;scene.render.threads_mode='FIXED';scene.render.threads=4
stride=1.68;duration=.8;ground_z=.16
phase_offsets={'near-front':0,'far-back':0,'far-front':.5,'near-back':.5}
smooth=lambda t:t*t*(3-2*t)
def pose(cycle):
 phase=cycle%1;pitch=.012*math.sin(phase*math.tau*2)
 root.location=(0,0,.02*math.sin(phase*math.tau*2)**2);root.rotation_euler=(0,pitch,0)
 neck.rotation_euler=(0,math.radians(-3)+.025*math.sin(phase*math.tau*2-.35),0)
 head.rotation_euler=(0,0,0);jaw.rotation_euler=(0,math.radians(4),0)
 tail.rotation_euler=(.07*math.sin(phase*math.tau-.35),.025*math.sin(phase*math.tau*2-.4),0)
 bpy.context.view_layer.update();contacts={}
 for key,leg in legs.items():
  p=(cycle+phase_offsets[key])%1;support=p<.5
  q=(p-.5)*2;forward=.42-stride*p if support else -.42+.84*smooth(q)
  lift=0 if support else .22*math.sin(math.pi*q)**2
  anchor=Vector((leg.location.x+.15+forward,leg.location.y,ground_z+lift))
  target=root.matrix_world.inverted()@anchor-leg.location;tx,tz=target.x,target.z
  l1=.85;l2=math.hypot(.2,.57);beta=-math.atan2(.2,.57)
  cosine=(tx*tx+tz*tz-l1*l1-l2*l2)/(2*l1*l2);assert -1<=cosine<=1,(key,cycle,cosine)
  bend=(-1 if 'front' in key else 1)*math.acos(cosine)
  theta=math.atan2(-tx,-tz)-math.atan2(l2*math.sin(bend),l1+l2*math.cos(bend))
  leg.rotation_euler=(0,theta,0);knees[key].rotation_euler=(0,bend-beta,0);feet[key].rotation_euler=(0,-pitch-theta-bend+beta,0)
  contacts[key]={'stance':support,'target':list(anchor)}
 bpy.context.view_layer.update();return contacts
animated=[root,neck,head,jaw,tail,*legs.values(),*knees.values(),*feet.values()]
records=[];max_error=0;max_tilt=0
for frame in range(1,82):
 scene.frame_set(frame);cycle=(frame-1)/80;contacts=pose(cycle)
 for key,foot in feet.items():
  center=foot.matrix_world.translation;error=(center-Vector(contacts[key]['target'])).length;max_error=max(max_error,error);assert error<1e-5
  up=(foot.matrix_world.to_3x3()@Vector((0,0,1))).normalized();tilt=up.angle(Vector((0,0,1)));max_tilt=max(max_tilt,tilt);assert tilt<1e-4
  contacts[key]['center']=list(center);contacts[key]['travel_center']=list(center+Vector((stride*cycle,0,0)))
  paw=bpy.data.objects['paw-'+key];bottom=min((paw.matrix_world@v.co).z for v in paw.data.vertices);assert bottom>=-.0001,(key,frame,bottom);contacts[key]['lowest_paw']=bottom
 records.append({'frame':frame,'cycle':cycle,'feet':contacts})
 for obj in animated:
  for prop in ('location','rotation_euler','scale'):obj.keyframe_insert(data_path=prop,frame=frame)
# A stance foot stays at a fixed world X when the body advances one stride per cycle.
max_stance_drift=0
for key in feet:
 run=[]
 for row in records:
  foot=row['feet'][key]
  if foot['stance'] and row['cycle']<1:
   if run:max_stance_drift=max(max_stance_drift,abs(foot['travel_center'][0]-run[0]))
   run.append(foot['travel_center'][0])
  else:run=[]
assert max_stance_drift<1e-5
for obj in animated:
 obj.animation_data.action.name='Frost wolf stride / '+obj.name
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()
# Rotate a parent so the authored root pitch and body weight transfer remain intact.
heading=bpy.data.objects.new('wolf-heading',None);col.objects.link(heading);root.parent=heading
camera=scene.camera
camera.data.ortho_scale*=1.12
reference_width=315/1.12
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
manifest={'source':'art-source/defense/frost-wolf-stride.blend','generator':'tools/blender/build_frostwolf_stride.py','regeneration_command':'npm run models:wolf-stride','base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'reference':'art-source/defense/concepts/2026-10-29/beasts/silverfrost-wolf.png','frame':{'width':384,'height':384,'ground':list(ground),'crop':[8,40,368,304],'orthographic_scale':camera.data.ortho_scale,'display_scale':368/reference_width},'delivery_frame':{'width':256,'height':256,'ground':list(ground*2/3)},'clip':'frost-wolf-stride','duration':duration,'model_stride':stride,'foot_center_height':ground_z,'samples':records,'checks':{'frames':81,'max_target_error':max_error,'max_paw_tilt_radians':max_tilt,'max_stance_travel_drift':max_stance_drift},'render':{'engine':'Cycles CPU','samples':48},'directions':[],'files':[]}
for direction in range(8):
 world=inverse@Vector((math.cos(direction*math.tau/8),math.sin(direction*math.tau/8)));world.normalize();heading.rotation_euler.z=math.atan2(world.y,world.x);bpy.context.view_layer.update()
 projected=(project(heading.matrix_world@Vector((stride,0,0)))-ground).length/reference_width
 entry={'direction':direction,'yaw':heading.rotation_euler.z,'stride_per_display_size':projected,'poses':[]};frames=[]
 for index in range(8):
  scene.frame_set(1+index*10);bpy.context.view_layer.update();points=[]
  for obj in col.objects:
   if obj.type=='MESH':
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());points.extend(project(ev.matrix_world@v.co) for v in ev.data.vertices)
  bounds=[min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)]
  assert bounds[0]>8 and bounds[1]>40 and bounds[2]<376 and bounds[3]<344,(direction,index,bounds)
  entry['poses'].append({'frame':index,'bounds':bounds});path=FRAMES/f'frost-stride-{direction}-{index}.png';frames.append(path)
  if not args.check:scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not args.check:
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(p)] for p in frames),[]),'-filter_complex','hstack=inputs=8,scale=2048:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90',str(OUT/f'frost-stride-{direction}-atlas.webp')],check=True)
 print('DIRECTION_DONE',direction,flush=True)
if args.check:print('FROST_STRIDE_CHECK_PASS',json.dumps(manifest['checks']));sys.exit(0)
heading.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in col.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'frost-wolf-stride.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frost-wolf-stride',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
scene['regeneration_command']='npm run models:wolf-stride';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/'frost-stride-0-0.png',OUT/'frost-wolf-stride.png')
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest();manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();manifest['reference_sha256']=hashlib.sha256((ROOT/manifest['reference']).read_bytes()).hexdigest()
for f in [OUT/'frost-wolf-stride.glb',OUT/'frost-wolf-stride.png',*sorted(OUT.glob('frost-stride-*-atlas.webp')),*sorted(FRAMES.glob('*.png'))]:manifest['files'].append({'file':str(f.relative_to(ROOT)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(OUT/'frost-wolf-stride.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ROOT/'src/games/defense/frostWolfGait.ts').write_text('// Generated by tools/blender/build_frostwolf_stride.py. Projected cycle length per displayed size.\nexport const FROST_WOLF_STRIDE = '+json.dumps([round(d['stride_per_display_size'],9) for d in manifest['directions']])+' as const;\nexport const FROST_WOLF_FRAME = '+json.dumps({'crop':[8*2/3,40*2/3,368*2/3,304*2/3],'ground_y':ground.y*2/3,'display_scale':368/reference_width})+' as const;\n')
print('FROST_STRIDE_COMPLETE',flush=True)
