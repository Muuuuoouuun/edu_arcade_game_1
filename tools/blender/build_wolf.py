"""Author the editable frost wolf (서리늑대) and bake three shared-camera pose sprites.

Run: blender -b --python tools/blender/build_wolf.py
Options after --: --samples 96 --size 384 --skip-render
Silhouette follows the in-game concept (pale fur, blue crystal spine crest and tail, ice-crystal paws, red eyes, open snarl).
All forms are actual Blender geometry without image inputs. Output is a baked 2.5D sprite atlas (walk-a, walk-b, hit),
not a runtime 3D model. Native facing is screen-right.
"""
import argparse, json, math, subprocess, sys
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
ICE=material('ice crystal',(.05,.35,1),.3,.5);ICE_DARK=material('ice shadow',(.06,.16,.5),.6);ICE_PALE=material('frost edge',(.7,.9,1),.3,.5);FUR=material('pale fur',(.66,.74,.92),.9,.1);FUR_DARK=material('fur shade',(.3,.4,.68),.9,.05);MOUTH=material('mouth',(.35,.03,.05),.6);GLOW=material('red eye',(1,.1,.08),.3,6)
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
blob('chest',(.8,0,1.85),(1.15,.85,1.0),FUR,root)
blob('haunch',(-.85,0,1.75),(1.1,.82,.9),FUR,root)
blob('belly',(0,0,1.6),(1.4,.7,.7),FUR_DARK,root)
neck=pivot('neck',(1.45,0,2.15),root)
head=pivot('head',(.5,0,.05),neck)
blob('neck-fur',(0,0,0),(.7,.6,.6),FUR,neck)
blob('skull',(0,0,0),(.66,.56,.54),FUR,head)
blob('snout',(.62,0,-.12),(.55,.3,.26),FUR,head)
blob('nose',(1.1,0,-.05),(.14,.12,.1),ICE_DARK,head)
jaw=pivot('jaw',(.45,0,-.2),head)
blob('lower-jaw',(.3,0,-.1),(.4,.22,.1),MOUTH,jaw)
for i in range(3):shard(f'fang-{i}',(.15+i*.2,-.12,.08),.05,.22,jaw,(math.pi,0,0),ICE_PALE,verts=4)
for n,y in (('near',-.4),('far',.4)):
 blob(f'eye-{n}',(.52,y*.9,.16),(.13,.1,.1),GLOW,head)
 shard(f'ear-{n}',(-.05,y*.9,.55),.2,.55,head,(0,math.radians(-12),0),FUR_DARK,verts=4)
# Crystal mane and spine run from the neck to the tail, as in the concept.
for i in range(7):
 x=1.4-i*.5;shard(f'spine-{i}',(x,0,2.6-abs(i-2)*.08),.4-i*.02,1.7-i*.09,root,(0,math.radians(-25-i*3),0),ICE)
for i in range(3):
 for y in (-.45,.45):shard(f'spine-side-{i}-{y}',(1.0-i*.55,y*1.1,2.5),.24,1.1,root,(math.radians(y*60),math.radians(-30),0),ICE)
tail=pivot('tail',(-1.7,0,2.0),root)
for i,(x,z,s) in enumerate(((-.3,.1,.34),(-.65,.3,.3),(-1.0,.5,.24))):blob(f'tail-fur-{i}',(x,0,z),(s*1.4,s,s),FUR,tail)
for i in range(4):shard(f'tail-crystal-{i}',(-.5-i*.2,0,.25+i*.15),.3,1.4,tail,(0,math.radians(-100-i*8),0),ICE)
legs={}
for key,(x,y,front) in {'near-front':(1.0,-.55,1),'far-front':(1.0,.55,1),'near-back':(-1.0,-.55,0),'far-back':(-1.0,.55,0)}.items():
 leg=pivot(f'leg-{key}',(x,y,1.65),root);legs[key]=leg
 log(f'upper-{key}',(0,0,-.45),.4,.95,FUR,leg);log(f'lower-{key}',(.05,0,-1.0),.3,.7,ICE_DARK,leg)
 blob(f'paw-{key}',(.22,0,-1.38),(.55,.36,.2),ICE,leg)
 for c in range(3):shard(f'claw-{key}-{c}',(.65,(c-1)*.14,-1.4),.05,.3,leg,(0,math.radians(90),0),ICE_PALE,verts=4)
 blob(f'crystal-{key}',(.0,0,-.9),(.2,.45,.35),ICE,leg)

# Gallop stride: swing about Y, negative swings forward. hit = rear-up snarl.
POSES={'walk-a':{'leg':{'near-front':-32,'far-front':26,'near-back':26,'far-back':-30},'tail':8,'neck':-4,'jaw':8,'lean':0,'loc':(0,0,0)},
       'walk-b':{'leg':{'near-front':26,'far-front':-32,'near-back':-30,'far-back':26},'tail':-8,'neck':-8,'jaw':10,'lean':0,'loc':(0,0,.1)},
       'hit':{'leg':{'near-front':-60,'far-front':-70,'near-back':8,'far-back':14},'tail':6,'neck':-38,'jaw':40,'lean':-22,'loc':(.7,0,.25)}}
scene=bpy.context.scene
scene.view_settings.view_transform='Standard';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
cam_data=bpy.data.cameras.new('Ice knight shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.4
camera.location=(5,-10,6.9);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
for nm,loc,en,sz in (('key',(5,-5,8),300,3),('fill',(-6,-3,3),110,4),('rim',(-2,6,5),200,2)):
 d=bpy.data.lights.new(nm,'AREA');d.energy=en;d.size=sz;o=bpy.data.objects.new(nm,d);o.location=loc;STUDIO.objects.link(o)
 o.rotation_euler=(Vector((0,0,1.2))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
frames=[]
for name,pose in POSES.items():
 for k,leg in legs.items():leg.rotation_euler=(0,math.radians(pose['leg'][k]),0)
 tail.rotation_euler=(0,math.radians(pose['tail']),0);neck.rotation_euler=(0,math.radians(pose['neck']),0);jaw.rotation_euler=(0,math.radians(pose['jaw']),0)
 root.rotation_euler=(0,math.radians(pose['lean']),0);root.location=pose['loc']
 bpy.context.view_layer.update()
 f=FRAMES/f'frost-wolf-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'frost-wolf.blend'))
atlas=OUT/'frost-wolf-atlas.webp'
if not opts.skip_render:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in frames),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
dg=bpy.context.evaluated_depsgraph_get()
tris=sum(len(o.evaluated_get(dg).to_mesh().polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'frost-wolf','source':'art-source/defense/frost-wolf.blend','generator':'tools/blender/build_wolf.py','blender':bpy.app.version_string,'kind':'baked 2.5D sprite atlas (not a GLB)','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':'frost-wolf-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'evaluated_polygons':tris}
(OUT/'frost-wolf.json').write_text(json.dumps(manifest,indent=1)+'\n')
print(json.dumps(manifest))
