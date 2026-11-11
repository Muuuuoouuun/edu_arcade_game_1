"""Build the animated Legion shield soldier and its shared-camera battle atlas.

Derived from direction-loop cycle 92, now with articulated torso/shield/spear
and three contact/recovery/idle poses. Run:
  blender -b --python tools/blender/build_legion_shield.py
The production atlas uses fixed 384px cells and the 640px reference camera
contract scaled to ground (192,330). No unit creates a WebGL renderer in battle.
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector, Quaternion
p=argparse.ArgumentParser()
p.add_argument('--samples',type=int,default=32)
p.add_argument('--size',type=int,choices=[384],default=384)
p.add_argument('--out',default=str(Path(__file__).resolve().parents[2]/'art-source/defense/legion-shield-frames'))
p.add_argument('--scale',type=float,choices=[1.0],default=1.0)
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(opts.out);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Legion shield soldier / editable parts');bpy.context.scene.collection.children.link(COL)
STUDIO=bpy.data.collections.new('Studio / fixed sprite camera');bpy.context.scene.collection.children.link(STUDIO)
ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
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


def plate(name,center,right,up,w,h,mat,parent=None,thick=.02):
 c,r,u=Vector(center),Vector(right).normalized(),Vector(up).normalized();n=r.cross(u)
 pts=[c-r*w/2-u*h/2,c+r*w/2-u*h/2,c+r*w/2+u*h/2,c-r*w/2+u*h/2]
 verts=[tuple(v) for v in pts]+[tuple(v-n*thick) for v in pts]
 faces=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
 return mesh(name,verts,faces,mat,parent)

# ---------------- detail helpers (shared with build_tao_draft.py / build_druid_draft.py) ----------------
CAM=Vector((7,10,0)).normalized()
def spline(points,n=6):
 """Catmull-Rom curve through the points."""
 P=[Vector(p) for p in points];P=[P[0]]+P+[P[-1]];out=[]
 for i in range(1,len(P)-2):
  for k in range(n):
   t=k/n;t2=t*t;t3=t2*t
   out.append(.5*((2*P[i])+(P[i+1]-P[i-1])*t+(2*P[i-1]-5*P[i]+4*P[i+1]-P[i+2])*t2+(3*P[i]-P[i-1]-3*P[i+1]+P[i+2])*t3))
 out.append(P[-2]);return out
def lock(name,points,r0,r1,mat,parent=None,flat=1.0,seg=8,n=6):
 """Tapered tube along a curve: hair lock, ribbon (flat < 1 faces the camera), tassel strand, trim line."""
 pts=spline(points,n);m=len(pts);verts=[]
 for i,p in enumerate(pts):
  r=r0+(r1-r0)*i/(m-1);d=(pts[min(i+1,m-1)]-pts[max(i-1,0)]).normalized();u=d.cross(CAM)
  u=u.normalized() if u.length>1e-4 else d.orthogonal().normalized();w=d.cross(u).normalized()
  for k in range(seg):
   a=2*math.pi*k/seg;verts.append(tuple(p+u*(r*math.cos(a))+w*(r*flat*math.sin(a))))
 faces=[(i*seg+k,i*seg+(k+1)%seg,(i+1)*seg+(k+1)%seg,(i+1)*seg+k) for i in range(m-1) for k in range(seg)]
 faces+=[tuple(range(seg-1,-1,-1)),tuple(range((m-1)*seg,m*seg))]
 return mesh(name,verts,faces,mat,parent,0,True)
def leaf(name,base,tip,width,mat,parent=None,rib='goldlight',normal=None):
 """Pointed leaf from base to tip, widest near the middle, facing `normal` (default: the camera); optional midrib."""
 b,t=Vector(base),Vector(tip);d=t-b;n=Vector(normal).normalized() if normal is not None else CAM
 s=d.cross(n);s=s.normalized() if s.length>1e-5 else d.orthogonal().normalized()
 pts=[b,b+d*.25+s*width*.42,b+d*.5+s*width*.5,b+d*.78+s*width*.3,t,b+d*.78-s*width*.3,b+d*.5-s*width*.5,b+d*.25-s*width*.42]
 o=mesh(name,[tuple(p) for p in pts],[tuple(range(8))],mat,parent,0,False);o.modifiers.new('Leaf thickness','SOLIDIFY').thickness=.016
 if rib:lock(name+' / midrib',[b+n*.014,b+d*.5+n*.02,t+n*.014],.008,.004,rib,parent,1,5,3)
 return o
def wavy(start,end,sway,amp,waves,n=7):
 """Points from start to end that sway sideways more toward the tip (wavy hair, vines)."""
 a,b=Vector(start),Vector(end);return [a.lerp(b,i/n)+sway*(amp*math.sin(i/n*waves*math.pi)*(i/n)**.6) for i in range(n+1)]

TEAL=(.012,.16,.19)
M={
 'teal':material('Cloth / teal tunic',TEAL,0,.8),
 'teallight':material('Cloth / lit teal and shield face',(.02,.27,.31),0,.7),
 'steel':material('Armor / dark steel',(.085,.11,.12),.7,.45),
 'steellight':material('Armor / lit steel',(.36,.42,.42),.75,.35),
 'ivory':material('Cloth / ivory tabard',(.62,.57,.44),0,.8),
 'gold':material('Trim / gold',(.82,.52,.13),.6,.36),
 'goldlight':material('Trim / bright gold',(.95,.70,.25),.5,.3,.12),
 'leather':material('Leather / belt and boots',(.16,.075,.03),0,.72),
 'wood':material('Spear / shaft',(.30,.16,.06),0,.6),
 'skin':material('Skin / warm',(.84,.55,.39),0,.62),
 'skinshade':material('Skin / shade',(.70,.40,.28),0,.62),
 'mouth':material('Face / mouth line',(.35,.08,.06),0,.6),
 'lid':material('Face / brow and lid',(.10,.05,.03),0,.6),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'red':material('Cloth / vermilion scarf',(.62,.10,.035),0,.7),
}
D=Vector((-.82,.57,0)).normalized();Z=Vector((0,0,1));SIDE=D.cross(Z).normalized()
SF=Vector((-.44,.04,1.70));SN=Vector((.44,.04,1.70))      # front (screen-right, shield) / back (spear) shoulder
# Neutral geometry; the keyframed shoulder pivots produce the hit poses.
HS=SF+D*.30+Z*-.42;shield_c=HS+D*.12+CAM*.10+Z*-.05;shield_n=(D*.30+CAM*.95).normalized();lean=0;HP=Vector((.62,.16,1.40));spear_tilt=.03

ROOT_OBJ=group('legion-shield-soldier')
ROOT_OBJ['asset']='Arcana legion shield soldier / draft (cycle 92)'
# Boots, shin guards and legs stay grounded.
for side,x in [('right',-.24),('left',.24)]:
 cube(f'{side} boot / sole',(x,.06,.05),(.32,.52,.10),'steel',ROOT_OBJ,.04)
 ico(f'{side} boot / foot',(x,.11,.18),(.17,.28,.15),'leather',ROOT_OBJ)
 cyl(f'{side} leg / shin guard',(x,0,.42),.17,.46,'steel',ROOT_OBJ,14)
 cyl(f'{side} leg / gold knee rim',(x,0,.66),.18,.05,'gold',ROOT_OBJ,14,0)
 rod(f'{side} leg / thigh',(x,0,.66),(x*.8,0,1.0),.15,'steel',ROOT_OBJ,12)
# Tunic skirt with a gold hem, belt, torso with an ivory tabard.
lathe('Tunic / teal skirt',[(1.26,.40,.32,0),(1.02,.50,.40,0),(.80,.60,.47,-.02)],'teal',ROOT_OBJ,24,(),.03)
lock('Tunic / gold hem',[Vector((.61*math.cos(2*math.pi*i/28),-.02+.48*math.sin(2*math.pi*i/28),.80)) for i in range(29)],.026,.026,'gold',ROOT_OBJ,1,6,1)
body_c=Vector((0,0,1.50))+D*(lean*.6)
ico('Torso / teal tunic',body_c,(.42,.32,.40),'teal',ROOT_OBJ)
mesh('Tabard / ivory front',[tuple(body_c+Vector((-.17,.315,.24))),tuple(body_c+Vector((.17,.315,.24))),tuple(Vector((.22,.47,.86))),tuple(Vector((0,.50,.78))),tuple(Vector((-.22,.47,.86)))],[(0,1,2,3,4)],'ivory',ROOT_OBJ).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.025
cube('Belt / leather',(0,0,1.22),(.84,.68,.11),'leather',ROOT_OBJ,.04);cube('Belt / gold buckle',(0,.35,1.22),(.16,.05,.13),'goldlight',ROOT_OBJ,.02)
neck=body_c+Vector((0,.0,.36))
uv('Scarf / vermilion wrap',neck,(.30,.26,.12),'red',ROOT_OBJ)
lock('Scarf / vermilion tail',[neck+Vector((.10,-.24,0)),neck+Vector((.16,-.36,-.22)),neck+Vector((.12,-.40,-.52))-D*lean],.07,.04,'red',ROOT_OBJ,.35,8,4)
for nm,sh in (('shield',SF),('spear',SN)):
 uv(f'Pauldron / {nm} steel',sh+D*(lean*.6)+Z*.06,(.19,.18,.14),'steel',ROOT_OBJ)
 lock(f'Pauldron / {nm} gold rim',[sh+D*(lean*.6)+Vector((.19*math.cos(t),.18*math.sin(t),.0)) for t in [2*math.pi*i/14 for i in range(15)]],.014,.014,'gold',ROOT_OBJ,1,5,1)
# Head: simple face, steel helmet with a brim, nose guard and gold crest.
HC=Vector((0,.05,2.26))+D*lean
uv('Face / round head',HC,(.40,.36,.38),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',HC+Vector((side*.15,.335,-.02)),(.085,.04,.095),'eyewhite',ROOT_OBJ)
 uv('Face / pupil',HC+Vector((side*.14,.37,-.03)),(.045,.02,.06),'pupil',ROOT_OBJ)
 lock('Face / brow',[HC+Vector((side*.25,.29,.12)),HC+Vector((side*.15,.35,.15)),HC+Vector((side*.06,.36,.12))],.018,.012,'lid',ROOT_OBJ,.7,6,4)
 uv('Face / cheek guard',HC+Vector((side*.36,.10,-.06)),(.07,.16,.20),'steel',ROOT_OBJ)
uv('Face / nose',HC+Vector((0,.385,-.08)),(.026,.02,.024),'skinshade',ROOT_OBJ)
lock('Face / mouth',[HC+Vector((-.05,.365,-.17)),HC+Vector((0,.378,-.185)),HC+Vector((.05,.365,-.17))],.01,.01,'mouth',ROOT_OBJ,1,6,3)
uv('Helmet / steel dome',HC+Vector((0,-.03,.17)),(.45,.43,.33),'steel',ROOT_OBJ)
lock('Helmet / lit brim',[HC+Vector((.455*math.cos(t),-.03+.435*math.sin(t),.10)) for t in [2*math.pi*i/24 for i in range(25)]],.035,.035,'steellight',ROOT_OBJ,1,6,1)
cube('Helmet / nose guard',HC+Vector((0,.385,.02)),(.05,.04,.22),'steellight',ROOT_OBJ,.01)
lock('Helmet / gold crest',[HC+Vector((0,.40,.24)),HC+Vector((0,.20,.47)),HC+Vector((0,-.10,.52)),HC+Vector((0,-.38,.36))],.05,.04,'goldlight',ROOT_OBJ,.6,8,4)
# Arms: steel vambrace, hands with fingers.
for nm,sh0,hand in (('Shield',SF,HS),('Spear',SN,HP)):
 sh=sh0+D*(lean*.6);mid=sh.lerp(hand,.5);ax=(hand-sh).normalized()
 rod(nm+' arm / teal sleeve',sh,mid,.11,'teal',ROOT_OBJ,12);rod(nm+' arm / steel vambrace',mid,hand-ax*.04,.10,'steel',ROOT_OBJ,12)
 cyl(nm+' arm / gold cuff',mid,.115,.04,'gold',ROOT_OBJ,12,0).rotation_euler=ax.to_track_quat('Z','Y').to_euler()
 uv(nm+' hand / palm',hand,(.085,.08,.09),'skin',ROOT_OBJ)
# Kite shield: teal face, gold rim and cross, steel boss. The largest prop (about 40% of the body height).
n=shield_n;u=Z.cross(n).normalized();v=n.cross(u).normalized()      # u: shield right, v: shield up
KITE=[(-.40,.48),(0,.60),(.40,.48),(.44,.10),(.26,-.42),(0,-.72),(-.26,-.42),(-.44,.10)]
SP=lambda a,b,off=0:shield_c+u*a+v*b+n*off
mesh('Shield / teal kite face',[tuple(SP(a,b)) for a,b in KITE],[tuple(range(len(KITE)))],'teallight',ROOT_OBJ).modifiers.new('Shield thickness','SOLIDIFY').thickness=.07
lock('Shield / gold rim',[SP(a,b,.05) for a,b in KITE+KITE[:1]],.075,.075,'gold',ROOT_OBJ,1,6,2)
lock('Shield / gold cross upright',[SP(0,.50,.09),SP(0,-.58,.09)],.075,.075,'goldlight',ROOT_OBJ,.5,6,2)
lock('Shield / gold cross bar',[SP(-.36,.12,.09),SP(.36,.12,.09)],.075,.075,'goldlight',ROOT_OBJ,.5,6,2)
uv('Shield / steel boss',SP(0,.12,.11),(.10,.10,.10),'steellight',ROOT_OBJ)
# Spear: shaft through the back hand, leaf blade above the head, a small vermilion pennant.
sd=(Z+D*spear_tilt).normalized();s0=HP-sd*1.30;s1=HP+sd*1.02   # short spear: the legion renderer scales a sprite by its longest side, so a tall prop shrinks the body
rod('Spear / wooden shaft',s0,s1,.04,'wood',ROOT_OBJ,10)
cyl('Spear / gold collar',s1,.055,.08,'gold',ROOT_OBJ,10,0).rotation_euler=sd.to_track_quat('Z','Y').to_euler()
leaf('Spear / steel blade',s1,s1+sd*.42,.24,'steellight',ROOT_OBJ,None)
mesh('Spear / vermilion pennant',[tuple(s1-sd*.06),tuple(s1-sd*.06-D*.34+Z*.02),tuple(s1-sd*.30)],[(0,1,2)],'red',ROOT_OBJ).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.015
for k,dz in enumerate((.05,.015,-.02,-.055)):uv(f'Spear hand / curled finger {k}',HP+CAM*.07+sd*dz,(.033,.031,.021),'skin',ROOT_OBJ)
scene=bpy.context.scene
# Same studio as build_dwarf.py.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Legion shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.8
camera.location=(7,10,7);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y+=(ground.y-(1-550/640));bpy.context.view_layer.update()
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm large key',(-4,6,8),850,4,(1,.83,.65))
area('Cool soft armor fill',(5,3,5),600,4,(.65,.83,1))
area('Warm edge light',(1,-5,7),1000,3,(1,.80,.52))
ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'public/defense/models';PUBLIC.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'art-source/defense';SOURCE.mkdir(parents=True,exist_ok=True)
ROOT_OBJ.scale=(opts.scale,)*3
bpy.context.view_layer.update()

def move_parent(obj,parent):
 matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix

# One articulated hierarchy: torso turns above planted legs; shield and spear
# pivots carry the visible hands, tools and forearms together from the shoulder.
parts=[o for o in COL.objects if o.type=='MESH']
body=group('legion-body-pivot',(0,0,.82),ROOT_OBJ)
for obj in parts:
 if not obj.name.startswith(('right boot','left boot','right leg','left leg')):move_parent(obj,body)
shield=group('legion-shield-shoulder',SF,body)
spear=group('legion-spear-shoulder',SN,body)
for obj in parts:
 if obj.name.startswith(('Shield arm','Shield hand','Shield /')):move_parent(obj,shield)
 elif obj.name.startswith(('Spear arm','Spear hand','Spear /')):move_parent(obj,spear)

# The damage engine has no windup: frame 1 is the contact pose at effect age 0.
# The following frames recoil and settle; feet never leave their original position.
scene.render.fps=30;scene.frame_start=1;scene.frame_end=10
for obj in (body,shield,spear):obj.rotation_mode='QUATERNION'
for frame,bend,block,draw in ((1,.12,.86,-.16),(4,.05,.42,-.08),(10,0,0,0)):
 body.rotation_quaternion=Quaternion(SIDE,bend)
 shield.rotation_quaternion=Quaternion(SIDE,block)
 spear.rotation_quaternion=Quaternion(SIDE,draw)
 for obj in (body,shield,spear):obj.keyframe_insert(data_path='rotation_quaternion',frame=frame)
for obj in (body,shield,spear):
 obj.animation_data.action.name='Legion shield bash / '+obj.name
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'

# Crop once across all poses. Project evaluated geometry, including bevels, to
# retain the same scale and exact foot ground anchor in the packed atlas.
bounds=[];pixels=[]
for name,frame in [('idle',10),('strike',1),('recoil',4)]:
 scene.frame_set(frame);bpy.context.view_layer.update()
 dep=bpy.context.evaluated_depsgraph_get();points=[];minimum=100
 for obj in parts:
  evaluated=obj.evaluated_get(dep);mesh_eval=evaluated.to_mesh()
  for vertex in mesh_eval.vertices:
   world=evaluated.matrix_world@vertex.co
   minimum=min(minimum,world.z)
   pt=world_to_camera_view(scene,camera,world)
   points.append((pt.x*opts.size,(1-pt.y)*opts.size))
  evaluated.to_mesh_clear()
 assert minimum>=-.002,(name,'model below ground',minimum)
 bbox=[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
 assert bbox[0]>1 and bbox[1]>1 and bbox[2]<opts.size-1 and bbox[3]<opts.size-1,(name,bbox)
 bounds.append({'pose':name,'frame':frame,'bbox':[round(v,2) for v in bbox],'ground_z_min':round(minimum,5)})
 pixels.extend(points)
 scene.render.filepath=str(OUT/f'legion-shield-{name}.png');bpy.ops.render.render(write_still=True)

crop=[max(0,math.floor(min(x for x,y in pixels))-3),max(0,math.floor(min(y for x,y in pixels))-3),0,0]
right=min(opts.size,math.ceil(max(x for x,y in pixels))+3);bottom=min(opts.size,math.ceil(max(y for x,y in pixels))+3)
crop[2]=right-crop[0];crop[3]=bottom-crop[1]
# Body span is measured from soles to the upper helmet, without letting the
# upright spear reduce the body scale on the 22px-wide mobile battlefield.
scene.frame_set(10);bpy.context.view_layer.update()
base=world_to_camera_view(scene,camera,Vector((0,0,0)))
top=world_to_camera_view(scene,camera,Vector((0,0,2.90))*opts.scale)
body_span=abs(top.y-base.y)*opts.size
assert body_span>0 and abs((1-base.y)*opts.size-550*opts.size/640)<.1
atlas=PUBLIC/'legion-shield-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*[v for n in ('idle','strike','recoil') for v in ('-i',str(OUT/f'legion-shield-{n}.png'))],'-filter_complex','hstack=inputs=3','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
shutil.copyfile(OUT/'legion-shield-idle.png',PUBLIC/'legion-shield.png')

# Export real articulated animation for the shared model lab, not a flat image.
scene.frame_set(10);bpy.ops.object.select_all(action='DESELECT')
for obj in COL.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=ROOT_OBJ
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'legion-shield.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='legion-shield-bash',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'legion-shield.blend'))
scene.frame_set(10);bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();tris=0
for obj in parts:
 me=obj.evaluated_get(dep).to_mesh();me.calc_loop_triangles();tris+=len(me.loop_triangles);obj.evaluated_get(dep).to_mesh_clear()
files=[atlas,PUBLIC/'legion-shield.png',PUBLIC/'legion-shield.glb']
manifest={'id':'legion-shield','kind':'articulated 3D model and baked 2.5D atlas','source':'art-source/defense/legion-shield.blend','generator':'tools/blender/build_legion_shield.py','reference':'art-source/defense/concepts/2026-10-29/heroes/spear-guardian.png; direction loop cycle 92 shield draft','provenance':'Derived from origin/claude/wizardly-shannon-zqnwg0 cycle 92 draft, revised into animated model and production bake','blender':bpy.app.version_string,'frame':{'width':opts.size,'height':opts.size,'ground':[round(base.x*opts.size,2),round((1-base.y)*opts.size,2)],'crop':crop,'body_span':round(body_span,2),'display_scale':round(max(crop[2:])/body_span*1.22,6)},'atlas':{'file':atlas.name,'frames':['idle','strike','recoil'],'width':opts.size*3,'height':opts.size},'animation':{'clip':'legion-shield-bash','fps':30,'contact_frame':1,'recoil_frame':4,'idle_frame':10,'duration_seconds':.3,'timing':'contact starts at damage event; recovery follows simulation effect age'},'render':{'engine':'Cycles CPU','samples':opts.samples,'transparent':True},'mesh_objects':len(parts),'triangles':tris,'bounds':bounds,'regeneration_command':'blender -b --python tools/blender/build_legion_shield.py','source_sha256':hashlib.sha256((SOURCE/'legion-shield.blend').read_bytes()).hexdigest(),'files':[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(PUBLIC/'legion-shield.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('ARCANA_LEGION_SHIELD_COMPLETE '+json.dumps(manifest))
