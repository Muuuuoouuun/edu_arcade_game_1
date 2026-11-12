"""Deliver one actual bridge mesh plus aligned transparent foreground and preview."""
import hashlib,json,subprocess
import bpy
from mathutils import Vector

def export_bridge(scene,parts,fronts,root,out,source):
    front=[o for o in parts if o in fronts]
    others=[o for o in list(scene.objects) if o.type=='MESH' and o not in parts]
    for obj in others:bpy.data.objects.remove(obj,do_unlink=True)
    for obj in parts:obj.hide_render=False
    scene['regeneration_command']='npm run models:bridge'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source/'forest-bridge.blend'))
    render=source/'forest-bridge.png';scene.render.filepath=str(render);bpy.ops.render.render(write_still=True)
    preview=root/'public/defense/models/forest-bridge.png'
    # Same 2px per logical unit camera, same crop for all layers; no recentering.
    crop='crop=328:200:1192:768'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(render),'-vf',crop,str(preview)],check=True)
    for obj in parts:obj.hide_render=obj not in front
    foreground=source/'forest-bridge-front.png';scene.render.filepath=str(foreground);bpy.ops.render.render(write_still=True)
    dst=out/'forest-bridge-front.webp'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(foreground),'-vf',crop,'-c:v','libwebp','-quality','92',str(dst)],check=True)
    for obj in parts:obj.hide_render=False
    bpy.ops.object.select_all(action='DESELECT')
    # Export evaluated surfaces; retain editable bevels and original world-space source.
    exports=[];runtime_materials={};graph=bpy.context.evaluated_depsgraph_get()
    for obj in parts:
        clone=bpy.data.objects.new(obj.name,bpy.data.meshes.new_from_object(obj.evaluated_get(graph),depsgraph=graph));scene.collection.objects.link(clone)
        for index,material in enumerate(list(clone.data.materials)):
            if material not in runtime_materials:
                runtime=material.copy();runtime.name=material.name+' / runtime PBR';node=runtime.node_tree.nodes.get('Principled BSDF')
                for socket in ('Base Color','Normal'):
                    for link in list(node.inputs[socket].links):runtime.node_tree.links.remove(link)
                node.inputs['Base Color'].default_value=material.diffuse_color;runtime_materials[material]=runtime
            clone.data.materials[index]=runtime_materials[material]
        clone['bridge_layer']=obj.get('bridge_layer');clone.matrix_world=obj.matrix_world.copy();clone.location-=Vector((228,(300-430-12)/.8,-10));clone.select_set(True);exports.append(clone)
    # Static architecture can share draw calls; source parts remain independently editable.
    batches={}
    for obj in exports:batches.setdefault((obj.get('bridge_layer'),tuple(m.name for m in obj.data.materials)),[]).append(obj)
    exports=[]
    for index,objects in enumerate(batches.values()):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        objects[0].name=f'Bridge surface {index:02}';exports.append(objects[0])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in exports:obj.select_set(True)
    runtime_count=len(exports)
    glb=root/'public/defense/models/forest-bridge.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
    for obj in exports:bpy.data.objects.remove(obj,do_unlink=True)
    metadata={'source':'art-source/defense/forest-bridge.blend','regeneration_command':'npm run models:bridge','reference':'art-source/defense/concepts/2026-11-06/verdant-heart.png','camera':{'location':[0,-900,1200],'target':[0,0,0],'orthographic_scale':900,'render':[1800,1200]},'placement':{'x':596,'y_offset':-46,'width':164,'height':100,'sort_y_offset':25},'walkway':{'x_range':[604,752],'center_y':430,'top_z':20},'glb_materials':'PBR base colors and roughness; procedural grain is preserved in Blender and baked images','front_meshes':len(front),'meshes':len(parts),'runtime_meshes':runtime_count,'files':[]}
    for file in [dst,glb,preview]:metadata['files'].append({'file':str(file.relative_to(root/'public')),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    (root/'public/defense/models/forest-bridge.json').write_text(json.dumps(metadata,indent=2)+'\n')
    return metadata
