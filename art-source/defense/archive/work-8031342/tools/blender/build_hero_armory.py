"""Build six editable hero-weapon studies; no combat assets are overwritten."""
import math
from pathlib import Path
import bpy
from mathutils import Vector, noise

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/defense/models'; SOURCE=ROOT/'art-source/defense'
OUT.mkdir(parents=True,exist_ok=True); SOURCE.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name!='Collection': bpy.data.collections.remove(col)
def material(name,color,metal=0,rough=.55,emission=0,pattern=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=rough
    shader.inputs['Emission Color'].default_value=(*color,1);shader.inputs['Emission Strength'].default_value=emission
    if pattern:
        size=96; img=bpy.data.images.new('Armory / '+name,width=size,height=size,alpha=True); px=[]
        def to_srgb(v):
            v=max(0,min(1,v));return 12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055
        for y in range(size):
            for x in range(size):
                a=noise.noise_vector(Vector((x/size*6,y/size*6,.71))).x
                b=noise.noise_vector(Vector((x/size*20,y/size*20,1.63))).y
                factor=1+.18*(.7*a+.3*b);px.extend((*[to_srgb(c*factor) for c in color],1))
        img.pixels.foreach_set(px);img.update();img.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
        m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    return m
M={
 'wood':material('Warm carved wood',(.31,.12,.035),rough=.69,pattern=True),
 'darkwood':material('Deep grain wood',(.15,.055,.022),rough=.76,pattern=True),
 'stone':material('Cool mountain stone',(.25,.29,.31),rough=.87,pattern=True),
 'steel':material('Forged steel',(.31,.38,.43),metal=.76,rough=.32),
 'iron':material('Dark forged iron',(.08,.1,.12),metal=.68,rough=.48),
 'gold':material('Aged brass',(.65,.38,.08),metal=.72,rough=.31),
 'leather':material('Wrapped leather',(.28,.095,.035),rough=.82,pattern=True),
 'red':material('Crimson binding',(.55,.035,.02),rough=.72),
 'navy':material('Deep blue cloth',(.025,.08,.24),rough=.78),
 'teal':material('Jade green',(.025,.32,.23),rough=.34),
 'green':material('Leaf green crystal',(.025,.55,.12),rough=.22,emission=.32),
 'blue':material('Sapphire crystal',(.02,.32,.8),rough=.2,emission=.32),
 'ember':material('Ember glass',(.98,.16,.015),rough=.22,emission=.60),
 'paper':material('Warm talisman paper',(.88,.64,.27),rough=.88),
 'rope':material('Natural fiber bowstring',(.64,.48,.28),rough=.9),
}
CURRENT=None; MODEL_ROOT=None

def attach(obj,name,mat,parent=None):
 obj.name=name
 for c in list(obj.users_collection): c.objects.unlink(obj)
 CURRENT.objects.link(obj)
 if mat: obj.data.materials.append(M[mat])
 matrix=obj.matrix_world.copy();obj.parent=parent or MODEL_ROOT;obj.matrix_world=matrix
 return obj

def cube(name,at,size,mat,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);attach(o,name,mat)
 if bevel:
  mod=o.modifiers.new('Soft forged edges','BEVEL');mod.width=bevel;mod.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

def rod(name,a,b,r,mat,vertices=12):
 a,b=Vector(a),Vector(b);delta=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=delta.length,location=(a+b)/2)
 o=attach(bpy.context.object,name,mat);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
 bevel=o.modifiers.new('Edge glint','BEVEL');bevel.width=min(.025,r*.22);bevel.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o

def sphere(name,at,r,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=r,location=at);return attach(bpy.context.object,name,mat)

def gem(name,at,r,height,mat):
 x,y,z=at;n=6
 verts=[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z) for i in range(n)]
 verts += [(x,y,z+height),(x,y,z-height*.28)]
 faces=[(i,(i+1)%n,n) for i in range(n)]+[((i+1)%n,i,n+1) for i in range(n)]
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);CURRENT.objects.link(o);o.data.materials.append(M[mat]);o.parent=MODEL_ROOT;return o

def curved(name,points,r,mat):
 for i in range(len(points)-1):rod(name+' %02d'%i,points[i],points[i+1],r,mat,10)

def band(z,r=.13,mat='gold'):
 rod('Binding / collar',(0,0,z-.035),(0,0,z+.035),r,mat,12)

def pedestal():
 rod('Display / stone base',(0,0,0),(0,0,.14),.66,'stone',16)
 rod('Display / bronze rim',(0,0,.14),(0,0,.18),.60,'gold',16)
 rod('Display / raised inset',(0,0,.18),(0,0,.23),.51,'iron',16)

