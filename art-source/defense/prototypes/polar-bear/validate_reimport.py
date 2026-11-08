"""Fresh-process GLB validation. Run with Blender, not ordinary Python."""
import json
import math
import struct
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

OUT = Path(__file__).resolve().parent
expected = json.loads((OUT/'polar-bear-model.json').read_text())
blob = (OUT/'polar-bear.glb').read_bytes()
assert struct.unpack_from('<III', blob, 0) == (0x46546C67, 2, len(blob))
json_length, chunk_type = struct.unpack_from('<II', blob, 12)
assert chunk_type == 0x4E4F534A
gltf = json.loads(blob[20:20+json_length])
assert len(gltf.get('animations', [])) == 1
clip = gltf['animations'][0]
assert clip['name'] == 'polar-bear-attack'
assert len(clip['channels']) == 5
bin_header = 20+json_length
bin_length, bin_type = struct.unpack_from('<II', blob, bin_header)
assert bin_type == 0x004E4942 and bin_header+8+bin_length == len(blob)
# Read actual animation time floats, rather than trusting accessor min/max labels.
for sampler in clip['samplers']:
    accessor = gltf['accessors'][sampler['input']]
    view = gltf['bufferViews'][accessor['bufferView']]
    assert accessor['componentType'] == 5126 and accessor['type'] == 'SCALAR'
    assert accessor['count'] > 1 and 'sparse' not in accessor and view['buffer'] == 0
    stride = view.get('byteStride', 4)
    relative_offset = accessor.get('byteOffset', 0)
    assert relative_offset+(accessor['count']-1)*stride+4 <= view['byteLength']
    assert view.get('byteOffset', 0)+view['byteLength'] <= bin_length
    offset = bin_header+8+view.get('byteOffset', 0)+relative_offset
    times = [struct.unpack_from('<f', blob, offset+i*stride)[0] for i in range(accessor['count'])]
    assert all(math.isfinite(t) for t in times)
    assert all(a < b for a, b in zip(times, times[1:]))
    assert abs(times[0]) < 1e-6 and abs(times[-1]-.8) < 1e-6
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=str(OUT/'polar-bear.glb'))
meshes = [o for o in scene.objects if o.type == 'MESH']
triangles = 0
for obj in meshes:
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
arm = bpy.data.objects['hammer-arm']
weapon = bpy.data.objects['hammer']
assert weapon.parent.name == 'hammer-forearm'
assert weapon.parent.parent == arm
assert arm.parent.name == 'body'
camera_data = bpy.data.cameras.new('Validation camera')
camera = bpy.data.objects.new(camera_data.name, camera_data)
scene.collection.objects.link(camera)
camera_data.type = 'ORTHO'
camera_data.ortho_scale = expected['frame']['orthographic_scale']
camera_data.shift_y = expected['frame']['shift_y']
camera.location = expected['frame']['camera_location']
camera.rotation_euler = expected['frame']['camera_rotation_radians']
scene.camera = camera
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
samples = []
initial_matrices = None
loop_error = None
minimum_frame_margin = 640
for frame in range(25):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    coords = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    assert all(math.isfinite(c) for point in coords for c in point)
    ground = min(v.z for v in coords)
    assert abs(ground) < 1e-5, (frame, ground)
    projected = [world_to_camera_view(scene, camera, v) for v in coords]
    margin = min(min(v.x, v.y, 1-v.x, 1-v.y)*640 for v in projected)
    assert margin > 0, (frame, margin)
    minimum_frame_margin = min(minimum_frame_margin, margin)
    if frame == 0:
        initial_matrices = {o.name:o.matrix_world.copy() for o in scene.objects}
    if frame == 24:
        loop_error = max(abs(o.matrix_world[row][col]-initial_matrices[o.name][row][col]) for o in scene.objects for row in range(4) for col in range(4))
        assert loop_error < 1e-5
    if frame in (0, 6, 10, 16, 24):
        samples.append({'frame':frame,'hammer_world_position':[round(v,6) for v in weapon.matrix_world.translation],'hammer_world_rotation_radians':[round(v,6) for v in weapon.matrix_world.to_euler()],'hammer_arm_rotation_radians':[round(v,6) for v in arm.matrix_world.to_euler()],'min_world_z':round(ground,6)})
assert abs(samples[0]['min_world_z']) < 1e-5
assert all(abs(s['min_world_z']) < 1e-5 for s in samples)
assert (Vector(samples[0]['hammer_world_position'])-Vector(samples[1]['hammer_world_position'])).length > .1
assert (Vector(samples[0]['hammer_world_position'])-Vector(samples[-1]['hammer_world_position'])).length < 1e-5
assert triangles == expected['runtime']['triangles']
assert len(meshes) == expected['runtime']['mesh_objects']
assert len(bpy.data.materials) == expected['runtime']['materials']
assert weapon.animation_data is not None
result = {'passed':True,'blender':bpy.app.version_string,'imported_mesh_objects':len(meshes),'imported_triangles':triangles,'imported_materials':len(bpy.data.materials),'animation':{'clip':clip['name'],'channels':len(clip['channels']),'duration_seconds':.8,'glb_clips':1,'duration_checked_from_binary_samples':True},'actions': [{'name':a.name,'frame_range':list(a.frame_range)} for a in bpy.data.actions], 'samples':samples,'loop_max_matrix_error':loop_error,'minimum_camera_margin_px_all_25_frames':round(minimum_frame_margin,3),'checks':['Exactly one polar-bear-attack GLB clip with five channels and binary time samples spanning 0–0.8 seconds','Fresh Blender process imports GLB','Rigid hammer hierarchy preserved','Hammer wrist has imported animation','Finite vertices, grounded feet and complete camera framing at every frame 0–24','Windup moves weapon more than 0.1 unit','Frame 24 returns every object position, rotation and scale to initial transform','Imported triangle, material and mesh counts match export metadata']}
(OUT/'reimport-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print('POLAR_BEAR_REIMPORT_VALID '+json.dumps(result))
