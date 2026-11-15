"""Build an editable human spear guard prototype and three articulated GLB clips.

blender -b --python tools/blender/build_human_guard.py -- --samples 48 --size 768
All shapes are authored geometry. Concept sheet 14-A is a visual reference only.
"""
import argparse
import hashlib
import json
import math
import shutil
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/defense/prototypes/human-guard'
PUBLIC = ROOT / 'public/defense/models/prototypes'
REFERENCE = ROOT / 'art-source/defense/concepts/2026-11-12-characters/human-roles/14-human-garrison-troops.png'
parser = argparse.ArgumentParser()
parser.add_argument('--samples', type=int, default=96)
parser.add_argument('--size', type=int, default=768)
parser.add_argument('--skip-render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
SOURCE.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
COL = bpy.data.collections.new('Human guard / editable geometry')
STUDIO = bpy.data.collections.new('Studio / not exported')
bpy.context.scene.collection.children.link(COL)
bpy.context.scene.collection.children.link(STUDIO)
ROOT_OBJ = None

def material(name, color, metal=0, rough=.65):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    n = m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value = (*color, 1)
    n.inputs['Metallic'].default_value = metal
    n.inputs['Roughness'].default_value = rough
    return m

M = {
    'teal': material('Cloth / teal', (.018,.24,.215), rough=.86),
    'teal_light': material('Cloth / broad teal fold', (.032,.32,.28), rough=.86),
    'ivory': material('Cloth / ivory', (.79,.71,.51), rough=.9),
    'steel': material('Armor / blue steel', (.25,.35,.41), .62,.36),
    'steel_edge': material('Armor / steel edges', (.52,.62,.65), .7,.3),
    'brass': material('Fittings / warm brass', (.66,.34,.085), .65,.37),
    'leather': material('Leather / brown', (.17,.065,.025), rough=.79),
    'dark': material('Soles and recesses', (.035,.025,.018), rough=.8),
    'wood': material('Shield and spear / oak', (.32,.14,.045), rough=.83),
    'wood_light': material('Wood / broad grain', (.49,.25,.075), rough=.82),
    'skin': material('Skin / warm tan', (.46,.235,.11), rough=.7),
    'skin_light': material('Skin / nose and ear', (.53,.265,.13), rough=.7),
    'hair': material('Hair / chestnut', (.065,.025,.012), rough=.83),
    'eye': material('Eyes / warm whites', (.95,.91,.77), rough=.4),
    'pupil': material('Eyes / dark brown', (.018,.012,.009), rough=.37),
}

def finish(o, name, mat=None, parent=None, bevel=0, smooth=False):
    o.name = name
    for c in list(o.users_collection): c.objects.unlink(o)
    COL.objects.link(o)
    if mat: o.data.materials.append(M[mat])
    bpy.context.view_layer.update()
    parent = parent or ROOT_OBJ
    if parent:
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = world
    if bevel:
        mod = o.modifiers.new('Broad softened edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        n = o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        n.keep_sharp = True
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o

def group(name, location=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    COL.objects.link(o)
    o.location = location
    bpy.context.view_layer.update()
    if parent:
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = world
    return o

def box(name, loc, size, mat, parent=None, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o,name,mat,parent,bevel)

def ellipsoid(name, loc, size, mat, parent=None, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o,name,mat,parent,smooth=smooth)

def mesh(name, verts, faces, mat, parent=None, bevel=0):
    data = bpy.data.meshes.new(name+' geometry')
    data.from_pydata(verts, [], faces)
    data.update()
    o = bpy.data.objects.new(name,data)
    COL.objects.link(o)
    return finish(o,name,mat,parent,bevel)

def cylinder(name, loc, radius, depth, mat, parent=None, vertices=16, bevel=.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object,name,mat,parent,bevel)

def rod(name, a, b, radius, mat, parent=None, vertices=12):
    a,b = Vector(a),Vector(b)
    o = cylinder(name,(a+b)/2,radius,(b-a).length,mat,parent,vertices)
    o.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return o

def panel(name, points, y, depth, mat, parent=None, bevel=.012):
    n = len(points)
    verts = [(x,y-depth/2,z) for x,z in points]+[(x,y+depth/2,z) for x,z in points]
    faces = [tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,parent,bevel)

ROOT_OBJ = group('human-guard')
ROOT_OBJ['forward'] = 'Blender +Y; GLB -Z'
ROOT_OBJ['status'] = 'Prototype / not a new campaign unit'
body = group('guard-body',(0,0,.95),ROOT_OBJ)
head = group('guard-head',(0,0,2.25),body)
arm = group('guard-spear-arm',(-.57,0,1.84),body)
shield_arm = group('guard-shield-arm',(.57,0,1.84),body)
legs = [group('guard-leg-'+side,(x,0,.84),ROOT_OBJ) for side,x in [('left',-.27),('right',.27)]]

# Boots rest exactly on Z=0. The walk uses rigid leg translation with no root drift.
for leg,x in zip(legs,[-.27,.27]):
    box('Boot / dark sole',(x,.11,.07),(.49,.73,.14),'dark',leg,.045)
    box('Boot / heavy leather',(x,.10,.24),(.46,.66,.27),'leather',leg,.08)
    box('Boot / toe cap',(x,.34,.25),(.46,.27,.24),'leather',leg,.07)
    box('Boot / broad cuff',(x,-.015,.47),(.42,.44,.22),'leather',leg,.04)
    box('Boot / single brass clasp',(x,.221,.48),(.17,.055,.10),'brass',leg,.015)
    ellipsoid('Leg / padded trousers',(x,0,.69),(.215,.24,.32),'dark',leg)

# A shared rank-and-file uniform with broad folds, not royal plate armor.
ellipsoid('Torso / compact padded tunic',(0,0,1.43),(.54,.36,.56),'teal',body)
mesh('Tunic / broad left fold',[(-.34,.245,1.86),(-.10,.348,1.79),(-.09,.33,1.15),(-.35,.24,1.12)],[(0,1,2,3)],'teal_light',body)
mesh('Tunic / broad right fold',[(.10,.348,1.79),(.34,.245,1.86),(.35,.24,1.12),(.09,.33,1.15)],[(0,1,2,3)],'teal',body)
for x in [-.26,.26]:
    points=[(x-.25,1.09),(x+.24,1.09),(x+.27,.70),(x-.23,.70)]
    panel('Tunic / ivory hem backing',points,.20,.35,'ivory',body)
    panel('Tunic / split teal skirt',[(x-.21,1.08),(x+.20,1.08),(x+.22,.75),(x-.19,.75)],.405,.045,'teal',body)
box('Belt / broad leather',(0,.0,1.10),(1.10,.79,.18),'leather',body,.055)
box('Belt / bronze buckle',(0,.43,1.10),(.29,.09,.23),'brass',body,.022)
box('Belt / buckle inset',(0,.486,1.10),(.19,.025,.14),'leather',body,.012)
rod('Belt / simple tree stem',(0,.508,1.04),(0,.508,1.16),.016,'brass',body,8)
for side in [-1,1]:
    rod('Belt / leaf emblem',(0,.508,1.12),(side*.06,.508,1.17),.019,'brass',body,8)
    rod('Collar / ivory piping',(side*.25,.26,1.91),(side*.035,.375,1.75),.035,'ivory',body)
rod('Collar / short crossing lace',(-.10,.385,1.80),(.10,.385,1.68),.018,'brass',body,8)
rod('Collar / short crossing lace',(.10,.385,1.80),(-.10,.385,1.68),.018,'brass',body,8)
ellipsoid('Neck',(0,.02,1.93),(.19,.18,.21),'skin',body)

# Human head: a broad jaw, rounded ears, cropped hair and no fantasy appendages.
ellipsoid('Head / broad human face',(0,.02,2.38),(.50,.41,.58),'skin',head)
ellipsoid('Head / jaw',(0,.14,2.14),(.36,.30,.25),'skin',head)
for side in [-1,1]:
    ellipsoid('Ear / human round',(side*.50,.035,2.40),(.11,.11,.16),'skin',head)
    ellipsoid('Ear / inner',(side*.558,.090,2.41),(.043,.058,.086),'skin_light',head)
    ellipsoid('Eye / white',(side*.19,.387,2.48),(.112,.035,.068),'eye',head)
    ellipsoid('Eye / brown pupil',(side*.19,.422,2.48),(.044,.016,.050),'pupil',head)
    ellipsoid('Eye / small catchlight',(side*.19-.012,.438,2.50),(.012,.006,.014),'eye',head)
    brow=box('Brow / adult expression',(side*.195,.409,2.575),(.255,.065,.065),'hair',head,.016)
    brow.rotation_euler.y = -side*.16
ellipsoid('Nose / rounded human bridge',(0,.426,2.355),(.085,.13,.105),'skin_light',head)
rod('Mouth / firm line',(-.115,.427,2.185),(.115,.427,2.185),.014,'hair',head,8)
ellipsoid('Chin / small stubble patch',(0,.357,2.04),(.13,.035,.043),'hair',head)
for side in [-1,1]:
    for i in range(3):
        lock=ellipsoid('Hair / cropped side lock',(side*(.41-i*.045),.14+i*.09,2.64+i*.035),(.13,.15,.16),'hair',head,smooth=False)
        lock.rotation_euler.y=side*.25

# Open-face helmet: hemispherical dome and generous rim, leaving facial features readable.
verts=[];faces=[]
for r in range(7):
    theta=(math.pi/2)*(r/6)
    for i in range(20):
        a=2*math.pi*i/20
        verts.append((.57*math.sin(theta)*math.cos(a),.49*math.sin(theta)*math.sin(a)-.015,2.74+.40*math.cos(theta)))
for r in range(6):
    for i in range(20):faces.append((r*20+i,r*20+(i+1)%20,(r+1)*20+(i+1)%20,(r+1)*20+i))
helmet=mesh('Helmet / domed steel',verts,faces,'steel',head)
solid=helmet.modifiers.new('Steel thickness','SOLIDIFY');solid.thickness=.035
bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=(0,-.015,2.745),major_radius=.57,minor_radius=.035)
rim=finish(bpy.context.object,'Helmet / broad rolled rim','steel_edge',head)
rim.scale.y=.88
for z,y in [(3.10,.02),(3.02,.26),(2.87,.43)]:
    ellipsoid('Helmet / central brass rivet',(0,y,z),(.028,.025,.028),'brass',head)
for side in [-1,1]:
    box('Helmet / side plate',(side*.53,-.02,2.71),(.065,.31,.20),'steel',head,.035)

# Arms and equipment are rigidly attached to their respective pivots.
for side,par in [(-1,arm),(1,shield_arm)]:
    x=side*.62
    ellipsoid('Sleeve / ivory shoulder',(x,.015,1.78),(.25,.25,.29),'ivory',par)
    box('Shoulder / simple steel plate',(x,-.005,1.96),(.55,.55,.19),'steel',par,.06)
    rod('Shoulder / rim',(x-.21,.27,1.94),(x+.21,.27,1.94),.025,'steel_edge',par)
    for dx in [-.16,.16]:ellipsoid('Shoulder / single rivet',(x+dx,.284,1.93),(.025,.020,.025),'brass',par)
    rod('Sleeve / forearm',(side*.69,.10,1.68),(side*.84,.36,1.49),.175,'ivory',par)
    rod('Glove / broad bracer',(side*.83,.34,1.50),(side*.88,.47,1.48),.18,'leather',par)
    ellipsoid('Hand / leather glove',(side*.89,.49,1.48),(.19,.19,.18),'leather',par)
    for k in range(3):
        box('Hand / broad knuckle',(side*.89-.09+k*.09,.63,1.50),(.075,.06,.10),'leather',par,.022)

spear=group('guard-spear',(-.89,.52,1.48),arm)
spear['grip_attachment']='Rigid child of spear-arm; no independent wrist animation'
rod('Spear / oak haft',(-.89,.52,.12),(-.89,.52,3.12),.046,'wood',spear)
rod('Spear / broad highlight',(-.862,.54,.22),(-.862,.54,3.00),.008,'wood_light',spear,8)
for z in [1.30,1.40,1.50,1.60]:cylinder('Spear / coarse grip winding',(-.89,.52,z),.059,.035,'leather',spear)
cylinder('Spear / bronze socket',(-.89,.52,3.07),.083,.19,'brass',spear)
# Actual diamond cross-section and central ridge rather than a flat alpha card.
sx,sy=-.89,.52
tip=mesh('Spear / broad diamond blade',[(sx,sy,3.62),(sx-.18,sy,3.25),(sx,sy+.065,3.24),(sx+.18,sy,3.25),(sx,sy-.065,3.24),(sx,sy,3.05)],[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(5,2,1),(5,3,2),(5,4,3),(5,1,4)],'steel_edge',spear)
cylinder('Spear / steel butt',(-.89,.52,.13),.066,.20,'steel',spear)

shield=group('guard-shield',(.89,.60,1.45),shield_arm)
shield['grip_attachment']='Rigid child of shield-arm'
disc=cylinder('Shield / steel rim',(.89,.67,1.43),.60,.12,'steel',shield,20)
disc.rotation_euler.x=math.pi/2
disc=cylinder('Shield / oak face',(.89,.745,1.43),.535,.055,'wood',shield,20)
disc.rotation_euler.x=math.pi/2
for dx in [-.35,-.175,0,.175,.35]:
    h=math.sqrt(.515**2-dx**2)
    rod('Shield / board seam',(.89+dx,.783,1.43-h),(.89+dx,.783,1.43+h),.008,'dark',shield,6)
    if dx!=0:
        rod('Shield / broad oak grain',(.89+dx+.045,.785,1.43-h*.65),(.89+dx+.025,.785,1.43+h*.65),.006,'wood_light',shield,6)
panel('Shield / painted teal stripe',[(.79,.91),(.99,.91),(.99,1.95),(.79,1.95)],.791,.012,'teal',shield,.002)
disc=cylinder('Shield / central steel boss',(.89,.84,1.43),.16,.09,'steel_edge',shield,16)
disc.rotation_euler.x=math.pi/2
ellipsoid('Shield / convex boss',(.89,.90,1.43),(.13,.065,.13),'steel',shield)
for i in range(8):
    a=i*math.pi/4
    ellipsoid('Shield / rim rivet',(.89+math.cos(a)*.565,.755,1.43+math.sin(a)*.565),(.027,.025,.027),'brass',shield)

# Author clips as matching NLA track names, merged by the glTF exporter per clip.
scene=bpy.context.scene
scene.render.fps=30
scene.frame_start=0
scene.frame_end=60
animated=[body,head,arm,shield_arm,*legs]
rest={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in animated}
clip_specs=[('human-guard-idle',60),('human-guard-walk',24),('human-guard-thrust',30)]

def reset_nodes():
    for o,(loc,rot,scale) in rest.items():
        o.location=loc;o.rotation_euler=rot;o.scale=scale

for clip,last_frame in clip_specs:
    for o in animated:
        o.animation_data_create()
        o.animation_data.action=bpy.data.actions.new(clip+' / '+o.name)
    for frame in range(last_frame+1):
        reset_nodes()
        t=frame/last_frame
        if clip.endswith('idle'):
            body.scale.z=1+.009*math.sin(t*math.tau)
            head.rotation_euler.z=.015*math.sin(t*math.tau)
        elif clip.endswith('walk'):
            for i,leg in enumerate(legs):
                phase=t*math.tau+i*math.pi
                leg.location.y=rest[leg][0].y+.16*math.cos(phase)
                leg.location.z=rest[leg][0].z+.095*max(0,math.sin(phase))
            body.rotation_euler.z=.025*math.sin(t*math.tau)
            arm.rotation_euler.x=.045*math.sin(t*math.tau)
            shield_arm.rotation_euler.x=-.04*math.sin(t*math.tau)
        else:
            # Authored contact is frame 12 / .4s, maximum reach of the blade.
            keys=[(0,0,0),(7,-.52,-.08),(12,-1.32,.68),(16,-1.22,.60),(23,-.35,.10),(30,0,0)]
            for (f0,r0,y0),(f1,r1,y1) in zip(keys,keys[1:]):
                if f0<=frame<=f1:
                    q=(frame-f0)/(f1-f0)
                    arm.rotation_euler.x=r0+(r1-r0)*q
                    arm.location.y=rest[arm][0].y+y0+(y1-y0)*q
                    break
            power=max(0,-arm.rotation_euler.x/1.32)
            body.rotation_euler.x=-.045*power
            head.rotation_euler.x=.045*power
            shield_arm.rotation_euler.x=-.06*power
        for o in animated:
            for prop in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=prop,frame=frame)
    for o in animated:
        action=o.animation_data.action
        for fc in action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
        track=o.animation_data.nla_tracks.new();track.name=clip
        strip=track.strips.new(clip,0,action);strip.action_frame_start=0;strip.action_frame_end=last_frame
        strip.blend_type='REPLACE';strip.extrapolation='NOTHING'
        track.mute=True
        o.animation_data.action=None
reset_nodes()
scene.frame_set(0)

def set_clip(name,frame=0):
    for o in animated:
        for tr in o.animation_data.nla_tracks:tr.mute=tr.name!=name
    scene.frame_set(frame);bpy.context.view_layer.update()

def export_runtime():
    set_clip('human-guard-idle',0)
    original=list(COL.objects)
    names={o:o.name for o in original}
    matrices={o:o.matrix_world.copy() for o in original}
    graph=bpy.context.evaluated_depsgraph_get()
    temp=bpy.data.collections.new('Runtime export temporary');scene.collection.children.link(temp)
    clones={}
    for o in original:o.name=names[o]+'__editable'
    try:
        for o in original:
            if o.type=='MESH':
                data=bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph)
                c=bpy.data.objects.new(names[o],data)
            else:
                c=o.copy();c.name=names[o]
            temp.objects.link(c);clones[o]=c
        for o,c in clones.items():c.parent=clones.get(o.parent);c.matrix_world=matrices[o]
        bpy.context.view_layer.update()
        batches={}
        for c in clones.values():
            if c.type=='MESH':batches.setdefault(c.parent.name,[]).append(c)
        for index,objects in enumerate(batches.values()):
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            objects[0].name='Human guard articulated surface %02d'%(index+1)
        bpy.ops.object.select_all(action='DESELECT')
        for o in temp.objects:
            o.select_set(True)
            if o.animation_data:
                for tr in o.animation_data.nla_tracks:tr.mute=False
        bpy.context.view_layer.objects.active=clones[ROOT_OBJ]
        bpy.ops.export_scene.gltf(filepath=str(SOURCE/'human-guard.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_anim_slide_to_zero=True,export_extras=True)
    finally:
        for o in list(temp.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(temp)
        for o,name in names.items():o.name=name
    set_clip('human-guard-idle',0)
export_runtime()

# Studio is excluded from GLB. The renderer shows actual authored geometry.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=args.size;scene.render.resolution_y=args.size;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Human guard soft studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.25,.28,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
data=bpy.data.cameras.new('Human guard camera');camera=bpy.data.objects.new(data.name,data);STUDIO.objects.link(camera)
data.type='ORTHO';data.ortho_scale=4.8;camera.location=(6,10,5.7)
camera.rotation_euler=(Vector((0,.1,1.65))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc
    o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm key',(-4,6,8),850,4,(1,.86,.70))
area('Cool fill',(5,3,5),650,4,(.70,.85,1))
area('Gold rim',(1,-4,6),900,3,(1,.83,.60))

for name,clip,frame in [('human-guard','human-guard-idle',0),('human-guard-thrust','human-guard-thrust',12),('human-guard-walk','human-guard-walk',6)]:
    set_clip(clip,frame)
    if not args.skip_render:
        scene.render.filepath=str(SOURCE/(name+'.png'));bpy.ops.render.render(write_still=True)
set_clip('human-guard-idle',0)
scene['regenerate']='blender -b --python tools/blender/build_human_guard.py'
scene['status']='Editable human guard prototype; no campaign spawn or combat registration'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'human-guard.blend'))
shutil.copy2(SOURCE/'human-guard.glb',PUBLIC/'human-guard.glb')
if not args.skip_render:shutil.copy2(SOURCE/'human-guard.png',PUBLIC/'human-guard.png')

# Report exported data, not estimates from the editable scene.
raw=(SOURCE/'human-guard.glb').read_bytes()
length=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+length])
stats={'meshes':len(gltf.get('meshes',[])),'primitives':sum(len(m['primitives']) for m in gltf['meshes']),'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives']),'materials':len(gltf.get('materials',[])),'nodes':len(gltf.get('nodes',[]))}
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
clips=[]
for a in gltf.get('animations',[]):
    duration=max(gltf['accessors'][s['input']].get('max',[0])[0] for s in a['samplers'])
    clips.append({'name':a['name'],'duration_seconds':round(duration,6),'contact_seconds':.4 if a['name']=='human-guard-thrust' else None,'contact_basis':'Authored maximum spear-arm reach at frame 12, 30 fps; gameplay damage not triggered by this asset' if a['name']=='human-guard-thrust' else None})
