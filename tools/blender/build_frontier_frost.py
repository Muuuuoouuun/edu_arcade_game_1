"""Snow pass + arched gate, derived from the editable frontier topology.
Rebuild: npm run models:frontier-frost. No image planes; game(x,z,h) -> Blender(x,-z,h).
"""
import bpy,bmesh,math,json,hashlib,subprocess
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=R/'public/defense/models';A=R/'art-source/defense'
bpy.ops.wm.open_mainfile(filepath=str(A/'frontier-terrain.blend'))
scene=bpy.context.scene
palette={'#6d9566':'#d3e4ed','#739b69':'#d0e2ec','#6a7055':'#425b77','#5c685b':'#294c6c','#5cabb5':'#276a8b','#a4a58b':'#aad3e6','#8a927a':'#688fa9','#7b806a':'#769cb7','#bda174':'#7e9cae'}
def linear(c):return tuple(((int(c[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))+(1,)
def material(c):
 m=bpy.data.materials.new(c);m.use_nodes=True;m.diffuse_color=linear(c);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8;return m
mats={c:material(c) for c in ['#f0f6f5','#91cde5','#598eae','#365b79','#a1b8c7','#526a82','#c69c54','#254b73']}
for m in list(bpy.data.materials):
 if m.name in palette:
  m.diffuse_color=linear(palette[m.name]);m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color
for o in list(scene.objects):
 if o.name.startswith('Pine'):bpy.data.objects.remove(o,do_unlink=True)
def height(z):return max(0,min(1,(-z-2)/10))*4.6
created=[]
def box(name,x,z,h,w,d,t,c):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,h));o=bpy.context.object;o.name=name;o.scale=(w,d,t);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[c]);created.append(o);return o
def cone(name,x,z,h,r,depth,c,up=True):
 bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=r if up else 0,radius2=0 if up else r,depth=depth,location=(x,-z,h));o=bpy.context.object;o.name=name;o.data.materials.append(mats[c]);created.append(o);return o
# Boundary mountains remain outside the playable square |x/z|<28.
for side in [-1,1]:
 for i,z in enumerate(range(-28,29,7)):
  x=side*30.5;h=height(z);s=3.4+(i%3)*1.2
  cone('Faceted boundary ice',x,z,h+s/2,2.1,s,'#598eae');cone('Snow mountain crown',x,z,h+s*.78,1.1,s*.48,'#f0f6f5')
# Irregular clusters behind the traversable boundary break the flat square silhouette.
for side in [-1,1]:
 for i,z in enumerate([-24,-10,6,22]):
  h=7.0+(i%3)*2.1
  peak=cone('Outer glacier peak',side*(34+i%2),z,height(z)+h/2,3.2,h,'#598eae');peak.rotation_euler.z=i*.6
  cone('Glacier bright facet',side*(32.8+i%2),z+1.3,height(z)+h*.38,1.8,h*.75,'#91cde5')
  cone('Outer snow summit',side*(34+i%2),z,height(z)+h*.87,.95,h*.28,'#f0f6f5')
for x in [-24,-16,-8,0,16,24]:
 cone('Northern ice ridge',x,-30.5,4.6+2.3,1.6,4.6,'#91cde5')
# Frozen overhangs and hanging ice are confined inside the impassable river.
for edge,sign in [(3,1),(9,-1)]:
 for i,z in enumerate(range(-29,30,4)):
  if abs(z)<5:continue
  h=height(z)
  box('Snow cornice',edge+sign*.43,z,h+.06,.76,2.8,.18,'#f0f6f5')
  for j in [-.7,.5]:cone('Hanging icicle',edge+sign*.5,z+j,h-.55,.19,1.2+(i%3)*.25,'#91cde5',False)
for i,z in enumerate(range(-27,28,7)):
 if abs(z)<5:continue
 box('River ice floe',6+math.sin(i)*.6,z,-2.48,1.8,2.1,.2,'#91cde5').rotation_euler.z=i*.7
# A snow cap gives the bridge rails an actual layered silhouette.
for z in [-2.8,2.8]:box('Bridge snow cap',6,z,1.42,8,.28,.12,'#f0f6f5')
terrain=[o for o in scene.objects if o.type=='MESH']
created=[]
# Separate editable gate, centered at origin. Open passage beneath radial voussoirs.
for side in [-1,1]:
 x=side*2.35
 for row in range(4):box('Gate masonry course',x,0,.48+row*.9,1.5,1.7,.87,'#a1b8c7' if row%2 else '#526a82')
 box('Gate tower crown',x,0,3.9,1.85,1.95,.42,'#365b79');box('Gate tower snow',x,0,4.17,1.95,2.05,.18,'#f0f6f5')
 for dx in [-.55,.55]:box('Snow battlement',x+dx,0,4.55,.5,1.8,.65,'#a1b8c7');box('Battlement cap',x+dx,0,4.91,.58,1.9,.12,'#f0f6f5')
 # Navy banners and brass lamps face the approach (negative game z).
 box('Navy banner',x,.88,2.65,.65,.08,1.1,'#254b73');box('Banner gold bar',x,.96,3.22,.85,.13,.12,'#c69c54')
 box('Lantern bracket',x,1.1,1.6,.16,.5,.16,'#365b79');box('Lantern amber',x,1.3,1.35,.32,.28,.45,'#c69c54')
