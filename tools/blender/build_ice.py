"""Author the editable ice knight (얼음 병사) and bake three shared-camera pose sprites.

Run: blender -b --python tools/blender/build_ice.py
Options after --: --samples 96 --size 384 --skip-render
Silhouette follows the in-game concept (crystal plate armor, visor helm with crest shards, ice sword, spiked pauldrons).
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
p.add_argument('--frames-dir',default=str(ROOT/'art-source/defense/ice-frames'))
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
FRAMES=Path(opts.frames_dir);FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Ice knight / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)

def material(name,color,rough=.8,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes['Principled BSDF']
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
ICE=material('ice plate',(.2,.5,.95),.35,.25);ICE_DARK=material('ice under-armor',(.08,.18,.45),.6);ICE_PALE=material('frost edge',(.7,.9,1),.3,.5);VISOR=material('visor slit',(.02,.04,.1),.5);GLOW=material('cold eye',(.5,.95,1),.3,6)
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

root=pivot('ice-root',(0,0,0))
blob('hips',(0,0,1.4),(.85,.8,.6),ICE_DARK,root)
log('torso',(.2,0,2.4),1.05,1.8,ICE,root,(0,math.radians(8),0))
plate('breastplate',(.75,0,2.5),(.45,1.0,1.1),ICE_PALE,root,(0,math.radians(8),0))
blob('back-plate',(-.35,0,2.6),(.5,.8,.95),ICE_DARK,root)
head=pivot('head',(.65,0,3.4),root)
blob('helm',(0,0,0),(.62,.58,.62),ICE,head);plate('visor',(.46,0,.02),(.2,.62,.16),VISOR,head)
for n,y in (('eye-near',-.14),('eye-far',.14)):blob(n,(.58,y,.03),(.07,.09,.05),GLOW,head)
for i,(x,tilt) in enumerate(((-.15,-35),(.05,-15),(.25,8))):shard(f'crest-{i}',(x,0,.78),.17,.95,head,(0,math.radians(tilt),0))
for side,y in (('near',-.75),('far',.75)):
 for i in range(3):shard(f'pauldron-spike-{side}-{i}',(-.05+i*.14,y*1.25,3.1+i*.1),.15,.8,root,(math.radians(-y*40),math.radians(-10+i*18),0))
shard('back-spike-a',(-1.0,0,3.7),.2,1.3,root,(0,math.radians(-28),0));shard('back-spike-b',(-.75,.3,3.55),.16,1.0,root,(0,math.radians(-16),0));shard('back-spike-c',(-.8,-.3,3.5),.16,1.0,root,(0,math.radians(-20),0))
legs={};arms={}
for side,y in (('near',-.7),('far',.7)):
 leg=pivot(f'leg-{side}',(0,y,1.4),root);legs[side]=leg
 log(f'thigh-{side}',(0,0,-.55),.62,1.2,ICE,leg);log(f'shin-{side}',(.05,0,-1.15),.5,.9,ICE_DARK,leg);plate(f'knee-{side}',(.35,0,-.7),(.3,.55,.35),ICE_PALE,leg)
 blob(f'foot-{side}',(.3,0,-1.3),(.8,.6,.26),ICE,leg)
 arm=pivot(f'arm-{side}',(.1,y*1.7,2.9),root);arms[side]=arm
 blob(f'shoulder-{side}',(0,0,0),(.55,.5,.5),ICE,arm);log(f'forearm-{side}',(.1,0,-.85),.46,1.1,ICE_DARK,arm)
 blob(f'fist-{side}',(.2,0,-1.55),(.7,.65,.65),ICE,arm)
# Ice sword held in the near fist: blade points forward-down, so a forward arm swing reads as a slash.
blade=pivot('sword',(.25,0,-1.55),arms['near'])
plate('sword-grip',(0,0,0),(.12,.12,.5),ICE_DARK,blade);plate('sword-guard',(0,0,.28),(.2,.7,.14),ICE_PALE,blade)
shard('sword-blade',(0,0,1.45),.2,2.4,blade,(0,0,0),ICE_PALE,verts=4).scale=(.6,1.5,1)
blade.rotation_euler=(0,math.radians(55),0)

# Pose rotations about Y (screen-pitch): negative swings forward, positive back.
POSES={'walk-a':{'leg':{'near':-22,'far':22},'arm':{'near':14,'far':-24},'lean':5,'head':-4,'loc':(0,0,0)},
       'walk-b':{'leg':{'near':22,'far':-22},'arm':{'near':-4,'far':24},'lean':5,'head':-4,'loc':(0,0,.06)},
       'hit':{'leg':{'near':10,'far':-6},'arm':{'near':-70,'far':40},'lean':-12,'head':14,'loc':(-.3,0,0)}}
scene=bpy.context.scene
scene.view_settings.view_transform='Standard';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
cam_data=bpy.data.cameras.new('Ice knight shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.6
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
 f=FRAMES/f'ice-knight-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'ice-knight.blend'))
atlas=OUT/'ice-knight-atlas.webp'
if not opts.skip_render:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in frames),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
dg=bpy.context.evaluated_depsgraph_get()
tris=sum(len(o.evaluated_get(dg).to_mesh().polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'ice-knight','source':'art-source/defense/ice-knight.blend','generator':'tools/blender/build_ice.py','blender':bpy.app.version_string,'kind':'baked 2.5D sprite atlas (not a GLB)','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':'ice-knight-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'evaluated_polygons':tris}
(OUT/'ice-knight.json').write_text(json.dumps(manifest,indent=1)+'\n')
print(json.dumps(manifest))
