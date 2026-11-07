"""Create Kar's editable winter warrior, directional slam/walk bakes and animated GLBs.
Run npm run models:barbarian. Geometry only; no image planes or image inputs.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/kar-barbarian'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');p.add_argument('--preview',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
COL=bpy.data.collections.new('Kar winter warrior / editable parts');bpy.context.scene.collection.children.link(COL);STUDIO=bpy.data.collections.new('Studio / common hero camera');bpy.context.scene.collection.children.link(STUDIO);ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m

M={
 'iron':material('Kar / charcoal forged iron',(.075,.095,.115),.75,.39),
 'edge':material('Kar / pale iron striking faces',(.42,.48,.50),.8,.3),
 'gold':material('Kar / ancient warm brass',(.72,.36,.065),.75,.34),
 'leather':material('Kar / oxhide brown',(.12,.042,.018),0,.83),
 'sole':material('Kar / boot soles',(.025,.018,.012),0,.9),
 'cloth':material('Kar / crimson wool',(.36,.022,.009),0,.86),
 'fur':material('Kar / ivory winter fur',(.79,.74,.60),0,.93),
 'furshade':material('Kar / shaded fur roots',(.34,.28,.21),0,.95),
 'skin':material('Kar / warm weathered skin',(.68,.33,.17),0,.64),
 'hair':material('Kar / fiery red hair',(.50,.055,.009),0,.75),
 'hairlight':material('Kar / copper locks',(.82,.16,.018),0,.7),
 'white':material('Kar / eye whites',(.93,.88,.75),0,.4),
 'eye':material('Kar / cold turquoise eyes',(.015,.25,.26),0,.35),
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



ROOT_OBJ=group('kar-barbarian');ROOT_OBJ['asset']='Kar / articulated winter warrior, real geometry'
body=group('body',(0,0,1.25),ROOT_OBJ);head=group('head',(0,.03,2.70),body)
cape=group('fur-mantle',(0,-.25,2.50),body);beard=group('beard',(0,.42,2.55),head)
weapon=group('war-hammer',(-.70,.70,2.10),ROOT_OBJ)
# Broad stance and short heavy boots; legs are separate from trunk compression.
legs=[]
for n,x in enumerate([-.53,.53]):
 foot=group(('left' if n==0 else 'right')+'-foot',(x,0,0),ROOT_OBJ);legs.append(foot)
 cube('Boot / sole',(x,.15,.10),(.67,.83,.18),'sole',foot,.07)
 cube('Boot / rounded leather',(x,.12,.31),(.61,.75,.36),'leather',foot,.11)
 cube('Boot / iron toe',(x,.40,.33),(.63,.30,.27),'iron',foot,.07)
 rod('Boot / brass toe edge',(x-.27,.56,.37),(x+.27,.56,.37),.035,'gold',foot)
 ico('Leg / leather trousers',(x,0,.80),(.31,.29,.58),'leather',foot)
 cube('Knee / brass armor',(x,.26,.84),(.48,.15,.41),'gold',foot,.08)
 for k in range(7):
  a=k*math.tau/7;ico('Boot / fur cuff',(x+.27*math.cos(a),.27*math.sin(a),.57),(.13,.13,.12),'fur',foot,1)
ico('Body / broad winter coat',(0,0,1.82),(.82,.47,.72),'leather',body)
ico('Chest / iron armor',(0,.01,2.12),(.78,.44,.49),'iron',body)
for side in [-1,1]:
 beam('Chest / crossed leather strap',(side*.58,.43,2.45),(-side*.38,.50,1.47),.12,.08,'leather',body)
 for j in range(4):rivet('Chest / strap stud',(side*(.50-j*.23),.50,2.32-j*.24),body,.035)
cube('Belt / broad hide',(0,.02,1.32),(1.58,.91,.24),'leather',body,.09)
medal=cyl('Belt / sun buckle',(0,.53,1.34),.24,.10,'gold',body,12);medal.rotation_euler.x=math.pi/2
medal=cyl('Belt / dark inset',(0,.59,1.34),.16,.04,'iron',body,12);medal.rotation_euler.x=math.pi/2
for a in range(0,360,60):
 a=math.radians(a);rod('Belt / sun spokes',(0,.62,1.34),(.13*math.cos(a),.62,1.34+.13*math.sin(a)),.025,'gold',body,8)
panel('Tabard / crimson front',[(-.28,1.22),(.28,1.22),(.26,.55),(0,.42),(-.26,.55)],.47,.07,'cloth',body)
for side in [-1,1]:rod('Tabard / golden hem',(side*.25,.52,1.18),(side*.24,.52,.58),.028,'gold',body)
# Thick flared cape and clustered white fur collar, distinct from Bron's metal shoulders.
verts=[]
for z,width,y in [(2.51,.69,-.24),(1.80,.93,-.49),(.76,1.02,-.62)]:
 for i in range(9):verts.append(((i/8-.5)*width*2,y+(.06 if i%2 else -.05),z+(.06 if i%2 and z<1 else 0)))
cloth=mesh('Mantle / heavy crimson lining',verts,[(r*9+c,r*9+c+1,(r+1)*9+c+1,(r+1)*9+c) for r in range(2) for c in range(8)],'cloth',cape)
cloth.modifiers.new('Mantle thickness','SOLIDIFY').thickness=.065
for side in [-1,1]:
 for i in range(8):
  z=2.45-i*.23;x=side*(.70+i*.045);y=-.25-i*.048
  ico('Mantle / shaggy white border',(x,y,z),(.22,.19,.22),'fur',cape,1)
  ico('Mantle / tapered tuft',(x+side*.09,y-.04,z-.10),(.20,.15,.13),'fur',cape,1)
for i in range(15):
 a=i*math.tau/15;ico('Collar / dark underfur',(.76*math.cos(a),.37*math.sin(a)-.02,2.44),(.24,.22,.23),'furshade',body,1)
 ico('Collar / white clumps',(.78*math.cos(a),.39*math.sin(a),2.54),(.25,.23,.22),'fur',body,1)
# Open face and unruly red hair, no helmet or shield.
uv('Face / square warrior head',(0,.08,2.91),(.46,.36,.42),'skin',head)
for side in [-1,1]:
 uv('Face / ear',(side*.45,.05,2.91),(.10,.085,.14),'skin',head)
 uv('Eye / white',(side*.18,.42,2.99),(.11,.035,.065),'white',head)
 uv('Eye / turquoise iris',(side*.18,.452,2.99),(.042,.015,.052),'eye',head)
 uv('Eye / pupil',(side*.18,.468,2.99),(.018,.008,.036),'sole',head)
 beam('Face / angry red brow',(side*.06,.46,3.08),(side*.32,.41,3.15),.10,.08,'hair',head)
 uv('Face / cheek',(side*.28,.37,2.83),(.16,.12,.13),'skin',head)
 uv('Beard / curled moustache',(side*.19,.53,2.73),(.24,.14,.12),'hairlight',beard)
uv('Face / nose',(0,.49,2.88),(.13,.15,.12),'skin',head)
for i in range(11):
 a=i*math.tau/11;x=.38*math.cos(a);y=.08+.29*math.sin(a)
 o=ico('Hair / wild swept lock',(x,y,3.20+(.10 if i%2 else 0)),(.23,.21,.31),'hairlight' if i%3==0 else 'hair',head,1);o.rotation_euler.y=.40*math.cos(a);o.rotation_euler.x=.25*math.sin(a)
for side in [-1,1]:
 for j in range(3):ico('Hair / side flame',(side*(.41+j*.04),-.03,2.98-j*.17),(.22,.22,.25),'hair',head,1)
for j,(x,z,rz) in enumerate([(-.29,2.53,.31),(0,2.39,.47),(.29,2.53,.31)]):
 ico('Beard / red tapered mass',(x,.46,z),(.25,.23,rz),'hair',beard)
 for k in range(4):ico('Beard / braided copper lobe',(x+(.045 if k%2 else -.045),.63,z+.18-k*.13),(.14,.09,.12),'hairlight' if k%2 else 'hair',beard,1)
ring=cyl('Beard / golden tie',(0,.47,2.07),.14,.10,'gold',beard,10)
# Independent hammer and attached hand grips; arm links are solved to the grips.
rod('Hammer / long ash haft',(-.70,.70,1.43),(-.70,.70,3.57),.085,'leather',weapon)
for i in range(9):cyl('Hammer / wrapped grip',(-.70,.70,1.55+i*.09),.105,.04,'gold' if i in [0,8] else 'leather',weapon,10)
ico('Hammer / brass pommel',(-.70,.70,1.43),(.14,.14,.14),'gold',weapon)
cube('Hammer / forged head',(-.70,.70,3.49),(1.36,.74,.78),'iron',weapon,.12)
for side in [-1,1]:
 cube('Hammer / steel end face',(-.70+side*.67,.70,3.49),(.17,.83,.86),'edge',weapon,.06)
 cube('Hammer / brass binding',(-.70+side*.40,.70,3.49),(.075,.77,.81),'gold',weapon,.025)
 for y in [.39,1.01]:rivet('Hammer / corner bolt',(-.70+side*.64,y,3.81),weapon,.05)
medal=cyl('Hammer / sun medallion',(-.70,1.09,3.49),.25,.065,'gold',weapon,12);medal.rotation_euler.x=math.pi/2
medal=cyl('Hammer / inset sun',(-.70,1.13,3.49),.17,.035,'iron',weapon,12);medal.rotation_euler.x=math.pi/2
for i in range(8):
 a=i*math.tau/8;rod('Hammer / raised sun rays',(-.70+.09*math.cos(a),1.155,3.49+.09*math.sin(a)),(-.70+.22*math.cos(a),1.155,3.49+.22*math.sin(a)),.025,'gold',weapon,8)
socket=group('hammer-contact',(-.70,.70,3.49),weapon)
grips=[group('upper-grip',(-.70,.70,2.10),weapon),group('lower-grip',(-.70,.70,1.73),weapon)]
for i,g in enumerate(grips):
 z=2.10 if i==0 else 1.73
 ico('Hand / closed leather glove',(-.70,.70,z),(.235,.23,.22),'leather',g)
 for k in range(3):cube('Hand / brass knuckle',(-.85+k*.14,.88,z+.04),(.115,.10,.13),'gold',g,.025)
links=[]
for side in ['left','right']:
 for part in ['upper','forearm']:
  joint=group(side+'-'+part,(0,0,0),ROOT_OBJ);links.append(joint)
  uv(side+' / '+part+' muscle',(0,0,.5),(.23 if part=='upper' else .25,.23,.55),'skin' if part=='upper' else 'iron',joint)
  if part=='forearm':
   cyl(side+' / bracer lower band',(0,0,.17),.26,.10,'gold',joint)
   cyl(side+' / bracer upper band',(0,0,.78),.26,.10,'gold',joint)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Kar studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Common hero orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.8
camera.location=(7,10,7);camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cam_data.shift_y+=ground.y-(1-330/384)
for name,loc,power,size,color in [('Warm key',(-4,6,8),850,4,(1,.83,.65)),('Cool fill',(5,3,5),600,4,(.65,.83,1)),('Warm rim',(1,-5,7),1000,3,(1,.80,.52))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()

weapon.location=Vector((-1.0,.45,2.10));bpy.context.view_layer.update()
joints=[body,head,cape,beard,weapon,*legs,*links];rests={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints}
def solve_arms():
 bpy.context.view_layer.update()
 for i in range(2):
  shoulder=body.matrix_world@Vector((-.77 if i==0 else .77,0,1.17));palm=grips[i].matrix_world.translation
  elbow=shoulder.lerp(palm,.48);elbow.x+=-.28 if i==0 else .33;elbow.y+=.20
  for joint,a,b in [(links[i*2],shoulder,elbow),(links[i*2+1],elbow,palm)]:
   joint.location=a;joint.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();joint.scale=(1,1,(b-a).length)
def clear_motion():
 for o in joints:o.animation_data_clear();o.location=rests[o][0];o.rotation_euler=rests[o][1];o.scale=rests[o][2]
 solve_arms()
def key(frame):
 for o in joints:
  for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
ATTACK=[('ready',1),('brace',5),('load',11),('apex',20),('contact',29),('rebound',36),('recover',44),('settle',51)]
def animate(mode):
 clear_motion();scene.render.fps=100;scene.frame_start=1;scene.frame_end=57 if mode=='slam' else 81
 if mode=='slam':
  # frame, weapon xyz, pitch, trunk compression, trunk pitch, mantle follow-through
  poses=[(1,(-1.0,.45,2.10),0,0,0,0),(5,(-.96,.42,2.05),.12,-.065,-.02,-.025),(11,(-.85,.35,2.22),.48,-.035,-.045,-.06),(20,(-.56,.34,2.53),.88,0,-.07,-.10),(29,(-.45,.24,1.15),-1.95,-.10,.12,.14),(36,(-.48,.30,1.31),-1.70,-.06,.08,.19),(44,(-.79,.48,1.79),-.70,-.025,.03,.07),(51,(-.96,.46,2.08),-.08,0,.004,-.015),(57,(-1.0,.45,2.10),0,0,0,0)]
  for f in range(1,58):
   a=next(p for p in reversed(poses) if p[0]<=f);b=next((p for p in poses if p[0]>f),a);t=(f-a[0])/max(1,b[0]-a[0]);t=t*t*(3-2*t)
   weapon.location=Vector(a[1]).lerp(Vector(b[1]),t);weapon.rotation_euler.x=a[2]+(b[2]-a[2])*t
   body.location=rests[body][0]+Vector((0,0,a[3]+(b[3]-a[3])*t));body.rotation_euler.x=a[4]+(b[4]-a[4])*t
   follow=a[5]+(b[5]-a[5])*t;cape.rotation_euler.x=follow;beard.rotation_euler.x=-follow*.5;head.rotation_euler.x=-body.rotation_euler.x*.4
   solve_arms();key(f)
 else:
  for f in range(81):
   phase=f/80;s=math.sin(phase*math.tau)
   for i,leg in enumerate(legs):
    p=(phase+i*.5)%1;advance=.22-.88*p if p<.5 else -.22+.88*(p-.5);lift=0 if p<.5 else .13*math.sin((p-.5)*math.tau)
    leg.location=rests[leg][0]+Vector((0,advance,lift))
   body.location=rests[body][0]+Vector((.02*s,0,.025*(1-math.cos(phase*math.tau*2))));body.rotation_euler.z=.025*s
   weapon.location=rests[weapon][0]+Vector((.025*s,0,.03*(1-math.cos(phase*math.tau*2))));weapon.rotation_euler.x=.04*s
   cape.rotation_euler.x=.045*s;beard.rotation_euler.x=-.025*s;head.rotation_euler.z=-.018*s
   solve_arms();key(f+1)
 for o in joints:
  o.animation_data.action.name='Kar '+mode+' / '+o.name
  for curve in o.animation_data.action.fcurves:
   for k in curve.keyframe_points:k.interpolation='LINEAR'
 scene.frame_set(1);bpy.context.view_layer.update()
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
   objects[0].name=f'Kar surface {i+1:02}'
  meshes=[o for o in export_col.objects if o.type=='MESH'];tris=0
  for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
  bpy.ops.object.select_all(action='DESELECT')
  for o in export_col.objects:o.select_set(True)
  bpy.context.view_layer.objects.active=clones[ROOT_OBJ]
  bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=clip_name,export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
  return {'mesh_objects':len(meshes),'triangles':tris,'materials':len({m.name for o in meshes for m in o.data.materials})}
 finally:
  for o in list(export_col.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(export_col)
  for o,name in names.items():o.name=name

OUT.mkdir(parents=True,exist_ok=True);FRAMES.mkdir(parents=True,exist_ok=True)
manifest={'generator':'tools/blender/build_barbarian.py','command':'npm run models:barbarian','reference':'art-source/defense/atlases/melee-motion.png','reference_actor':'Kar / first row','reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/melee-motion.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'render':{'engine':'Cycles CPU','samples':args.samples},'clips':[],'directions':{'slam':[],'walk':[]},'files':[]}
for mode in ['slam','walk']:
 animate(mode);asset_id='kar-barbarian'+('-walk' if mode=='walk' else '');clip_name='kar-'+mode
 poses=ATTACK if mode=='slam' else [(str(i),1+i*10) for i in range(8)]
 for direction in range(8):
  angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y);entry={'index':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[],'contact_trail':[]}
  if mode=='slam':
   for sample in range(7):
    f=20+sample*9/6;scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update();entry['contact_trail'].append(list(project(socket.matrix_world.translation)))
  for name,frame in poses:
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(mode,direction,name,bounds)
   entry['poses'].append({'name':name,'frame':frame,'bounds':bounds,'socket':list(project(socket.matrix_world.translation))})
   if args.preview:
    if mode=='slam' and direction in [0,1]:scene.render.filepath=f'/tmp/arcana-kar-preview-{direction}-{name}.png';bpy.ops.render.render(write_still=True)
   elif not args.check:scene.render.filepath=str(FRAMES/f'kar-{mode}-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
  manifest['directions'][mode].append(entry)
  if not args.check and not args.preview:
   dst=OUT/f'kar-{mode}-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'kar-{mode}-{direction}-{name}.png')] for name,_ in poses),[])
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'hstack=inputs={len(poses)},scale={256*len(poses)}:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
   manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
  print('DIRECTION_COMPLETE',mode,direction,flush=True)
 ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
 if not args.check and not args.preview:
  stats=export_runtime();scene['regeneration_command']='npm run models:barbarian';bpy.context.preferences.filepaths.save_version=0;source=ROOT/f'art-source/defense/{asset_id}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));shutil.copyfile(FRAMES/f'kar-{mode}-1-{poses[0][0]}.png',OUT/f'{asset_id}.png')
  manifest['clips'].append({'asset':asset_id,'clip':clip_name,'fps':100,'first_frame':1,'last_frame':scene.frame_end,'duration_seconds':(scene.frame_end-1)/100,'runtime':stats,'source':str(source.relative_to(ROOT))})
  for path in [source,OUT/f'{asset_id}.glb',OUT/f'{asset_id}.png']:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
if not args.check and not args.preview:
 (OUT/'kar-barbarian.json').write_text(json.dumps(manifest,indent=2)+'\n')
 coords=[[[round((p[0]-192)/384*manifest['frame']['display_scale'],7),round((p[1]-330)/384*manifest['frame']['display_scale'],7)] for p in d['contact_trail']] for d in manifest['directions']['slam']]
 (ROOT/'src/games/defense/karHammerTrail.ts').write_text('// Generated from the actual Kar hammer center by tools/blender/build_barbarian.py.\nexport const KAR_HAMMER_TRAIL = '+json.dumps(coords)+' as const;\n')
print('KAR_CHECK_PASS' if args.check or args.preview else 'KAR_BAKE_PASS',flush=True)
