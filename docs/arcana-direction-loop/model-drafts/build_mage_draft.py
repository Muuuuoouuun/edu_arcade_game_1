"""Author the editable fire mage Ian (이안) and bake four shared-camera action sprites.

DRAFT from the 3-hour direction loop (cycle 46). Copy to tools/blender/build_mage.py to use.
Run: blender -b --python tools/blender/build_mage.py
Options after --: --samples 128 --size 640 --only idle|windup|strike|recover --skip-render --out DIR
Same contract as build_dwarf.py: 640px frame, orthographic camera at (7,10,7) looking at (0,0,1.7),
ortho scale 5.8, ground origin projected to (320,550), native facing screen-right, no per-pose crop.
Faithful port of the painted Ian (ranged-motion.webp, atlas.png cell 0): navy robe with gold hem,
wide-brimmed star hat whose tip droops back, pale blond hair, cream under-robe, brown boots,
wooden claw staff. One change by the port rule (cycle 19, handoff "먼저 할 다섯 개" 1):
the staff crystal is warm fire orange instead of blue, matching his fire attack.
All forms are Blender geometry without image inputs.
Writes mage-<pose>.png and mage-model.json (frame/ground/nativeFacing like dwarf-model.json, plus
crystal_center_px per pose: the staff crystal in frame pixels, usable as the spell windup/launch point).
Pivots: body, head, hat (secondary lag), staff-arm, staff, free-arm, cape. Legs and root never move.
Cycle 46 bake (Blender 5.2, 128 samples): 107 mesh objects, 20,919 triangles, WebP q88 19.5~21.4 KB per pose.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector, Euler

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser()
p.add_argument('--samples',type=int,default=128)
p.add_argument('--size',type=int,default=640)
p.add_argument('--only',choices=['idle','windup','strike','recover'])
p.add_argument('--skip-render',action='store_true')
p.add_argument('--out',default=str(ROOT/'public/defense/models'))
p.add_argument('--blend',default=str(ROOT/'art-source/defense/mage.blend'))
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(opts.out);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Fire mage Ian / editable parts');bpy.context.scene.collection.children.link(COL)
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
 'robe':material('Cloth / deep navy robe',(.007,.009,.075),0,.82),
 'robelight':material('Cloth / lit navy folds',(.011,.016,.11),0,.8),
 'lining':material('Cloth / dark cape lining',(.012,.016,.08),0,.86),
 'gold':material('Trim / embroidered gold',(.82,.52,.13),.6,.36),
 'goldlight':material('Trim / polished gold star',(.95,.72,.25),.65,.3),
 'cream':material('Cloth / cream under-robe',(.80,.70,.50),0,.75),
 'trouser':material('Cloth / dark trousers',(.012,.016,.06),0,.85),
 'boot':material('Leather / brown boots',(.24,.10,.035),0,.7),
 'bootlight':material('Leather / folded boot cuff',(.38,.18,.06),0,.66),
 'sole':material('Leather / dark sole',(.04,.025,.018),0,.85),
 'belt':material('Leather / belt and pouch',(.20,.085,.03),0,.72),
 'skin':material('Skin / fair warm',(.86,.55,.38),0,.62),
 'blush':material('Skin / cheek blush',(.90,.42,.30),0,.6),
 'hair':material('Hair / pale blond',(.78,.56,.24),0,.7),
 'hairlight':material('Hair / sunlit strands',(.92,.74,.40),0,.66),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / blue iris',(.06,.22,.62),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.03),0,.3),
 'wood':material('Staff / dark polished wood',(.22,.09,.03),0,.55),
 'woodlight':material('Staff / wood grain ridges',(.36,.17,.06),0,.55),
 'crystal':material('Crystal / warm fire facets',(.95,.16,.0),0,.15,1.4),
 'core':material('Crystal / bright ember core',(1.0,.55,.08),0,.1,3.5),
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
  mod=o.modifiers.new('Softened edges','BEVEL');mod.width=bevel;mod.segments=2
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
 return finish(o,name,mat,parent,smooth=True)

def uv(name,loc,size,mat,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent,smooth=True)

def mesh(name,verts,faces,mat,parent=None,bevel=0,smooth=False):
 d=bpy.data.meshes.new(name+' shape');d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);COL.objects.link(o)
 return finish(o,name,mat,parent,bevel,smooth)

def cyl(name,loc,radius,depth,mat,parent=None,vertices=12,bevel=.012):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
 return finish(bpy.context.object,name,mat,parent,bevel)

def rod(name,a,b,r,mat,parent=None,vertices=12):
 a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,parent,vertices)
 o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def lathe(name,rings,mat,parent=None,segments=20,skip=(),thick=0,smooth=True,wobble=None):
 """rings: [(z,radius_x,radius_y,cy[,cx])] top to bottom. skip: segment indices left open (front slit)."""
 verts=[]
 for r,ring in enumerate(rings):
  z,rx,ry,cy=ring[:4];cx=ring[4] if len(ring)>4 else 0
  for i in range(segments):
   a=2*math.pi*i/segments;dz=wobble(r,i) if wobble else 0
   verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z+dz))
 faces=[(r*segments+i,r*segments+(i+1)%segments,(r+1)*segments+(i+1)%segments,(r+1)*segments+i) for r in range(len(rings)-1) for i in range(segments) if i not in skip]
 o=mesh(name,verts,faces,mat,parent,0,smooth)
 if thick:
  s=o.modifiers.new('Cloth thickness','SOLIDIFY');s.thickness=thick
 return o

def tube(name,a,b,r1,r2,mat,parent=None,segments=14):
 a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.orthogonal().normalized();w=d.cross(u)
 verts=[];n=segments
 for c,r in ((a,r1),(b,r2)):
  for i in range(n):
   t=2*math.pi*i/n;verts.append(tuple(c+u*(r*math.cos(t))+w*(r*math.sin(t))))
 faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 o=mesh(name,verts,faces,mat,parent,0,True);s=o.modifiers.new('Cloth thickness','SOLIDIFY');s.thickness=.02;return o

def star(name,center,normal,r,mat,parent=None):
 c=Vector(center);n=Vector(normal).normalized();up=Vector((0,0,1));side=n.cross(up).normalized();up=side.cross(n).normalized()
 pts=[]
 for k in range(10):
  a=math.pi/2+k*math.pi/5;rr=r if k%2==0 else r*.45
  pts.append(c+side*(rr*math.cos(a))+up*(rr*math.sin(a)))
 back=[v-n*.03 for v in pts];verts=[tuple(v) for v in pts+back]
 faces=[tuple(range(9,-1,-1)),tuple(range(10,20))]+[(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)]
 return mesh(name,verts,faces,mat,parent)

ROOT_OBJ=group('fire-mage-ian')
ROOT_OBJ['asset']='Arcana fire mage Ian / actual articulated mesh'
ROOT_OBJ['forward']='Blender +Y; game sprite faces right'
body=group('body',(0,0,.95),ROOT_OBJ)
head=group('head',(0,.02,1.92),body)
hat=group('hat',(0,.02,2.72),head)
staff_arm=group('staff-arm',(-.46,.02,1.74),body)
staff=group('staff',(-.66,.40,1.30),staff_arm)
free_arm=group('free-arm',(.46,.02,1.74),body)
cape=group('cape',(0,-.26,1.84),body)

# Boots and trousers stay grounded in every pose.
for side,x in [('right',-.27),('left',.27)]:
 cube(f'{side} boot / sole',(x,.08,.05),(.36,.56,.10),'sole',ROOT_OBJ,.04)
 ico(f'{side} boot / leather foot',(x,.12,.19),(.19,.30,.17),'boot',ROOT_OBJ)
 cyl(f'{side} boot / shaft',(x,0,.36),.17,.34,'boot',ROOT_OBJ,14)
 cyl(f'{side} boot / folded cuff',(x,0,.55),.20,.10,'bootlight',ROOT_OBJ,14)
 rod(f'{side} leg / trouser',(x,0,.56),(x*.8,0,.98),.15,'trouser',ROOT_OBJ,12)

# Robe skirt: flared navy cone, open at the front over the cream under-robe; jagged gold hem.
hem=lambda r,i:(.07 if i%2 else -.03) if r==3 else 0
skirt_skip=(4,5)
lathe('Robe / flared skirt',[(1.32,.40,.32,0),(1.0,.52,.42,0),(.72,.68,.54,-.02),(.46,.84,.66,-.05)],'robe',body,20,skirt_skip,.035,True,hem)
hem_pts=[]
for i in range(21):
 a=2*math.pi*i/20;hem_pts.append(Vector((.86*math.cos(a),-.05+.68*math.sin(a),.46+hem(3,i%20))))
for i in range(20):
 if i in skirt_skip:continue
 rod('Robe / gold hem trim',hem_pts[i],hem_pts[i+1],.035,'gold',body,8)
for side in (-1,1):
 a=2*math.pi*(4 if side>0 else 6)/20
 rod('Robe / gold front edge',(.40*math.cos(a)*1.02,.32*math.sin(a)*1.02,1.32),(.86*math.cos(a),-.05+.68*math.sin(a),.46),.035,'gold',body,8)
mesh('Under-robe / cream front panel',[(-.16,.36,1.20),(.16,.36,1.20),(.24,.58,.56),(0,.63,.50),(-.24,.58,.56)],[(0,1,2,3,4)],'cream',body)
# Torso and shoulder mantle.
ico('Torso / navy tunic',(0,0,1.50),(.44,.34,.40),'robelight',body)
cube('Belt / brown leather',(0,0,1.24),(.86,.70,.13),'belt',body,.05)
cube('Belt / gold buckle',(0,.36,1.24),(.18,.06,.16),'gold',body,.02)
cube('Belt / side pouch',(.36,.22,1.10),(.18,.16,.20),'belt',body,.05)
ico('Mantle / shoulder cowl',(0,-.02,1.78),(.56,.44,.20),'robe',body)
for side in (-1,1):rod('Mantle / gold edge',(0,.40,1.70),(side*.52,.16,1.70),.03,'gold',body,8)
ico('Collar / cream shirt',(0,.20,1.86),(.20,.16,.10),'cream',body)
# Back cape hangs from the cowl; it flares back on the strike.
cv=[]
for z,w,y in [(1.82,.50,-.30),(1.30,.68,-.46),(.62,.86,-.60)]:
 for i in range(7):
  x=(i/6-.5)*w*2;cv.append((x,y+(.04 if i%2 else -.05),z))
cf=[(r*7+c,r*7+c+1,(r+1)*7+c+1,(r+1)*7+c) for r in range(2) for c in range(6)]
cp=mesh('Cape / navy back cape',cv,cf,'robe',cape)
cp.data.materials.append(M['lining'])
for face in cp.data.polygons:face.material_index=face.index%2
s=cp.modifiers.new('Cloth thickness','SOLIDIFY');s.thickness=.03
for i in range(6):rod('Cape / gold hem',cv[14+i],cv[15+i],.03,'gold',cape,8)

# Arms: wide bell sleeves with gold cuffs. Staff arm on the far side (screen-right, forward).
for name,x,par,hand in [('Staff',-.46,staff_arm,(-.66,.40,1.30)),('Free',.46,free_arm,(.62,.24,1.26))]:
 sh=Vector((x,.02,1.74));hv=Vector(hand);mid=sh.lerp(hv,.45);d=(hv-sh).normalized()
 rod(name+' sleeve / upper',sh,mid,.12,'robe',par,12)
 tube(name+' sleeve / bell cuff',mid-d*.05,hv-d*.06,.13,.22,'robelight',par)
 tube(name+' sleeve / gold cuff ring',hv-d*.09,hv-d*.04,.225,.225,'gold',par)
 ico(name+' hand / skin',hv,(.11,.11,.12),'skin',par)
for k in range(3):rod('Free hand / open finger',(.66,.30,1.26),(.70+.03*k,.40,1.30-.05*k),.03,'skin',free_arm,6)

# Head: large chibi face under the hat brim.
uv('Face / round head',(0,.04,2.30),(.44,.40,.42),'skin',head)
for side in (-1,1):
 uv('Face / ear',(side*.43,.02,2.28),(.07,.06,.10),'skin',head)
 uv('Face / eye white',(side*.16,.40,2.28),(.10,.04,.12),'eyewhite',head)
 uv('Face / blue iris',(side*.15,.43,2.27),(.07,.025,.09),'iris',head)
 uv('Face / pupil',(side*.15,.448,2.27),(.035,.012,.05),'pupil',head)
 uv('Face / eye shine',(side*.13,.455,2.31),(.02,.01,.02),'eyewhite',head)
 uv('Face / cheek blush',(side*.26,.36,2.17),(.07,.03,.04),'blush',head)
 rod('Face / brow',(side*.08,.42,2.43),(side*.24,.40,2.42),.018,'hair',head,6)
uv('Face / small mouth',(0,.42,2.10),(.05,.02,.025),'blush',head)
# Hair: tufted pale blond fringe and side locks under the brim.
for x,y,z,sx,sz,m in [(-.30,.26,2.50,.16,.16,'hair'),(-.12,.34,2.55,.15,.14,'hairlight'),(.06,.36,2.54,.15,.15,'hair'),(.24,.30,2.52,.15,.15,'hairlight'),(.38,.12,2.40,.12,.22,'hair'),(-.40,.12,2.40,.12,.22,'hair'),(0,-.20,2.42,.42,.24,'hair')]:
 ico('Hair / tuft',(x,y,z),(sx,.13 if y>0 else .3,sz),m,head,2)
for x,z,dx in [(-.20,2.45,-.04),(0,2.45,.03),(.18,2.46,.05)]:
 rod('Hair / fringe spike',(x,.40,2.56),(x+dx,.47,z-.10),.04,'hairlight',head,6)

# Hat: wide brim, gold band with stars, tall cone whose tip droops back.
cyl('Hat / wide brim',(0,.04,2.72),.86,.06,'robe',hat,32,.02)
cyl('Hat / brim gold edge',(0,.04,2.72),.88,.035,'gold',hat,32,0)
cyl('Hat / gold band',(0,.0,2.82),.47,.14,'gold',hat,24,.01)
rings=[]
for k in range(11):
 t=k/10;z=2.78+t*1.02;r=.46*(1-t)**1.05+.015
 back=-.62*t**2.4;side=.42*t**2.6
 rings.append((z-(.42*t**3.2),r,r*.95,back,side))
cone=lathe('Hat / tall drooping cone',rings,'robelight',hat,20,(),0,True)
star('Hat / gold star front',(0,.47,2.84),(0,1,0),.10,'goldlight',hat)
star('Hat / gold star side',(.36,.32,2.84),(.7,.7,0),.08,'goldlight',hat)
star('Hat / gold star cone',(.22,.10,3.18),(.8,.55,.2),.07,'goldlight',hat)
uv('Hat / tip bead',(rings[-1][4],rings[-1][3],rings[-1][0]),(.055,.055,.055),'gold',hat)

# Claw staff with the warm crystal. Built upright in the hand, crystal at the top.
sx,sy=-.66,.40
rod('Staff / wooden shaft',(sx,sy,.12),(sx,sy,2.27),.072,'wood',staff,10)
for z in (.80,1.60,2.00):cyl('Staff / grain ring',(sx,sy,z),.085,.05,'woodlight',staff,10)
cyl('Staff / gold collar',(sx,sy,2.25),.10,.10,'gold',staff,12)
for k in range(4):
 a=k*math.pi/2+math.pi/4
 base=Vector((sx,sy,2.27));mid=base+Vector((.22*math.cos(a),.22*math.sin(a),.24));tip=base+Vector((.09*math.cos(a),.09*math.sin(a),.58))
 rod('Staff / claw prong',base,mid,.045,'woodlight',staff,8);rod('Staff / claw tip',mid,tip,.035,'gold',staff,8)
crys=ico('Crystal / warm fire crystal',(sx,sy,2.65),(.19,.19,.34),'crystal',staff,0)
for poly in crys.data.polygons:poly.use_smooth=False
ico('Crystal / ember core',(sx,sy,2.63),(.09,.09,.17),'core',staff,1)
TIP=(sx,sy,2.99)

# Poses: (x,y,z) euler radians per pivot. Legs and root never move; the shared camera never moves.
POSES={
 'idle':   {'frame':1, 'body':(0,0,0),       'head':(0,0,0),      'hat':(0,0,0),      'staff-arm':(0,0,0),         'staff':(0,0,0),       'free-arm':(0,0,0),        'cape':(0,0,0)},
 'windup': {'frame':5, 'body':(.07,0,-.10),  'head':(.06,0,0),    'hat':(-.07,0,0),   'staff-arm':(1.15,0,.45),    'staff':(-1.25,0,0),    'free-arm':(.55,-.70,0),   'cape':(.08,0,0)},
 'strike': {'frame':9, 'body':(-.10,0,.16),  'head':(-.04,0,.14), 'hat':(.14,0,0),    'staff-arm':(.62,0,.85),     'staff':(-1.90,0,0),   'free-arm':(-.55,-.35,0),  'cape':(-.38,0,0)},
 'recover':{'frame':13,'body':(-.03,0,.06),  'head':(-.02,0,.05), 'hat':(-.04,0,0),   'staff-arm':(.40,0,.35),     'staff':(-.45,0,0),    'free-arm':(.35,-.45,0),   'cape':(-.12,0,0)},
}
PIVOTS={'body':body,'head':head,'hat':hat,'staff-arm':staff_arm,'staff':staff,'free-arm':free_arm,'cape':cape}
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=17
for pose in list(POSES.values())+[dict(POSES['idle'],frame=17)]:
 for key,obj in PIVOTS.items():
  obj.rotation_euler=Euler(pose[key],'XYZ');obj.keyframe_insert(data_path='rotation_euler',frame=pose['frame'])
for obj in PIVOTS.values():
 for curve in obj.animation_data.action.fcurves if hasattr(obj.animation_data.action,'fcurves') else []:
  for k in curve.keyframe_points:k.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()

# Same studio as build_dwarf.py.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Mage shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.8
camera.location=(7,10,7);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y+=(ground.y-(1-550/640));bpy.context.view_layer.update()
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm large key',(-4,6,8),850,4,(1,.83,.65))
area('Cool soft armor fill',(5,3,5),600,4,(.65,.83,1))
area('Warm edge light',(1,-5,7),1000,3,(1,.80,.52))

scene.frame_set(1);bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
manifest={'id':'fire-mage-ian','generator':'model-drafts/build_mage_draft.py (cycle 46)','blender':bpy.app.version_string,'nativeFacing':1,
 'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,3),round((1-ground.y)*opts.size,3)],'orthographic_scale':cam_data.ortho_scale},
 'pivot_names':list(PIVOTS),'poses':[]}
for name,pose in POSES.items():
 if opts.only and name!=opts.only:continue
 scene.frame_set(pose['frame']);bpy.context.view_layer.update()
 graph=bpy.context.evaluated_depsgraph_get();pixels=[]
 for o in COL.objects:
  if o.type!='MESH':continue
  ev=o.evaluated_get(graph)
  for corner in ev.bound_box:
   v=world_to_camera_view(scene,camera,ev.matrix_world@Vector(corner));pixels.append((v.x*opts.size,(1-v.y)*opts.size))
 crystal=[o for o in COL.objects if o.name=='Crystal / ember core'][0]
 cc=world_to_camera_view(scene,camera,sum((crystal.evaluated_get(graph).matrix_world@Vector(c) for c in crystal.bound_box),Vector())/8)
 manifest['poses'].append({'name':name,'file':f'mage-{name}.png','frame':pose['frame'],
  'projected_mesh_bbox':[round(min(v[0] for v in pixels),1),round(min(v[1] for v in pixels),1),round(max(v[0] for v in pixels),1),round(max(v[1] for v in pixels),1)],
  'crystal_center_px':[round(cc.x*opts.size,1),round((1-cc.y)*opts.size,1)]})
 if not opts.skip_render:
  scene.render.filepath=str(OUT/f'mage-{name}.png');bpy.ops.render.render(write_still=True)
scene.frame_set(1);bpy.context.view_layer.update()
(OUT/'mage-model.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if opts.blend:
 Path(opts.blend).parent.mkdir(parents=True,exist_ok=True)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=opts.blend)
print('ARCANA_MAGE_COMPLETE '+json.dumps(manifest,ensure_ascii=False))
