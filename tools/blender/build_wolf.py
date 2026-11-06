"""Build a concept-led silverfrost wolf with articulated trot and battle atlases.
Reference: concepts/2026-10-29/beasts/silverfrost-wolf.png and the monster variant.
Run: blender -b --python tools/blender/build_wolf.py -- --samples 64
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/defense/models'
SOURCE=ROOT/'art-source/defense'
p=argparse.ArgumentParser()
p.add_argument('--samples',type=int,default=96)
p.add_argument('--size',type=int,default=384)
p.add_argument('--frames-dir',default=str(ROOT/'art-source/defense/wolf-frames'))
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
FRAMES=Path(opts.frames_dir);FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Frost wolf / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)

def material(name,color,rough=.8,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes['Principled BSDF']
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
ICE=material('small frost accents',(.35,.67,.76),.45,.1);ICE_DARK=material('charcoal paws',(.10,.14,.18),.9);ICE_PALE=material('frost tips',(.72,.85,.88),.7)
FUR=material('silver white fur',(.9,.92,.94),.95,.12);FUR_DARK=material('cool grey underfur',(.30,.35,.40),.95);MOUTH=material('mouth shadow',(.06,.055,.055),.85);GLOW=material('pale blue eye',(.3,.7,.8),.45,.65)

def parent_to(o,parent):
 o.parent=parent
 for c in list(o.users_collection):c.objects.unlink(o)
 COL.objects.link(o)
def pivot(name,loc,parent=None):
 e=bpy.data.objects.new(name,None);e.location=loc;COL.objects.link(e)
 if parent:e.parent=parent
 return e
def blob(name,loc,scale,mat,parent,rot=(0,0,0)):
 # Faceted lump: low subdivision, flat shading.
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc)
 o=bpy.context.object;o.name=name;o.scale=scale;o.rotation_euler=rot;o.data.materials.append(mat)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o
def log(name,loc,r,depth,mat,parent,rot=(0,0,0)):
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r,radius2=r*.78,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(mat)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o

def shard(name,loc,r,depth,parent,rot,mat=None,verts=5):
 bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r*.08,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(mat or ICE_PALE)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o
def plate(name,loc,scale,mat,parent,rot=(0,0,0)):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
 o=bpy.context.object;o.name=name;o.scale=scale;o.rotation_euler=rot;o.data.materials.append(mat)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o

root=pivot('wolf-root',(0,0,0))
# Native facing is +X; near side is -Y (camera side).
blob('chest',(.8,0,1.85),(1.0,.64,.86),FUR,root)
blob('haunch',(-.85,0,1.75),(.9,.57,.70),FUR,root)
blob('belly',(0,0,1.6),(1.3,.47,.52),FUR_DARK,root)
neck=pivot('neck',(1.45,0,2.15),root)
head=pivot('head',(.5,0,.05),neck)
blob('neck-fur',(0,0,0),(.68,.52,.62),FUR,neck)
blob('skull',(0,0,0),(.6,.43,.45),FUR,head)
blob('snout',(.62,0,-.12),(.53,.24,.22),FUR,head)
blob('nose',(1.1,0,-.05),(.14,.12,.1),ICE_DARK,head)
jaw=pivot('jaw',(.45,0,-.2),head)
blob('lower-jaw',(.3,0,-.1),(.4,.22,.1),MOUTH,jaw)
for i in range(3):shard(f'fang-{i}',(.15+i*.2,-.12,.08),.05,.22,jaw,(math.pi,0,0),ICE_PALE,verts=4)
for n,y in (('near',-.4),('far',.4)):
 blob(f'eye-socket-{n}',(.43,y*.66,.13),(.095,.06,.085),ICE_DARK,head)
 blob(f'eye-{n}',(.45,y*.72,.14),(.055,.035,.045),GLOW,head)
 shard(f'ear-{n}',(-.05,y*.9,.55),.17,.58,head,(0,math.radians(-12),0),FUR_DARK,verts=4)
# Swept fur tufts follow the white-fur concept; frost is a small edge accent.
for i in range(7):
 x=1.35-i*.48
 shard(f'mane-tuft-{i}',(x,0,2.48-abs(i-2)*.07),.28-i*.012,.80-i*.055,root,(0,math.radians(-44-i*3),0),FUR)
for i in range(3):
 for y in (-.48,.48):
  shard(f'ruff-{i}-{y}',(1.35-i*.38,y,2.32),.23,.72,root,(math.radians(y*65),math.radians(-55),0),FUR)
for y in (-.35,.35):
 shard(f'cheek-fur-{y}',(-.1,y,-.03),.17,.5,head,(0,math.radians(-68),math.radians(y*25)),FUR)
tail=pivot('tail',(-1.7,0,1.85),root)
for i,(x,z,r) in enumerate(((-.28,-.05,.36),(-.60,-.18,.31),(-.9,-.38,.22))):
 blob(f'tail-fur-{i}',(x,0,z),(r*1.5,r,r),FUR,tail)
for i in range(3):
 shard(f'tail-tip-{i}',(-.55-i*.21,0,-.1-i*.12),.16,.52,tail,(0,math.radians(-118),0),FUR)
legs={}
for key,(x,y,front) in {'near-front':(1.0,-.55,1),'far-front':(1.0,.55,1),'near-back':(-1.0,-.55,0),'far-back':(-1.0,.55,0)}.items():
 leg=pivot(f'leg-{key}',(x,y,1.65),root);legs[key]=leg
 log(f'upper-{key}',(0,0,-.45),.27,.95,FUR,leg);log(f'lower-{key}',(.05,0,-1.0),.18,.7,FUR_DARK,leg)
 blob(f'paw-{key}',(.20,0,-1.42),(.38,.27,.16),ICE_DARK,leg)
 for c in range(3):shard(f'claw-{key}-{c}',(.49,(c-1)*.12,-1.44),.035,.18,leg,(0,math.radians(90),0),ICE_PALE,verts=4)
 shard(f'ankle-fur-{key}',(.03,0,-.9),.18,.45,leg,(0,math.radians(-18),0),FUR)

# Legacy fallback poses: swing about Y; hit uses a short backward recoil.
POSES={'walk-a':{'leg':{'near-front':-32,'far-front':26,'near-back':26,'far-back':-30},'tail':8,'neck':-4,'jaw':8,'lean':0,'loc':(0,0,0)},
       'walk-b':{'leg':{'near-front':26,'far-front':-32,'near-back':-30,'far-back':26},'tail':-8,'neck':-8,'jaw':10,'lean':0,'loc':(0,0,.1)},
       'hit':{'leg':{'near-front':-20,'far-front':-26,'near-back':12,'far-back':18},'tail':6,'neck':-14,'jaw':20,'lean':-8,'loc':(-.15,0,0)}}
leg_rest={key:leg.location.copy() for key,leg in legs.items()}
offsets={'near-front':0,'far-back':0,'far-front':math.pi,'near-back':math.pi}
def apply_trot(phase):
 root.location=(0,0,.045*abs(math.sin(phase*2)))
 root.rotation_euler=(math.radians(.6*math.sin(phase)),math.radians(1.4*math.sin(phase*2)),0)
 neck.rotation_euler=(0,math.radians(-3+2*math.sin(phase*2-.35)),0)
 jaw.rotation_euler=(0,math.radians(4),0)
 tail.rotation_euler=(math.radians(6*math.sin(phase-.35)),math.radians(3*math.sin(phase*2-.4)),0)
 for key,leg in legs.items():
  leg.location=leg_rest[key];leg.rotation_euler=(0,math.radians(25*math.cos(phase+offsets[key])),0)
 bpy.context.view_layer.update()
 for key,leg in legs.items():
  paw=bpy.data.objects[f'paw-{key}']
  lowest=min((paw.matrix_world@v.co).z for v in paw.data.vertices)
  lift=max(0,math.sin(phase+offsets[key]))*.30
  leg.location+=root.matrix_world.inverted().to_3x3()@Vector((0,0,lift-lowest))
 bpy.context.view_layer.update()

scene=bpy.context.scene
scene.view_settings.view_transform='Standard';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
cam_data=bpy.data.cameras.new('Frost wolf shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.4
camera.location=(5,-10,6.9);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
for nm,loc,en,sz in (('key',(5,-5,8),300,3),('fill',(-6,-3,3),110,4),('rim',(-2,6,5),200,2)):
 d=bpy.data.lights.new(nm,'AREA');d.energy=en;d.size=sz;o=bpy.data.objects.new(nm,d);o.location=loc;STUDIO.objects.link(o)
 o.rotation_euler=(Vector((0,0,1.2))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
frames=[]
for name,pose in POSES.items():
 for k,leg in legs.items():
  leg.location=leg_rest[k];leg.rotation_euler=(0,math.radians(pose['leg'][k]),0)
 tail.rotation_euler=(0,math.radians(pose['tail']),0);neck.rotation_euler=(0,math.radians(pose['neck']),0);jaw.rotation_euler=(0,math.radians(pose['jaw']),0)
 root.rotation_euler=(0,math.radians(pose['lean']),0);root.location=pose['loc']
 bpy.context.view_layer.update()
 f=FRAMES/f'frost-wolf-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
walk_frames=[]
for index in range(8):
 apply_trot(index*math.tau/8)
 f=FRAMES/f'frost-wolf-trot-{index}.png';walk_frames.append(f)
 for obj in COL.objects:
  if obj.type!='MESH':continue
  for vertex in obj.data.vertices:
   point=world_to_camera_view(scene,camera,obj.matrix_world@vertex.co)
   assert .004<point.x<.996 and .004<point.y<.996,(index,obj.name,tuple(point))
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
def atlas(files,destination):
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex',f'hstack=inputs={len(files)}','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(destination)],check=True)
if not opts.skip_render:
 atlas(frames,OUT/'frost-wolf-atlas.webp');atlas(walk_frames,OUT/'frost-wolf-trot-atlas.webp')
 shutil.copyfile(walk_frames[0],OUT/'frost-wolf.png')
scene.render.fps=30;scene.frame_start=1;scene.frame_end=25
animated=[root,neck,jaw,tail,*legs.values()]
for frame in range(1,26):
 apply_trot((frame-1)/24*math.tau)
 for obj in animated:
  obj.keyframe_insert(data_path='location',frame=frame);obj.keyframe_insert(data_path='rotation_euler',frame=frame)
for obj in animated:
 obj.animation_data.action.name=f'Frost wolf trot / {obj.name}'
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in COL.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'frost-wolf.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frost-wolf-trot',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'frost-wolf.blend'))
manifest={'id':'frost-wolf','source':'art-source/defense/frost-wolf.blend','generator':'tools/blender/build_wolf.py','reference':'art-source/defense/concepts/2026-10-29/beasts/silverfrost-wolf.png','blender':bpy.app.version_string,'kind':'articulated GLB and baked 2.5D atlases','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale,'common_crop':[8,100,368,228]},'atlas':{'file':'frost-wolf-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'walk':{'file':'frost-wolf-trot-atlas.webp','frames':8,'width':opts.size*8,'height':opts.size,'stride_world':40,'clip':'frost-wolf-trot','duration_seconds':.8,'rig':'articulated rigid parts; diagonal trot, no skin'},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'polygons':sum(len(o.data.polygons) for o in COL.objects if o.type=='MESH')}
manifest['files']=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OUT/'frost-wolf-atlas.webp',OUT/'frost-wolf-trot-atlas.webp',OUT/'frost-wolf.glb'] if p.exists()]
(OUT/'frost-wolf.json').write_text(json.dumps(manifest,indent=1)+'\n')
print('ARCANA_WOLF_COMPLETE',json.dumps(manifest))
