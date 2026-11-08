"""Original editable gecko ranger: deterministic, isolated prototype generator."""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art-source/defense/prototypes/gecko-ranger'
p = argparse.ArgumentParser()
p.add_argument('--samples', type=int, default=32)
p.add_argument('--skip-render', action='store_true')
a = p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
assert a.samples > 0
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
parts = bpy.data.collections.new('Gecko ranger editable geometry')
scene.collection.children.link(parts)
studio = bpy.data.collections.new('Preview studio')
scene.collection.children.link(studio)

def mat(name, color, metallic=0, rough=.55):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic; bs.inputs['Roughness'].default_value=rough
    return m
M={
 'skin':mat('01 Gecko spring green',(.29,.58,.075)),
 'belly':mat('02 Warm cream throat',(.72,.68,.26)),
 'leaf':mat('03 Leaf forest green',(.10,.25,.025)),
 'leaflight':mat('04 Leaf sunlit green',(.31,.43,.035)),
 'wood':mat('05 Chestnut wood leather',(.19,.085,.025)),
 'gold':mat('06 Golden eye and brass',(.93,.49,.035),.25,.34),
 'dark':mat('07 Deep dark mouth pupil string',(.024,.031,.009)),
 'orange':mat('08 Broad orange markings',(.82,.31,.035)),
 'white':mat('09 Eye gleam',(.98,.94,.72),0,.25),
}
def attach(o,name,material=None,parent=None,smooth=False):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    parts.objects.link(o)
    if material: o.data.materials.append(M[material])
    bpy.context.view_layer.update()
    if parent:
        matrix=o.matrix_world.copy(); o.parent=parent; o.matrix_world=matrix
    if smooth:
        for f in o.data.polygons:f.use_smooth=True
    return o

def joint(name,loc,parent=None):
    o=bpy.data.objects.new(name,None); parts.objects.link(o); o.location=loc
    bpy.context.view_layer.update()
    if parent:
        matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
    return o

def ball(name,loc,scale,material,parent,seg=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=loc)
    o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return attach(o,name,material,parent,True)

def box(name,loc,scale,material,parent,bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    attach(o,name,material,parent)
    if bevel:
        m=o.modifiers.new('Broad soft corners','BEVEL');m.width=bevel;m.segments=1
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def tube(name,points,radii,material,parent,sides=8):
    pts=[Vector(v) for v in points];verts=[]
    for i,v in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        ref=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((1,0,0))
        u=tangent.cross(ref).normalized();w=tangent.cross(u).normalized()
        for j in range(sides):verts.append(tuple(v+radii[i]*(math.cos(j*math.tau/sides)*u+math.sin(j*math.tau/sides)*w)))
    faces=[tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))]
    for i in range(len(pts)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);parts.objects.link(o)
    return attach(o,name,material,parent,True)

def rod(name,start,end,radius,material,parent):
    return tube(name,[start,end],[radius,radius],material,parent)

def leaf(name,start,end,width,material,parent,bulge=.08):
    # One broad folded leaf with a raised central ridge; no tiny leaf tessellation.
    start,end=Vector(start),Vector(end);d=end-start
    side=d.cross(Vector((0,1,.1))).normalized()*width
    mid=start+d*.48;ridge=mid+Vector((0,bulge,bulge))
    front=[start,mid-side,end,mid+side,ridge]
    verts=[tuple(v) for v in front]+[tuple(v-Vector((0,.045,.025))) for v in front[:4]]
    faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(8,7,6,5),(0,5,6,1),(1,6,7,2),(2,7,8,3),(3,8,5,0)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);parts.objects.link(o)
    return attach(o,name,material,parent)

root=joint('gecko-ranger',(0,0,0))
body=joint('body',(0,0,1.1),root)
head=joint('head',(0,.03,2.38),body)
weapon=joint('crossbow-and-gripping-arms',(0,.25,1.87),body)
tail=joint('curled-tail',(.1,-.2,.75),root)
root['forward']='Authoring +Y; glTF Y-up export faces -Z'
root['rig']='Rigid object pivots; no skinning'
# Stable splayed legs and broad three-toed gecko feet, grounded at Z=0.
for s in (-1,1):
    x=s*.40
    ball('Green bent thigh',(x,-.02,.72),(.28,.28,.42),'skin',root)
    rod('Shin',(x,.02,.66),(s*.53,.16,.28),.18,'skin',root)
    ball('Leather ankle cuff',(s*.53,.15,.30),(.205,.19,.18),'wood',root)
    ball('Grounded gecko foot',(s*.53,.30,.12),(.25,.29,.12),'skin',root)
    for j in (-1,0,1):
        tx=s*.53+j*.16
        ball('Broad gecko toe',(tx,.52,.085),(.095,.23,.085),'skin',root,10,6)
        ball('Ivory toe tip',(tx,.71,.09),(.055,.085,.05),'belly',root,8,6)
