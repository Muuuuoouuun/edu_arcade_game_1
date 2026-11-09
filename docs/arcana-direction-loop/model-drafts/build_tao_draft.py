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
Each pose is built from pose parameters in a fresh scene; a production script should key the same values
on pivots (body, head, ribbon, near-arm, far-arm, talisman, orbit, sleeves).
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

def talisman(name,center,up,face,size,parent=None,glow=True):
 """Yellow paper charm with a red seal stripe; `face` is the paper normal."""
 u=Vector(up).normalized();f=Vector(face).normalized();r=u.cross(f).normalized()
 plate(name+' / paper',center,r,u,size*.55,size,'paper' if glow else 'paperdim',parent,.015)
 plate(name+' / red seal',Vector(center)+f*.012,r,u,size*.16,size*.7,'seal',parent,.006)

OUTER=(.018,.050,.052)   # 먹청-teal outer robe: keeps the 64px gray low (cycle 62 contrast rule)
M={
 'outer':material('Cloth / ink-teal outer robe',OUTER,0,.82),
 'outerlight':material('Cloth / lit robe folds',tuple(c*1.6 for c in OUTER),0,.8),
 'ivory':material('Cloth / ivory inner robe',(.60,.56,.45),0,.8),
 'green':material('Cloth / jade green panels and ribbons',(.02,.22,.11),0,.75),
 'gold':material('Trim / thin gold',(.82,.52,.13),.6,.36),
 'boot':material('Leather / short boots',(.24,.12,.05),0,.7),
 'skin':material('Skin / warm',(.86,.58,.42),0,.62),
 'hair':material('Hair / ink black',(.025,.018,.014),0,.6),
 'hairlight':material('Hair / sheen',(.08,.06,.05),0,.5),
 'eyewhite':material('Eye / white',(.92,.90,.86),0,.4),
 'iris':material('Eye / teal iris',(.08,.30,.30),0,.35),
 'pupil':material('Eye / pupil',(.01,.012,.01),0,.3),
 'paper':material('Talisman / glowing yellow paper',(1.0,.55,.03),0,.5,1.1),
 'paperdim':material('Talisman / small charm',(1.0,.58,.05),0,.5,.7),
 'seal':material('Talisman / vermilion seal',(.75,.08,.03),0,.5,.4),
 'bolt':material('Spark / storm light',(1.0,.95,.55),0,.3,3.0),
}

# ---------------- pose parameters (world units; D = screen-right forward, as in build_elf_draft.py) ----------------
D=Vector((-.82,.57,0)).normalized();Z=Vector((0,0,1));SIDE=D.cross(Z).normalized()
SF=Vector((-.40,.04,1.74));SN=Vector((.40,.04,1.74))   # front (screen-right) / back shoulder
CAM=Vector((7,10,0)).normalized()                        # talismans and cloth strips face the camera
POSE=opts.pose
orbit=False;sleeve_lift=0;ribbon=.10;robe_flare=0;tal_tilt=0
# HF = talisman hand (front), HN = sword-finger hand (back). Painted frames: talisman raised beside the face.
if POSE=='idle':
 HF=SF+D*.60+Z*.10;HN=SN-D*.22+Vector((0,.10,-.42));TAL=HF+Z*.34
elif POSE=='windup':
 HF=SN-D*.18+Z*.62;HN=SF+D*.64+Z*.06;TAL=HF+Z*.30-D*.06;tal_tilt=-.35;ribbon=.18
elif POSE=='strike':
 HF=SF+D*1.02+Z*.10;HN=SN+Vector((.02,-.18,-.36));TAL=HF+D*.50+Z*.08;tal_tilt=.25;ribbon=.34;robe_flare=.10;sleeve_lift=.12
elif POSE=='recover':
 HF=SF+D*.58-Z*.28;HN=SN-D*.20+Vector((0,.10,-.38));TAL=None;ribbon=.22;robe_flare=.04
else: # cast — 뇌운 결계: both arms up, talisman overhead, charms circling the waist
 HF=SF+D*.10+Z*.80;HN=SN-D*.10+Z*.80;TAL=(HF+HN)/2+Z*.36;orbit=True;ribbon=.28;robe_flare=.12;sleeve_lift=.28
tal_up=(Z+D*tal_tilt).normalized();tal_face=CAM

ROOT_OBJ=group('taoist-cheongun')
ROOT_OBJ['asset']='Arcana taoist Cheongun / draft'
# Short boots peek out under the bell robe.
for side,x in [('far',-.22),('near',.22)]:
 cube(f'{side} boot / sole',(x,.10,.05),(.28,.46,.10),'boot',ROOT_OBJ,.04)
 ico(f'{side} boot / toe',(x,.20,.16),(.15,.24,.12),'boot',ROOT_OBJ)
