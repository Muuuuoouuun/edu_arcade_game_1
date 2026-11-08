"""Fresh-process GLB validation. Run with Blender, not ordinary Python."""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
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
samples = []
for frame in (0, 6, 10, 16, 24):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    coords = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    assert all(math.isfinite(c) for point in coords for c in point)
    samples.append({'frame':frame,'hammer_world_position':[round(v,6) for v in weapon.matrix_world.translation],'hammer_arm_rotation_radians':[round(v,6) for v in arm.matrix_world.to_euler()],'min_world_z':round(min(v.z for v in coords),6)})
assert abs(samples[0]['min_world_z']) < 1e-5
assert all(abs(s['min_world_z']) < 1e-5 for s in samples)
assert (Vector(samples[0]['hammer_world_position'])-Vector(samples[1]['hammer_world_position'])).length > .1
assert (Vector(samples[0]['hammer_world_position'])-Vector(samples[-1]['hammer_world_position'])).length < 1e-5
expected = json.loads((OUT/'polar-bear-model.json').read_text())
assert triangles == expected['runtime']['triangles']
assert len(meshes) == expected['runtime']['mesh_objects']
assert len(bpy.data.materials) == expected['runtime']['materials']
result = {'passed':True,'blender':bpy.app.version_string,'imported_mesh_objects':len(meshes),'imported_triangles':triangles,'imported_materials':len(bpy.data.materials),'actions': [{'name':a.name,'frame_range':list(a.frame_range)} for a in bpy.data.actions], 'samples':samples,'checks':['Fresh Blender process imports GLB','Rigid hammer hierarchy preserved','Finite vertex positions in five animation samples','Feet remain at Z=0','Windup moves weapon more than 0.1 unit','Frame 24 returns weapon to initial position','Imported triangle, material and mesh counts match export metadata']}
(OUT/'reimport-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print('POLAR_BEAR_REIMPORT_VALID '+json.dumps(result))
