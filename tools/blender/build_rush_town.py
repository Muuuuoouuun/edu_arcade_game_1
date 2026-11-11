"""Rush's closed woodland citadel: editable masonry -> one runtime vertex-colour mesh.

Regenerate: blender --background --python-exit-code 1 --python tools/blender/build_rush_town.py
Authored Z-up, gate faces +Y; glTF's Y-up gate faces -Z. All solid parts are inside radius 2.6.
"""
import bpy, math, json, hashlib, struct, subprocess
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art-source/defense'
RENDERS = ART / 'rush-town'
OUT = ROOT / 'public/defense/models'
GLB = ROOT / 'src/rush/models/forest-town.glb'
RENDERS.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
GLB.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
def material(name, color):
    m = bpy.data.materials.new(name); m.use_nodes = True
    rgba = tuple(linear(int(color[i:i+2], 16) / 255) for i in (1,3,5)) + (1,)
    m.diffuse_color = rgba
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = rgba
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .78
    return m
stone = material('Warm limestone', '#c6c2a2')
stone_light = material('Limestone lit edges', '#e4dbb6')
stone_dark = material('Deep stone joints', '#707e72')
plinth = material('Dark grounded foundation', '#576d65')
roof = material('Arcana blue teal roofs', '#267e9c')
roof_light = material('Teal roof upper facets', '#48b1b4')
wood = material('Oak gate planks', '#ac713e')
wood_dark = material('Dark oak joints', '#62472d')
iron = material('Dark gate iron', '#40545a')
brass = material('Heraldic brass', '#efc66b')
window = material('Deep narrow windows', '#263f45')
objects = []

def finish(o, name, mat):
    o.name = name; o.data.materials.append(mat); objects.append(o); return o
def box(name, at, size, mat, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.object; o.scale = size; o.rotation_euler.z = rot
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat)
def cylinder(name, at, radius, depth, mat, vertices=12, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if top is None else top, depth=depth, location=at)
    return finish(bpy.context.object, name, mat)
def custom(name, verts, faces, mat):
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    o = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(o)
    return finish(o, name, mat)
def arch_stone(name, a0, a1, inner, outer, y0, depth, spring, mat):
    # A real wedge around a doorway, rather than a dark decal on a solid box.
    verts = [(r*math.cos(a),y,spring+r*math.sin(a)) for y in (y0-depth/2,y0+depth/2) for r,a in ((inner,a0),(outer,a0),(outer,a1),(inner,a1))]
    return custom(name, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)
def banner(name, x, y, z, width=.34, height=.68):
    verts = [(x-width/2,y,z),(x+width/2,y,z),(x+width/2,y,z-height*.7),(x,y,z-height),(x-width/2,y,z-height*.7)]
    # Solid, shallow cloth plaque; visible side silhouette and no texture dependency.
    verts += [(vx,vy-.055,vz) for vx,vy,vz in verts]
    custom(name, verts, [(0,1,2,3,4),(9,8,7,6,5),*( (i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5))], roof)
    diamond = [(x,y+.012,z-.18),(x+.10,y+.012,z-.32),(x,y+.012,z-.49),(x-.10,y+.012,z-.32)]
    custom(name+' gold leaf crest',diamond,[(0,1,2,3)],brass)

# Foundation meets the gameplay ground exactly. It sits within the existing circular town footprint.
cylinder('Twelve sided stone footing', (0,0,.13), 2.56, .26, plinth, 16)
cylinder('Limestone foundation chamfer', (0,0,.31), 2.50, .10, stone, 16, top=2.43)

# Main keep has a grounded wall mass and a hipped teal roof with visible timber eaves.
box('Keep stone core',(0,-.37,2.0),(2.12,1.80,3.28),stone_dark)
for row in range(6):
    z=.59+row*.49
    for side in (-1,1):
        for j in range(3):
            x=-.72+j*.72
            box(f'Keep front-back stone {row} {side} {j}',(x,-.37+side*.92,z),(.67,.14,.43),stone_light if (row+j)%4==0 else stone)
        for j in range(3):
            y=-.97+j*.60
            box(f'Keep side stone {row} {side} {j}',(side*1.10,y,z),(.14,.55,.43),stone_light if (row+j)%4==0 else stone)
box('Keep upper oak eave',(0,-.37,3.53),(2.42,2.08,.18),wood_dark)
box('Keep gold roof footing',(0,-.37,3.66),(2.48,2.14,.10),brass)
# Hipped roof is solid with overhang; its long ridge is an Arcana keep, not a pointed primitive tower.
custom('Keep hipped teal roof',[(-1.24,-1.44,3.72),(1.24,-1.44,3.72),(1.24,.70,3.72),(-1.24,.70,3.72),(-.58,-.37,4.86),(.58,-.37,4.86)],[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4),(3,2,1,0)],roof)
box('Keep roof ridge',(0,-.37,4.89),(1.30,.15,.12),roof_light)
box('Keep banner mast',(0,-.37,5.18),(.07,.07,.53),wood_dark)
box('Keep gold pennant',(.30,-.37,5.36),(.55,.05,.32),brass)
# Upper window recesses remain broad enough to read at mobile scale.
for x in (-.54,.54):
    box('Keep deep front arrow slit',(x,.633,2.87),(.20,.055,.51),window)
    box('Keep front window lintel',(x,.68,3.15),(.33,.12,.10),stone_light)
