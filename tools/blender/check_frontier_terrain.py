import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[2];bpy.ops.wm.open_mainfile(filepath=str(R/'art-source/defense/frontier-terrain.blend'))
objects=[o for o in bpy.data.objects if o.type=='MESH'];assert len(objects)==json.loads((R/'public/defense/models/frontier-terrain.json').read_text())['editable_objects']
for prefix,count in [('West river cliff',32),('East river cliff',32),('Bridge masonry support',6),('Bridge diagonal brace',4),('Bridge deck plank',16)]:assert sum(o.name.startswith(prefix)for o in objects)==count,(prefix,count)
for prefix,count in [('Verdant trunk',28),('Verdant branch',28),('Verdant crown',56)]:assert sum(o.name.startswith(prefix)for o in objects)==count,(prefix,count)
# Trees must remain beyond the playable x range so their meshes do not intrude into the road or pads.
for tree in (o for o in objects if o.name.startswith('Verdant')):
 for vertex in tree.data.vertices:
  x=(tree.matrix_world @ vertex.co).x
  assert abs(x)>28,(tree.name,x)
grass=next(o for o in objects if o.name=='Grass slopes / river trench')
assert len(grass.data.materials)==4 and len({p.material_index for p in grass.data.polygons})==4
assert bpy.context.scene['river_water_y']==-2.6;assert bpy.context.scene['river_bed_y']==-4.5
assert bpy.context.scene.camera.data.ortho_scale==98
print('PASS editable terrain',len(objects),'objects;64 cliff segments,6 supports,4 braces,16 planks,original common camera')
# Runtime paint must preserve every authored terrain material's linear base color.
palette={tuple(m.diffuse_color) for o in objects for m in o.data.materials}
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(R/'public/defense/models/frontier-terrain.glb'))
packed=[o for o in bpy.data.objects if o not in before and o.type=='MESH'];assert len(packed)==1
colors=packed[0].data.color_attributes[0];used={tuple(c.color) for c in colors.data}
for color in used:assert min(max(abs(a-b)for a,b in zip(color,p))for p in palette)<.0001
for color in palette:assert min(max(abs(a-b)for a,b in zip(color,p))for p in used)<.0001
print('PASS runtime vertex paint:',len(used),'colors match',len(palette),'editable materials')
