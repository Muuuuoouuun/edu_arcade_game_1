"""Author the editable dwarf guardian, articulated GLB and shared-camera action sprites.

Run: blender -b --python tools/blender/build_dwarf.py
Options after --: --samples 128 --size 640 --only idle|windup|strike|recover --skip-render
All forms, materials and poses are actual Blender geometry, without image inputs.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/defense/models'
SOURCE=ROOT/'art-source/defense'
p=argparse.ArgumentParser()
p.add_argument('--samples',type=int,default=128)
p.add_argument('--size',type=int,default=640)
p.add_argument('--only',choices=['idle','windup','strike','recover'])
p.add_argument('--skip-render',action='store_true')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT.mkdir(parents=True,exist_ok=True); SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Dwarf guardian / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)
ROOT_OBJ=None

def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'steel':material('Steel / blue forged armor',(.16,.25,.29),.70,.35),
 'edge':material('Steel / bevel highlights',(.37,.48,.50),.77,.28),
 'dark':material('Steel / recessed dark joints',(.035,.065,.075),.55,.49),
 'bronze':material('Bronze / warm armor trim',(.55,.26,.065),.75,.32),
 'gold':material('Bronze / polished edge',(.85,.50,.15),.72,.28),
 'skin':material('Skin / warm copper',(.63,.30,.14),0,.67),
 'nose':material('Skin / rosy nose',(.71,.25,.13),0,.61),
 'beard':material('Hair / copper beard',(.29,.075,.018),0,.72),
 'hairlight':material('Hair / warm braid ridges',(.49,.17,.035),0,.68),
 'hairdark':material('Hair / beard groove',(.12,.028,.009),0,.8),
 'teal':material('Cloth / deep jade wool',(.014,.17,.15),0,.86),
 'teallight':material('Cloth / lit woven folds',(.025,.25,.20),0,.83),
 'leather':material('Leather / burgundy straps',(.13,.035,.023),0,.77),
 'sole':material('Leather / heavy boot sole',(.035,.025,.022),0,.85),
 'stone':material('Hammer / cold granite',(.24,.29,.30),.15,.78),
 'stoneedge':material('Hammer / fractured stone edge',(.39,.44,.43),.18,.7),
 'rune':material('Rune / pale mint inlay',(.17,.73,.58),.15,.33,.55),
 'ivory':material('Eye / pale amber whites',(.91,.82,.58),0,.45),
 'pupil':material('Eye / obsidian pupil',(.012,.02,.019),0,.33),
}

def finish(o,name,mat=None,parent=None,bevel=0,smooth=False):
 o.name=name
 for col in list(o.users_collection):col.objects.unlink(o)
 COL.objects.link(o)
 if mat:o.data.materials.append(M[mat])
 bpy.context.view_layer.update()
 parent=parent or ROOT_OBJ
 if parent:
  matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
 if bevel:
  mod=o.modifiers.new('Forged softened edges','BEVEL');mod.width=bevel;mod.segments=2
  normal=o.modifiers.new('Weighted corners','WEIGHTED_NORMAL');normal.keep_sharp=True
 if smooth and o.type=='MESH':
  for poly in o.data.polygons:poly.use_smooth=True
 return o

def group(name,location=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);COL.objects.link(o);o.empty_display_type='PLAIN_AXES';o.empty_display_size=.15
 o.location=location;bpy.context.view_layer.update()
 if parent:
  matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
 bpy.context.view_layer.update();return o

def cube(name,loc,size,mat,parent=None,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent,bevel)

def ico(name,loc,size,mat,parent=None,sub=2):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent)

def uv(name,loc,size,mat,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent,smooth=True)

def mesh(name,verts,faces,mat,parent=None,bevel=0):
 d=bpy.data.meshes.new(name+' shape');d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);COL.objects.link(o)
 return finish(o,name,mat,parent,bevel)

def cyl(name,loc,radius,depth,mat,parent=None,vertices=12,bevel=.015):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
 return finish(bpy.context.object,name,mat,parent,bevel)

def rod(name,a,b,r,mat,parent=None,vertices=12):
 a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,parent,vertices)
 o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def beam(name,a,b,width,depth,mat,parent=None):
 a,b=Vector(a),Vector(b);o=cube(name,(a+b)/2,(width,depth,(b-a).length),mat,parent,min(width*.15,.035))
 o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def panel(name,points,y,thick,mat,parent=None,bevel=.02):
 n=len(points);v=[(x,y-thick/2,z) for x,z in points]+[(x,y+thick/2,z) for x,z in points]
 f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,v,f,mat,parent,bevel)

def rivet(name,loc,parent=None,r=.035):return uv(name,loc,(r,r,r),'gold',parent)

ROOT_OBJ=group('dwarf-guardian')
ROOT_OBJ['asset']='Arcana dwarf guardian / actual articulated mesh'
ROOT_OBJ['forward']='Blender +Y; game sprite faces right; GLB -Z after Y-up conversion'
body=group('body',(0,0,1.15),ROOT_OBJ)
head=group('head',(0,.04,2.3),body)
arm=group('hammer-arm',(-.76,.02,2.1),body)
forearm=group('hammer-forearm',(-.94,.5,1.85),arm)
hammer=group('hammer',(-1.03,.92,2.04),forearm)
guard=group('guard-arm',(.78,.02,2.1),body)

# Grounded, broad boots and layered greaves stay still through all poses.
for side,x in [('right',-.43),('left',.43)]:
 cube(f'{side} boot / sole',(x,.14,.10),(.64,.85,.19),'sole',ROOT_OBJ,.075)
 cube(f'{side} boot / leather',(x,.12,.31),(.59,.75,.36),'leather',ROOT_OBJ,.105)
 cube(f'{side} boot / steel toe',(x,.38,.34),(.61,.38,.27),'steel',ROOT_OBJ,.08)
 beam(f'{side} boot / raised toe trim',(x-.25,.57,.36),(x+.25,.57,.36),.055,.055,'bronze',ROOT_OBJ)
 ico(f'{side} shin / wool trouser',(x,-.02,.65),(.30,.28,.43),'teal',ROOT_OBJ)
 cube(f'{side} greave / knee armor',(x,.22,.76),(.46,.14,.58),'steel',ROOT_OBJ,.06)
 cube(f'{side} greave / central ridge',(x,.31,.77),(.10,.055,.45),'edge',ROOT_OBJ,.025)
 for z in (.55,.91):beam(f'{side} greave / bronze binding',(x-.23,.28,z),(x+.23,.28,z),.06,.06,'bronze',ROOT_OBJ)
 for s in (-1,1):rivet(f'{side} greave / rivet',(x+s*.18,.323,.92),ROOT_OBJ,.027)

# Short folded cape with physical thickness and contrasting edge piping.
cape_verts=[]
for z,width,y in [(2.16,.65,-.27),(1.63,.80,-.42),(.91,.78,-.53)]:
 for i in range(7):
  x=(i/6-.5)*width*2;cape_verts.append((x,y+(.035 if i%2 else -.055),z+(.065 if i%2 and z<1 else 0)))
cape_faces=[(r*7+c,r*7+c+1,(r+1)*7+c+1,(r+1)*7+c) for r in range(2) for c in range(6)]
cape=mesh('Cape / seven heavy woven folds',cape_verts,cape_faces,'teal',body)
cape.data.materials.append(M['teallight'])
for face in cape.data.polygons:face.material_index=face.index%2
solid=cape.modifiers.new('Wool thickness','SOLIDIFY');solid.thickness=.04
for side in (-1,1):rod('Cape / edge embroidery',(side*.65,-.30,2.16),(side*.78,-.57,.91),.028,'bronze',body)

ico('Body / squat padded undercoat',(0,0,1.52),(.70,.43,.67),'leather',body)
ico('Cuirass / forged rounded body',(0,.03,1.85),(.68,.44,.53),'steel',body)
# Fan-shaped front plates and a central raised rune, rather than one flat box.
for i in range(3):
 z=1.37+i*.18;w=.62+i*.025
 panel(f'Cuirass / overlap plate {i+1}',[(-w,z+.14),(-w*.94,z),(.0,z-.04),(w*.94,z),(w,z+.14)],.425,.07,'steel' if i%2 else 'edge',body,.025)
 beam(f'Cuirass / bronze plate seam {i+1}',(-w,.474,z+.13),(w,.474,z+.13),.035,.035,'bronze',body)
panel('Chest / bronze heraldic border',[(-.24,2.16),(.24,2.16),(.22,1.84),(0,1.69),(-.22,1.84)],.447,.09,'bronze',body)
panel('Chest / inset jade enamel',[(-.18,2.1),(.18,2.1),(.16,1.87),(0,1.76),(-.16,1.87)],.505,.035,'teal',body)
for a,b in [((-.09,.535,2.03),(0,.535,2.12)),((0,.535,2.12),(.09,.535,2.03)),((0,.535,2.12),(0,.535,1.85))]:rod('Chest / mountain clan sigil',a,b,.022,'gold',body,8)
cube('Belt / broad leather strap',(0,.0,1.17),(1.40,.86,.20),'leather',body,.09)
cube('Belt / forged buckle',(0,.47,1.18),(.36,.12,.28),'bronze',body,.04)
cube('Belt / buckle recess',(0,.545,1.18),(.23,.04,.17),'dark',body,.025)
beam('Belt / buckle pin',(-.09,.58,1.18),(.12,.58,1.18),.045,.045,'gold',body)
for side in (-1,1):
 for row in range(2):
  x=side*(.30+row*.28)
  panel('Tassets / hanging skirt plate',[(x-.14,1.10),(x+.14,1.1),(x+.12,.77),(x-.11,.81)],.33 if row else .40,.07,'steel',body)
  rivet('Tassets / bronze clasp',(x,.46 if not row else .39,1.04),body)

# Arms: readable segmented shoulder/upper/forearm anatomy; articulated pivots.
for name,x,par in [('Hammer',-.78,arm),('Guard',.78,guard)]:
 ico(name+' shoulder / padded joint',(x,.02,2.07),(.32,.33,.32),'leather',par)
 shoulder=cube(name+' shoulder / steel pauldron',(x,0,2.23),(.76,.73,.31),'steel',par,.12)
 shoulder.rotation_euler.y=(-.18 if x<0 else .18)
 cube(name+' shoulder / crown ridge',(x,.01,2.405),(.19,.64,.075),'edge',par,.02)
 for y in (-.23,.23):beam(name+' shoulder / bronze seam',(x-.3,y,2.35),(x+.3,y,2.35),.045,.045,'bronze',par)
 for dx in (-.23,.23):rivet(name+' shoulder / stud',(x+dx,.345,2.22),par,.045)
# Hammer-side arm angles forward, leaving the beard unobstructed.
rod('Hammer arm / leather sleeve',(-.78,.02,2.06),(-.94,.50,1.85),.23,'leather',arm)
ico('Hammer arm / elbow',(-.94,.50,1.85),(.24,.23,.24),'dark',forearm)
rod('Hammer arm / bracer',(-.94,.51,1.87),(-1.03,.87,2.01),.245,'steel',forearm)
rod('Hammer arm / bracer bronze cuff',(-.95,.59,1.90),(-.98,.67,1.94),.263,'bronze',forearm)
ico('Hammer hand / leather glove',(-1.03,.92,2.04),(.235,.25,.23),'leather',hammer)
for j in range(3):cube('Hammer hand / plated knuckle',(-1.23+.13*j,1.10,2.08),(.115,.12,.15),'steel',hammer,.035)
# Offhand gauntlet and small clan buckler, separate from hammer mass.
rod('Guard arm / sleeve',(.79,.04,2.06),(.91,.25,1.62),.24,'leather',guard)
rod('Guard arm / bracer',(.91,.25,1.62),(.84,.48,1.49),.255,'steel',guard)
ico('Guard hand / fist',(.84,.51,1.48),(.24,.24,.22),'leather',guard)
shield=cyl('Guard / octagonal buckler',(.90,.59,1.67),.40,.11,'bronze',guard,8)
shield.rotation_euler.x=math.pi/2
shield=cyl('Guard / buckler face',(.90,.66,1.67),.33,.06,'steel',guard,8);shield.rotation_euler.x=math.pi/2
ico('Guard / central boss',(.90,.73,1.67),(.145,.075,.145),'edge',guard)
for angle in range(0,360,90):
 a=math.radians(angle);rivet('Guard / buckler rivet',(.90+.29*math.sin(a),.706,1.67+.29*math.cos(a)),guard,.029)

# Face under a forged helmet. Oversized nose, visible eyes and braided copper beard.
uv('Face / dwarven broad head',(0,.12,2.55),(.43,.34,.40),'skin',head)
for side in (-1,1):
 uv('Face / ear',(side*.425,.10,2.55),(.10,.08,.14),'skin',head)
 ico('Face / shadow under brow',(side*.17,.421,2.63),(.145,.037,.075),'hairdark',head)
 uv('Face / eye white',(side*.17,.457,2.63),(.085,.025,.044),'ivory',head)
 uv('Face / determined pupil',(side*.17,.479,2.632),(.026,.012,.035),'pupil',head)
 brow=beam('Face / thick copper brow',(side*.06,.465,2.72),(side*.29,.435,2.75),.065,.075,'beard',head)
 uv('Face / cheek',(side*.25,.407,2.44),(.15,.09,.12),'skin',head)
uv('Face / large ruddy nose',(0,.51,2.53),(.15,.155,.13),'nose',head)
# Beard silhouette consists of tapered lobes, with diagonal braid ridges.
for j,(x,z,sz) in enumerate([(-.27,2.07,.43),(0,1.96,.54),(.27,2.07,.43)]):
 ico('Beard / main tapered lobe',(x,.43,z),(.235,.23,sz),'beard',head)
 for k in range(4):
  zz=z+sz*.62-k*sz*.35
  ico('Beard / braided lock',(x+(-1 if k%2 else 1)*.045,.61,zz),(.145,.085,.12),'hairlight' if k%2 else 'beard',head,1)
 ring=cyl('Beard / bronze braid clasp',(x,.45,z-sz*.58),.142,.10,'bronze',head,10)
 ring.scale.y=.85
for side in (-1,1):
 uv('Beard / sweeping moustache',(side*.16,.55,2.38),(.24,.12,.105),'hairlight',head)
 uv('Beard / moustache tip',(side*.33,.49,2.34),(.11,.10,.14),'beard',head)
# Helmet hemispherical faceted shell, front band, winged cheek guards.
verts=[];segments=16
for radius,z in [(.48,2.78),(.45,2.98),(.32,3.12),(.06,3.19)]:
 for i in range(segments):
  a=2*math.pi*i/segments;verts.append((radius*math.cos(a),.08+radius*.79*math.sin(a),z))
faces=[(r*segments+i,r*segments+(i+1)%segments,(r+1)*segments+(i+1)%segments,(r+1)*segments+i) for r in range(3) for i in range(segments)]
faces.append(tuple(range(3*segments,4*segments)))
mesh('Helmet / sixteen faceted forged dome',verts,faces,'steel',head,.014)
for side in (-1,1):
 panel('Helmet / swept bronze cheek guard',[(side*.37,2.83),(side*.50,2.82),(side*.50,2.40),(side*.37,2.30)],.20,.15,'bronze',head)
 panel('Helmet / cheek inset',[(side*.40,2.79),(side*.47,2.77),(side*.47,2.44),(side*.40,2.39)],.29,.035,'steel',head)
 rivet('Helmet / cheek hinge',(side*.445,.31,2.72),head,.05)
beam('Helmet / broad brow band',(-.40,.40,2.82),(.40,.40,2.82),.10,.08,'bronze',head)
for x in (-.30,.30):rivet('Helmet / brow stud',(x,.45,2.82),head,.035)
# Crown crest: broad metallic ridge, not decorative horns that obscure motion.
beam('Helmet / crown ridge',(0,-.25,2.95),(0,.08,3.24),.13,.10,'edge',head)
beam('Helmet / front crest',(0,.08,3.24),(0,.43,2.86),.13,.10,'bronze',head)
panel('Helmet / clan gem border',[(-.13,3.01),(0,3.17),(.13,3.01),(0,2.87)],.39,.075,'bronze',head)
panel('Helmet / clan jade gem',[(-.085,3.01),(0,3.11),(.085,3.01),(0,2.92)],.445,.035,'rune',head)

# Heavy rune hammer; a stone center, iron endcaps, leather handle and physical inlay.
rod('Hammer / ash haft',(-1.03,.92,1.40),(-1.03,.92,3.03),.075,'leather',hammer)
for k in range(7):cyl('Hammer / leather grip winding',(-1.03,.92,1.56+k*.075),.091,.035,'bronze' if k in (0,6) else 'leather',hammer,10)
ico('Hammer / pommel',(-1.03,.92,1.38),(.13,.13,.14),'bronze',hammer)
cube('Hammer / granite heart',(-1.03,.92,3.03),(1.16,.70,.62),'stone',hammer,.11)
for side in (-1,1):
 cube('Hammer / steel striking end',(-1.03+side*.57,.92,3.03),(.18,.76,.70),'steel',hammer,.065)
 cube('Hammer / polished striking face',(-1.03+side*.68,.92,3.03),(.065,.64,.55),'edge',hammer,.025)
 for y in (.65,1.19):rivet('Hammer / endcap rivet',(-1.03+side*.57,y,3.29),hammer,.045)
for x in (-1.28,-.78):
 cube('Hammer / bronze collar',(x,.92,3.03),(.075,.72,.64),'bronze',hammer,.03)
# Rune in a dark recessed plaque on front; forged notch geometry remains visible unlit.
cube('Hammer / rune recess',(-1.03,1.285,3.04),(.35,.045,.40),'dark',hammer,.025)
for a,b in [((-1.03,1.32,3.20),(-1.03,1.32,2.87)),((-1.03,1.32,3.20),(-.91,1.32,3.07)),((-1.03,1.32,3.20),(-1.15,1.32,3.07)),((-1.15,1.32,3.07),(-.91,1.32,3.07))]:rod('Hammer / mint clan rune',a,b,.023,'rune',hammer,8)

# Pose at exact keyframes; stable legs and root, articulated upper body and wrist.
POSES={
 'idle':{'frame':1,'arm':0.0,'wrist':0.0,'body':0.0,'head':0.0,'guard':0.0},
 'windup':{'frame':7,'arm':1.24,'wrist':.18,'body':-.06,'head':.04,'guard':.18},
 'strike':{'frame':11,'arm':-.98,'wrist':-1.72,'body':.08,'head':-.04,'guard':-.17},
 'recover':{'frame':17,'arm':-.20,'wrist':-.80,'body':.035,'head':-.015,'guard':-.08},
}
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=25
for pose in list(POSES.values())+[dict(POSES['idle'],frame=25)]:
 arm.rotation_euler.x=pose['arm'];hammer.rotation_euler.x=pose['wrist'];body.rotation_euler.x=pose['body'];head.rotation_euler.x=pose['head'];guard.rotation_euler.x=pose['guard']
 for obj in (arm,hammer,body,head,guard):obj.keyframe_insert(data_path='rotation_euler',frame=pose['frame'])
for obj in (arm,hammer,body,head,guard):
 obj.animation_data.action.name=f'Dwarf hammer attack / {obj.name}'
 for curve in obj.animation_data.action.fcurves:
  for k in curve.keyframe_points:k.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()

# A shared orthographic view. Shift camera along screen vertical to make ground pixel exactly550.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Dwarf shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.8
camera.location=(7,10,7);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y+=(ground.y-(1-550/640));bpy.context.view_layer.update()
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm large key',(-4,6,8),850,4,(1,.83,.65))
area('Cool soft armor fill',(5,3,5),600,4,(.65,.83,1))
area('Warm edge light',(1,-5,7),1000,3,(1,.80,.52))

# Export temporary evaluated copies, merging only static surfaces under a common joint/material.
def export_runtime():
 scene.frame_set(1);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
 original=list(COL.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original}
 export_col=bpy.data.collections.new('Runtime export temporary');scene.collection.children.link(export_col);clones={}
 for o in original:o.name=names[o]+'__editable'
 try:
  for o in original:
   if o.type=='MESH':
    d=bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph);c=bpy.data.objects.new(names[o],d)
   else:c=o.copy();c.name=names[o]
   export_col.objects.link(c);clones[o]=c
  for o,c in clones.items():c.parent=clones.get(o.parent);c.matrix_world=matrices[o]
  bpy.context.view_layer.update();batches={}
  for c in clones.values():
   if c.type=='MESH':batches.setdefault((c.parent.name,tuple(m.name for m in c.data.materials)),[]).append(c)
  for i,objects in enumerate(batches.values()):
   bpy.ops.object.select_all(action='DESELECT')
   for o in objects:o.select_set(True)
   bpy.context.view_layer.objects.active=objects[0]
   if len(objects)>1:bpy.ops.object.join()
   objects[0].name=f'Dwarf surface {i+1:02}'
  meshes=[o for o in export_col.objects if o.type=='MESH'];tris=0
  for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
  bpy.ops.object.select_all(action='DESELECT')
  for o in export_col.objects:o.select_set(True)
  bpy.context.view_layer.objects.active=clones[ROOT_OBJ]
  bpy.ops.export_scene.gltf(filepath=str(OUT/'dwarf-guardian.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='dwarf-hammer-attack',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
  return {'mesh_objects':len(meshes),'triangles':tris,'materials':len({m.name for o in meshes for m in o.data.materials})}
 finally:
  for o in list(export_col.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(export_col)
  for o,name in names.items():o.name=name
stats=export_runtime()
# Evaluate the projection of the origin as an integration contract, rather than guessing a crop.
scene.frame_set(1);bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
manifest={'id':'dwarf-guardian','source':'art-source/defense/dwarf.blend','generator':'tools/blender/build_dwarf.py','blender':bpy.app.version_string,'authoring':'Actual editable geometry and articulated object joints; no image inputs.','nativeFacing':1,'forward':'Blender +Y; GLB -Z (right handed Y-up conversion)','frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,4),round((1-ground.y)*opts.size,4)],'viewBox':[0,0,opts.size,opts.size],'orthographic_scale':cam_data.ortho_scale},'animation':{'clip':'dwarf-hammer-attack','fps':30,'first_frame':1,'last_frame':25,'duration_seconds':.8,'poses':POSES,'pivot_rotation_axis':'Blender X becomes GLB X; values in radians; rotation values include parent hierarchy'},'runtime':stats,'bytes':(OUT/'dwarf-guardian.glb').stat().st_size,'editable_mesh_objects':sum(o.type=='MESH' for o in COL.objects),'pivot_names':['body','head','hammer-arm','hammer-forearm','hammer','guard-arm'],'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'poses':[]}
for name,pose in POSES.items():
 if opts.only and name!=opts.only:continue
 scene.frame_set(pose['frame']);bpy.context.view_layer.update()
 graph=bpy.context.evaluated_depsgraph_get();pixels=[]
 for o in COL.objects:
  if o.type!='MESH':continue
  ev=o.evaluated_get(graph)
  for corner in ev.bound_box:
   v=world_to_camera_view(scene,camera,ev.matrix_world@Vector(corner));pixels.append((v.x*opts.size,(1-v.y)*opts.size))
 bounds=[min(v[0] for v in pixels),min(v[1] for v in pixels),max(v[0] for v in pixels),max(v[1] for v in pixels)]
 manifest['poses'].append({'name':name,'file':f'dwarf-{name}.png','frame':pose['frame'],'projected_mesh_bbox':[round(v,3) for v in bounds]})
 if not opts.skip_render:
  scene.render.filepath=str(OUT/f'dwarf-{name}.png');bpy.ops.render.render(write_still=True)
  if name=='idle':shutil.copyfile(OUT/'dwarf-idle.png',OUT/'dwarf-guardian.png')
scene.frame_set(1);bpy.context.view_layer.update()
scene['regeneration_command']='blender -b --python tools/blender/build_dwarf.py'
scene['sprite_ground_anchor']='Common frame640x640; x320,y550; no per-pose recrop'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'dwarf.blend'))
(OUT/'dwarf-model.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('ARCANA_DWARF_COMPLETE '+json.dumps(manifest,ensure_ascii=False))