banner('Keep front leaf banner',0,.707,3.32,.35,.79)

# The player camera sees the keep from the rear (+Z runtime). A smaller closed
# supply doorway repeats the oak/stone construction there without implying a walk-through path.
for side in (-1,1):
    box('Rear supply gate jamb',(side*.64,-1.45,.88),(.27,.30,1.04),stone_light)
for i in range(7):
    arch_stone(f'Rear supply gate wedge {i}',i*math.pi/7+.012,(i+1)*math.pi/7-.012,.51,.78,-1.45,.30,1.40,stone_light if i==3 else stone)
for i in range(6):
    left=-.49+i*.165+.005;right=left+.153
    tl=1.4+math.sqrt(max(0,.50**2-left**2));tr=1.4+math.sqrt(max(0,.50**2-right**2))
    verts=[(left,-1.50,.36),(right,-1.50,.36),(right,-1.50,tr),(left,-1.50,tl)]
    verts += [(x,-1.64,z) for x,y,z in verts]
    custom(f'Rear oak plank {i}',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],wood if i%2 else wood_dark)
for side in (-1,1):
    for z in (.69,1.22):
        box('Rear iron hinge strap',(side*.26,-1.68,z),(.42,.07,.10),iron)
box('Rear doorway threshold',(0,-1.48,.38),(1.05,.45,.09),wood_dark)
box('Rear teal crest plaque',(0,-1.405,2.61),(.42,.08,.55),roof)
crest=[(0,-1.46,2.81),(.13,-1.46,2.62),(0,-1.46,2.40),(-.13,-1.46,2.62)]
crest += [(x,y-.025,z) for x,y,z in crest]
custom('Rear gold leaf crest',crest,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],brass)

# A closed gatehouse with actual arched opening and separate timber leaves.
# The entrance faces +Y in Blender, corresponding to runtime -Z.
for side in (-1,1):
    for row in range(4):
        box(f'Gate jamb {side} {row}',(side*.89,1.56,.56+row*.34),(.36,.52,.30),stone_light if row%2==0 else stone)
for i in range(9):
    gap=.012
    arch_stone(f'Gate arch wedge {i}',i*math.pi/9+gap,(i+1)*math.pi/9-gap,.70,1.07,1.56,.52,1.56,stone_light if i in (0,4,8) else stone)
# Each plank has its own clipped arched top and real depth; central seam is deliberate.
for i in range(8):
    left=-.68+i*.17+.008; right=left+.154
    top_left=1.56+math.sqrt(max(0,.69**2-left**2)); top_right=1.56+math.sqrt(max(0,.69**2-right**2))
    verts=[(left,1.63,.36),(right,1.63,.36),(right,1.63,top_right),(left,1.63,top_left)]
    verts += [(x,1.76,z) for x,y,z in verts]
    custom(f'Closed gate oak plank {i}',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],wood if i%2 else wood_dark)
for side in (-1,1):
    for z in (.68,1.35):
        box(f'Gate hinge strap {side} {z}',(side*.36,1.80,z),(.56,.08,.11),iron)
        for x in (side*.15,side*.55):
            cylinder('Gate brass strap rivet',(x,1.851,z),.038,.035,brass,6).rotation_euler.x=math.pi/2
    box('Gate raised central brace',(side*.08,1.81,1.11),(.09,.07,1.45),wood)
    box('Gate pull iron',(side*.20,1.88,1.02),(.09,.10,.17),iron)
box('Gate oak threshold',(0,1.62,.38),(1.44,.58,.09),wood_dark)

# Four stout buttress towers: low secondary roofline leaves the keep and doorway legible.
for index,(x,y,scale) in enumerate([(-1.49,.74,1),(1.49,.74,1),(-1.18,-1.30,.78),(1.18,-1.30,.78)]):
    radius=.55*scale; height=2.56*scale
    cylinder(f'Tower {index} mortar core',(x,y,.36+height/2),radius,height,stone_dark,8)
    for row in range(4):
        for face in range(8):
            angle=math.tau*face/8
            rr=radius*.943
            # Tangential stones form a readable polygonal tower with narrow dark joints.
            block=box(f'Tower {index} masonry {row} {face}',(x+rr*math.cos(angle),y+rr*math.sin(angle),.36+height*(row+.5)/4),(.43*scale,.12*scale,height/4-.045),stone_light if (row+face)%5==0 else stone,angle-math.pi/2)
    cylinder(f'Tower {index} oak eaves',(x,y,.36+height+.06),radius+.065,.15,wood_dark,8)
    cylinder(f'Tower {index} roof brass edge',(x,y,.36+height+.17),radius+.085,.08,brass,8)
    cylinder(f'Tower {index} teal roof',(x,y,.36+height+.54),radius+.09,.70,roof,8,top=.06)
    cylinder(f'Tower {index} roof cap',(x,y,.36+height+.92),.085,.14,brass,6,top=.02)
    if index<2:
        banner(f'Tower {index} leaf standard',x,y+radius+.08,2.31,.35,.78)

