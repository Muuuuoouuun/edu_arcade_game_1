"""Editable terrain source for the isolated real-time frontier training ground.
Regenerate: npm run models:frontier-terrain. X/Z game coordinates map to Blender X/-Y.
"""
import bpy,math,json,hashlib,subprocess
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=R/'public/defense/models';A=R/'art-source/defense'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats={}
def mat(color):
 if color not in mats:
  m=bpy.data.materials.new(color);m.diffuse_color=(*[((int(color[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5)],1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;mats[color]=m
 return mats[color]
def height(x,z):return max(0,min(1,(-z-2)/10))*4.6
objects=[]
def box(name,x,y,z,w,h,d,color):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y));o=bpy.context.object;o.name=name;o.scale=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat(color));objects.append(o);return o
verts=[(x,-z,-1.5 if 3<=x<=9 else height(x,z)) for z in range(-32,33) for x in range(-32,33)]
faces=[(i,i+65,i+66,i+1) for z in range(64) for x in range(64) for i in [z*65+x]]
mesh=bpy.data.meshes.new('graded terrain mesh');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Grass slopes / river trench',mesh);bpy.context.collection.objects.link(o);objects.append(o)
for color in ['#6d9566','#739b69']:mesh.materials.append(mat(color))
for p in mesh.polygons:p.material_index=(p.index//64//4+p.index%64//4)%2
box('Island foundation',0,-3,0,64,4,64,'#6a7055');box('River water',6,-.7,0,5.8,.25,64,'#5cabb5')
box('Bridge deck',6,.16,0,8,.4,5.6,'#9b7550')
for z in [-2.8,2.8]:
 box('Bridge hand rail',6,1.25,z,8,.22,.2,'#c5a67c')
 for x in [2.4,5,8,9.6]:box('Bridge post',x,.65,z,.22,1.4,.22,'#715a42')
for x in range(-32,33,4):
 for z in [-32,32]:box('Stratified edge',x,height(x,z)-1.5,z,4,3.5,2,'#7b806a')
for z in range(-28,32,4):
 for x in [-32,32]:box('Stratified edge',x,height(x,z)-1.5,z,2,3.5,4,'#7b806a')
for i in range(32):
 x=-30 if i%2==0 else 30;z=-27+(i%16)*3.6;s=1+(i%3)*.15
 if abs(z)<4:continue
 box('Pine trunk',x,height(x,z)+1.3*s,z,.55*s,2.6*s,.55*s,'#76624b')
 for j in range(2):
  bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=(1.8-j*.3)*s,radius2=0,depth=3.2*s,location=(x,-z,height(x,z)+(3+j*1.3)*s));o=bpy.context.object;o.name='Pine crown';o.data.materials.append(mat('#396e59' if j else '#477c5c'));objects.append(o)
# Continuous winding road follows the actual defense route, with raised stone edging.
path=[(-22,-29),(-22,-26),(-12,-15),(-20,-2),(-14,21),(-14,30)]
for n,((ax,az),(bx,bz)) in enumerate(zip(path,path[1:])):
 dx,dz=bx-ax,bz-az;l=math.hypot(dx,dz);nx,nz=-dz/l,dx/l;vs=[]
 steps=max(2,int(l*2))
 for i in range(steps+1):
  q=i/steps;x=ax+dx*q;z=az+dz*q
  for w in [-1.65,1.65]:vs.append((x+nx*w,-(z+nz*w),height(x+nx*w,z+nz*w)+.045))
 fs=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(steps)];m=bpy.data.meshes.new('Road strip');m.from_pydata(vs,[],fs);m.materials.append(mat('#bda174'));o=bpy.data.objects.new('Winding road '+str(n),m);bpy.context.collection.objects.link(o);objects.append(o)
 for i in range(0,steps,3):
  q=i/steps;x=ax+dx*q;z=az+dz*q
  for sign in [-1,1]:box('Road border stone',x+nx*1.85*sign,height(x,z)+.12,z+nz*1.85*sign,.48,.24,.65,'#a4a58b')
# Round the road joints so sharp bends have no gaps.
for x,z in path[1:-1]:
 vs=[(x,-z,height(x,z)+.07)]+[(x+1.7*math.cos(i*math.tau/20),-(z+1.7*math.sin(i*math.tau/20)),height(x+1.7*math.cos(i*math.tau/20),z+1.7*math.sin(i*math.tau/20))+.07) for i in range(20)]
 fs=[(0,1+(i+1)%20,1+i) for i in range(20)];m=bpy.data.meshes.new('Road bend');m.from_pydata(vs,[],fs);m.materials.append(mat('#bda174'));o=bpy.data.objects.new('Rounded road junction',m);bpy.context.collection.objects.link(o);objects.append(o)
# Rock shelves mark the highland and expose its vertical side faces.
for x in [-24,-19,-7,-2,13,20,25]:
 z=-31;box('Highland rock',x,height(x,z)+.5,z,2.7,1.2,2,'#8a927a')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=900;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.render.film_transparent=True
world=bpy.data.worlds.new('Frontier daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.63,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-25,-15,48));bpy.context.object.data.energy=45000;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=25
bpy.ops.object.camera_add(location=(0,-68,72));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=98;scene.camera=camera
scene['regeneration_command']='npm run models:frontier-terrain';scene['coordinate_contract']='game(x,z,height) = Blender(x,-z,height); 64x64 footprint; river x3..9; bridge abs(z)<=2; highland4.6'
bpy.context.preferences.filepaths.save_version=0;blend=A/'frontier-terrain.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));scene.render.filepath=str(O/'frontier-terrain.png');bpy.ops.render.render(write_still=True)
# Join runtime surfaces by material, preserving named editable objects in the saved blend.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.ops.export_scene.gltf(filepath=str(O/'frontier-terrain.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(O/'frontier-terrain.png'),'-c:v','libwebp','-quality','90',str(O/'frontier-terrain.webp')],check=True)
files=[blend,O/'frontier-terrain.glb',O/'frontier-terrain.png',O/'frontier-terrain.webp'];meta={'generator':'tools/blender/build_frontier_terrain.py','generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'command':'npm run models:frontier-terrain','editable_objects':len(objects),'footprint':[64,64],'highland_height':4.6,'river_x':[3,9],'bridge_walkable_z':[-2,2],'camera':{'size':[900,600],'orthographic_scale':98,'location':[0,-68,72]},'files':[{'file':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]};(O/'frontier-terrain.json').write_text(json.dumps(meta,indent=2)+'\n');print('FRONTIER_TERRAIN_PASS')
