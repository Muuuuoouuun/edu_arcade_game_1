import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[2];m=json.loads((R/'public/defense/models/frontier-frost-gate-impact.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-frost-gate-impact.blend'))
s=bpy.context.scene;meshes=[o for o in s.objects if o.type=='MESH'];assert len(meshes)==m['editable_meshes'];assert s.render.fps==60;assert (s.frame_end-s.frame_start)/s.render.fps==.55
fixed=[o for o in meshes if not o.parent];s.frame_set(1);before={o.name:o.matrix_world.copy() for o in fixed}
for frame in [6,10,20,34]:
 s.frame_set(frame)
 for o in fixed:assert o.matrix_world==before[o.name],o.name
for name in ['gate-leaf-0','gate-leaf-1','gate-lantern-0','gate-lantern-1']:assert bpy.data.objects[name].animation_data.action
assert not any(n.type=='TEX_IMAGE' for mat in bpy.data.materials if mat.use_nodes for n in mat.node_tree.nodes)
print('EDITABLE_GATE_IMPACT_PASS',len(meshes),'meshes',len(fixed),'fixed objects','4 animation actions')
