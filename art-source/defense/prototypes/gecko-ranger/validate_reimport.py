"""Validate exported gecko from a fresh Blender process, independently of builder."""
import json
import math
import struct
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
OUT=Path(__file__).resolve().parent
blob=(OUT/'gecko-ranger.glb').read_bytes()
assert blob[:4]==b'glTF'
json_length,chunk_type=struct.unpack_from('<II',blob,12)
assert chunk_type==0x4e4f534a
gltf=json.loads(blob[20:20+json_length])
assert len(gltf['animations'])==1
clip=gltf['animations'][0]
assert clip['name']=='gecko-seed-shot'
assert len(clip['channels'])>=5
sampler_times=[gltf['accessors'][s['input']] for s in clip['samplers']]
assert all(abs(s['min'][0])<1e-6 and abs(s['max'][0]-1)<1e-6 for s in sampler_times)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=str(OUT/'gecko-ranger.glb'))
meshes=[o for o in scene.objects if o.type=='MESH'];triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
weapon=bpy.data.objects['crossbow-and-gripping-arms'];tail=bpy.data.objects['curled-tail']
assert weapon.parent.name=='body'
assert bpy.data.objects['seed-ammunition'].parent==weapon
assert tail.parent.name=='gecko-ranger'
assert weapon.animation_data is not None and tail.animation_data is not None
expected=json.loads((OUT/'gecko-ranger-model.json').read_text())
cd=bpy.data.cameras.new('Validation camera');camera=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(camera)
cd.type='ORTHO';cd.ortho_scale=expected['frame']['orthographic_scale'];cd.shift_y=expected['frame']['shift_y']
camera.location=expected['frame']['camera_location'];camera.rotation_euler=expected['frame']['camera_rotation_radians'];scene.camera=camera
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100
samples=[];initial=None;loop_error=None;all_ground=True;minimum_frame_margin=640
for frame in range(31):
    scene.frame_set(frame);bpy.context.view_layer.update()
    coords=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    assert all(math.isfinite(c) for point in coords for c in point)
    ground=min(v.z for v in coords);assert abs(ground)<1e-5
    projected=[world_to_camera_view(scene,camera,v) for v in coords]
    margin=min(min(q.x,q.y,1-q.x,1-q.y)*640 for q in projected)
    assert margin>0
    minimum_frame_margin=min(minimum_frame_margin,margin)
    if frame==0:initial={o.name:o.matrix_world.copy() for o in scene.objects}
    if frame==30:
        loop_error=max(abs(o.matrix_world[r][c]-initial[o.name][r][c]) for o in scene.objects for r in range(4) for c in range(4));assert loop_error<1e-5
    if frame in (0,7,11,20,30):
        samples.append({'frame':frame,'weapon_world_position':[round(v,6) for v in weapon.matrix_world.translation],'weapon_world_rotation_radians':[round(v,6) for v in weapon.matrix_world.to_euler()],'min_world_z':round(ground,6),'world_bbox':[[round(min(v[k] for v in coords),6) for k in range(3)],[round(max(v[k] for v in coords),6) for k in range(3)]]})
assert (Vector(samples[0]['weapon_world_position'])-Vector(samples[2]['weapon_world_position'])).length>.07
assert abs(samples[0]['weapon_world_rotation_radians'][0]-samples[2]['weapon_world_rotation_radians'][0])>.05
expected=json.loads((OUT/'gecko-ranger-model.json').read_text())
assert triangles==expected['runtime']['triangles']
assert len(meshes)==expected['runtime']['mesh_objects']
assert len(bpy.data.materials)==expected['runtime']['materials']
result={'passed':True,'blender':bpy.app.version_string,'glb_bytes':len(blob),'imported_mesh_objects':len(meshes),'imported_triangles':triangles,'imported_materials':len(bpy.data.materials),'animation':{'clip':clip['name'],'channels':len(clip['channels']),'duration_seconds':1,'glb_clips':1},'imported_object_actions':[{'name':a.name,'frame_range':list(a.frame_range)} for a in bpy.data.actions],'samples':samples,'loop_max_matrix_error':loop_error,'minimum_camera_margin_px_all_31_frames':round(minimum_frame_margin,3),'checks':['Fresh Blender process import','Exactly one named one-second glTF clip','Crossbow, ammunition and tail parent hierarchy preserved','Weapon and tail animation imported','Finite vertices, grounded feet and complete camera framing at every frame 0–30','Recoil translates weapon >0.07 and rotates >0.05 rad','All scene transforms return to start at frame 30','Mesh, triangle and material counts match generator metadata']}
(OUT/'reimport-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print('GECKO_REIMPORT_VALID '+json.dumps(result))
