"""Verdant frontier capture beacon. Rebuild: npm run models:frontier-beacon."""
import bpy,math,json,hashlib,subprocess,struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=R/'public/defense/models';A=R/'art-source/defense';P=A/'frontier-beacon';P.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,glow=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes['Principled BSDF'];c=tuple(((int(color[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))+(1,);m.diffuse_color=c;n.inputs['Base Color'].default_value=c;n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=.65;n.inputs['Emission Color'].default_value=c;n.inputs['Emission Strength'].default_value=glow;return m
stone=mat('Moss stone','#75887a');lip=mat('Pale cut stone','#b2b59b');bronze=mat('Aged bronze','#ac8142',.5);gold=mat('Warm brass edge','#dfbb6d',.5);wood=mat('Verdant heartwood','#35594c');gem=mat('Signal crystal','#74e7bb',.15,.35)
parts=[]
def cylinder(name,r,depth,z,m,vertices=8):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=(0,0,z));o=bpy.context.object;o.name=name;o.data.materials.append(m);parts.append(o);return o
def cube(name,loc,scale,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);parts.append(o);return o
cylinder('Octagonal footing',1.8,.26,.13,stone)
cylinder('Foundation bevel',1.6,.18,.35,lip)
cylinder('Heartwood pillar',.9,1.65,1.25,wood)
for z in [.55,2.0]:cylinder('Brass collar',1.0,.16,z,bronze)
cylinder('Crown shelf',1.3,.28,2.24,lip)
cylinder('Crown rim',1.35,.15,2.45,bronze)
for i in range(8):
 a=i*math.tau/8
 o=cube('Stone buttress',(1.05*math.cos(a),1.05*math.sin(a),.94),(.42,.5,1.35),stone);o.rotation_euler.z=a
 o=cube('Buttress cap',(1.05*math.cos(a),1.05*math.sin(a),1.66),(.5,.57,.17),lip);o.rotation_euler.z=a
# Four segmented leaf-shaped brass shutters; each is editable under its named hinge.
base=list(parts);hinges=[];arms=[]
for i in range(4):
 a=i*math.tau/4
 bpy.ops.object.empty_add(type='PLAIN_AXES',location=(1.12*math.cos(a),1.12*math.sin(a),2.53));h=bpy.context.object;h.name='crown-hinge-'+str(i);h.rotation_euler.z=a;hinges.append(h)
 vs=[(-.18,-.24,0),(.18,-.24,0),(.18,.24,0),(-.18,.24,0),(-.38,-.31,1.0),(-.14,-.31,1.0),(-.14,.31,1.0),(-.38,.31,1.0),(-.62,-.12,1.82),(-.46,-.12,1.82),(-.46,.12,1.82),(-.62,.12,1.82)]
 fs=[(0,3,2,1),(8,9,10,11)]
 for j in [0,4]:
  for k in range(4):fs.append((j+k,j+(k+1)%4,j+(k+1)%4+4,j+k+4))
 mesh=bpy.data.meshes.new('Faceted leaf shutter');mesh.from_pydata(vs,[],fs);mesh.materials.append(bronze);mesh.materials.append(gold)
 for f in mesh.polygons:f.material_index=1 if f.index%3==0 else 0
 o=bpy.data.objects.new('Crown leaf '+str(i),mesh);bpy.context.collection.objects.link(o);o.parent=h;arms.append(o)
 for frame,q in [(1,0),(76,1)]:
  h.rotation_euler.y=math.radians(52)*q;h.keyframe_insert(data_path='rotation_euler',frame=frame)
 h.animation_data.action.name='Beacon capture / hinge '+str(i)
 for f in h.animation_data.action.fcurves:
  for k in f.keyframe_points:k.interpolation='LINEAR'
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.66,location=(0,0,3.25));core=bpy.context.object;core.name='signal-crystal';core.scale=(1,1,1.65);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);core.data.materials.append(gem)
for frame,z in [(1,3.25),(76,3.65)]:core.location.z=z;core.keyframe_insert(data_path='location',frame=frame)
core.animation_data.action.name='Beacon capture / crystal'
for f in core.animation_data.action.fcurves:
 for k in f.keyframe_points:k.interpolation='LINEAR'