# Bell robe (silhouette cue 2): ink-teal outer layer, ivory front panel, jade under-hem, gold hem.
rings=[(1.86,.34,.28,0),(1.50,.40,.32,0),(1.10,.46,.38,0),(.62,.62+robe_flare*.5,.52,-.02),(.16,.80+robe_flare,.66+robe_flare*.6,-.05)]
lathe('Robe / outer bell',rings,'outer',ROOT_OBJ,24,skip=(5,6),thick=.03)
lathe('Robe / jade under-hem',[(.34,.74+robe_flare,.61+robe_flare*.5,-.04),(.10,.84+robe_flare,.70+robe_flare*.6,-.05)],'green',ROOT_OBJ,24,thick=.02)
tube('Robe / gold hem',(0,-.05,.18),(0,-.05,.20),.80+robe_flare,.80+robe_flare,'gold',ROOT_OBJ,28)
mesh('Robe / jade front panel',[(-.13,.34,1.80),(.13,.34,1.80),(.28,.63,.16),(-.28,.63,.16)],[(0,1,2,3)],'green',ROOT_OBJ)
for s_ in (-1,1):rod('Robe / gold placket',(s_*.14,.345,1.80),(s_*.30,.64,.16),.022,'gold',ROOT_OBJ,6)
cube('Sash / jade belt',(0,.04,1.22),(.92,.76,.12),'green',ROOT_OBJ,.04)
uv('Sash / gold knot',(0,.42,1.22),(.10,.05,.08),'gold',ROOT_OBJ)
for s_ in (-1,1):rod('Sash / hanging tail',(s_*.06,.44,1.18),(s_*.12,.52+robe_flare,.62),.035,'green',ROOT_OBJ,8)
ico('Torso / ivory collar',(0,.10,1.84),(.40,.32,.14),'ivory',ROOT_OBJ)
ico('Shoulders / ink-teal mantle',(0,-.02,1.78),(.52,.40,.16),'outer',ROOT_OBJ)
# Arms in wide sleeves: a flaring tube plus a hanging sleeve flap (silhouette cue 2).
for name,sh,hand in [('Far',SF,HF),('Near',SN,HN)]:
 wrist=sh.lerp(hand,.78)
 tube(name+' arm / wide sleeve',sh,wrist,.12,.22,'outer',ROOT_OBJ,16)
 cyl(name+' arm / ivory cuff',wrist,.23,.05,'ivory',ROOT_OBJ,16,0).rotation_euler=(hand-sh).to_track_quat('Z','Y').to_euler()
 drop=Vector((0,0,-.74+sleeve_lift))-(hand-sh).normalized()*.10
 mesh(name+' arm / hanging sleeve',[tuple(wrist+D*.24),tuple(wrist-D*.24),tuple(wrist-D*.30+drop),tuple(wrist+D*.12+drop)],[(0,1,2,3)],'outerlight',ROOT_OBJ).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.03
 ico(name+' hand / bare hand',hand,(.09,.09,.10),'skin',ROOT_OBJ)
# Head: round face, ink-black hair, top-knot with a gold crown and two jade ribbons (silhouette cue 1).
uv('Face / round head',(0,.06,2.28),(.40,.36,.38),'skin',ROOT_OBJ)
for side in (-1,1):
 uv('Face / eye white',(side*.15,.38,2.27),(.09,.04,.10),'eyewhite',ROOT_OBJ)
 uv('Face / teal iris',(side*.14,.41,2.26),(.062,.025,.08),'iris',ROOT_OBJ)
 uv('Face / pupil',(side*.14,.428,2.26),(.03,.012,.042),'pupil',ROOT_OBJ)
 uv('Face / eye shine',(side*.12,.435,2.30),(.02,.01,.02),'eyewhite',ROOT_OBJ)
 uv('Face / ear',(side*.39,.04,2.26),(.06,.08,.10),'skin',ROOT_OBJ)
uv('Hair / cap',(0,-.04,2.38),(.44,.42,.36),'hair',ROOT_OBJ)
uv('Hair / straight fringe',(0,.27,2.52),(.36,.12,.13),'hairlight',ROOT_OBJ)
for side in (-1,1):tube('Hair / straight side lock',(side*.37,.16,2.42),(side*.43,.20,1.86),.09,.04,'hair',ROOT_OBJ,12)
uv('Hair / top-knot bun',(0,-.06,2.86),(.19,.18,.18),'hair',ROOT_OBJ)
tube('Crown / gold band',(0,-.06,2.80),(0,-.06,2.90),.21,.21,'gold',ROOT_OBJ,20)
for k,dx in enumerate((-.12,0,.12)):tube(f'Crown / spike {k}',(dx,.10,2.88),(dx,.13,3.06-abs(dx)*.6),.045,.008,'gold',ROOT_OBJ,8)
rod('Crown / hairpin',(-.34,-.06,2.86),(.34,-.06,2.86),.025,'gold',ROOT_OBJ,8)
for s_ in (-1,1):
 pts=[Vector((s_*.05,-.18,2.84))-D*((.21+ribbon*.15)*k)+Vector((0,0,-.09*k+.07*s_*k)) for k in range(8)]  # <= ~1.8 units so the frame keeps 8px
 for k in range(7):mesh('Ribbon / jade streamer',[tuple(pts[k]+Z*.06),tuple(pts[k]-Z*.06),tuple(pts[k+1]-Z*.05),tuple(pts[k+1]+Z*.05)],[(0,1,2,3)],'green',ROOT_OBJ).modifiers.new('Cloth thickness','SOLIDIFY').thickness=.02
for k in range(9):
 t=k/8;c=Vector((0,-.28,2.30))-D*(.08+.58*t+ribbon*.5*t)+Vector((0,0,-1.0*t));uv('Hair / long flowing sheet',c,(.30-.012*k,.13,.26),'hair' if k%3 else 'hairlight',ROOT_OBJ)
# Talisman (silhouette cue 3) and the cast orbit.
TIP=None
if TAL is not None:
 talisman('Talisman / held',TAL,tal_up,tal_face,.58,ROOT_OBJ);TIP=TAL
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
info={'pose':POSE,'ground':px(Vector((0,0,0))),'talisman_px':px(TIP) if TIP is not None else None}
scene.render.filepath=str(OUT/f'tao-{POSE}.png');bpy.ops.render.render(write_still=True)
(OUT/f'tao-{POSE}.json').write_text(json.dumps(info))
print('ARCANA_TAO '+json.dumps(info))
