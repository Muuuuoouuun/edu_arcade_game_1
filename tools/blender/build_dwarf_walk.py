"""Derive an editable eight-pose walk from dwarf.blend without overwriting it.

Run: blender -b --python tools/blender/build_dwarf_walk.py -- --samples 64
The original fixed camera, materials and attack asset are preserved.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/defense/dwarf.blend'
OUT = ROOT / 'public/defense/models'
parser = argparse.ArgumentParser()
parser.add_argument('--samples', type=int, default=64)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()
for obj in scene.objects:
    obj.animation_data_clear()
root = bpy.data.objects['dwarf-guardian']
body = bpy.data.objects['body']
arm = bpy.data.objects['hammer-arm']
guard = bpy.data.objects['guard-arm']
base_body = body.location.copy()
legs = []
for side, x in [('right', -.43), ('left', .43)]:
    pivot = bpy.data.objects.new(f'walk-{side}-leg', None)
    root.users_collection[0].objects.link(pivot)
    pivot.parent = root
    pivot.location = (x, 0, 1.05)
    bpy.context.view_layer.update()
    # Preserve the exact rest pose while adding articulated lower-body groups.
    for obj in list(scene.objects):
        if obj.type == 'MESH' and obj.name.startswith(f'{side} '):
            matrix = obj.matrix_world.copy()
            obj.parent = pivot
            obj.matrix_world = matrix
    legs.append((pivot, pivot.location.copy()))

scene.frame_start = 1
scene.frame_end = 25
scene.render.fps = 30
scene.cycles.samples = args.samples
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
for step in range(9):
    phase = step / 8
    frame = 1 + step * 3
    # Stance travels backwards at constant speed; the opposite foot lifts forward.
    for index, (leg, base) in enumerate(legs):
        p = (phase + index * .5) % 1
        if p < .5:
            forward, lift = .30 - 1.2*p, 0
        else:
            swing = (p-.5)*2
            forward, lift = -.30 + .6*swing, .16*math.sin(math.pi*swing)
        leg.location = base + Vector((0, forward, lift))
        leg.keyframe_insert(data_path='location', frame=frame)
    body.location = base_body + Vector((.025*math.sin(phase*math.tau), 0, .035*(1-math.cos(phase*math.tau*2))))
    body.rotation_euler.z = .025*math.sin(phase*math.tau)
    arm.rotation_euler.x = .07*math.sin(phase*math.tau)
    guard.rotation_euler.x = -.10*math.sin(phase*math.tau)
    body.keyframe_insert(data_path='location', frame=frame)
    for obj in (body, arm, guard):
        obj.keyframe_insert(data_path='rotation_euler', frame=frame)
for obj in scene.objects:
    if obj.animation_data and obj.animation_data.action:
        obj.animation_data.action.name = f'Dwarf walk / {obj.name}'
        for curve in obj.animation_data.action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'

scene.frame_set(1)
bpy.context.view_layer.update()
ground = world_to_camera_view(scene, scene.camera, Vector((0, 0, 0)))
manifest = {
    'source': 'art-source/defense/dwarf-walk.blend',
    'base_source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'generator': 'tools/blender/build_dwarf_walk.py',
    'nativeFacing': 1,
    'frame': {'width': 640, 'height': 640, 'ground': [round(ground.x*640, 4), round((1-ground.y)*640, 4)]},
    'animation': {'fps': 30, 'first_frame': 1, 'last_frame': 25, 'duration_seconds': .8, 'loop': True},
    'render': {'engine': 'Cycles CPU', 'samples': args.samples},
    'poses': [],
}
for step in range(8):
    name = f'walk-{step}'
    scene.frame_set(1 + step*3)
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUT / f'dwarf-{name}.png')
    bpy.ops.render.render(write_still=True)
    manifest['poses'].append({'name': name, 'file': f'dwarf-{name}.png', 'frame': 1+step*3})
scene.frame_set(1)
scene['regeneration_command'] = 'npm run models:dwarf-walk'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / manifest['source']))
(OUT / 'dwarf-walk-model.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('ARCANA_DWARF_WALK_COMPLETE')
