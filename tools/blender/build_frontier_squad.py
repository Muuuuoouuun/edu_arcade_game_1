"""Editable Arcana frontier support archer; Z-up, facing -Y. Rebuild with npm run models:frontier-squad."""
import bpy, math, hashlib, json, subprocess, struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2]; A=R/'art-source/defense'; O=R/'public/defense/models'; P=A/'frontier-squad'; P.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,c,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;v=tuple(((int(c[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))+(1,);m.diffuse_color=v;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=v;n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=.72;return m
teal=mat('Deep teal cloth','#367d78');light=mat('Pale linen','#e2d7b6');skin=mat('Warm skin','#cb9973');leather=mat('Dark leather','#634432');wood=mat('Oiled heartwood','#8a5a38');gold=mat('Worn brass','#d0a65c',.35);steel=mat('Blue iron','#789592',.35);dark=mat('Dark visor and string','#292e30');leaf=mat('Pine feather','#71bfa7')
def empty(name,loc):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;return o
rig=empty('squad-rig',(0,0,0)); body=empty('squad-body',(0,0,0)); L=empty('squad-left-foot',(-.28,0,.3)); Rt=empty('squad-right-foot',(.28,0,.3)); weapon=empty('squad-weapon',(0,-.2,0))
for e in [body,L,Rt,weapon]:e.parent=rig
parts={body:[],L:[],Rt:[],weapon:[]}
def parent(o,p):
 bpy.context.view_layer.update();world=o.matrix_world.copy();o.parent=p;o.matrix_world=world;parts[p].append(o);return o
def box(name,loc,dim,m,p):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);return parent(o,p)
def ico(name,loc,scale,m,p,sub=1):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);return parent(o,p)
def cyl_between(name,a,b,r,m,p,vertices=8):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)*.5);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(m);return parent(o,p)
# Low, broad shoulders and a compact head read as an allied scout, not a log enemy.
ico('Padded teal torso',(0,0,1.18),(.66,.40,.67),teal,body,2)
box('Leather belt',(0,-.01,.88),(1.04,.73,.17),leather,body)
box('Brass belt clasp',(0,-.39,.90),(.22,.07,.18),gold,body)
box('Long forest cape',(0,.27,1.05),(.88,.18,1.04),teal,body)
for x in [-.53,.53]:
 ico('Broad iron shoulder',(x,-.01,1.56),(.31,.38,.24),steel,body)
 box('Shoulder brass trim',(x,-.03,1.57),(.12,.69,.09),gold,body)
ico('Face',(0,-.03,1.99),(.42,.37,.44),skin,body,2)
# Broad low helmet with a split visor and tall crest for a readable silhouette.
ico('Faceted iron helmet',(0,.03,2.25),(.52,.43,.37),steel,body,2)
box('Helmet brow',(0,-.35,2.13),(1.03,.13,.15),gold,body)
box('Nose guard',(0,-.40,2.02),(.11,.09,.31),steel,body)
for x in [-.18,.18]:ico('Eye',(x,-.364,2.015),(.055,.04,.055),dark,body)
box('Helmet crest',(0,.06,2.58),(.13,.65,.26),teal,body)
for y in [-.16,.05,.24]:ico('Crest leaf',(0,y,2.69),(.12,.18,.15),leaf,body)
# Boots fit the established .34 × .40 grounding contract exactly.
for x,p in [(-.28,L),(.28,Rt)]:
 box('Boot sole',(x,0,.105),(.34,.40,.21),dark,p)
 box('Leather boot',(x,0,.31),(.32,.38,.38),leather,p)
 box('Pale trouser',(x,.02,.61),(.28,.32,.27),light,p)
 box('Brass boot rim',(x,0,.45),(.34,.39,.07),gold,p)
# Both sleeves, hands and crossbow belong to one recoil attachment; no floating weapon.
for sign in [-1,1]:
 shoulder=(sign*.48,-.10,1.43);elbow=(sign*.47,-.30,1.20);hand=(sign*.24,-.53,1.25)
 cyl_between('Linen upper arm',shoulder,elbow,.145,light,weapon)
 cyl_between('Leather forearm',elbow,hand,.13,leather,weapon)
 ico('Hand gripping weapon',hand,(.16,.14,.14),skin,weapon,2)