s=bpy.context.scene;s.render.fps=25;s.frame_start=1;s.frame_end=76;s.frame_set(1);s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=384;s.render.resolution_y=384;s.render.resolution_percentage=100;s.render.film_transparent=True
w=bpy.data.worlds.new('Daylight');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.63,1);w.node_tree.nodes['Background'].inputs[1].default_value=.8;s.world=w
bpy.ops.object.light_add(type='AREA',location=(-5,-6,10));bpy.context.object.data.energy=900;bpy.context.object.data.size=7
bpy.ops.object.camera_add(location=(7,-9,7));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,2.3))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=7.1;s.camera=cam
s['regeneration_command']='npm run models:frontier-beacon';s['capture_duration']=3.0;s['coordinate_contract']='Z-up authored -> Y-up GLB; origin at fixed footing; capture clip 0..3 seconds'
bpy.context.preferences.filepaths.save_version=0;blend=A/'frontier-beacon.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for name,frame in [('idle',1),('half',38.5),('claimed',76)]:
 s.frame_set(int(frame),subframe=frame%1);s.render.filepath=str(P/(name+'.png'));bpy.ops.render.render(write_still=True)
s.frame_set(1)
# Group fixed parts into one runtime mesh, bake their base colors. Preserve hinges and crystal.
def pack(objs,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for f in o.data.polygons:
  c=o.data.materials[f.material_index].diffuse_color
  for j in f.loop_indices:colors.data[j].color=c
 material=bpy.data.materials.get('Runtime paint')
 if not material:
  material=bpy.data.materials.new('Runtime paint');material.use_nodes=True;nodes=material.node_tree.nodes;nodes['Principled BSDF'].inputs['Roughness'].default_value=.75;v=nodes.new('ShaderNodeVertexColor');v.layer_name='Color';material.node_tree.links.new(v.outputs['Color'],nodes['Principled BSDF'].inputs['Base Color'])
 o.data.materials.clear();o.data.materials.append(material)
 for f in o.data.polygons:f.material_index=0
 return o
fixed=pack(base,'fixed-foundation')
for o in arms:pack([o],o.name)
bpy.ops.object.select_all(action='DESELECT')
for o in [fixed,*arms,*hinges,core]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'frontier-beacon.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True)
# Blender exports scene channels separately. Bundle them into one zero-based capture clip.
glb=O/'frontier-beacon.glb';raw=glb.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);off=20+n;bn=struct.unpack_from('<I',raw,off)[0];binary=bytearray(raw[off+8:off+8+bn]);clip={'name':'beacon-capture','samplers':[],'channels':[]};seen=set()
for animation in doc['animations']:
 offset=len(clip['samplers'])
 for sampler in animation['samplers']:
  ai=sampler['input']
  if ai not in seen:
   seen.add(ai);ac=doc['accessors'][ai];bv=doc['bufferViews'][ac['bufferView']];start=bv.get('byteOffset',0)+ac.get('byteOffset',0);stride=bv.get('byteStride',4);first=struct.unpack_from('<f',binary,start)[0];times=[]
   for k in range(ac['count']):
    t=struct.unpack_from('<f',binary,start+k*stride)[0]-first;struct.pack_into('<f',binary,start+k*stride,t);times.append(t)
   ac['min']=[min(times)];ac['max']=[max(times)]
  clip['samplers'].append(sampler)
 for channel in animation['channels']:channel['sampler']+=offset;clip['channels'].append(channel)
doc['animations']=[clip];encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);glb.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
(O/'frontier-beacon.png').write_bytes((P/'idle.png').read_bytes())
subprocess.run(['ffmpeg','-y','-loglevel','error',*sum((['-i',str(P/(n+'.png'))] for n in ['idle','half','claimed']),[]),'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','90',str(O/'frontier-beacon-atlas.webp')],check=True)
files=[Path(__file__),blend,O/'frontier-beacon.glb',O/'frontier-beacon.png',O/'frontier-beacon-atlas.webp',*[P/(n+'.png') for n in ['idle','half','claimed']]]
meta={'command':'npm run models:frontier-beacon','concept':'art-source/defense/concepts/2026-10-29/castles/verdant-citadel.png','editable_meshes':len(base)+len(arms)+1,'hinges':4,'capture_seconds':3,'camera':{'position':[7,-9,7],'target':[0,0,2.3],'ortho_scale':7.1,'size':[384,384]},'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]};(O/'frontier-beacon.json').write_text(json.dumps(meta,indent=2)+'\n');print('BEACON_COMPLETE',meta['editable_meshes'])
