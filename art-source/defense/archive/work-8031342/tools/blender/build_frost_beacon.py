"""Build an isolated, editable frost beacon concept; does not replace tower assets."""
import math
from pathlib import Path

import bpy
from mathutils import Vector

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
ice = material('Glowing glacier crystal', (.10, .66, .86), roughness=.25, emission=.45)
snow = material('Fresh snow', (.76, .88, .89), roughness=.8)


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
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(ice)
    return obj

# Layered, readable silhouette inspired by the existing crystal tower.
cylinder('Foundation',1.65,.26,.13,lightstone,16)
cylinder('Octagonal keep',1.25,1.26,.88,stone,8)
cylinder('Upper rim',1.33,.16,1.55,metal,16)
cylinder('Snow cap',1.20,.10,1.67,snow,16)
for i in range(8):
    a=i*math.tau/8
    block('Stone buttress %02d'%i,(1.17*math.cos(a),1.17*math.sin(a),.87),(.24,.24,1.28),lightstone,a)
    block('Bronze cap %02d'%i,(1.17*math.cos(a),1.17*math.sin(a),1.55),(.30,.30,.16),metal,a)
crystal('Main frost crystal',0,0,1.72,.48,1.65)
for i in range(4):
    a=i*math.tau/4+math.pi/4
    crystal('Satellite crystal %d'%i,.72*math.cos(a),.72*math.sin(a),1.70,.15,.48)
# A blue diamond on the front reads as the tower's element from a distance.
block('Front plaque',(0,-1.205,.94),(.56,.08,.65),metal)
plaque=block('Ice emblem',(0,-1.26,.95),(.22,.06,.22),ice)
plaque.rotation_euler[1]=math.pi/4

# Export only tower geometry; studio objects stay in the editable source.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'frost-beacon.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False)
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
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'frost-beacon.blend'))
scene.render.filepath=str(OUT/'frost-beacon.png')
bpy.ops.render.render(write_still=True)
print('FROST_BEACON_COMPLETE')
