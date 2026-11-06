"""Build the living-log soldier: articulated Blender geometry, GLB walk clip and 2.5D atlases.
Derived from Claude direction-loop cycle 34; eight-pose gait adds grounded feet and secondary motion.
Run: blender -b --python tools/blender/build_wood.py -- --samples 64
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
LEAF=material('leaf',(.18,.5,.06),.8);LEAF_LIGHT=material('leaf light',(.42,.62,.1),.8);EYE=material('knot hole',(.035,.02,.01),.9);MOUTH=material('mouth groove',(.05,.03,.015),.9)
RING=material('cut wood',(.78,.64,.39),.8);ROOT_MAT=material('root ring',(.16,.09,.05),.9)

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
def segment(name,loc,r,depth,mat,parent,rot=(0,0,0),taper=.92):
 # Octagonal log segment: bark sides, tree-ring caps (faces whose normal is along the log axis).
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r,radius2=r*taper,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(mat);o.data.materials.append(RING)
 for f in o.data.polygons:
  if abs(f.normal.z)>.9:f.material_index=1
 bpy.ops.object.shade_flat();parent_to(o,parent)
 for end in (-1,1):
  for fraction in (.38,.7):
   bpy.ops.mesh.primitive_torus_add(major_radius=r*(taper if end>0 else 1)*fraction,minor_radius=.016,major_segments=16,minor_segments=4)
   ring=bpy.context.object;ring.name=f'{name}-growth-ring';parent_to(ring,o)
   ring.location=(0,0,end*(depth/2+.004));ring.data.materials.append(BARK_DARK)
 return o
def root_ring(name,loc,r,parent,rot=(0,0,0)):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=r*.16,major_segments=10,minor_segments=4,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.scale=(1,1,.7);o.data.materials.append(ROOT_MAT)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o
def branch(name,loc,r,depth,parent,rot):
 bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,radius2=r*.12,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.rotation_euler=rot;o.data.materials.append(BARK_LIGHT)
 bpy.ops.object.shade_flat();parent_to(o,parent);return o
def leaves(name,loc,r,parent,mat=None):
 return blob(name,loc,(r,r*.95,r*.55),mat or LEAF,parent)

root=pivot('wood-root',(0,0,0))
hips=segment('hips',(0,0,1.45),.78,.55,BARK_DARK,root,taper=1)
torso=segment('torso',(.15,0,2.45),.9,1.65,BARK,root,(0,math.radians(6),0),taper=.9)
root_ring('root-ring-waist',(.05,0,1.72),.86,root);root_ring('root-ring-neck',(.28,0,3.22),.72,root,(0,math.radians(6),0))
segment('chest-knot',(.95,0,2.55),.22,.2,BARK_DARK,root,(0,math.radians(90),0),taper=1)
head=pivot('head',(.65,0,3.35),root)
segment('head-log',(0,0,0),.52,.95,BARK,head,taper=.95);blob('mouth',(.5,0,-.2),(.06,.28,.05),MOUTH,head)
for n,y in (('eye-near',-.22),('eye-far',.22)):
 log(n,(.50,y,.12),.12,.09,EYE,head,(0,math.radians(90),0))
for i,(x,y,tilt) in enumerate(((-.1,-.25,-25),(-.2,.25,-35),(.1,0,-10))):
 branch(f'antler-{i}',(x,y,.8),.14,1.1,head,(math.radians(y*60),math.radians(tilt),0))
leaves('leaf-back',(-.75,0,3.2),.6,root);leaves('leaf-shoulder',(-.2,.5,3.55),.65,root,LEAF_LIGHT);leaves('leaf-shoulder-near',(.1,-.85,3.5),.5,root)
leaves('leaf-chest',(.7,-.45,2.95),.4,root,LEAF_LIGHT);leaves('leaf-hips',(.0,.2,1.95),.5,root,LEAF_LIGHT);leaves('leaf-knee',(.55,-.8,.9),.3,root)
branch('back-branch-a',(-1.0,.15,3.9),.17,1.3,root,(0,math.radians(-20),0));branch('back-branch-b',(-.7,-.2,4.0),.14,1.1,root,(0,math.radians(10),0))
legs={};arms={}
for side,y in (('near',-.7),('far',.7)):
 leg=pivot(f'leg-{side}',(0,y,1.4),root);legs[side]=leg
 log(f'thigh-{side}',(0,0,-.55),.62,1.2,BARK,leg);log(f'shin-{side}',(.05,0,-1.15),.5,.9,BARK_DARK,leg)
 segment(f'foot-{side}',(.25,0,-1.38),.5,.22,BARK_LIGHT,leg,taper=1);root_ring(f'root-ring-ankle-{side}',(.15,0,-1.25),.42,leg);leaves(f'leaf-leg-{side}',(.05,0,-.15),.28,leg)
 arm=pivot(f'arm-{side}',(.1,y*1.7,2.9),root);arms[side]=arm
 segment(f'shoulder-{side}',(0,0,0),.5,.75,BARK,arm,(math.radians(90),0,0),taper=1);log(f'forearm-{side}',(.1,0,-.85),.46,1.1,BARK_DARK,arm)
 segment(f'fist-{side}',(.25,0,-1.55),.42 if side=='near' else .36,.75,BARK_LIGHT,arm,(0,math.radians(90),0),taper=1)
 for i,dy in enumerate((-.3,0,.3)):branch(f'finger-{side}-{i}',(.55,dy*.8,-1.7),.1,.5,arm,(0,math.radians(90),0))

# Pose rotations about Y (screen-pitch): negative swings forward, positive back.
POSES={'walk-a':{'leg':{'near':-24,'far':24},'arm':{'near':26,'far':-26},'lean':5,'head':-4,'loc':(0,0,0)},
       'walk-b':{'leg':{'near':24,'far':-24},'arm':{'near':-26,'far':26},'lean':5,'head':-4,'loc':(0,0,.06)},
       'hit':{'leg':{'near':10,'far':-6},'arm':{'near':48,'far':40},'lean':-13,'head':16,'loc':(-.3,0,0)}}
# A planted foot stays on the ground; the other swings over it. Common root/camera
# coordinates are kept across every frame, rather than fitting each pose independently.
leg_rest={side:leg.location.copy() for side,leg in legs.items()}
leaf=bpy.data.objects['leaf-back'];leaf_rest=leaf.rotation_euler.copy()
def apply_walk(phase):
 root.location=(0,0,.035*abs(math.sin(phase*2)))
 root.rotation_euler=(math.radians(.8*math.sin(phase)),math.radians(5+math.sin(phase*2)),0)
 head.rotation_euler=(0,math.radians(-4+2*math.sin(phase-.3)),0)
 leaf.rotation_euler=(leaf_rest.x+math.radians(3*math.sin(phase-.4)),leaf_rest.y,leaf_rest.z)
 for side,offset in [('near',0),('far',math.pi)]:
  cycle=phase+offset;leg=legs[side]
  leg.location=leg_rest[side];leg.rotation_euler=(0,math.radians(20*math.cos(cycle)),0)
  arms[side].rotation_euler=(0,math.radians(-24*math.cos(cycle-.15)),0)
 bpy.context.view_layer.update()
 for side,offset in [('near',0),('far',math.pi)]:
  foot=bpy.data.objects[f'foot-{side}']
  lowest=min((foot.matrix_world@v.co).z for v in foot.data.vertices)
  lift=max(0,math.sin(phase+offset))*.24
  legs[side].location+=root.matrix_world.inverted().to_3x3()@Vector((0,0,lift-lowest))
 bpy.context.view_layer.update()

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
 for side in ('near','far'):
  legs[side].location=leg_rest[side]
  legs[side].rotation_euler=(0,math.radians(pose['leg'][side]),0)
  arms[side].rotation_euler=(0,math.radians(pose['arm'][side]),0)
 head.rotation_euler=(0,math.radians(pose['head']),0)
 root.rotation_euler=(0,math.radians(pose['lean']),0);root.location=pose['loc']
 bpy.context.view_layer.update()
 f=FRAMES/f'wood-soldier-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
walk_frames=[]
for index in range(8):
 apply_walk(index*math.tau/8)
 f=FRAMES/f'wood-soldier-walk-{index}.png';walk_frames.append(f)
 # Fail the bake if a visible mesh leaves the fixed camera frame.
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
 atlas(frames,OUT/'wood-soldier-atlas.webp')
 atlas(walk_frames,OUT/'wood-soldier-walk-atlas.webp')
 shutil.copyfile(walk_frames[0],OUT/'wood-soldier.png')

# A real editable loop for 3D inspection; in-game frames sample this same gait.
scene.render.fps=30;scene.frame_start=1;scene.frame_end=31
animated=[root,head,leaf,*legs.values(),*arms.values()]
for frame in range(1,32):
 apply_walk((frame-1)/30*math.tau)
 for obj in animated:
  obj.keyframe_insert(data_path='location',frame=frame)
  obj.keyframe_insert(data_path='rotation_euler',frame=frame)
for obj in animated:
 obj.animation_data.action.name=f'Wood walk / {obj.name}'
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in COL.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'wood-soldier.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='wood-soldier-walk',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'wood-soldier.blend'))
polygons=sum(len(o.data.polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'wood-soldier','source':'art-source/defense/wood-soldier.blend','generator':'tools/blender/build_wood.py','reference':'Claude direction loop cycle 34, log silhouette draft','blender':bpy.app.version_string,'kind':'articulated GLB and baked 2.5D atlases','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':'wood-soldier-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'walk':{'file':'wood-soldier-walk-atlas.webp','frames':8,'width':opts.size*8,'height':opts.size,'stride_world':52,'clip':'wood-soldier-walk','duration_seconds':1,'foot_lift':.24,'rig':'articulated rigid parts; no skin'},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'polygons':polygons}
manifest['files']=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OUT/'wood-soldier-atlas.webp',OUT/'wood-soldier-walk-atlas.webp',OUT/'wood-soldier.glb'] if p.exists()]
(OUT/'wood-soldier.json').write_text(json.dumps(manifest,indent=1)+'\n')
print('ARCANA_WOOD_COMPLETE',json.dumps(manifest))
