"""Root-bound masonry gateway. Actual editable geometry, static GLB and one aligned battle bake.
Run: npm run models:forest-gate
"""
import bpy,math,json,hashlib,subprocess
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';SOURCE=ROOT/'art-source/defense';SOURCE.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
parts=[]
def material(name,color,metal=0,rough=.75,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
stone=material('Warm limestone',(.32,.34,.22));light=material('Limestone cap',(.48,.49,.31));dark=material('Stone recess',(.25,.29,.22));wood=material('Old oak roots',(.12,.052,.018));bark=material('Oak ridge',(.22,.11,.035));green=material('Deep green shingles',(.025,.095,.04));leaf=material('Leaf tile edge',(.07,.18,.045));gold=material('Aged brass',(.48,.26,.06),.6,.35);glass=material('Amber lantern',(.95,.51,.10),.1,.3,1.5);gem=material('Verdant core',(.24,.73,.40),.25,.25,.35)
def finish(o,name,mat,bevel=0):
 o.name=name;o.data.materials.append(mat);parts.append(o)
 if bevel:m=o.modifiers.new('Soft crafted edge','BEVEL');m.width=bevel;m.segments=2
 return o
def block(name,loc,size,mat,bevel=.035):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bevel)
def cone(name,loc,r1,r2,depth,mat,vertices=12):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc);return finish(bpy.context.object,name,mat,.02)
def beam(name,a,b,r,mat):
 a,b=Vector(a),Vector(b);o=cone(name,(a+b)/2,r,r*.85,(b-a).length,mat,8);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def root(name,points,r,mat):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=r;c.bevel_resolution=1;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for i,(p,co) in enumerate(zip(s.bezier_points,points)):
  p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO';p.radius=1.35-1.05*i/max(1,len(points)-1)
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');finish(bpy.context.object,name,mat);o.select_set(False)
# Real passage: no black plane or wall spans the central opening.
for side in (-1,1):
 x=side*1.72
 block('Pier footing',(x,0,.13),(1.25,1.9,.26),dark,.065)
 block('Mortar pier core',(x,0,1.22),(.94,1.50,2.02),dark,.015)
 for row in range(5):
  block('Pier ashlar course',(x,0,.44+row*.38),(1.0,1.6,.35),light if row%3==0 else stone)
 block('Springer cap',(x,0,2.24),(1.17,1.78,.18),light)
 # Watchtower bases and open timber lookout with layered green roofs.
 cone('Watchtower drum',(side*1.92,.10,2.65),.68,.66,.72,stone)
 cone('Watchtower cornice',(side*1.92,.10,3.06),.79,.79,.16,light)
 for i in range(6):
  a=i*math.tau/6;xx=side*1.92+math.cos(a)*.52;yy=.1+math.sin(a)*.52
  beam('Lookout oak post',(xx,yy,3.08),(xx,yy,3.68),.075,wood)
 cone('Lookout sill',(side*1.92,.1,3.25),.66,.66,.12,bark)
 for z,r in [(3.62,.91),(3.84,.72),(4.05,.5)]:
  cone('Layered leaf roof',(side*1.92,.1,z+.16),r,.12,.36,green)
  cone('Brass roof lip',(side*1.92,.1,z-.015),r*1.015,r,.045,gold)
 cone('Roof crown',(side*1.92,.1,4.40),.13,0,.32,gold,8)
 # Two intertwined roots spread over the actual load-bearing pier.
 root('Outer living root',[(x+side*.7,-.75,.08),(x+side*.23,-.91,.40),(x-side*.20,-.91,1.15),(x+side*.22,-.83,1.85),(x-side*.08,-.80,2.50)],.13,wood)
 root('Raised bark ridge',[(x+side*.55,-.87,.06),(x-side*.04,-1.0,.52),(x+side*.20,-.91,1.25),(x-side*.15,-.88,2.15)],.055,bark)
 root('Root toe',[(x,-.87,.4),(x-side*.3,-1.10,.15),(x-side*.58,-1.2,.08)],.09,wood)
 # Lanterns hang beside the opening, never across it.
 lx=side*1.12
 beam('Lantern bracket',(side*1.5,-.84,2.17),(lx,-1.10,2.17),.045,gold)
 cone('Lantern glow',(lx,-1.10,1.85),.105,.10,.35,glass,6)
 cone('Lantern cap',(lx,-1.10,2.08),.16,.02,.16,gold,6)
 cone('Lantern foot',(lx,-1.10,1.64),.14,.11,.09,gold,6)
 for dx in (-.09,.09):beam('Lantern frame',(lx+dx,-1.17,1.65),(lx+dx,-1.17,2.03),.017,gold)
 # Broad banner and raised leaf mark remain visible at small sizes.
 block('Green pennant',(side*1.92,-.60,2.82),(.36,.035,.43),green,.01)
 beam('Pennant gold stem',(side*1.92,-.635,2.66),(side*1.92,-.635,2.96),.015,gold)
 for j in range(3):
  for sign in (-1,1):beam('Pennant leaf',(side*1.92,-.635,2.73+j*.07),(side*1.92+sign*.08,-.64,2.79+j*.07),.018,gold)
