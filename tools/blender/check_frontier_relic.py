"""Check editable pickup pivot, fixed base, preview timing and common camera."""
import bpy
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-relic.blend'));s=bpy.context.scene
base=bpy.data.objects['relic-base'];core=bpy.data.objects['relic-core'];assert base.parent==core.parent and core.animation_data and core.animation_data.action
rest=None
for f in [1,6,11]:
 s.frame_set(f);bpy.context.view_layer.update();m=tuple(round(x,6) for row in base.matrix_world for x in row)
 if rest is None:rest=m
 assert m==rest;assert core.location.z>=.55-.00001;assert 0<core.scale.x<=1
 vertices=[o.matrix_world@v.co for o in base.children if o.type=='MESH' for v in o.data.vertices];assert abs(min(v.z for v in vertices))<.00001
assert s.camera.data.type=='ORTHO' and abs(s.camera.data.ortho_scale-6.3)<.001
print('PASS editable recovery crystal',{'mesh_parts':sum(o.type=='MESH' for o in bpy.data.objects),'frames':[1,6,11]})
