"""Author the editable eastern taoist Cheongun (청운) and bake five shared-camera action sprites.

DRAFT from the 2-hour direction loop (cycle 68). Copy to tools/blender/build_tao.py to use.
Run: blender -b --python tools/blender/build_tao.py -- --pose cast
Options after --: --samples 128 --size 640 --pose idle|windup|strike|recover|cast --out DIR --scale 1.2
Same contract as build_dwarf.py / build_elf_draft.py: 640px frame, orthographic camera at (7,10,7)
looking at (0,0,1.7), ortho scale 5.8, ground origin projected to (320,550), native facing screen-right.
Reference: art-source/defense/atlases/ranged-motion.png (tao frames) — high top-knot with a gold crown and
green ribbons, long dark hair, ivory robe with green panels and gold trim, wide sleeves, a glowing yellow
talisman. Silhouette cues at 64px: (1) top-knot + crown peak, (2) bell robe with hanging sleeves,
(3) the bright talisman held away from the body. Cycle 67 adds a fifth pose, `cast` (뇌운 결계): both arms
raised, the talisman overhead and five small talismans circling the waist. Use displayScale 1.32 (cycle 62).
Cycle 68 bake: the painted ivory robe sits at 64px gray 108, only 8 away from the forest field (116), and a
cone robe overlapped Ian's draft (0.71). So the outer robe and front panel are ink-teal/jade with ivory kept
for collar and cuffs (gray 85), long hair and two jade ribbons stream back and the talisman is held out to the
front (Ian 0.53, Riel 0.57, Bron 0.36 at 64px).
Cycle 71: windup raises the talisman high behind the head with the sword fingers far forward, recover keeps the
throwing arm low and forward (64px overlap with idle: windup 0.85 -> 0.66, recover 0.81 -> 0.70). Five poses at
WebP q84 = 110,238 B (<= 112 KB).
Each pose is built from pose parameters in a fresh scene; a production script should key the same values
on pivots (body, head, ribbon, near-arm, far-arm, talisman, orbit, sleeves).
Cycle 80 (user request: more detailed modelling): same camera contract and pose values, detail raised in six
layers — face (brows, lids, nose, smile, blush), hands (two raised fingers, curled fingers, thumb), hair (curved
fringe/side/back locks, top-knot wrap, five-spike crown with a red gem, hairpin beads, flat silk ribbons with a
bow), clothes (pleated bell robe, gold hem band, jade under-skirt, ivory inner hem, crossed ivory collar, gold
cloud curls, panel diamonds, sleeve band/inner sleeve/folded drape with jade hem), props (sash knot, tails and a
vermilion tassel, talisman border, brush strokes and sparks) and materials (lit jade, bright gold thread).
Helpers `spline`, `lock` (tapered tube/ribbon along a curve) and `pleated` are reusable for the other heroes.
Bake: 153 mesh objects / 38,976 triangles (cycle 71: 70 / 12,442). Idle 40.6px on 844x390, 64px gray 80
(forest 36, snow 76), 64px overlap Ian 0.52, Riel 0.59, Luna 0.35, Bron 0.41. Five poses WebP q85 142,048 B,
q80 126,312 B (cycle 71: 113,592 / 101,046) — proposed budget 128 KB at q80.
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
p.add_argument('--scale',type=float,default=1.2,help='whole-body scale about the ground origin (cycle 68: 1.2 gives ~39px idle on an 844x390 screen)')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(opts.out);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Taoist Cheongun / editable parts');bpy.context.scene.collection.children.link(COL)
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

# ---------------- cycle 80 detail helpers ----------------
CAM=Vector((7,10,0)).normalized()                        # cloth strips and talismans face the camera
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
 u=Vector(up).normalized();f=Vector(face).normalized();r=u.cross(f).normalized();c=Vector(center);w=size*.55;h=size;e=f*.014
 plate(name+' / paper',c,r,u,w,h,'paper' if glow else 'paperdim',parent,.015)
 P=lambda a:c+e+r*(a[0]*w)+u*(a[1]*h)
 for k,(a,b) in enumerate([((-.42,-.44),(.42,-.44)),((.42,-.44),(.42,.44)),((.42,.44),(-.42,.44)),((-.42,.44),(-.42,-.44))]):
  rod(name+f' / border {k}',P(a),P(b),size*.012,'seal',parent,6)
 strokes=[((-.22,.30),(.22,.30)),((0,.34),(0,.06)),((-.24,.10),(.24,.10)),((-.2,-.04),(0,-.26)),((.2,-.04),(0,-.26)),((-.14,-.34),(.14,-.34))]
 for k,(a,b) in enumerate(strokes if size>.4 else strokes[:3]):
  rod(name+f' / brush stroke {k}',P(a),P(b),size*.024,'seal',parent,6)

OUTER=(.018,.050,.052)   # 먹청-teal outer robe: keeps the 64px gray low (cycle 62 contrast rule)
M={
 'outer':material('Cloth / ink-teal outer robe',OUTER,0,.82),
 'outerlight':material('Cloth / lit robe folds',tuple(c*1.6 for c in OUTER),0,.8),
 'ivory':material('Cloth / ivory inner robe',(.60,.56,.45),0,.8),
 'green':material('Cloth / jade green panels and ribbons',(.02,.22,.11),0,.75),
 'greenlight':material('Cloth / lit jade',(.04,.34,.17),0,.72),
 'gold':material('Trim / thin gold',(.82,.52,.13),.6,.36),
 'goldlight':material('Trim / bright gold thread',(.95,.70,.25),.5,.3,.15),
 'boot':material('Leather / short boots',(.24,.12,.05),0,.7),
 'bootdark':material('Leather / soles',(.10,.05,.02),0,.8),
 'skin':material('Skin / warm',(.86,.58,.42),0,.62),
 'skinshade':material('Skin / nose and ear shade',(.72,.42,.30),0,.62),
 'blush':material('Skin / cheek blush',(.90,.38,.30),0,.7),
 'mouth':material('Face / mouth line',(.35,.08,.06),0,.6),
 'hair':material('Hair / ink black',(.025,.018,.014),0,.55),
 'hairlight':material('Hair / sheen',(.085,.065,.055),0,.42),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / teal iris',(.08,.30,.30),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'red':material('Tassel / vermilion silk',(.62,.07,.03),0,.6),
 'gem':material('Crown / red gem',(.80,.05,.04),0,.15,.5),
 'paper':material('Talisman / glowing yellow paper',(1.0,.55,.03),0,.5,1.1),
 'paperdim':material('Talisman / small charm',(1.0,.58,.05),0,.5,.7),
 'seal':material('Talisman / vermilion brush',(.75,.08,.03),0,.5,.4),
 'bolt':material('Spark / storm light',(1.0,.95,.55),0,.3,3.0),
}

# ---------------- pose parameters (world units; D = screen-right forward, as in build_elf_draft.py) ----------------
D=Vector((-.82,.57,0)).normalized();Z=Vector((0,0,1));SIDE=D.cross(Z).normalized()
SF=Vector((-.40,.04,1.74));SN=Vector((.40,.04,1.74))   # front (screen-right) / back shoulder
POSE=opts.pose
orbit=False;sleeve_lift=0;ribbon=.10;robe_flare=0;tal_tilt=0
# HF = talisman hand (front), HN = sword-finger hand (back). Painted frames: talisman raised beside the face.
if POSE=='idle':
 HF=SF+D*.60+Z*.10;HN=SN-D*.22+Vector((0,.10,-.42));TAL=HF+Z*.34
elif POSE=='windup':
 # cycle 71: talisman hand high behind the head, sword fingers reaching far forward (idle overlap 0.85 -> <=0.80)
 HF=SN-D*.36+Z*.98;HN=SF+D*.98+Z*.16;TAL=HF+Z*.30-D*.12;tal_tilt=-.55;ribbon=.26;sleeve_lift=.08
elif POSE=='strike':
 HF=SF+D*1.02+Z*.10;HN=SN+Vector((.02,-.18,-.36));TAL=HF+D*.50+Z*.08;tal_tilt=.25;ribbon=.34;robe_flare=.10;sleeve_lift=.12
elif POSE=='recover':
 # cycle 71: follow-through — throwing arm still low and forward, back hand at the chest (idle overlap 0.81 -> <=0.80)
 HF=SF+D*.92-Z*.12;HN=Vector((.06,.48,1.46));TAL=None;ribbon=.22;robe_flare=.06
else: # cast — 뇌운 결계: both arms up, talisman overhead, charms circling the waist
 HF=SF+D*.10+Z*.80;HN=SN-D*.10+Z*.80;TAL=(HF+HN)/2+Z*.36;orbit=True;ribbon=.28;robe_flare=.12;sleeve_lift=.28
tal_up=(Z+D*tal_tilt).normalized();tal_face=CAM

ROOT_OBJ=group('taoist-cheongun')
ROOT_OBJ['asset']='Arcana taoist Cheongun / detailed draft (cycle 80)'
# ---- Boots: sole, toe and a turned cuff peek out under the hems.
for side,x in [('far',-.22),('near',.22)]:
 cube(f'{side} boot / sole',(x,.12,.045),(.27,.48,.09),'bootdark',ROOT_OBJ,.035)
 ico(f'{side} boot / toe',(x,.24,.15),(.14,.22,.11),'boot',ROOT_OBJ)
 rod(f'{side} boot / gold toe stitch',(x-.08,.40,.15),(x+.08,.40,.15),.012,'gold',ROOT_OBJ,6)
# ---- Robe: pleated ink-teal bell over a jade under-skirt and an ivory inner hem (three layered hems).
def robe_r(z):
 t=(1.86-z)/1.56
 return .34+.14*t+(.34+robe_flare)*max(t,0)**2.2,.28+.12*t+(.28+robe_flare*.6)*max(t,0)**2.2,-.05*t
def robe_pt(a,z,out=1.0):
 rx,ry,cy=robe_r(z);return Vector((rx*out*math.cos(a),cy+ry*out*math.sin(a),z))
def pleated(name,z0,z1,mat,rows=9,seg=64,pleats=14,depth=.06,scale=1.0,thick=.03):
 verts=[]
 for r in range(rows+1):
  z=z0+(z1-z0)*r/rows;rx,ry,cy=robe_r(z);amp=depth*max(0,(1.86-z)/1.56)**1.5
  for i in range(seg):
   a=2*math.pi*i/seg;k=scale*(1+amp*math.cos(pleats*a))
   verts.append((rx*k*math.cos(a),cy+ry*k*math.sin(a),z))
 faces=[(r*seg+i,r*seg+(i+1)%seg,(r+1)*seg+(i+1)%seg,(r+1)*seg+i) for r in range(rows) for i in range(seg)]
 o=mesh(name,verts,faces,mat,ROOT_OBJ,0,True);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=thick;return o
pleated('Robe / ink-teal outer robe',1.86,.30,'outer')
pleated('Robe / gold hem band',.36,.30,'gold',rows=1,scale=1.014,thick=.012)
pleated('Robe / jade under-skirt',.44,.13,'green',rows=3,depth=.07,scale=.97)
pleated('Robe / jade under-skirt gold line',.17,.13,'goldlight',rows=1,depth=.07,scale=.984,thick=.01)
pleated('Robe / ivory inner hem',.22,.05,'ivory',rows=2,depth=.05,scale=.90)
# Gold cloud curls embroidered above the hem (painted robe: gold patterns).
for k,deg in enumerate((-18,6,30,54,126,150,174,198)):
 a=math.radians(deg);c=robe_pt(a,.56,1.085);t=Vector((-math.sin(a),math.cos(a),0))
 lock(f'Robe / gold cloud curl {k}',[c+t*((.016+.012*s)*math.cos(s*.95))+Z*((.016+.012*s)*math.sin(s*.95)) for s in range(9)],.013,.009,'goldlight',ROOT_OBJ,1,6,3)
# Jade front panel with gold edges and four gold diamonds.
zs=[1.80,1.50,1.20,.90,.60,.34];PL=[];PR=[]
for z in zs:
 w=math.radians(9+5*(1.80-z)/1.46);PL.append(robe_pt(math.pi/2+w,z,1.135));PR.append(robe_pt(math.pi/2-w,z,1.135))
mesh('Robe / jade front panel',[tuple(p) for p in PL+PR],[(i,i+1,len(zs)+i+1,len(zs)+i) for i in range(len(zs)-1)],'green',ROOT_OBJ,0,True).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.035
lock('Robe / panel gold edge far',PL,.016,.016,'gold',ROOT_OBJ,1,6,3);lock('Robe / panel gold edge near',PR,.016,.016,'gold',ROOT_OBJ,1,6,3)
for k,z in enumerate((1.04,.80,.56)):
 c=robe_pt(math.pi/2,z,1.15)
 mesh(f'Robe / gold diamond {k}',[tuple(c+Vector((-.05,0,0))),tuple(c+Vector((0,0,-.075))),tuple(c+Vector((.05,0,0))),tuple(c+Vector((0,0,.075)))],[(0,1,2,3)],'goldlight',ROOT_OBJ)
# Shoulders, neck and the crossed ivory collar (깃) with a gold edge.
uv('Shoulders / ink-teal mantle',(0,-.02,1.80),(.53,.41,.17),'outer',ROOT_OBJ)
lock('Shoulders / mantle gold trim',[(.53*math.cos(a),-.02+.41*math.sin(a),1.75) for a in [2*math.pi*k/18 for k in range(19)]],.017,.017,'gold',ROOT_OBJ,1,6,2)
cyl('Neck / skin',(0,.03,1.98),.115,.16,'skin',ROOT_OBJ,14,0)
tube('Collar / ivory inner collar',(0,.03,1.89),(0,.03,2.01),.185,.15,'ivory',ROOT_OBJ,18)
over=[(-.27,.17,1.93),(-.15,.275,1.80),(-.02,.335,1.64),(.07,.36,1.50)];under=[(.27,.17,1.93),(.15,.275,1.80),(.03,.33,1.66)]
lock('Collar / ivory band over',over,.07,.055,'ivory',ROOT_OBJ,.22,8,5);lock('Collar / ivory band under',under,.07,.055,'ivory',ROOT_OBJ,.22,8,5)
lock('Collar / gold edge over',[Vector(p)+Vector((.05,.012,-.012)) for p in over],.012,.012,'gold',ROOT_OBJ,1,6,5)
lock('Collar / gold edge under',[Vector(p)+Vector((-.05,.01,-.012)) for p in under],.012,.012,'gold',ROOT_OBJ,1,6,5)
# Sash: jade band with gold lines, a knot on the near hip, two tails and a vermilion tassel (노리개).
sv=[];SEG=40
for z in (1.29,1.15):
 rx,ry,cy=robe_r(z)
 for i in range(SEG):
  a=2*math.pi*i/SEG;sv.append((rx*1.075*math.cos(a),cy+ry*1.075*math.sin(a),z))
mesh('Sash / jade band',sv,[(i,(i+1)%SEG,SEG+(i+1)%SEG,SEG+i) for i in range(SEG)],'greenlight',ROOT_OBJ,0,True).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
for z in (1.29,1.15):lock(f'Sash / gold line {z}',[robe_pt(2*math.pi*k/24,z,1.09) for k in range(25)],.012,.012,'gold',ROOT_OBJ,1,6,2)
K=robe_pt(math.radians(58),1.22,1.17);kt=Vector((-math.sin(math.radians(58)),math.cos(math.radians(58)),0))
uv('Sash / knot',K,(.075,.06,.07),'greenlight',ROOT_OBJ)
for s_ in (-1,1):lock('Sash / knot loop',[K,K+kt*(.13*s_)+Z*.09,K+kt*(.17*s_)-Z*.01,K],.03,.03,'green',ROOT_OBJ,.45,8,5)
for k,s_ in enumerate((-1,1)):
 lock(f'Sash / hanging tail {k}',[K,K+kt*(.05*s_)-Z*.22+CAM*.03,K+kt*(.09*s_+robe_flare*.4)-Z*.48+CAM*.05,K+kt*(.07*s_+robe_flare*.7)-Z*.70+CAM*.07],.06,.05,'green',ROOT_OBJ,.3,8,5)
T0=K+kt*(-.02)+CAM*.06-Z*.10
lock('Tassel / gold cord',[K,T0],.012,.012,'gold',ROOT_OBJ,1,6,2)
uv('Tassel / jade bead',T0,(.04,.04,.04),'greenlight',ROOT_OBJ);uv('Tassel / gold cap',T0-Z*.07,(.045,.045,.035),'gold',ROOT_OBJ)
for k in range(9):
 a=2*math.pi*k/9;off=kt*(.03*math.cos(a))+CAM*(.03*math.sin(a))
 lock(f'Tassel / vermilion strand {k}',[T0-Z*.09+off*.5,T0-Z*.24+off*1.2+kt*robe_flare*.3,T0-Z*.40+off*1.5+kt*robe_flare*.6],.014,.008,'red',ROOT_OBJ,1,5,3)
# ---- Arms: wide sleeve, gold band, ivory inner sleeve, a folded hanging drape with a jade hem, and hands with fingers.
def sleeve(name,sh,hand,fdir):
 axis=(hand-sh).normalized();wrist=sh.lerp(hand,.80);elbow=sh.lerp(hand,.40);down=Vector((0,0,-1))
 tube(name+' / wide sleeve',sh,wrist,.13,.25,'outer',ROOT_OBJ,18)
 tube(name+' / sleeve gold band',wrist-axis*.035,wrist+axis*.005,.255,.26,'gold',ROOT_OBJ,18)
 tube(name+' / ivory inner sleeve',wrist-axis*.12,wrist+axis*.05,.16,.12,'ivory',ROOT_OBJ,14)
 nu,nv=8,6;L=.80-sleeve_lift;g=[]
 for j in range(nv+1):
  v=j/nv
  for i in range(nu+1):
   u=i/nu;top=elbow.lerp(wrist,u)+down*(.09+.13*u)
   g.append(top+down*(L*v*(.40+.60*u))+axis*(.12*v*u-.07*v*(1-u))+CAM*(.04*math.sin(u*math.pi*3+j*.7)*v))
 o=mesh(name+' / hanging drape',[tuple(p) for p in g],[(j*(nu+1)+i,j*(nu+1)+i+1,(j+1)*(nu+1)+i+1,(j+1)*(nu+1)+i) for j in range(nv) for i in range(nu)],'outerlight',ROOT_OBJ,0,True)
 o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.028
 edge=[g[nv*(nu+1)+i] for i in range(nu+1)]+[g[j*(nu+1)+nu] for j in range(nv-1,-1,-1)]
 lock(name+' / drape jade hem',edge,.034,.034,'green',ROOT_OBJ,.45,8,3);lock(name+' / drape gold line',[p-down*.055-axis*.02 for p in edge[:nu+1]],.011,.011,'goldlight',ROOT_OBJ,1,6,3)
 f=Vector(fdir).normalized();s=f.cross(CAM);s=s.normalized() if s.length>1e-4 else f.orthogonal().normalized()
 uv(name+' / palm',hand,(.078,.072,.088),'skin',ROOT_OBJ)
 for k,off in enumerate((-.024,.024)):rod(name+f' / raised finger {k}',hand+s*off,hand+s*off+f*.17,.021,'skin',ROOT_OBJ,8)
 for k,off in enumerate((-.056,.056)):uv(name+f' / curled finger {k}',hand+s*off+f*.045,(.026,.026,.032),'skin',ROOT_OBJ)
 rod(name+' / thumb',hand-s*.05-f*.02,hand-s*.075+f*.06,.022,'skin',ROOT_OBJ,8)
sleeve('Talisman arm',SF,HF,(TAL-HF) if TAL is not None else D+Z*.3)
sleeve('Mudra arm',SN,HN,D*.5+Z if POSE in('idle','recover') else D+Z*.25)
# ---- Head: face with brows, lids, nose, mouth and blush.
uv('Face / round head',(0,.06,2.28),(.40,.36,.38),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',(side*.15,.38,2.27),(.09,.04,.10),'eyewhite',ROOT_OBJ)
 uv('Face / teal iris',(side*.14,.41,2.26),(.062,.025,.08),'iris',ROOT_OBJ)
 uv('Face / pupil',(side*.14,.428,2.26),(.03,.012,.042),'pupil',ROOT_OBJ)
 uv('Face / eye shine',(side*.12,.437,2.30),(.022,.01,.022),'eyewhite',ROOT_OBJ)
 lock('Face / upper lid',[(side*.245,.345,2.315),(side*.16,.412,2.375),(side*.06,.405,2.335)],.013,.011,'hair',ROOT_OBJ,1,6,5)
 lock('Face / brow',[(side*.26,.33,2.44),(side*.16,.385,2.485),(side*.07,.395,2.455)],.02,.012,'hair',ROOT_OBJ,.7,6,5)
 uv('Face / blush',(side*.255,.325,2.165),(.065,.012,.04),'blush',ROOT_OBJ)
 uv('Face / ear',(side*.39,.04,2.26),(.06,.08,.10),'skin',ROOT_OBJ);uv('Face / inner ear',(side*.40,.07,2.26),(.03,.045,.06),'skinshade',ROOT_OBJ)
uv('Face / nose',(0,.425,2.20),(.028,.022,.026),'skinshade',ROOT_OBJ)
lock('Face / smile',[(-.055,.405,2.118),(0,.42,2.098),(.055,.405,2.118)],.01,.01,'mouth',ROOT_OBJ,1,6,4)
# ---- Hair: cap, seven fringe locks, side locks, eleven flowing back locks, top-knot, crown and ribbons.
uv('Hair / cap',(0,-.04,2.38),(.44,.42,.36),'hair',ROOT_OBJ)
for k in range(-3,4):
 lock(f'Hair / fringe lock {k}',[(k*.05,.10,2.71),(k*.105,.33,2.64),(k*.135,.405,2.49+abs(k)*.012)],.075,.02,'hairlight' if k%2 else 'hair',ROOT_OBJ,.55,8,5)
for side in (-1,1):
 lock('Hair / long side lock',[(side*.33,.20,2.52),(side*.43,.25,2.24),(side*.41,.27,1.96),(side*.37,.30,1.74)],.075,.02,'hair',ROOT_OBJ,.7,8,5)
 lock('Hair / short side lock',[(side*.37,.12,2.50),(side*.46,.14,2.26),(side*.44,.16,2.08)],.06,.018,'hairlight',ROOT_OBJ,.7,8,5)
for k in range(3):uv('Hair / back mass',Vector((0,-.36,2.20-.34*k))-D*(.04+(.07+ribbon*.15)*k),(.30-.03*k,.14,.24),'hair',ROOT_OBJ)
for k in range(9):
 x=(k-4)*.07;sway=.05*math.sin(k*1.9)
 lock(f'Hair / flowing back lock {k}',[Vector((x,-.30,2.46)),Vector((x*1.15,-.47,2.04))-D*.04,Vector((x*1.3,-.52,1.62))-D*(.12+ribbon*.3),Vector((x*1.45,-.50,1.26))-D*(.26+ribbon*.6+sway),Vector((x*1.5,-.46,1.04+.06*math.cos(k)))-D*(.44+ribbon*.9+sway*1.6)+Vector((0,0,.05))],.13,.028,'hairlight' if k%3==1 else 'hair',ROOT_OBJ,.8,8,5)
uv('Hair / top-knot bun',(0,-.06,2.86),(.19,.18,.18),'hair',ROOT_OBJ)
tube('Hair / knot wrap',(0,-.06,2.76),(0,-.06,2.80),.17,.16,'hairlight',ROOT_OBJ,16)
tube('Crown / gold band',(0,-.06,2.80),(0,-.06,2.90),.215,.215,'gold',ROOT_OBJ,22)
for k,(dx,hh) in enumerate(((-.17,.10),(-.09,.16),(0,.24),(.09,.16),(.17,.10))):
 tube(f'Crown / spike {k}',(dx,.10-abs(dx)*.5,2.88),(dx*1.1,.13-abs(dx)*.5,2.88+hh),.045,.008,'gold',ROOT_OBJ,8)
ico('Crown / red gem',(0,.155,2.86),(.04,.025,.05),'gem',ROOT_OBJ,1)
rod('Crown / hairpin',(-.36,-.06,2.85),(.36,-.06,2.87),.022,'gold',ROOT_OBJ,8)
for s_ in (-1,1):ico('Crown / hairpin bead',(s_*.37,-.06,2.86),(.045,.045,.045),'goldlight',ROOT_OBJ,1)
B=Vector((0,-.22,2.84))
for s_ in (-1,1):
 lock('Ribbon / bow loop',[B,B+Vector((s_*.12,-.04,.10)),B+Vector((s_*.17,-.06,-.02)),B],.035,.035,'greenlight',ROOT_OBJ,.2,8,5)
 lock('Ribbon / jade streamer',[B+Vector((s_*.04,0,0))]+[B-D*((.21+ribbon*.15)*k)+Vector((0,0,-.09*k+.07*s_*k+.09*math.sin(k*1.5+s_*1.2)))for k in range(1,8)],.055,.03,'green',ROOT_OBJ,.12,8,5)  # <= ~1.8 units so the frame keeps 8px
# ---- Talisman with brush strokes and sparks; cast orbit.
TIP=None
if TAL is not None:
 talisman('Talisman / held',TAL,tal_up,tal_face,.58,ROOT_OBJ);TIP=TAL
 tr=tal_up.cross(tal_face).normalized()
 for k,(a,b) in enumerate(((.26,.36),(-.27,.30),(.29,-.28),(-.25,-.38))):
  c=TAL+tr*a+tal_up*b+tal_face*.02
  mesh(f'Talisman / spark {k}',[tuple(c+tr*.035),tuple(c+tal_up*.06),tuple(c-tr*.035),tuple(c-tal_up*.06)],[(0,1,2,3)],'bolt',ROOT_OBJ)
if POSE=='strike':
 for k in range(3):rod('Spark / trail',TAL-D*(.18+.16*k)+Vector((0,0,.05*(k%2))),TAL-D*(.30+.16*k),.02,'bolt',ROOT_OBJ,6)
if orbit:
 for k in range(5):
  a=2*math.pi*k/5+.3;c=Vector((1.02*math.cos(a),.86*math.sin(a),1.30+.10*math.sin(a*2)))
  talisman(f'Orbit / charm {k}',c,Z,CAM,.34,ROOT_OBJ,False)
 for k in range(3):
  a=k*2.1;base=TAL+Vector((.12*math.cos(a),.12*math.sin(a),.30))
  rod('Spark / crackle',TAL,base,.018,'bolt',ROOT_OBJ,6)
scene=bpy.context.scene
# Same studio as build_dwarf.py.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Taoist shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.8
camera.location=(7,10,7);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y+=(ground.y-(1-550/640));bpy.context.view_layer.update()
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm large key',(-4,6,8),850,4,(1,.83,.65))
area('Cool soft armor fill',(5,3,5),600,4,(.65,.83,1))
area('Warm edge light',(1,-5,7),1000,3,(1,.80,.52))
ROOT_OBJ.scale=(opts.scale,)*3
if TIP is not None:TIP=TIP*opts.scale
bpy.context.view_layer.update()
px=lambda v:(round(world_to_camera_view(scene,camera,v).x*opts.size,1),round((1-world_to_camera_view(scene,camera,v).y)*opts.size,1))
graph=bpy.context.evaluated_depsgraph_get();meshes=[o for o in COL.objects if o.type=='MESH'];tris=0
for o in meshes:
 me=o.evaluated_get(graph).to_mesh();me.calc_loop_triangles();tris+=len(me.loop_triangles)
info={'pose':POSE,'ground':px(Vector((0,0,0))),'talisman_px':px(TIP) if TIP is not None else None,'mesh_objects':len(meshes),'triangles':tris}
scene.render.filepath=str(OUT/f'tao-{POSE}.png');bpy.ops.render.render(write_still=True)
(OUT/f'tao-{POSE}.json').write_text(json.dumps(info))
print('ARCANA_TAO '+json.dumps(info))
