import bpy,math
from pathlib import Path
R=Path(__file__).resolve().parents[2];bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-beacon.blend'))
s=bpy.context.scene
assert sum(o.type=='MESH' for o in s.objects)==28
assert s['regeneration_command']=='npm run models:frontier-beacon'
assert len(bpy.data.actions)==5
assert abs(s.camera.data.ortho_scale-7.1)<1e-5
for frame,q in [(1,0),(38,.49333333333333335),(76,1)]:
 s.frame_set(frame)
 for i in range(4):
  h=bpy.data.objects['crown-hinge-'+str(i)]
  assert h.animation_data.action.users>0
  assert abs(h.rotation_euler.y-math.radians(52)*q)<1e-5
  assert abs(h.location.z-2.53)<1e-5
 assert abs(bpy.data.objects['signal-crystal'].location.z-(3.25+.4*q))<1e-5
 assert abs(bpy.data.objects['Octagonal footing'].location.z-.13)<1e-5
print('PASS saved beacon:28 editable meshes,4 fixed hinges,5 editable actions,common camera and 3 poses')
