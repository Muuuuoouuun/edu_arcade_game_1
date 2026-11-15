"""Author a planted club windup, contact and recovery on the existing wooden soldier.
Run npm run models:frontier-wood-strike. Blender 4.3+, ffmpeg. No image planes.
"""
import bpy, bmesh, hashlib, json, subprocess, struct, math
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/wood-soldier.blend'
OUT=ROOT/'public/defense/models';ART=ROOT/'art-source/defense/frontier-wood-strike';ART.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
col=bpy.data.collections['Wood soldier / editable parts'];scene.frame_set(1);bpy.context.view_layer.update()
original=list(col.objects);names={o:o.name for o in original};animated=[o for o in original if o.animation_data and o.animation_data.action]
# Keep the authored planted legs in world space while the torso and carrying arm commit to a club swing.
base={o:(o.location.copy(),o.rotation_euler.copy()) for o in animated}
legs=[bpy.data.objects['leg-near'],bpy.data.objects['leg-far']];planted={o:o.matrix_world.copy() for o in legs}
for o in animated:o.animation_data_clear()
root=bpy.data.objects['wood-root'];head=bpy.data.objects['head'];near=bpy.data.objects['arm-near'];far=bpy.data.objects['arm-far'];grip=bpy.data.objects['club-grip'];leaf=bpy.data.objects['leaf-back']
# seconds: torso pitch, carrying shoulder, wrist, free shoulder, head pitch, leaf lag.
keys=[(0,5,base[near][1].y*180/math.pi,base[grip][1].y*180/math.pi,base[far][1].y*180/math.pi,base[head][1].y*180/math.pi,0),
 (.18,-6,150,-105,32,8,-8),(.28,12,-70,150,-20,-12,7),(.34,15,-78,160,-26,-9,13),
 (.46,4,-36,65,-12,-2,-5),(.60,5,base[near][1].y*180/math.pi,base[grip][1].y*180/math.pi,base[far][1].y*180/math.pi,base[head][1].y*180/math.pi,0)]
def pose(t):
 a,b=next(((a,b) for a,b in zip(keys,keys[1:]) if a[0]<=t<=b[0]),(keys[-2],keys[-1]));u=(t-a[0])/(b[0]-a[0]);u=u*u*(3-2*u);v=[a[i]+(b[i]-a[i])*u for i in range(1,7)]
 for o,(loc,rot) in base.items():o.location=loc;o.rotation_euler=rot
 root.rotation_euler.y=math.radians(v[0]);near.rotation_euler.y=math.radians(v[1]);grip.rotation_euler.y=math.radians(v[2]);far.rotation_euler.y=math.radians(v[3]);head.rotation_euler.y=math.radians(v[4]);leaf.rotation_euler.x+=math.radians(v[5])
 bpy.context.view_layer.update()
 for leg in legs:leg.matrix_world=planted[leg]
 bpy.context.view_layer.update()
scene.render.fps=100;scene.frame_start=1;scene.frame_end=61
for frame in range(1,62):
 pose((frame-1)/100)
 for o in animated:
  o.keyframe_insert(data_path='location',frame=frame);o.keyframe_insert(data_path='rotation_euler',frame=frame)
for o in animated:
 o.animation_data.action.name='Wood strike / '+o.name
 for curve in o.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(1);bpy.context.view_layer.update()
# One common camera for every attack pose, including overhead anticipation.
scene.camera.data.ortho_scale=8.0
scene.camera.data.shift_y=0
scene.camera.rotation_euler=(Vector((.4,0,2.8))-scene.camera.location).to_track_quat('-Z','Y').to_euler()

assert len(animated)==8,len(animated)
scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=scene.render.resolution_y=384
meta={'generator':'tools/blender/build_frontier_wood_strike.py','regeneration_command':'npm run models:frontier-wood-strike','base_source':str(SOURCE.relative_to(ROOT)),'runtime_scale':.52,'native_forward_gltf':[1,0,0],'runtime_heading_offset':-1.5707963267948966,'stride_world':1.5,'clip':'frontier-wood-strike','duration':.60,'contact':.28,'fps':100,'camera':{'resolution':[384,384],'position':list(scene.camera.location),'ortho_scale':scene.camera.data.ortho_scale},'poses':[1,19,29,35,47,61],'files':[]}
for i,frame in enumerate(meta['poses']):
 scene.frame_set(frame);scene.render.filepath=str(ART/f'strike-{i}.png');bpy.ops.render.render(write_still=True)
scene.frame_set(1);bpy.context.view_layer.update();scene['regeneration_command']=meta['regeneration_command'];bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art-source/defense/frontier-wood-strike.blend'))
# Replace each rigid surface attachment with the nearest animated ancestor, retaining local animation contracts.
matrices={o:o.matrix_world.copy() for o in original};graph=bpy.context.evaluated_depsgraph_get()
export=bpy.data.collections.new('Frontier wood runtime');scene.collection.children.link(export);nodes={}
for o in original:o.name=names[o]+'__editable'
for o in animated:
 c=bpy.data.objects.new(names[o],None);export.objects.link(c);c.animation_data_create();c.animation_data.action=o.animation_data.action.copy();nodes[o]=c
