"""Author the editable beast-folk druid Luna (루나) and bake five shared-camera action sprites.

DRAFT from the 2-hour direction loop (cycle 74). Copy to tools/blender/build_druid.py to use.
Run: blender -b --python tools/blender/build_druid.py -- --pose cast
Options after --: --samples 128 --size 640 --pose idle|windup|strike|recover|cast --out DIR --scale 1.1
Same contract as build_dwarf.py / build_tao_draft.py: 640px frame, orthographic camera at (7,10,7)
looking at (0,0,1.7), ortho scale 5.8, ground origin projected to (320,550), native facing screen-right.
Reference: art-source/defense/atlases/ranged-motion.png (druid frames) — tall upright fox-wolf ears, a big mane of
ginger hair, a green cape over an ivory robe with gold trim, brown boots and a vine-wrapped staff with a glowing
green gem in a ring. Silhouette cues at 64px: (1) two upright ears (Riel's ears lie sideways, cycle 50),
(2) a wide hair mass, (3) the gem staff rising above the head. The wolf spirit stays a separate actor.
Cycle 68 contrast rule: the painted Luna sits at 64px gray 114 against the forest field 116, so the cape and mantle
are dark moss and the ivory is kept to the robe front and skirt. Cast pose (덩굴의 포효, cycle 67): staff raised
high, vines rising in a ring around the feet. Use displayScale 1.32 (cycle 62).
Cycle 74 bake: an ivory skirt kept the 64px gray at 117 (forest 116), so the skirt and sleeves are moss with an
ivory front panel (gray 90: forest 26, snow 66). The idle staff leans forward like the painted frame, which moves
the gem off the body (64px overlap Ian 0.45, Riel 0.41, Bron 0.56, Cheongun 0.30). Body scale 1.1 gives 40.0px idle
with the ears; five poses at WebP q85 = 102,044 B. The manifest's gem_px is the spell muzzle.
Cycle 83 (detail standard, cycle 80): same camera contract, pose values and body scale; six detail layers —
face (auburn brows, lids, lashes, nose, smile, blush), hands (gripping fingers on the staff, open hand with four
fingers), hair (swept fringe, curling front locks, wavy side and back locks, flower with petals and leaves, ear
inner fur and cream tufts), clothes (pleated skirt, gold hem band, ivory inner hem, leaf tabs, ivory front panel
with a gold leaf vein, laced bodice, nine-leaf mantle, zigzag-hem cape, puff sleeve with flared inner sleeve),
props (woven vine belt with leaves and an acorn charm, brooch, bracelets, knotted staff with one long vine,
woven double ring, faceted gem with a glowing core, tendrils) and materials (leaf-green cloth, bright gold).
New helpers `leaf` and `wavy`; `spline`/`lock` come from build_tao_draft.py.
Bake: 218 mesh objects / 40,862 triangles (cycle 74: 120 / 22,889). Idle 40.0px on 844x390, 64px gray 86
(forest 30, snow 70), 64px overlap Ian 0.41, Cheongun 0.33, Riel 0.39, Bron 0.58. Five poses WebP q85 126,674 B,
q80 111,892 B (cycle 74: 102,044 / 91,080) — inside the 128 KB (q80) budget.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
p=argparse.ArgumentParser()
p.add_argument('--samples',type=int,default=128)
p.add_argument('--size',type=int,default=640)
p.add_argument('--pose',choices=['idle','windup','strike','recover','cast'],default='idle')
p.add_argument('--out',default='.')
p.add_argument('--scale',type=float,default=1.1,help='whole-body scale about the ground origin (about 39px idle on an 844x390 screen)')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(opts.out);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Druid Luna / editable parts');bpy.context.scene.collection.children.link(COL)
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

# ---------------- cycle 83 detail helpers (shared with build_tao_draft.py) ----------------
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
def talisman(name,center,up,face,size,parent=None,glow=True):
 """Yellow paper charm with a vermilion border and brush strokes; `face` is the paper normal."""
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

MOSS=(.012,.035,.010)
M={
 'cape':material('Cloth / dark moss cape',MOSS,0,.84),
 'capelight':material('Cloth / lit moss folds',tuple(c*1.6 for c in MOSS),0,.82),
 'leafcloth':material('Cloth / leaf-green layers',(.03,.12,.03),0,.8),
 'ivory':material('Cloth / ivory robe',(.58,.54,.42),0,.8),
 'gold':material('Trim / thin gold',(.82,.52,.13),.6,.36),
 'goldlight':material('Trim / bright gold thread',(.95,.70,.25),.5,.3,.15),
 'boot':material('Leather / boots',(.24,.11,.04),0,.7),
 'bootlight':material('Leather / folded cuff',(.34,.17,.07),0,.7),
 'belt':material('Leather / dark straps',(.12,.06,.02),0,.75),
 'skin':material('Skin / warm',(.86,.58,.42),0,.62),
 'skinshade':material('Skin / nose shade',(.72,.42,.30),0,.62),
 'blush':material('Skin / cheek blush',(.90,.38,.30),0,.7),
 'mouth':material('Face / mouth line',(.35,.08,.06),0,.6),
 'brow':material('Face / auburn brow',(.10,.03,.01),0,.6),
 'hair':material('Hair / ginger mane',(.22,.065,.018),0,.7),
 'hairlight':material('Hair / sunlit strands',(.32,.10,.03),0,.62),
 'earin':material('Ear / inner fur',(.80,.55,.40),0,.7),
 'tuft':material('Ear / cream tuft',(.86,.74,.58),0,.75),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / green iris',(.10,.45,.15),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'wood':material('Staff / dark wood',(.22,.11,.04),0,.6),
 'woodlight':material('Staff / knots',(.34,.19,.08),0,.55),
 'vine':material('Staff / vine',(.07,.28,.05),0,.7),
 'leaf':material('Leaf / green',(.12,.42,.08),0,.7),
 'gem':material('Staff / faceted gem',(.04,.55,.10),0,.08,.35),
 'gemcore':material('Staff / gem core glow',(.45,1.0,.35),0,.2,2.2),
 'petal':material('Hair / orange petal',(.85,.40,.06),0,.6),
}

# ---------------- pose parameters (world units; D = screen-right forward) ----------------
D=Vector((-.82,.57,0)).normalized();Z=Vector((0,0,1));SIDE=D.cross(Z).normalized();CAM=Vector((7,10,0)).normalized()
SF=Vector((-.40,.04,1.70));SN=Vector((.40,.04,1.70))   # front (screen-right) / back shoulder
POSE=opts.pose
vines=False;cape_back=0;hair_back=0;leaves_burst=False
# HF holds the staff; staff runs from STAFF_LOW through the hand to the gem at STAFF_TOP.
if POSE=='idle':
 HF=SF+D*.48+Z*-.10;sdir=(Z+D*.40).normalized();below=1.45;above=1.15;HN=SN+D*.26+Vector((0,.30,-.40))  # staff leans forward like the painted idle frame
elif POSE=='windup':
 HF=SN-D*.10+Z*.42;sdir=(Z*.75-D*.65).normalized();below=.55;above=1.55;HN=SF+D*.70+Z*.10;cape_back=.06;hair_back=.04
elif POSE=='strike':
 HF=SF+D*.50+Z*.05;sdir=(D+Z*.22).normalized();below=.80;above=.72;HN=SN-D*.10+Vector((0,-.10,-.35));cape_back=.24;hair_back=.20;leaves_burst=True
elif POSE=='recover':
 HF=SF+D*.62-Z*.15;sdir=(D*.55+Z*.85).normalized();below=1.10;above=1.30;HN=Vector((.10,.48,1.40));cape_back=.10;hair_back=.08
else: # cast — 덩굴의 포효: staff raised high in both hands, vines rise around the feet
 HF=SF+D*.20+Z*.62;sdir=Z;below=.70;above=.95;HN=HF+Vector((.34,.10,-.30));vines=True;cape_back=.12;hair_back=.10
STAFF_LOW=HF-sdir*below;STAFF_TOP=HF+sdir*above


ROOT_OBJ=group('druid-luna')
ROOT_OBJ['asset']='Arcana druid Luna / detailed draft (cycle 83)'
# ---- Boots: sole, foot, laced shaft and a folded cuff.
for side,x in [('far',-.22),('near',.22)]:
 cube(f'{side} boot / sole',(x,.08,.05),(.30,.48,.10),'belt',ROOT_OBJ,.04)
 ico(f'{side} boot / foot',(x,.12,.18),(.16,.26,.14),'boot',ROOT_OBJ)
 cyl(f'{side} boot / shaft',(x,0,.42),.15,.50,'boot',ROOT_OBJ,14)
 cyl(f'{side} boot / folded cuff',(x,0,.66),.175,.10,'bootlight',ROOT_OBJ,14)
 for k in range(3):
  z=.30+.12*k;rod(f'{side} boot / lace a{k}',(x-.07,.145,z),(x+.07,.150,z+.10),.012,'goldlight',ROOT_OBJ,5);rod(f'{side} boot / lace b{k}',(x+.07,.145,z),(x-.07,.150,z+.10),.012,'goldlight',ROOT_OBJ,5)
# ---- Skirt: pleated moss skirt, ivory inner hem, leaf tabs hanging from the belt, ivory front panel with a gold leaf-vein.
def skirt_r(z):
 t=(1.62-z)/1.10;return .36+.10*t+.18*max(t,0)**2,.30+.09*t+.15*max(t,0)**2,-.03*t
def skirt_pt(a,z,out=1.0):
 rx,ry,cy=skirt_r(z);return Vector((rx*out*math.cos(a),cy+ry*out*math.sin(a),z))
def pleated(name,z0,z1,mat,rows=7,seg=56,pleats=12,depth=.05,scale=1.0,thick=.028):
 verts=[]
 for r in range(rows+1):
  z=z0+(z1-z0)*r/rows;rx,ry,cy=skirt_r(z);amp=depth*max(0,(1.62-z)/1.10)**1.5
  for i in range(seg):
   a=2*math.pi*i/seg;k=scale*(1+amp*math.cos(pleats*a));verts.append((rx*k*math.cos(a),cy+ry*k*math.sin(a),z))
 faces=[(r*seg+i,r*seg+(i+1)%seg,(r+1)*seg+(i+1)%seg,(r+1)*seg+i) for r in range(rows) for i in range(seg)]
 o=mesh(name,verts,faces,mat,ROOT_OBJ,0,True);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=thick;return o
pleated('Skirt / moss pleats',1.62,.52,'cape')
pleated('Skirt / gold hem band',.57,.52,'gold',rows=1,scale=1.014,thick=.012)
pleated('Skirt / ivory inner hem',.60,.42,'ivory',rows=2,scale=.93)
for k,deg in enumerate((-30,2,34,62,118,146,178,210)):
 a=math.radians(deg);n=Vector((math.cos(a),math.sin(a),.25))
 leaf(f'Skirt / leaf tab {k}',skirt_pt(a,1.18,1.05),skirt_pt(a,.74+.05*(k%2),1.13),.34,'leafcloth' if k%2 else 'capelight',ROOT_OBJ,'gold',n)
zs=[1.56,1.30,1.04,.80,.56];PL=[];PR=[]
for z in zs:
 w=math.radians(10+5*(1.56-z));PL.append(skirt_pt(math.pi/2+w,z,1.13));PR.append(skirt_pt(math.pi/2-w,z,1.13))
mesh('Skirt / ivory front panel',[tuple(p) for p in PL+PR],[(i,i+1,len(zs)+i+1,len(zs)+i) for i in range(len(zs)-1)],'ivory',ROOT_OBJ,0,True).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
lock('Skirt / panel gold edge far',PL,.015,.015,'gold',ROOT_OBJ,1,6,3);lock('Skirt / panel gold edge near',PR,.015,.015,'gold',ROOT_OBJ,1,6,3)
lock('Skirt / gold vein stem',[skirt_pt(math.pi/2,z,1.155) for z in (1.44,1.10,.78,.64)],.011,.008,'goldlight',ROOT_OBJ,1,5,3)
for k,z in enumerate((1.30,1.10,.90,.72)):
 c=skirt_pt(math.pi/2,z,1.155)
 for s_ in (-1,1):rod(f'Skirt / gold vein {k}',c,c+Vector((s_*.075,0,.085)),.009,'goldlight',ROOT_OBJ,5)
# ---- Torso: laced bodice, vine belt with leaves and a gold charm, ivory collar, leaf mantle and brooch.
ico('Torso / moss bodice',(0,0,1.48),(.40,.30,.34),'cape',ROOT_OBJ)
for k in range(4):
 z=1.36+.085*k;rod(f'Bodice / gold lace a{k}',(-.07,.305,z),(.07,.31,z+.07),.01,'goldlight',ROOT_OBJ,5);rod(f'Bodice / gold lace b{k}',(.07,.305,z),(-.07,.31,z+.07),.01,'goldlight',ROOT_OBJ,5)
for ph in (0,math.pi):lock('Belt / woven vine',[skirt_pt(2*math.pi*k/28,1.22+.03*math.sin(k*1.35+ph),1.10) for k in range(29)],.032,.032,'vine',ROOT_OBJ,1,7,2)
for k,deg in enumerate((40,70,110,140,-10,190)):
 a=math.radians(deg);c=skirt_pt(a,1.22,1.14);leaf(f'Belt / leaf {k}',c,c+Vector((math.cos(a)*.03,math.sin(a)*.03,-.16)),.11,'leaf',ROOT_OBJ,None,Vector((math.cos(a),math.sin(a),0)))
C0=skirt_pt(math.radians(64),1.20,1.17);rod('Belt / charm cord',C0,C0-Z*.12,.01,'gold',ROOT_OBJ,5);uv('Belt / gold acorn charm',C0-Z*.17,(.045,.045,.06),'goldlight',ROOT_OBJ);uv('Belt / acorn cap',C0-Z*.125,(.05,.05,.03),'woodlight',ROOT_OBJ)
cyl('Neck / skin',(0,.03,1.92),.11,.16,'skin',ROOT_OBJ,14,0)
tube('Collar / ivory inner collar',(0,.03,1.83),(0,.03,1.95),.18,.145,'ivory',ROOT_OBJ,18)
uv('Mantle / moss shoulders',(0,-.02,1.76),(.50,.39,.15),'cape',ROOT_OBJ)
for k in range(9):
 a=2*math.pi*k/9+.35;r=Vector((math.cos(a),math.sin(a),0))
 leaf(f'Mantle / leaf {k}',(.20*r.x,-.02+.16*r.y,1.90),(.66*r.x,-.02+.53*r.y,1.58),.36,'leafcloth' if k%2 else 'capelight',ROOT_OBJ,'gold',r*.6+Z)
uv('Brooch / gold setting',(0,.33,1.74),(.07,.035,.075),'gold',ROOT_OBJ);ico('Brooch / green gem',(0,.36,1.74),(.042,.025,.05),'gem',ROOT_OBJ,1)
# ---- Cape: moss cloak with a leaf-tip (zigzag) hem and a gold hem line.
cv=[];NC=13
for r_,(z,w,y) in enumerate([(1.80,.50,-.28),(1.20,.74,-.46-cape_back*.6),(.50,.94,-.62-cape_back)]):
 for i in range(NC):
  zz=z-(.13*(i%2) if r_==2 else 0);cv.append(((i/(NC-1)-.5)*w*2,y+(.04 if i%2 else -.05),zz))
cp=mesh('Cape / moss cloak',cv,[(r*NC+c,r*NC+c+1,(r+1)*NC+c+1,(r+1)*NC+c) for r in range(2) for c in range(NC-1)],'cape',ROOT_OBJ,0,True);cp.data.materials.append(M['capelight'])
for face in cp.data.polygons:face.material_index=face.index%2
cp.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
for i in range(NC-1):rod('Cape / gold hem',cv[2*NC+i],cv[2*NC+i+1],.02,'gold',ROOT_OBJ,6)
# ---- Arms: moss puff sleeve, flared ivory inner sleeve with a gold cuff, bracelet; a gripping hand and an open hand.
def arm(name,sh,hand):
 mid=sh.lerp(hand,.48);axis=(hand-sh).normalized()
 tube(name+' / moss sleeve',sh,mid,.13,.15,'cape',ROOT_OBJ,14)
 tube(name+' / ivory inner sleeve',mid-axis*.03,mid+axis*.12,.13,.17,'ivory',ROOT_OBJ,14)
 tube(name+' / gold cuff',mid+axis*.10,mid+axis*.13,.172,.176,'gold',ROOT_OBJ,14)
 rod(name+' / forearm',mid,hand,.075,'skin',ROOT_OBJ,12)
 tube(name+' / gold bracelet',hand-axis*.13,hand-axis*.10,.085,.085,'goldlight',ROOT_OBJ,12)
 leaf(name+' / bracelet leaf',hand-axis*.12,hand-axis*.12+Z*.10+axis*.02,.07,'leaf',ROOT_OBJ,None)
 uv(name+' / palm',hand,(.075,.07,.085),'skin',ROOT_OBJ)
arm('Staff arm',SF,HF);arm('Free arm',SN,HN)
gu=sdir.cross(CAM).normalized()
for k in range(4):rod(f'Staff hand / gripping finger {k}',HF+sdir*(-.055+.037*k)-gu*.065+CAM*.06,HF+sdir*(-.055+.037*k)+gu*.065+CAM*.06,.02,'skin',ROOT_OBJ,6)
rod('Staff hand / thumb',HF+sdir*.08-gu*.06+CAM*.05,HF+sdir*.10+gu*.03+CAM*.07,.021,'skin',ROOT_OBJ,6)
fd=(D*.6+Z*.5+CAM*.3).normalized() if POSE!='cast' else Z;fs=fd.cross(CAM).normalized()
for k,off in enumerate((-.045,-.015,.015,.045)):rod(f'Free hand / finger {k}',HN+fs*off,HN+fs*off*1.9+fd*(.13-.02*abs(k-1.5)),.018,'skin',ROOT_OBJ,6)
rod('Free hand / thumb',HN-fs*.06,HN-fs*.11+fd*.05,.02,'skin',ROOT_OBJ,6)
# ---- Head: face with brows, lids, nose, smile and blush; upright ears with inner fur and cream tufts.
uv('Face / round head',(0,.06,2.24),(.40,.36,.37),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',(side*.15,.38,2.23),(.09,.04,.10),'eyewhite',ROOT_OBJ)
 uv('Face / green iris',(side*.14,.41,2.22),(.062,.025,.08),'iris',ROOT_OBJ)
 uv('Face / pupil',(side*.14,.428,2.22),(.03,.012,.042),'pupil',ROOT_OBJ)
 uv('Face / eye shine',(side*.12,.437,2.26),(.022,.01,.022),'eyewhite',ROOT_OBJ)
 lock('Face / upper lid',[(side*.245,.345,2.275),(side*.16,.412,2.335),(side*.06,.405,2.295)],.013,.011,'brow',ROOT_OBJ,1,6,5)
 lock('Face / lash',[(side*.245,.345,2.275),(side*.285,.325,2.305)],.01,.005,'brow',ROOT_OBJ,1,5,3)
 lock('Face / brow',[(side*.25,.335,2.385),(side*.16,.385,2.42),(side*.07,.395,2.405)],.016,.01,'brow',ROOT_OBJ,.7,6,5)
 uv('Face / blush',(side*.255,.325,2.125),(.065,.012,.04),'blush',ROOT_OBJ)
 base=Vector((side*.25,-.06,2.58));tip=base+Vector((side*.14,-.04,.74))
 tube(f'Ear / outer fur {side}',base,tip,.16,.02,'hair',ROOT_OBJ,12)
 tube(f'Ear / inner fur {side}',base+Vector((0,.06,.04)),tip+Vector((0,.05,-.10)),.09,.012,'earin',ROOT_OBJ,10)
 for k in range(3):
  b=base+Vector((side*(-.04+.04*k),.11,.10+.02*k));lock(f'Ear / cream tuft {side}{k}',[b,b+Vector((side*.015*(k-1),.035,.06)),b+Vector((side*.035*(k-1),.02,.115))],.034,.01,'tuft',ROOT_OBJ,.7,6,4)
uv('Face / nose',(0,.425,2.16),(.028,.022,.026),'skinshade',ROOT_OBJ)
lock('Face / smile',[(-.055,.405,2.078),(0,.42,2.058),(.055,.405,2.078)],.01,.01,'mouth',ROOT_OBJ,1,6,4)
# ---- Hair: big wavy ginger mane in curved locks, a swept fringe, curling front locks and a flower with leaves.
uv('Hair / crown',(0,-.03,2.36),(.46,.42,.36),'hair',ROOT_OBJ)
for k in range(3):uv('Hair / mane mass',Vector((0,-.36,2.14-.32*k))-D*(.05+(.06+hair_back*.4)*k),(.44-.03*k,.17,.26),'hair',ROOT_OBJ)
for k in range(-2,3):
 lock(f'Hair / swept fringe {k}',[(k*.06,.10,2.68),(k*.12+.03,.33,2.59),(k*.155+.06,.405,2.45+abs(k)*.012)],.085,.022,'hairlight' if k%2 else 'hair',ROOT_OBJ,.55,8,5)
for side in (-1,1):
 lock('Hair / curling front lock',[(side*.31,.25,2.50),(side*.41,.31,2.20),(side*.43,.34,1.92),(side*.38,.37,1.76),(side*.33,.36,1.80)],.075,.022,'hairlight',ROOT_OBJ,.7,8,5)
 for k in range(3):
  lock(f'Hair / wavy side lock {side}{k}',wavy((side*(.33+.03*k),.02-.10*k,2.52-.05*k),(side*(.62+.07*k),-.06-.14*k-hair_back*.6,1.50-.06*k),Vector((side,0,0)),.07,2.6),.14,.03,'hair' if k%2 else 'hairlight',ROOT_OBJ,.75,8,3)
for k in range(11):
 x=(k-5)*.068
 lock(f'Hair / wavy back lock {k}',wavy(Vector((x*.9,-.20-.02*abs(k-5),2.55-.035*abs(k-5))),Vector((x*1.9,-.44,1.28+.05*math.cos(k*1.7)))-D*(.22+hair_back),D,.07,3.0+.2*(k%3)),.15,.035,'hairlight' if k%3==1 else 'hair',ROOT_OBJ,.75,8,3)
F0=Vector((-.33,.16,2.56))
for k in range(5):
 a=2*math.pi*k/5;uv(f'Flower / petal {k}',F0+Vector((.0,.0,.0))+(D*math.cos(a)+Z*math.sin(a))*.075+CAM*.02,(.05,.03,.05),'petal',ROOT_OBJ)
uv('Flower / gold centre',F0+CAM*.04,(.032,.032,.032),'goldlight',ROOT_OBJ)
for k,(dx,dz) in enumerate(((.16,.10),(.18,-.04),(.06,.17))):leaf(f'Flower / leaf {k}',F0,F0+D*dx+Z*dz,.09,'leaf',ROOT_OBJ,None)
# ---- Staff: knotted shaft, one long vine with leaves, a woven double ring, faceted gem with a glowing core, tendrils.
rod('Staff / shaft',STAFF_LOW,STAFF_TOP,.055,'wood',ROOT_OBJ,10)
cyl('Staff / gold ferrule',STAFF_LOW+sdir*.05,.062,.10,'gold',ROOT_OBJ,10,0).rotation_euler=sdir.to_track_quat('Z','Y').to_euler()
u=sdir.cross(CAM).normalized();w=sdir.cross(u).normalized();SL=(STAFF_TOP-STAFF_LOW).length
for t in (.30,.62):cyl('Staff / knot',STAFF_LOW.lerp(STAFF_TOP,t),.068,.07,'woodlight',ROOT_OBJ,10,.01).rotation_euler=sdir.to_track_quat('Z','Y').to_euler()
vine=[STAFF_LOW.lerp(STAFF_TOP,k/39)+(u*math.cos(k/39*20)+w*math.sin(k/39*20))*.075 for k in range(40)]
lock('Staff / long vine',vine,.024,.018,'vine',ROOT_OBJ,1,6,2)
for k in range(5,40,7):leaf(f'Staff / vine leaf {k}',vine[k],vine[k]+u*(.12*(1 if k%2 else -1))+sdir*.08,.07,'leaf',ROOT_OBJ,None)
ring_c=STAFF_TOP+sdir*.24;rr=.25;rv=(CAM-sdir*CAM.dot(sdir)).normalized();ru=sdir.cross(rv).normalized()
for ph in (0,math.pi):
 lock('Staff / woven ring',[ring_c+(ru*math.cos(a)+sdir*math.sin(a))*(rr+.022*math.sin(4*a+ph))+rv*(.02*math.cos(4*a+ph)) for a in [2*math.pi*k/36 for k in range(37)]],.03,.03,'vine',ROOT_OBJ,1,7,2)
gem=ico('Staff / faceted gem',ring_c,(.145,.10,.185),'gem',ROOT_OBJ,1)
for poly in gem.data.polygons:poly.use_smooth=False
ico('Staff / gem core glow',ring_c+rv*.085,(.05,.03,.075),'gemcore',ROOT_OBJ,1)
for k,a in enumerate((.5,1.6,2.7,4.0,5.2)):
 c=ring_c+(ru*math.cos(a)+sdir*math.sin(a))*rr*1.08;leaf(f'Staff / ring leaf {k}',c,c+(ru*math.cos(a)+sdir*math.sin(a))*.17+rv*.03,.085,'leaf',ROOT_OBJ,None)
for s_ in (-1,1):
 b=ring_c+ru*(s_*rr*.9)-sdir*rr*.5
 lock('Staff / tendril',[b+(ru*s_*math.cos(k*.9)+sdir*math.sin(k*.9))*(.012+.012*k)-sdir*.02*k for k in range(8)],.012,.006,'vine',ROOT_OBJ,1,5,3)
GEM=ring_c
if leaves_burst:
 for k in range(5):
  c=ring_c+D*(.20+.075*k)+Z*(.18*math.sin(k*1.7))+SIDE*.05*(k%2)
  leaf(f'Burst / leaf {k}',c,c+D*.15+Z*(.06 if k%2 else -.05),.075,'leaf',ROOT_OBJ,None)
if vines:
 for k in range(6):
  a=2*math.pi*k/6+.4;base=Vector((1.05*math.cos(a),.85*math.sin(a),0));r=Vector((math.cos(a),math.sin(a),0))
  pts=[base+Z*(1.0*t)+Vector((math.cos(a+t*3.2),math.sin(a+t*3.2),0))*.17*t for t in [j/8 for j in range(9)]]
  pts+=[pts[-1]+r*.06-Z*.05,pts[-1]+r*.02-Z*.11]
  lock(f'Cast / rising vine {k}',pts,.05,.012,'vine',ROOT_OBJ,1,7,3)
  for j in (3,6):leaf(f'Cast / vine leaf {k}{j}',pts[j],pts[j]+r*(.13 if j==3 else -.11)+Z*.08,.08,'leaf',ROOT_OBJ,None)
scene=bpy.context.scene
# Same studio as build_dwarf.py.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Druid shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.8
camera.location=(7,10,7);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y+=(ground.y-(1-550/640));bpy.context.view_layer.update()
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm large key',(-4,6,8),850,4,(1,.83,.65))
area('Cool soft armor fill',(5,3,5),600,4,(.65,.83,1))
area('Warm edge light',(1,-5,7),1000,3,(1,.80,.52))
ROOT_OBJ.scale=(opts.scale,)*3;GEM=GEM*opts.scale
bpy.context.view_layer.update()
px=lambda v:(round(world_to_camera_view(scene,camera,v).x*opts.size,1),round((1-world_to_camera_view(scene,camera,v).y)*opts.size,1))
graph=bpy.context.evaluated_depsgraph_get();meshes=[o for o in COL.objects if o.type=='MESH'];tris=0
for o in meshes:
 me=o.evaluated_get(graph).to_mesh();me.calc_loop_triangles();tris+=len(me.loop_triangles)
info={'pose':POSE,'ground':px(Vector((0,0,0))),'gem_px':px(GEM),'mesh_objects':len(meshes),'triangles':tris}
scene.render.filepath=str(OUT/f'druid-{POSE}.png');bpy.ops.render.render(write_still=True)
(OUT/f'druid-{POSE}.json').write_text(json.dumps(info))
print('ARCANA_DRUID '+json.dumps(info))
