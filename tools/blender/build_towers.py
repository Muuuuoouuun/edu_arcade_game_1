"""Rebuild editable Arcana miniature towers, GLB models and transparent game sprites.

Run from the repository root:
    blender -b --python tools/blender/build_towers.py
Optional arguments after --: --size 640 --samples 128 --only fire-tower|fire-tower-lv3|lightning-tower|lightning-tower-lv3|piercing-ballista-lv3|water-cannon-lv3 --skip-render
*-lv3 ids are render-only Lv.3 sprite variants (baked 2.5D, no GLB).
No image inputs are altered. All geometry/materials are authored here in Blender.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'defense' / 'models'
SOURCE = ROOT / 'art-source' / 'defense'
NAMES = ('fire-tower', 'piercing-ballista', 'water-cannon')
args = argparse.ArgumentParser()
args.add_argument('--size', type=int, default=640)
args.add_argument('--samples', type=int, default=128)
VARIANTS_IDS = ('fire-tower-lv3', 'piercing-ballista-lv3', 'water-cannon-lv3', 'lightning-tower', 'lightning-tower-lv3')
args.add_argument('--only', choices=NAMES + VARIANTS_IDS)
args.add_argument('--skip-render', action='store_true')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(37)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection':
        bpy.data.collections.remove(collection)
DEFAULT = bpy.data.collections.get('Collection')
if DEFAULT:
    bpy.data.collections.remove(DEFAULT)


def mat(name, color, metallic=0.0, roughness=0.5, emission=0.0, transmission=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Coat Weight'].default_value = 0.25 if metallic or transmission else 0.04
    shader.inputs['Coat Roughness'].default_value = 0.2
    shader.inputs['Transmission Weight'].default_value = transmission
    shader.inputs['IOR'].default_value = 1.45
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return material

M = {
    'mortar': mat('Stone / recessed dark mortar', (0.095, 0.105, 0.115), roughness=0.95),
    'stone': mat('Stone / warm limestone', (0.44, 0.42, 0.36), roughness=0.82),
    'stone_light': mat('Stone / pale chipped edges', (0.57, 0.55, 0.47), roughness=0.8),
    'stone_dark': mat('Stone / ash basalt', (0.15, 0.17, 0.19), roughness=0.78),
    'stone_dark2': mat('Stone / basalt variation', (0.22, 0.235, 0.24), roughness=0.76),
    'brass': mat('Metal / aged gold brass', (0.63, 0.345, 0.075), 0.72, 0.3),
    'gold': mat('Metal / polished brass edges', (0.9, 0.57, 0.16), 0.7, 0.24),
    'iron': mat('Metal / dark wrought iron', (0.075, 0.1, 0.125), 0.68, 0.33),
    'steel': mat('Metal / forged steel blade', (0.34, 0.41, 0.46), 0.8, 0.24),
    'wood': mat('Wood / warm oiled oak', (0.24, 0.075, 0.022), roughness=0.64),
    'wood_light': mat('Wood / oak edge grain', (0.36, 0.15, 0.045), roughness=0.58),
    'wood_dark': mat('Wood / end grain recess', (0.12, 0.035, 0.012), roughness=0.78),
    'rope': mat('Rope / waxed bowstring', (0.7, 0.52, 0.27), roughness=0.85),
    'red': mat('Cloth / ember red banner', (0.46, 0.025, 0.012), roughness=0.78),
    'teal': mat('Cloth / hunter teal banner', (0.015, 0.20, 0.205), roughness=0.72),
    'blue': mat('Cloth / river blue banner', (0.018, 0.12, 0.34), roughness=0.68),
    'crystal': mat('Crystal / ember outer facets', (0.85, 0.055, 0.004), roughness=0.22, emission=0.12, transmission=0.10),
    'crystal_light': mat('Crystal / illuminated amber facets', (1.0, 0.30, 0.018), roughness=0.18, emission=0.45),
    'crystal_dark': mat('Crystal / deep red facets', (0.40, 0.014, 0.005), roughness=0.30, emission=0.06),
    'ivory': mat('Instrument / ivory enamel face', (0.82, 0.77, 0.57), roughness=0.45),
    'core': mat('Crystal / bright flame heart', (1.0, 0.57, 0.035), roughness=0.16, emission=1.5),
    'glass': mat('Glass / turquoise pressure vessel', (0.035, 0.62, 0.69), roughness=0.17, transmission=0.32),
    'water': mat('Water / luminous azure reservoir', (0.012, 0.36, 0.54), roughness=0.21, emission=0.16),
    'enamel': mat('Enamel / turquoise cannon shell', (0.018, 0.34, 0.38), 0.4, 0.25),
    'volt': mat('Crystal / storm outer facets', (0.10, 0.28, 0.85), roughness=0.2, emission=0.15, transmission=0.10),
    'volt_light': mat('Crystal / illuminated cyan facets', (0.25, 0.82, 1.0), roughness=0.16, emission=0.55),
    'volt_dark': mat('Crystal / deep indigo facets', (0.05, 0.05, 0.38), roughness=0.3, emission=0.06),
    'arc': mat('Crystal / white-violet arc heart', (0.78, 0.86, 1.0), roughness=0.14, emission=1.8),
    'bubble': mat('Water / bright air bubbles', (0.24, 0.88, 0.94), roughness=0.12, emission=0.25),
}
CURRENT = None
MODEL_ROOT = None


def new_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def finish(obj, name, material=None, parent=None, bevel=0.0, smooth=False):
    obj.name = name
    move_to_collection(obj, CURRENT)
    if material:
        obj.data.materials.append(M[material])
    if parent is None:
        parent = MODEL_ROOT
    if parent:
        matrix = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = matrix
    if bevel:
        mod = obj.modifiers.new('Hand-rounded edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    if obj.type == 'MESH':
        if smooth:
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        if bevel:
            mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
            mod.keep_sharp = True
    return obj


def group(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    CURRENT.objects.link(obj)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = 0.25
    if name in ('fire-core', 'turret', 'bolt', 'barrel'):
        obj['animation_role'] = name
    obj.location = location
    # Empty transforms are lazy: update before preserving world space for parenting.
    # Otherwise every exported animation pivot silently collapses to the origin.
    bpy.context.view_layer.update()
    parent = parent or MODEL_ROOT
    if parent:
        matrix = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = matrix
    bpy.context.view_layer.update()
    return obj


def cube(name, position, scale, material, bevel=0.04, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material, parent, bevel)


def cyl(name, position, radius, depth, material, vertices=24, parent=None, bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=position)
    return finish(bpy.context.object, name, material, parent, bevel, True)


def sphere(name, position, scale, material, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=position)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material, parent, smooth=True)


def beam(name, start, end, width, depth, material, parent=None, bevel=0.025):
    a, b = Vector(start), Vector(end)
    obj = cube(name, (a + b) / 2, (width, depth, (b-a).length), material, bevel, parent)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def rod(name, start, end, radius, material, parent=None, vertices=16):
    a, b = Vector(start), Vector(end)
    obj = cyl(name, (a+b)/2, radius, (b-a).length, material, vertices, parent, min(radius*.25, .02))
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def torus(name, position, radius, thickness, material, parent=None, rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness, major_segments=32, minor_segments=8, location=position)
    obj = bpy.context.object
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, name, material, parent, smooth=True)


def mesh(name, vertices, faces, material, parent=None, bevel=0.0):
    data = bpy.data.meshes.new(name + ' mesh')
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    CURRENT.objects.link(obj)
    return finish(obj, name, material, parent, bevel)


def panel(name, points, y, thickness, material, parent=None, bevel=0.015):
    count = len(points)
    verts = [(x, y-thickness/2, z) for x,z in points] + [(x, y+thickness/2, z) for x,z in points]
    faces = [tuple(range(count-1, -1, -1)), tuple(range(count, count*2))]
    faces += [(i, (i+1)%count, (i+1)%count+count, i+count) for i in range(count)]
    return mesh(name, verts, faces, material, parent, bevel)


def tube(name, points, radius, material, parent=None):
    curve = bpy.data.curves.new(name + ' path', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 8
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, xyz in zip(spline.points, points):
        p.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    CURRENT.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.select_set(False)
    return finish(obj, name, material, parent, smooth=True)


def wedge(name, inner, outer, z, height, start, end, material, parent=None):
    # Separate masonry blocks have readable gaps, not a single cylinder texture.
    steps = 3
    angles = [start + (end-start)*i/steps for i in range(steps+1)]
    ring = [(outer*math.cos(a), outer*math.sin(a)) for a in angles]
    ring += [(inner*math.cos(a), inner*math.sin(a)) for a in reversed(angles)]
    n = len(ring)
    verts = [(x,y,z-height/2) for x,y in ring] + [(x,y,z+height/2) for x,y in ring]
    faces = [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name, verts, faces, material, parent, .025)


def masonry(name, inner, outer, z, height, count=10, dark=False, offset=0):
    for i in range(count):
        angle = math.tau * i/count + offset
        kind = ('stone_dark2' if i%3==0 else 'stone_dark') if dark else ('stone_light' if i%3==0 else 'stone')
        wedge(f'{name} / block {i+1:02}', inner, outer, z, height, angle+.018, angle+math.tau/count-.018, kind)


def base():
    cyl('Foundation / mortar bed', (0,0,.14), 1.22, .28, 'mortar', 32)
    masonry('Foundation / limestone', .84, 1.25, .21, .34, 10)
    cyl('Foundation / inset paving', (0,0,.35), 1.00, .13, 'stone_dark', 24)


def rivet(position, material='gold', size=.045, parent=None):
    sphere('Hardware / domed rivet', position, (size,size,size), material, parent)


def banner(material, emblem, y=-1.06, top=1.4, bottom=.47, width=.55):
    points = [(-width/2,top),(width/2,top),(width/2,bottom+.17),(0,bottom),(-width/2,bottom+.17)]
    panel('Heraldry / embroidered gold border', [(x*1.07,z) for x,z in points], y, .06, 'gold')
    panel('Heraldry / heavy cloth', [(x*.85, z+.04 if z<top-.1 else z-.04) for x,z in points], y-.041, .028, material)
    rod('Heraldry / hanging rod', (-width*.66,y-.01,top+.045),(width*.66,y-.01,top+.045),.045,'brass')
    if emblem == 'flame':
        panel('Heraldry / flame sigil', [(0,.63),(-.16,.82),(-.13,1.01),(-.04,.94),(0,1.23),(.15,.99),(.13,.80)], y-.075,.02,'gold')
        panel('Heraldry / flame center', [(0,.72),(-.06,.84),(.02,1.02),(.075,.85)],y-.09,.01,'core')
    elif emblem == 'arrow':
        panel('Heraldry / arrow sigil', [(-.035,.66),(.035,.66),(.035,1.04),(.13,.95),(0,1.22),(-.13,.95),(-.035,1.04)],y-.08,.02,'gold')
        for side in [-1,1]:
            panel('Heraldry / wing', [(side*.06,.86),(side*.23,1.02),(side*.19,.81),(side*.06,.75)],y-.08,.02,'gold')
    else:
        for z in [.75,.94,1.13]:
            tube('Heraldry / wave embroidery',[(-.18,y-.08,z),(-.09,y-.08,z+.055),(0,y-.08,z),(.09,y-.08,z+.055),(.18,y-.08,z)],.019,'bubble')


def crystal(name, x, y, bottom, height, radius, material, parent=None):
    n = 6
    verts = [(x,y,bottom)]
    verts += [(x+radius*.70*math.cos(math.tau*i/n),y+radius*.70*math.sin(math.tau*i/n),bottom+height*.22) for i in range(n)]
    verts += [(x+radius*math.cos(math.tau*i/n+.08),y+radius*math.sin(math.tau*i/n+.08),bottom+height*.57) for i in range(n)]
    verts.append((x,y,bottom+height))
    faces = []
    for i in range(n):
        j = (i+1)%n
        faces += [(0,1+j,1+i),(1+i,1+j,1+n+j,1+n+i),(1+n+i,1+n+j,len(verts)-1)]
    obj=mesh(name,verts,faces,material,parent,.008)
    if material in ('crystal','volt'):
        obj.data.materials.append(M['crystal_light' if material=='crystal' else 'volt_light'])
        obj.data.materials.append(M['crystal_dark' if material=='crystal' else 'volt_dark'])
        # Real facet materials keep the shard readable without a texture or bloom.
        for face in obj.data.polygons:
            face.material_index=(1 if face.index%9 in (1,2,5) else 2 if face.index%9 in (6,7) else 0)
    return obj


def fire_tower(ascended=False, storm=False):
    # storm=True is the Lightning branch: same keep, blue-white arc crystal, rod and bolt window.
    CRY,HEART=('volt','arc') if storm else ('crystal','core')
    base()
    cyl('Keep / basalt core',(0,0,1.02),.95,1.42,'mortar',32)
    for row in range(3):
        masonry(f'Keep / masonry course {row+1}',.72,1.02,.64+row*.4,.37,10,True,row*.27)
    for angle in [math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]:
        x,y=1.04*math.cos(angle),1.04*math.sin(angle)
        obj=cube('Keep / reinforced buttress',(x,y,1.0),(.29,.30,1.16),'stone_dark2',.045)
        obj.rotation_euler.z=angle
        cyl('Buttress / gold capital',(x,y,1.61),.18,.12,'brass',8)
        crystal('Buttress / gold finial',x,y,1.65,.26,.13,'gold')
        rivet((x*1.1,y*1.1,.70),size=.055)
    cyl('Crown / lower brass girdle',(0,0,1.67),1.05,.13,'brass',32)
    torus('Crown / polished rim',(0,0,1.75),.78,.07,'gold')
    cyl('Crown / fiery brazier',(0,0,1.75),.72,.15,'iron',24)
    cyl('Crown / ember pool',(0,0,1.84),.64,.035,HEART,32)
    core=group('fire-core',(0,0,2.45))
    core['animation_hint']='Pulse scale 0.98–1.04 or bob along local Z.'
    crystal('Crystal / main amber shard',0,0,1.82,1.92,.55,CRY,core)
    for side in [-1,1]:
        crystal('Crystal / orbiting ember shard',side*.69,.18,1.95,1.08,.23,CRY,core)
        crystal('Crystal / shard foot',side*.69,.18,1.91,.27,.27,'brass')
    crystal('Crystal / incandescent center',0,-.025,1.94,1.39,.28,HEART,core)
    for i,angle in enumerate([math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]):
        points=[(.72,1.65),(.99,1.75),(.99,1.98),(.79,2.34),(.59,2.58),(.62,2.20),(.72,1.97)]
        tangent=Vector((-math.sin(angle),math.cos(angle),0))
        radial=Vector((math.cos(angle),math.sin(angle),0))
        verts=[]
        for side in [-1,1]:
            for radius,z in points:
                verts.append(tuple(radial*radius+tangent*(side*.075)+Vector((0,0,z))))
        n=len(points)
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        mesh(f'Crown / bronze crystal claw {i+1}',verts,faces,'brass',bevel=.025)
        rivet((.96*math.cos(angle),.96*math.sin(angle),1.86),size=.07)
    # Layered arch has a dark recess and a bright inner flame, rather than a flat badge.
    arch=[(-.37,.47),(.37,.47),(.37,1.12),(.27,1.38),(0,1.59),(-.27,1.38),(-.37,1.12)]
    panel('Keep / bronze arch surround',arch,-1.02,.10,'brass',bevel=.028)
    panel('Keep / deep arched recess',[(x*.77,.56+(z-.47)*.81) for x,z in arch],-1.09,.025,'mortar',bevel=.012)
    if storm:
        panel('Keep / glowing lightning window',[(.10,.64),(-.13,.93),(-.01,.93),(-.12,1.28),(.17,.88),(.04,.88)],-1.113,.016,HEART,bevel=.008)
    else:
      panel('Keep / glowing flame window',[(0,.65),(-.16,.84),(-.12,1.07),(-.035,1.0),(0,1.31),(.17,1.02),(.13,.80)],-1.113,.016,HEART,bevel=.008)
    for side in [-1,1]:
        cube('Keep / basalt arch pilaster',(side*.42,-.99,.88),(.14,.17,.83),'stone_dark2',.025)
        crystal('Keep / gold arch pinnacle',side*.42,-.99,1.29,.20,.10,'gold')
    if storm:
        # Steel lightning rod over the shard and a tilted arc ring: reads as electric, not flame, at small size.
        rod('Storm / lightning rod',(0,0,3.5),(0,0,3.8),.05,'steel')
        sphere('Storm / rod tip',(0,0,3.82),(.08,.08,.08),HEART)
        ring=torus('Storm / arc ring',(0,0,2.45),.86,.025,HEART)
        ring.rotation_euler=(math.radians(68),0,math.radians(20))
    if ascended:
        # Lv.3 is taller than Lv.2 but must fit the shared battle crop (checked by build-tower-sprites.mjs).
        torus('Ascended / gold foundation ring',(0,0,.43),1.14,.045,'gold')
        for i,angle in enumerate([math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]):
            x,y=1.04*math.cos(angle),1.04*math.sin(angle)
            crystal(f'Ascended / buttress flame spire {i+1}',x,y,1.88,.78,.14,CRY)
        halo_tilt=(math.radians(42),0,math.radians(-28))
        halo_z=2.68
        # Tilt after parenting: torus() would parent from a stale, unrotated matrix_world.
        for name,thickness,material in (('gold',.05,'gold'),('ember',.02,HEART)):
            ring=torus(f'Ascended / {name} halo',(0,0,halo_z),1.12,thickness,material)
            ring.rotation_euler=halo_tilt
        rot=Euler(halo_tilt).to_matrix()
        for i in range(6):
            a=math.tau*i/6+.3
            p=rot@Vector((1.12*math.cos(a),1.12*math.sin(a),0))
            sphere(f'Ascended / halo ember bead {i+1}',(p.x,p.y,halo_z+p.z),(.085,.085,.085),HEART)


def oak_keep():
    base()
    cyl('Timber / shadow core',(0,0,.94),.94,1.14,'wood_dark',16)
    for i in range(12):
        angle=math.tau*i/12
        x,y=.88*math.cos(angle),.88*math.sin(angle)
        obj=cube(f'Timber / vertical oak stave {i+1}',(x,y,.95),(.44,.17,1.04),'wood_light' if i%3==0 else 'wood',.035)
        obj.rotation_euler.z=angle-math.pi/2
        # Narrow inset grooves remain geometry in glTF, unlike procedural texture nodes.
        for dz in [-.27,.16]:
            beam('Timber / short grain relief',(x*1.095,y*1.095,.95+dz),(x*1.095+.018,y*1.095,.95+dz+.15),.014,.012,'wood_dark',bevel=.003)
    for z in [.53,1.43]:
        cyl('Timber / brass retaining band',(0,0,z),1.03,.105,'brass',32)
        for i in range(12):
            a=math.tau*i/12
            rivet((1.04*math.cos(a),1.04*math.sin(a),z),size=.045)
    for x in [-.72,.72]:
        for y in [-.72,.72]:
            cube('Timber / square corner post',(x,y,1.04),(.22,.22,1.40),'wood_light',.03)
            cube('Hardware / corner iron shoe',(x,y,.48),(.28,.28,.19),'iron',.025)
            cube('Hardware / post capital',(x,y,1.68),(.29,.29,.18),'brass',.025)
            rivet((x,y-.16,1.67),size=.045)
    cyl('Deck / oak turntable',(0,0,1.65),1.0,.18,'wood_light',24)
    torus('Deck / turntable rim',(0,0,1.73),.98,.06,'gold')


def piercing_ballista(ascended=False):
    oak_keep()
    banner('teal','arrow')
    turret=group('turret',(0,0,1.82))
    turret['animation_hint']='Rotate local Z to aim; bolt translates along negative local Y.'
    cyl('Turret / brass bearing',(0,0,1.85),.50,.27,'brass',24,turret)
    cyl('Turret / dark collar',(0,0,1.99),.38,.12,'iron',24,turret)
    for x in [-.30,.30]:
        beam('Carriage / diagonal oak brace',(x,.42,1.92),(x,-.3,2.37),.18,.18,'wood',turret)
    cube('Carriage / long firing rail',(0,.03,2.34),(.40,2.24,.27),'wood_light',.035,turret)
    cube('Carriage / iron bolt guide',(0,-.05,2.46),(.12,2.12,.055),'iron',.012,turret)
    for side in [-1,1]:
        pts=[(side*.16,-.68,2.34),(side*.72,-.80,2.37),(side*1.30,-.47,2.43),(side*1.58,-.12,2.46)]
        for j in range(len(pts)-1):
            beam('Bow / laminated oak limb',pts[j],pts[j+1],.23,.27,'wood_light',turret,.04)
            beam('Bow / dark laminated backing',(pts[j][0],pts[j][1]+.075,pts[j][2]+.02),(pts[j+1][0],pts[j+1][1]+.075,pts[j+1][2]+.02),.080,.12,'iron',turret,.015)
        torus('Bow / tip binding',pts[-1],.125,.035,'iron',turret,rotation=(math.pi/2,0,0))
        rod('Bow / tensioned rope',pts[-1],(0,.80,2.45),.023,'rope',turret)
        cube('Bow / bronze mounting cuff',(side*.36,-.72,2.35),(.19,.34,.32),'brass',.04,turret)
        rivet((side*.36,-.91,2.35),'gold',.065,turret)
    # Large steel shoes and diagonal braces read at the in-game sprite scale.
    for side in [-1,1]:
        beam('Bow / broad outer steel shoe',(side*1.30,-.47,2.43),(side*1.58,-.12,2.46),.25,.30,'steel',turret,.035)
        beam('Carriage / iron diagonal strut',(side*.76,.20,1.73),(side*.30,-.45,2.28),.13,.13,'iron',turret,.025)
        cube('Carriage / gold strut anchor',(side*.76,.20,1.75),(.23,.26,.15),'brass',.025,turret)
    bolt=group('bolt',(0,0,2.5),turret)
    bolt['animation_hint']='Move along local negative Y for a short recoil/release preview.'
    rod('Bolt / heavy oak shaft',(0,.96,2.52),(0,-1.40,2.52),.055,'wood_dark',bolt)
    rod('Bolt / steel neck',(0,-1.2,2.52),(0,-1.53,2.52),.075,'steel',bolt)
    verts=[(0,-2.05,2.52),(-.23,-1.40,2.52),(0,-1.40,2.70),(.23,-1.40,2.52),(0,-1.40,2.34)]
    mesh('Bolt / broad forged spearhead',verts,[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(1,4,3,2)],'steel',bolt,.01)
    for side in [-1,1]:
        panel('Bolt / feather fletching',[(side*.02,2.52),(side*.21,2.68),(side*.18,2.50)],.78,.22,'teal',bolt,.005)
    rod('Winch / transverse axle',(-.56,.72,2.12),(.56,.72,2.12),.095,'iron',turret)
    for side in [-1,1]:
        torus('Winch / hand wheel',(side*.60,.72,2.12),.23,.045,'brass',turret,rotation=(0,math.pi/2,0))
        for a in [0,math.pi/2]:
            rod('Winch / wheel spoke',(side*.60,.72-.20*math.cos(a),2.12-.20*math.sin(a)),(side*.60,.72+.20*math.cos(a),2.12+.20*math.sin(a)),.03,'gold',turret)
        rod('Winch / crank handle',(side*.60,.72,2.35),(side*.77,.72,2.35),.045,'wood',turret)
    if ascended:
        # Lv.3: gold foundation, hunter pennants on the rear posts, gilded bow tips and a fanned three-bolt volley.
        torus('Ascended / gold foundation ring',(0,0,.43),1.14,.045,'gold')
        for x in [-.72,.72]:
            crystal(f'Ascended / front post gold finial {x:+.2f}',x,-.72,1.86,.46,.15,'gold')
            rod(f'Ascended / pennant pole {x:+.2f}',(x,.72,1.86),(x,.72,2.78),.03,'brass')
            crystal(f'Ascended / pennant pole finial {x:+.2f}',x,.72,2.76,.22,.08,'gold')
            panel(f'Ascended / teal pennant {x:+.2f}',[(x,2.68),(x+math.copysign(.62,x),2.50),(x,2.30)],.72,.03,'teal',bevel=.006)
            panel(f'Ascended / pennant gold edge {x:+.2f}',[(x,2.70),(x+math.copysign(.66,x),2.50),(x,2.66)],.70,.02,'gold',bevel=.005)
        for side in [-1,1]:
            tip=(side*1.58,-.12,2.46)
            sphere('Ascended / gilded bow tip cap',tip,(.19,.19,.19),'gold',turret)
            beam('Ascended / gold limb band',(side*.98,-.66,2.38),(side*1.02,-.62,2.40),.30,.34,'gold',turret,.03)
            shaft_x=side*.34
            rod('Ascended / side bolt shaft',(shaft_x,.70,2.68),(shaft_x,-1.20,2.68),.045,'wood_dark',bolt)
            rod('Ascended / side bolt neck',(shaft_x,-1.0,2.68),(shaft_x,-1.30,2.68),.062,'steel',bolt)
            verts=[(shaft_x,-1.78,2.68),(shaft_x-.18,-1.25,2.68),(shaft_x,-1.25,2.84),(shaft_x+.18,-1.25,2.68),(shaft_x,-1.25,2.52)]
            mesh('Ascended / side bolt spearhead',verts,[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(1,4,3,2)],'steel',bolt,.01)


def hollow_barrel(name, start, end, outer, inner, material, parent):
    a,b=Vector(start),Vector(end)
    axis=(b-a).normalized()
    u=axis.cross(Vector((1,0,0))).normalized()
    v=axis.cross(u).normalized()
    count=32
    verts=[]
    for center,radius in [(a,outer*.9),(b,outer),(b,inner),(b-axis*.35,inner)]:
        verts += [tuple(center+(u*math.cos(math.tau*i/count)+v*math.sin(math.tau*i/count))*radius) for i in range(count)]
    faces=[]
    for ring in range(3):
        faces += [(ring*count+i,ring*count+(i+1)%count,(ring+1)*count+(i+1)%count,(ring+1)*count+i) for i in range(count)]
    faces.append(tuple(range(3*count,4*count)))
    return mesh(name,verts,faces,material,parent,.018)


def water_cannon(ascended=False):
    oak_keep()
    banner('blue','water')
    # A pressurized reservoir is fixed to the carriage behind the rotating barrel.
    cyl('Reservoir / bronze tank plinth',(0,.37,1.86),.63,.24,'brass',24)
    sphere('Reservoir / glass pressure tank',(0,.37,2.29),(.65,.65,.77),'glass')
    sphere('Reservoir / visible blue water',(0,.37,2.23),(.56,.56,.59),'water')
    for z,r in [(1.88,.50),(2.80,.43)]:
        torus('Reservoir / reinforcing hoop',(0,.37,z),r,.065,'gold')
    for side in [-1,1]:
        tube('Reservoir / curved bronze strap',[(side*.40,.37,1.88),(side*.62,.37,2.16),(side*.62,.37,2.48),(side*.35,.37,2.85)],.055,'brass')
    cyl('Reservoir / pressure cap',(0,.37,3.04),.24,.15,'brass',24)
    sphere('Reservoir / cap crown',(0,.37,3.14),(.18,.18,.09),'gold')
    for x,y,z in [(-.21,-.12,2.3),(.25,-.09,2.42),(.04,-.19,2.15),(-.08,-.14,2.58)]:
        sphere('Reservoir / floating air bubble',(x,y,z),(.045,.045,.045),'bubble')
    tube('Plumbing / main supply elbow',[(.48,.38,2.0),(.83,.38,2.0),(.92,.15,1.96),(.92,-.48,1.96),(.49,-.65,2.10)],.095,'brass')
    tube('Plumbing / return loop',[(-.48,.39,2.04),(-.87,.39,1.96),(-.88,-.46,1.84),(-.56,-.61,1.84)],.065,'brass')
    # Forward-facing valve wheel and bolts distinguish the pump from an ordinary cannon.
    rod('Valve / spindle',(-.79,-.48,1.97),(-.79,-.72,1.97),.065,'iron')
    torus('Valve / operating wheel',(-.79,-.76,1.97),.24,.042,'gold',rotation=(math.pi/2,0,0))
    for a in [0,math.pi/3,math.pi*2/3]:
        rod('Valve / wheel spoke',(-.79-.21*math.cos(a),-.76,1.97-.21*math.sin(a)),(-.79+.21*math.cos(a),-.76,1.97+.21*math.sin(a)),.025,'brass')
    # Front-right pressure gauge and water sight tube make the hydraulic mechanism legible.
    rod('Gauge / bronze stem',(.76,-.12,2.08),(.88,-.30,2.43),.06,'brass')
    gauge=cyl('Gauge / bronze housing',(.91,-.40,2.49),.27,.12,'brass',24)
    gauge.rotation_euler.x=math.pi/2
    dial=cyl('Gauge / ivory pressure face',(.91,-.473,2.49),.225,.025,'ivory',24,bevel=.005)
    dial.rotation_euler.x=math.pi/2
    for a in [-math.pi*.15,math.pi*.20,math.pi*.55,math.pi*.90,math.pi*1.15]:
        beam('Gauge / bold dial mark',(.91+.16*math.cos(a),-.492,2.49+.16*math.sin(a)),(.91+.20*math.cos(a),-.492,2.49+.20*math.sin(a)),.027,.018,'iron',bevel=.003)
    beam('Gauge / red needle',(.86,-.513,2.45),(1.04,-.513,2.62),.032,.022,'red',bevel=.004)
    sphere('Gauge / needle hub',(.91,-.523,2.49),(.047,.025,.047),'gold')
    cyl('Plumbing / side water sight tube',(.83,.16,1.44),.105,.54,'water',16)
    for z in [1.15,1.73]:
        cyl('Plumbing / sight tube collar',(.83,.16,z),.145,.10,'brass',16)
    turret=group('turret',(0,-.38,1.93))
    turret['animation_hint']='Rotate local Z slightly to aim; barrel moves along its local forward axis for recoil.'
    for x in [-.46,.46]:
        cube('Carriage / bronze trunnion support',(x,-.42,1.91),(.18,.38,.40),'brass',.04,turret)
        rod('Carriage / steel pivot',(x-.09,-.45,2.06),(x+.09,-.45,2.06),.16,'iron',turret)
    barrel=group('barrel',(0,-.43,2.08),turret)
    a=Vector((0,-.22,2.02)); b=Vector((0,-1.48,2.42)); direction=(b-a).normalized()
    hollow_barrel('Barrel / turquoise enamel cannon',a,b,.31,.205,'enamel',barrel)
    for t in [0.12,.54,1.0]:
        center=a+(b-a)*t
        ring=torus('Barrel / broad bronze collar',center,.31 if t<1 else .33,.065,'brass',barrel)
        ring.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
        for i in range(6):
            # Rivets sit on the collars' upper and side arcs.
            angle=math.tau*i/6
            right=Vector((1,0,0)); up=direction.cross(right)
            point=center+(right*math.cos(angle)+up*math.sin(angle))*.34
            rivet(point,'gold',.037,barrel)
    # A recessed blue plug gives the hollow muzzle depth without a black painted disk.
    plug=cyl('Barrel / water chamber deep inside',b-direction*.30,.195,.04,'water',24,barrel,.0)
    plug.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    rod('Sight / brass front pin',tuple(b+Vector((0,.05,.30))),tuple(b+Vector((0,.05,.45))),.035,'gold',barrel)
    if ascended:
        # Lv.3: gold foundation, tidal crown over the tank, orbiting water ring, river pennants and a gilded muzzle flare.
        torus('Ascended / gold foundation ring',(0,0,.43),1.14,.045,'gold')
        crystal('Ascended / tidal crown spire',0,.37,3.18,.46,.18,'water')
        for k,x in enumerate([-.30,.30]):
            crystal(f'Ascended / crown side spire {k}',x,.37,3.14,.30,.11,'bubble')
        orbit=(math.radians(68),0,math.radians(18)); center=Vector((0,.37,2.30))
        torus('Ascended / orbiting water ring',tuple(center),.98,.05,'gold',rotation=orbit)
        spin=Euler(orbit).to_matrix()
        for i,ang in enumerate([0.4,2.3,4.2]):
            p=center+spin@Vector((.98*math.cos(ang),.98*math.sin(ang),0))
            sphere(f'Ascended / orbiting water pearl {i}',tuple(p),(.12,.12,.12),'bubble')
        for x in [-.72,.72]:
            rod(f'Ascended / pennant pole {x:+.2f}',(x,.72,1.86),(x,.72,2.78),.03,'brass')
            crystal(f'Ascended / pennant pole finial {x:+.2f}',x,.72,2.76,.22,.08,'gold')
            panel(f'Ascended / river pennant {x:+.2f}',[(x,2.68),(x+math.copysign(.62,x),2.50),(x,2.30)],.72,.03,'blue',bevel=.006)
            panel(f'Ascended / pennant gold edge {x:+.2f}',[(x,2.70),(x+math.copysign(.66,x),2.50),(x,2.66)],.70,.02,'gold',bevel=.005)
        flare=torus('Ascended / gilded muzzle flare',tuple(b+direction*.06),.40,.07,'gold',barrel)
        flare.rotation_euler=direction.to_track_quat('Z','Y').to_euler()


def configure_scene():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=max(8,opts.samples)
    # This packaged Blender has CPU Cycles but no OpenImageDenoise support.
    scene.cycles.use_denoising=False
    scene.cycles.use_adaptive_sampling=True
    scene.cycles.adaptive_threshold=.012
    scene.render.resolution_x=opts.size
    scene.render.resolution_y=opts.size
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.render.film_transparent=True
    scene.render.threads_mode='FIXED'
    scene.render.threads=8
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.24,.30,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.24
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=-0.4
    scene.render.image_settings.color_depth='8'
    scene.unit_settings.system='METRIC'
    return scene


def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def light(name, location, energy, size, color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
    obj=bpy.data.objects.new(name,data)
    CURRENT.objects.link(obj); obj.location=location; aim(obj,(0,0,2.2))
    return obj


def export_runtime_glb(collection, root, filepath):
    """Batch static geometry per animation parent/material; preserve editable source."""
    source_objects=list(collection.objects)
    original_names={obj:obj.name for obj in source_objects}
    original_matrices={obj:obj.matrix_world.copy() for obj in source_objects}
    export_collection=new_collection('Runtime export temporary')
    clones={}
    evaluated_meshes=[]
    try:
        # Reserve exact animation names for the export, not Blender's .001 suffixes.
        for obj in source_objects:
            obj.name=original_names[obj]+'__editable_source'
        graph=bpy.context.evaluated_depsgraph_get()
        for obj in source_objects:
            if obj.type=='MESH':
                data=bpy.data.meshes.new_from_object(obj.evaluated_get(graph),depsgraph=graph)
                evaluated_meshes.append(data)
                clone=bpy.data.objects.new(original_names[obj],data)
            else:
                clone=obj.copy()
                clone.name=original_names[obj]
            export_collection.objects.link(clone)
            clones[obj]=clone
        for obj,clone in clones.items():
            clone.parent=clones.get(obj.parent)
            clone.matrix_world=original_matrices[obj]
        bpy.context.view_layer.update()
        batches={}
        for clone in clones.values():
            if clone.type=='MESH':
                key=(clone.parent.name if clone.parent else '',tuple(m.name for m in clone.data.materials))
                batches.setdefault(key,[]).append(clone)
        for index,objects in enumerate(batches.values()):
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:
                bpy.ops.object.join()
            objects[0].name=f'Runtime surface {index+1:02}'
        meshes=[obj for obj in export_collection.objects if obj.type=='MESH']
        triangles=0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            triangles+=len(obj.data.loop_triangles)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in export_collection.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=clones[root]
        bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,
            export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=False,export_extras=True)
        return {'runtime_mesh_objects':len(meshes),'runtime_triangles':triangles,
                'runtime_materials':len({m.name for obj in meshes for m in obj.data.materials})}
    finally:
        for obj in list(export_collection.objects):
            bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.collections.remove(export_collection)
        for data in evaluated_meshes:
            # Joined objects release their intermediate mesh datablocks.
            if data.name in bpy.data.meshes and data.users==0:
                bpy.data.meshes.remove(data)
        for obj,name in original_names.items():
            obj.name=name


models=[]
for index,(name,build) in enumerate(zip(NAMES,(fire_tower,piercing_ballista,water_cannon))):
    CURRENT=new_collection(name)
    MODEL_ROOT=None
    MODEL_ROOT=group(name)
    MODEL_ROOT['asset']='Arcana Defense editable tower'
    MODEL_ROOT['authoring']='Generated by tools/blender/build_towers.py; real mesh geometry and PBR materials.'
    build()
    MODEL_ROOT.scale=(1.6,1.6,1.6)
    MODEL_ROOT.location=((index-1)*7.0,0,0)
    models.append((name,CURRENT,MODEL_ROOT))

# Render-only Lv.3 variants, built after the exported models so they are unaffected.
VARIANTS=(('lightning-tower','fire-tower',lambda ascended=False:fire_tower(ascended,True),(-14.0,10.0,0)),('lightning-tower-lv3','fire-tower',lambda ascended=True:fire_tower(ascended,True),(-14.0,20.0,0)),('fire-tower-lv3','fire-tower',fire_tower,(-7.0,10.0,0)),('piercing-ballista-lv3','piercing-ballista',piercing_ballista,(0.0,10.0,0)),('water-cannon-lv3','water-cannon',water_cannon,(7.0,10.0,0)))
variants=[]
for vname,base_name,build,home in VARIANTS:
    CURRENT=new_collection(vname)
    MODEL_ROOT=None
    MODEL_ROOT=group(vname)
    MODEL_ROOT['asset']='Arcana Defense branch/upgrade render variant (sprite only, no GLB)'
    ascended = vname.endswith('-lv3')
    builder_name = 'fire_tower(storm=True)' if vname.startswith('lightning-') else build.__name__
    MODEL_ROOT['authoring']=f'Generated by tools/blender/build_towers.py; {builder_name}, ascended={ascended}.'
    build(vname.endswith('-lv3'))
    MODEL_ROOT.scale=(1.6,1.6,1.6)
    MODEL_ROOT.location=home
    CURRENT.hide_render=True
    variants.append((vname,base_name,CURRENT,MODEL_ROOT,home))

CURRENT=new_collection('Studio / camera and soft lights')
MODEL_ROOT=None
scene=configure_scene()
camera_data=bpy.data.cameras.new('Sprite orthographic camera')
camera=bpy.data.objects.new('Sprite orthographic camera',camera_data)
CURRENT.objects.link(camera)
camera_data.type='ORTHO'; camera_data.ortho_scale=7.5
camera.location=(9,-12,12); aim(camera,(0,0,2.35)); scene.camera=camera
light('Studio / warm key',(-5,-7,10),1100,5.0,(1.0,.84,.64))
light('Studio / cool fill',(6,-3,7),650,4.5,(.66,.82,1.0))
light('Studio / upper rim',(1,6,10),1200,3.5,(1.0,.94,.80))

# Verify the exporter is available in this Blender build before starting any render.
if not hasattr(bpy.ops.export_scene, 'gltf'):
    raise RuntimeError('Blender glTF exporter unavailable: install/enable io_scene_gltf2.')
manifest={'blender':bpy.app.version_string,'source':'art-source/defense/towers.blend','coordinate_system':'Authoring Z-up; GLB exported with Y-up; local origin at ground center.','export_batching':'Static meshes merged by animation parent and material set. Editable Blender objects remain separate.','models':[]}
manifest['sprite_variants']=[]
if opts.only and (OUT/'manifest.json').exists():
    previous=json.loads((OUT/'manifest.json').read_text())
    manifest['models']=[model for model in previous.get('models',[]) if model.get('id')!=opts.only]
    manifest['sprite_variants']=[v for v in previous.get('sprite_variants',[]) if v.get('id')!=opts.only]
for name,collection,root in models:
    if opts.only and opts.only != name:
        continue
    original=root.location.copy()
    root.location=(0,0,0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    # Canonical animation node names stay identical across individual GLBs.
    # Blender requires global object-name uniqueness in the editable lineup.
    renamed=[]
    for obj in collection.objects:
        role=obj.get('animation_role')
        if role:
            conflict=bpy.data.objects.get(role)
            if conflict and conflict!=obj:
                renamed.append((conflict,conflict.name))
                conflict.name=role+'__other_editable_asset'
            renamed.append((obj,obj.name))
            obj.name=role
    exported_nodes=[obj.name for obj in collection.objects if obj.type=='EMPTY']
    glb=OUT/f'{name}.glb'
    runtime_stats=export_runtime_glb(collection,root,glb)
    for obj,original_name in reversed(renamed):
        obj.name=original_name
    if not glb.exists() or glb.stat().st_size<100:
        raise RuntimeError(f'glTF export failed: {glb}')
    for _name,col,_root in models:
        col.hide_render=col!=collection
    if not opts.skip_render:
        scene.render.filepath=str(OUT/f'{name}.png')
        bpy.ops.render.render(write_still=True)
    meshes=[obj for obj in collection.objects if obj.type=='MESH']
    manifest['models'].append({'id':name,'glb':f'/defense/models/{name}.glb','sprite':f'/defense/models/{name}.png','bytes':glb.stat().st_size,'mesh_objects':len(meshes),'vertices_before_modifiers':sum(len(obj.data.vertices) for obj in meshes),'editable_nodes':exported_nodes,**runtime_stats})
    root.location=original

for vname,base_name,collection,root,home in variants:
    if opts.only and opts.only!=vname:
        continue
    root.location=(0,0,0)
    bpy.context.view_layer.update()
    for _name,col,_root in models:
        col.hide_render=True
    for _v in variants:
        _v[2].hide_render=True
    collection.hide_render=False
    if not opts.skip_render:
        scene.render.filepath=str(OUT/f'{vname}.png')
        bpy.ops.render.render(write_still=True)
    variant_meshes=[obj for obj in collection.objects if obj.type=='MESH']
    manifest['sprite_variants'].append({'id':vname,'base':base_name,'sprite':f'/defense/models/{vname}.png','render_only':True,
        'mesh_objects':len(variant_meshes),'vertices_before_modifiers':sum(len(obj.data.vertices) for obj in variant_meshes)})
    root.location=home

for _name,col,_root in models:
    col.hide_render=False
for _v in variants:
    _v[2].hide_render=True
# Leave the source scene framed as an editable three-model lineup.
camera_data.ortho_scale=20
camera.location=(13,-23,18); aim(camera,(0,0,2.3))
scene.render.resolution_x=1600; scene.render.resolution_y=800
scene.render.filepath=str(SOURCE/'tower-lineup.png')
scene['regeneration_command']='blender -b --python tools/blender/build_towers.py'
scene['sprite_camera']=f'Individual sprites: camera=(9,-12,12), target=(0,0,2.35), orthographic scale=7.5, {opts.size}px, transparent, CPU Cycles {opts.samples}, AgX exposure -0.4.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'towers.blend'))
manifest['models'].sort(key=lambda model:NAMES.index(model['id']))
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('ARCANA_MODELS_COMPLETE '+json.dumps(manifest,ensure_ascii=False))
