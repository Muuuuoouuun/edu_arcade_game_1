"""Derive a lightweight articulated frontier ballista from the authored siege weapon.
Editable source keeps the original surfaces/materials; export batches vertex-painted
surfaces by joint. Recoil and muzzle are authored here, never inferred from a PNG.
Run npm run models:frontier-ballista (Blender 4.3+, ffmpeg).
"""
import bpy, hashlib, json, math, subprocess
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/piercing-ballista-action.blend'
OUT=ROOT/'public/defense/models'; ART=ROOT/'art-source/defense/frontier-ballista'
ART.mkdir(exist_ok=True); bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene; col=bpy.data.collections['piercing-ballista']; root=bpy.data.objects['piercing-ballista']; aim=bpy.data.objects['aim-platform']
scene.frame_set(1); bpy.context.view_layer.update()
baseline={o:o.matrix_world.copy() for o in col.objects}
carriage=bpy.data.objects.new('recoil-carriage',None); col.objects.link(carriage); carriage.parent=aim; bpy.context.view_layer.update()
for child in list(aim.children):
 if child==carriage:continue
 matrix=child.matrix_world.copy();child.parent=carriage;child.matrix_world=matrix
bpy.context.view_layer.update()
for o,m in baseline.items():
 assert max(abs(o.matrix_world[r][c]-m[r][c]) for r in range(4) for c in range(4))<1e-5,('Reparent changed neutral pose',o.name)
socket=bpy.data.objects.new('muzzle-socket',None);col.objects.link(socket);socket.parent=carriage;socket.location=(0,-2.05,.70)
# Root's original 1.6 scale is retained; runtime uniform scale .65 is applied outside it.
for frame,y in [(1,0),(9,0),(13,.12),(18,.16),(25,.06),(37,0),(49,0)]:
 carriage.location.y=y;carriage.keyframe_insert(data_path='location',frame=frame)
for curve in carriage.animation_data.action.fcurves:
 for key in curve.keyframe_points:key.interpolation='LINEAR'
carriage.animation_data.action.name='Frontier carriage recoil'
scene.frame_start=1;scene.frame_end=49;scene.render.fps=120
scene.render.resolution_x=scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.frame_set(1);bpy.context.view_layer.update();muzzle=root.matrix_world.inverted()@socket.matrix_world.translation
meta={'generator':'tools/blender/build_frontier_ballista.py','regeneration_command':'npm run models:frontier-ballista','base_source':str(SOURCE.relative_to(ROOT)),'base_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'runtime_scale':.65,'muzzle_local_gltf':[muzzle.x,muzzle.z,-muzzle.y],'muzzle_world_offset':[0,2.6208,2.0072],'animation':{'clip':'frontier-ballista-release','duration':.4,'release':.1,'fps':120},'camera':{'resolution':[512,512],'ortho_scale':scene.camera.data.ortho_scale,'position':list(scene.camera.location)},'files':[]}
for name,frame in [('ready',1),('release',13),('recoil',18),('reload',37)]:
 scene.frame_set(frame);scene.render.filepath=str(ART/(name+'.png'));bpy.ops.render.render(write_still=True)
 print('RENDERED',name,flush=True)
scene.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
scene['regeneration_command']=meta['regeneration_command'];bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art-source/defense/frontier-ballista.blend'))
# Clone evaluated surfaces with original joint transforms, retaining editable sources.
original=list(col.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original};graph=bpy.context.evaluated_depsgraph_get()
export=bpy.data.collections.new('Frontier runtime');scene.collection.children.link(export);clones={}
for o in original:o.name=names[o]+'__editable'
paint=bpy.data.materials.new('Frontier vertex paint');paint.diffuse_color=(1,1,1,1);paint.use_nodes=True
bs=paint.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=.2;bs.inputs['Roughness'].default_value=.65
vertex=paint.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Color';paint.node_tree.links.new(vertex.outputs['Color'],bs.inputs['Base Color'])
for o in original:
 c=bpy.data.objects.new(names[o],bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph)) if o.type=='MESH' else o.copy();c.name=names[o];export.objects.link(c);clones[o]=c
for o,c in clones.items():c.parent=clones.get(o.parent);c.matrix_world=matrices[o]
bpy.context.view_layer.update()
for o in list(export.objects):
 if o.type!='MESH':continue
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 if len(o.data.polygons)>30:
  mod=o.modifiers.new('Runtime silhouette reduction','DECIMATE');mod.ratio=.42;bpy.ops.object.modifier_apply(modifier=mod.name)
 colors=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for face in o.data.polygons:
  mat=o.data.materials[face.material_index];bsdf=mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None;color=tuple(bsdf.inputs['Base Color'].default_value) if bsdf else tuple(mat.diffuse_color)
  for i in face.loop_indices:colors.data[i].color=color
 o.data.materials.clear();o.data.materials.append(paint)
 for face in o.data.polygons:face.material_index=0
batches={}
for o in list(export.objects):
 if o.type=='MESH':batches.setdefault(o.parent,[]).append(o)
for parent,objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name='surface-'+parent.name
bpy.ops.object.select_all(action='DESELECT')
for o in export.objects:o.select_set(True)
bpy.context.view_layer.objects.active=clones[root]
meshes=[o for o in export.objects if o.type=='MESH'];triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
meta['runtime']={'meshes':len(meshes),'triangles':triangles,'materials':1,'editable_meshes':sum(o.type=='MESH' for o in original)}
bpy.ops.export_scene.gltf(filepath=str(OUT/'frontier-ballista.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frontier-ballista-release',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
# Small battlefield units use a second geometric LOD, keeping the same joints/socket/clip.
for o in meshes:
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 if len(o.data.polygons)>20:
  mod=o.modifiers.new('Battlefield LOD','DECIMATE');mod.ratio=.35;bpy.ops.object.modifier_apply(modifier=mod.name)
low_triangles=0
for o in meshes:o.data.calc_loop_triangles();low_triangles+=len(o.data.loop_triangles)
meta['runtime_game']={'meshes':len(meshes),'triangles':low_triangles,'materials':1,'file':'frontier-ballista-game.glb'}
bpy.ops.object.select_all(action='DESELECT')
for o in export.objects:o.select_set(True)
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/'frontier-ballista-game.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frontier-ballista-release',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
(OUT/'frontier-ballista.png').write_bytes((ART/'ready.png').read_bytes())
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(ART/'ready.png'),'-c:v','libwebp','-quality','90',str(OUT/'frontier-ballista.webp')],check=True)
inputs=sum((['-i',str(ART/(name+'.png'))] for name in ['ready','release','recoil','reload']),[])
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=4,scale=1024:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90',str(OUT/'frontier-ballista-atlas.webp')],check=True)
files=[SOURCE,ROOT/meta['generator'],ROOT/'art-source/defense/frontier-ballista.blend',*ART.glob('*.png'),*[OUT/('frontier-ballista'+ext) for ext in ['.glb','-game.glb','.png','.webp','-atlas.webp']]]
for p in files:meta['files'].append({'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'frontier-ballista.json').write_text(json.dumps(meta,indent=2)+'\n');print('COMPLETE',meta['runtime'],flush=True)
