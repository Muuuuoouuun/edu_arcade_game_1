"""Build a carved frost guardian variant alongside the original beacon concept."""
import math
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils import noise

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/defense/models'
SOURCE = ROOT / 'art-source/defense'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0, roughness=.5, emission=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return result

stone = material('Snow slate', (.16, .23, .28), roughness=.78)
lightstone = material('Frosted stone', (.48, .61, .64), roughness=.75)
metal = material('Cold bronze', (.42, .31, .17), metallic=.7, roughness=.28)
ice = material('Glowing glacier crystal', (.025, .31, .52), roughness=.25, emission=.20)
ice_light = material('Crystal light facets', (.10, .63, .81), roughness=.22, emission=.26)
navy = material('Deep blue banner', (.015, .075, .16), roughness=.76)
stone_alt = material('Slate variation', (.23, .31, .34), roughness=.83)
mortar = material('Recessed stone joints', (.075, .12, .16), roughness=.9)
gold = material('Polished warm brass', (.68, .42, .12), metallic=.72, roughness=.26)
snow = material('Fresh snow', (.76, .88, .89), roughness=.8)


def surface_texture(mat, base, strength, scale, weave=False):
    """Pack subtle authored color variation into the GLB as an ordinary image map."""
    size = 128
    img = bpy.data.images.new(mat.name + ' / color map', width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        for x in range(size):
            u, v = x / size, y / size
            coarse = noise.noise_vector(Vector((u * scale, v * scale, .73))).x
            fine = noise.noise_vector(Vector((u * scale * 3, v * scale * 3, 1.91))).y
            grain = .7 * coarse + .3 * fine
            if weave:
                grain += .12 * math.sin(x * math.pi / 2) * math.sin(y * math.pi / 2)
            factor = max(.55, min(1.35, 1 + strength * grain))
            pixels.extend((min(1, base[0] * factor), min(1, base[1] * factor), min(1, base[2] * factor), 1))
    img.pixels.foreach_set(pixels)
    img.update()
    img.pack()
    texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
    texture.label = 'Packed hand-weathered color map'
    texture.image = img
    mat.node_tree.links.new(texture.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])


surface_texture(stone, (.16, .23, .28), .28, 5)
surface_texture(stone_alt, (.23, .31, .34), .25, 5)
surface_texture(lightstone, (.48, .61, .64), .20, 6)
surface_texture(snow, (.76, .88, .89), .09, 4)
surface_texture(metal, (.42, .31, .17), .14, 5)
surface_texture(navy, (.015, .075, .16), .25, 6, weave=True)


def finish(name, mat):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, z, mat, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, z))
    obj = finish(name, mat)
    bevel = obj.modifiers.new('Soft edges', 'BEVEL'); bevel.width = .035; bevel.segments = 2
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj


def block(name, loc, scale, mat, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, angle))
    obj=finish(name, mat); obj.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel=obj.modifiers.new('Soft edges','BEVEL'); bevel.width=.035; bevel.segments=2
    obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return obj


