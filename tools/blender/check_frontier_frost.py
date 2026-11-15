"""Reopen the editable source and verify separate terrain/architecture and geometry."""
import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-frost.blend'))
s=bpy.context.scene
assert s.render.resolution_x/s.render.resolution_y==16/9
assert s['regeneration_command']=='npm run models:frontier-frost'
gate=bpy.data.collections['Frost gate / standalone architecture']
meta=json.loads((R/'public/defense/models/frontier-frost.json').read_text())
assert len(gate.objects)==meta['editable_gate_objects']
assert sum(o.name.startswith('Gate radial arch stone') for o in gate.objects)==9
assert sum(o.name.startswith('Hanging icicle') for o in s.objects)>=40
assert sum(o.name.startswith('Outer glacier peak') for o in s.objects)==8
assert not any(o.name.startswith('Pine') for o in s.objects)
assert all(o.type=='MESH' for o in gate.objects)
assert not any(n.type=='TEX_IMAGE' for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes)
print('EDITABLE_FROST_PASS',len([o for o in s.objects if o.type=='MESH']),'meshes')
