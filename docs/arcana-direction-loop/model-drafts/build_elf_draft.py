"""Author the editable elf archer Riel (리엘) and bake four shared-camera action sprites.

DRAFT from the 3-hour direction loop (cycle 66). Copy to tools/blender/build_elf.py to use.
Run: blender -b --python tools/blender/build_elf.py -- --pose windup
Options after --: --samples 128 --size 640 --pose idle|windup|strike|recover --out DIR
Same contract as build_dwarf.py / build_mage_draft.py: 640px frame, orthographic camera at (7,10,7)
looking at (0,0,1.7), ortho scale 5.8, ground origin projected to (320,550), native facing screen-right.
Design: cycle 50 spec (hood, tall bow arc, quiver fletchings, long blond hair; windup = full draw),
cycle 54 cloak colour (.006,.026,.009) so the 64px gray stays <= 90 (apart from Luna's ivory skirt),
cycle 58 bow rules (limb radius >= .07; in windup/strike the bow plane holds the shot direction and Z),
cycle 62 hero scale (use displayScale 1.32 in art.ts). Cycle 66 bake: at scale 1 the elf was 31~35px on an
844x390 screen (shorter than common monsters), so the whole body is scaled 1.25 about the ground origin. The arrowhead glows like ElfDraw (#d6ffa0).
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
p.add_argument('--pose',choices=['idle','windup','strike','recover'],default='idle')
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


CLOAK=(.006,.026,.009)
M={
 'cloak':material('Cloth / deep forest cloak',CLOAK,0,.84),
 'cloaklight':material('Cloth / lit cloak folds',tuple(c*1.45 for c in CLOAK),0,.82),
 'lining':material('Cloth / cloak lining',tuple(c*.8 for c in CLOAK),0,.86),
 'leather':material('Leather / bodice and skirt plates',(.20,.09,.035),0,.7),
 'leatherdark':material('Leather / straps',(.10,.045,.018),0,.75),
 'legging':material('Cloth / dark leggings',(.015,.014,.012),0,.85),
 'boot':material('Leather / tall boots',(.24,.11,.04),0,.7),
 'gold':material('Trim / thin gold',(.82,.52,.13),.6,.36),
 'skin':material('Skin / fair warm',(.86,.55,.38),0,.62),
 'hair':material('Hair / long blond',(.70,.45,.14),0,.7),
 'hairlight':material('Hair / sunlit strands',(.85,.60,.25),0,.66),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / green iris',(.10,.45,.15),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'wood':material('Bow / dark wood',(.30,.15,.05),0,.55),
 'vine':material('Bow / vine wrap',(.10,.35,.08),0,.7),
 'leaf':material('Bow / leaves',(.14,.46,.10),0,.7),
 'string':material('Bow / string',(.85,.82,.70),0,.5),
 'shaft':material('Arrow / shaft',(.55,.40,.22),0,.6),
 'fletch':material('Arrow / fletching',(.85,.82,.62),0,.7),
 'tip':material('Arrow / glowing tip',(.55,1.0,.35),0,.2,2.2),
}

# ---------------- pose parameters (world units, Blender +Y forward, screen-right shot dir D) ----------------
D=Vector((-.82,.57,0)).normalized();Z=Vector((0,0,1));SIDE=D.cross(Z).normalized()
SB=Vector((-.42,.02,1.72));SD=Vector((.42,.02,1.72))
POSE=opts.pose
if POSE=='idle':
 HB=Vector((-.66,.30,1.18));bow_up=Vector((0,0,1));bow_fwd=(D*.6+Vector((0,0,-.2))).normalized();draw=None;nock_pull=.30;arrow=False;HD=Vector((.58,.22,1.22));cape_back=0;hair_back=0
elif POSE=='windup':
 HB=SB+D*.66;bow_up=Z;bow_fwd=D;nock_pull=.95;arrow=True;HD=None;cape_back=.05;hair_back=.02
elif POSE=='strike':
 HB=SB+D*.70;bow_up=Z;bow_fwd=D;nock_pull=.30;arrow=False;HD=SB.lerp(SD,.5)-D*.95+Vector((0,-.10,.22));cape_back=.22;hair_back=.16
else:
 HB=SB+D*.52+Vector((0,0,-.22));bow_up=(Z*.95+D*.3).normalized();bow_fwd=(D-bow_up*D.dot(bow_up)).normalized();nock_pull=.30;arrow=False;HD=Vector((.30,-.32,2.02));cape_back=.08;hair_back=.06
NOCK=HB-bow_fwd*nock_pull
if POSE=='windup':HD=NOCK

ROOT_OBJ=group('elf-archer-riel')
ROOT_OBJ['asset']='Arcana elf archer Riel / draft'
# Boots, leggings and skirt plates stay grounded.
for side,x in [('right',-.24),('left',.24)]:
 cube(f'{side} boot / sole',(x,.06,.05),(.32,.52,.10),'leatherdark',ROOT_OBJ,.04)
 ico(f'{side} boot / foot',(x,.10,.18),(.17,.28,.15),'boot',ROOT_OBJ)
 cyl(f'{side} boot / tall shaft',(x,0,.42),.16,.52,'boot',ROOT_OBJ,14)
 cyl(f'{side} boot / cuff',(x,0,.70),.18,.07,'gold',ROOT_OBJ,14,0)
 rod(f'{side} leg / legging',(x,0,.70),(x*.8,0,1.02),.14,'legging',ROOT_OBJ,12)
for i in range(7):
 a=math.radians(-150+i*50);x,y=.42*math.cos(a),.34*math.sin(a)
 mesh(f'Skirt / leather plate {i}',[(x*.8,y*.8,1.18),(x*1.05,y*1.05,1.18),(x*1.35,y*1.35,.80),(x*1.05,y*1.05,.80)],[(0,1,2,3)],'leather',ROOT_OBJ)
ico('Torso / leather bodice',(0,0,1.50),(.40,.30,.38),'leather',ROOT_OBJ)
cube('Belt / strap',(0,0,1.20),(.80,.64,.10),'leatherdark',ROOT_OBJ,.04)
cube('Belt / gold buckle',(0,.33,1.20),(.14,.05,.12),'gold',ROOT_OBJ,.02)
rod('Chest / bandolier',(-.36,.28,1.86),(.36,.28,1.28),.04,'leatherdark',ROOT_OBJ,8)
ico('Mantle / green cowl',(0,-.02,1.80),(.50,.40,.18),'cloak',ROOT_OBJ)
# Cape flares back on the release.
cv=[]
for z,w,y in [(1.82,.46,-.28),(1.30,.62,-.44-cape_back*.6),(.70,.78,-.58-cape_back)]:
 for i in range(7):
  x=(i/6-.5)*w*2;cv.append((x,y+(.04 if i%2 else -.05),z))
cf=[(r*7+c,r*7+c+1,(r+1)*7+c+1,(r+1)*7+c) for r in range(2) for c in range(6)]
cp=mesh('Cape / forest cloak',cv,cf,'cloak',ROOT_OBJ);cp.data.materials.append(M['lining'])
for face in cp.data.polygons:face.material_index=face.index%2
cp.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
for i in range(6):rod('Cape / gold hem',cv[14+i],cv[15+i],.025,'gold',ROOT_OBJ,8)
# Quiver on the back with three fletchings over the shoulder (silhouette cue ③).
qa,qb=Vector((.12,-.40,1.20)),Vector((.46,-.30,2.28))
rod('Quiver / leather tube',qa,qb,.13,'leather',ROOT_OBJ,12)
cyl('Quiver / gold rim',qb,.15,.06,'gold',ROOT_OBJ,12,0).rotation_euler=(qb-qa).to_track_quat('Z','Y').to_euler()
for k,off in enumerate((-.08,0,.08)):
 base=qb+Vector((off,0,0));top=base+(qb-qa).normalized()*.32
 rod(f'Quiver / arrow shaft {k}',base,top,.022,'shaft',ROOT_OBJ,6)
 mesh(f'Quiver / fletching {k}',[tuple(top),tuple(top+Vector((0,-.10,.10))),tuple(top+Vector((0,.06,.16)))],[(0,1,2)],'fletch',ROOT_OBJ)
# Head under a rounded hood (silhouette cue ②: round top, no upright ears).
uv('Face / round head',(0,.06,2.28),(.42,.38,.40),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',(side*.15,.40,2.27),(.095,.04,.11),'eyewhite',ROOT_OBJ)
 uv('Face / green iris',(side*.14,.43,2.26),(.065,.025,.085),'iris',ROOT_OBJ)
 uv('Face / pupil',(side*.14,.448,2.26),(.032,.012,.045),'pupil',ROOT_OBJ)
 uv('Face / eye shine',(side*.12,.455,2.30),(.02,.01,.02),'eyewhite',ROOT_OBJ)
 tube(f'Ear / pointed {side}',(side*.38,.04,2.30),(side*.70,-.06,2.40),.075,.012,'skin',ROOT_OBJ)
uv('Face / small mouth',(0,.41,2.10),(.05,.02,.022),'skin',ROOT_OBJ)
uv('Hood / rounded cowl',(0,-.04,2.42),(.50,.48,.44),'cloak',ROOT_OBJ)
uv('Hood / lit crown',(0,-.06,2.66),(.36,.34,.18),'cloaklight',ROOT_OBJ)
tube('Hood / gold face rim',(0,.36,2.34),(0,.40,2.34),.44,.44,'gold',ROOT_OBJ,24)
for x,z,m in [(-.24,2.44,'hairlight'),(0,2.48,'hair'),(.24,2.44,'hairlight')]:
 ico('Hair / fringe',(x,.38,z),(.14,.08,.12),m,ROOT_OBJ,2)
# Long hair mass flowing down the back (lags on the release).
for k in range(5):
 t=k/4;ico('Hair / long lock',(.10-.05*k,-.30-.06*t-hair_back*t,2.30-.26*k),(.30-.03*k,.14,.20),'hair' if k%2 else 'hairlight',ROOT_OBJ,2)
# Side locks spill out of the hood over both shoulders (painted Riel: blond hair framing the face).
for side in (-1,1):
 for k in range(4):
  ico('Hair / side lock',(side*(.40+.02*k),.10-.05*k-hair_back*k*.3,2.18-.17*k),(.12,.10,.15),'hairlight' if k%2==0 else 'hair',ROOT_OBJ,2)
# Arms: bow arm (far side) reaches HB, draw arm (near side) reaches HD.
for name,sh,hand in [('Bow',SB,HB),('Draw',SD,HD)]:
 mid=sh.lerp(hand,.5)
 rod(name+' arm / sleeve',sh,mid,.11,'cloak',ROOT_OBJ,12)
 rod(name+' arm / bracer',mid,hand,.10,'leather',ROOT_OBJ,12)
 cyl(name+' arm / gold cuff',mid,.12,.05,'gold',ROOT_OBJ,12,0).rotation_euler=(hand-sh).to_track_quat('Z','Y').to_euler()
 ico(name+' hand / glove',hand,(.11,.11,.11),'leatherdark',ROOT_OBJ)
# Bow: tall arc in the plane (bow_up, bow_fwd) — cycle 58 rule — limb radius .07, vine wrap and leaves.
H=1.45;SAG=.36;R=.07
pts=[HB+bow_up*(H*t)-bow_fwd*(SAG*t*t) for t in [i/20-1 for i in range(41)]]
for i in range(40):rod('Bow / limb',pts[i],pts[i+1],R,'wood',ROOT_OBJ,10)
for i in range(4,37,4):ico('Bow / vine knot',pts[i]+bow_fwd*.05,(.08,.08,.08),'vine',ROOT_OBJ,1)
for i,s_ in [(6,1),(14,-1),(26,1),(34,-1)]:
 c=pts[i];lf=c+bow_fwd*.12+SIDE*.10*s_
 mesh('Bow / leaf',[tuple(c),tuple(lf+bow_up*.06),tuple(c+bow_fwd*.24+SIDE*.04*s_),tuple(lf-bow_up*.06)],[(0,1,2,3)],'leaf',ROOT_OBJ)
cyl('Bow / gold grip',HB,.09,.22,'gold',ROOT_OBJ,12,0).rotation_euler=bow_up.to_track_quat('Z','Y').to_euler()
rod('Bow / upper string',pts[-1],NOCK,.018,'string',ROOT_OBJ,6);rod('Bow / lower string',pts[0],NOCK,.018,'string',ROOT_OBJ,6)
ARROWHEAD=None
if arrow:
 tipp=NOCK+bow_fwd*1.12
 rod('Arrow / shaft',NOCK,tipp,.03,'shaft',ROOT_OBJ,8)
 for s_ in (-1,1):mesh('Arrow / fletching',[tuple(NOCK+bow_fwd*.04),tuple(NOCK+bow_fwd*.22),tuple(NOCK+bow_fwd*.04+bow_up*.09*s_)],[(0,1,2)],'fletch',ROOT_OBJ)
 tube('Arrow / glowing tip',tipp,tipp+bow_fwd*.20,.07,.005,'tip',ROOT_OBJ,10)
 ARROWHEAD=tipp+bow_fwd*.10
scene=bpy.context.scene
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
ROOT_OBJ.scale=(opts.scale,)*3;NOCK=NOCK*opts.scale;HB=HB*opts.scale
if ARROWHEAD:ARROWHEAD=ARROWHEAD*opts.scale
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
px=lambda v:(round(world_to_camera_view(scene,camera,v).x*opts.size,1),round((1-world_to_camera_view(scene,camera,v).y)*opts.size,1))
info={'pose':POSE,'ground':px(Vector((0,0,0))),'nock_px':px(NOCK),'arrowhead_px':px(ARROWHEAD) if ARROWHEAD else None,'bow_grip_px':px(HB)}
scene.render.filepath=str(OUT/f'elf-{POSE}.png');bpy.ops.render.render(write_still=True)
(OUT/f'elf-{POSE}.json').write_text(json.dumps(info))
print('ARCANA_ELF '+json.dumps(info))
