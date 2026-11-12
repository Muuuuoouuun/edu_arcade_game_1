"""Compare orthographic camera elevation using the existing tower and an Ian proxy.

This is an angle study, not a production character or live gameplay camera.
"""
import argparse, math, sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/defense/camera-comparison'; OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'art-source/defense'; SOURCE.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser()
parser.add_argument('--angles',nargs='+',type=int,choices=[30,35,45,60],default=[30,35,45,60])
options=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
TOWER=ROOT/'public/defense/models/fire-tower-crafted.glb'
if not TOWER.exists():raise FileNotFoundError(f'Build the crafted tower before this study: {TOWER}')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
 if col.name!='Collection':bpy.data.collections.remove(col)

def mat(name,color,metal=0,rough=.5,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
 s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
 s.inputs['Emission Color'].default_value=(*color,1);s.inputs['Emission Strength'].default_value=emit;return m
M={'blue':mat('Proxy / deep blue robe',(.025,.065,.27),rough=.68),'lightblue':mat('Proxy / folded blue',(.04,.12,.4),rough=.7),'gold':mat('Proxy / gold trim',(.8,.46,.08),.65,.3),'skin':mat('Proxy / warm skin',(.8,.51,.32),rough=.7),'hair':mat('Proxy / silver hair',(.72,.73,.68),rough=.8),'brown':mat('Proxy / leather and boots',(.2,.075,.025),rough=.8),'gem':mat('Proxy / blue crystal',(.02,.45,.85),rough=.22,emit=.55),'black':mat('Proxy / eyes',(.015,.012,.025),rough=.5)}
proxy=bpy.data.collections.new('Ian proxy (camera study only)');bpy.context.scene.collection.children.link(proxy)

def finish(obj,name,material):
 obj.name=name
 for collection in list(obj.users_collection):collection.objects.unlink(obj)
 proxy.objects.link(obj);obj.data.materials.append(M[material]);return obj

def sphere(name,at,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,location=at);obj=bpy.context.object;obj.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(obj,name,material)

def cone(name,at,r1,r2,depth,material,vertices=20):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=at);return finish(bpy.context.object,name,material)

def rod(name,a,b,r,material):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=d.length,location=(a+b)/2);o=finish(bpy.context.object,name,material);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o

# Recognizable but deliberately simple geometry: this is not the promised
# finished, rigged Ian asset. Feet and tower base both sit on z=0.
sphere('Left boot',(-.36,-.12,.19),(.31,.46,.19),'brown');sphere('Right boot',(.36,-.12,.19),(.31,.46,.19),'brown')
cone('Wide robe',(0,0,1.24),.80,.43,1.72,'blue');cone('Robe gold hem',(0,0,.43),.80,.75,.10,'gold')
rod('Front robe trim',(0,-.68,.50),(0,-.39,1.92),.045,'gold')
sphere('Head',(0,-.04,2.54),(.55,.49,.57),'skin')
sphere('Silver fringe',(0,-.22,2.97),(.57,.41,.20),'hair')
for x in [-.20,.20]:sphere('Eye',(x,-.50,2.55),(.055,.035,.075),'black')
for side in [-1,1]:
 rod('Sleeve',(side*.43,0,1.96),(side*.77,-.12,1.51),.20,'lightblue');sphere('Hand',(side*.79,-.12,1.49),(.18,.17,.18),'skin')
cone('Hat wide brim',(0,-.02,3.15),.82,.82,.12,'blue');cone('Hat gold band',(0,-.02,3.25),.53,.50,.11,'gold');cone('Hat tall crown',(0,-.02,3.75),.55,.025,.95,'blue')
rod('Staff shaft',(.82,-.10,.42),(.82,-.10,2.65),.075,'brown')
for z in [1.40,2.58]:rod('Staff collar',(.82,-.1,z),(.82,-.1,z+.09),.105,'gold')
cone('Staff crystal',(.82,-.1,2.90),.22,0,.54,'gem',6)

before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(TOWER))
imported=set(bpy.data.objects)-before
tower=bpy.data.collections.new('Existing crafted fire tower');bpy.context.scene.collection.children.link(tower)
for ob in imported:
 for c in list(ob.users_collection):c.objects.unlink(ob)
 tower.objects.link(ob)

studio=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(studio)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.render.threads_mode='FIXED';scene.render.threads=8;scene.view_settings.view_transform='AgX'
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def light(name,loc,energy,color):
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=5;data.color=color
 obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=loc;aim(obj,(0,0,2.3))
light('Warm key',(-5,-7,10),1200,(1,.84,.67));light('Cool fill',(6,-3,8),700,(.65,.83,1));light('Rim',(0,6,10),1100,(1,.93,.8))
camdata=bpy.data.cameras.new('Comparable orthographic camera');camera=bpy.data.objects.new('Comparable orthographic camera',camdata);studio.objects.link(camera);scene.camera=camera;camdata.type='ORTHO';camdata.ortho_scale=7.8
origin=Vector((0,0,2.45));radius=15;yaw=math.radians(35)
for degrees in options.angles:
 camera.location=(radius*math.sin(yaw),-radius*math.cos(yaw),origin.z+radius*math.tan(math.radians(degrees)));aim(camera,origin)
 for name,col in [('ian-proxy',proxy),('fire-tower',tower)]:
  proxy.hide_render=col!=proxy;tower.hide_render=col!=tower
  scene.render.filepath=str(OUT/f'{name}-{degrees}.png');bpy.ops.render.render(write_still=True)
proxy.hide_render=False;tower.hide_render=True
scene['camera_study']='Static proxy and existing tower, same orthographic scale and 35-degree azimuth; elevations 30/35/45/60 from horizontal.'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'ian-camera-proxy.blend'))
print('CAMERA_COMPARISON_COMPLETE')
