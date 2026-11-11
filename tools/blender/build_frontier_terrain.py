"""Editable terrain source for the isolated real-time frontier training ground.
Regenerate: npm run models:frontier-terrain. X/Z game coordinates map to Blender X/-Y.
"""
import bpy,bmesh,math,json,hashlib,subprocess
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
verts=[(x,-z,height(x,z)) for z in range(-32,33) for x in range(-32,33)]
faces=[(i,i+65,i+66,i+1) for z in range(64) for x in range(64) for i in [z*65+x] if not 35<=x<41]
mesh=bpy.data.meshes.new('graded terrain mesh');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Grass slopes / river trench',mesh);bpy.context.collection.objects.link(o);objects.append(o)
for color in ['#6f9663','#739a66','#779d69','#7ba16b']:mesh.materials.append(mat(color))
# Large irregular meadow patches replace the grid without a texture or extra draw calls.
for p in mesh.polygons:
 x,z=verts[p.vertices[0]][0],-verts[p.vertices[0]][1]
 variation=.65*math.sin(x*.22+math.sin(z*.13)*1.1)+.35*math.cos(z*.26-x*.11)
 p.material_index=0 if variation<-.48 else 1 if variation<0 else 2 if variation<.48 else 3
# Continue the eastern verge beyond the walkable map so the moved foreground
# trees have actual ground. Its slope matches the map; gameplay bounds stay fixed.
edgeverts=[(x,-z,height(x,z)) for z in range(-32,33) for x in (32,46)]
edgefaces=[(2*i,2*i+2,2*i+3,2*i+1) for i in range(64)]
edge=bpy.data.meshes.new('Forest outer verge');edge.from_pydata(edgeverts,[],edgefaces);edge.materials.append(mat('#739a66'))
o=bpy.data.objects.new('Forest outer verge',edge);bpy.context.collection.objects.link(o);objects.append(o)
# Separate land masses leave a real open gorge below the bridge.
for x,w in [(-14.5,35),(20.5,23)]:box('Island foundation',x,-4,z=0,w=w,h=5,d=64,color='#6a7055')
box('Forest verge foundation',39,-4,z=0,w=14,h=5,d=64,color='#6a7055')
box('River bed',6,-4.6,0,6,.2,64,'#5c685b');box('River water',6,-2.725,0,5.8,.25,64,'#5cabb5')
# All rock faces stay inside the blocked river x3..9. Shore tops remain at simulation height.
for side in [-1,1]:
 edge=3 if side==1 else 9
 for k,z in enumerate(range(-32,32,2)):
  vs=[]
  for zz in [z,z+2]:
   h=height(edge,zz);ridge=.1*math.sin(zz*.9)
   for offset,y in [(0,h),(.18+ridge,h-.35),(.48+ridge,h*.45-1.6),(.85,-3.5)]:vs.append((edge+side*offset,-zz,y))
  fs=[(j+4,j+5,j+1,j) if side==1 else (j,j+1,j+5,j+4) for j in range(3)]
  m=bpy.data.meshes.new('River rock strata');m.from_pydata(vs,[],fs)
  for color in ['#a4a58b','#8a927a','#5c685b']:m.materials.append(mat(color))
  for face in m.polygons:face.material_index=face.index
  o=bpy.data.objects.new('West river cliff' if side==1 else 'East river cliff',m);bpy.context.collection.objects.link(o);objects.append(o)

for i in range(16):box('Bridge deck plank',2.25+i*.5,.16,0,.5,.4,5.6,'#9b7550' if i%2 else '#a17d57')
# Two masonry abutments and longitudinal beams expose the load path under the crossing.
for x in [3.4,8.6]:
 for y in [-2.3,-1.5,-.7]:box('Bridge masonry support',x,y,0,1.0,.78,5.1,'#8a927a')