files={}
for path in sorted(SOURCE.glob('*')):
    if path.suffix in ['.blend','.glb','.png']:files[path.name]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
manifest={'id':'human-guard','status':'articulated_model_prototype_not_runtime_unit','reference':str(REFERENCE.relative_to(ROOT)),'reference_candidate':'14-A','reference_sha256':hashlib.sha256(REFERENCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_human_guard.py','blender':bpy.app.version_string,'coordinates':{'authoring_up':'+Z','authoring_forward':'+Y','gltf_up':'+Y','gltf_forward':'-Z','ground_y_gltf':0,'root_motion':False},'proportions':{'skull_top':2.96,'chin_bottom':1.80,'sole_bottom':0,'approximate_body_heads':round(2.96/(2.96-1.80),2),'note':'Authoring dimensions; excludes helmet/spear. Styling guide, not a scan of the concept.'},'animation':{'fps':30,'rig':'articulated object hierarchy, not skinning','clips':clips,'walk_note':'In-place rigid leg translation and lift; no foot IK. Supporting foot stays on authoring ground at keyed samples.'},'runtime':stats,'sprite':{'width':args.size,'height':args.size,'ground_pixels':[round(ground.x*args.size,3),round((1-ground.y)*args.size,3)],'orthographic_scale':4.8},'files':files,'limitations':['Geometry and flat PBR color blocks are a prototype, not image-equivalent hand-painted textures.','Human guard is available for workshop review only; no new combat class or spawn behavior is registered.','Full motion collision, far-camera readability and actual mobile performance remain unverified.']}
(SOURCE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('HUMAN_GUARD_COMPLETE '+json.dumps({'stats':stats,'clips':clips},ensure_ascii=False))
