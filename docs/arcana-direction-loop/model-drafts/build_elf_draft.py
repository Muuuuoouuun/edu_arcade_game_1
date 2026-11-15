"""Author the editable elf archer Riel (리엘) and bake five shared-camera action sprites.

DRAFT from the direction loop (cycle 66, detail version cycle 89). Copy to tools/blender/build_elf.py to use.
Run: blender -b --python tools/blender/build_elf.py -- --pose windup
Options after --: --samples 128 --size 640 --pose idle|windup|strike|recover|cast --out DIR --scale 1.25
Same contract as build_dwarf.py / build_mage_draft.py: 640px frame, orthographic camera at (7,10,7)
looking at (0,0,1.7), ortho scale 5.8, ground origin projected to (320,550), native facing screen-right.
Reference: art-source/defense/atlases/ranged-motion.png (elf frames) — green hood with sideways pointed ears, long
wavy blond hair, leaf-embroidered cloak, leather bodice with leaf skirt plates, tall strapped boots, a twisted vine
bow with leaves, a quiver and a glowing green arrow.
Design history: cycle 50 spec (hood, tall bow arc, quiver fletchings, long blond hair; windup = full draw),
cycle 54 cloak colour (.006,.026,.009) so the 64px gray stays <= 90, cycle 58 bow rules (limb radius >= .07; in
windup/strike the bow plane holds the shot direction and Z), cycle 62 hero scale (displayScale 1.32 in art.ts),
cycle 66 body scale 1.25 about the ground origin.
Cycle 89 (detail standard, user request "more detailed modelling"): same camera contract and pose values for the
four attack poses, detail raised in six layers — face (brows, lids, lashes, nose, smile, blush, inner ears), hands
(fingers around the grip, hooked on the string, open on release), hair (fringe, long wavy side and back locks, a
braid with a leaf clip), hood (folded rim with a gold thread), clothes (leaf-point mantle
and cape hem, embroidered leaves, laced bodice, two rows of leaf skirt plates over a leaf-green underskirt, puffed
sleeves with cream cuffs and strapped bracers, strapped boots with leaf knee guards), props (smooth bow limb with a
twisting vine, curled tips and leaves, leather grip, quiver with straps, emblem and four fletched arrows, belt
pouch, bandolier buckle, faceted glowing arrowhead) and materials (lit greens, bright gold thread, light leather).
New fifth pose `cast` (별빛 화살비): the bow aims high at full draw and four star arrows fall ahead.
Bake: 207 mesh objects / 35,268 triangles (cast 238 / 37,104). Idle 40.4px on 844x390, 64px gray 83 (forest 33,
snow 73), 64px overlap Ian 0.53, Cheongun 0.57, Luna 0.41, Bron 0.50; launch points of the four attack poses are
unchanged. Five poses WebP q85 143,876 B, q80 127,184 B — just inside the 128 KB (q80) budget. Riel is the widest
hero in frame (bow, string, arrow), so bytes were tuned by ablation: the bowstring costs ~2.2 KB per pose and cannot
go, each bow leaf ~0.4 KB, vine turns and gold midribs ~1 KB each; hence one leaf per limb, under three vine turns,
ribs on the lower skirt row and every other mantle leaf only.
Each pose is built from pose parameters (hands, nock, string) in a fresh scene; a production script
should key the same values on pivots (body, head, hair, bow-arm, bow, draw-arm, nock, arrow, cape).
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
p.add_argument('--scale',type=float,default=1.25,help='whole-body scale about the ground origin (cycle 66: 1.25 so the elf reaches ~39px like the other heroes)')
opts=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(opts.out);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections): bpy.data.collections.remove(col)
COL=bpy.data.collections.new('Elf archer Riel / editable parts');bpy.context.scene.collection.children.link(COL)
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
def arrowhead(name,base,direction,r,h,mat,parent=None):
 """Faceted four-sided arrowhead: tip at base+direction*h, flat shaded."""
 b=Vector(base);d=Vector(direction).normalized();u=d.cross(CAM);u=u.normalized() if u.length>1e-4 else d.orthogonal().normalized();w=d.cross(u)
 verts=[tuple(b+d*h)]+[tuple(b+d*(h*.28)+u*(r*math.cos(k*math.pi/2))+w*(r*math.sin(k*math.pi/2))) for k in range(4)]+[tuple(b)]
 return mesh(name,verts,[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(5,2,1),(5,3,2),(5,4,3),(5,1,4)],mat,parent)
def sparkle(name,center,r,mat,parent=None):
 """Four-point star facing the camera (release sparks, star arrows)."""
 c=Vector(center);s=CAM.cross(Z).normalized();pts=[c+(s*math.cos(k*math.pi/4)+Z*math.sin(k*math.pi/4))*(r if k%2==0 else r*.3) for k in range(8)]
 return mesh(name,[tuple(p) for p in pts]+[tuple(p-CAM*.012) for p in pts],[tuple(range(8)),tuple(range(15,7,-1))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],mat,parent)

CLOAK=(.006,.026,.009)
M={
 'cloak':material('Cloth / deep forest cloak',CLOAK,0,.84),
 'cloaklight':material('Cloth / lit cloak folds',tuple(c*1.7 for c in CLOAK),0,.82),
 'lining':material('Cloth / cloak lining',tuple(c*.8 for c in CLOAK),0,.86),
 'leafcloth':material('Cloth / leaf-green layers',(.03,.12,.03),0,.8),
 'leather':material('Leather / bodice and skirt plates',(.20,.09,.035),0,.7),
 'leatherlight':material('Leather / lit plates',(.30,.15,.06),0,.66),
 'leatherdark':material('Leather / straps',(.10,.045,.018),0,.75),
 'legging':material('Cloth / dark leggings',(.015,.014,.012),0,.85),
 'boot':material('Leather / tall boots',(.24,.11,.04),0,.7),
 'bootlight':material('Leather / boot cuff and toe',(.36,.18,.07),0,.66),
 'cream':material('Cloth / cream cuff and lacing',(.74,.66,.48),0,.75),
 'gold':material('Trim / thin gold',(.82,.52,.13),.6,.36),
 'goldlight':material('Trim / bright gold thread',(.95,.70,.25),.5,.3,.15),
 'skin':material('Skin / fair warm',(.86,.55,.38),0,.62),
 'skinshade':material('Skin / nose and ear shade',(.72,.40,.28),0,.62),
 'blush':material('Skin / cheek blush',(.90,.40,.30),0,.7),
 'mouth':material('Face / mouth line',(.35,.08,.06),0,.6),
 'brow':material('Face / dark blond brow',(.36,.21,.07),0,.7),
 'lid':material('Face / upper lid line',(.10,.05,.03),0,.6),
 'hair':material('Hair / long blond',(.52,.31,.075),0,.7),
 'hairlight':material('Hair / sunlit strands',(.68,.44,.13),0,.66),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / green iris',(.10,.45,.15),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'wood':material('Bow / dark wood',(.30,.15,.05),0,.55),
 'vine':material('Bow / vine wrap',(.05,.20,.05),0,.72),
 'leaf':material('Bow / leaves',(.13,.44,.10),0,.7),
 'string':material('Bow / string',(.85,.82,.70),0,.5),
 'shaft':material('Arrow / shaft',(.55,.40,.22),0,.6),
 'fletch':material('Arrow / fletching',(.85,.82,.62),0,.7),
 'tip':material('Arrow / glowing tip',(.30,.85,.20),0,.2,1.1),
 'tipcore':material('Arrow / bright tip core',(.70,1.0,.50),0,.2,2.6),
 'gem':material('Brooch / leaf-green gem',(.05,.50,.12),0,.1,.4),
}

# ---------------- pose parameters (world units, Blender +Y forward, screen-right shot dir D) ----------------
D=Vector((-.82,.57,0)).normalized();Z=Vector((0,0,1));SIDE=D.cross(Z).normalized()
SB=Vector((-.42,.02,1.72));SD=Vector((.42,.02,1.72))
POSE=opts.pose;rain=False
if POSE=='idle':
 HB=Vector((-.66,.30,1.18));bow_up=Vector((0,0,1));bow_fwd=(D*.6+Vector((0,0,-.2))).normalized();nock_pull=.30;arrow=False;HD=Vector((.58,.22,1.22));cape_back=0;hair_back=0
elif POSE=='windup':
 HB=SB+D*.66;bow_up=Z;bow_fwd=D;nock_pull=.95;arrow=True;HD=None;cape_back=.05;hair_back=.02
elif POSE=='strike':
 HB=SB+D*.70;bow_up=Z;bow_fwd=D;nock_pull=.30;arrow=False;HD=SB.lerp(SD,.5)-D*.95+Vector((0,-.10,.22));cape_back=.22;hair_back=.16
elif POSE=='recover':
 HB=SB+D*.52+Vector((0,0,-.22));bow_up=(Z*.95+D*.3).normalized();bow_fwd=(D-bow_up*D.dot(bow_up)).normalized();nock_pull=.30;arrow=False;HD=Vector((.30,-.32,2.02));cape_back=.08;hair_back=.06
else: # cast — 별빛 화살비: the bow aims high, full draw, four star arrows fall ahead (cycle 89)
 bow_fwd=(D*.56+Z*.83).normalized();bow_up=(Z*.56-D*.83).normalized();HB=SB+D*.34+Z*.50;nock_pull=.95;arrow=True;HD=None;cape_back=.12;hair_back=.08;rain=True
NOCK=HB-bow_fwd*nock_pull
if HD is None:HD=NOCK
drawn=POSE in('windup','cast')

ROOT_OBJ=group('elf-archer-riel')
ROOT_OBJ['asset']='Arcana elf archer Riel / detailed draft (cycle 89)'
# ---- Tall boots: sole, toe cap, straps with buckles, leaf knee guard, folded cuff; dark leggings.
for side,x in [('right',-.24),('left',.24)]:
 cube(f'{side} boot / sole',(x,.06,.05),(.32,.52,.10),'leatherdark',ROOT_OBJ,.04)
 ico(f'{side} boot / foot',(x,.10,.18),(.17,.28,.15),'boot',ROOT_OBJ)
 ico(f'{side} boot / toe cap',(x,.29,.16),(.14,.11,.11),'bootlight',ROOT_OBJ)
 cyl(f'{side} boot / tall shaft',(x,0,.42),.16,.52,'boot',ROOT_OBJ,14)
 for k,z in enumerate((.32,.50)):
  cyl(f'{side} boot / strap {k}',(x,0,z),.168,.045,'leatherdark',ROOT_OBJ,14,.006)
  cube(f'{side} boot / strap buckle {k}',(x+.09,.14,z),(.06,.03,.055),'gold',ROOT_OBJ,.008)
 leaf(f'{side} boot / leaf knee guard',(x,.168,.56),(x,.20,.96),.24,'leatherlight',ROOT_OBJ,'goldlight',(0,1,.12))
 cyl(f'{side} boot / folded cuff',(x,0,.70),.18,.07,'bootlight',ROOT_OBJ,14,.01)
 rod(f'{side} leg / legging',(x,0,.70),(x*.8,0,1.02),.14,'legging',ROOT_OBJ,12)
# ---- Skirt: leaf-green underskirt and two rows of leather leaf plates with gold midribs.
lathe('Skirt / forest-green underskirt',[(1.18,.39,.31,0),(.98,.46,.36,0),(.84,.51,.40,0)],'cloaklight',ROOT_OBJ,24,(),.025)
for row,(n,off,zt,out,w,mat) in enumerate(((9,0,.74,1.50,.40,'leather'),(9,.5,.92,1.30,.34,'leatherlight'))):
 for i in range(n):
  a=2*math.pi*(i+off)/n;c,s_=math.cos(a),math.sin(a)
  leaf(f'Skirt / leather leaf plate {row}-{i}',(.40*c*.95,.32*s_*.95,1.17),(.40*c*out,.32*s_*out,zt),w,mat,ROOT_OBJ,None if row else 'goldlight',(c,s_,.5))
# ---- Torso: leather bodice with cream lacing and seams, belt with a leaf buckle and pouch, bandolier.
ico('Torso / leather bodice',(0,0,1.50),(.40,.30,.38),'leather',ROOT_OBJ)
for k,z in enumerate((1.34,1.44,1.54)):
 rod(f'Bodice / lace a{k}',(-.055,.292,z),(.055,.297,z+.075),.009,'cream',ROOT_OBJ,6);rod(f'Bodice / lace b{k}',(.055,.292,z),(-.055,.297,z+.075),.009,'cream',ROOT_OBJ,6)
for s_ in (-1,1):lock('Bodice / side seam',[(s_*.20,.262,1.66),(s_*.23,.255,1.48),(s_*.21,.25,1.30)],.008,.008,'leatherdark',ROOT_OBJ,1,5,3)
lock('Bodice / gold neckline',[(-.30,.20,1.72),(-.13,.285,1.66),(0,.30,1.63),(.13,.285,1.66),(.30,.20,1.72)],.012,.012,'gold',ROOT_OBJ,1,5,4)
cube('Belt / strap',(0,0,1.20),(.80,.64,.10),'leatherdark',ROOT_OBJ,.04)
leaf('Belt / gold leaf buckle',(-.085,.335,1.20),(.085,.335,1.20),.12,'gold',ROOT_OBJ,'goldlight',(0,1,0))
cube('Belt / side pouch',(.33,.20,1.07),(.16,.14,.18),'leather',ROOT_OBJ,.04)
cube('Belt / pouch flap',(.33,.21,1.13),(.18,.15,.07),'leatherlight',ROOT_OBJ,.025);uv('Belt / pouch button',(.33,.29,1.11),(.022,.013,.022),'goldlight',ROOT_OBJ)
lock('Chest / bandolier',[(-.33,.20,1.86),(-.14,.315,1.66),(.10,.315,1.46),(.32,.22,1.28)],.05,.05,'leatherdark',ROOT_OBJ,.3,8,4)
cube('Chest / bandolier buckle',(-.02,.335,1.56),(.08,.03,.07),'gold',ROOT_OBJ,.008)
# ---- Mantle: green cowl with a leaf-point edge, gold trim and a leaf brooch.
uv('Mantle / green cowl',(0,-.02,1.80),(.50,.40,.18),'cloak',ROOT_OBJ)
MP=lambda a,s=1.0,z=1.775:Vector((.50*s*math.cos(a),-.02+.40*s*math.sin(a),z))
lock('Mantle / gold trim',[MP(2*math.pi*i/28,1.005) for i in range(29)],.014,.014,'gold',ROOT_OBJ,1,5,1)
for k in range(8):
 a=2*math.pi*(k+.5)/8;leaf(f'Mantle / leaf point {k}',MP(a,.97),MP(a,1.10,1.50),.34,'cloaklight',ROOT_OBJ,'goldlight' if k%2==0 else None,(math.cos(a),math.sin(a),.35))
leaf('Brooch / gold leaf',(0,.385,1.86),(0,.405,1.70),.10,'gold',ROOT_OBJ,'goldlight',(0,1,.2));ico('Brooch / green gem',(0,.41,1.80),(.026,.018,.03),'gem',ROOT_OBJ,1)
# ---- Cape: folds, leaf-point hem with a gold line, side edges and embroidered leaves; flares back on the release.
CR=[(1.82,.46,-.28),(1.52,.56,-.38-cape_back*.3),(1.22,.66,-.46-cape_back*.6),(.92,.74,-.53-cape_back*.85),(.66,.80,-.58-cape_back)];CC=8;cv=[]
for r,(z,w,y) in enumerate(CR):
 for i in range(CC+1):
  x=(i/CC-.5)*w*2;cv.append(Vector((x,y+(.045 if i%2 else -.045)*(.4+.15*r),z-(.11 if (r==4 and i%2) else 0))))
cp=mesh('Cape / forest cloak',[tuple(p) for p in cv],[(r*(CC+1)+c,r*(CC+1)+c+1,(r+1)*(CC+1)+c+1,(r+1)*(CC+1)+c) for r in range(4) for c in range(CC)],'cloak',ROOT_OBJ)
cp.data.materials.append(M['lining'])
for face in cp.data.polygons:face.material_index=(face.index%CC)%2
cp.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
lock('Cape / leaf-point gold hem',cv[4*(CC+1):],.022,.022,'gold',ROOT_OBJ,1,6,2)
for i,nm in ((0,'left'),(CC,'right')):lock(f'Cape / gold side edge {nm}',[cv[r*(CC+1)+i] for r in range(5)],.018,.018,'gold',ROOT_OBJ,1,6,3)
for k,(c,r) in enumerate(((7,1),(7,3),(6,2))):
 p=(cv[r*(CC+1)+c]+cv[r*(CC+1)+c+1])/2+Vector((0,.05,0))
 leaf(f'Cape / embroidered leaf {k}',p+Vector((0,0,.10)),p-Vector((.0,0,.12)),.13,'leafcloth',ROOT_OBJ,None,(0,1,0))
# ---- Quiver on the back: straps, gold rim, leaf emblem, four fletched arrows (silhouette cue: fletchings over the shoulder).
qa,qb=Vector((.12,-.40,1.20)),Vector((.46,-.30,2.28));qd=(qb-qa).normalized();qrot=qd.to_track_quat('Z','Y').to_euler()
rod('Quiver / leather tube',qa,qb,.13,'leather',ROOT_OBJ,14)
uv('Quiver / bottom cap',qa,(.13,.13,.09),'leatherdark',ROOT_OBJ)
cyl('Quiver / gold rim',qb,.15,.06,'gold',ROOT_OBJ,14,0).rotation_euler=qrot
for k,t in enumerate((.28,.70)):cyl(f'Quiver / strap band {k}',qa.lerp(qb,t),.138,.06,'leatherdark',ROOT_OBJ,14,.006).rotation_euler=qrot
leaf('Quiver / leaf emblem',qa.lerp(qb,.36)+CAM*.135,qa.lerp(qb,.62)+CAM*.135,.13,'leaf',ROOT_OBJ,'goldlight')
for k,(ox,oy) in enumerate(((-.07,-.02),(.0,.05),(.07,-.02))):
 base=qb+Vector((ox,oy,0));top=base+qd*(.30+.03*(k%2))
 rod(f'Quiver / arrow shaft {k}',base,top,.02,'shaft',ROOT_OBJ,6)
 for v in (Vector((0,-.09,.02)),Vector((.08,.03,.02))):mesh(f'Quiver / fletching {k}',[tuple(top-qd*.14),tuple(top-qd*.07+v),tuple(top+v*.6),tuple(top)],[(0,1,2,3)],'fletch',ROOT_OBJ).modifiers.new('Vane thickness','SOLIDIFY').thickness=.01
# ---- Head: face with brows, lids and lashes, nose, smile, blush; sideways pointed ears (cycle 50 cue).
uv('Face / round head',(0,.06,2.28),(.42,.38,.40),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',(side*.15,.40,2.27),(.095,.04,.11),'eyewhite',ROOT_OBJ)
 uv('Face / green iris',(side*.14,.43,2.26),(.065,.025,.085),'iris',ROOT_OBJ)
 uv('Face / pupil',(side*.14,.448,2.26),(.032,.012,.045),'pupil',ROOT_OBJ)
 uv('Face / eye shine',(side*.12,.455,2.30),(.02,.01,.02),'eyewhite',ROOT_OBJ)
 lock('Face / upper lid',[(side*.255,.365,2.325),(side*.16,.445,2.39),(side*.055,.435,2.345)],.013,.011,'lid',ROOT_OBJ,1,6,5)
 rod('Face / lash',(side*.25,.37,2.33),(side*.295,.36,2.365),.008,'lid',ROOT_OBJ,5)
 lock('Face / brow',[(side*.26,.34,2.435),(side*.165,.40,2.475),(side*.07,.415,2.455)],.016,.010,'brow',ROOT_OBJ,.7,6,5)
 uv('Face / cheek blush',(side*.255,.35,2.165),(.065,.013,.038),'blush',ROOT_OBJ)
 tube(f'Ear / pointed {side}',(side*.38,.04,2.30),(side*.72,-.06,2.41),.075,.012,'skin',ROOT_OBJ)
 lock(f'Ear / inner shade {side}',[(side*.41,.085,2.305),(side*.52,.06,2.34),(side*.63,.02,2.375)],.02,.006,'skinshade',ROOT_OBJ,.5,5,3)
uv('Face / nose',(0,.44,2.20),(.026,.02,.024),'skinshade',ROOT_OBJ)
lock('Face / smile',[(-.055,.42,2.115),(0,.435,2.093),(.055,.42,2.115)],.01,.01,'mouth',ROOT_OBJ,1,6,4)
# ---- Hood: rounded cowl with a lit crown and a folded rim with a gold thread.
uv('Hood / rounded cowl',(0,-.04,2.42),(.50,.48,.44),'cloak',ROOT_OBJ)
uv('Hood / lit crown',(0,-.06,2.66),(.36,.34,.18),'cloaklight',ROOT_OBJ)
RIM=[Vector((.455*math.cos(t),.40-.20*abs(math.cos(t))**2.2,2.335+.47*math.sin(t))) for t in [math.radians(-52+284*i/16) for i in range(17)]]
lock('Hood / folded rim',RIM,.055,.055,'cloaklight',ROOT_OBJ,.55,8,3)
lock('Hood / rim gold thread',[p+Vector((0,.035,0)) for p in RIM],.010,.010,'goldlight',ROOT_OBJ,1,5,3)
# ---- Hair: fringe under the rim, long wavy side and back locks, a braid with a leaf clip.
for k,(x0,x1,x2,zt) in enumerate(((-.05,-.20,-.33,2.40),(.02,-.08,-.20,2.45),(.06,.10,.16,2.47),(.10,.24,.34,2.41))):   # side-swept bangs
 lock(f'Hair / fringe lock {k}',[(x0,.37,2.63),(x1,.45,2.55),(x2,.455,zt)],.085,.02,'hairlight' if k%2 else 'hair',ROOT_OBJ,.55,8,5)
for side in (-1,1):
 sway=Vector((side,0,0))
 lock('Hair / long side lock',wavy((side*.39,.20,2.40),Vector((side*.45,.30,1.52))-D*hair_back*.5,sway,.05,3),.085,.02,'hair',ROOT_OBJ,.75,8,3)
 lock('Hair / outer side lock',wavy((side*.43,.10,2.38),Vector((side*.54,.13,1.66))-D*hair_back*.7,sway,.05,3),.075,.018,'hairlight',ROOT_OBJ,.75,8,3)
for k in range(9):
 x=(k-4)*.085
 lock(f'Hair / long back lock {k}',wavy((x,-.36,2.14),Vector((x*1.45,-.50,1.02+.06*math.cos(k*1.7)))-D*(.10+hair_back*1.5),-D,.06,3),.11,.024,'hairlight' if k%3==1 else 'hair',ROOT_OBJ,.8,8,3)
BR=spline([(.36,.27,2.40),(.40,.34,2.12),(.42,.37,1.86),(.40,.36,1.66)],3)
for k,p in enumerate(BR):uv(f'Hair / braid bead {k}',p,(.055,.05,.05),'hair' if k%2 else 'hairlight',ROOT_OBJ)
uv('Hair / braid green tie',BR[-1]-Vector((0,0,.04)),(.04,.04,.03),'leaf',ROOT_OBJ)
lock('Hair / braid tail',[BR[-1]-Vector((0,0,.06)),BR[-1]+Vector((.02,.01,-.16)),BR[-1]+Vector((.05,.0,-.24))],.04,.01,'hairlight',ROOT_OBJ,.7,6,3)
leaf('Hair / leaf clip',BR[0]+Vector((.03,.03,.02)),BR[0]+Vector((.16,.05,.10)),.07,'leaf',ROOT_OBJ,'goldlight')
# ---- Arms: puffed sleeve, cream cuff, leather bracer with straps and a gold rim, hands with fingers.
for name,sh,hand in [('Bow',SB,HB),('Draw',SD,HD)]:
 mid=sh.lerp(hand,.5);ax=(hand-sh).normalized();rot=ax.to_track_quat('Z','Y').to_euler()
 uv(name+' arm / puffed shoulder',sh+ax*.03,(.14,.14,.125),'cloaklight',ROOT_OBJ)
 rod(name+' arm / sleeve',sh,mid,.11,'cloak',ROOT_OBJ,12)
 cyl(name+' arm / cream cuff',mid-ax*.03,.125,.06,'cream',ROOT_OBJ,14,.012).rotation_euler=rot
 rod(name+' arm / bracer',mid,hand-ax*.05,.10,'leather',ROOT_OBJ,12)
 cyl(name+' arm / gold rim',mid+ax*.03,.108,.035,'gold',ROOT_OBJ,14,0).rotation_euler=rot
 for k,t in enumerate((.45,.75)):cyl(name+f' arm / bracer strap {k}',mid.lerp(hand,t),.105,.03,'leatherdark',ROOT_OBJ,14,0).rotation_euler=rot
 uv(name+' hand / palm',hand,(.085,.08,.09),'skin',ROOT_OBJ)
bs=bow_up.cross(CAM);bs=bs.normalized() if bs.length>1e-4 else SIDE
for k,dz in enumerate((.058,.02,-.018,-.056)):uv(f'Bow hand / curled finger {k}',HB+CAM*.085+bow_up*dz,(.034,.032,.022),'skin',ROOT_OBJ)
rod('Bow hand / thumb',HB+CAM*.05+bs*.05+bow_up*.02,HB+CAM*.09+bs*.02+bow_up*.10,.02,'skin',ROOT_OBJ,8)
FD={'idle':Vector((0,.25,-1)),'windup':bow_fwd,'cast':bow_fwd,'strike':Z*.35-D,'recover':(qb-HD)}[POSE].normalized()
fs=FD.cross(CAM);fs=fs.normalized() if fs.length>1e-4 else SIDE
if drawn:
 for k,off in enumerate((-.04,0,.04)):uv(f'Draw hand / hooked finger {k}',HD+bow_fwd*.07+bow_up*off,(.03,.03,.026),'skin',ROOT_OBJ)
 rod('Draw hand / thumb',HD-bow_up*.06,HD-bow_up*.085+bow_fwd*.05,.02,'skin',ROOT_OBJ,8)
else:
 for k,off in enumerate((-.045,-.015,.015,.045)):rod(f'Draw hand / open finger {k}',HD+fs*off+FD*.05,HD+fs*off*1.3+FD*(.16-abs(off)*.5),.018,'skin',ROOT_OBJ,8)
 rod('Draw hand / thumb',HD-fs*.055,HD-fs*.10+FD*.06,.02,'skin',ROOT_OBJ,8)
# ---- Bow: tall arc in the plane (bow_up, bow_fwd) — cycle 58 rule — smooth limb r .072, one twisting vine, leaves, curled tips.
H=1.45;SAG=.36;R=.072
arc=lambda t:HB+bow_up*(H*t)-bow_fwd*(SAG*t*t)
pts=[arc(i/20-1) for i in range(41)]
lock('Bow / upper limb',pts[20:],R,R*.86,'wood',ROOT_OBJ,1,10,1);lock('Bow / lower limb',pts[20::-1],R,R*.86,'wood',ROOT_OBJ,1,10,1)
for nm,rng in (('upper',range(21,41)),('lower',range(19,-1,-1))):
 lock(f'Bow / twisting vine {nm}',[pts[i]+(bs*math.cos(i*.42)+bow_fwd*math.sin(i*.42))*(R+.008) for i in rng],.024,.016,'vine',ROOT_OBJ,1,6,2)   # under three turns per limb: more turns cost WebP bytes without reading at game size
for end,sgn in ((pts[-1],1),(pts[0],-1)):
 lock('Bow / curled tip',[end,end+bow_up*(.10*sgn)+bow_fwd*.07,end+bow_up*(.12*sgn)+bow_fwd*.17,end+bow_up*(.05*sgn)+bow_fwd*.21],R*.8,.02,'wood',ROOT_OBJ,1,8,4)
for i,s_ in [(9,-1),(31,1)]:   # one leaf per limb: each extra leaf costs ~0.4 KB per pose at q80 (cycle 89 ablation)
 c=pts[i];leaf('Bow / leaf',c+bow_fwd*.05,c+bow_fwd*.24+bs*(.10*s_)+bow_up*(.07*s_),.11,'leaf',ROOT_OBJ,None)
grot=bow_up.to_track_quat('Z','Y').to_euler()
cyl('Bow / leather grip',HB,.086,.24,'leatherdark',ROOT_OBJ,12,0).rotation_euler=grot
for sgn in (-1,1):cyl('Bow / grip gold ring',HB+bow_up*(.13*sgn),.092,.03,'gold',ROOT_OBJ,12,0).rotation_euler=grot
rod('Bow / upper string',pts[-1],NOCK,.014,'string',ROOT_OBJ,6);rod('Bow / lower string',pts[0],NOCK,.014,'string',ROOT_OBJ,6)
ARROWHEAD=None
def arrow_at(name,nock,direction,length,glow=True):
 d=Vector(direction).normalized();tipp=nock+d*length;u=d.cross(CAM);u=u.normalized() if u.length>1e-4 else SIDE;w=d.cross(u)
 rod(name+' / shaft',nock,tipp,.026 if glow else .014,'shaft' if glow else 'tip',ROOT_OBJ,8)
 vw=.085 if glow else .05
 for v in (u,w,-u):mesh(name+' / fletching vane',[tuple(nock+d*.03),tuple(nock+d*.06+v*vw),tuple(nock+d*.20+v*vw),tuple(nock+d*.25)],[(0,1,2,3)],'fletch' if glow else 'tip',ROOT_OBJ).modifiers.new('Vane thickness','SOLIDIFY').thickness=.008
 arrowhead(name+' / faceted tip',tipp,d,.075 if glow else .05,.24 if glow else .16,'tip',ROOT_OBJ)
 if glow:ico(name+' / tip core',tipp+d*.08+CAM*.03,(.03,.03,.05),'tipcore',ROOT_OBJ,1)
 return tipp+d*.10
if arrow:ARROWHEAD=arrow_at('Arrow',NOCK,bow_fwd,1.12)
if POSE=='strike':   # release: leaves and sparks fly ahead of the bow (painted strike frame)
 for k,(f,u_,s_) in enumerate(((.46,.08,1),)):
  c=HB+bow_fwd*f+bow_up*u_;leaf(f'Release / flying leaf {k}',c,c+bow_fwd*.16+bow_up*(.06*s_),.08,'leaf',ROOT_OBJ,None)
 sparkle('Release / spark',HB+bow_fwd*.56+bow_up*.14,.06,'tipcore',ROOT_OBJ)
if rain:             # cast: four star arrows fall ahead of the archer, sparkles between them
 fall=(D*.30-Z).normalized()
 for k in range(4):
  top=HB+D*(.08+.26*k)+Z*(1.18-.12*abs(k-1.5)+.05*(k%2));arrow_at(f'Star arrow {k}',top,fall,.44,False)
  sparkle(f'Star arrow {k} / star',top-fall*.06,.06,'tipcore',ROOT_OBJ)
 for k,(f,z_) in enumerate(((.30,.70),(.74,.62))):sparkle(f'Star rain / sparkle {k}',HB+D*f+Z*z_,.045,'tip',ROOT_OBJ)
scene=bpy.context.scene
# Same studio as build_dwarf.py.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=opts.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=opts.size;scene.render.resolution_y=opts.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Elf shared orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=5.8
camera.location=(7,10,7);target=Vector((0,0,1.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y+=(ground.y-(1-550/640));bpy.context.view_layer.update()
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm large key',(-4,6,8),850,4,(1,.83,.65))
area('Cool soft armor fill',(5,3,5),600,4,(.65,.83,1))
area('Warm edge light',(1,-5,7),1000,3,(1,.80,.52))
ROOT_OBJ.scale=(opts.scale,)*3;NOCK=NOCK*opts.scale;HB=HB*opts.scale
if ARROWHEAD:ARROWHEAD=ARROWHEAD*opts.scale
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
px=lambda v:(round(world_to_camera_view(scene,camera,v).x*opts.size,1),round((1-world_to_camera_view(scene,camera,v).y)*opts.size,1))
graph=bpy.context.evaluated_depsgraph_get();meshes=[o for o in COL.objects if o.type=='MESH'];tris=0
for o in meshes:
 me=o.evaluated_get(graph).to_mesh();me.calc_loop_triangles();tris+=len(me.loop_triangles)
info={'pose':POSE,'ground':px(Vector((0,0,0))),'nock_px':px(NOCK),'arrowhead_px':px(ARROWHEAD) if ARROWHEAD else None,'bow_grip_px':px(HB),'mesh_objects':len(meshes),'triangles':tris}
scene.render.filepath=str(OUT/f'elf-{POSE}.png');bpy.ops.render.render(write_still=True)
(OUT/f'elf-{POSE}.json').write_text(json.dumps(info))
print('ARCANA_ELF '+json.dumps(info))