def shaft(height=2.5,wood='wood'):
 rod('Grip / central shaft',(0,0,.24),(0,0,height),.09,wood)
 for z in [.35,.70,1.05,1.40]: band(z,.103,'leather')
 points=[]
 for i in range(35):
  t=i/34;a=t*math.tau*5
  points.append((.092*math.cos(a),.092*math.sin(a),.48+t*.80))
 curved('Grip / cross-wrapped leather',points,.012,'leather')

def mage():
 pedestal();shaft(2.55,'darkwood')
 for z in [.42,1.44,2.35]:band(z,.12)
 gem('Magic / sapphire focus',(0,0,2.86),.27,.42,'blue')
 for i in range(4):
  a=i*math.tau/4;curved('Staff / brass focus claw',[(.22*math.cos(a),.22*math.sin(a),2.52),(.31*math.cos(a),.31*math.sin(a),2.75),(.25*math.cos(a),.25*math.sin(a),3.02)],.035,'gold')
 for i in range(3):
  a=i*math.tau/3;gem('Fire / ember accent',(.37*math.cos(a),.37*math.sin(a),2.67),.065,.11,'ember')

def elf():
 pedestal()
 rod('Display / bow support',(0,0,.23),(0,0,.42),.05,'iron')
 # The tall curved limbs and string create a readable bow silhouette.
 pts=[(0,0,.42),(.40,0,.63),(.60,0,1.02),(.66,0,1.48),(.60,0,1.94),(.40,0,2.34),(0,0,2.58)]
 curved('Bow / carved limbs',pts,.075,'wood');rod('Bow / taut string',(0,0,.42),(0,0,2.58),.012,'rope',8)
 rod('Arrow / shaft',(-.13,-.08,1.50),(.57,-.08,1.50),.025,'darkwood',8)
 bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.075,radius2=0,depth=.17,location=(.655,-.08,1.50))
 arrow=attach(bpy.context.object,'Arrow / metal point','steel');arrow.rotation_euler=(0,math.pi/2,0)
 for z in [1.29,1.43,1.57,1.71]:rod('Bow / grip wrap',(.61,-.01,z),(.69,-.01,z),.028,'leather',8)
 for z in [.70,2.30]:sphere('Bow / leaf inlay',(.40,-.06,z),.06,'green')
 for z in [.87,2.12]:
  rod('Bow / brass limb binding',(.45,-.01,z),(.57,-.01,z),.035,'gold',8)

def hammer(big=False):
 pedestal();shaft(2.0 if big else 2.15,'wood')
 if big:
  head=cube('Hammer / broad mountain stone',(0,0,2.28),(1.45,.56,.65),'stone',.08)
  for x in [-.64,.64]:cube('Hammer / dark iron cap',(x,0,2.28),(.18,.62,.72),'iron',.04)
  cube('Hammer / gold central mount',(0,-.31,2.28),(.50,.08,.50),'gold',.03)
  for sign in [-1,1]:rod('Hammer / mountain engraving',(0,-.365,2.42),(sign*.14,-.365,2.23),.018,'iron',8)
  rod('Hammer / central crest baseline',(-.14,-.365,2.23),(.14,-.365,2.23),.018,'iron',8)
  for x in [-.42,.42]:
   cube('Hammer / reinforced iron strap',(x,-.30,2.28),(.09,.08,.66),'iron',.018)
   for z in [2.08,2.48]:sphere('Hammer / brass rivet',(x,-.35,z),.037,'gold')
 else:
  cube('Hammer / forged striking head',(0,0,2.36),(1.10,.54,.54),'iron',.07)
  for x in [-.48,.48]:cube('Hammer / steel striking face',(x,0,2.36),(.19,.60,.60),'steel',.04)
  cube('Hammer / bronze face plate',(0,-.30,2.36),(.38,.07,.37),'gold',.03)
  for x in [-.13,.13]:sphere('Hammer / fastener',(x,-.35,2.36),.04,'steel')
  for sign in [-1,1]:
   rod('Hammer / maker chevron',(0,-.35,2.46),(sign*.11,-.35,2.36),.013,'iron',8)
   rod('Hammer / maker chevron',(sign*.11,-.35,2.36),(0,-.35,2.26),.013,'iron',8)
  for x in [-.39,.39]:
   cube('Hammer / bronze securing strap',(x,-.30,2.36),(.07,.08,.50),'gold',.012)
   for z in [2.20,2.52]:sphere('Hammer / securing rivet',(x,-.35,z),.027,'steel')
 for z in [1.8,2.05]:band(z,.14,'gold')