for z in [-2.3,2.3]:
 box('Bridge underbeam',6,-.2,z,8,.42,.35,'#715a42')
 for x,lean in [(3.9,1),(8.1,-1)]:
  brace=box('Bridge diagonal brace',x,-1.0,z,2.0,.24,.25,'#715a42');brace.rotation_euler.y=lean*math.radians(-38)

for z in [-2.8,2.8]:
 box('Bridge hand rail',6,1.25,z,8,.22,.2,'#c5a67c')
 for x in [2.4,5,8,9.6]:box('Bridge post',x,.65,z,.22,1.4,.22,'#715a42')
# The crossing is the only walkable way over the river.  Give each bank a
# low, physical stone approach so the bridge reads as a connected route from
# the playing camera.  Stones stay embedded within 0.012 of the existing
# ground and outside x=2..10, leaving the simulation's deck and bounds intact.
approaches=[('West',-20,2,14),('East',10,21,7)]
for side,start,end,count in approaches:
 length=end-start
 box('Bridge approach '+side+' bedding',(start+end)/2,-.027,0,length,.06,3.2,'#777e69')
 # At the west junction, the road already covers the first stretch of soil.
 # Start the stones beyond its footprint so the two nearly coplanar surfaces
 # cannot compete in the depth buffer. Keep the bedding as a continuous link.
 stone_start=-17 if side=='West' else start;step=(end-stone_start)/count
 for i in range(count):
  for lane in [-1,1]:
   shift=lane*.18*step;lo=max(stone_start,stone_start+i*step+shift)+.035;hi=min(end,stone_start+(i+1)*step+shift)-.035
   z=lane*.79+.035*math.sin(i*2.4+lane);width=.68+.025*math.sin(i*1.7+lane)
   # Six-sided, shallow stones use staggered joints and asymmetric shoulders;
   # the retained soil beneath makes the crossing a path rather than a grid.
   points=[(lo,z-width*.65),(lo+.24*(hi-lo),z-width),(hi-.19*(hi-lo),z-width),
           (hi,z+width*.5),(hi-.22*(hi-lo),z+width),(lo+.17*(hi-lo),z+width)]
   vertices=[(x,-zz,y) for y in [.012,-.068] for x,zz in points]
   faces=[tuple(reversed(range(6))),tuple(range(6,12))]+[(j,j+6,(j+1)%6+6,(j+1)%6) for j in range(6)]
   m=bpy.data.meshes.new('Embedded irregular crossing stone');m.from_pydata(vertices,[],faces);m.update()
   color=['#afa98e','#bcb69b','#a49f87'][(i+(lane==1))%3]
   m.materials.append(mat(color));o=bpy.data.objects.new('Bridge approach '+side+' stone',m);bpy.context.collection.objects.link(o);objects.append(o)
for x in range(-32,33,4):
 for z in [-32,32]:box('Stratified edge',x,height(x,z)-1.5,z,4,3.5,2,'#7b806a')
for z in range(-28,32,4):
 for x in [-32,32]:box('Stratified edge',x,height(x,z)-1.5,z,2,3.5,4,'#7b806a')
# Move the eastern tree line away from the low mobile follow camera's sightline.
# Keep the trunks, crowns, materials, and count as editable 3D meshes.
for i in range(32):
 side=-1 if i%2==0 else 1;x=-31 if side<0 else 43;z=-27+(i%16)*3.6;s=1+(i%3)*.12
 if abs(z)<4:continue
 base=height(x,z)
 bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.55*s,radius2=.29*s,depth=3.3*s,location=(x,-z,base+1.65*s));o=bpy.context.object;o.name='Verdant trunk';o.data.materials.append(mat('#735740'));objects.append(o)
 branch=box('Verdant branch',x-side*.42*s,base+3.0*s,z,.23*s,2.1*s,.23*s,'#735740');branch.rotation_euler.y=side*math.radians(33)
 # Low-poly leaf masses keep a broad, asymmetrical outline at battle scale.
 for j,(offset,depth,radii,color) in enumerate([(.55,-.9,(1.95,2.05,1.25),'#396e4d'),(-.55,.9,(1.5,1.8,1.08),'#6b9653')]):
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x+side*offset*s,-(z+depth*s),base+(4.35+j*.38)*s))
  o=bpy.context.object;o.name='Verdant crown';o.scale=tuple(v*s for v in radii);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat(color));objects.append(o)