# The entire tapering tail is present: outward base, low curl, lifted inward tip.
tube('Complete thick curled tail',[(0,-.24,.78),(.28,-.50,.52),(.68,-.67,.32),(1.12,-.69,.23),(1.51,-.58,.29),(1.77,-.39,.48),(1.85,-.22,.78),(1.72,-.13,1.00),(1.47,-.10,1.10),(1.25,-.08,1.02)], [.26,.25,.225,.19,.155,.125,.095,.065,.04,.008],'skin',tail,10)
for loc,scale in [((.76,-.84,.39),(.16,.035,.09)),((1.23,-.82,.30),(.13,.035,.075)),((1.68,-.48,.65),(.06,.04,.10))]:ball('Broad tail orange marking',loc,scale,'orange',tail,8,6)
ball('Compact ranger torso',(0,0,1.44),(.46,.32,.60),'leaf',body)
ball('Pale gecko throat',(0,.26,2.09),(.245,.16,.40),'belly',body)
# Cape made of only five large folded blades, kept behind arms.
for i,(x,z) in enumerate([(-.62,.62),(-.34,.43),(0,.36),(.34,.43),(.62,.62)]):
    leaf('Broad cape leaf %d'%i,(x*.35,-.28,2.19),(x,-.43,z),.26,'leaflight' if i%2 else 'leaf',body,.07)
for s in (-1,1):
    leaf('Shoulder leaf mantle',(0,-.13,2.26),(s*.66,-.03,1.98),.25,'leaflight',body)
    leaf('Front tunic leaf',(s*.12,.30,1.36),(s*.35,.34,.69),.24,'leaf',body)
box('Leather belt',(0,.035,1.15),(.94,.67,.14),'wood',body,.04)
box('Belt brass buckle',(.03,.385,1.15),(.22,.06,.19),'gold',body,.02)
box('Buckle dark center',(.03,.42,1.15),(.12,.018,.095),'wood',body,.01)
ball('Seed pouch',(.48,-.02,1.15),(.19,.20,.24),'wood',body)
# Oversized gecko head with short rounded reptile snout and visible lower jaw.
ball('Broad gecko head',(0,.10,2.65),(.48,.36,.43),'skin',head,16,10)
ball('Cream lower jaw',(0,.48,2.47),(.39,.29,.14),'belly',head)
ball('Gecko broad snout',(0,.48,2.59),(.43,.34,.18),'skin',head,16,8)
rod('Soft closed smile',(-.29,.739,2.515),(.29,.739,2.515),.014,'dark',head)
for s in (-1,1):
    ball('Raised gecko eye socket',(s*.34,.335,2.78),(.205,.16,.215),'leaf',head)
    ball('Large golden eye',(s*.35,.439,2.79),(.155,.095,.175),'gold',head,16,10)
    ball('Vertical gecko slit pupil',(s*.35,.523,2.79),(.030,.022,.125),'dark',head)
    ball('Eye catchlight',(s*.35-.035,.546,2.852),(.030,.010,.034),'white',head,8,6)
    ball('Small nostril',(s*.24,.76,2.66),(.033,.018,.024),'dark',head,8,6)
    ball('Broad cheek accent',(s*.39,.39,2.55),(.08,.025,.045),'orange',head,8,6)
# Hood is a continuous open-front shell: back/top remain covered, eyes remain clear.
verts=[]
for y,rx,rz,cz in [(-.30,.48,.43,2.64),(.0,.59,.52,2.64),(.34,.61,.54,2.64)]:
    for i in range(9):
        ang=math.radians(-25+i*230/8)
        verts.append((rx*math.cos(ang),y,cz+rz*math.sin(ang)))
faces=[]
for j in range(2):
    for i in range(8):faces.append((j*9+i,j*9+i+1,(j+1)*9+i+1,(j+1)*9+i))
mesh=bpy.data.meshes.new('Leaf hood shell');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Open leaf hood shell',mesh);parts.objects.link(o);attach(o,o.name,'leaf',head)
mod=o.modifiers.new('Leaf shell thickness','SOLIDIFY');mod.thickness=.045
for s in (-1,1):
    leaf('Broad brow hood leaf',(0,-.08,3.15),(s*.59,.43,2.83),.22,'leaflight',head,.05)
    leaf('Long side hood leaf',(s*.45,-.05,2.98),(s*.55,.25,2.30),.20,'leaf',head,.04)
