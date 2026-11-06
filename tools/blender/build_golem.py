"""Author the editable stone armor golem (돌 갑옷병) and bake three shared-camera pose sprites.

Run: blender -b --python tools/blender/build_golem.py
Options after --: --samples 96 --size 384 --skip-render
Silhouette follows the in-game concept (boulder body, moss, glowing eyes, oversized fist). All forms are
actual Blender geometry without image inputs. Output is a baked 2.5D sprite atlas (walk-a, walk-b, hit),
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
p.add_argument('--frames-dir',default=str(ROOT/'art-source/defense/golem-frames'))
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
FRAMES=Path(opts.frames_dir);FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Stone golem / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)

def material(name,color,rough=.8,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes['Principled BSDF']
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
ROCK=material('rock',(.34,.32,.28),.9);ROCK_DARK=material('rock shadow',(.19,.18,.16),.95);ROCK_WARM=material('rock warm',(.4,.32,.22),.9)
MOSS=material('moss',(.12,.32,.03),.85);EYE=material('ember eye',(1,.2,.02),.3,9)

def parent_to(o,parent):
 o.parent=parent
 for c in list(o.users_collection):c.objects.unlink(o)
 COL.objects.link(o)
def pivot(name,loc,parent=None):
 e=bpy.data.objects.new(name,None);e.location=loc;COL.objects.link(e)
 if parent:e.parent=parent
 return e
def rock(name,loc,scale,mat,parent,seed=0):
 # Faceted boulder: low subdivision, flat shading, a small deterministic dent per piece.
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc)
 o=bpy.context.object;o.name=name;o.scale=scale
 # Round pieces get a twist for variety; seed 1/3/5/7 pieces and the flat feet stay axis-aligned.
 o.rotation_euler=(0,0,0) if seed%2==0 or seed in (1,3,5,7) else (0,0,seed*.4)
 o.data.materials.append(ROCK_WARM if mat is ROCK and seed%3==0 else mat)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o
def moss(name,loc,r,parent):
 return rock(name,loc,(r,r*.9,r*.45),MOSS,parent,seed=len(name))

root=pivot('golem-root',(0,0,0))
hips=rock('hips',(0,0,1.45),(.95,.9,.65),ROCK_DARK,root,1)
torso=rock('torso',(.15,0,2.4),(1.25,1.15,1.0),ROCK,root,2)
rock('chest-plate',(.45,0,2.5),(.6,.75,.7),ROCK,root,3)
head=pivot('head',(.55,0,3.25),root)
rock('head-rock',(0,0,0),(.62,.58,.55),ROCK,head,4);rock('brow',(.5,0,.2),(.22,.5,.12),ROCK_DARK,head,5)
for n,y in (('eye-near',-.22),('eye-far',.22)):
 e=rock(n,(.62,y,.04),(.27,.27,.2),EYE,head,6)
moss('moss-torso',(-.1,.1,3.3),.6,root);moss('moss-shoulder',(.2,-1.2,3.35),.45,root);moss('moss-knee',(.55,-.8,.9),.35,root);moss('moss-hips',(.1,-.1,1.95),.55,root);moss('moss-back',(-.95,0,2.7),.7,root);moss('moss-chest',(.7,-.5,2.7),.45,root)
legs={};arms={}
for side,y in (('near',-.7),('far',.7)):
 leg=pivot(f'leg-{side}',(0,y,1.45),root);legs[side]=leg
 rock(f'thigh-{side}',(0,0,-.5),(.62,.58,.66),ROCK,leg,7);rock(f'shin-{side}',(.05,0,-1.0),(.55,.52,.5),ROCK_DARK,leg,8)
 rock(f'foot-{side}',(.3,0,-1.3),(.8,.6,.28),ROCK,leg,9);moss(f'moss-leg-{side}',(.05,0,-.15),.3,leg)
 arm=pivot(f'arm-{side}',(.1,y*1.7,2.9),root);arms[side]=arm
 rock(f'shoulder-{side}',(0,0,0),(.7,.65,.65),ROCK,arm,10);rock(f'forearm-{side}',(.1,0,-.85),(.52,.5,.6),ROCK_DARK,arm,11)
 rock(f'fist-{side}',(.2,0,-1.55),(.85,.75,.78) if side=='near' else (.72,.65,.68),ROCK,arm,12);moss(f'moss-arm-{side}',(0,0,.4),.3,arm)
for n,a in (('near',arms['near']),('far',arms['far'])):pass

# Pose rotations about Y (screen-pitch): negative swings forward, positive back.
POSES={'walk-a':{'leg':{'near':-24,'far':24},'arm':{'near':26,'far':-26},'lean':5,'head':-4,'loc':(0,0,0)},
       'walk-b':{'leg':{'near':24,'far':-24},'arm':{'near':-26,'far':26},'lean':5,'head':-4,'loc':(0,0,.06)},
       'hit':{'leg':{'near':10,'far':-6},'arm':{'near':48,'far':40},'lean':-13,'head':16,'loc':(-.3,0,0)}}
scene=bpy.context.scene
scene.view_settings.view_transform='Standard';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
cam_data=bpy.data.cameras.new('Golem shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.6
camera.location=(5,-10,6.9);target=Vector((0,0,1.9));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
for nm,loc,en,sz in (('key',(5,-5,8),300,3),('fill',(-6,-3,3),110,4),('rim',(-2,6,5),200,2)):
 d=bpy.data.lights.new(nm,'AREA');d.energy=en;d.size=sz;o=bpy.data.objects.new(nm,d);o.location=loc;STUDIO.objects.link(o)
 o.rotation_euler=(Vector((0,0,1.2))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
frames=[]
for name,pose in POSES.items():
 for s in ('near','far'):
  legs[s].rotation_euler=(0,math.radians(pose['leg'][s]),0);arms[s].rotation_euler=(0,math.radians(pose['arm'][s]),0)
 head.rotation_euler=(0,math.radians(pose['head']),0)
 root.rotation_euler=(0,math.radians(pose['lean']),0);root.location=pose['loc']
 bpy.context.view_layer.update()
 f=FRAMES/f'stone-golem-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'stone-golem.blend'))
atlas=OUT/'stone-golem-atlas.webp'
if not opts.skip_render:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in frames),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
dg=bpy.context.evaluated_depsgraph_get()
tris=sum(len(o.evaluated_get(dg).to_mesh().polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'stone-golem','source':'art-source/defense/stone-golem.blend','generator':'tools/blender/build_golem.py','blender':bpy.app.version_string,'kind':'baked 2.5D sprite atlas (not a GLB)','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':'stone-golem-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'evaluated_polygons':tris}
(OUT/'stone-golem.json').write_text(json.dumps(manifest,indent=1)+'\n')
print(json.dumps(manifest))