for o,c in nodes.items():
 assert o.parent is None or o.parent in nodes,('Animated node has static parent',names[o])
 c.parent=nodes.get(o.parent);c.matrix_basis=o.matrix_basis.copy()
bpy.context.view_layer.update()
paint=bpy.data.materials.new('Frontier wood vertex paint');paint.use_nodes=True;bs=paint.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.85
vertex=paint.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Color';paint.node_tree.links.new(vertex.outputs['Color'],bs.inputs['Base Color'])
batches={}
for o in original:
 if o.type!='MESH':continue
 owner=o if o in nodes else o.parent
 while owner not in nodes:owner=owner.parent
 mesh=bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph);c=bpy.data.objects.new('surface-'+names[o],mesh);export.objects.link(c);c.parent=nodes[owner];c.matrix_world=matrices[o]
 bpy.ops.object.select_all(action='DESELECT');c.select_set(True);bpy.context.view_layer.objects.active=c
 # Preserve octagonal body/feet/caps and big features; reduce only dense decorative surfaces.
 if len(mesh.polygons)>48:
  mod=c.modifiers.new('Small battlefield silhouette','DECIMATE');mod.ratio=.38;bpy.ops.object.modifier_apply(modifier=mod.name)
 detail=c.data.attributes.new(name='frontier_micro_detail',type='INT',domain='FACE')
 for face in c.data.polygons:detail.data[face.index].value=int('growth-ring' in names[o] and not names[o].startswith('foot-'))
 colors=c.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for face in c.data.polygons:
  mat=c.data.materials[face.material_index];node=mat.node_tree.nodes.get('Principled BSDF');color=tuple(node.inputs['Base Color'].default_value)
  for i in face.loop_indices:colors.data[i].color=color
 c.data.materials.clear();c.data.materials.append(paint)
 for face in c.data.polygons:face.material_index=0
 batches.setdefault(owner,[]).append(c)
bpy.context.view_layer.update()
for parent,objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name='surface-'+names[parent]
meshes=[o for o in export.objects if o.type=='MESH'];triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
meta['runtime']={'meshes':len(meshes),'triangles':triangles,'materials':1,'editable_meshes':sum(o.type=='MESH' for o in original)}
bpy.ops.object.select_all(action='DESELECT')
for o in export.objects:o.select_set(True)
bpy.context.view_layer.objects.active=nodes[next(o for o in nodes if names[o]=='wood-root')]
bpy.ops.export_scene.gltf(filepath=str(OUT/'frontier-wood-strike.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frontier-wood-strike',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
# The workshop keeps ring detail; tiny battlefield units use a second geometry LOD.
for o in meshes:
 # Interior grain rings are subpixel at battlefield scale; preserve all soles and the larger root bands.
 bm=bmesh.new();bm.from_mesh(o.data);layer=bm.faces.layers.int.get('frontier_micro_detail')
 if layer:
  bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[layer]],context='FACES')
  bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 bm.to_mesh(o.data);bm.free()
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 if len(o.data.polygons)>40 and not o.name.startswith('surface-leg-'):
  mod=o.modifiers.new('Battlefield geometry budget','DECIMATE');mod.ratio=.22;bpy.ops.object.modifier_apply(modifier=mod.name)
low=0
for o in meshes:o.data.calc_loop_triangles();low+=len(o.data.loop_triangles)
meta['runtime_game']={'meshes':len(meshes),'triangles':low,'materials':1,'file':'frontier-wood-strike-game.glb'}
bpy.ops.object.select_all(action='DESELECT')
for o in export.objects:o.select_set(True)
bpy.context.view_layer.objects.active=nodes[next(o for o in nodes if names[o]=='wood-root')]
bpy.ops.export_scene.gltf(filepath=str(OUT/'frontier-wood-strike-game.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='frontier-wood-strike',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
# glTF drops degenerate faces after simplification; report exported triangles, not just Blender's count.
for name,record in [('frontier-wood-strike.glb','runtime'),('frontier-wood-strike-game.glb','runtime_game')]:
 raw=(OUT/name).read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);meta[record]['blender_triangles']=meta[record]['triangles'];meta[record]['triangles']=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
(OUT/'frontier-wood-strike.png').write_bytes((ART/'strike-0.png').read_bytes())
inputs=sum((['-i',str(ART/f'strike-{i}.png')] for i in range(6)),[])
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=6','-frames:v','1','-c:v','libwebp','-quality','88',str(OUT/'frontier-wood-strike-atlas.webp')],check=True)
files=[SOURCE,ROOT/meta['generator'],ROOT/'art-source/defense/frontier-wood-strike.blend',*sorted(ART.glob('*.png')),OUT/'frontier-wood-strike.glb',OUT/'frontier-wood-strike-game.glb',OUT/'frontier-wood-strike.png',OUT/'frontier-wood-strike-atlas.webp']
for p in files:meta['files'].append({'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'frontier-wood-strike.json').write_text(json.dumps(meta,indent=2)+'\n');print('COMPLETE',meta['runtime'],flush=True)
