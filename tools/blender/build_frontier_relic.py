"""Editable grounded recovery crystal. Rebuild: npm run models:frontier-relic."""
import bpy, math, hashlib, json, subprocess, struct
from pathlib import Path
R=Path(__file__).resolve().parents[2];A=R/'art-source/defense';O=R/'public/defense/models';P=A/'frontier-relic';P.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(n,c,metal=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;v=tuple(((int(c[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))+(1,);m.diffuse_color=v;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=v;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.72;return m
stone=mat('Slate stone','#3f5a62');edge=mat('Light carved edge','#96aaa3');brass=mat('Old brass','#d1ab65',.35);gem=mat('Deep turquoise crystal','#2daea9');light=mat('Mint crystal facet','#8ef3d7');dark=mat('Dark crystal facet','#237884');
def empty(n,loc):
 o=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(o);o.location=loc;return o
rig=empty('relic-rig',(0,0,0));base=empty('relic-base',(0,0,0));core=empty('relic-core',(0,0,.55));base.parent=rig;core.parent=rig;groups={base:[],core:[]}
def parent(o,p):
 bpy.context.view_layer.update();w=o.matrix_world.copy();o.parent=p;o.matrix_world=w;groups[p].append(o);return o
def cyl(n,r,depth,z,m,verts=8):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=(0,0,z));o=bpy.context.object;o.name=n;o.data.materials.append(m);return parent(o,base)
def box(n,loc,dim,m,p=base):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.scale=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);return parent(o,p)
cyl('Grounded octagonal foundation',1.12,.22,.11,stone)
cyl('Pale carved step',.96,.14,.29,edge)
cyl('Brass retaining rim',.84,.12,.42,brass)
cyl('Dark crystal seat',.67,.14,.50,stone)
for i in range(4):
 a=i*math.tau/4;o=box('Brass gripping claw',(.69*math.cos(a),.69*math.sin(a),.64),(.16,.19,.49),brass);o.rotation_euler.z=a
# Six distinct real facets on a pointed crystal; strong dark edge against snow.
verts=[]
for z,r in [(.55,.34),(1.02,.53),(1.82,.40)]:
 for i in range(6):
  a=math.tau*i/6;verts.append((r*math.cos(a),r*math.sin(a),z))
verts.append((0,0,2.35));faces=[]
faces.append(tuple(reversed(range(6))))
for row in range(2):
 for i in range(6):faces.append((row*6+i,row*6+(i+1)%6,(row+1)*6+(i+1)%6,(row+1)*6+i))
for i in range(6):faces.append((12+i,12+(i+1)%6,18))
mesh=bpy.data.meshes.new('Faceted recovery crystal');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(gem);mesh.materials.append(light);mesh.materials.append(dark)
for i,f in enumerate(mesh.polygons):f.material_index=[0,1,0,2,0,1][i%6]
o=bpy.data.objects.new('Faceted recovery crystal',mesh);bpy.context.collection.objects.link(o);parent(o,core)
# A bright inset makes the interaction target readable without a texture plane.
for i in range(3):
 a=math.tau*i/3;box('Crystal inset',(0.26*math.cos(a),0.26*math.sin(a),1.09),(.08,.08,.36),light,core)
s=bpy.context.scene;s.render.fps=25;s.frame_start=1;s.frame_end=11
for frame,scale,lift in [(1,1,0),(6,.55,.18),(11,.01,.36)]:
 core.scale=(scale,scale,scale);core.location.z=.55+lift;core.keyframe_insert(data_path='scale',frame=frame);core.keyframe_insert(data_path='location',frame=frame)
core.animation_data.action.name='relic-pickup-preview';s.frame_set(1);s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=s.render.resolution_y=384;s.render.resolution_percentage=100;s.render.film_transparent=True
world=bpy.data.worlds.new('Daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.63,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8;s.world=world
bpy.ops.object.light_add(type='AREA',location=(-5,-6,10));bpy.context.object.data.energy=900;bpy.context.object.data.size=7
bpy.ops.object.camera_add(location=(5,-10,6.9));cam=bpy.context.object;cam.rotation_euler=(1.157740592956543,0,.46364766359329224);cam.data.type='ORTHO';cam.data.ortho_scale=6.3;s.camera=cam
s['regeneration_command']='npm run models:frontier-relic';s['coordinate_contract']='Z-up authored -> Y-up GLB; origin at ground; core pivot z=.55; procedural pickup in simulation time'
bpy.context.preferences.filepaths.save_version=0;blend=A/'frontier-relic.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for n,f in [('idle',1),('collect',6),('empty',11)]:s.frame_set(f);s.render.filepath=str(P/(n+'.png'));bpy.ops.render.render(write_still=True)
s.frame_set(1)
paint=bpy.data.materials.new('Relic runtime paint');paint.use_nodes=True;bs=paint.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.75;v=paint.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';paint.node_tree.links.new(v.outputs['Color'],bs.inputs['Base Color']);surfaces=[]
for pivot,objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name='surface-'+pivot.name
 colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for f in o.data.polygons:
  c=o.data.materials[f.material_index].diffuse_color
  for j in f.loop_indices:colors.data[j].color=c
 o.data.materials.clear();o.data.materials.append(paint)
 for f in o.data.polygons:f.material_index=0
 surfaces.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,base,core,*surfaces]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'frontier-relic.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
raw=(O/'frontier-relic.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
(O/'frontier-relic.png').write_bytes((P/'idle.png').read_bytes())
inputs=sum((['-i',str(P/(n+'.png'))] for n in ['idle','collect','empty']),[])
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88',str(O/'frontier-relic-atlas.webp')],check=True)
files=[Path(__file__),blend,*[P/(n+'.png') for n in ['idle','collect','empty']],O/'frontier-relic.glb',O/'frontier-relic.png',O/'frontier-relic-atlas.webp']
meta={'command':'npm run models:frontier-relic','concept':'art-source/defense/concepts/2026-11-06/polar-night-coast.png','runtime':{'meshes':len(surfaces),'triangles':tris,'materials':1,'ground':0,'core_pivot_y':.55,'procedural_pickup':True},'camera':{'position':[5,-10,6.9],'rotation':[1.157740592956543,0,.46364766359329224],'ortho_scale':6.3,'resolution':[384,384]},'preview_frames':[1,6,11],'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(O/'frontier-relic.json').write_text(json.dumps(meta,indent=2)+'\n');print('RELIC_COMPLETE',meta['runtime'],flush=True)