def crystal(name, x, y, base, radius, height):
    count=6
    verts=[(x+radius*math.cos(i*math.tau/count), y+radius*math.sin(i*math.tau/count),base) for i in range(count)]
    verts += [(x+radius*math.cos(i*math.tau/count),y+radius*math.sin(i*math.tau/count),base+height*.58) for i in range(count)]
    verts += [(x,y,base+height)]
    faces=[tuple(range(count-1,-1,-1))]
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    faces += [(i+count,(i+1)%count+count,2*count) for i in range(count)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(ice); obj.data.materials.append(ice_light)
    for face in mesh.polygons:
        if face.index % 3 == 1: face.material_index = 1
    return obj

# Chunky dressed stone and warm brass echo the established Arcana tower atlas.
# Every surface detail is geometry/material, so the GLB keeps it without textures.
cylinder('Foundation dark joints',1.65,.26,.13,mortar,16)
for i in range(16):
    a=i*math.tau/16
    block('Foundation stone %02d'%i,(1.48*math.cos(a),1.48*math.sin(a),.15),(.52,.37,.29),lightstone if i%3 else stone_alt,a+math.pi/2)
cylinder('Keep recessed core',1.18,1.19,.87,mortar,8)
for row in range(3):
    for i in range(8):
        a=i*math.tau/8+(row%2)*.035
        block('Masonry row %d block %d'%(row,i),(1.13*math.cos(a),1.13*math.sin(a),.45+row*.37),(.86,.22,.32),stone_alt if (i+row)%3==0 else stone,a+math.pi/2)
cylinder('Lower bronze band',1.25,.10,.34,metal,16)
cylinder('Upper dark rim',1.31,.18,1.53,mortar,16)
cylinder('Upper bronze rim',1.34,.10,1.64,gold,16)
cylinder('Snow shelf',1.20,.10,1.73,snow,16)
for i in range(8):
    a=i*math.tau/8
    x,y=1.19*math.cos(a),1.19*math.sin(a)
    block('Stone buttress %02d'%i,(x,y,.91),(.22,.23,1.22),lightstone,a)
    block('Bronze post cap %02d'%i,(x,y,1.57),(.29,.29,.15),gold,a)
    # Low-relief studs remain readable in the GLB, with no procedural textures.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.055,location=(x*1.10,y*1.10,.82))
    finish('Hand-forged brass stud %02d'%i,gold)
cylinder('Crystal socket',.63,.15,1.83,metal,16)
cylinder('Crystal socket bright rim',.58,.07,1.94,gold,16)
crystal('Main frost crystal',0,0,1.97,.40,1.35)
for i in range(4):
    a=i*math.tau/4+math.pi/4
    x,y=.78*math.cos(a),.78*math.sin(a)
    crystal('Satellite crystal %d'%i,x,y,1.80,.12,.37)
    # A tilted golden support connects the stone crown to the floating crystal.
    start=Vector((x*1.17,y*1.17,1.76)); end=Vector((x*.64,y*.64,2.32)); delta=end-start
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.065,depth=delta.length,location=(start+end)/2)
    obj=finish('Crystal retaining claw %d'%i,metal); obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
# The navy heraldic plate gives the ice tower a clear identity at game scale.
block('Banner bronze frame',(0,-1.26,.89),(.56,.08,.72),gold)
block('Banner deep blue cloth',(0,-1.315,.89),(.47,.055,.62),navy)
block('Emblem vertical frost rune',(0,-1.35,.90),(.085,.035,.38),ice_light)
block('Emblem horizontal frost rune',(0,-1.35,.90),(.30,.035,.075),ice_light)
for direction in (-1,1):
    mark=block('Emblem diagonal frost rune',(0,-1.36,.90),(.28,.035,.045),ice_light)
    mark.rotation_euler[1]=direction*math.pi/4

# Export only tower geometry; studio objects stay in the editable source.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'frost-guardian.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=48; scene.cycles.use_denoising=False
scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.film_transparent=True
scene.render.threads_mode='FIXED'; scene.render.threads=8
scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
scene.view_settings.view_transform='AgX'

def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def light(name,loc,energy,color):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=5; data.color=color
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=loc; aim(obj,(0,0,1.5))
light('Warm key',(-4,-6,8),850,(1,.85,.67))
light('Cool fill',(5,-2,6),700,(.55,.8,1))
light('Rim',(0,5,8),900,(.75,.92,1))
camdata=bpy.data.cameras.new('Sprite camera'); cam=bpy.data.objects.new('Sprite camera',camdata); bpy.context.collection.objects.link(cam)
camdata.type='ORTHO'; camdata.ortho_scale=5.4; cam.location=(7,-10,9); aim(cam,(0,0,1.6)); scene.camera=cam
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'frost-guardian.blend'))
scene.render.filepath=str(OUT/'frost-guardian.png')
bpy.ops.render.render(write_still=True)
print('FROST_GUARDIAN_COMPLETE')
