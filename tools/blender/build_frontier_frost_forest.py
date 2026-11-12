"""Build editable snow evergreens onto the existing 3D frost boundary.

Rebuild: npm run models:frontier-frost-forest. No image planes or gameplay geometry.
Game (x,z,height) is Blender (x,-z,height).
"""
import bpy, math, json, hashlib, subprocess
from pathlib import Path
from mathutils import Vector

R=Path(__file__).resolve().parents[2]
A=R/'art-source/defense'; O=R/'public/defense/models'; NAME='frontier-frost-forest'
SOURCE=A/'frontier-frost-cliffs.blend'
CONCEPT=R/'art-source/defense/concepts/2026-11-06/silverfrost-pass.png'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
s=bpy.context.scene

def linear(hex_color):
    values=[int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)

def material(name,hex_color):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=linear(hex_color)
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Roughness'].default_value=.9
    return m

bark=material('Snow pine / bark','#504c42')
needle=material('Snow pine / deep needles','#315653')
needle2=material('Snow pine / blue needles','#3f6b6c')
snow=material('Snow pine / warm snow','#eaf2ef')
collection=bpy.data.collections.new('Frost evergreens / editable');s.collection.children.link(collection)
created=[]

def mesh(name,vertices,faces,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.materials.append(mat);data.update()
    obj=bpy.data.objects.new(name,data);collection.objects.link(obj);created.append(obj);return obj

def cone(name,x,z,bottom,radius,height,mat,seed):
    vertices=[];n=7
    for i in range(n):
        a=2*math.pi*i/n;w=1+.08*math.sin(seed*2+i*2.1)
        vertices.append((x+math.cos(a)*radius*w,-z+math.sin(a)*radius*w,bottom+.04*math.sin(seed+i)))
    vertices.append((x+.09*math.sin(seed),-z+.09*math.cos(seed),bottom+height))
    return mesh(name,vertices,[tuple(reversed(range(n)))]+[(i,(i+1)%n,n) for i in range(n)],mat)

def trunk(name,x,z,bottom,height,radius):
    n=7;v=[]
    for h in (0,height):
        for i in range(n):
            a=2*math.pi*i/n;v.append((x+radius*math.cos(a),-z+radius*math.sin(a),bottom+h))
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,faces,bark)

# The candidates stand on existing solid snow/rock, all outside the playable square.
# The landscape camera looks from +X; keep evergreens on the opposite, background side.
placements=[(-31.8,z) for z in (-25,-16,-7,2,11,20)] + [(x,-31.8) for x in (-20,-10,0,10,20)]
deps=bpy.context.evaluated_depsgraph_get();bases=[]
for i,(x,z) in enumerate(placements):
    hit,position,normal,face,obj,matrix=s.ray_cast(deps,Vector((x,-z,60)),Vector((0,0,-1)),distance=90)
    assert hit,(i,x,z,obj.name if obj else None)
    bases.append(position.z)
for i,((x,z),base) in enumerate(zip(placements,bases)):
    scale=.87+(i%4)*.09;name='Frost evergreen %02d'%i
    trunk(name+' / trunk',x,z,base-.08,2.2*scale,.22*scale)
    for tier in range(3):
        bottom=base+(.95+tier*.95)*scale;radius=(1.42-tier*.19)*scale;height=(2.65-tier*.16)*scale
        cone(name+' / needles %d'%tier,x,z,bottom,radius,height,needle if tier!=1 else needle2,i*3+tier)
        cone(name+' / snow %d'%tier,x,z,bottom+.56*scale,radius*.80,height-.50*scale,snow,i*3+tier+.3)
# Avoid altering the existing traversable square, path, bridge or input geometry.
for obj in created:
    for vertex in obj.data.vertices:
        p=obj.matrix_world@vertex.co
        assert abs(p.x)>28 or abs(p.y)>28,(obj.name,tuple(p))
terrain=[o for o in s.objects if o.type=='MESH']
s['regeneration_command']='npm run models:frontier-frost-forest'
s['concept']=str(CONCEPT.relative_to(R));s['source_model']=str(SOURCE.relative_to(R))
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False
s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100;s.render.film_transparent=True
cam=s.camera;cam.location=(0,-68,72);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=114
bpy.context.preferences.filepaths.save_version=0
blend=A/(NAME+'.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend))
s.render.filepath=str(O/(NAME+'.png'));bpy.ops.render.render(write_still=True)
cam.location=(-17,-27,19);cam.rotation_euler=(Vector((-31,14,7))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=35
s.render.filepath=str(O/(NAME+'-detail.png'));bpy.ops.render.render(write_still=True)
# Pack opaque materials into vertex colors and one mesh, as in the parent terrain.
bpy.ops.object.select_all(action='DESELECT')
for obj in terrain:obj.select_set(True)
bpy.context.view_layer.objects.active=terrain[0];bpy.ops.object.join();obj=bpy.context.object;obj.name=NAME
attr=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for polygon in obj.data.polygons:
    color=obj.data.materials[polygon.material_index].diffuse_color
    for index in polygon.loop_indices:attr.data[index].color=color
packed=material('Packed frost forest paint','#ffffff');node=packed.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Color'
packed.node_tree.links.new(node.outputs['Color'],packed.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
obj.data.materials.clear();obj.data.materials.append(packed)
for polygon in obj.data.polygons:polygon.material_index=0
bpy.ops.export_scene.gltf(filepath=str(O/(NAME+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(O/(NAME+'.png')),'-c:v','libwebp','-quality','90',str(O/(NAME+'.webp'))],check=True)
files=[Path(__file__),CONCEPT,SOURCE,blend,*[O/(NAME+ext) for ext in ['.glb','.png','-detail.png','.webp']]]
metadata={'command':'npm run models:frontier-frost-forest','source':str(SOURCE.relative_to(R)),'concept':str(CONCEPT.relative_to(R)),
 'tree_count':len(placements),'new_meshes':len(created),'editable_meshes':len(terrain),'runtime_surfaces':1,'playable_boundary':28,
 'placements':[{'x':x,'z':z,'base_height':h} for (x,z),h in zip(placements,bases)],
 'camera':{'size':[960,540],'location':[0,-68,72],'ortho_scale':114},
 'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(O/(NAME+'.json')).write_text(json.dumps(metadata,indent=2)+'\n')
print('FROST_FOREST_COMPLETE',len(placements),'trees',len(created),'new meshes',flush=True)