leaf('Top hood crest',(0,-.20,3.08),(-.12,-.08,3.39),.18,'leaflight',head)
# Original crossbow assembled around a wood stock pointing +Y. Both palms contact it.
rod('Crossbow wood stock',(0,.42,1.83),(0,1.45,1.83),.105,'wood',weapon)
box('Crossbow upper track',(0,1.00,1.93),(.13,1.01,.055),'gold',weapon,.012)
rod('Crossbow grip',(0,.55,1.82),(.02,.48,1.50),.085,'wood',weapon)
# Bow limbs curve back towards the user at their tips; taut string meets drawn center.
for s in (-1,1):
    tube('Curved golden bow limb',[(0,1.40,1.87),(s*.31,1.45,1.87),(s*.57,1.32,1.87),(s*.73,1.13,1.87)],[.07,.065,.05,.035],'gold',weapon)
    rod('Taut crossbow string',(s*.73,1.13,1.87),(0,.75,1.93),.012,'dark',weapon)
ball('Seed launch bowl',(0,1.32,1.94),(.18,.19,.075),'wood',weapon)
seed=joint('seed-ammunition',(0,1.32,2.06),weapon)
ball('Golden seed ammunition',(0,1.32,2.06),(.13,.14,.135),'gold',seed)
for x,y in [(-.06,1.30),(.06,1.30),(0,1.39)]:ball('Large seed spot',(x,y,2.17),(.025,.028,.022),'wood',seed,8,6)
# Rigid arm assembly keeps fingers on the stock through every firing pose.
rod('Trigger upper arm',(.43,.02,1.98),(.60,.28,1.65),.17,'skin',weapon)
rod('Trigger leather bracer',(.60,.28,1.65),(.21,.49,1.61),.14,'wood',weapon)
ball('Trigger palm',(.11,.49,1.62),(.17,.13,.16),'skin',weapon)
for z in (1.54,1.63,1.72):rod('Wrapped trigger finger',(.16,.57,z),(-.055,.57,z),.043,'skin',weapon)
ball('Trigger opposing thumb',(-.065,.48,1.71),(.055,.075,.10),'skin',weapon)
rod('Supporting upper arm',(-.43,.01,1.99),(-.58,.38,1.60),.17,'skin',weapon)
rod('Supporting leather bracer',(-.58,.38,1.60),(-.21,1.03,1.64),.14,'wood',weapon)
ball('Supporting palm',(-.08,1.10,1.70),(.18,.15,.10),'skin',weapon)
for y in (.99,1.10,1.21):
    tube('Supporting curled finger',[(-.20,y,1.71),(-.16,y,1.85),(-.08,y,1.89)],[.045,.045,.035],'skin',weapon)
ball('Supporting thumb',(.10,1.07,1.76),(.075,.11,.065),'skin',weapon)
# Readable anticipation, release/recoil, settle and exact loop return.
POSES={'idle':1,'windup':8,'strike':12,'recover':21}
scene.render.fps=30;scene.frame_start=1;scene.frame_end=31
for frame,lean,pitch,recoil,tailturn,look in [(1,0,0,0,0,0),(8,.055,-.20,.045,-.09,.045),(10,.025,-.14,0,-.07,.025),(12,-.065,.29,-.20,.08,-.045),(15,-.035,.13,-.085,.045,-.02),(21,.015,-.025,.015,-.025,.01),(31,0,0,0,0,0)]:
    body.rotation_euler.x=lean;head.rotation_euler.x=look
    weapon.rotation_euler.x=pitch;weapon.location.y=.25+recoil
    tail.rotation_euler.z=tailturn
    for ob in (body,head,weapon,tail):ob.keyframe_insert('rotation_euler',frame=frame)
    weapon.keyframe_insert('location',frame=frame)
for ob in (body,head,weapon,tail):
    ob.animation_data.action.name='Seed shot / '+ob.name
    for fc in ob.animation_data.action.fcurves:
        for k in fc.keyframe_points:k.interpolation='LINEAR'
scene.frame_set(1)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=a.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Neutral studio world');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.39,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4
cd=bpy.data.cameras.new('Fixed orthographic camera');camera=bpy.data.objects.new(cd.name,cd);studio.objects.link(camera)
cd.type='ORTHO';cd.ortho_scale=5.45;camera.location=(7,10,7)
camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cd.shift_y+=ground.y-(1-550/640)
for name,loc,power,color in [('Warm key',(-4,6,8),900,(1,.90,.76)),('Cool fill',(5,3,5),650,(.65,.82,1)),('Rim',(1,-5,7),1000,(.75,.86,1))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=4;d.color=color;o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.8))-o.location).to_track_quat('-Z','Y').to_euler()