box('Crossbow stock',(0,-.61,1.25),(.19,.97,.17),wood,weapon)
box('Stock brass collar',(0,-.55,1.25),(.25,.13,.21),gold,weapon)
for sign in [-1,1]:
 cyl_between('Crossbow limb',(0,-.87,1.27),(sign*.72,-.78,1.32),.075,wood,weapon)
 cyl_between('Crossbow tip',(sign*.64,-.79,1.31),(sign*.76,-.77,1.32),.085,gold,weapon)
 cyl_between('Drawn string',(sign*.74,-.78,1.32),(0,-.34,1.27),.018,dark,weapon,6)
cyl_between('Loaded bolt',(0,-.38,1.33),(0,-1.19,1.33),.035,light,weapon,6)
ico('Bolt point',(0,-1.20,1.33),(.075,.12,.075),steel,weapon)
# The front of the bolt is an editable emission socket, parented to both hands.
muzzle=empty('squad-muzzle',(0,-1.32,1.33));bpy.context.view_layer.update();world=muzzle.matrix_world.copy();muzzle.parent=weapon;muzzle.matrix_world=world
# The blend contains an editable four-pose walk preview. Runtime uses simulation distance.
scene=bpy.context.scene;scene.render.fps=32;scene.frame_start=1;scene.frame_end=33
for obj,values in [(L,[(1,0,0),(9,-.3,0),(17,0,.20),(25,.3,0),(33,0,0)]),(Rt,[(1,0,0),(9,.3,0),(17,0,0),(25,-.3,0),(33,0,0)])]:
 for frame,forward,lift in values:
  obj.location.y=-forward;obj.location.z=.3+lift;obj.keyframe_insert(data_path='location',frame=frame)
 obj.animation_data.action.name='support-walk-'+obj.name
scene.frame_set(1);scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True
world=bpy.data.worlds.new('Verdant daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.63,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-5,-6,10));bpy.context.object.data.energy=900;bpy.context.object.data.size=7
bpy.ops.object.camera_add(location=(5,-10,6.9));cam=bpy.context.object;cam.rotation_euler=(1.157740592956543,0,.46364766359329224);cam.data.type='ORTHO';cam.data.ortho_scale=6.3;scene.camera=cam
scene['regeneration_command']='npm run models:frontier-squad';scene['coordinate_contract']='Blender Z-up/-Y forward -> GLB Y-up/+Z forward; original ground 0; procedural runtime walk'
bpy.context.preferences.filepaths.save_version=0;blend=A/'frontier-squad.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for i,frame in enumerate([1,9,17,25]):scene.frame_set(frame);scene.render.filepath=str(P/f'walk-{i}.png');bpy.ops.render.render(write_still=True)
scene.frame_set(1)
# Batch by attachment, keep the named rigid pivots. Vertex paint avoids per-detail draw calls.
paint=bpy.data.materials.new('Squad runtime paint');paint.use_nodes=True;bs=paint.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.8;v=paint.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';paint.node_tree.links.new(v.outputs['Color'],bs.inputs['Base Color'])
meshes=[]
for pivot,objects in parts.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name='surface-'+pivot.name
 colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for f in o.data.polygons:
  c=o.data.materials[f.material_index].diffuse_color
  for j in f.loop_indices:colors.data[j].color=c
 o.data.materials.clear();o.data.materials.append(paint)
 for f in o.data.polygons:f.material_index=0
 meshes.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in [rig,body,L,Rt,weapon,muzzle,*meshes]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'frontier-squad.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
raw=(O/'frontier-squad.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
(O/'frontier-squad.png').write_bytes((P/'walk-0.png').read_bytes())
inputs=sum((['-i',str(P/f'walk-{i}.png')] for i in range(4)),[])
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=4','-frames:v','1','-c:v','libwebp','-quality','88',str(O/'frontier-squad-atlas.webp')],check=True)
files=[Path(__file__),blend,*[P/f'walk-{i}.png' for i in range(4)],O/'frontier-squad.glb',O/'frontier-squad.png',O/'frontier-squad-atlas.webp']
meta={'command':'npm run models:frontier-squad','concept':'art-source/defense/concepts/2026-11-06/verdant-heart.png','runtime':{'meshes':len(meshes),'triangles':tris,'materials':1,'forward':[0,0,1],'ground':0,'walk_stride':1.2,'muzzle_rest':[0,1.33,1.32],'muzzle_recoil':.16,'procedural_motion':True},'camera':{'position':[5,-10,6.9],'rotation':[1.157740592956543,0,.46364766359329224],'ortho_scale':6.3,'resolution':[384,384]},'preview_frames':[1,9,17,25],'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(O/'frontier-squad.json').write_text(json.dumps(meta,indent=2)+'\n');print('SQUAD_COMPLETE',meta['runtime'],flush=True)
