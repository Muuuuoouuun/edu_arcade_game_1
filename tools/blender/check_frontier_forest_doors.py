"""Check editable forest gate footing, door hinges and the original common camera."""
import bpy,math,json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[2];meta=json.loads((R/'public/defense/models/frontier-forest-doors.json').read_text())
for item in meta['files']:assert hashlib.sha256((R/item['path']).read_bytes()).hexdigest()==item['sha256'],item['path']
bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-forest-doors.blend'));s=bpy.context.scene
meshes=[o for o in s.objects if o.type=='MESH'];fixed=[o for o in meshes if o.parent is None];leaves=[bpy.data.objects.get('forest-leaf-'+str(i)) for i in range(2)]
assert all(leaves);assert sum(o.name.startswith('Forest gate plank') for o in meshes)==8
assert sum(o.name.startswith('Forged strap') for o in meshes)==12;assert len(fixed)==162
assert sum(o.name.startswith('Center meeting stile') for o in meshes)==1
assert abs(s.camera.data.ortho_scale-6.8)<1e-5 and s.render.resolution_x==512 and s.render.resolution_y==512
s.frame_set(1);bpy.context.view_layer.update();initial={o.name:o.matrix_world.copy() for o in fixed};start=[h.rotation_euler.z for h in leaves]
for frame in range(1,35):
 s.frame_set(frame);bpy.context.view_layer.update()
 for o in fixed:assert all(abs(o.matrix_world[i][j]-initial[o.name][i][j])<1e-7 for i in range(4) for j in range(4)),(frame,o.name)
 for h in leaves:assert abs(h.location.z+.0477514)<1e-7
s.frame_set(6);bpy.context.view_layer.update();assert all(abs(abs(h.rotation_euler.z)-.15)<1e-6 for h in leaves)
s.frame_set(34);bpy.context.view_layer.update();assert all(abs(h.rotation_euler.z-a)<1e-7 for h,a in zip(leaves,start))
print('PASS forest gate: 162 fixed meshes, 8 planks, 12 straps, both hinges, 34 time samples, common camera and file hashes')
