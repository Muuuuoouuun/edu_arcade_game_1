"""Bake orthographic road, bridge and high-ground meshes into aligned 2.5D terrain.
Run after tools/export-terrain-layout.ts; no generated illustration is an input.
"""
import bpy
import json
import math
import random
import subprocess
import hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'art-source/defense'
OUT = ROOT/'public/defense/terrain'
OUT.mkdir(parents=True,exist_ok=True)
layout=json.loads((SOURCE/'terrain-layout.json').read_text())

def position(x,y,z):
    # Camera's vertical projection: .8*Y + .6*Z. Top surfaces keep their logical XY.
    return ((x-450), (300-y-.6*z)/.8, z)

def material(name,color,rough=.8):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    node=m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=rough
    return m

def solid(name,polygon,height,top,side,depth=None):
    depth=height if depth is None else depth
    roof=[position(x,y,height) for x,y in polygon]
    floor=[(x,y,z-depth) for x,y,z in roof]
    n=len(roof)
    # Screen-clockwise polygon corresponds to a world-space counterclockwise roof.
    faces=[tuple(range(n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(roof+floor,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    mesh.materials.append(top);mesh.materials.append(side)
    for face in mesh.polygons:face.material_index=0 if face.index==0 else 1
    return obj

def tile(name,x,y,w,h,z,top,side,depth=None):
    return solid(name,[(x-w/2,y-h/2),(x-w/2,y+h/2),(x+w/2,y+h/2),(x+w/2,y-h/2)],z,top,side,depth)

def smooth_path(points):
    p=[Vector((v['x'],v['y'])) for v in points];out=[p[0]]
    for i in range(1,len(p)-1):
        a,b,c=p[i-1:i+2]
        left=b+(a-b).normalized()*18;right=b+(c-b).normalized()*18
        out.append(left)
        for j in range(1,9):
            t=j/8;out.append((1-t)**2*left+2*(1-t)*t*b+t*t*right)
    out.append(p[-1]);return out

def ribbon(name,points,width,z,top,side):
    samples=[points[0]]
    for a,b in zip(points,points[1:]):
        count=max(1,math.ceil((b-a).length/10))
        samples.extend(a+(b-a)*(i/count) for i in range(1,count+1))
    points=samples
    left=[];right=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        normal=Vector((-tangent.y,tangent.x))*width/2
        left.append(tuple(p+normal));right.append(tuple(p-normal))
    # Each quad is convex, so Blender never has to triangulate a winding concave road cap.
    for i in range(len(points)-1):solid(name,[left[i],left[i+1],right[i+1],right[i]],z,top((points[i]+points[i+1])/2) if callable(top) else top,side)

manifest={'projection':{'width':900,'height':600,'camera':'orthographic','ground_plane':'X=(x-450), Y=(300-y-.6z)/.8'},'variants':[]}
for variant in layout['variants']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    rng=random.Random(143)
    snow=variant['id'].startswith('snow')
    road=material('Road / ice' if snow else 'Road / warm packed sand',(.65,.75,.76) if snow else (.60,.39,.16))
    ice=material('Ice / accelerated crossing',(.23,.55,.69),.28)
    edge=material('Weathered shoulder',(.64,.77,.79) if snow else (.30,.36,.19))
    cliff=material('Cut bank / shaded strata',(.19,.32,.39) if snow else (.19,.21,.14))
    stone=material('Stone / upper faces',(.60,.73,.77) if snow else (.43,.45,.32))
    dark=material('Stone / side faces',(.24,.36,.42) if snow else (.23,.27,.20))
    wood=material('Bridge / oak planks',(.35,.19,.07))
    rim=material('Bridge / pale endgrain',(.58,.36,.14))
    iron=material('Bridge / iron fasteners',(.09,.13,.13),.4)
    for lane,raw in enumerate(variant['paths']):
        path=smooth_path(raw)
        ribbon(f'Lane {lane+1} / raised bank',path,58,12,edge,cliff)
        ribbon(f'Lane {lane+1} / road surface',path,43,13,(lambda p:ice if 300<=p.x<=520 else road) if snow else road,cliff)
        # Low segmented curbs and scattered inset pavers expose depth without obscuring the lane.
        for a,b in zip(path,path[1:]):
            length=(b-a).length
            if length<24:continue
            tangent=(b-a).normalized();normal=Vector((-tangent.y,tangent.x))
            for k in range(int(length/23)):
                center=a+tangent*(k*23+11)
                for side in (-1,1):
                    c=center+normal*side*25
                    polygon=[tuple(c+tangent*u+normal*v) for u,v in [(-9,-3),(-9,3),(9,3),(9,-3)]]
                    solid('Road / curb stone',polygon,16,stone,dark,7)
                if k%2==0:
                    c=center+normal*rng.uniform(-10,10)
                    tile('Road / inset paver',c.x,c.y,5+rng.random()*6,3,14,stone,dark,2)
    for slot in variant['highSlots']:
        x,y=slot['x'],slot['y']+8
        polygon=[(x+30*math.cos(i*math.tau/8),y+18*math.sin(i*math.tau/8)) for i in reversed(range(8))]
        solid('High ground / stone terrace',polygon,20,stone,dark)
        for dx in (-18,-6,6,18):
            for dy in (-6,5):
                tile('High ground / paving slab',x+dx,y+dy,11,9,21,edge if dx==6 else stone,dark,2)
        for step in range(3):
            tile('High ground / access stair',x,y+17+step*4,23,6,16-step*5,stone,dark,7)
        # Masonry face seams appear on the front retaining wall.
        for dx in (-16,0,16):tile('High ground / front block',x+dx,y+17,13,3,12,stone,dark,8)
    if not snow:
        for y in [430]+([235] if len(variant['paths'])==2 else []):
            tile('Bridge / crossbeam',677,y,124,48,17,wood,dark)
            for x in range(620,739,9):
                tile('Bridge / transverse plank',x,y,8,45,20,rim,wood,5)
            # Back rail is part of the bake; the front rail is depth-sorted at runtime.
            tile('Bridge / back handrail',678,y-24,128,3,45,rim,wood,4)
            for x in (620,650,680,710,738):
                tile('Bridge / back post',x,y-22,4,4,42,wood,dark,24)
                tile('Bridge / nail',x,y-18,2,2,21,iron,iron,1)
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False
    scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    world=bpy.data.worlds.new('Soft daylight');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.75,.85,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
    light_data=bpy.data.lights.new('Warm directional light','AREA');light_data.energy=2200000;light_data.shape='DISK';light_data.size=500
    light=bpy.data.objects.new('Warm directional light',light_data);scene.collection.objects.link(light)
    light.location=(-400,-200,1000);light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('Logical coordinate camera');camera=bpy.data.objects.new(camera_data.name,camera_data);scene.collection.objects.link(camera)
    camera.location=(0,-900,1200);camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=900;camera_data.clip_end=4000;scene.camera=camera
    bpy.context.view_layer.update()
    anchors=[]
    for raw in variant['paths']:
        for p in raw:
            v=world_to_camera_view(scene,camera,Vector(position(p['x'],p['y'],13)))
            actual=[v.x*900,(1-v.y)*600]
            assert abs(actual[0]-p['x'])<.01 and abs(actual[1]-p['y'])<.01,actual
            anchors.append({'logical':[p['x'],p['y']],'projected':[round(n,4) for n in actual]})
    png=SOURCE/f"terrain-{variant['id']}.png";webp=OUT/f"{variant['id']}.webp"
    scene.render.filepath=str(png);bpy.ops.render.render(write_still=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(png),'-c:v','libwebp','-quality','90',str(webp)],check=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f"terrain-{variant['id']}.blend"))
    manifest['variants'].append({'id':variant['id'],'file':webp.name,'bytes':webp.stat().st_size,'sha256':hashlib.sha256(webp.read_bytes()).hexdigest(),'path_anchors':anchors})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('ARCANA_TERRAIN_COMPLETE')