# Split road polygons at the two changes in the height field. Interpolating a
# wide quad across a change in slope leaves a false ramp above the ground.
# Within each band height(x,z) is planar, so interpolation matches it exactly.
def clip_road(poly,edge,above):
 result=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ina=a[1]>=edge if above else a[1]<=edge;inb=b[1]>=edge if above else b[1]<=edge
  if ina!=inb:
   t=(edge-a[1])/(b[1]-a[1]);result.append((a[0]+(b[0]-a[0])*t,edge))
  if inb:result.append(b)
 return result
def area(poly):return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1])))/2
def grounded_road(name,vertices,faces,offset):
 out=[];polys=[]
 for face in faces:
  source=[(vertices[i][0],-vertices[i][1]) for i in face];original=area(source);covered=0
  for low,high in [(None,-12),(-12,-2),(-2,None)]:
   part=source
   if low is not None:part=clip_road(part,low,True)
   if high is not None:part=clip_road(part,high,False)
   if len(part)<3 or area(part)<1e-8:continue
   covered+=area(part);indices=[]
   for x,z in part:indices.append(len(out));out.append((x,-z,height(x,z)+offset))
   polys.append(indices)
  assert abs(original-covered)<1e-6,(name,original,covered)
 m=bpy.data.meshes.new(name+' surface');m.from_pydata(out,[],polys);m.update()
 # Adjacent clipped polygons share physical edges; welding removes duplicate
 # seam vertices so rasterization cannot expose hairline cracks between them.
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6);bm.to_mesh(m);bm.free();m.update();m.materials.append(mat('#bda174'))
 o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);objects.append(o)
# Continuous winding road follows the actual defense route, with raised stone edging.
path=[(-22,-29),(-22,-26),(-12,-15),(-20,-2),(-14,21),(-14,30)]
for n,((ax,az),(bx,bz)) in enumerate(zip(path,path[1:])):
 dx,dz=bx-ax,bz-az;l=math.hypot(dx,dz);nx,nz=-dz/l,dx/l;vs=[]
 steps=max(2,int(l*2))
 for i in range(steps+1):
  q=i/steps;x=ax+dx*q;z=az+dz*q
  for w in [-1.65,1.65]:vs.append((x+nx*w,-(z+nz*w),0))
 fs=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(steps)];grounded_road('Winding road '+str(n),vs,fs,.014)
 for i in range(0,steps,3):
  q=i/steps;x=ax+dx*q;z=az+dz*q
  for sign in [-1,1]:
   sx,sz=x+nx*1.85*sign,z+nz*1.85*sign
   # Leave a clear junction where the walking approach meets the older road.
   if -20<=sx<=2 and abs(sz)<2.3:continue
   box('Road border stone',sx,height(x,z)+.12,sz,.48,.24,.65,'#a4a58b')
# Round the road joints so sharp bends have no gaps.
for x,z in path[1:-1]:
 vs=[(x,-z,0)]+[(x+1.7*math.cos(i*math.tau/20),-(z+1.7*math.sin(i*math.tau/20)),0) for i in range(20)]
 fs=[(0,1+(i+1)%20,1+i) for i in range(20)];grounded_road('Rounded road junction',vs,fs,.016)
# Rock shelves mark the highland and expose its vertical side faces.
for x in [-24,-19,-7,-2,13,20,25]:
 z=-31;box('Highland rock',x,height(x,z)+.5,z,2.7,1.2,2,'#8a927a')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=900;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.render.film_transparent=True
