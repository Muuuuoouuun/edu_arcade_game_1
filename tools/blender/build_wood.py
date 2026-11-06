"""Author the editable living-log wood soldier (나무 병사) and bake three shared-camera pose sprites.

Run: blender -b --python tools/blender/build_wood.py
Options after --: --samples 96 --size 384 --skip-render
Silhouette follows the in-game concept (hunched log body, antler branches, leaf mantle, glowing eyes, oversized fists). All forms are
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
p.add_argument('--frames-dir',default=str(ROOT/'art-source/defense/wood-frames'))
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
FRAMES=Path(opts.frames_dir);FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Wood soldier / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)

def material(name,color,rough=.8,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes['Principled BSDF']
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
BARK=material('bark',(.36,.19,.08),.9);BARK_DARK=material('bark shadow',(.2,.1,.05),.95);BARK_LIGHT=material('bark light',(.5,.3,.14),.9)
LEAF=material('leaf',(.18,.5,.06),.8);LEAF_LIGHT=material('leaf light',(.42,.62,.1),.8);EYE=material('ember eye',(1,.35,.02),.3,5);MOUTH=material('mouth glow',(.9,.2,.02),.4,3)

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
def branch(name,loc,r,depth,parent,rot):
 bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,radius2=r*.12,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(BARK_LIGHT)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o
def leaves(name,loc,r,parent,mat=None):
 return blob(name,loc,(r,r*.95,r*.55),mat or LEAF,parent)

root=pivot('wood-root',(0,0,0))
hips=blob('hips',(0,0,1.4),(.85,.8,.6),BARK_DARK,root)
torso=log('torso',(.2,0,2.4),1.05,1.8,BARK,root,(0,math.radians(8),0))
blob('chest-bulge',(.55,0,2.5),(.55,.7,.65),BARK_LIGHT,root)
head=pivot('head',(.65,0,3.35),root)
blob('head-log',(0,0,0),(.6,.55,.55),BARK,head);blob('jaw',(.38,0,-.22),(.3,.42,.16),BARK_DARK,head);blob('mouth',(.62,0,-.2),(.1,.3,.08),MOUTH,head)
for i,ty in enumerate((-.2,-.07,.07,.2)):branch(f'tooth-{i}',(.66,ty,-.12),.045,.14,head,(0,math.radians(180),0))
for n,y in (('eye-near',-.22),('eye-far',.22)):
 blob(n,(.55,y,.08),(.2,.16,.14),EYE,head)
for i,(x,y,tilt) in enumerate(((-.1,-.25,-25),(-.2,.25,-35),(.1,0,-10))):
 branch(f'antler-{i}',(x,y,.8),.14,1.1,head,(math.radians(y*60),math.radians(tilt),0))
leaves('leaf-back',(-.9,0,3.0),.95,root);leaves('leaf-shoulder',(-.2,.5,3.55),.65,root,LEAF_LIGHT);leaves('leaf-shoulder-near',(.1,-.85,3.5),.5,root)
leaves('leaf-chest',(.7,-.45,2.95),.4,root,LEAF_LIGHT);leaves('leaf-hips',(.0,.2,1.95),.5,root,LEAF_LIGHT);leaves('leaf-knee',(.55,-.8,.9),.3,root)
branch('back-branch-a',(-1.0,.15,3.9),.17,1.3,root,(0,math.radians(-20),0));branch('back-branch-b',(-.7,-.2,4.0),.14,1.1,root,(0,math.radians(10),0))
legs={};arms={}
for side,y in (('near',-.7),('far',.7)):
 leg=pivot(f'leg-{side}',(0,y,1.4),root);legs[side]=leg
 log(f'thigh-{side}',(0,0,-.55),.62,1.2,BARK,leg);log(f'shin-{side}',(.05,0,-1.15),.5,.9,BARK_DARK,leg)
 blob(f'foot-{side}',(.3,0,-1.3),(.8,.6,.26),BARK_LIGHT,leg);leaves(f'leaf-leg-{side}',(.05,0,-.15),.28,leg)
 arm=pivot(f'arm-{side}',(.1,y*1.7,2.9),root);arms[side]=arm
 blob(f'shoulder-{side}',(0,0,0),(.65,.6,.6),BARK,arm);log(f'forearm-{side}',(.1,0,-.85),.46,1.1,BARK_DARK,arm)
 blob(f'fist-{side}',(.2,0,-1.55),(.85,.75,.78) if side=='near' else (.72,.65,.68),BARK_LIGHT,arm)
 for i,dy in enumerate((-.3,0,.3)):branch(f'finger-{side}-{i}',(.55,dy*.8,-1.7),.1,.5,arm,(0,math.radians(90),0))

# Pose rotations about Y (screen-pitch): negative swings forward, positive back.
POSES={'walk-a':{'leg':{'near':-24,'far':24},'arm':{'near':26,'far':-26},'lean':5,'head':-4,'loc':(0,0,0)},
       'walk-b':{'leg':{'near':24,'far':-24},'arm':{'near':-26,'far':26},'lean':5,'head':-4,'loc':(0,0,.06)},
       'hit':{'leg':{'near':10,'far':-6},'arm':{'near':48,'far':40},'lean':-13,'head':16,'loc':(-.3,0,0)}}
scene=bpy.context.scene
scene.view_settings.view_transform='Standard';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
cam_data=bpy.data.cameras.new('Wood soldier shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.6
camera.location=(5,-10,6.9);target=Vector((0,0,2.0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
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
 f=FRAMES/f'wood-soldier-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'wood-soldier.blend'))
atlas=OUT/'wood-soldier-atlas.webp'
if not opts.skip_render:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in frames),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
dg=bpy.context.evaluated_depsgraph_get()
tris=sum(len(o.evaluated_get(dg).to_mesh().polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'wood-soldier','source':'art-source/defense/wood-soldier.blend','generator':'tools/blender/build_wood.py','blender':bpy.app.version_string,'kind':'baked 2.5D sprite atlas (not a GLB)','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':'wood-soldier-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'evaluated_polygons':tris}
(OUT/'wood-soldier.json').write_text(json.dumps(manifest,indent=1)+'\n')
print(json.dumps(manifest))
