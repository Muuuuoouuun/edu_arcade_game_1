"""Isolated Arcana polar bear prototype; no production files are read or written.

blender -b --python tools/blender/build_polar_bear.py -- --samples 64
All meshes are original geometry. The concept image is a visual reference only.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art-source/defense/prototypes/polar-bear'
parser = argparse.ArgumentParser()
parser.add_argument('--samples', type=int, default=64)
parser.add_argument('--skip-render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
if args.samples < 1:
    parser.error('--samples must be positive')
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
parts = bpy.data.collections.new('Polar bear / editable geometry')
scene.collection.children.link(parts)
studio = bpy.data.collections.new('Studio / fixed camera and lighting')
scene.collection.children.link(studio)


def material(name, color, metallic=0, roughness=.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


M = {
    'fur': material('01 Warm white fur', (.86, .83, .73)),
    'ivory': material('02 Ivory enamel armor', (.68, .73, .74), .5, .34),
    'navy': material('03 Navy cloth and joints', (.025, .055, .13)),
    'steel': material('04 Blue steel edges', (.12, .20, .29), .65, .35),
    'gold': material('05 Muted brass trim', (.59, .34, .10), .65, .35),
    'ice': material('06 Team blue ice', (.035, .30, .67), .18, .3),
    'lightice': material('07 Pale ice facets', (.20, .62, .85), .18, .3),
    'dark': material('08 Nose eyes leather', (.025, .025, .038)),
    'muzzle': material('09 Muzzle and inner ear', (.64, .60, .52)),
}


def attach(obj, name, mat=None, parent=None, bevel=0, smooth=False):
    obj.name = name
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    parts.objects.link(obj)
    if mat:
        obj.data.materials.append(M[mat])
    bpy.context.view_layer.update()
    if parent:
        matrix = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = matrix
    if bevel:
        mod = obj.modifiers.new('Soft chunky corners', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def joint(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    parts.objects.link(obj)
    obj.location = location
    obj.empty_display_size = .15
    bpy.context.view_layer.update()
    if parent:
        matrix = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = matrix
    bpy.context.view_layer.update()
    return obj


def ball(name, loc, scale, mat, parent, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, name, mat, parent, smooth=smooth)


def box(name, loc, scale, mat, parent, bevel=.045):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(obj, name, mat, parent, bevel=bevel)


def rod(name, a, b, radius, mat, parent, vertices=10):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b-a).length, location=(a+b)/2)
    obj = attach(bpy.context.object, name, mat, parent, bevel=.015)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def panel(name, points, y, thickness, mat, parent):
    n = len(points)
    verts = [(x, y-thickness/2, z) for x, z in points] + [(x, y+thickness/2, z) for x, z in points]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, n*2))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    parts.objects.link(obj)
    return attach(obj, name, mat, parent, bevel=.025)


root = joint('polar-bear-guardian', (0, 0, 0))
body = joint('body', (0, 0, 1.25), root)
head = joint('head', (0, .02, 2.72), body)
arm = joint('hammer-arm', (-.87, .02, 2.22), body)
forearm = joint('hammer-forearm', (-1.05, .35, 1.88), arm)
hammer = joint('hammer', (-1.15, .65, 1.73), forearm)
guard = joint('guard-arm', (.86, .02, 2.2), body)
root['forward'] = 'Authoring +Y; glTF Y-up conversion maps +Y to -Z'
root['scope'] = 'Prototype only; articulated rigid objects, no skinning'

# Squat grounded legs. Bottom of each sole is exactly Z=0.
for side, x in [('left', -.43), ('right', .43)]:
    ball(side+' navy leg', (x, -.02, .68), (.32, .32, .49), 'navy', root)
    box(side+' dark sole', (x, .16, .10), (.64, .85, .20), 'dark', root, .07)
    box(side+' ivory boot', (x, .17, .29), (.61, .79, .30), 'ivory', root, .09)
    ball(side+' ankle fur cuff', (x, .02, .51), (.35, .33, .18), 'fur', root)
    box(side+' blue greave', (x, .30, .69), (.39, .13, .30), 'steel', root)
    box(side+' boot brass band', (x, .49, .31), (.51, .045, .075), 'gold', root, .015)

ball('Large navy torso', (0, 0, 1.72), (.72, .46, .77), 'navy', body)
ball('Rounded ivory breastplate', (0, .09, 2.0), (.69, .46, .49), 'ivory', body)
box('Broad navy waist', (0, .015, 1.17), (1.34, .83, .23), 'navy', body, .08)
box('Belt clasp', (0, .47, 1.20), (.27, .10, .23), 'gold', body)
for x in (-.37, .37):
    panel('Navy coat skirt', [(x-.28, 1.17), (x+.25, 1.17), (x+.23, .78), (x-.25, .83)], .30, .18, 'navy', body)
    rod('Coat ivory hem', (x-.24, .40, .84), (x+.22, .40, .80), .075, 'fur', body)
panel('Blue chest heraldry', [(-.21, 2.26), (.21, 2.26), (.18, 1.92), (0, 1.79), (-.18, 1.92)], .54, .06, 'ice', body)
rod('Chest pale central mark', (0, .585, 1.94), (0, .585, 2.17), .037, 'lightice', body, 6)
# Five large fur masses establish a collar without hair microgeometry.
for i, (x, y, z, size) in enumerate([(-.62, 0, 2.43, .35), (.62, 0, 2.43, .35), (-.35, -.18, 2.57, .30), (.35, -.18, 2.57, .30), (0, -.23, 2.58, .31)]):
    ball('Collar fur mass '+str(i), (x, y, z), (size, .29, .26), 'fur', body, False)
ball('Navy neck scarf', (0, .09, 2.60), (.47, .37, .17), 'navy', body)

# Bare round ears and projecting muzzle make a bear at small scale.
ball('Bear round head', (0, .13, 2.99), (.46, .37, .46), 'fur', head)
for s in (-1, 1):
    ball('Round bear ear', (s*.36, .09, 3.30), (.16, .12, .18), 'fur', head)
    ball('Ear inner bowl', (s*.36, .194, 3.31), (.095, .025, .10), 'muzzle', head)
    ball('Bear cheek', (s*.21, .40, 2.91), (.20, .16, .18), 'fur', head)
    ball('Eye socket', (s*.19, .445, 3.09), (.09, .035, .065), 'muzzle', head)
    ball('Eye black', (s*.19, .476, 3.09), (.044, .025, .047), 'dark', head)
    ball('Eye glint', (s*.18, .498, 3.107), (.012, .007, .013), 'fur', head)
ball('Broad rounded muzzle', (0, .51, 2.96), (.26, .23, .19), 'fur', head)
ball('Dark bear nose', (0, .715, 3.025), (.125, .075, .085), 'dark', head)
rod('Short mouth seam', (-.12, .665, 2.875), (.12, .665, 2.875), .016, 'muzzle', head, 8)

for x, parent in [(-.84, arm), (.84, guard)]:
    ball('Navy shoulder joint', (x, .02, 2.21), (.31, .31, .31), 'navy', parent)
    box('Ivory broad pauldron', (x, -.01, 2.32), (.67, .64, .27), 'ivory', parent, .10)
    box('Pauldron blue team bar', (x, .33, 2.32), (.47, .07, .13), 'ice', parent, .025)
rod('Hammer upper arm', (-.87, .02, 2.22), (-1.05, .35, 1.88), .235, 'navy', arm)
rod('Hammer ivory forearm', (-1.05, .35, 1.88), (-1.15, .61, 1.74), .24, 'ivory', forearm)
ball('Hammer hand palm', (-1.15, .65, 1.73), (.22, .20, .20), 'dark', hammer)
# Handle passes through palm; front finger bars wrap across the shaft, thumb lies on its side.
rod('Short hammer handle', (-1.15, .65, 1.34), (-1.15, .65, 2.48), .072, 'dark', hammer)
for z in (1.62, 1.72, 1.82):
    box('Closed glove finger', (-1.15, .82, z), (.30, .105, .085), 'navy', hammer, .025)
ball('Opposing thumb', (-.98, .72, 1.76), (.085, .105, .14), 'dark', hammer)
rod('Handle lower brass cap', (-1.15, .65, 1.32), (-1.15, .65, 1.43), .105, 'gold', hammer)
rod('Hammer head socket', (-1.15, .65, 2.20), (-1.15, .65, 2.47), .115, 'gold', hammer)
# Concave anchor profile: broad crossbar with two upturned flukes.
hx, hz = -1.15, 2.48
profile = [(-.62,-.19),(-.65,.08),(-.50,.34),(-.36,.09),(.36,.09),(.50,.34),(.65,.08),(.62,-.19),(.27,-.24),(-.27,-.24)]
panel('Large anchor hammer head', [(hx+x, hz+z) for x,z in profile], .65, .45, 'steel', hammer)
for s in (-1, 1):
    panel('Ivory hammer striking cap', [(hx+s*x, hz+z) for x,z in [(.42,-.17),(.60,-.13),(.61,.07),(.50,.28),(.41,.08)]], .65, .49, 'ivory', hammer)
ball('Hammer round brass boss', (hx, .91, hz-.035), (.15, .06, .15), 'gold', hammer, False)

# Shield back carries a real grip and two attachment bars; front has broad ice wedges.
rod('Shield upper arm', (.86, .02, 2.2), (1.0, .28, 1.78), .23, 'navy', guard)
rod('Shield bracer', (1.0, .28, 1.78), (1.04, .50, 1.68), .24, 'ivory', guard)
ball('Shield closed hand', (1.04, .52, 1.68), (.20, .18, .19), 'dark', guard)
rod('Shield rear grip', (.84, .55, 1.68), (1.24, .55, 1.68), .065, 'gold', guard)
for x in (.84, 1.24):
    rod('Grip mounting bracket', (x, .55, 1.68), (x, .73, 1.68), .06, 'steel', guard)
sx, sy, sz, radius = 1.03, .79, 1.67, .83
rod('Circular shield steel rim', (sx, sy-.12, sz), (sx, sy+.10, sz), radius, 'steel', guard, 20)
rod('Circular ice shield face', (sx, sy+.10, sz), (sx, sy+.135, sz), radius*.86, 'ice', guard, 20)
for i in range(10):
    a, b = i*math.tau/10, (i+1)*math.tau/10
    points = [(sx, sz), (sx+math.sin(a)*.69, sz+math.cos(a)*.69), (sx+math.sin(b)*.69, sz+math.cos(b)*.69)]
    panel('Broad shield ice facet '+str(i), points, sy+.151, .012, 'lightice' if i%3==0 else 'ice', guard)
for i in range(4):
    a = i*math.pi/2
    obj = box('Ivory shield rim clasp', (sx+math.sin(a)*.77, sy+.12, sz+math.cos(a)*.77), (.25, .16, .17), 'ivory', guard, .035)
    obj.rotation_euler.y = a
ball('Shield brass boss', (sx, sy+.21, sz), (.19, .09, .19), 'gold', guard, False)

# Wrist X counter-rotates the shoulder at impact so the broad anchor face stays
# visible. Y then sweeps the hammer outward/down, with the grip kept in the palm.
# YXZ applies local Y before X, allowing the parent's X rotation to cancel.
hammer.rotation_mode = 'YXZ'
POSES = {
    'idle': (1, 0, 0, 0, 0, 0),
    'windup': (7, 1.20, -.06, .10, -.35, -.15),
    'strike': (11, -1.05, .10, -.06, .95, -1.90),
    'recover': (17, -.40, .025, -.02, .375, -.85),
}
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 25
keys = [*POSES.values(), (13, *POSES['strike'][1:]), (25, 0, 0, 0, 0, 0)]
for frame, angle, lean, cover, wrist_x, wrist_y in keys:
    arm.rotation_euler.x = angle
    body.rotation_euler.x = lean
    guard.rotation_euler.x = cover
    head.rotation_euler.x = -lean*.5
    hammer.rotation_euler = (wrist_x, wrist_y, 0)
    for obj in (arm, body, guard, head, hammer):
        obj.keyframe_insert(data_path='rotation_euler', frame=frame)
for obj in (arm, body, guard, head, hammer):
    obj.animation_data.action.name = 'Polar bear attack / '+obj.name
    for curve in obj.animation_data.action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = 'LINEAR'
scene.frame_set(1)

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = args.samples
scene.cycles.use_denoising = False  # Distribution build has no OpenImageDenoise.
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
world = bpy.data.worlds.new('Soft neutral world')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.32, .39, .48, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .4
cam_data = bpy.data.cameras.new('Fixed orthographic camera')
camera = bpy.data.objects.new(cam_data.name, cam_data)
studio.objects.link(camera)
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 5.45
camera.location = (7, 10, 7)
camera.rotation_euler = (Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera = camera
bpy.context.view_layer.update()
ground = world_to_camera_view(scene,camera,Vector((0,0,0)))
cam_data.shift_y += ground.y-(1-550/640)
for name, loc, power, color in [('Warm key',(-4,6,8),900,(1,.90,.76)),('Cool fill',(5,3,5),650,(.65,.82,1)),('Rim',(1,-5,7),1000,(.75,.86,1))]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.size = power, 4
    data.color = color
    obj = bpy.data.objects.new(name, data)
    studio.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0,0,1.8))-obj.location).to_track_quat('-Z','Y').to_euler()


def export_runtime():
    """Evaluated copies batched by rigid joint/material; editable originals survive."""
    scene.frame_set(1)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    originals = list(parts.objects)
    matrices = {o: o.matrix_world.copy() for o in originals}
    names = {o: o.name for o in originals}
    temp = bpy.data.collections.new('Temporary export')
    scene.collection.children.link(temp)
    clones = {}
    for o in originals:
        o.name = names[o]+'__editable'
    try:
        for o in originals:
            if o.type == 'MESH':
                clone = bpy.data.objects.new(names[o], bpy.data.meshes.new_from_object(o.evaluated_get(graph), depsgraph=graph))
            else:
                clone = o.copy()
                clone.name = names[o]
            temp.objects.link(clone)
            clones[o] = clone
        for o, clone in clones.items():
            clone.parent = clones.get(o.parent)
            clone.matrix_world = matrices[o]
        bpy.context.view_layer.update()
        batches = {}
        for clone in clones.values():
            if clone.type == 'MESH':
                batches.setdefault((clone.parent.name, tuple(m.name for m in clone.data.materials)), []).append(clone)
        for i, objects in enumerate(batches.values()):
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            if len(objects)>1:
                bpy.ops.object.join()
            objects[0].name = 'Polar bear surface %02d' % i
        meshes = [o for o in temp.objects if o.type=='MESH']
        triangles = 0
        for o in meshes:
            o.data.calc_loop_triangles()
            triangles += len(o.data.loop_triangles)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in temp.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = clones[root]
        bpy.ops.export_scene.gltf(filepath=str(OUT/'polar-bear.glb'), export_format='GLB', use_selection=True, export_yup=True, export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_nla_strips_merged_animation_name='polar-bear-attack', export_frame_range=True, export_anim_slide_to_zero=True, export_force_sampling=True, export_extras=True)
        return {'mesh_objects':len(meshes), 'triangles':triangles, 'materials':len({m.name for o in meshes for m in o.data.materials})}
    finally:
        for obj in list(temp.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(temp)
        for obj, name in names.items():
            obj.name = name


runtime = export_runtime()
bpy.context.view_layer.update()
ground = world_to_camera_view(scene,camera,Vector((0,0,0)))
front = world_to_camera_view(scene,camera,Vector((0,1,0)))
metadata = {
    'id':'polar-bear-guardian-prototype', 'blender':bpy.app.version_string,
    'reference':'art-source/defense/concepts/2026-11-09/polar-bear-guardian.png',
    'generator':'tools/blender/build_polar_bear.py',
    'reproduction':f'blender -b --python tools/blender/build_polar_bear.py -- --samples {args.samples}',
    'scope':'Isolated original geometry prototype; no production integration',
    'runtime':runtime, 'glb_bytes':(OUT/'polar-bear.glb').stat().st_size,
    'editable_mesh_objects':sum(o.type=='MESH' for o in parts.objects),
    'rig':'Rigid object hierarchy, not a skinned armature',
    'joints':[root.name, body.name, head.name, arm.name, forearm.name, hammer.name, guard.name],
    'coordinates':{'authoring_forward':'+Y','authoring_up':'+Z','glb_forward':'-Z','glb_up':'+Y','ground_z':0},
    'frame':{'width':640,'height':640,'ground':[round(ground.x*640,4),round((1-ground.y)*640,4)],'camera_location':list(camera.location),'camera_rotation_radians':list(camera.rotation_euler),'orthographic_scale':cam_data.ortho_scale,'shift_y':cam_data.shift_y,'forward_screen_dx':round((front.x-ground.x)*640,4)},
    'render':{'engine':'Cycles CPU','samples':args.samples,'transparent':True,'denoising':False,'render_skipped':args.skip_render},
    'animation':{'clip':'polar-bear-attack','fps':30,'first_frame':1,'last_frame':25,'duration_seconds':.8,'interpolation':'LINEAR','animated_nodes':[o.name for o in (arm,body,guard,head,hammer)],'impact_hold_frames':[11,13],'wrist_rotation_order':'YXZ','pose_parameters':{name:dict(zip(['frame','arm_x','body_x','guard_x','wrist_x','wrist_y'],values)) for name,values in POSES.items()}},
    'poses':[],
    'limitations':['Prototype rigid joints; no skin weights or deforming fur.','Four pose previews, not a final animation timing pass.','No measured game FPS or device draw-call benchmark.','No production loader/facing integration has been performed.']}
for name, values in POSES.items():
    scene.frame_set(values[0])
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    pixels, heights = [], []
    for obj in parts.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(graph)
        for vertex in evaluated.data.vertices:
            world = evaluated.matrix_world @ vertex.co
            heights.append(world.z)
            projected = world_to_camera_view(scene,camera,world)
            pixels.append((projected.x*640,(1-projected.y)*640))
    bounds = [min(p[0] for p in pixels),min(p[1] for p in pixels),max(p[0] for p in pixels),max(p[1] for p in pixels)]
    metadata['poses'].append({'name':name,'frame':values[0],'file':'polar-bear-'+name+'.png','projected_vertex_bbox':[round(v,3) for v in bounds],'min_world_z':round(min(heights),6),'inside_frame':all(0<=v<=640 for v in bounds)})
    if not args.skip_render:
        scene.render.filepath = str(OUT/('polar-bear-'+name+'.png'))
        bpy.ops.render.render(write_still=True)
scene.frame_set(1)
bpy.context.view_layer.update()
scene['regeneration_command'] = metadata['reproduction']
scene['ground_anchor'] = '640x640 PNG; origin at pixel 320,550 in every pose'
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'polar-bear.blend'))
(OUT/'polar-bear-model.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('POLAR_BEAR_COMPLETE '+json.dumps(metadata))
