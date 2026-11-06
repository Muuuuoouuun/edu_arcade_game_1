"""Author the editable insulator slime and bake three shared-camera pose sprites.

Run: blender -b --python tools/blender/build_slime.py
Options after --: --samples 96 --size 384 --skip-render
All forms are actual Blender geometry without image inputs. Output is a baked 2.5D sprite
atlas (walk-a, walk-b, hit), not a runtime 3D model. Native facing is screen-right.
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
p.add_argument('--frames-dir',default=str(ROOT/'art-source/defense/slime-frames'))
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
FRAMES=Path(opts.frames_dir);FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Insulator slime / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)

def material(name,color,rough=.2,coat=.6,emission=0,alpha=1):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes['Principled BSDF']
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=coat;n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 n.inputs['Subsurface Weight'].default_value=.25 if name.startswith('slime') else 0
 n.inputs['Subsurface Radius'].default_value=(.8,.2,1.0)
 return m
SLIME=material('slime body',(.62,.33,.05),.14,.9);SLIME_DARK=material('slime core',(.3,.13,.02),.3,.4)
EYE=material('eye white',(.95,.95,.9),.3,0);PUPIL=material('pupil',(.02,.01,.03),.4,0)
INS=material('insulation spark ring',(.9,.78,.25),.35,.2,.25)

def blob(name,loc,scale,mat,parent,seg=40):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=seg//2,radius=1,location=loc)
 o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
 bpy.ops.object.shade_smooth();o.parent=parent
 for c in o.users_collection:c.objects.unlink(o)
 COL.objects.link(o);return o
root=bpy.data.objects.new('slime-root',None);COL.objects.link(root)
body=blob('body',(0,0,1.0),(1.1,1.0,1.08),SLIME,root,48)
# Surface wobble keeps the mass from reading as a plain ball.
tex=bpy.data.textures.new('slime-wobble','CLOUDS');tex.noise_scale=1.4
mod=body.modifiers.new('wobble','DISPLACE');mod.texture=tex;mod.strength=.16;mod.mid_level=.5
blob('core',(.1,0,.85),(.55,.5,.55),SLIME_DARK,root,24)
blob('skirt',(0,0,.14),(1.4,1.2,.2),SLIME,root,40)
for i,(x,y,s) in enumerate([(-1.25,.55,.26),(.9,-.95,.2),(-.5,-1.05,.17),(1.55,.35,.15)]):
 blob(f'drip-{i}',(x,y,s*.7),(s,s,s*.75),SLIME,root,16)
# Leaf inclusions: resin flowed from the tree, so two leaves sit in the amber shell (replaces the cream band).
LEAF=material('leaf inclusion',(.2,.42,.1),.5,.2)
for i,(loc,sc,rot) in enumerate([((-.35,-.3,2.0),(.5,.2,.1),(.3,.35,.5)),((-.9,-.75,1.25),(.36,.15,.08),(.9,-.3,1.0))]):
 leaf=blob(f'leaf-{i}',loc,sc,LEAF,root,16);leaf.rotation_euler=rot
eyes=[]
for name,y in (('eye-near',-.4),('eye-far',.34)):
 e=blob(name,(.95,y,1.3),(.32,.28,.36),EYE,root,20);pu=blob(name+'-pupil',(1.24,y*1.02,1.28),(.14,.14,.18),PUPIL,root,12);eyes+= [e,pu]
 for o in (e,pu):o['rest']=tuple(o.scale)

# Pose scale/lean in root space: stretch, squash and a hit recoil.
POSES={'walk-a':{'scale':(.94,.96,1.1),'rot':8,'loc':(0,0,0),'eye':1},
       'walk-b':{'scale':(1.1,1.04,.84),'rot':-5,'loc':(0,0,0),'eye':1},
       'hit':{'scale':(1.12,1.04,.8),'rot':-14,'loc':(-.25,0,0),'eye':.2}}
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.5,.7,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
cam_data=bpy.data.cameras.new('Slime shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=4.4
camera.location=(4,-10,6);target=Vector((0,0,.95));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
for nm,loc,en,sz in (('key',(5,-5,8),600,3),('fill',(-6,-3,3),180,4),('rim',(-2,6,5),300,2)):
 d=bpy.data.lights.new(nm,'AREA');d.energy=en;d.size=sz;o=bpy.data.objects.new(nm,d);o.location=loc;STUDIO.objects.link(o)
 o.rotation_euler=(Vector((0,0,.8))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
frames=[]
for name,pose in POSES.items():
 root.scale=pose['scale'];root.rotation_euler=(0,math.radians(pose['rot']),0);root.location=pose['loc']
 for o in eyes:o.scale=(o['rest'][0],o['rest'][1],o['rest'][2]*(pose['eye'] if not o.name.endswith('pupil') else 1))
 bpy.context.view_layer.update()
 f=FRAMES/f'insulator-slime-{name}.png';frames.append(f)
 if not opts.skip_render:
  scene.render.filepath=str(f);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'insulator-slime.blend'))
atlas=OUT/'insulator-slime-atlas.webp'
if not opts.skip_render:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in frames),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
tris=sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().polygons) for o in COL.objects if o.type=='MESH')
manifest={'id':'insulator-slime','source':'art-source/defense/insulator-slime.blend','generator':'tools/blender/build_slime.py','blender':bpy.app.version_string,'kind':'baked 2.5D sprite atlas (not a GLB)','nativeFacing':1,'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,2),round((1-ground.y)*opts.size,2)],'orthographic_scale':cam_data.ortho_scale},'atlas':{'file':'insulator-slime-atlas.webp','poses':list(POSES),'width':opts.size*3,'height':opts.size},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':sum(o.type=='MESH' for o in COL.objects),'evaluated_polygons':tris}
(OUT/'insulator-slime.json').write_text(json.dumps(manifest,indent=1)+'\n')
print(json.dumps(manifest))
