"""Validate the editable 3D frost forest and its terrain attachment."""
import bpy,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2]
m=json.loads((R/'public/defense/models/frontier-frost-forest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-frost-forest.blend'))
s=bpy.context.scene
meshes=[o for o in s.objects if o.type=='MESH']
trees=[o for o in meshes if o.name.startswith('Frost evergreen ')]
assert len(meshes)==m['editable_meshes'];assert len(trees)==m['new_meshes']==m['tree_count']*7
assert len([o for o in trees if '/ trunk' in o.name])==m['tree_count']
assert len([o for o in trees if '/ snow ' in o.name])==m['tree_count']*3
for o in trees:
 for v in o.data.vertices:
  p=o.matrix_world@v.co;assert abs(p.x)>28 or abs(p.y)>28,(o.name,tuple(p))
assert not any(n.type=='TEX_IMAGE' for mat in bpy.data.materials if mat.use_nodes for n in mat.node_tree.nodes)
# Recast against the parent terrain, independently of the saved contact metadata.
for obj in trees:obj.hide_set(True)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
for i,p in enumerate(m['placements']):
 obj=bpy.data.objects[f'Frost evergreen {i:02d} / trunk']
 low=min((obj.matrix_world@v.co).z for v in obj.data.vertices)
 hit,point,normal,face,base,matrix=s.ray_cast(deps,Vector((p['x'],-p['z'],60)),Vector((0,0,-1)),distance=90)
 assert hit and abs(point.z-p['base_height'])<.001 and abs(low-(point.z-.08))<.001,(obj.name,low,p,tuple(point))
print('EDITABLE_FROST_FOREST_PASS',m['tree_count'],'trees',len(trees),'separate editable parts')
