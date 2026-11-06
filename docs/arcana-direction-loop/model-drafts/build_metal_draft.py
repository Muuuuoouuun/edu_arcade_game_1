"""Author the editable metal soldier (금속 병사, base form) and bake three shared-camera pose sprites.

DRAFT from the 3-hour direction loop (cycle 30). Copy to tools/blender/build_metal.py to use.
Run: blender -b --python tools/blender/build_metal.py
Options after --: --samples 96 --size 384 --skip-render
Silhouette follows the current illustrated sprite (atlas.png cell 13): rounded riveted plate armour,
shoulders wider than the torso, brass rims, one horizontal orange visor slit, rust only on edges.
It must read as smooth metal next to the faceted stone golem at 64px: smooth shading, metallic
highlights, an inverted-triangle torso and a straight visor line. Same camera, light and ortho
scale (6.6) as build_golem.py. All forms are Blender geometry without image inputs. Output is a
baked 2.5D sprite atlas (walk-a, walk-b, hit), not a runtime 3D model. Native facing is screen-right.
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
p.add_argument('--frames-dir',default=str(ROOT/'art-source/defense/metal-frames'))
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
FRAMES=Path(opts.frames_dir);FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Metal soldier / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)

def material(name,color,rough=.8,emission=0,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes['Principled BSDF']
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
# Plate #7a7f86, brass #c89b52, rust #8a5a3a, visor #f08a3c (cycle 10 palette), tuned for the shared studio light.
PLATE=material('plate steel',(.55,.58,.63),.28,metal=.75);PLATE_DARK=material('plate shadow',(.2,.22,.25),.4,metal=.7)
BRASS=material('brass rim',(.62,.42,.16),.3,metal=1);RUST=material('rust edge',(.33,.15,.07),.85)
VISOR=material('visor glow',(1,.3,.05),.3,1.8);SLIT=material('visor slit',(.03,.03,.035),.6)

def parent_to(o,parent):
 o.parent=parent
 for c in list(o.users_collection):c.objects.unlink(o)
 COL.objects.link(o)
def pivot(name,loc,parent=None):
 e=bpy.data.objects.new(name,None);e.location=loc;COL.objects.link(e)
 if parent:e.parent=parent
 return e
def shell(name,loc,scale,mat,parent,rot=(0,0,0)):
 # Smooth plate: a UV sphere, smooth shaded, so it reads as polished metal against the faceted golem.
 bpy.ops.mesh.primitive_uv_sphere_add(segments=14,ring_count=8,radius=1,location=loc)
 o=bpy.context.object;o.name=name;o.scale=scale;o.rotation_euler=rot;o.data.materials.append(mat)
 bpy.ops.object.shade_smooth();parent_to(o,parent);return o
def can(name,loc,r,depth,mat,parent,rot=(0,0,0),r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=r,radius2=r2 if r2 is not None else r,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(mat)
 bpy.ops.object.shade_smooth();parent_to(o,parent);return o
def rim(name,loc,r,thick,parent,rot=(0,0,0)):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=thick,major_segments=16,minor_segments=4,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(BRASS)
 bpy.ops.object.shade_smooth();parent_to(o,parent);return o
def rivet(name,loc,parent,r=.075):
 return shell(name,loc,(r,r,r),BRASS,parent)

root=pivot('metal-soldier',(0,0,0))
body=pivot('body',(0,0,0),root)
shell('hips',(0,0,1.5),(.78,.72,.45),PLATE_DARK,body)
can('torso',(.08,0,2.35),.62,1.15,PLATE,body,r2=.95)
shell('torso-top',(.08,0,2.9),(.95,.92,.32),PLATE,body)
rim('belt',(.08,0,1.82),.8,.07,body)
shell('chest-plate',(.62,0,2.5),(.34,.66,.6),PLATE,body)
for i,(y,z) in enumerate(((-.42,2.82),(0,2.9),(.42,2.82),(-.48,2.15),(.48,2.15))):rivet(f'chest-rivet-{i}',(.9,y,z),body)
shell('rust-belly',(.72,-.35,1.95),(.16,.22,.08),RUST,body,(0,.5,0))
head=pivot('head',(.48,0,3.42),root)
shell('helm',(0,0,0),(.5,.48,.46),PLATE,head)
rim('helm-rim',(0,0,-.18),.47,.05,head)
for i,(x,y,yaw) in enumerate(((.44,0,0),(.33,-.3,-48),(.33,.3,48))):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,.02));o=bpy.context.object;o.name=f'visor-slit-{i}';o.scale=(.1,.34,.13);o.rotation_euler=(0,0,math.radians(yaw));o.data.materials.append(SLIT);parent_to(o,head)
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x*1.08,y*1.08,.02));o=bpy.context.object;o.name=f'visor-glow-{i}';o.scale=(.06,.3,.06);o.rotation_euler=(0,0,math.radians(yaw));o.data.materials.append(VISOR);parent_to(o,head)
rivet('helm-crest',(0,0,.47),head,.09)
legs={};arms={}
for side,y in (('near',-.62),('far',.62)):
 leg=pivot(f'leg-{side}',(0,y,1.42),root);legs[side]=leg
 can(f'thigh-{side}',(0,0,-.42),.32,.7,PLATE_DARK,leg)
 shell(f'knee-{side}',(.12,0,-.82),(.3,.3,.26),PLATE,leg);rivet(f'knee-rivet-{side}',(.4,0,-.82),leg)
 shell(f'boot-{side}',(.2,0,-1.2),(.6,.44,.28),PLATE,leg)
 shell(f'rust-boot-{side}',(.5,0,-1.32),(.14,.3,.07),RUST,leg)
 arm=pivot(f'arm-{side}',(.0,y*1.75,2.95),root);arms[side]=arm
 shell(f'pauldron-{side}',(0,0,.08),(.66,.52,.4),PLATE,arm)
 rim(f'pauldron-rim-{side}',(0,0,-.12),.52,.06,arm)
 shell(f'rust-pauldron-{side}',(.38,0,-.22),(.18,.3,.06),RUST,arm)
 rivet(f'pauldron-rivet-{side}',(.5,0,.42),arm,.09)
 can(f'upper-arm-{side}',(.05,0,-.62),.26,.55,PLATE_DARK,arm)
 can(f'gauntlet-{side}',(.12,0,-1.12),.36,.62,PLATE,arm,r2=.42)
 rim(f'gauntlet-rim-{side}',(.12,0,-.82),.36,.05,arm)
 shell(f'fist-{side}',(.16,0,-1.55),(.4,.36,.34) if side=='near' else (.36,.32,.3),PLATE_DARK,arm)

# Heavy plate walk: legs swing about Y, the torso rolls about X toward the planted leg. hit = plates ring, body rocks back.
POSES={'walk-a':{'leg':{'near':-22,'far':22},'arm':{'near':18,'far':-18},'lean':4,'roll':-5,'head':-3,'loc':(0,0,0)},
       'walk-b':{'leg':{'near':22,'far':-22},'arm':{'near':-18,'far':18},'lean':4,'roll':5,'head':-3,'loc':(0,0,.05)},
       'hit':{'leg':{'near':10,'far':-8},'arm':{'near':-42,'far':-30},'lean':-14,'roll':0,'head':14,'loc':(-.3,0,0)}}
scene=bpy.context.scene
scene.view_settings.view_transform='Standard';scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.6,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
cam_data=bpy.data.cameras.new('Metal soldier shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.6
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
 root.rotation_euler=(math.radians(pose['roll']),math.radians(pose['lean']),0);root.location=pose['loc']
 bpy.context.view_layer.update()
 f=FRAMES/f'metal-soldier-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'metal-soldier.blend'))
atlas=OUT/'metal-soldier-atlas.webp'
if not opts.skip_render:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in frames),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
dg=bpy.context.evaluated_depsgraph_get()
tris=sum(len(o.evaluated_get(dg).to_mesh().polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'metal-soldier','source':'art-source/defense/metal-soldier.blend','generator':'tools/blender/build_metal.py','blender':bpy.app.version_string,'kind':'baked 2.5D sprite atlas (not a GLB)','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':atlas.name,'poses':list(POSES),'width':opts.size*3,'height':opts.size},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(1 for o in COL.objects if o.type=='MESH'),'evaluated_polygons':tris}
(OUT/'metal-soldier.json').write_text(json.dumps(manifest,indent=1)+'\n')
print(json.dumps(manifest))
