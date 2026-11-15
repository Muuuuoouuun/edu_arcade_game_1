"""Create Riel's editable archer, directional cast/walk bakes and true animated GLBs.
Run npm run models:elf. Geometry only; no image planes or image inputs.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/riel-archer'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');p.add_argument('--preview',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
COL=bpy.data.collections.new('Riel archer / editable parts');bpy.context.scene.collection.children.link(COL);STUDIO=bpy.data.collections.new('Studio / common hero camera');bpy.context.scene.collection.children.link(STUDIO);ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'cloth':material('Riel / forest green cloth',(.025,.10,.012),0,.85),
 'fold':material('Riel / leaf highlights',(.08,.19,.025),0,.82),
 'lining':material('Riel / dark indigo lining',(.025,.037,.012),0,.87),
 'gold':material('Riel / warm gold piping',(.77,.43,.075),.68,.34),
 'leather':material('Riel / brown leather',(.19,.075,.026),0,.77),
 'sole':material('Riel / boot sole',(.035,.022,.015),0,.86),
 'skin':material('Riel / warm peach skin',(.80,.48,.29),0,.63),
 'nose':material('Riel / rosy cheek',(.82,.35,.23),0,.67),
 'hair':material('Riel / ivory hair',(.63,.34,.065),0,.75),
 'hairlight':material('Riel / pale hair ridges',(.94,.66,.22),0,.7),
 'white':material('Riel / cream tunic',(.83,.79,.64),0,.88),
 'eye':material('Riel / clear eye whites',(.94,.94,.86),0,.4),
 'pupil':material('Riel / deep blue eyes',(.035,.28,.09),.1,.3),
 'wood':material('Riel / curved ash bow',(.25,.10,.025),0,.66),
 'crystal':material('Riel / sapphire crystal',(.015,.37,.88),.35,.21,.65),
 'facet':material('Riel / bright crystal facets',(.12,.72,1),.22,.2,.7),
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


ROOT_OBJ=group('riel-archer');body=group('body',(0,0,1.15),ROOT_OBJ);head=group('head',(0,0,2.65),body);cape=group('cape',(0,-.28,2.12),body);hair=group('hair',(0,-.18,2.65),head)
legs=[]
for side,x in [('right',-.32),('left',.32)]:
 leg=group(side+'-leg',(x,0,.95),ROOT_OBJ);legs.append(leg)
 cube(side+' boot / sole',(x,.11,.09),(.43,.65,.17),'sole',leg,.05)
 cube(side+' boot / leather',(x,.10,.28),(.41,.60,.34),'leather',leg,.07)
 ico(side+' boot / cuff',(x,-.01,.52),(.24,.24,.16),'leather',leg)
 rod(side+' boot / gold edge',(x-.21,.21,.54),(x+.21,.21,.54),.027,'gold',leg)
 ico(side+' leg / leggings',(x,-.04,.79),(.195,.20,.37),'lining',leg)
 panel(side+' boot / leaf plate',[(x-.12,.43),(x-.17,.27),(x,.16),(x+.17,.27),(x+.12,.43)],.40,.065,'gold',leg,.015)
# A staggered archery stance keeps both boots readable in profile.
legs[0].location.y+=.18;legs[1].location.y-=.18
ico('Torso / fitted forest tunic',(0,0,1.78),(.48,.30,.55),'cloth',body)
panel('Chest / leather shaped cuirass',[(-.36,2.12),(-.40,1.86),(-.26,1.48),(.26,1.48),(.40,1.86),(.36,2.12),(0,2.23)],.29,.10,'leather',body,.035)
for side in [-1,1]:
 panel('Chest / leaf armor',[(side*.03,2.14),(side*.31,2.13),(side*.35,1.91),(side*.08,1.83)],.37,.07,'gold',body,.02)
 points=[(side*.06,1.49),(side*.42,1.43),(side*.65,.85),(side*.23,.65),(side*.05,1.05)]
 panel('Tunic / pointed green skirt',points,.13,.13,'cloth',body,.025)
 for a,b in zip(points,points[1:]+points[:1]):rod('Tunic / gold leaf edge',(a[0],.21,a[1]),(b[0],.21,b[1]),.025,'gold',body,8)
 panel('Shoulder / leaf guard',[(side*.35,2.16),(side*.48,2.30),(side*.72,2.14),(side*.62,1.97)],.03,.25,'fold',body,.03)
 rod('Shoulder / gold edge',(side*.48,.17,2.29),(side*.70,.17,2.14),.03,'gold',body)
cube('Belt / waist leather',(0,.01,1.46),(.87,.60,.14),'leather',body,.03)
for x in [-.28,0,.28]:ico('Belt / leaf buckle',(x,.35,1.46),(.13,.05,.10),'gold',body,1)
# Thick hooded cloak, broad but shorter than the mage's coat.
verts=[]
for z,w,y in [(2.21,.43,-.28),(1.50,.64,-.43),(.70,.84,-.59)]:
 for i in range(7):
  x=-w+2*w*i/6;verts.append((x,y-.11*(1-(x/w)**2),z+.09*math.cos(i*math.pi/3)))
faces=[(r*7+i,r*7+i+1,(r+1)*7+i+1,(r+1)*7+i) for r in range(2) for i in range(6)]
o=mesh('Cloak / curved green cloth',verts,faces,'cloth',cape);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.055
for i in range(6):rod('Cloak / gold hem',verts[14+i],verts[15+i],.025,'gold',cape,8)
# Quiver remains behind the shoulder; visible fletching distinguishes the archer.
q=group('quiver',(.38,-.40,1.70),body);q.rotation_euler.y=-.20
cyl('Quiver / leather tube',(.38,-.47,1.84),.18,.83,'leather',q)
for z in [1.45,2.23]:cyl('Quiver / bronze rim',(.38,-.47,z),.195,.07,'gold',q)
for i in range(3):
 x=.28+i*.10;rod('Quiver / arrow shaft',(x,-.47,2.0),(x,-.47,2.65+i*.07),.018,'wood',q,8)
 ico('Quiver / cream fletching',(x,-.47,2.58+i*.07),(.065,.04,.14),'white',q,1)
uv('Face / rounded head',(0,.02,2.65),(.43,.36,.48),'skin',head)
ico('Face / nose',(0,.389,2.58),(.07,.075,.075),'skin',head)
for side in [-1,1]:
 # Solid elongated ears, with a smaller inset instead of a flat ear card.
 points=[(side*.37,2.80),(side*.83,2.99),(side*.66,2.62),(side*.42,2.56)]
 panel('Ear / pointed silhouette',points,.015,.17,'skin',head,.015)
 panel('Ear / inner pink',[(side*.44,2.78),(side*.73,2.91),(side*.60,2.65)],.113,.018,'nose',head,.005)
 uv('Eye / white',(side*.16,.351,2.69),(.105,.035,.10),'eye',head)
 uv('Eye / emerald iris',(side*.16,.386,2.69),(.053,.014,.068),'pupil',head)
 uv('Eye / pupil',(side*.16,.400,2.69),(.023,.008,.042),'lining',head)
 uv('Eye / highlight',(side*.145,.404,2.72),(.017,.007,.021),'eye',head)
 rod('Face / golden brow',(side*.08,.375,2.82),(side*.27,.32,2.85),.027,'hair',head,8)
rod('Face / smile',(-.055,.378,2.47),(.055,.378,2.47),.011,'leather',head,8)
# Broad blonde locks frame the face and flow behind the shoulders.
for side in [-1,1]:
 for i in range(3):
  x=side*(.33+i*.065);y=.12-i*.17;lock=ico('Hair / flowing side lock',(x,y,2.42-i*.05),(.14,.15,.41),'hairlight' if i%2 else 'hair',hair);lock.rotation_euler.y=side*-.25
for i in range(7):
 x=(i-3)*.14;lock=ico('Hair / back lock',(x,-.30,2.35),(.15,.17,.48),'hairlight' if i%3==0 else 'hair',hair);lock.rotation_euler.y=x*.4
for i in range(5):
 x=(i-2)*.14;lock=ico('Hair / swept fringe',(x,.29,2.96-abs(x)*.16),(.17,.12,.22),'hairlight',head);lock.rotation_euler.y=-.28
# Open-front hood: actual shell around the face, not a closed ball over it.
N=20;verts=[]
for z,rx,ry,cy in [(2.55,.51,.39,-.02),(3.02,.54,.43,-.01),(3.24,.39,.32,-.07),(3.38,.08,.10,-.22)]:
 for i in range(N):
  a=-math.pi*.08+(math.pi*1.16)*i/(N-1);verts.append((rx*math.cos(a),cy-ry*math.sin(a),z))
faces=[(r*N+i,r*N+i+1,(r+1)*N+i+1,(r+1)*N+i) for r in range(3) for i in range(N-1)]
o=mesh('Hood / open face shell',verts,faces,'cloth',head);o.modifiers.new('Hood thickness','SOLIDIFY').thickness=.07
# Crown front ridge arches over the fringe and joins the hood's open edge.
for i in range(12):
 a=math.pi*i/12;b=math.pi*(i+1)/12
 rod('Hood / arched gold trim',(.53*math.cos(a),.16+.20*math.sin(a),2.89+.32*math.sin(a)),(.53*math.cos(b),.16+.20*math.sin(b),2.89+.32*math.sin(b)),.027,'gold',head,8)
panel('Hood / leaf crest',[(-.10,3.18),(0,3.30),(.10,3.18),(0,3.06)],.25,.05,'gold',head,.01)
# Articulated links carry rigid geometry; no keyframed vertices are lost at GLB export.
links=[]
def link(name,r,mat):
 joint=group(name,(0,0,0),body);cyl(name+' / surface',(0,0,.5),r,1,mat,joint,10,0);links.append(joint);return joint
upper_l=link('bow-upper-arm',.14,'cloth');fore_l=link('bow-forearm',.13,'leather');upper_r=link('draw-upper-arm',.14,'cloth');fore_r=link('draw-forearm',.13,'leather')
bowhand=group('bow-hand',(-.64,.80,2.02),body);drawhand=group('draw-hand',(-.64,.26,2.06),body)
ico('Bow hand / glove',(-.64,.80,2.02),(.15,.13,.16),'skin',bowhand)
ico('Draw hand / glove',(-.64,.26,2.06),(.13,.12,.13),'skin',drawhand)
limbs=[link('bow-limb-'+str(i),.065,'wood') for i in range(8)]
strings=[link('bow-string-'+str(i),.012,'white') for i in range(2)]
bowgrip=group('bow-grip',(-.64,.85,2.05),body);cyl('Bow / leather grip',(-.64,.85,2.05),.085,.30,'leather',bowgrip)
for z in [1.86,2.24]:ico('Bow / bronze grip cap',(-.64,.85,z),(.12,.10,.08),'gold',bowgrip,1)
for side in [-1,1]:
 panel('Bow / gold leaf guard',[(-.64,2.10),(-.64+side*.20,2.28),(-.64+side*.26,2.10),(-.64+side*.12,1.96)],.90,.055,'gold',body,.012)
for i in [0,2,5,7]:
 joint=limbs[i];cyl('Bow / bound gold band',(0,0,.55),.076,.16,'gold',joint,10,0)
arrow=group('nocked-arrow',(-.64,.20,2.10),body)
rod('Arrow / ash shaft',(-.64,.20,2.10),(-.64,1.67,2.10),.022,'wood',arrow,8)
# Closed 3D broadhead along +Y.
mesh('Arrow / leaf broadhead',[(-.64,1.87,2.10),(-.48,1.62,2.10),(-.64,1.65,2.17),(-.28,1.62,2.10),(-.64,1.65,2.03)],[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(1,4,3,2)],'gold',arrow)
for side in [-1,1]:mesh('Arrow / fletching',[(-.64,.21,2.10),(-.64+side*.11,.21,2.10),(-.64+side*.08,.40,2.10),(-.64,.43,2.10),(-.64,.21,2.115)],[(0,1,2,3),(4,3,2,1)],'white',arrow)
socket=group('arrow-socket',(-.64,1.87,2.10),body)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Riel studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Common hero orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.8
camera.location=(7,10,7);camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cam_data.shift_y+=ground.y-(1-330/384)
for name,loc,power,size,color in [('Warm key',(-4,6,8),850,4,(1,.83,.65)),('Cool fill',(5,3,5),600,4,(.65,.83,1)),('Warm rim',(1,-5,7),1000,3,(1,.80,.52))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
joints=[body,head,cape,hair,*legs,*links,bowhand,drawhand,arrow,socket];rests={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints}
def segment(joint,a,b):
 a,b=Vector(a),Vector(b);joint.location=a-Vector((0,0,1.15));joint.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();joint.scale=(1,1,(b-a).length)
def bow_pose(draw=0,released=False):
 # The bow's tip recession, string V and nock use exactly the same endpoints.
 nock=Vector((-.64,.20-.65*draw,2.10));left=Vector((-.64,.80,2.02));right=nock+Vector((.10 if released else 0,-.12 if released else 0,0))
 for joint,a,b in [(upper_l,(-.44,0,2.12),(-.55,.40,2.06)),(fore_l,(-.55,.40,2.06),left),(upper_r,(.44,0,2.12),(.60+.25*draw,-.12-.26*draw,2.14)),(fore_r,(.60+.25*draw,-.12-.26*draw,2.14),right)]:segment(joint,a,b)
 bowhand.location=left-Vector((0,0,1.15));drawhand.location=right-Vector((0,0,1.15))
 points=[(-.64,.54-.17*draw,.83),(-.64,.82-.12*draw,1.02),(-.64,1.02-.06*draw,1.38),(-.64,.98,1.76),(-.64,.85,2.05),(-.64,.98,2.34),(-.64,1.02-.06*draw,2.72),(-.64,.82-.12*draw,3.08),(-.64,.54-.17*draw,3.27)]
 for j,a,b in zip(limbs,points,points[1:]):segment(j,a,b)
 segment(strings[0],points[0],nock);segment(strings[1],nock,points[-1])
 socket.location=rests[socket][0]+Vector((0,-.65*draw,0));arrow.location=rests[arrow][0]+Vector((0,-.65*draw,0));arrow.scale=(.001,.001,.001) if released else (1,1,1)
def clear_motion():
 for o in joints:o.animation_data_clear();o.location=rests[o][0];o.rotation_euler=rests[o][1];o.scale=rests[o][2]
 bow_pose()
def key(frame):
 for o in joints:
  for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
def animate(mode):
 clear_motion();scene.render.fps=100;scene.frame_start=1;scene.frame_end=29 if mode=='cast' else 81
 if mode=='cast':
  poses=[(1,0,False,0,0),(6,.55,False,-.025,-.025),(10,1,False,-.05,-.05),(11,0,True,.025,.06),(16,.08,True,.015,.04),(24,0,False,0,.01),(29,0,False,0,0)]
  for frame in range(1,30):
   a=next(p for p in reversed(poses) if p[0]<=frame);b=next((p for p in poses if p[0]>frame),a);t=(frame-a[0])/max(1,b[0]-a[0]);draw=a[1]+(b[1]-a[1])*t;trunk=a[3]+(b[3]-a[3])*t;cloth=a[4]+(b[4]-a[4])*t
   bow_pose(draw,a[2]);body.rotation_euler.x=trunk;head.rotation_euler.x=-trunk*.5;cape.rotation_euler.x=cloth;hair.rotation_euler.x=-cloth*.3;key(frame)
 else:
  for i in range(9):
   phase=i/8;bow_pose()
   for n,leg in enumerate(legs):
    p=(phase+n*.5)%1;forward=.23-.92*p if p<.5 else -.23+.46*(p-.5)*2;lift=0 if p<.5 else .13*math.sin((p-.5)*2*math.pi);leg.location=rests[leg][0]+Vector((0,forward,lift))
   body.location=rests[body][0]+Vector((.02*math.sin(phase*math.tau),0,.025*(1-math.cos(phase*math.tau*2))));cape.rotation_euler.x=.045*(1-math.cos(phase*math.tau));hair.rotation_euler.x=-.025*math.sin(phase*math.tau);key(1+i*10)
 for o in joints:
  o.animation_data.action.name='Riel '+mode+' / '+o.name
  for curve in o.animation_data.action.fcurves:
   for k in curve.keyframe_points:k.interpolation='CONSTANT' if o==arrow and curve.data_path=='scale' else 'LINEAR'
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
   objects[0].name=f'Riel surface {i+1:02}'
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
manifest={'generator':'tools/blender/build_elf.py','command':'npm run models:elf','reference':'art-source/defense/atlases/ranged-motion.png','reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'render':{'engine':'Cycles CPU','samples':args.samples},'clips':[],'directions':{'cast':[],'walk':[]},'files':[]}
for mode in ['cast','walk']:
 animate(mode);asset_id='riel-archer'+('-walk' if mode=='walk' else '');clip_name='riel-'+mode
 poses=[('ready',1),('windup',10),('strike',11),('recover',24)] if mode=='cast' else [(str(i),1+i*10) for i in range(8)]
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
    if mode=='cast' and direction in [0,1]:scene.render.filepath=f'/tmp/arcana-elf-preview-{direction}-{name}.png';bpy.ops.render.render(write_still=True)
   elif not args.check:scene.render.filepath=str(FRAMES/f'riel-{mode}-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
  manifest['directions'][mode].append(entry)
  if not args.check and not args.preview:
   dst=OUT/f'riel-{mode}-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'riel-{mode}-{direction}-{name}.png')] for name,_ in poses),[])
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'hstack=inputs={len(poses)},scale={256*len(poses)}:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
   manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
  print('DIRECTION_COMPLETE',mode,direction,flush=True)
 ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
 if not args.check and not args.preview:
  stats=export_runtime();scene['regeneration_command']='npm run models:elf';bpy.context.preferences.filepaths.save_version=0;source=ROOT/f'art-source/defense/{asset_id}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));shutil.copyfile(FRAMES/f'riel-{mode}-1-{poses[0][0]}.png',OUT/f'{asset_id}.png')
  manifest['clips'].append({'asset':asset_id,'clip':clip_name,'fps':100,'first_frame':1,'last_frame':scene.frame_end,'duration_seconds':(scene.frame_end-1)/100,'runtime':stats,'source':str(source.relative_to(ROOT))})
  for path in [source,OUT/f'{asset_id}.glb',OUT/f'{asset_id}.png']:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
if not args.check and not args.preview:
 (OUT/'riel-archer.json').write_text(json.dumps(manifest,indent=2)+'\n')
 coords=[[[round((p['socket'][0]-192)/384*manifest['frame']['display_scale'],7),round((p['socket'][1]-330)/384*manifest['frame']['display_scale'],7)] for p in d['poses']] for d in manifest['directions']['cast']]
 (ROOT/'src/games/defense/elfSockets.ts').write_text('// Generated by tools/blender/build_elf.py from the actual arrow-tip socket.\nexport const ELF_SOCKETS = '+json.dumps(coords)+' as const;\n')
print('ELF_CHECK_PASS' if args.check or args.preview else 'ELF_BAKE_PASS',flush=True)