# Voussoirs across the full passage depth; joints describe the load path.
for i in range(13):
 a=i*math.pi/13+.012;b=(i+1)*math.pi/13-.012
 ring=[(1.22*math.cos(a),2.14+1.12*math.sin(a)),(1.68*math.cos(a),2.14+1.58*math.sin(a)),(1.68*math.cos(b),2.14+1.58*math.sin(b)),(1.22*math.cos(b),2.14+1.12*math.sin(b))]
 vs=[(x,y,z) for y in (-.80,.80) for x,z in ring];faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 mesh=bpy.data.meshes.new('Arch wedge');mesh.from_pydata(vs,[],faces);mesh.update();o=bpy.data.objects.new('Arch stone %02d'%i,mesh);scene.collection.objects.link(o);finish(o,o.name,light if i==6 else stone,.025)
 # Inset continuous mortar closes the joints without filling the passage.
 ca=i*math.pi/13;cb=(i+1)*math.pi/13
 backing=[(1.24*math.cos(ca),2.14+1.14*math.sin(ca)),(1.66*math.cos(ca),2.14+1.56*math.sin(ca)),(1.66*math.cos(cb),2.14+1.56*math.sin(cb)),(1.24*math.cos(cb),2.14+1.14*math.sin(cb))]
 mesh=bpy.data.meshes.new('Arch mortar');mesh.from_pydata([(x,y,z) for y in (-.74,.74) for x,z in backing],[],faces);mesh.update();o=bpy.data.objects.new('Arch mortar core',mesh);scene.collection.objects.link(o);finish(o,o.name,dark)

# Two roof slopes made from overlapping individual shingle courses.
for side in (-1,1):
 for row in range(4):
  x=side*(.25+row*.40);z=4.03-row*.23
  for j in range(5):
   o=block('Central roof shingle',(x,-.72+j*.36,z),(.53,.39,.10),green if (row+j)%3 else leaf,.025);o.rotation_euler.y=side*math.radians(30)
