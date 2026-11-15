"""Frost gate's timber leaves, hanging lanterns and contact recoil. Rebuild: npm run models:frontier-gate-impact."""
import bpy,bmesh,math,json,hashlib,subprocess,struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];O=R/'public/defense/models';A=R/'art-source/defense';P=A/'frontier-gate-impact';P.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(A/'frontier-frost.blend'))
gate=list(bpy.data.collections['Frost gate / standalone architecture'].objects)
for o in list(bpy.context.scene.objects):
 if o not in gate:bpy.data.objects.remove(o,do_unlink=True)
for o in gate:o.location.x+=14;o.location.y+=21
# Replace block lanterns with suspended cages; stone and banner geometry stays fixed.
for o in list(gate):
 if o.name.startswith('Lantern amber'):
  gate.remove(o);bpy.data.objects.remove(o,do_unlink=True)
def mat(name,c,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;v=tuple(((int(c[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))+(1,);m.diffuse_color=v;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=v;n.inputs['Roughness'].default_value=.7;n.inputs['Metallic'].default_value=metal;return m
wood=mat('Cold oak','#79533c');pale=mat('Oak edge','#aa7d52');iron=mat('Forged iron','#30475d',.45);brass=mat('Brass rivets','#ccaa66',.45);light=mat('Amber panes','#ffca71')
def cube(name,loc,scale,m,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if parent:o.parent=parent
 return o
def hinge(name,loc):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;return o
leaves=[];lanterns=[];hinges=[];editable=[]
for i,side in enumerate([-1,1]):
 h=hinge('gate-leaf-'+str(i),(side*1.48,0,.08));hinges.append(h);parts=[];direction=-side
 # Five curved-top planks keep a broad readable timber silhouette inside the existing arch.
 for j in range(5):
  u0=j*1.46/5+.008;u1=(j+1)*1.46/5-.008
  def top(u):return 2.05+math.sqrt(max(0,1.55**2-(side*1.48+direction*u)**2))-.16
  vs=[(direction*u,y,z) for y in [-.16,.16] for u,z in [(u0,0),(u1,0),(u1,top(u1)),(u0,top(u0))]]
  me=bpy.data.meshes.new('Curved oak plank');me.from_pydata(vs,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.materials.append(wood if j%2 else pale);o=bpy.data.objects.new('Arched timber plank',me);bpy.context.collection.objects.link(o);o.parent=h;parts.append(o)
 if i==0:parts.append(cube('Center meeting stile',(1.48,0,1.7),(.08,.38,3.4),iron,h))
 for z in [.5,1.7,2.45]:
  for y in [-.19,.19]:
   parts.append(cube('Forged cross strap',(direction*.73,y,z),(1.46,.10,.16),iron,h))
   for u in [.18,.73,1.3]:parts.append(cube('Brass strap bolt',(direction*u,y*1.32,z),(.075,.065,.075),brass,h))
 for z in [.5,1.7]:parts.append(cube('Hinge knuckle',(0,0,z),(.18,.48,.30),iron,h))
 parts.append(cube('Latch boss',(direction*1.27,-.29,1.22),(.24,.18,.32),brass,h));parts.append(cube('Rear latch boss',(direction*1.27,.29,1.22),(.24,.18,.32),brass,h));leaves.append(parts);editable+=parts
 # Lantern suspension pivots at the bracket; pendulum motion lags the heavy leaves.
 l=hinge('gate-lantern-'+str(i),(side*2.35,-1.3,1.65));hinges.append(l);parts=[]
 parts.append(cube('Lantern suspension',(0,0,-.13),(.09,.09,.26),iron,l));parts.append(cube('Lantern glass',(0,0,-.49),(.34,.32,.5),light,l))
 for z in [-.77,-.22]:parts.append(cube('Lantern cap',(0,0,z),(.47,.45,.10),brass,l))
 for x in [-.20,.20]:
  for y in [-.19,.19]:parts.append(cube('Lantern cage',(x,y,-.49),(.045,.045,.50),iron,l))
 lanterns.append(parts);editable+=parts
 for frame,angle in [(1,0),(6,side*.15),(13,-side*.045),(22,side*.018),(34,0)]:
  h.rotation_euler.z=angle;h.keyframe_insert(data_path='rotation_euler',frame=frame)
 for frame,angle in [(1,0),(4,0),(10,.30),(20,-.11),(28,.04),(34,0)]:
  l.rotation_euler.x=angle;l.keyframe_insert(data_path='rotation_euler',frame=frame)
for h in hinges:
 for f in h.animation_data.action.fcurves:
  for k in f.keyframe_points:k.interpolation='LINEAR'
s=bpy.context.scene;s.frame_start=1;s.frame_end=34;s.render.fps=60;s.frame_set(1);s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.resolution_x=384;s.render.resolution_y=384;s.render.resolution_percentage=100;s.render.film_transparent=True
bpy.ops.object.light_add(type='AREA',location=(-5,-7,10));bpy.context.object.data.energy=1100;bpy.context.object.data.size=7
bpy.ops.object.camera_add(location=(7,-11,8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=9;s.camera=cam
s['regeneration_command']='npm run models:frontier-gate-impact';s['impact_duration']=.55;s['fixed_footing']='Original frost gate stone pillars never move';s['concept']='art-source/defense/concepts/2026-11-09/polar-battlefield.png'
bpy.context.preferences.filepaths.save_version=0;blend=A/'frontier-frost-gate-impact.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for name,frame in [('idle',1),('contact',6),('secondary',10),('settled',34)]:
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
 m=bpy.data.materials.get('Runtime gate paint')
 if not m:
  m=bpy.data.materials.new('Runtime gate paint');m.use_nodes=True;n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color']);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75
 o.data.materials.clear();o.data.materials.append(m)
 for f in o.data.polygons:f.material_index=0
 return o
packed=[pack(gate,'gate-fixed-stone')]+[pack(g,'gate-door-'+str(i)) for i,g in enumerate(leaves)]+[pack(g,'gate-lamp-'+str(i)) for i,g in enumerate(lanterns)]
bpy.ops.object.select_all(action='DESELECT')
for o in [*packed,*hinges]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'frontier-frost-gate-impact.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True)
# Consolidate per-object tracks into a zero-based clip without changing their samples.
glb=O/'frontier-frost-gate-impact.glb';raw=glb.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);off=20+n;bn=struct.unpack_from('<I',raw,off)[0];binary=bytearray(raw[off+8:off+8+bn]);clip={'name':'frost-gate-impact','samplers':[],'channels':[]};seen=set()
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
(O/'frontier-frost-gate-impact.png').write_bytes((P/'idle.png').read_bytes())
subprocess.run(['ffmpeg','-y','-loglevel','error',*sum((['-i',str(P/(n+'.png'))] for n in ['idle','contact','secondary','settled']),[]),'-filter_complex','hstack=inputs=4','-frames:v','1','-c:v','libwebp','-quality','90',str(O/'frontier-frost-gate-impact-atlas.webp')],check=True)
files=[Path(__file__),A/'frontier-frost.blend',blend,glb,O/'frontier-frost-gate-impact.png',O/'frontier-frost-gate-impact-atlas.webp',*[P/(n+'.png') for n in ['idle','contact','secondary','settled']]]
poses=[]
for i,(name,frame) in enumerate([('idle',1),('contact',6),('secondary',10),('settled',34)]):
 poses.append({'name':name,'index':i,'source_frame':frame,'time':(frame-1)/60})
meta={
 'command':'npm run models:frontier-gate-impact','concept':s['concept'],
 'editable_meshes':len(gate)+len(editable),'hinges':4,'duration':.55,
 'atlas':{'path':'public/defense/models/frontier-frost-gate-impact-atlas.webp',
          'frame_size':[384,384],'columns':4,'rows':1,'poses':poses},
 'camera':{'position':[7,-11,8],'target':[0,0,2],'ortho_scale':9,'size':[384,384]},
 'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
}
(O/'frontier-frost-gate-impact.json').write_text(json.dumps(meta,indent=2)+'\n')
print('FROST_GATE_IMPACT_COMPLETE',meta['editable_meshes'])
