"""Author the editable fire mage Ian (이안) and bake four shared-camera action sprites.

DRAFT from the direction loop (cycle 46, detail version cycle 86). Copy to tools/blender/build_mage.py to use.
Run: blender -b --python tools/blender/build_mage.py
Options after --: --samples 128 --size 640 --only idle|windup|strike|recover|cast --skip-render --out DIR --scale .95
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
Cycle 77: taller, less drooping hat tip (64px overlap with Riel's draft 0.64 -> 0.52), --scale .95 with displayScale
1.32 (idle 40.6px on 844x390), fifth pose `cast` (유성 낙하): staff raised overhead and a meteor above the crystal
(--only cast). Five poses at WebP q85 = 92,620 B.
Cycle 86 (detail standard, user request "more detailed modelling"): same camera contract, pivots, pose values,
--scale .95 and crystal launch point; detail raised in six layers — face (curved brows, upper lids, nose, smile,
blush, inner ears), hands (four fingers and a thumb around the staff, open free hand), hair (cap, seven spiky
fringe locks, six side locks, nine nape locks), hat (wavy brim with a gold edge, embroidered brim stars, band lines,
stars and ember studs, cone creases, tip charm), clothes (pleated robe skirt with a scalloped gold hem and star
embroidery, cream under-robe with folds, tunic buttons, scalloped shoulder mantle, collar brooch with ribbon tails,
cape with folds, jagged gold hem and stars, bell sleeves with a cream inner sleeve and gold lines), props (buckle
star, belt tail, pouch flap, spell book on a strap, laced boots with buckles, staff ferrule, leather grip wrap,
spiral grain, curved claw prongs with thorns, faceted crystal with a glowing core, floating shards, hanging charm)
and materials (lit navy, bright gold thread, light wood). Helpers `spline`/`lock` come from build_tao_draft.py;
`ring`, `helix`, `flatstar`, `shard` are new. The manifest adds mesh_objects and triangles.
The staff used to pass through the hat brim (shaft inside the brim radius since cycle 46): the staff hand moved out
to (-.91,.55,1.34), the shaft is .25 longer and the claw narrower, so the claw opens above the brim. Launch points
moved with it (crystal_center_px now reads the empty `crystal-center` at the crystal middle); the strike pose uses
staff-arm (.55,0,.85) / staff (-1.58,0,0) to keep a 28px frame margin.
Bake: 263 mesh objects / 48,946 triangles (cycle 77: 107 / 20,919; cast 275 / 49,970). Idle 40.6px on 844x390,
64px gray 82 (forest 34, snow 74), 64px overlap Riel 0.52, Cheongun 0.47, Luna 0.49, Bron 0.48. Five poses WebP
q85 128,664 B, q80 113,996 B (cycle 77: 92,620 / 82,120) — inside the proposed 128 KB (q80) budget.
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
p.add_argument('--only',choices=['idle','windup','strike','recover','cast'])
p.add_argument('--scale',type=float,default=.95,help='whole-body scale about the ground origin (cycle 77: the taller hat makes ~40.5px idle on an 844x390 screen with displayScale 1.32)')
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
 'crystal':material('Crystal / warm fire facets',(.80,.13,.01),0,.12,.45),   # cycle 86: darker body so the facets read; the glow sits in the core
 'core':material('Crystal / bright ember core',(1.0,.55,.08),0,.1,3.5),
 'flame':material('Cast / meteor fire',(.95,.20,.01),0,.35,.9),
 'flamecore':material('Cast / meteor hot core',(1.0,.42,.04),0,.3,1.6),
 'creamshade':material('Cloth / cream fold shade',(.55,.45,.30),0,.8),
 'book':material('Book / deep red leather',(.28,.04,.03),0,.6),
 'skinshade':material('Skin / nose and ear shade',(.72,.40,.28),0,.62),
 'mouth':material('Face / mouth line',(.35,.08,.06),0,.6),
 'brow':material('Face / dark blond brow',(.36,.21,.07),0,.7),
 'lid':material('Face / upper lid line',(.10,.05,.03),0,.6),
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

# ---------------- cycle 86 detail helpers (spline/lock as in build_tao_draft.py) ----------------
CAM=Vector((7,10,0)).normalized();Z=Vector((0,0,1))      # flat ribbons and stars face the camera
def spline(points,n=6):
 """Catmull-Rom curve through the points."""
 P=[Vector(p) for p in points];P=[P[0]]+P+[P[-1]];out=[]
 for i in range(1,len(P)-2):
  for k in range(n):
   t=k/n;t2=t*t;t3=t2*t
   out.append(.5*((2*P[i])+(P[i+1]-P[i-1])*t+(2*P[i-1]-5*P[i]+4*P[i+1]-P[i+2])*t2+(3*P[i]-P[i-1]-3*P[i+1]+P[i+2])*t3))
 out.append(P[-2]);return out
def lock(name,points,r0,r1,mat,parent=None,flat=1.0,seg=8,n=6):
 """Tapered tube along a curve: hair lock, ribbon (flat < 1 faces the camera), cord, trim line."""
 pts=spline(points,n);m=len(pts);verts=[]
 for i,p in enumerate(pts):
  r=r0+(r1-r0)*i/(m-1);d=(pts[min(i+1,m-1)]-pts[max(i-1,0)]).normalized();u=d.cross(CAM)
  u=u.normalized() if u.length>1e-4 else d.orthogonal().normalized();w=d.cross(u).normalized()
  for k in range(seg):
   a=2*math.pi*k/seg;verts.append(tuple(p+u*(r*math.cos(a))+w*(r*flat*math.sin(a))))
 faces=[(i*seg+k,i*seg+(k+1)%seg,(i+1)*seg+(k+1)%seg,(i+1)*seg+k) for i in range(m-1) for k in range(seg)]
 faces+=[tuple(range(seg-1,-1,-1)),tuple(range((m-1)*seg,m*seg))]
 return mesh(name,verts,faces,mat,parent,0,True)
def ring(cx,cy,z,rx,ry,k=24,a0=0,a1=2*math.pi,dz=None):
 """Points on an ellipse (closed when a0..a1 is a full turn); dz(a) lifts each point."""
 return [Vector((cx+rx*math.cos(a),cy+ry*math.sin(a),z+(dz(a) if dz else 0))) for a in [a0+(a1-a0)*i/k for i in range(k+1)]]
def helix(x,y,z0,z1,r,turns,k=8):
 """Spiral around a vertical shaft: grip wrap, wood grain."""
 n=max(2,int(turns*k));return [Vector((x+r*math.cos(2*math.pi*i/k),y+r*math.sin(2*math.pi*i/k),z0+(z1-z0)*i/n)) for i in range(n+1)]
def flatstar(name,center,r,mat,parent=None,points=4,thick=.014):
 """Star lying flat (facing up): embroidery on the hat brim."""
 c=Vector(center);n=2*points;top=[c+Vector(((r if k%2==0 else r*.38)*math.cos(k*math.pi/points),(r if k%2==0 else r*.38)*math.sin(k*math.pi/points),0)) for k in range(n)]
 verts=[tuple(v) for v in top]+[tuple(v-Z*thick) for v in top]
 faces=[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
 return mesh(name,verts,faces,mat,parent)
def shard(name,center,r,h,mat,parent=None,sides=6,low=.8,waist=.2):
 """Faceted crystal: apex, upper ring, narrower lower ring, bottom apex. Flat shaded so the facets read."""
 c=Vector(center);verts=[tuple(c+Z*h)]
 for z,rr in ((h*waist,r),(-h*waist*1.2,r*low)):
  verts+=[tuple(c+Vector((rr*math.cos(2*math.pi*i/sides+.3),rr*math.sin(2*math.pi*i/sides+.3),z))) for i in range(sides)]
 verts.append(tuple(c-Z*h*.85));b=2*sides+1
 faces=[(0,1+i,1+(i+1)%sides) for i in range(sides)]+[(1+i,1+sides+i,1+sides+(i+1)%sides,1+(i+1)%sides) for i in range(sides)]+[(b,1+sides+(i+1)%sides,1+sides+i) for i in range(sides)]
 return mesh(name,verts,faces,mat,parent)

ROOT_OBJ=group('fire-mage-ian')
ROOT_OBJ['asset']='Arcana fire mage Ian / detailed draft (cycle 86)'
ROOT_OBJ['forward']='Blender +Y; game sprite faces right'
body=group('body',(0,0,.95),ROOT_OBJ)
head=group('head',(0,.02,1.92),body)
hat=group('hat',(0,.02,2.72),head)
staff_arm=group('staff-arm',(-.46,.02,1.74),body)
staff=group('staff',(-.91,.55,1.34),staff_arm)   # cycle 86: hand held out so the shaft clears the hat brim (was (-.66,.40,1.30), inside the brim radius)
free_arm=group('free-arm',(.46,.02,1.74),body)
cape=group('cape',(0,-.26,1.84),body)

# ---- Boots: sole, toe cap, laces, ankle strap with a buckle, folded cuff. Legs stay grounded in every pose.
for side,x in [('right',-.27),('left',.27)]:
 cube(f'{side} boot / sole',(x,.08,.05),(.36,.56,.10),'sole',ROOT_OBJ,.04)
 ico(f'{side} boot / leather foot',(x,.12,.19),(.19,.30,.17),'boot',ROOT_OBJ)
 ico(f'{side} boot / toe cap',(x,.31,.17),(.15,.12,.12),'bootlight',ROOT_OBJ)
 lock(f'{side} boot / toe stitch',[(x-.13,.33,.215),(x,.40,.255),(x+.13,.33,.215)],.010,.010,'goldlight',ROOT_OBJ,1,5,4)
 cyl(f'{side} boot / shaft',(x,0,.36),.17,.34,'boot',ROOT_OBJ,14)
 cyl(f'{side} boot / ankle strap',(x,0,.30),.178,.05,'belt',ROOT_OBJ,14,.006)
 cube(f'{side} boot / strap buckle',(x+.10,.145,.30),(.07,.03,.06),'gold',ROOT_OBJ,.008)
 for k,z in enumerate((.40,.45,.50)):rod(f'{side} boot / lace {k}',(x-.07,.158,z),(x+.07,.158,z+.02*(1 if k%2 else -1)),.011,'cream',ROOT_OBJ,6)
 cyl(f'{side} boot / folded cuff',(x,0,.55),.20,.10,'bootlight',ROOT_OBJ,14)
 lock(f'{side} boot / cuff stitch',ring(x,0,.585,.203,.203,16),.008,.008,'goldlight',ROOT_OBJ,1,5,1)
 rod(f'{side} leg / trouser',(x,0,.56),(x*.8,0,.98),.15,'trouser',ROOT_OBJ,12)

# ---- Robe skirt: pleated navy bell, open at the front over the cream under-robe; scalloped gold hem, star embroidery.
SK=[(1.32,.40,.32,0),(1.0,.52,.42,0),(.72,.68,.54,-.02),(.46,.84,.66,-.05)]
def skirt_r(z):
 for (z0,a0,b0,c0),(z1,a1,b1,c1) in zip(SK,SK[1:]):
  if z1<=z<=z0:
   t=(z0-z)/(z0-z1);return a0+(a1-a0)*t,b0+(b1-b0)*t,c0+(c1-c0)*t
 return SK[0][1:] if z>SK[0][0] else SK[-1][1:]
PLEATS=11;SEG=60;SLIT=range(12,18)          # 72..108 degrees: the front slit
def skirt_pt(a,z,out=1.0,depth=.085):
 rx,ry,cy=skirt_r(z);k=out*(1+depth*max(0,(1.32-z)/.86)**1.4*math.cos(PLEATS*a));return Vector((rx*k*math.cos(a),cy+ry*k*math.sin(a),z))
def pleated(name,z0,z1,mat,rows=6,scale=1.0,thick=.03,hem=.035):
 verts=[]
 for r in range(rows+1):
  z=z0+(z1-z0)*r/rows
  for i in range(SEG):
   a=2*math.pi*i/SEG;p=skirt_pt(a,z,scale);verts.append((p.x,p.y,z+(hem*math.cos(PLEATS*a) if abs(z-.46)<1e-6 else 0)))
 faces=[(r*SEG+i,r*SEG+(i+1)%SEG,(r+1)*SEG+(i+1)%SEG,(r+1)*SEG+i) for r in range(rows) for i in range(SEG) if i not in SLIT]
 o=mesh(name,verts,faces,mat,body,0,True);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=thick;return o
pleated('Robe / pleated navy skirt',1.32,.46,'robe')
pleated('Robe / gold hem band',.56,.46,'gold',rows=1,scale=1.045,thick=.012)
A0,A1=math.radians(108),math.radians(432)
lock('Robe / gold thread line',[skirt_pt(A0+(A1-A0)*i/120,.66,1.05) for i in range(121)],.013,.013,'goldlight',body,1,5,1)
for k in range(PLEATS):
 a=2*math.pi*k/PLEATS
 if math.radians(66)<a<math.radians(114):continue
 lock(f'Robe / lit pleat ridge {k}',[skirt_pt(a,1.12-.52*i/4,1.045) for i in range(5)],.020,.030,'robelight',body,.45,6,2)
for k,(deg,z) in enumerate(((-22,.80),(4,.94),(30,.78),(56,.96),(124,.80),(146,.95),(172,.78),(215,.92),(258,.80),(300,.94))):
 a=math.radians(deg);star(f'Robe / gold star embroidery {k}',skirt_pt(a,z,1.10),(math.cos(a),math.sin(a),.3),.068 if k%2 else .05,'goldlight',body)
for a_deg,nm in ((72,'near'),(108,'far')):
 lock(f'Robe / gold front edge {nm}',[skirt_pt(math.radians(a_deg),1.32-.86*i/6,1.015)+(Z*(.035*math.cos(PLEATS*math.radians(a_deg))) if i==6 else Z*0) for i in range(7)],.03,.03,'gold',body,1,6,2)
# Cream under-robe: a folded panel with a thread line at the pointed hem.
UR=[];NC=6
for r,z in enumerate((1.22,.98,.74,.52)):
 w=.15+.10*r/3;y=skirt_r(z)[1]*.97+skirt_r(z)[2]
 UR+=[Vector(((c/NC-.5)*2*w,y+(.012 if c%2 else -.012)-.03*abs(c/NC-.5),z-(.05*(1-abs(c/NC-.5)*2) if r==3 else 0))) for c in range(NC+1)]
o=mesh('Under-robe / cream folded panel',[tuple(p) for p in UR],[(r*(NC+1)+c,r*(NC+1)+c+1,(r+1)*(NC+1)+c+1,(r+1)*(NC+1)+c) for r in range(3) for c in range(NC)],'cream',body,0,False)
o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.02
lock('Under-robe / hem thread',[p+Vector((0,.012,.035)) for p in UR[3*(NC+1):]],.009,.009,'gold',body,1,5,2)
for c in (2,4):lock('Under-robe / fold shade',[UR[r*(NC+1)+c]+Vector((0,.008,0)) for r in range(4)],.008,.008,'creamshade',body,1,5,2)
# ---- Torso: tunic with a gold placket and buttons, belt with a star buckle, belt tail, pouch and a spell book.
ico('Torso / navy tunic',(0,0,1.50),(.44,.34,.40),'robelight',body)
lock('Tunic / gold placket',[(0,.325,1.62),(0,.345,1.48),(0,.335,1.33)],.011,.011,'gold',body,1,5,3)
for k,z in enumerate((1.56,1.46,1.36)):uv(f'Tunic / gold button {k}',(0,.345-.004*k,z),(.026,.016,.026),'goldlight',body)
cube('Belt / brown leather',(0,0,1.24),(.86,.70,.13),'belt',body,.05)
for z in (1.295,1.185):lock(f'Belt / stitch line {z}',ring(0,0,z,.432,.352,28),.006,.006,'bootlight',body,1,5,1)
cube('Belt / gold buckle',(0,.36,1.24),(.20,.06,.17),'gold',body,.02)
star('Belt / buckle star',(0,.397,1.24),(0,1,0),.055,'goldlight',body)
lock('Belt / hanging tail',[(.10,.365,1.23),(.17,.40,1.13),(.165,.415,1.02)],.036,.03,'belt',body,.3,8,4)
uv('Belt / tail gold tip',(.165,.418,1.00),(.03,.015,.03),'gold',body)
cube('Belt / side pouch',(.36,.22,1.10),(.18,.16,.20),'belt',body,.05)
cube('Belt / pouch flap',(.36,.232,1.165),(.20,.17,.085),'bootlight',body,.03)
uv('Belt / pouch button',(.36,.322,1.14),(.024,.014,.024),'goldlight',body)
BA=math.radians(124);BC=skirt_pt(BA,1.03,1.16);BN=Vector((math.cos(BA),math.sin(BA),0))
bk=cube('Book / red leather cover',BC,(.17,.065,.22),'book',body,.012);bk.rotation_euler=(0,0,BA-math.pi/2)
pg=cube('Book / cream pages',BC-Vector((0,0,.006))+BN.cross(Z)*.012,(.15,.045,.20),'cream',body,.004);pg.rotation_euler=(0,0,BA-math.pi/2)
star('Book / gold cover star',BC+BN*.036,tuple(BN),.045,'goldlight',body)
cl=cube('Book / gold clasp',BC+BN*.02-BN.cross(Z)*.085,(.03,.075,.05),'gold',body,.006);cl.rotation_euler=(0,0,BA-math.pi/2)
lock('Book / hanging strap',[skirt_pt(BA,1.24,1.12),BC+Vector((0,0,.16))+BN*.01,BC+Vector((0,0,.11))+BN*.02],.014,.014,'belt',body,.5,6,3)
# ---- Shoulder mantle: scalloped navy cowl with gold edges and dots, cream collar, brooch with ribbon tails.
ico('Mantle / shoulder cowl',(0,-.02,1.78),(.56,.44,.20),'robe',body)
MP=lambda a,s=1.0,z=1.765:Vector((.56*s*math.cos(a),-.02+.44*s*math.sin(a),z))
lock('Mantle / gold trim',[MP(2*math.pi*i/30,1.005) for i in range(31)],.018,.018,'gold',body,1,6,1)
for k in range(10):
 a=2*math.pi*(k+.5)/10;d=.26;tip=MP(a,1.07,1.565)
 mesh(f'Mantle / scallop point {k}',[tuple(MP(a-d)),tuple(MP(a+d)),tuple(tip)],[(0,1,2)],'robe',body).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
 lock(f'Mantle / scallop gold edge {k}',[MP(a-d,1.01),tip+Vector((0,0,-.01)),MP(a+d,1.01)],.013,.013,'gold',body,1,5,3)
 uv(f'Mantle / gold dot {k}',MP(a,.80,1.90),(.022,.022,.012),'goldlight',body)
ico('Collar / cream shirt',(0,.20,1.86),(.20,.16,.10),'cream',body)
for s_ in (-1,1):lock('Collar / cream lapel',[(s_*.03,.385,1.885),(s_*.10,.40,1.845),(s_*.13,.405,1.80)],.05,.012,'cream',body,.3,8,4)
star('Brooch / gold star',(0,.435,1.775),(0,1,.25),.075,'goldlight',body)
ico('Brooch / ember gem',(0,.452,1.78),(.026,.02,.03),'crystal',body,1)
for s_ in (-1,1):
 lock('Brooch / navy ribbon tail',[(s_*.02,.44,1.75),(s_*.07,.465,1.63),(s_*.105,.455,1.52)],.036,.026,'robelight',body,.25,8,4)
 uv('Brooch / ribbon gold tip',(s_*.108,.458,1.50),(.022,.012,.022),'gold',body)
# ---- Back cape: folds, jagged gold hem, gold side edges and embroidered stars; flares back on the strike.
CR=[(1.82,.50,-.30),(1.50,.60,-.40),(1.18,.70,-.49),(.86,.80,-.57),(.60,.88,-.62)];CC=10;cv=[]
for r,(z,w,y) in enumerate(CR):
 for i in range(CC+1):
  x=(i/CC-.5)*w*2;cv.append(Vector((x,y+(.05 if i%2 else -.05)*(.4+.15*r),z-(.10 if (r==4 and i%2) else 0))))
cf=[(r*(CC+1)+c,r*(CC+1)+c+1,(r+1)*(CC+1)+c+1,(r+1)*(CC+1)+c) for r in range(4) for c in range(CC)]
cp=mesh('Cape / navy back cape',[tuple(p) for p in cv],cf,'robe',cape)
cp.data.materials.append(M['lining'])
for face in cp.data.polygons:face.material_index=(face.index%CC)%2
cp.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
lock('Cape / jagged gold hem',cv[4*(CC+1):],.026,.026,'gold',cape,1,6,2)
for i,nm in ((0,'left'),(CC,'right')):lock(f'Cape / gold side edge {nm}',[cv[r*(CC+1)+i] for r in range(5)],.02,.02,'gold',cape,1,6,3)
for k,(c,r,rr) in enumerate(((9,1,.05),(9,2,.04),(8,3,.055),(1,2,.045),(1,3,.05),(5,3,.04))):
 p=(cv[r*(CC+1)+c]+cv[r*(CC+1)+c+1 if c<CC else r*(CC+1)+c-1]+cv[(r+1)*(CC+1)+c])/3
 star(f'Cape / gold star {k}',p+Vector((0,.045,0)),(0,1,0),rr,'goldlight',cape)

# ---- Arms: puffed shoulder, bell sleeve with gold lines and a star, cream inner sleeve, hands with fingers.
for name,x,par,hand in [('Staff',-.46,staff_arm,(-.91,.55,1.34)),('Free',.46,free_arm,(.62,.24,1.26))]:
 sh=Vector((x,.02,1.74));hv=Vector(hand);mid=sh.lerp(hv,.45);d=(hv-sh).normalized()
 uv(name+' sleeve / puffed shoulder',sh+d*.03,(.135,.135,.12),'robe',par)
 rod(name+' sleeve / upper',sh,mid,.12,'robe',par,12)
 tube(name+' sleeve / bell cuff',mid-d*.05,hv-d*.06,.13,.22,'robelight',par,18)
 tube(name+' sleeve / gold cuff ring',hv-d*.09,hv-d*.04,.225,.225,'gold',par,18)
 q=(mid-d*.05).lerp(hv-d*.06,.45);tube(name+' sleeve / gold thread line',q-d*.011,q+d*.011,.176,.180,'goldlight',par,18)
 tube(name+' sleeve / cream inner sleeve',hv-d*.17,hv-d*.015,.125,.10,'cream',par,14)
 star(name+' sleeve / gold star',(mid-d*.05).lerp(hv-d*.06,.70)+CAM*.232,tuple(CAM),.05,'goldlight',par)
 uv(name+' hand / palm',hv,(.085,.08,.095),'skin',par)
HS=Vector((-.91,.55,1.34));SIDE=CAM.cross(Z).normalized()
for k,dz in enumerate((.058,.02,-.018,-.056)):uv(f'Staff hand / curled finger {k}',HS+CAM*.078+Z*dz,(.036,.034,.021),'skin',staff_arm)
rod('Staff hand / thumb',HS+CAM*.05+SIDE*.055+Z*.03,HS+CAM*.085+SIDE*.02+Z*.105,.021,'skin',staff_arm,8)
HFr=Vector((.62,.24,1.26));FD=Vector((.30,.80,-.20)).normalized();FS=FD.cross(CAM).normalized()
for k,off in enumerate((-.048,-.016,.016,.048)):rod(f'Free hand / open finger {k}',HFr+FS*off+FD*.05,HFr+FS*off*1.35+FD*(.165-abs(off)*.5),.019,'skin',free_arm,8)
rod('Free hand / thumb',HFr-FS*.055-FD*.01,HFr-FS*.105+FD*.06,.021,'skin',free_arm,8)

# ---- Head: face with curved brows, upper lids, nose, smile, blush and inner ears.
uv('Face / round head',(0,.04,2.30),(.44,.40,.42),'skin',head)
for side in (-1,1):
 uv('Face / ear',(side*.43,.02,2.28),(.07,.06,.10),'skin',head);uv('Face / inner ear',(side*.445,.05,2.28),(.035,.04,.06),'skinshade',head)
 uv('Face / eye white',(side*.16,.40,2.28),(.10,.04,.12),'eyewhite',head)
 uv('Face / blue iris',(side*.15,.43,2.27),(.07,.025,.09),'iris',head)
 uv('Face / pupil',(side*.15,.448,2.27),(.035,.012,.05),'pupil',head)
 uv('Face / eye shine',(side*.13,.455,2.31),(.02,.01,.02),'eyewhite',head)
 lock('Face / upper lid',[(side*.265,.365,2.335),(side*.165,.45,2.405),(side*.06,.44,2.355)],.014,.011,'lid',head,1,6,5)
 lock('Face / brow',[(side*.27,.345,2.45),(side*.17,.405,2.50),(side*.07,.42,2.465)],.021,.012,'brow',head,.7,6,5)
 uv('Face / cheek blush',(side*.265,.355,2.17),(.07,.014,.04),'blush',head)
uv('Face / nose',(0,.458,2.215),(.028,.022,.026),'skinshade',head)
lock('Face / smile',[(-.06,.435,2.125),(0,.452,2.10),(.06,.435,2.125)],.011,.011,'mouth',head,1,6,4)
# ---- Hair: cap under the hat, seven spiky fringe locks, six side locks, nine short nape locks.
uv('Hair / cap',(0,-.05,2.44),(.45,.41,.33),'hair',head)
for k in range(-3,4):
 lock(f'Hair / fringe lock {k}',[(k*.06,.20,2.69),(k*.118,.40,2.60),(k*.148,.475,2.50-abs(k)*.012),(k*.16+.03*(1 if k>=0 else -1),.47-abs(k)*.012,2.43-abs(k)*.028)],.075,.010,'hairlight' if k%2 else 'hair',head,.6,8,5)   # tips reach under the brim's shadow line
for side in (-1,1):
 lock('Hair / front side lock',[(side*.33,.24,2.58),(side*.44,.29,2.36),(side*.43,.33,2.15)],.06,.012,'hair',head,.7,8,5)
 lock('Hair / ear side lock',[(side*.40,.10,2.56),(side*.50,.12,2.32),(side*.47,.16,2.12)],.058,.012,'hairlight',head,.7,8,5)
 lock('Hair / flicked side lock',[(side*.42,-.02,2.52),(side*.53,-.04,2.33),(side*.60,.0,2.25)],.055,.011,'hair',head,.7,8,5)
for k in range(9):
 a=math.radians(196+k*18.5);c,s_=math.cos(a),math.sin(a)
 lock(f'Hair / nape lock {k}',[(.38*c,-.05+.36*s_,2.52),(.45*c,-.05+.43*s_,2.28),(.50*c,-.05+.49*s_,2.08+.05*(k%2))],.10,.018,'hairlight' if k%3==1 else 'hair',head,.8,8,5)

# ---- Hat: wavy brim with a gold edge and embroidered stars, gold band with stars and ember studs, creased cone, tip charm.
BW=lambda a:.05*math.sin(3*a+.6)
lathe('Hat / wavy brim',[(2.755,.44,.44,.04),(2.74,.66,.66,.04),(2.715,.88,.88,.04)],'robe',hat,40,(),.05,True,lambda r,i:(0,.4,1)[r]*BW(2*math.pi*i/40))
lock('Hat / brim gold edge',ring(0,.04,2.715,.885,.885,40,dz=BW),.03,.03,'gold',hat,1,6,1)
lock('Hat / brim gold thread',ring(0,.04,2.75,.56,.56,32,dz=lambda a:.2*BW(a)),.009,.009,'goldlight',hat,1,5,1)
for k in range(10):
 a=2*math.pi*k/10+.2;c=(.70*math.cos(a),.04+.70*math.sin(a),2.80+.55*BW(a))
 if k%2:flatstar(f'Hat / brim star {k}',c,.075,'goldlight',hat)
 else:uv(f'Hat / brim gold dot {k}',c,(.026,.026,.012),'goldlight',hat)
cyl('Hat / gold band',(0,.0,2.82),.47,.14,'gold',hat,24,.01)
for z in (2.765,2.885):lock(f'Hat / band thread {z}',ring(0,0,z,.476,.476,28),.011,.011,'goldlight',hat,1,5,1)
rings=[]
for k in range(11):  # cycle 77: taller, less drooping tip so Ian's head peak parts from Riel's round hood at 64px
 t=k/10;z=2.78+t*1.32;r=.46*(1-t)**1.05+.015
 back=-.40*t**2.4;side=.26*t**2.6
 rings.append((z-(.18*t**3.2),r,r*.95,back,side))
cone=lathe('Hat / tall drooping cone',rings,'robelight',hat,20,(),0,True)
for k in (3,5,7):
 z,r,ry,cy,cx=rings[k];lock(f'Hat / cone crease {k}',ring(cx,cy,z,r*1.012,ry*1.012,20,dz=lambda a:.018*math.sin(2*a+k)),.008,.008,'robe',hat,1,5,1)
for k,deg in enumerate((90,48,6,132,174)):
 a=math.radians(deg);star(f'Hat / band star {k}',(.475*math.cos(a),.475*math.sin(a),2.825),(math.cos(a),math.sin(a),0),.10 if k==0 else .075,'goldlight',hat)
for k,deg in enumerate((69,27,111,153)):
 a=math.radians(deg);ico(f'Hat / band ember stud {k}',(.478*math.cos(a),.478*math.sin(a),2.825),(.028,.028,.036),'crystal',hat,1)
star('Hat / gold star cone',(.14,.12,3.26),(.8,.55,.2),.07,'goldlight',hat)
z5,r5,ry5,cy5,cx5=rings[5];star('Hat / gold star high cone',(cx5+r5*.62,cy5+ry5*.80,z5),(.6,.78,.2),.05,'goldlight',hat)
TIPV=Vector((rings[-1][4],rings[-1][3],rings[-1][0]))
uv('Hat / tip bead',TIPV,(.055,.055,.055),'gold',hat)
lock('Hat / tip charm cord',[TIPV,TIPV+Vector((.02,-.03,-.10)),TIPV+Vector((.0,-.04,-.19))],.008,.008,'gold',hat,1,5,3)
star('Hat / tip star charm',TIPV+Vector((0,-.04,-.25)),tuple(CAM),.06,'goldlight',hat)

# ---- Claw staff: ferrule, knots, leather grip wrap, spiral grain, curved prongs with thorns, faceted crystal, charm.
sx,sy=-.91,.55;TOP=2.52                     # cycle 86: shaft .25 longer and a narrower claw, so the claw opens above the brim
rod('Staff / wooden shaft',(sx,sy,.12),(sx,sy,TOP),.072,'wood',staff,10)
tube('Staff / gold ferrule',(sx,sy,.10),(sx,sy,.24),.06,.086,'gold',staff,12)
for z in (.80,2.00):cyl('Staff / grain ring',(sx,sy,z),.085,.05,'woodlight',staff,10)
lock('Staff / leather grip wrap',helix(sx,sy,1.16,1.54,.078,5.5),.017,.017,'belt',staff,1,5,1)
lock('Staff / spiral grain low',helix(sx,sy,.30,.74,.074,2.5),.009,.009,'woodlight',staff,1,5,1)
lock('Staff / spiral grain mid',helix(sx,sy,1.62,1.94,.074,2),.009,.009,'woodlight',staff,1,5,1)
lock('Staff / spiral grain high',helix(sx,sy,2.08,2.38,.074,2),.009,.009,'woodlight',staff,1,5,1)
uv('Staff / wood knot',(sx+.055,sy+.045,.95),(.034,.03,.042),'woodlight',staff);uv('Staff / wood knot',(sx-.03,sy+.065,2.22),(.03,.028,.036),'woodlight',staff)
cyl('Staff / gold collar',(sx,sy,TOP-.02),.10,.10,'gold',staff,12)
for z in (TOP-.075,TOP+.035):cyl('Staff / collar bright rim',(sx,sy,z),.108,.022,'goldlight',staff,14,.004)
for k in range(4):
 a=k*math.pi/2+math.pi/4;c,s_=math.cos(a),math.sin(a);base=Vector((sx,sy,TOP+.01))
 P1,P2,P3=base+Vector((.12*c,.12*s_,.15)),base+Vector((.21*c,.21*s_,.40)),base+Vector((.11*c,.11*s_,.64))
 lock(f'Staff / curved claw prong {k}',[base,P1,P2,P3],.045,.02,'woodlight',staff,1,8,5)
 uv(f'Staff / claw gold tip {k}',P3,(.03,.03,.04),'gold',staff)
 rod(f'Staff / claw thorn {k}',P2,P2+Vector((.08*c,.08*s_,.07)),.015,'woodlight',staff,6)
CRY=Vector((sx,sy,TOP+.41))
shard('Crystal / warm fire crystal',CRY,.165,.35,'crystal',staff)
ico('Crystal / ember core',CRY+CAM*.10+Z*.02,(.045,.032,.11),'core',staff,1)
for k,(dx,dy,dz,rr) in enumerate(((.22,.10,.22,.042),(-.20,.14,.06,.034),(.08,-.20,.36,.03))):
 shard(f'Crystal / floating ember shard {k}',CRY+Vector((dx,dy,dz)),rr,rr*2.2,'flame',staff,4)
lock('Staff / charm cord',[(sx+.10,sy+.03,TOP-.03),(sx+.17,sy+.06,TOP-.15),(sx+.165,sy+.07,TOP-.28)],.008,.008,'gold',staff,1,5,3)
uv('Staff / charm bead',(sx+.165,sy+.07,TOP-.30),(.022,.022,.022),'crystal',staff)
star('Staff / star charm',(sx+.165,sy+.075,TOP-.37),tuple(CAM),.055,'goldlight',staff)
MUZZLE=group('crystal-center',tuple(CRY-Z*.03),staff)   # crystal middle: spell windup/launch point (manifest crystal_center_px)
TIP=(sx,sy,TOP+.75)

# Poses: (x,y,z) euler radians per pivot. Legs and root never move; the shared camera never moves.
POSES={
 'idle':   {'frame':1, 'body':(0,0,0),       'head':(0,0,0),      'hat':(0,0,0),      'staff-arm':(0,0,0),         'staff':(0,0,0),       'free-arm':(0,0,0),        'cape':(0,0,0)},
 'windup': {'frame':5, 'body':(.07,0,-.10),  'head':(.06,0,0),    'hat':(-.07,0,0),   'staff-arm':(1.15,0,.45),    'staff':(-1.25,0,0),    'free-arm':(.55,-.70,0),   'cape':(.08,0,0)},
 'strike': {'frame':9, 'body':(-.10,0,.16),  'head':(-.04,0,.14), 'hat':(.14,0,0),    'staff-arm':(.55,0,.85),     'staff':(-1.58,0,0),   'free-arm':(-.55,-.35,0),  'cape':(-.38,0,0)},
 # cycle 77: cast (유성 낙하) — staff raised upright overhead, free hand up, a meteor above the crystal
 'cast':   {'frame':21,'body':(-.04,0,.05),  'head':(-.10,0,.05), 'hat':(.10,0,0),    'staff-arm':(2.20,0,.10),    'staff':(-2.20,0,0),   'free-arm':(2.00,0,-.20),  'cape':(-.10,0,0)},
 'recover':{'frame':13,'body':(-.03,0,.06),  'head':(-.02,0,.05), 'hat':(-.04,0,0),   'staff-arm':(.40,0,.35),     'staff':(-.45,0,0),    'free-arm':(.35,-.45,0),   'cape':(-.12,0,0)},
}
PIVOTS={'body':body,'head':head,'hat':hat,'staff-arm':staff_arm,'staff':staff,'free-arm':free_arm,'cape':cape}
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=21
# Meteor for the cast pose only (shown on its frame).
MC=Vector((-1.00,.70,4.05))
METEOR=[shard('Cast / meteor rock',MC,.30,.34,'flame',ROOT_OBJ,7,.9,.45),ico('Cast / meteor core',MC+CAM*.17,(.10,.07,.12),'flamecore',ROOT_OBJ,1)]
for k in range(6):
 a=k*1.05;off=Vector((.16*math.cos(a),.16*math.sin(a),0))
 METEOR.append(lock(f'Cast / flame tongue {k}',[MC+off*.6+Z*.10,MC+off*1.3+Vector((.10,-.12,.34)),MC+off*.9+Vector((.24,-.28,.62+.06*(k%3))),MC+off*.3+Vector((.36,-.42,.86+.08*(k%2)))],.085,.010,'flamecore' if k%2 else 'flame',ROOT_OBJ,1,6,4))
for k,(dx,dy,dz) in enumerate(((-.42,.10,-.10),(.30,.34,-.24),(-.20,-.36,.18),(.46,-.10,.30))):
 METEOR.append(shard(f'Cast / ember spark {k}',MC+Vector((dx,dy,dz)),.045,.10,'flamecore',ROOT_OBJ,4))
for o in METEOR:
 for f,show in ((1,False),(20,False),(21,True)):o.hide_render=not show;o.hide_viewport=not show;o.keyframe_insert('hide_render',frame=f);o.keyframe_insert('hide_viewport',frame=f)
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

ROOT_OBJ.scale=(opts.scale,)*3
scene.frame_set(1);bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
manifest={'id':'fire-mage-ian','generator':'model-drafts/build_mage_draft.py (cycle 46, cycle 77 hat/scale/cast, cycle 86 detail)','blender':bpy.app.version_string,'nativeFacing':1,
 'frame':{'width':opts.size,'height':opts.size,'ground':[round(ground.x*opts.size,3),round((1-ground.y)*opts.size,3)],'orthographic_scale':cam_data.ortho_scale},
 'pivot_names':list(PIVOTS),'poses':[]}
for name,pose in POSES.items():
 if opts.only and name!=opts.only:continue
 scene.frame_set(pose['frame']);bpy.context.view_layer.update()
 graph=bpy.context.evaluated_depsgraph_get();pixels=[]
 for o in COL.objects:
  if o.type!='MESH' or o.hide_render:continue
  ev=o.evaluated_get(graph)
  for corner in ev.bound_box:
   v=world_to_camera_view(scene,camera,ev.matrix_world@Vector(corner));pixels.append((v.x*opts.size,(1-v.y)*opts.size))
 cc=world_to_camera_view(scene,camera,MUZZLE.evaluated_get(graph).matrix_world.translation)
 shown=[o for o in COL.objects if o.type=='MESH' and not o.hide_render];tris=0
 for o in shown:
  me=o.evaluated_get(graph).to_mesh();me.calc_loop_triangles();tris+=len(me.loop_triangles);o.evaluated_get(graph).to_mesh_clear()
 manifest['poses'].append({'name':name,'file':f'mage-{name}.png','frame':pose['frame'],
  'projected_mesh_bbox':[round(min(v[0] for v in pixels),1),round(min(v[1] for v in pixels),1),round(max(v[0] for v in pixels),1),round(max(v[1] for v in pixels),1)],
  'crystal_center_px':[round(cc.x*opts.size,1),round((1-cc.y)*opts.size,1)],'mesh_objects':len(shown),'triangles':tris})
 if not opts.skip_render:
  scene.render.filepath=str(OUT/f'mage-{name}.png');bpy.ops.render.render(write_still=True)
scene.frame_set(1);bpy.context.view_layer.update()
(OUT/'mage-model.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if opts.blend:
 Path(opts.blend).parent.mkdir(parents=True,exist_ok=True)
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=opts.blend)
print('ARCANA_MAGE_COMPLETE '+json.dumps(manifest,ensure_ascii=False))