def tao():
 pedestal();rod('Display / sword support',(0,0,.23),(0,0,.44),.05,'iron');rod('Sword / pommel',(0,0,.44),(0,0,.56),.12,'gold')
 rod('Sword / jade grip',(0,0,.55),(0,0,1.18),.08,'teal')
 for z in [.65,.81,.97,1.12]:band(z,.095,'red')
 cube('Sword / cross guard',(0,0,1.23),(.64,.16,.10),'gold',.025)
 # A symmetric straight steel blade rather than a curved saber.
 verts=[(-.16,0,1.29),(.16,0,1.29),(.12,0,2.77),(0,0,3.07),(-.12,0,2.77),(0,-.06,1.36),(0,-.06,2.73)]
 faces=[(0,5,6,4),(4,6,3),(6,2,3),(5,1,2,6),(0,1,5)]
 mesh=bpy.data.meshes.new('Straight blade mesh');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Sword / forged straight blade',mesh);CURRENT.objects.link(o);o.data.materials.append(M['steel']);o.parent=MODEL_ROOT
 # Abstract lightning line: no real-world sacred text is invented.
 paper=cube('Talisman / paper',(.49,0,1.02),(.33,.055,.70),'paper',.012)
 for x in [.36,.62]:rod('Talisman / warm border',(x,-.031,.69),(x,-.031,1.35),.012,'gold',8)
 rod('Talisman / red thread',(.23,0,1.24),(.49,0,1.37),.015,'red',8)
 curved('Talisman / lightning motif',[(.52,-.035,1.25),(.43,-.035,1.06),(.52,-.035,1.06),(.44,-.035,.84)],.015,'red')

def druid():
 pedestal();shaft(2.42,'wood')
 pts=[]
 for i in range(37):
  t=i/36;a=t*math.tau*2.5;pts.append((.11*math.cos(a),.11*math.sin(a),.7+t*1.9))
 curved('Vine / living spiral',pts,.028,'teal')
 gem('Staff / green nature focus',(0,0,2.85),.25,.33,'green')
 for side in [-1,1]:
  curved('Staff / branch prong',[(side*.04,0,2.34),(side*.25,0,2.55),(side*.29,0,2.84),(side*.19,0,3.00)],.06,'darkwood')
  for z in [1.6,2.12]:gem('Vine / leaf',(side*.16,0,z),.07,.15,'teal')

builders=[('ian-staff',mage),('riel-bow',elf),('bron-hammer',lambda:hammer(False)),('cheongun-sword',tao),('kar-hammer',lambda:hammer(True)),('luna-staff',druid)]
models=[]
for index,(name,build) in enumerate(builders):
 CURRENT=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(CURRENT)
 MODEL_ROOT=bpy.data.objects.new(name,None);CURRENT.objects.link(MODEL_ROOT);build()
 MODEL_ROOT.location=((index-2.5)*3,0,0);models.append((name,CURRENT,MODEL_ROOT))

CURRENT=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(CURRENT)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.use_denoising=False
scene.render.resolution_x=480;scene.render.resolution_y=480;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.render.threads_mode='FIXED';scene.render.threads=8;scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.30
scene.view_settings.view_transform='AgX'
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def light(name,loc,power,color):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=5;data.color=color;o=bpy.data.objects.new(name,data);CURRENT.objects.link(o);o.location=loc;aim(o,(0,0,1.5))
light('Studio warm key',(-5,-7,9),900,(1,.84,.68));light('Studio cool fill',(5,-3,7),600,(.66,.84,1));light('Studio upper rim',(0,5,8),950,(1,.93,.82))
camdata=bpy.data.cameras.new('Weapon orthographic camera');cam=bpy.data.objects.new('Weapon orthographic camera',camdata);CURRENT.objects.link(cam);camdata.type='ORTHO';camdata.ortho_scale=4.35;cam.location=(6,-10,6.8);aim(cam,(0,0,1.55));scene.camera=cam
for name,col,root in models:
 old=root.location.copy();root.location=(0,0,0);bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
 for ob in col.objects:ob.select_set(True)
 bpy.context.view_layer.objects.active=root
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False)
 for _,other,_ in models:other.hide_render=other!=col
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);root.location=old
for _,col,_ in models:col.hide_render=False
camdata.ortho_scale=20;cam.location=(8,-17,12);aim(cam,(0,0,1.5))
scene['armory_notes']='Static editable design studies; existing hero attacks and game sprites remain unchanged.'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'hero-armory.blend'))
print('HERO_ARMORY_COMPLETE')
