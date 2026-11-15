import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[2];m=json.loads((R/'public/defense/models/frontier-frost-cliffs.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-frost-cliffs.blend'))
s=bpy.context.scene;meshes=[o for o in s.objects if o.type=='MESH'];cliffs=[o for o in meshes if o.name.startswith(('Boundary cliff','Outer glacier','North wall'))]
assert len(meshes)==m['editable_meshes'];assert len(cliffs)==66;assert s.render.resolution_x/s.render.resolution_y==16/9
assert not any(o.name.startswith(('Faceted boundary ice','Outer glacier peak','Gate masonry')) for o in s.objects)
for o in cliffs:
 for v in o.data.vertices:
  p=o.matrix_world@v.co;assert abs(p.x)>28 or abs(p.y)>28,(o.name,tuple(p))
assert not any(n.type=='TEX_IMAGE' for mat in bpy.data.materials if mat.use_nodes for n in mat.node_tree.nodes)
print('EDITABLE_CLIFFS_PASS',len(meshes),'meshes',len(cliffs),'boundary cliff parts')
