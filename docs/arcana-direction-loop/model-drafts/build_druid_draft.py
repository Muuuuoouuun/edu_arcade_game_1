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

MOSS=(.012,.035,.010)
M={
 'cape':material('Cloth / dark moss cape',MOSS,0,.84),
 'capelight':material('Cloth / lit moss folds',tuple(c*1.6 for c in MOSS),0,.82),
 'ivory':material('Cloth / ivory robe',(.58,.54,.42),0,.8),
 'gold':material('Trim / thin gold',(.82,.52,.13),.6,.36),
 'boot':material('Leather / boots',(.24,.11,.04),0,.7),
 'belt':material('Leather / vine belt',(.12,.06,.02),0,.75),
 'skin':material('Skin / warm',(.86,.58,.42),0,.62),
 'hair':material('Hair / ginger mane',(.22,.065,.018),0,.7),
 'hairlight':material('Hair / sunlit strands',(.32,.10,.03),0,.66),
 'earin':material('Ear / inner fur',(.80,.55,.40),0,.7),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / green iris',(.10,.45,.15),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'wood':material('Staff / dark wood',(.22,.11,.04),0,.6),
 'vine':material('Staff / vine',(.07,.28,.05),0,.7),
 'leaf':material('Leaf / green',(.12,.42,.08),0,.7),
 'gem':material('Staff / glowing gem',(.20,1.0,.22),0,.2,1.3),
 'flower':material('Hair / orange flower',(.85,.40,.06),0,.6),
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
 HF=SF+D*.56+Z*.05;sdir=(D+Z*.22).normalized();below=.80;above=.80;HN=SN-D*.10+Vector((0,-.10,-.35));cape_back=.24;hair_back=.20;leaves_burst=True
elif POSE=='recover':
 HF=SF+D*.62-Z*.15;sdir=(D*.55+Z*.85).normalized();below=1.10;above=1.30;HN=Vector((.10,.48,1.40));cape_back=.10;hair_back=.08
else: # cast — 덩굴의 포효: staff raised high in both hands, vines rise around the feet
 HF=SF+D*.20+Z*.62;sdir=Z;below=.70;above=.95;HN=HF+Vector((.34,.10,-.30));vines=True;cape_back=.12;hair_back=.10
STAFF_LOW=HF-sdir*below;STAFF_TOP=HF+sdir*above

ROOT_OBJ=group('druid-luna')
ROOT_OBJ['asset']='Arcana druid Luna / draft'
for side,x in [('far',-.22),('near',.22)]:
 cube(f'{side} boot / sole',(x,.08,.05),(.30,.48,.10),'belt',ROOT_OBJ,.04)
 ico(f'{side} boot / foot',(x,.12,.18),(.16,.26,.14),'boot',ROOT_OBJ)
 cyl(f'{side} boot / shaft',(x,0,.42),.15,.50,'boot',ROOT_OBJ,14)
 cyl(f'{side} boot / cuff',(x,0,.68),.17,.06,'gold',ROOT_OBJ,14,0)
# Ivory robe to the shin with a gold hem; dark moss cape and mantle carry the main surface (contrast rule).
lathe('Robe / moss skirt',[(1.62,.36,.30,0),(1.20,.42,.36,0),(.80,.56,.46,-.02),(.52,.64,.54,-.03)],'cape',ROOT_OBJ,22,thick=.025)
mesh('Robe / ivory front panel',[(-.15,.33,1.58),(.15,.33,1.58),(.30,.53,.54),(-.30,.53,.54)],[(0,1,2,3)],'ivory',ROOT_OBJ)
for s_ in (-1,1):rod('Robe / gold placket',(s_*.16,.335,1.58),(s_*.32,.54,.54),.02,'gold',ROOT_OBJ,6)
tube('Robe / gold hem',(0,-.03,.53),(0,-.03,.55),.64,.64,'gold',ROOT_OBJ,24)
cube('Belt / vine sash',(0,.02,1.22),(.86,.72,.10),'belt',ROOT_OBJ,.04)
for k in range(5):ico('Belt / leaf knot',(-.30+.15*k,.38,1.22),(.06,.03,.05),'leaf',ROOT_OBJ,1)
ico('Torso / moss bodice',(0,0,1.48),(.40,.30,.34),'cape',ROOT_OBJ)
ico('Mantle / moss shoulders',(0,-.02,1.76),(.54,.42,.18),'cape',ROOT_OBJ)
cv=[]
for z,w,y in [(1.80,.50,-.28),(1.20,.72,-.46-cape_back*.6),(.46,.90,-.62-cape_back)]:
 for i in range(7):cv.append(((i/6-.5)*w*2,y+(.04 if i%2 else -.05),z))
cf=[(r*7+c,r*7+c+1,(r+1)*7+c+1,(r+1)*7+c) for r in range(2) for c in range(6)]
cp=mesh('Cape / moss cloak',cv,cf,'cape',ROOT_OBJ);cp.data.materials.append(M['capelight'])
for face in cp.data.polygons:face.material_index=face.index%2
cp.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
for i in range(6):rod('Cape / gold hem',cv[14+i],cv[15+i],.022,'gold',ROOT_OBJ,8)
# Arms in short ivory sleeves under the mantle.
for name,sh,hand in [('Staff',SF,HF),('Free',SN,HN)]:
 mid=sh.lerp(hand,.5)
 rod(name+' arm / sleeve',sh,mid,.12,'cape',ROOT_OBJ,12)
 rod(name+' arm / forearm',mid,hand,.09,'skin',ROOT_OBJ,12)
 cyl(name+' arm / gold cuff',mid,.13,.05,'gold',ROOT_OBJ,12,0).rotation_euler=(hand-sh).to_track_quat('Z','Y').to_euler()
 ico(name+' hand',hand,(.09,.09,.10),'skin',ROOT_OBJ)
# Head, wide ginger mane and two upright ears (silhouette cues 1 and 2).
uv('Face / round head',(0,.06,2.24),(.40,.36,.37),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',(side*.15,.38,2.23),(.09,.04,.10),'eyewhite',ROOT_OBJ)
 uv('Face / green iris',(side*.14,.41,2.22),(.062,.025,.08),'iris',ROOT_OBJ)
 uv('Face / pupil',(side*.14,.428,2.22),(.03,.012,.042),'pupil',ROOT_OBJ)
 uv('Face / eye shine',(side*.12,.435,2.26),(.02,.01,.02),'eyewhite',ROOT_OBJ)
uv('Hair / crown',(0,-.03,2.36),(.46,.42,.36),'hair',ROOT_OBJ)
uv('Hair / fringe',(0,.26,2.46),(.38,.13,.14),'hairlight',ROOT_OBJ)
for side in (-1,1):
 base=Vector((side*.25,-.06,2.58));tip=base+Vector((side*.14,-.04,.74))
 tube(f'Ear / outer {side}',base,tip,.16,.02,'hair',ROOT_OBJ,12)
 tube(f'Ear / inner {side}',base+Vector((0,.06,.04)),tip+Vector((0,.05,-.10)),.09,.012,'earin',ROOT_OBJ,10)
 for k in range(5):
  t=k/4;uv('Hair / side mane',(side*(.48+.20*t),.02-.20*t-hair_back*t,2.16-.62*t),(.20-.02*k,.16,.23),'hair' if k%2 else 'hairlight',ROOT_OBJ)
for k in range(6):
 t=k/5;uv('Hair / back mane',Vector((0,-.36,2.20))-D*(.10+.30*t+hair_back*.8*t)+Vector((0,-.04*t,-.95*t)),(.40-.03*k,.16,.26),'hair' if k%2 else 'hairlight',ROOT_OBJ)
ico('Hair / orange flower',(-.34,.10,2.52),(.10,.08,.10),'flower',ROOT_OBJ,1)
for k in range(3):mesh('Hair / leaf',[( -.34,.12,2.52),(-.50+.06*k,.05,2.62+.04*k),(-.44+.06*k,.14,2.70)],[(0,1,2)],'leaf',ROOT_OBJ)
# Staff (silhouette cue 3): wood shaft with a vine spiral, a vine ring and a glowing gem on top.
rod('Staff / shaft',STAFF_LOW,STAFF_TOP,.055,'wood',ROOT_OBJ,10)
u=sdir.cross(CAM).normalized();w=sdir.cross(u).normalized()
for k in range(24):
 t=k/23;p=STAFF_LOW.lerp(STAFF_TOP,t)+(u*math.cos(t*18)+w*math.sin(t*18))*.07
 if k:rod('Staff / vine spiral',prev,p,.022,'vine',ROOT_OBJ,6)
 prev=p
ring_c=STAFF_TOP+sdir*.22;rr=.24;rv=(CAM-sdir*CAM.dot(sdir)).normalized();ru=sdir.cross(rv).normalized()
pts=[ring_c+ru*(rr*math.cos(2*math.pi*k/20))+sdir*(rr*math.sin(2*math.pi*k/20)) for k in range(21)]
for k in range(20):rod('Staff / vine ring',pts[k],pts[k+1],.035,'vine',ROOT_OBJ,8)
ico('Staff / green gem',ring_c,(.13,.13,.16),'gem',ROOT_OBJ,1)
for k,a in enumerate((.6,2.2,3.9,5.3)):
 c=ring_c+ru*(rr*1.15*math.cos(a))+sdir*(rr*1.15*math.sin(a))
 mesh('Staff / ring leaf',[tuple(c),tuple(c+ru*.14+sdir*.06),tuple(c+ru*.18-sdir*.04)],[(0,1,2)],'leaf',ROOT_OBJ)
GEM=ring_c
if leaves_burst:
 for k in range(4):
  c=ring_c+D*(.18+.07*k)+Z*(.18*math.sin(k*1.7))+SIDE*.05*(k%2)
  mesh('Burst / leaf',[tuple(c),tuple(c+D*.14+Z*.05),tuple(c+D*.10-Z*.06)],[(0,1,2)],'leaf',ROOT_OBJ)
if vines:
 for k in range(6):
  a=2*math.pi*k/6+.4;base=Vector((1.05*math.cos(a),.85*math.sin(a),0))
  prev=base
  for j in range(1,8):
   t=j/7;p=base+Vector((0,0,1.05*t))+Vector((math.cos(a+t*3),math.sin(a+t*3),0))*.16*t
   rod('Cast / rising vine',prev,p,.05*(1-t)+.012,'vine',ROOT_OBJ,6);prev=p
  mesh('Cast / vine leaf',[tuple(prev),tuple(prev+Vector((.12,0,.08))),tuple(prev+Vector((0,.10,.14)))],[(0,1,2)],'leaf',ROOT_OBJ)
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
info={'pose':POSE,'ground':px(Vector((0,0,0))),'gem_px':px(GEM)}
scene.render.filepath=str(OUT/f'druid-{POSE}.png');bpy.ops.render.render(write_still=True)
(OUT/f'druid-{POSE}.json').write_text(json.dumps(info))
print('ARCANA_DRUID '+json.dumps(info))
