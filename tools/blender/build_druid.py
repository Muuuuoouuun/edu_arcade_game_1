"""Create Luna's editable fox druid, directional cast/walk bakes and true animated GLBs.
Run npm run models:druid. Geometry only; no image planes or image inputs.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/luna-druid'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');p.add_argument('--preview',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
COL=bpy.data.collections.new('Luna tao / editable parts');bpy.context.scene.collection.children.link(COL);STUDIO=bpy.data.collections.new('Studio / common hero camera');bpy.context.scene.collection.children.link(STUDIO);ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'cloth':material('Luna / deep forest cloth',(.025,.10,.016),0,.85),
 'fold':material('Luna / lit leaf folds',(.08,.22,.025),0,.82),
 'lining':material('Luna / ink blue trousers',(.022,.029,.037),0,.87),
 'gold':material('Luna / warm gold piping',(.77,.43,.075),.68,.34),
 'leather':material('Luna / brown leather',(.19,.075,.026),0,.77),
 'sole':material('Luna / boot sole',(.035,.022,.015),0,.86),
 'skin':material('Luna / warm peach skin',(.80,.48,.29),0,.63),
 'nose':material('Luna / rosy cheek',(.82,.35,.23),0,.67),
 'hair':material('Luna / copper hair',(.33,.095,.018),0,.75),
 'hairlight':material('Luna / copper hair sheen',(.64,.24,.045),0,.7),
 'white':material('Luna / cream tunic',(.83,.79,.64),0,.88),
 'eye':material('Luna / clear eye whites',(.94,.94,.86),0,.4),
 'pupil':material('Luna / green eyes',(.025,.23,.055),.1,.3),
 'red':material('Luna / cinnabar cord and seal',(.45,.025,.012),0,.75),
 'crystal':material('Luna / emerald crystal',(.08,.63,.018),.35,.21,.65),
 'facet':material('Luna / bright crystal facets',(.44,1,.10),.22,.2,.7),
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



ROOT_OBJ=group('luna-druid');body=group('body',(0,0,1.15),ROOT_OBJ);head=group('head',(0,0,2.68),body);hair=group('flowing-hair',(0,-.22,2.98),head)
legs=[];hems=[];ears=[]
for side,x in [('right',-.34),('left',.34)]:
 leg=group(side+'-leg',(x,0,.95),ROOT_OBJ);legs.append(leg)
 cube(side+' boot / sole',(x,.12,.09),(.44,.66,.17),'sole',leg,.05)
 cube(side+' boot / leather',(x,.10,.27),(.42,.60,.32),'leather',leg,.07)
 ico(side+' trouser',(x,-.04,.69),(.24,.25,.42),'lining',leg)
 rod(side+' boot / gold binding',(x-.20,.22,.43),(x+.20,.22,.43),.027,'gold',leg,8)
 ico(side+' boot / bronze toe',(x,.36,.26),(.19,.13,.08),'gold',leg,1)
legs[0].location.y=.13;legs[1].location.y=-.13
ico('Torso / fitted leaf bodice',(0,0,1.80),(.52,.31,.56),'cloth',body)
# Broad overlapping ivory and green panels retain the concept's woodland caster silhouette.
for side in [-1,1]:
 hem=group(('left' if side>0 else 'right')+'-robe-hem',(side*.30,0,1.43),body);hems.append(hem)
 points=[(side*.08,1.45),(side*.46,1.46),(side*.76,.62),(side*.29,.72)]
 panel('Robe / ivory pointed panel',points,.19,.10,'white',hem,.025)
 for a,b in zip(points,points[1:]+points[:1]):rod('Robe / gold seam',(a[0],.25,a[1]),(b[0],.25,b[1]),.021,'gold',hem,8)
 panel('Robe / layered green leaf',[(side*.23,1.38),(side*.48,1.42),(side*.61,1.06),(side*.35,1.14)],.29,.07,'fold',hem,.015)
 rod('Robe / leaf vein',(side*.30,.34,1.37),(side*.52,.34,1.10),.018,'gold',hem,8)
panel('Tunic / central green point',[(-.20,1.44),(.20,1.44),(.24,.74),(0,.57),(-.24,.74)],.11,.10,'cloth',body,.02)
for side in [-1,1]:
 panel('Collar / ivory fold',[(side*.03,2.12),(side*.17,2.35),(side*.46,2.19),(side*.24,1.98)],.26,.08,'white',body,.025)
 rod('Collar / gold piping',(side*.16,.32,2.31),(side*.44,.32,2.17),.024,'gold',body,8)
ico('Collar / emerald clasp',(0,.36,2.12),(.10,.06,.13),'crystal',body,1)
cape=group('leaf-cape',(0,-.25,2.10),body);verts=[]
for z,w,y in [(2.15,.46,-.28),(1.52,.69,-.39),(.73,.92,-.48)]:
 for i in range(7):
  x=-w+2*w*i/6;verts.append((x,y-.13*(1-(x/w)**2),z+.07*math.cos(i*math.pi)))
faces=[(r*7+i,r*7+i+1,(r+1)*7+i+1,(r+1)*7+i) for r in range(2) for i in range(6)]
o=mesh('Cape / thick scalloped forest mantle',verts,faces,'cloth',cape);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.055
for i in range(6):rod('Cape / gold edge',verts[14+i],verts[15+i],.026,'gold',cape,8)
for side in [0,6]:
 for r in range(2):rod('Cape / gold seam',verts[r*7+side],verts[(r+1)*7+side],.024,'gold',cape,8)
cube('Waist / leather belt',(0,0,1.44),(1.0,.65,.15),'leather',body,.035)
ico('Waist / leaf clasp',(0,.38,1.43),(.15,.07,.11),'gold',body,1)
for side in [-1,1]:
 for i in range(3):
  x=side*(.18+i*.12);leaf=ico('Waist / leaf scale',(x,.34,1.38-abs(x)*.15),(.11,.055,.17),'gold' if i==0 else 'fold',body,1);leaf.rotation_euler.y=side*.6
# Oversized face and copper locks, with separate pointed ears.
uv('Face / rounded head',(0,.02,2.66),(.46,.39,.49),'skin',head)
ico('Face / nose',(0,.417,2.58),(.075,.085,.085),'skin',head)
for side in [-1,1]:
 uv('Eye / white',(side*.17,.371,2.70),(.105,.035,.095),'eye',head)
 uv('Eye / green iris',(side*.17,.405,2.70),(.051,.014,.064),'pupil',head)
 uv('Eye / pupil',(side*.17,.42,2.70),(.023,.008,.04),'lining',head)
 uv('Eye / highlight',(side*.155,.424,2.73),(.017,.007,.02),'eye',head)
 rod('Face / copper brow',(side*.085,.39,2.84),(side*.29,.34,2.86),.029,'hair',head,8)
rod('Face / quiet smile',(-.055,.400,2.47),(.055,.400,2.47),.011,'leather',head,8)
uv('Hair / copper crown',(0,-.04,2.99),(.49,.37,.30),'hair',head)
def hair_lock(name,points,widths,mat,parent):
 v=[];N=8
 for (x,y,z),w in zip(points,widths):
  for i in range(N):
   a=i*math.tau/N;v.append((x+w*math.cos(a),y+w*.63*math.sin(a),z))
 f=[(k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i) for k in range(len(points)-1) for i in range(N)];f.extend([tuple(reversed(range(N))),tuple(range((len(points)-1)*N,len(points)*N))]);return mesh(name,v,f,mat,parent)
for side in [-1,1]:
 for i in range(3):
  x=side*(.12+i*.12);lock=ico('Hair / parted fringe',(x,.27,3.03-i*.08),(.18,.13,.24),'hairlight' if i==1 else 'hair',head);lock.rotation_euler.y=side*.65
 ear=group(('left' if side>0 else 'right')+'-fox-ear',(side*.37,-.015,3.10),head);ears.append(ear)
 points=[(side*.15,3.10),(side*.48,3.83),(side*.68,3.12)]
 panel('Ear / copper fur triangle',points,-.005,.22,'hair',ear,.035)
 panel('Ear / ivory inner fur',[(side*.27,3.18),(side*.47,3.64),(side*.57,3.18)],.118,.025,'white',ear,.02)
 panel('Ear / warm inner fold',[(side*.38,3.22),(side*.47,3.52),(side*.51,3.23)],.14,.015,'nose',ear,.008)
 for i in range(2):
  x=side*(.43+i*.13);y=-.09-i*.18
  hair_lock('Hair / long curved side lock',[(x,y,2.94),(x+side*.09,y-.03,2.69),(x+side*.02,y-.04,2.38),(x+side*.17,y-.08,2.12),(x+side*.08,y-.04,1.79),(x+side*.20,y-.02,1.58)],[.18,.21,.19,.17,.13,.012],'hairlight' if i else 'hair',hair)
for i in range(5):
 x=(i-2)*.18;y=-.42-abs(x)*.12
 hair_lock('Hair / tapered back wave',[(x,y,2.95),(x+.07,y-.05,2.63),(x-.04,y-.06,2.28),(x+.05,y-.08,1.94),(x-.06,y-.04,1.65)],[.16,.20,.19,.15,.012],'hairlight' if i%2 else 'hair',hair)
for side in [-1,1]:
 for i in range(3):
  leaf=ico('Hair / woodland leaves',(side*(.36+i*.055),.10,2.95+i*.085),(.105,.06,.16),'fold',head,1);leaf.rotation_euler.y=side*(.7+i*.3)
 rivet('Hair / blossom centre',(side*.43,.18,3.04),head,.045)
# Both wrists remain attached to articulated upper/forearm links.
links=[]
def link(name,mat,r):
 joint=group(name,(0,0,0),body);cyl(name+' / surface',(0,0,.5),r,1,mat,joint,12,0);links.append(joint);return joint
upper_l=link('staff-upper-arm','cloth',.21);upper_r=link('spell-upper-arm','cloth',.21)
def sleeve(name):
 joint=group(name,(0,0,0),body);links.append(joint);N=12;v=[]
 for r,z in [(.21,0),(.29,.87),(.29,1),(.14,1)]:
  for i in range(N):
   a=i*math.tau/N;v.append((r*math.cos(a),r*math.sin(a),z))
 f=[(k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i) for k in range(3) for i in range(N)];f.append(tuple(reversed(range(N))));mesh(name+' / ivory flared cuff',v,f,'white',joint)
 for i in range(N):rod(name+' / gold rim',v[2*N+i],v[2*N+(i+1)%N],.021,'gold',joint,8)
 return joint
fore_l=sleeve('staff-forearm');fore_r=sleeve('spell-forearm')
hand=group('staff-hand',(-.82,.48,2.00),body);free=group('spell-hand',(.73,.38,1.98),body)
ico('Staff hand / grip',(-.82,.48,2.00),(.15,.13,.15),'skin',hand)
ico('Spell hand / palm',(.73,.38,1.98),(.15,.11,.16),'skin',free)
for i in range(3):rod('Spell hand / fingers',(.66+i*.06,.43,1.99),(.66+i*.06,.48,2.15),.028,'skin',free,8)
staff=group('living-staff',(-.82,.48,2.00),hand)
# Crooked wooden shaft and an open twig ring around a faceted emerald.
shaft=[(-.82,.48,.65),(-.89,.48,1.20),(-.80,.48,1.80),(-.82,.48,2.35),(-.93,.48,2.78)]
for a,b in zip(shaft,shaft[1:]):rod('Staff / knotted wood',a,b,.070,'leather',staff,10)
for i in range(12):
 a=i*math.tau/12;b=(i+1)*math.tau/12
 p=(-.82+.39*math.cos(a),.48,3.15+.43*math.sin(a));q=(-.82+.39*math.cos(b),.48,3.15+.43*math.sin(b))
 rod('Staff / open branch ring',p,q,.055,'leather',staff,10)
 if i%2==0:
  leaf=ico('Staff / living leaf',(p[0],.50,p[2]),(.12,.07,.20),'fold',staff,1);leaf.rotation_euler.y=-a
for z in [1.65,1.79,2.44,2.68]:cyl('Staff / gold vine binding',(-.82,.48,z),.085,.06,'gold',staff,10)
verts=[(-.82,.48,3.48)]+[(-.82+.23*math.cos(i*math.tau/6),.48+.23*math.sin(i*math.tau/6),3.15) for i in range(6)]+[(-.82,.48,2.85)]
faces=[(0,1+i,1+(i+1)%6) for i in range(6)]+[(7,1+(i+1)%6,1+i) for i in range(6)]
gem=mesh('Staff / faceted emerald',verts,faces,'crystal',staff);gem.data.materials.append(M['facet'])
for f in gem.data.polygons:f.material_index=1 if f.index%3==0 else 0
socket=group('cast-socket',(-.82,.48,3.48),staff)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Luna studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Common hero orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.8
camera.location=(7,10,7);camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cam_data.shift_y+=ground.y-(1-330/384)
for name,loc,power,size,color in [('Warm key',(-4,6,8),850,4,(1,.83,.65)),('Cool fill',(5,3,5),600,4,(.65,.83,1)),('Warm rim',(1,-5,7),1000,3,(1,.80,.52))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()

joints=[body,head,hair,cape,*legs,*hems,*ears,*links,hand,free,staff];rests={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints}
def segment(joint,a,b):
 a,b=Vector(a),Vector(b);joint.location=a-Vector((0,0,1.15));joint.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();joint.scale=(1,1,(b-a).length)
def arms(palm,spell):
 l=Vector(palm);r=Vector(spell);le=Vector((-.66,l.y*.40,2.02+(l.z-2.00)*.45));re=Vector((.66,r.y*.40,2.02+(r.z-1.98)*.45))
 for joint,a,b in [(upper_l,(-.48,0,2.13),le),(fore_l,le,l),(upper_r,(.48,0,2.13),re),(fore_r,re,r)]:segment(joint,a,b)
 hand.location=l-Vector((0,0,1.15));free.location=r-Vector((0,0,1.15))
def clear_motion():
 for o in joints:o.animation_data_clear();o.location=rests[o][0];o.rotation_euler=rests[o][1];o.scale=rests[o][2]
 arms((-.82,.48,2.00),(.73,.38,1.98))
def key(frame):
 for o in joints:
  for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
def animate(mode):
 clear_motion();scene.render.fps=100;scene.frame_start=1;scene.frame_end=34 if mode=='cast' else 81
 if mode=='cast':
  poses=[(1,(-.82,.48,2.00),(.73,.38,1.98),0,0,0),(7,(-.82,.37,2.10),(.68,.45,2.12),-.02,.12,-.03),(11,(-.82,.30,2.18),(.65,.49,2.22),-.045,.21,-.07),(16,(-.80,.72,2.02),(.68,.74,2.08),.055,-1.15,.10),(22,(-.81,.65,2.02),(.72,.65,2.03),.03,-.90,.07),(28,(-.82,.51,2.01),(.73,.46,1.99),.008,-.25,.03),(34,(-.82,.48,2.00),(.73,.38,1.98),0,0,0)]
  for frame in range(1,35):
   a=next(p for p in reversed(poses) if p[0]<=frame);b=next((p for p in poses if p[0]>frame),a);t=(frame-a[0])/max(1,b[0]-a[0]);palm=Vector(a[1]).lerp(Vector(b[1]),t);spell=Vector(a[2]).lerp(Vector(b[2]),t);trunk=a[3]+(b[3]-a[3])*t;tilt=a[4]+(b[4]-a[4])*t;follow=a[5]+(b[5]-a[5])*t
   arms(palm,spell);body.rotation_euler.x=trunk;head.rotation_euler.x=-trunk*.4;staff.rotation_euler.x=tilt;hair.rotation_euler.x=-follow;cape.rotation_euler.x=follow
   for i,e in enumerate(ears):e.rotation_euler.x=-follow*.5;e.rotation_euler.y=follow*(1 if i else -1)
   for i,h in enumerate(hems):h.rotation_euler.x=trunk*(.5 if i else -.3)
   key(frame)
 else:
  for i in range(81):
   phase=i/80;s=math.sin(phase*math.tau);arms((-.82,.48+.035*s,2.00),(.73,.38-.08*s,1.98))
   for n,leg in enumerate(legs):
    p=(phase+n*.5)%1;forward=.22-.88*p if p<.5 else -.22+.44*(p-.5)*2;lift=0 if p<.5 else .12*math.sin((p-.5)*2*math.pi);leg.location=rests[leg][0]+Vector((0,forward,lift))
   body.location=rests[body][0]+Vector((.018*s,0,.020*(1-math.cos(phase*math.tau*2))));cape.rotation_euler.x=.035*(1-math.cos(phase*math.tau));hair.rotation_euler.x=-.035*s;hair.rotation_euler.z=.03*s;staff.rotation_euler.x=.045*s
   for n,h in enumerate(hems):h.rotation_euler.x=s*(.08 if n else -.08)
   for n,e in enumerate(ears):e.rotation_euler.x=.025*s;e.rotation_euler.y=s*(.025 if n else -.025)
   key(1+i)
 for o in joints:
  o.animation_data.action.name='Luna '+mode+' / '+o.name
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
   objects[0].name=f'Luna surface {i+1:02}'
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
manifest={'generator':'tools/blender/build_druid.py','command':'npm run models:druid','reference':'art-source/defense/atlases/ranged-motion.png','reference_actor':'Luna / fourth row','reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'render':{'engine':'Cycles CPU','samples':args.samples},'clips':[],'directions':{'cast':[],'walk':[]},'files':[]}
for mode in ['cast','walk']:
 animate(mode);asset_id='luna-druid'+('-walk' if mode=='walk' else '');clip_name='luna-'+mode
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
    if mode=='cast' and direction in [0,1]:scene.render.filepath=f'/tmp/arcana-druid-preview-{direction}-{name}.png';bpy.ops.render.render(write_still=True)
   elif not args.check:scene.render.filepath=str(FRAMES/f'luna-{mode}-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
  manifest['directions'][mode].append(entry)
  if not args.check and not args.preview:
   dst=OUT/f'luna-{mode}-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'luna-{mode}-{direction}-{name}.png')] for name,_ in poses),[])
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'hstack=inputs={len(poses)},scale={256*len(poses)}:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
   manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
  print('DIRECTION_COMPLETE',mode,direction,flush=True)
 ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
 if not args.check and not args.preview:
  stats=export_runtime();scene['regeneration_command']='npm run models:druid';bpy.context.preferences.filepaths.save_version=0;source=ROOT/f'art-source/defense/{asset_id}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));shutil.copyfile(FRAMES/f'luna-{mode}-1-{poses[0][0]}.png',OUT/f'{asset_id}.png')
  manifest['clips'].append({'asset':asset_id,'clip':clip_name,'fps':100,'first_frame':1,'last_frame':scene.frame_end,'duration_seconds':(scene.frame_end-1)/100,'runtime':stats,'source':str(source.relative_to(ROOT))})
  for path in [source,OUT/f'{asset_id}.glb',OUT/f'{asset_id}.png']:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
if not args.check and not args.preview:
 (OUT/'luna-druid.json').write_text(json.dumps(manifest,indent=2)+'\n')
 coords=[[[round((p['socket'][0]-192)/384*manifest['frame']['display_scale'],7),round((p['socket'][1]-330)/384*manifest['frame']['display_scale'],7)] for p in d['poses']] for d in manifest['directions']['cast']]
 (ROOT/'src/games/defense/druidSockets.ts').write_text('// Generated by tools/blender/build_druid.py from the actual emerald socket.\nexport const DRUID_SOCKETS = '+json.dumps(coords)+' as const;\n')
print('DRUID_CHECK_PASS' if args.check or args.preview else 'DRUID_BAKE_PASS',flush=True)
