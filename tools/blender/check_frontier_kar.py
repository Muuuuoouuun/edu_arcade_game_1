"""Reopen the delivered source and verify editable geometry and all eleven action sets survive saving."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art-source/defense/frontier-kar.blend'))
original=bpy.data.collections['Kar winter warrior / editable parts'];runtime=bpy.data.collections['Kar battlefield / joint surfaces']
assert sum(o.type=='MESH' for o in original.objects)==208
assert sum(o.type=='MESH' for o in runtime.objects)==13
joints=['body','head','fur-mantle','beard','war-hammer','left-foot','right-foot','left-upper','left-forearm','right-upper','right-forearm']
for kind in ['walk','slam',*[f'entry {i}' for i in range(8)],'reset 0']:
 for joint in joints:
  action=bpy.data.actions.get(f'Kar {kind} / {joint}')
  assert action and len(action.fcurves)==9,(kind,joint)
  assert action.users>0,(kind,joint,'not retained')
for name in ['hammer-contact','upper-grip','lower-grip']:
 assert bpy.data.objects[name].parent.name=='war-hammer'
assert bpy.context.scene['regeneration_command']=='npm run models:frontier-kar'
print('PASS editable Kar: 208 original meshes, 13 runtime meshes, 121 joint actions, named weapon sockets')
