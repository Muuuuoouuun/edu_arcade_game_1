"""Articulated doors for the existing forest gate. Rebuild: npm run models:frontier-forest-doors."""
import bpy,bmesh,math,json,hashlib,subprocess,struct,shutil
from pathlib import Path
R=Path(__file__).resolve().parents[2];A=R/'art-source/defense';O=R/'public/defense/models';P=A/'frontier-forest-doors';P.mkdir(exist_ok=True)
base=A/'forest-gate.blend';bpy.ops.wm.open_mainfile(filepath=str(base));s=bpy.context.scene
def material(name,c,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;v=tuple(((int(c[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))+(1,);m.diffuse_color=v;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=v;n.inputs['Roughness'].default_value=.75;n.inputs['Metallic'].default_value=metal;return m
oak=material('Gate oak','#8b5936');oak_light=material('Gate oak light','#ae7950');iron=material('Gate iron','#34443c',.35);brass=material('Gate brass','#d2ad69',.4)
def box(name,loc,size,mat,parent):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o.parent=parent;return o
hinges=[];parts=[]
for i,side in enumerate((-1,1)):
 h=bpy.data.objects.new('forest-leaf-'+str(i),None);s.collection.objects.link(h);h.location=(side*1.17,0,-.0477514);hinges.append(h);leaf=[];direction=-side
 # Real planks follow the existing 1.22 x 1.12 elliptical stone opening.
 for j in range(4):
  u0=j*1.16/4+.006;u1=(j+1)*1.16/4-.006
  def top(u):
   x=side*1.17+direction*u
   return 2.14+1.12*math.sqrt(max(0,1-(x/1.22)**2))-.14
  vs=[(direction*u,y,z) for y in (-.14,.14) for u,z in ((u0,0),(u1,0),(u1,top(u1)),(u0,top(u0)))]
  mesh=bpy.data.meshes.new('Arched oak plank');mesh.from_pydata(vs,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.materials.append(oak_light if j%2==0 else oak);o=bpy.data.objects.new('Forest gate plank',mesh);s.collection.objects.link(o);o.parent=h;leaf.append(o)
 if i==0:leaf.append(box('Center meeting stile',(direction*1.16,0,1.55),(.10,.36,3.1),iron,h))
 for z in (.52,1.5,2.17):
  for y in (-.17,.17):
   leaf.append(box('Forged strap',(direction*.58,y,z),(1.16,.08,.13),iron,h))
   for u in (.18,.58,1.02):leaf.append(box('Brass rivet',(direction*u,y*1.38,z),(.065,.055,.065),brass,h))
 for z in (.52,1.5):leaf.append(box('Hinge knuckle',(0,0,z),(.14,.35,.23),iron,h))
 leaf.append(box('Leaf latch',(direction*1.04,-.22,1.16),(.18,.12,.25),brass,h));parts.append(leaf)
 for frame,angle in ((1,0),(6,side*.15),(13,-side*.045),(22,side*.018),(34,0)):
  h.rotation_euler.z=angle;h.keyframe_insert(data_path='rotation_euler',frame=frame)
 for curve in h.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
s.frame_start=1;s.frame_end=34;s.render.fps=60;s.frame_set(1);s.cycles.samples=24;s.render.resolution_x=512;s.render.resolution_y=512;s.render.resolution_percentage=100;s.render.film_transparent=True
s['regeneration_command']='npm run models:frontier-forest-doors';s['impact_duration']=.55;s['concept']='art-source/defense/concepts/2026-11-06/verdant-heart.png';bpy.context.preferences.filepaths.save_version=0
blend=A/'frontier-forest-doors.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
poses=[('idle',1),('contact',6),('rebound',13),('settled',34)]
for name,frame in poses:
 s.frame_set(frame);s.render.filepath=str(P/(name+'.png'));bpy.ops.render.render(write_still=True)
s.frame_set(1)
def pack(objs,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 color=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for f in o.data.polygons:
  c=o.data.materials[f.material_index].diffuse_color
  for j in f.loop_indices:color.data[j].color=c
 m=bpy.data.materials.get('Runtime forest door paint')
 if not m:
  m=bpy.data.materials.new('Runtime forest door paint');m.use_nodes=True;n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color']);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75
 o.data.materials.clear();o.data.materials.append(m)
 for f in o.data.polygons:f.material_index=0
 return o
packed=[pack(p,'forest-door-'+str(i)) for i,p in enumerate(parts)];bpy.ops.object.select_all(action='DESELECT')
for o in [*packed,*hinges]:o.select_set(True)
glb=O/'frontier-forest-doors.glb';bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True)
# Combine sampled hinge tracks into one zero-based GLB animation.
raw=glb.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);off=20+n;bn=struct.unpack_from('<I',raw,off)[0];binary=bytearray(raw[off+8:off+8+bn]);clip={'name':'forest-door-impact','samplers':[],'channels':[]};seen=set()
for a in doc['animations']:
 offset=len(clip['samplers'])
 for sampler in a['samplers']:
  ai=sampler['input']
  if ai not in seen:
   seen.add(ai);ac=doc['accessors'][ai];bv=doc['bufferViews'][ac['bufferView']];start=bv.get('byteOffset',0)+ac.get('byteOffset',0);stride=bv.get('byteStride',4);first=struct.unpack_from('<f',binary,start)[0];times=[]
   for k in range(ac['count']):
    t=struct.unpack_from('<f',binary,start+k*stride)[0]-first;struct.pack_into('<f',binary,start+k*stride,t);times.append(t)
   ac['min']=[min(times)];ac['max']=[max(times)]
  clip['samplers'].append(sampler)
 for c in a['channels']:c['sampler']+=offset;clip['channels'].append(c)
doc['animations']=[clip];encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);glb.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
preview=O/'frontier-forest-doors.png';shutil.copyfile(P/'idle.png',preview);atlas=O/'frontier-forest-doors-atlas.webp'
subprocess.run(['ffmpeg','-y','-loglevel','error',*sum((['-i',str(P/(name+'.png'))] for name,_ in poses),[]),'-filter_complex','hstack=inputs=4','-frames:v','1','-c:v','libwebp','-quality','90',str(atlas)],check=True)
files=[Path(__file__),base,blend,glb,preview,atlas,*[P/(name+'.png') for name,_ in poses]]
meta={'command':'npm run models:frontier-forest-doors','concept':s['concept'],'duration':.55,'clip':'forest-door-impact','camera':{'position':[4,-10,7],'target':[0,0,2.1],'ortho_scale':6.8,'size':[512,512]},'poses':[{'name':name,'frame':frame,'time':(frame-1)/60} for name,frame in poses],'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(O/'frontier-forest-doors.json').write_text(json.dumps(meta,indent=2)+'\n');print('FOREST_DOORS_COMPLETE')