for i in range(9):
 a=i*math.pi/9;b=(i+1)*math.pi/9;vs=[]
 for y in [-.7,.7]:
  for rad,t in [(1.55,a),(2.1,a),(2.1,b),(1.55,b)]:vs.append((rad*math.cos(t),y,2.05+rad*math.sin(t)))
 mesh=bpy.data.meshes.new('Arch wedge');mesh.from_pydata(vs,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.materials.append(mats['#a1b8c7' if i%2 else '#526a82']);o=bpy.data.objects.new('Gate radial arch stone',mesh);scene.collection.objects.link(o);created.append(o)
box('Arch snow lintel',0,0,4.22,3.7,1.65,.22,'#f0f6f5')
gate=list(created)
# Keep gate in a separate collection, offset in source for inspection; exports center it.
collection=bpy.data.collections.new('Frost gate / standalone architecture');scene.collection.children.link(collection)
for o in gate:
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o);o.location.x-=14;o.location.y-=21
scene['regeneration_command']='npm run models:frontier-frost';scene['concept']='art-source/defense/concepts/2026-11-09/polar-battlefield.png'
scene.render.resolution_x=960;scene.render.resolution_y=540;scene.cycles.samples=24;scene.cycles.use_denoising=False
camera=scene.camera;camera.location=(0,-68,72);camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=114
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.62,.8,1)
bpy.context.preferences.filepaths.save_version=0
blend=A/'frontier-frost.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
scene.render.filepath=str(O/'frontier-frost.png');bpy.ops.render.render(write_still=True)
camera.location=(20,-17,13);camera.rotation_euler=(Vector((6,0,-.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=25
scene.render.resolution_x=960;scene.render.resolution_y=540;scene.render.filepath=str(O/'frontier-frost-crossing.png');bpy.ops.render.render(write_still=True)
for o in terrain:o.hide_render=True
for o in gate:o.location.x+=14;o.location.y+=21
camera.location=(7,-11,8);camera.rotation_euler=(Vector((0,0,2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=9;scene.render.resolution_x=384;scene.render.resolution_y=384
scene.render.filepath=str(O/'frontier-frost-gate.png');bpy.ops.render.render(write_still=True)
# Remove touching deck seams before packing, same as the forest contract.
for o in terrain:
 if o.name.startswith('Bridge deck plank'):
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if abs(f.normal.x)>.9 and 2.001<o.location.x+f.calc_center_median().x<9.999],context='FACES');bm.to_mesh(o.data);bm.free()
def export(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_render=False;o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for face in o.data.polygons:
  color=o.data.materials[face.material_index].diffuse_color
  for i in face.loop_indices:colors.data[i].color=color
 o.data.materials.clear();m=material('#ffffff');n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color']);o.data.materials.append(m)
 for p in o.data.polygons:p.material_index=0
 bpy.ops.export_scene.gltf(filepath=str(O/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
export(terrain,'frontier-frost');export(gate,'frontier-frost-gate')
for name in ['frontier-frost','frontier-frost-gate']:subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(O/(name+'.png')),'-c:v','libwebp','-quality','90',str(O/(name+'.webp'))],check=True)
files=[blend,O/'frontier-frost-crossing.png']+[O/(n+e) for n in ['frontier-frost','frontier-frost-gate'] for e in ['.glb','.png','.webp']]
meta={'generator':'tools/blender/build_frontier_frost.py','generator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'source_terrain_sha256':hashlib.sha256((A/'frontier-terrain.blend').read_bytes()).hexdigest(),'command':'npm run models:frontier-frost','concept':scene['concept'],'editable_terrain_objects':len(terrain),'editable_gate_objects':len(gate),'runtime_surfaces_per_model':1,'footprint':[64,64],'bridge_walkable_z':[-2,2],'camera':{'size':[960,540],'location':[0,-68,72],'orthographic_scale':114},'files':[{'file':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(O/'frontier-frost.json').write_text(json.dumps(meta,indent=2)+'\n');print('FRONTIER_FROST_PASS')
