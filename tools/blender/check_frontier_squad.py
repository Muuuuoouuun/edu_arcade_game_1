"""Validate editable support scout pivots, hand/stock contact and preview ground."""
import bpy
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[2];bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-squad.blend'));s=bpy.context.scene
rig=bpy.data.objects['squad-rig'];weapon=bpy.data.objects['squad-weapon'];feet=[bpy.data.objects['squad-left-foot'],bpy.data.objects['squad-right-foot']]
assert all(x.parent==rig for x in [weapon,*feet]);assert all(x.animation_data and x.animation_data.action for x in feet)
hands=[o for o in bpy.data.objects if o.name.startswith('Hand gripping weapon')];stock=bpy.data.objects['Crossbow stock'];assert len(hands)==2 and all(x.parent==weapon for x in hands) and stock.parent==weapon

def bounds(o):
 p=[o.matrix_world@Vector(v) for v in o.bound_box];return [min(v[i] for v in p) for i in range(3)],[max(v[i] for v in p) for i in range(3)]
for frame in [1,9,17,25]:
 s.frame_set(frame);bpy.context.view_layer.update();smn,smx=bounds(stock)
 for hand in hands:
  hmn,hmx=bounds(hand);assert all(hmn[i]<=smx[i]+.001 and hmx[i]>=smn[i]-.001 for i in range(3)),(frame,hand.name,hmn,hmx,smn,smx)
 for foot in feet:
  soles=[o for o in foot.children if o.type=='MESH' and o.name.startswith('Boot sole')];assert len(soles)==1
  lo,_=bounds(soles[0]);assert lo[2]>=-.0001,(frame,foot.name,lo)
 assert min(bounds(next(o for o in foot.children if o.type=='MESH' and o.name.startswith('Boot sole')))[0][2] for foot in feet)<.001
assert s.camera.data.type=='ORTHO' and abs(s.camera.data.ortho_scale-6.3)<.001
print('PASS editable support soldier',{'mesh_parts':sum(o.type=='MESH' for o in bpy.data.objects),'hand_contacts':len(hands),'frames':[1,9,17,25]})
