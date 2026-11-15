"""Create Ian's editable mage, directional cast/walk bakes and true animated GLBs.
Run npm run models:mage. Geometry only; no image planes or image inputs.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/ian-mage'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');p.add_argument('--preview',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
COL=bpy.data.collections.new('Ian mage / editable parts');bpy.context.scene.collection.children.link(COL);STUDIO=bpy.data.collections.new('Studio / common hero camera');bpy.context.scene.collection.children.link(STUDIO);ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'cloth':material('Ian / midnight blue wool',(.006,.012,.070),0,.85),
 'fold':material('Ian / blue lit folds',(.015,.035,.16),0,.82),
 'lining':material('Ian / dark indigo lining',(.012,.018,.055),0,.87),
 'gold':material('Ian / warm gold piping',(.77,.43,.075),.68,.34),
 'leather':material('Ian / brown leather',(.19,.075,.026),0,.77),
 'sole':material('Ian / boot sole',(.035,.022,.015),0,.86),
 'skin':material('Ian / warm peach skin',(.80,.48,.29),0,.63),
 'nose':material('Ian / rosy cheek',(.82,.35,.23),0,.67),
 'hair':material('Ian / ivory hair',(.84,.77,.60),0,.75),
 'hairlight':material('Ian / pale hair ridges',(.97,.91,.77),0,.7),
 'white':material('Ian / cream tunic',(.83,.79,.64),0,.88),
 'eye':material('Ian / clear eye whites',(.94,.94,.86),0,.4),
 'pupil':material('Ian / deep blue eyes',(.015,.12,.18),.1,.3),
 'crystal':material('Ian / sapphire crystal',(.015,.37,.88),.35,.21,.65),
 'facet':material('Ian / bright crystal facets',(.12,.72,1),.22,.2,.7),
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


ROOT_OBJ=group('ian-mage');body=group('body',(0,0,1.15),ROOT_OBJ);head=group('head',(0,0,2.7),body)
arm=group('staff-arm',(-.58,0,2.05),body);hand=group('staff-hand',(-.73,.40,1.95),arm);free=group('spell-arm',(.58,0,2.05),body);cape=group('cape',(0,-.25,2.10),body)
legs=[]
for side,x in [('right',-.34),('left',.34)]:
 leg=group(side+'-leg',(x,0,.95),ROOT_OBJ);legs.append(leg)
 cube(side+' boot / sole',(x,.12,.09),(.46,.72,.17),'sole',leg,.06)
 cube(side+' boot / leather',(x,.10,.28),(.44,.65,.34),'leather',leg,.08)
 cube(side+' boot / toe cap',(x,.35,.29),(.46,.28,.20),'gold',leg,.05)
 ico(side+' trouser',(x,-.02,.69),(.23,.23,.44),'lining',leg)
 rod(side+' boot / ankle trim',(x-.22,.17,.48),(x+.22,.17,.48),.032,'gold',leg)
# Volumetric coat with a narrow waist and open, flared lower panels.
ico('Torso / tailored blue tunic',(0,0,1.76),(.58,.34,.59),'cloth',body)
panel('Cream central tunic',[(-.21,1.19),(-.15,2.18),(.15,2.18),(.21,1.19)],.335,.06,'white',body,.025)
for side in [-1,1]:
 points=[(side*.10,1.45),(side*.48,1.46),(side*.78,.64),(side*.23,.78)]
 panel('Coat / split front hem',points,.17,.12,'cloth',body,.035)
 for a,b in zip(points,points[1:]+points[:1]):rod('Coat / gold edge',(a[0],.245,a[1]),(b[0],.245,b[1]),.028,'gold',body)
 rod('Coat / broad front fold',(side*.35,.255,1.34),(side*.50,.255,.82),.035,'fold',body)
 panel('Collar / raised wing',[(side*.08,2.13),(side*.16,2.45),(side*.54,2.29),(side*.47,2.06)],.18,.10,'fold',body,.025)
 rod('Collar / gold edge',(side*.16,.245,2.45),(side*.54,.245,2.29),.035,'gold',body)
ico('Collar / sapphire clasp',(0,.40,2.10),(.11,.055,.14),'crystal',body,1)
for side in [-1,1]:
 rod('Chest / gold diagonal',(side*.13,.37,1.90),(side*.40,.30,2.06),.025,'gold',body)
for z in [1.62,1.77]:ico('Tunic / gold button',(0,.39,z),(.04,.025,.04),'gold',body,1)
# Curved cape follows the back; thick mesh instead of a flat billboard.
verts=[]
for z,w,y in [(2.15,.48,-.30),(1.65,.62,-.43),(.80,.85,-.57)]:
 for i in range(7):
  x=-w+2*w*i/6;verts.append((x,y-.13*(1-(x/w)**2),z+.035*math.cos(i*math.pi)))
faces=[(r*7+i,r*7+i+1,(r+1)*7+i+1,(r+1)*7+i) for r in range(2) for i in range(6)]
o=mesh('Cape / thick draped cloth',verts,faces,'cloth',cape);mod=o.modifiers.new('Cloth thickness','SOLIDIFY');mod.thickness=.055
for i in range(6):rod('Cape / gold hem',verts[14+i],verts[15+i],.035,'gold',cape)
for side in [0,6]:
 for r in range(2):rod('Cape / gold seam',verts[r*7+side],verts[(r+1)*7+side],.028,'gold',cape)
cube('Belt / leather',(0,.01,1.40),(1.04,.68,.16),'leather',body,.04)
cube('Belt / buckle',(0,.38,1.41),(.25,.10,.23),'gold',body,.03);cube('Belt / buckle recess',(0,.438,1.41),(.12,.025,.11),'lining',body,.015)
cube('Belt / spellbook',(.60,-.03,1.28),(.24,.36,.45),'leather',body,.035)
cube('Book / page edges',(.61,.0,1.28),(.25,.28,.31),'white',body,.015)
# Oversized, readable face under a raised brim, with asymmetrical ivory locks.
uv('Face / rounded head',(0,.02,2.69),(.49,.41,.53),'skin',head)
ico('Face / nose',(0,.432,2.62),(.095,.11,.10),'skin',head)
for side in [-1,1]:
 uv('Face / ear',(side*.48,.015,2.68),(.11,.095,.17),'skin',head)
 uv('Eye / white',(side*.19,.391,2.75),(.11,.034,.105),'eye',head)
 uv('Eye / blue iris',(side*.19,.426,2.75),(.053,.015,.068),'pupil',head)
 uv('Eye / dark pupil',(side*.19,.442,2.75),(.025,.008,.045),'lining',head)
 uv('Eye / highlight',(side*.175,.442,2.78),(.017,.007,.023),'eye',head)
 rod('Face / ivory brow',(side*.10,.41,2.90),(side*.29,.36,2.91),.035,'hair',head)
 rod('Face / smile',(-.07,.423,2.50),(.07,.423,2.50),.013,'leather',head)
for i in range(9):
 angle=i*math.tau/9;x=.43*math.sin(angle);y=.34*math.cos(angle);z=2.97 if y>.15 else 2.82
 lock=ico('Hair / tapered ivory lock',(x,y,z),(.17,.13,.26 if y<.1 else .18),'hairlight' if i%3==0 else 'hair',head,1);lock.rotation_euler.y=.35*math.sin(angle)
# Elliptical brim and bent crown: the principal mage silhouette.
N=24;verts=[]
for radius,z in [(1,3.08),(1,3.15),(.43,3.18)]:
 for i in range(N):
  ang=i*math.tau/N;verts.append((1.02*radius*math.cos(ang),.78*radius*math.sin(ang),z+.045*math.cos(ang)))
faces=[]
for r in range(2):faces.extend((r*N+i,r*N+(i+1)%N,(r+1)*N+(i+1)%N,(r+1)*N+i) for i in range(N))
faces.append(tuple(range(2*N,3*N)));faces.append(tuple(reversed(range(N))));mesh('Hat / broad raised brim',verts,faces,'cloth',head)
for i in range(N):rod('Hat / gold brim piping',verts[N+i],verts[N+(i+1)%N],.025,'gold',head,8)
ring_specs=[(0,0,3.13,.48),(-.04,-.015,3.40,.37),(-.15,-.03,3.68,.24),(-.36,-.02,3.86,.12),(-.62,0,3.80,.045)];verts=[]
for x,y,z,r in ring_specs:
 for i in range(12):
  ang=i*math.tau/12;verts.append((x+r*math.cos(ang),y+r*math.sin(ang),z+.015*math.sin(ang*3)))
faces=[(r*12+i,r*12+(i+1)%12,(r+1)*12+(i+1)%12,(r+1)*12+i) for r in range(4) for i in range(12)];faces.append(tuple(range(48,60)));mesh('Hat / bent conical crown',verts,faces,'fold',head)
for i in range(12):
 a=i*math.tau/12;b=(i+1)*math.tau/12;rod('Hat / gold ribbon',(.45*math.cos(a),.45*math.sin(a),3.22),(.45*math.cos(b),.45*math.sin(b),3.22),.035,'gold',head,8)
# One large star rather than unreadable microscopic ornament.
star=[]
for i in range(10):
 a=i*math.pi/5+math.pi/2;r=.13 if i%2==0 else .055;star.append((.17+r*math.cos(a),3.39+r*math.sin(a)))
panel('Hat / gold star',star,.30,.035,'gold',head,.005)
# Broad cuffs keep hands separate from torso at phone scale.
rod('Staff arm / sleeve',(-.56,0,2.10),(-.73,.36,1.96),.24,'cloth',arm)
rod('Staff arm / gold cuff',(-.73,.30,1.98),(-.73,.40,1.95),.245,'gold',arm)
ico('Staff hand / glove',(-.73,.47,1.95),(.18,.18,.18),'skin',hand)
rod('Spell arm / sleeve',(.56,0,2.10),(.80,.24,1.94),.235,'cloth',free)
rod('Spell arm / gold cuff',(.78,.21,1.96),(.84,.28,1.92),.24,'gold',free)
ico('Spell hand / palm',(.90,.34,1.90),(.18,.12,.16),'skin',free)
for i in range(3):rod('Spell hand / fingers',(.85+i*.07,.35,1.91),(.87+i*.07,.46,1.99+i*.015),.032,'skin',free,8)
rod('Staff / ash shaft',(-.73,.47,.90),(-.73,.47,2.95),.065,'leather',hand)
for z in [1.05,1.66,1.82,2.46,2.70]:cyl('Staff / gold ferrule',(-.73,.47,z),.095,.09,'gold',hand)
for i in range(3):
 a=i*math.tau/3;x=-.73+.18*math.cos(a);y=.47+.18*math.sin(a)
 rod('Staff / gold crystal claw',(-.73,.47,2.78),(x,y,3.05),.048,'gold',hand)
 rod('Staff / claw tip',(x,y,3.05),(x*.3-.73*.7,y*.3+.47*.7,3.16),.036,'gold',hand)
# Faceted diamond, not a glowing billboard.
verts=[(-.73,.47,3.78)]+[(-.73+.28*math.cos(i*math.tau/6),.47+.28*math.sin(i*math.tau/6),3.25) for i in range(6)]+[(-.73,.47,2.98)]
faces=[(0,1+i,1+(i+1)%6) for i in range(6)]+[(7,1+(i+1)%6,1+i) for i in range(6)]
crystal=mesh('Staff / sapphire crystal',verts,faces,'crystal',hand);crystal.data.materials.append(M['facet'])
for f in crystal.data.polygons:f.material_index=1 if f.index%3==0 else 0
socket=group('cast-socket',(-.73,.47,3.78),hand)

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Ian studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Common hero orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.8
camera.location=(7,10,7);camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cam_data.shift_y+=ground.y-(1-330/384)
for name,loc,power,size,color in [('Warm key',(-4,6,8),850,4,(1,.83,.65)),('Cool fill',(5,3,5),600,4,(.65,.83,1)),('Warm rim',(1,-5,7),1000,3,(1,.80,.52))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
joints=[body,head,arm,hand,free,cape,*legs];rests={o:(o.location.copy(),o.rotation_euler.copy()) for o in joints}
def clear_motion():
 for o in joints:o.animation_data_clear();o.location=rests[o][0];o.rotation_euler=rests[o][1]
def key(frame):
 for o in joints:
  for path in ['location','rotation_euler']:o.keyframe_insert(data_path=path,frame=frame)
def animate(mode):
 clear_motion();scene.render.fps=100;scene.frame_start=1;scene.frame_end=34 if mode=='cast' else 81
 if mode=='cast':
  for frame,rx,wrist,trunk,other,cloth in [(1,0,0,0,0,0),(11,.30,.10,-.045,-.10,-.06),(16,-1.05,-.10,.075,-.70,.12),(26,-.20,0,.025,-.20,.06),(34,0,0,0,0,0)]:
   arm.rotation_euler.x=rx;hand.rotation_euler.x=wrist;body.rotation_euler.x=trunk;head.rotation_euler.x=-trunk*.4;free.rotation_euler.x=other;cape.rotation_euler.x=cloth;key(frame)
 else:
  for i in range(9):
   phase=i/8
   for n,leg in enumerate(legs):
    p=(phase+n*.5)%1;forward=.24-.96*p if p<.5 else -.24+.48*(p-.5)*2;lift=0 if p<.5 else .14*math.sin((p-.5)*2*math.pi);leg.location=rests[leg][0]+Vector((0,forward,lift))
   body.location=rests[body][0]+Vector((.02*math.sin(phase*math.tau),0,.025*(1-math.cos(phase*math.tau*2))));arm.rotation_euler.x=.05*math.sin(phase*math.tau);free.rotation_euler.x=-.10*math.sin(phase*math.tau);cape.rotation_euler.x=.04*(1-math.cos(phase*math.tau));key(1+i*10)
 for o in joints:
  o.animation_data.action.name='Ian '+mode+' / '+o.name
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
   objects[0].name=f'Ian surface {i+1:02}'
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
manifest={'generator':'tools/blender/build_mage.py','command':'npm run models:mage','reference':'art-source/defense/atlases/ranged-motion.png','reference_sha256':hashlib.sha256((ROOT/'art-source/defense/atlases/ranged-motion.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'render':{'engine':'Cycles CPU','samples':args.samples},'clips':[],'directions':{'cast':[],'walk':[]},'files':[]}
for mode in ['cast','walk']:
 animate(mode);asset_id='ian-mage'+('-walk' if mode=='walk' else '');clip_name='ian-'+mode
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
    if mode=='cast' and direction==1:scene.render.filepath=f'/tmp/arcana-mage-preview-{name}.png';bpy.ops.render.render(write_still=True)
   elif not args.check:scene.render.filepath=str(FRAMES/f'ian-{mode}-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
  manifest['directions'][mode].append(entry)
  if not args.check and not args.preview:
   dst=OUT/f'ian-{mode}-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'ian-{mode}-{direction}-{name}.png')] for name,_ in poses),[])
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'hstack=inputs={len(poses)},scale={256*len(poses)}:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
   manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
  print('DIRECTION_COMPLETE',mode,direction,flush=True)
 ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
 if not args.check and not args.preview:
  stats=export_runtime();scene['regeneration_command']='npm run models:mage';bpy.context.preferences.filepaths.save_version=0;source=ROOT/f'art-source/defense/{asset_id}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));shutil.copyfile(FRAMES/f'ian-{mode}-1-{poses[0][0]}.png',OUT/f'{asset_id}.png')
  manifest['clips'].append({'asset':asset_id,'clip':clip_name,'fps':100,'first_frame':1,'last_frame':scene.frame_end,'duration_seconds':(scene.frame_end-1)/100,'runtime':stats,'source':str(source.relative_to(ROOT))})
  for path in [source,OUT/f'{asset_id}.glb',OUT/f'{asset_id}.png']:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
if not args.check and not args.preview:
 (OUT/'ian-mage.json').write_text(json.dumps(manifest,indent=2)+'\n')
 coords=[[[round((p['socket'][0]-192)/384*manifest['frame']['display_scale'],7),round((p['socket'][1]-330)/384*manifest['frame']['display_scale'],7)] for p in d['poses']] for d in manifest['directions']['cast']]
 (ROOT/'src/games/defense/mageSockets.ts').write_text('// Generated by tools/blender/build_mage.py from the actual staff-tip socket.\nexport const MAGE_SOCKETS = '+json.dumps(coords)+' as const;\n')
print('MAGE_CHECK_PASS' if args.check or args.preview else 'MAGE_BAKE_PASS',flush=True)