beam('Oak ridge cap',(0,-1.03,4.18),(0,1.08,4.18),.09,bark)
for side in (-1,1):root('Root arch brace',[(side*1.80,-.95,2.16),(side*1.38,-.96,3.18),(side*.65,-.95,3.63),(0,-.93,3.83)],.10,bark)
o=cone('Leaf crest',(0,-1.01,3.56),.18,0,.48,gem,4);o.rotation_euler.x=math.pi/2
# Small leaf clusters use planar volumes, not billboard textures.
for side in (-1,1):
 for i in range(5):
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(side*(1.0+i*.17),-.98,3.42-i*.17));o=bpy.context.object;o.scale=(.18,.06,.11);o.rotation_euler.y=side*.45;finish(o,'Ivy leaf',leaf)
scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=False
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Forest daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.75,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
for name,loc,energy,size,color in [('Warm key',(-4,-6,9),1100,6,(1,.87,.68)),('Sky fill',(4,1,6),600,5,(.65,.8,1))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('Common gate camera');cam=bpy.data.objects.new(c.name,c);scene.collection.objects.link(cam);cam.location=(4,-10,7);target=Vector((0,0,2.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();c.type='ORTHO';c.ortho_scale=6.8;scene.camera=cam
bpy.context.view_layer.update();ground=world_to_camera_view(scene,cam,Vector((0,0,0)));anchor=[ground.x*512,(1-ground.y)*512]
front=world_to_camera_view(scene,cam,Vector((0,-1,0)));depth_offset=((1-front.y)*512-anchor[1])*170/512
graph=bpy.context.evaluated_depsgraph_get()
for z in (.5,1,1.8,2.5):assert not scene.ray_cast(graph,Vector((0,-4,z)),Vector((0,1,0)),distance=8)[0],('blocked passage',z)
for x in (-1.72,1.72):assert scene.ray_cast(graph,Vector((x,-4,1)),Vector((0,1,0)),distance=8)[0],('missing pier',x)
scene['regeneration_command']='npm run models:forest-gate';scene['battle_sort_anchor']='Ground origin; scene y=318, outpost y=131';bpy.context.preferences.filepaths.save_version=0
source=SOURCE/'forest-gate.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
png=SOURCE/'forest-gate.png';scene.render.filepath=str(png);bpy.ops.render.render(write_still=True)
import shutil
shutil.copyfile(png,OUT/'forest-gate.png');webp=OUT/'forest-gate-game.webp';subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(png),'-c:v','libwebp','-quality','92',str(webp)],check=True)
# Batch evaluated surfaces per material; the saved source keeps every stone/root editable.
bpy.ops.object.select_all(action='DESELECT');graph=bpy.context.evaluated_depsgraph_get();batches={}
for obj in parts:
 clone=bpy.data.objects.new(obj.name,bpy.data.meshes.new_from_object(obj.evaluated_get(graph),depsgraph=graph));scene.collection.objects.link(clone);clone.matrix_world=obj.matrix_world.copy();batches.setdefault(obj.data.materials[0].name,[]).append(clone)
exports=[]
for mat,objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name=mat+' / gate surface';exports.append(objects[0])
bpy.ops.object.select_all(action='DESELECT')
for o in exports:o.select_set(True)
glb=OUT/'forest-gate.glb';bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
manifest={'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'regeneration_command':'npm run models:forest-gate','concept':'art-source/defense/concepts/2026-10-29/castles/verdant-citadel.png','camera':{'location':list(cam.location),'target':list(target),'ortho_scale':c.ortho_scale,'resolution':[512,512],'ground_anchor':anchor},'battle':{'width':170,'height':170,'x':-anchor[0]*170/512,'y':-anchor[1]*170/512,'depth_offset':depth_offset,'sort_y':318+depth_offset,'outpost_sort_y':131+depth_offset*.82,'outpost_scale':.82},'editable_parts':len(parts),'runtime_meshes':len(exports),'files':[{'file':str(f.relative_to(ROOT)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in (png,glb,webp,OUT/'forest-gate.png')]}
(OUT/'forest-gate.json').write_text(json.dumps(manifest,indent=2)+'\n');print('FOREST_GATE_COMPLETE',json.dumps(manifest['battle']))

contract={'src':'/defense/models/forest-gate-game.webp',**{k:round(v,5) for k,v in manifest['battle'].items()}}
(ROOT/'src/games/defense/forestGateModel.ts').write_text('// Generated by npm run models:forest-gate; keep camera anchors in sync.\nexport const FOREST_GATE = '+json.dumps(contract,indent=2)+' as const;\n')
