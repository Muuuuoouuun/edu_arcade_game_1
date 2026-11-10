"""Shared runner for unit models: build once, pose by rotating joint objects, render the fixed angle set.

A unit script provides
  build(coll) -> dict of joint objects (each part is a mesh object whose origin is its joint)
  POSES       -> {pose: {'joints': {joint: (rx, ry, rz) degrees}, 'glow': strength, 'root_z': lift}}
  HEIGHT      -> unit height in Blender units (the sprite camera scales with it)
Run: python build_boss_x.py -- --out <dir> [--poses a,b] [--views sprite,front,side,back,battle-flank,battle-turned]
                                [--size 640] [--samples 64] [--glb]
"""
import sys, os, math, json, argparse
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from arcana_bpy import collection, render, reset_scene, setup_render, shadow_catcher, stats, studio_lights, unit_views


def parse(default_poses):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True); ap.add_argument('--poses', default=','.join(default_poses))
    ap.add_argument('--views', default='sprite,front,side,back,battle-flank,battle-turned')
    ap.add_argument('--size', type=int, default=640); ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--glb', action='store_true'); ap.add_argument('--blend', action='store_true')
    return ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def apply_pose(joints, pose, glow_mats):
    for name, o in joints.items():
        if name.startswith('fx:'):                       # effect props are shown only in the poses that list them
            o.hide_render = name not in pose.get('show', []); continue
        rx, ry, rz = pose.get('joints', {}).get(name, (0, 0, 0))
        o.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
    if 'root' in joints:
        joints['root'].location.z = pose.get('root_z', 0.0)
    for m, base in glow_mats:
        m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = base * pose.get('glow', 1.0)
    bpy.context.view_layer.update()


def run(unit_id, build, poses, height, glow_names=(), default_poses=None, ground_anchor=(320, 550)):
    args = parse(default_poses or list(poses))
    scene = reset_scene()
    C_UNIT, C_STUDIO = collection('Unit / ' + unit_id), collection('Studio')
    joints = build(C_UNIT)
    glow_mats = [(m, m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value) for m in bpy.data.materials if m.name in glow_names]
    setup_render(scene, args.size, args.size, args.samples, transparent=True, world=('#dfe7ee', .55))
    studio_lights(height, C_STUDIO); shadow_catcher(height * .9, C_STUDIO)
    cams = unit_views(height, C_STUDIO)
    # sprite contract: the ground point under the unit lands on the shared anchor pixel (dwarf script: 320,550 of 640)
    cam = cams['sprite']; scene.camera = cam; bpy.context.view_layer.update()
    g = world_to_camera_view(scene, cam, Vector((0, 0, 0)))
    cam.data.shift_x = g.x - ground_anchor[0] / 640; cam.data.shift_y = g.y - (1 - ground_anchor[1] / 640)
    os.makedirs(args.out, exist_ok=True)
    unit_objs = [o for o in C_UNIT.all_objects if o.type == 'MESH']
    info = {'id': unit_id, 'height': height, 'blender': bpy.app.version_string, 'joints': sorted(joints), 'poses': {}, 'stats': stats(unit_objs),
            'sprite_camera': {'elevation_deg': 23.5, 'yaw_deg': -35, 'ortho_scale': round(5.8 * height / 3.4, 3), 'frame': 640, 'ground_px': list(ground_anchor)}}
    for pose in [p for p in args.poses.split(',') if p]:
        apply_pose(joints, poses[pose], glow_mats)
        zs = [(o.matrix_world @ Vector(c)).z for o in unit_objs if not o.hide_render for c in o.bound_box]
        info['poses'][pose] = {'top_z': round(max(zs), 3), 'min_z': round(min(zs), 3)}
        for view in [v for v in args.views.split(',') if v]:
            render(scene, cams[view], os.path.join(args.out, f'{unit_id}-{pose}-{view}.png'))
    apply_pose(joints, poses[(default_poses or list(poses))[0]], glow_mats)
    if args.glb:
        for o in C_STUDIO.all_objects:
            o.select_set(False)
        for o in C_UNIT.all_objects:
            o.select_set(True)
        path = os.path.join(args.out, f'{unit_id}.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
        info['glb_bytes'] = os.path.getsize(path)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, f'{unit_id}.blend'))
    json.dump(info, open(os.path.join(args.out, f'{unit_id}.json'), 'w'), indent=1)
    print('DONE', json.dumps(info))