world=bpy.data.worlds.new('Frontier daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.63,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-25,-15,48));bpy.context.object.data.energy=45000;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=25
bpy.ops.object.camera_add(location=(0,-68,72));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=98;scene.camera=camera
scene['regeneration_command']='npm run models:frontier-terrain';scene['river_water_y']=-2.6;scene['river_bed_y']=-4.5
scene['coordinate_contract']='game(x,z,height) = Blender(x,-z,height); 64x64 footprint; river x3..9; bridge abs(z)<=2; highland4.6'
bpy.context.preferences.filepaths.save_version=0;blend=A/'frontier-terrain.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));scene.render.filepath=str(O/'frontier-terrain.png');bpy.ops.render.render(write_still=True)
# A second fixed camera makes the open water, rock strata and bridge underside reviewable.
camera.location=(20,-17,13);camera.rotation_euler=(Vector((6,0,-.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=25
scene.render.resolution_x=768;scene.render.resolution_y=512;scene.render.filepath=str(O/'frontier-terrain-crossing.png');bpy.ops.render.render(write_still=True)
# Keep editable solid planks, but remove hidden touching side faces in the shipping deck.
# Internal shadow casters at board seams otherwise produce dotted self-shadow lines.
for o in objects:
 if o.name.startswith('Bridge deck plank'):
  bm=bmesh.new();bm.from_mesh(o.data)
  hidden=[f for f in bm.faces if abs(f.normal.x)>.9 and 2.001<o.location.x+f.calc_center_median().x<9.999]
  bmesh.ops.delete(bm,geom=hidden,context='FACES');bm.to_mesh(o.data);bm.free()
# Join runtime surfaces by material, preserving named editable objects in the saved blend.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
# Terrain paints share the same opaque roughness. Bake their linear colors into one runtime surface.
packed=bpy.context.object;colors=packed.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for face in packed.data.polygons:
 color=packed.data.materials[face.material_index].diffuse_color
 for i in face.loop_indices:colors.data[i].color=color
packed.data.materials.clear();paint=bpy.data.materials.new('Frontier terrain / vertex paint');paint.use_nodes=True
node=paint.node_tree.nodes['Principled BSDF'];node.inputs['Roughness'].default_value=.85
vertex=paint.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Color';paint.node_tree.links.new(vertex.outputs['Color'],node.inputs['Base Color']);packed.data.materials.append(paint)
for face in packed.data.polygons:face.material_index=0
bpy.ops.export_scene.gltf(filepath=str(O/'frontier-terrain.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(O/'frontier-terrain.png'),'-c:v','libwebp','-quality','90',str(O/'frontier-terrain.webp')],check=True)
files=[blend,O/'frontier-terrain.glb',O/'frontier-terrain.png',O/'frontier-terrain.webp',O/'frontier-terrain-crossing.png'];meta={'generator':'tools/blender/build_frontier_terrain.py','generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'command':'npm run models:frontier-terrain','editable_objects':len(objects),'runtime_materials':1,'runtime_paint':'linear vertex colors; opaque roughness .85','forest_tree_count':28,'forest_crown_meshes':56,'meadow_palette_colors':4,'forest_outer_verge_x':[32,46],'footprint':[64,64],'highland_height':4.6,'river_x':[3,9],'river_water_y':-2.6,'river_bed_y':-4.5,'crossing_camera':{'location':[20,-17,13],'target':[6,0,-.7],'orthographic_scale':25,'size':[768,512]},'bridge_walkable_z':[-2,2],'bridge_approaches':{'west_x':[-20,2],'west_stone_x':[-17,2],'east_x':[10,21],'width':3.2,'stone_count':42,'maximum_top':.012},'road_surface':{'slope_breaks_z':[-12,-2],'strip_offset':.014,'junction_offset':.016},'camera':{'size':[900,600],'orthographic_scale':98,'location':[0,-68,72]},'files':[{'file':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]};(O/'frontier-terrain.json').write_text(json.dumps(meta,indent=2)+'\n');print('FRONTIER_TERRAIN_PASS')
