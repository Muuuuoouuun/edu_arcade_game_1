"""Create Cheongun's editable talisman caster, directional cast/walk bakes and true animated GLBs.
Run npm run models:tao. Geometry only; no image planes or image inputs.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/cheongun-tao'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');p.add_argument('--preview',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
COL=bpy.data.collections.new('Cheongun tao / editable parts');bpy.context.scene.collection.children.link(COL);STUDIO=bpy.data.collections.new('Studio / common hero camera');bpy.context.scene.collection.children.link(STUDIO);ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'cloth':material('Cheongun / teal outer silk',(.008,.075,.067),0,.85),
 'fold':material('Cheongun / teal silk folds',(.018,.13,.12),0,.82),
 'lining':material('Cheongun / ink blue trousers',(.022,.029,.037),0,.87),
 'gold':material('Cheongun / warm gold piping',(.77,.43,.075),.68,.34),
 'leather':material('Cheongun / brown leather',(.19,.075,.026),0,.77),
 'sole':material('Cheongun / boot sole',(.035,.022,.015),0,.86),
 'skin':material('Cheongun / warm peach skin',(.80,.48,.29),0,.63),
 'nose':material('Cheongun / rosy cheek',(.82,.35,.23),0,.67),
 'hair':material('Cheongun / black hair',(.015,.018,.025),0,.75),
 'hairlight':material('Cheongun / black hair sheen',(.035,.044,.055),0,.7),
 'white':material('Cheongun / cream tunic',(.83,.79,.64),0,.88),
 'eye':material('Cheongun / clear eye whites',(.94,.94,.86),0,.4),
 'pupil':material('Cheongun / warm brown eyes',(.12,.06,.025),.1,.3),
 'red':material('Cheongun / cinnabar cord and seal',(.45,.025,.012),0,.75),
 'paper':material('Cheongun / ochre talisman paper',(.91,.52,.12),0,.85,.04),
 'crystal':material('Cheongun / sapphire crystal',(.015,.37,.88),.35,.21,.65),
 'facet':material('Cheongun / bright crystal facets',(.12,.72,1),.22,.2,.7),
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


ROOT_OBJ=group('cheongun-tao');body=group('body',(0,0,1.15),ROOT_OBJ);head=group('head',(0,0,2.68),body);hair=group('ponytail',(0,-.27,3.08),head)
legs=[];hems=[]
for side,x in [('right',-.34),('left',.34)]:
 leg=group(side+'-leg',(x,0,.95),ROOT_OBJ);legs.append(leg)
 cube(side+' boot / sole',(x,.12,.09),(.44,.66,.17),'sole',leg,.05)
 cube(side+' boot / leather',(x,.10,.27),(.42,.60,.32),'leather',leg,.07)
 ico(side+' trouser / gathered silk',(x,-.04,.69),(.255,.25,.42),'lining',leg)
 for z in [.42,.53]:rod(side+' boot / red binding',(x-.21,.22,z),(x+.21,.22,z),.025,'red',leg,8)
 ico(side+' boot / bronze toe',(x,.36,.26),(.19,.13,.08),'gold',leg,1)
legs[0].location.y=.13;legs[1].location.y=-.13
ico('Torso / teal outer robe',(0,0,1.80),(.53,.32,.57),'cloth',body)
panel('Robe / ivory overlap',[(-.32,2.17),(-.08,2.32),(.32,1.57),(-.26,1.48)],.32,.09,'white',body,.025)
panel('Collar / ivory V',[(-.32,2.21),(-.19,2.30),(.13,1.88),(.36,2.19),(.42,2.13),(.14,1.74)],.385,.05,'white',body,.015)
rod('Collar / gold seam',(-.24,.427,2.24),(.15,.427,1.81),.023,'gold',body,8)
rod('Collar / teal seam',(.15,.43,1.81),(.40,.43,2.15),.028,'cloth',body,8)
for side in [-1,1]:
 hem=group(('left' if side>0 else 'right')+'-robe-hem',(side*.32,0,1.45),body);hems.append(hem)
 points=[(side*.06,1.46),(side*.48,1.48),(side*.77,.56),(side*.26,.70)]
 panel('Robe / long teal hem',points,.16,.12,'cloth',hem,.025)
 for a,b in zip(points,points[1:]+points[:1]):rod('Robe / gold border',(a[0],.235,a[1]),(b[0],.235,b[1]),.022,'gold',hem,8)
 # Two large cloud curls survive better than a field of tiny embroidery.
 for z in [.80,1.02]:
  for i in range(5):
   a=i*math.pi/5;b=(i+1)*math.pi/5;rod('Robe / cloud embroidery',(side*.48+.10*math.cos(a),.25,z+.05*math.sin(a)),(side*.48+.10*math.cos(b),.25,z+.05*math.sin(b)),.012,'gold',hem,6)
panel('Robe / central ivory fold',[(-.17,1.45),(.18,1.45),(.31,.82),(0,.66),(-.28,.84)],.24,.08,'white',body,.025)
cape=group('back-robe',(0,-.25,2.10),body);verts=[]
for z,w,y in [(2.15,.44,-.30),(1.43,.55,-.38),(.67,.78,-.49)]:
 for i in range(7):
  x=-w+2*w*i/6;verts.append((x,y-.12*(1-(x/w)**2),z+.045*math.cos(i*math.pi/3)))
faces=[(r*7+i,r*7+i+1,(r+1)*7+i+1,(r+1)*7+i) for r in range(2) for i in range(6)]
o=mesh('Back / thick curved robe',verts,faces,'cloth',cape);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.05
for i in range(6):rod('Back / gold hem',verts[14+i],verts[15+i],.025,'gold',cape,8)
cube('Waist / dark sash',(0,0,1.43),(1.0,.65,.20),'lining',body,.04)
for z in [1.39,1.47]:rod('Waist / red woven cord',(-.48,.36,z),(.48,.36,z),.035,'red',body)
ico('Waist / cord knot',(.22,.40,1.43),(.10,.065,.10),'red',body,1)
for side in [-1,1]:
 tassel=group('waist-tassel-'+str(side),(side*.24,.37,1.36),body)
 rod('Waist / hanging red tie',(side*.24,.37,1.36),(side*.34,.38,.96),.028,'red',tassel,8)
 for i in range(3):rod('Waist / tassel thread',(side*.34+(i-1)*.035,.38,.98),(side*.37+(i-1)*.035,.38,.83),.017,'red',tassel,6)
cube('Belt / seal case',(.56,-.04,1.31),(.25,.34,.40),'leather',body,.025)
panel('Belt / paper seal face',[(.47,1.43),(.65,1.43),(.65,1.17),(.47,1.17)],.155,.025,'paper',body,.008)
rod('Belt / red clasp',(.46,.19,1.34),(.67,.19,1.34),.025,'red',body,8)
# Face, black hair cap, swept fringe and a tied volumetric ponytail.
uv('Face / rounded head',(0,.02,2.66),(.46,.39,.49),'skin',head)
ico('Face / nose',(0,.417,2.58),(.075,.085,.085),'skin',head)
for side in [-1,1]:
 uv('Face / ear',(side*.445,.01,2.64),(.105,.09,.16),'skin',head)
 uv('Eye / white',(side*.17,.371,2.70),(.105,.035,.095),'eye',head)
 uv('Eye / brown iris',(side*.17,.405,2.70),(.051,.014,.064),'pupil',head)
 uv('Eye / pupil',(side*.17,.42,2.70),(.023,.008,.04),'hair',head)
 uv('Eye / highlight',(side*.155,.424,2.73),(.017,.007,.02),'eye',head)
 rod('Face / black brow',(side*.085,.39,2.84),(side*.29,.34,2.86),.029,'hair',head,8)
rod('Face / quiet smile',(-.055,.400,2.47),(.055,.400,2.47),.011,'leather',head,8)
uv('Hair / crown cap',(0,-.06,2.99),(.48,.36,.31),'hair',head)
for i in range(7):
 x=(i-3)*.115;lock=ico('Hair / swept fringe',(x,.25,2.98-abs(x)*.27),(.15,.12,.24),'hairlight' if i%3==0 else 'hair',head);lock.rotation_euler.y=-.37
for side in [-1,1]:
 lock=ico('Hair / side lock',(side*.43,-.05,2.69),(.13,.13,.31),'hair',head);lock.rotation_euler.y=side*.15
ico('Hair / high tied bun',(0,-.20,3.28),(.24,.22,.24),'hair',head)
# Gold headpiece from the existing battle concept, without a mage hat silhouette.
for i in range(3):
 x=(i-1)*.13;panel('Hair / gold ornament',[(x-.07,3.17),(x,3.38+(i==1)*.07),(x+.07,3.17)],.05,.07,'gold',head,.015)
rod('Hair / red tie',(-.23,-.20,3.24),(.23,-.20,3.24),.045,'red',head)
for i in range(5):
 x=(i-2)*.11;lock=ico('Hair / flowing ponytail',(x,-.53,2.70+abs(x)*.12),(.15,.23,.58),'hairlight' if i%3==0 else 'hair',hair);lock.rotation_euler.x=-.22;lock.rotation_euler.y=x*.4
# Separate arm links allow the broad cuffs to travel with the wrists.
links=[]
def link(name,mat,r):
 joint=group(name,(0,0,0),body);cyl(name+' / surface',(0,0,.5),r,1,mat,joint,12,0);links.append(joint);return joint
upper_l=link('seal-upper-arm','cloth',.22);upper_r=link('brush-upper-arm','cloth',.22)
def sleeve(name):
 joint=group(name,(0,0,0),body);links.append(joint);N=16;v=[]
 for r,z in [(.23,0),(.35,.86),(.35,1),(.16,1)]:
  for i in range(N):
   a=i*math.tau/N;v.append((r*math.cos(a),r*math.sin(a),z))
 f=[(k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i) for k in range(3) for i in range(N)];f.append(tuple(reversed(range(N))));mesh(name+' / flared ivory silk',v,f,'white',joint)
 for i in range(N):rod(name+' / gold cuff',v[2*N+i],v[2*N+(i+1)%N],.023,'gold',joint,8)
 return joint
fore_l=sleeve('seal-forearm');fore_r=sleeve('brush-forearm')
hand=group('seal-hand',(-.62,.51,2.12),body);free=group('brush-hand',(.78,.35,1.96),body)
ico('Seal hand / palm',(-.62,.51,2.12),(.14,.11,.16),'skin',hand)
for i in range(3):rod('Seal hand / fingers',(-.69+i*.065,.54,2.13),(-.69+i*.065,.56,2.29),.028,'skin',hand,8)
ico('Brush hand / grip',(.78,.35,1.96),(.14,.13,.14),'skin',free)
rod('Brush / bamboo handle',(.78,.35,1.64),(.78,.35,2.40),.045,'leather',free,10)
for z in [1.70,2.30]:cyl('Brush / bronze band',(.78,.35,z),.057,.065,'gold',free,10)
# Closed tapered brush bristles, retained as real geometry.
ico('Brush / ivory bristles',(.78,.35,2.54),(.09,.09,.21),'white',free,2)
ico('Brush / ink tip',(.78,.35,2.70),(.04,.04,.08),'hair',free,1)
seal=group('paper-seal',(-.62,.58,2.27),hand);flap=group('seal-flap',(-.62,.58,2.58),seal)
# Thickness and relief marks: this paper does not use a flat image texture.
panel('Seal / held ochre paper',[(-.79,2.26),(-.45,2.26),(-.45,2.59),(-.79,2.59)],.58,.035,'paper',seal,.008)
panel('Seal / flexible upper leaf',[(-.79,2.58),(-.45,2.58),(-.43,2.89),(-.78,2.91)],.58,.035,'paper',flap,.008)
# Fictional seal strokes, not a claimed transcription of ritual writing.
for a,b in [((-.74,2.39),(-.51,2.39)),((-.66,2.31),(-.66,2.51)),((-.74,2.49),(-.56,2.49))]:rod('Seal / raised red mark',(a[0],.61,a[1]),(b[0],.61,b[1]),.014,'red',seal,6)
for a,b in [((-.72,2.81),(-.50,2.81)),((-.70,2.68),(-.56,2.73)),((-.60,2.65),(-.60,2.86))]:rod('Seal / raised upper mark',(a[0],.61,a[1]),(b[0],.61,b[1]),.014,'red',flap,6)
socket=group('seal-socket',(-.62,.625,2.77),flap)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Cheongun studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Common hero orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.8
camera.location=(7,10,7);camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cam_data.shift_y+=ground.y-(1-330/384)
for name,loc,power,size,color in [('Warm key',(-4,6,8),850,4,(1,.83,.65)),('Cool fill',(5,3,5),600,4,(.65,.83,1)),('Warm rim',(1,-5,7),1000,3,(1,.80,.52))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
joints=[body,head,hair,cape,*legs,*hems,*links,hand,free,seal,flap];rests={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints}
def segment(joint,a,b):
 a,b=Vector(a),Vector(b);joint.location=a-Vector((0,0,1.15));joint.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();joint.scale=(1,1,(b-a).length)
def arms(palm,brush):
 l=Vector(palm);r=Vector(brush);le=Vector((-.68,l.y*.38,2.03+(l.z-2.12)*.45));re=Vector((.68,r.y*.4,2.02+(r.z-1.96)*.5))
 for joint,a,b in [(upper_l,(-.49,0,2.13),le),(fore_l,le,l),(upper_r,(.49,0,2.13),re),(fore_r,re,r)]:segment(joint,a,b)
 hand.location=l-Vector((0,0,1.15));free.location=r-Vector((0,0,1.15))
def clear_motion():
 for o in joints:o.animation_data_clear();o.location=rests[o][0];o.rotation_euler=rests[o][1];o.scale=rests[o][2]
 arms((-.62,.51,2.12),(.78,.35,1.96))
def key(frame):
 for o in joints:
  for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
def animate(mode):
 clear_motion();scene.render.fps=100;scene.frame_start=1;scene.frame_end=34 if mode=='cast' else 81
 if mode=='cast':
  poses=[(1,(-.62,.51,2.12),(.78,.35,1.96),0,0,0),(7,(-.62,.40,2.32),(.79,.37,2.10),-.025,.12,.03),(11,(-.64,.28,2.55),(.79,.39,2.20),-.045,.22,.08),(16,(-.60,1.11,2.18),(.83,.12,1.88),.045,-.42,-.16),(22,(-.60,.95,2.17),(.80,.20,1.90),.025,-.28,-.08),(28,(-.62,.65,2.15),(.78,.30,1.95),.008,-.08,.06),(34,(-.62,.51,2.12),(.78,.35,1.96),0,0,0)]
  for frame in range(1,35):
   a=next(p for p in reversed(poses) if p[0]<=frame);b=next((p for p in poses if p[0]>frame),a);t=(frame-a[0])/max(1,b[0]-a[0]);palm=Vector(a[1]).lerp(Vector(b[1]),t);brush=Vector(a[2]).lerp(Vector(b[2]),t);trunk=a[3]+(b[3]-a[3])*t;paper=a[4]+(b[4]-a[4])*t;follow=a[5]+(b[5]-a[5])*t
   arms(palm,brush);body.rotation_euler.x=trunk;head.rotation_euler.x=-trunk*.4;seal.rotation_euler.x=paper;flap.rotation_euler.x=follow;hair.rotation_euler.x=-trunk*1.6;cape.rotation_euler.x=trunk*.8
   for i,h in enumerate(hems):h.rotation_euler.x=trunk*(.5 if i else -.3)
   key(frame)
 else:
  for i in range(81):
   phase=i/80;s=math.sin(phase*math.tau);arms((-.62,.51+.04*s,2.12),(.78,.35-.07*s,1.96))
   for n,leg in enumerate(legs):
    p=(phase+n*.5)%1;forward=.22-.88*p if p<.5 else -.22+.44*(p-.5)*2;lift=0 if p<.5 else .12*math.sin((p-.5)*2*math.pi);leg.location=rests[leg][0]+Vector((0,forward,lift))
   body.location=rests[body][0]+Vector((.018*s,0,.020*(1-math.cos(phase*math.tau*2))));cape.rotation_euler.x=.035*(1-math.cos(phase*math.tau));hair.rotation_euler.x=-.04*s;hair.rotation_euler.z=.04*s;seal.rotation_euler.x=.05*s;flap.rotation_euler.x=.08*s
   for n,h in enumerate(hems):h.rotation_euler.x=s*(.08 if n else -.08)
   key(1+i)
 for o in joints:
  o.animation_data.action.name='Cheongun '+mode+' / '+o.name
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
   objects[0].name=f'Cheongun surface {i+1:02}'
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
manifest={'generator':'tools/blender/build_tao.py','command':'npm run models:tao','reference':'art-source/defense/atlases/ranged-motion.png','concepts':['art-source/defense/concepts/2026-10-29/heroes/talisman-caster.png','art-source/defense/concepts/2026-10-29/motion/talisman-cast-keyposes.png'],'reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'render':{'engine':'Cycles CPU','samples':args.samples},'clips':[],'directions':{'cast':[],'walk':[]},'files':[]}
for mode in ['cast','walk']:
 animate(mode);asset_id='cheongun-tao'+('-walk' if mode=='walk' else '');clip_name='cheongun-'+mode
 poses=[('ready',1),('windup',11),('strike',16),('recover',26)] if mode=='cast' else [(str(i),1+i*10) for i in range(8)]
 for direction in range(8):
  angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y);entry={'index':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[]}
  for name,frame in poses:
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(mode,direction,name,bounds)
   entry['poses'].append({'name':name,'frame':frame,'bounds':bounds,'socket':list(project(socket.matrix_world.translation))})
   if args.preview:
    if mode=='cast' and direction in [0,1]:scene.render.filepath=f'/tmp/arcana-tao-preview-{direction}-{name}.png';bpy.ops.render.render(write_still=True)
   elif not args.check:scene.render.filepath=str(FRAMES/f'cheongun-{mode}-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
  manifest['directions'][mode].append(entry)
  if not args.check and not args.preview:
   dst=OUT/f'cheongun-{mode}-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'cheongun-{mode}-{direction}-{name}.png')] for name,_ in poses),[])
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'hstack=inputs={len(poses)},scale={256*len(poses)}:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
   manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
  print('DIRECTION_COMPLETE',mode,direction,flush=True)
 ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
 if not args.check and not args.preview:
  stats=export_runtime();scene['regeneration_command']='npm run models:tao';bpy.context.preferences.filepaths.save_version=0;source=ROOT/f'art-source/defense/{asset_id}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));shutil.copyfile(FRAMES/f'cheongun-{mode}-1-{poses[0][0]}.png',OUT/f'{asset_id}.png')
  manifest['clips'].append({'asset':asset_id,'clip':clip_name,'fps':100,'first_frame':1,'last_frame':scene.frame_end,'duration_seconds':(scene.frame_end-1)/100,'runtime':stats,'source':str(source.relative_to(ROOT))})
  for path in [source,OUT/f'{asset_id}.glb',OUT/f'{asset_id}.png']:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
if not args.check and not args.preview:
 (OUT/'cheongun-tao.json').write_text(json.dumps(manifest,indent=2)+'\n')
 coords=[[[round((p['socket'][0]-192)/384*manifest['frame']['display_scale'],7),round((p['socket'][1]-330)/384*manifest['frame']['display_scale'],7)] for p in d['poses']] for d in manifest['directions']['cast']]
 (ROOT/'src/games/defense/taoSockets.ts').write_text('// Generated by tools/blender/build_tao.py from the actual seal socket.\nexport const TAO_SOCKETS = '+json.dumps(coords)+' as const;\n')
print('TAO_CHECK_PASS' if args.check or args.preview else 'TAO_BAKE_PASS',flush=True)