def export_runtime():
    scene.frame_set(1);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
    originals=list(parts.objects);names={o:o.name for o in originals};matrices={o:o.matrix_world.copy() for o in originals}
    temp=bpy.data.collections.new('Temporary export');scene.collection.children.link(temp);clones={}
    for o in originals:o.name=names[o]+'__editable'
    try:
        for o in originals:
            clone=bpy.data.objects.new(names[o],bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph)) if o.type=='MESH' else o.copy()
            clone.name=names[o];temp.objects.link(clone);clones[o]=clone
        for o,c in clones.items():c.parent=clones.get(o.parent);c.matrix_world=matrices[o]
        bpy.context.view_layer.update();batches={}
        for c in clones.values():
            if c.type=='MESH':batches.setdefault((c.parent.name,tuple(m.name for m in c.data.materials)),[]).append(c)
        for i,objects in enumerate(batches.values()):
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            objects[0].name='Gecko surface %02d'%i
        meshes=[o for o in temp.objects if o.type=='MESH'];triangles=0
        for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
        bpy.ops.object.select_all(action='DESELECT')
        for o in temp.objects:o.select_set(True)
        bpy.context.view_layer.objects.active=clones[root]
        bpy.ops.export_scene.gltf(filepath=str(OUT/'gecko-ranger.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='gecko-seed-shot',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
        return {'mesh_objects':len(meshes),'triangles':triangles,'materials':len({m.name for o in meshes for m in o.data.materials})}
    finally:
        for o in list(temp.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(temp)
        for o,n in names.items():o.name=n
runtime=export_runtime();bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)));front=world_to_camera_view(scene,camera,Vector((0,1,0)))
metadata={'id':'gecko-ranger-prototype','blender':bpy.app.version_string,'reference':'art-source/defense/concepts/2026-11-09/gecko-ranger.png','generator':'tools/blender/build_gecko.py','runtime':runtime,'glb_bytes':(OUT/'gecko-ranger.glb').stat().st_size,'editable_mesh_objects':sum(o.type=='MESH' for o in parts.objects),'rig':'Rigid object hierarchy; no skinning','coordinates':{'authoring_forward':'+Y','authoring_up':'+Z','glb_forward':'-Z','glb_up':'+Y','ground_z':0},'frame':{'width':640,'height':640,'ground':[round(ground.x*640,4),round((1-ground.y)*640,4)],'camera_location':list(camera.location),'camera_rotation_radians':list(camera.rotation_euler),'orthographic_scale':cd.ortho_scale,'shift_y':cd.shift_y,'forward_screen_dx':round((front.x-ground.x)*640,4)},'render':{'engine':'Cycles CPU','samples':a.samples,'denoising':False,'transparent':True,'render_skipped':a.skip_render},'animation':{'clip':'gecko-seed-shot','fps':30,'first_frame':1,'last_frame':31,'duration_seconds':1,'animated_nodes':[o.name for o in (body,head,weapon,tail)],'interpolation':'LINEAR','events':{'anticipation':8,'release_recoil':12,'recovery':21,'loop_return':31}},'poses':[],'limitations':['Rigid object animation; no skin weights, walk cycle, LOD or collision.','Seed is a loaded visual prop; no projectile/combat integration.','No FPS or device performance claim.']}
for name,frame in POSES.items():
    scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();pixels=[];worlds=[]
    for o in parts.objects:
        if o.type!='MESH':continue
        ev=o.evaluated_get(graph)
        for v in ev.data.vertices:
            w=ev.matrix_world@v.co;worlds.append(w);q=world_to_camera_view(scene,camera,w);pixels.append((q.x*640,(1-q.y)*640))
    bounds=[min(v[0] for v in pixels),min(v[1] for v in pixels),max(v[0] for v in pixels),max(v[1] for v in pixels)]
    metadata['poses'].append({'name':name,'frame':frame,'file':'gecko-ranger-'+name+'.png','projected_vertex_bbox':[round(v,3) for v in bounds],'world_bbox':[[round(min(w[k] for w in worlds),6) for k in range(3)],[round(max(w[k] for w in worlds),6) for k in range(3)]],'min_world_z':round(min(w.z for w in worlds),6),'inside_frame':all(0<=v<=640 for v in bounds)})
    assert metadata['poses'][-1]['inside_frame'], name+' clips camera'
    if not a.skip_render:
        scene.render.filepath=str(OUT/('gecko-ranger-'+name+'.png'));bpy.ops.render.render(write_still=True)
scene.frame_set(1);bpy.context.view_layer.update();scene['ground_anchor']='Origin pixel (320,550), 640 square transparent previews'
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gecko-ranger.blend'))
(OUT/'gecko-ranger-model.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('GECKO_COMPLETE '+json.dumps(metadata))