# Side curtain stones connect the towers into a defensive mass rather than four isolated cylinders.
for side in (-1,1):
    for row in range(3):
        for j in range(3):
            box(f'Curtain wall stone {side} {row} {j}',(side*1.55,-.85+j*.53,.62+row*.39),(.28,.48,.34),stone)
    for j in range(4):
        box(f'Curtain battlement {side} {j}',(side*1.55,-1.08+j*.50,1.91),(.34,.25,.30),stone_light)

# Check every actual vertex in world space before exporting, not just nominal primitive dimensions.
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
radius=max(math.hypot(v.x,v.y) for v in points); zmin=min(v.z for v in points); zmax=max(v.z for v in points)
assert radius<=2.60001,(radius,'footprint outside gameplay town')
assert abs(zmin)<1e-5,(zmin,'base is not grounded')
assert zmax<=5.85,(zmax,'higher than old town')
editable_count=len(objects)

s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=False
s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=s.render.resolution_y=640;s.render.resolution_percentage=100;s.render.film_transparent=True
s.view_settings.view_transform='Standard';s.view_settings.look='Medium High Contrast'
world=bpy.data.worlds.new('Rush daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.63,.71,.76,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;s.world=world
bpy.ops.object.light_add(type='AREA',location=(-5,7,10));bpy.context.object.data.energy=1100;bpy.context.object.data.size=5
bpy.ops.object.light_add(type='AREA',location=(5,-4,6));bpy.context.object.data.energy=500;bpy.context.object.data.size=6
bpy.ops.object.camera_add(location=(7,11,8));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=7.7;s.camera=camera
s['regeneration_command']='blender --background --python-exit-code 1 --python tools/blender/build_rush_town.py'
s['coordinate_contract']='Authored +Y doorway => runtime -Z; origin ground; max radial extent <= 2.6; one static surface'
bpy.context.preferences.filepaths.save_version=0;blend=ART/'rush-town.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
front=RENDERS/'front.png';s.render.filepath=str(front);bpy.ops.render.render(write_still=True)
camera.location=(-7,-11,8);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
rear=RENDERS/'rear.png';s.render.filepath=str(rear);bpy.ops.render.render(write_still=True)

# The editable .blend above retains individual masonry, door, roof and banner objects.
# Runtime has one draw surface carrying linear vertex colours, with no image textures.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();surface=bpy.context.object;surface.name='Rush woodland citadel surface'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
colors=surface.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for polygon in surface.data.polygons:
    c=surface.data.materials[polygon.material_index].diffuse_color
    for index in polygon.loop_indices:colors.data[index].color=c
paint=bpy.data.materials.new('Rush citadel vertex paint');paint.use_nodes=True
v=paint.node_tree.nodes.new('ShaderNodeVertexColor');v.layer_name='Color';bs=paint.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.78;paint.node_tree.links.new(v.outputs['Color'],bs.inputs['Base Color'])
surface.data.materials.clear();surface.data.materials.append(paint)
for polygon in surface.data.polygons:polygon.material_index=0
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
raw=GLB.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
assert len(doc['meshes'])==1 and triangles<=4500,(len(doc['meshes']),triangles)
png=OUT/'rush-town.png';png.write_bytes(front.read_bytes())
webp=OUT/'rush-town-game.webp';subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(front),'-vf','scale=256:256','-frames:v','1','-c:v','libwebp','-quality','90',str(webp)],check=True)
files=[Path(__file__),blend,GLB,front,rear,png,webp]
meta={'command':s['regeneration_command'],'concept':'art-source/defense/concepts/2026-11-06/verdant-heart.png','editable_meshes':editable_count,'runtime':{'meshes':1,'materials':1,'triangles':triangles,'radius':radius,'min_y':zmin,'max_y':zmax,'front':[0,0,-1],'origin':[0,0,0],'animations':False,'image_textures':False},'camera':{'position':[7,11,8],'target':[0,0,2.35],'ortho_scale':7.7,'resolution':[640,640],'ground':0},'bake':{'webp':'public/defense/models/rush-town-game.webp','resolution':[256,256],'usage':'fallback/2.5D-ready preview, not currently a new campaign building'},'files':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(OUT/'rush-town.json').write_text(json.dumps(meta,indent=2)+'\n')
print('RUSH_TOWN_COMPLETE',json.dumps(meta['runtime']),flush=True)
