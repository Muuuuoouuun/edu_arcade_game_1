"""Base magic tower Lv.1: fixed pale masonry, blue floating crystal and moving gold focusing ring.
Regenerate with npm run models:base-magic-action (Blender 4.3+, ffmpeg).
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=32);p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
model_id='lightning-tower';asset_id='base-magic-action';atlas_name='base-magic-action-atlas.webp';command='npm run models:base-magic-action';display_scale=1.16;FRAMES=ROOT/'art-source/defense'/asset_id
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections[model_id];root=bpy.data.objects[model_id];root.location=(0,0,0)
root.name='base-magic'
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False
# Base tower: pale stone and one blue crystal assembly, without the upgraded storm rod or fire claws.
for obj in list(col.objects):
 if obj.name.startswith(('Storm /','Crown / bronze crystal claw','Keep / glowing lightning window')):bpy.data.objects.remove(obj,do_unlink=True)
 elif obj.type=='MESH' and obj.name.startswith(('Keep / masonry course','Keep / reinforced buttress','Keep / basalt arch pilaster')):
  for slot in obj.material_slots:
   if slot.material and slot.material.name=='Stone / ash basalt':slot.material=bpy.data.materials['Stone / warm limestone']
   elif slot.material and slot.material.name=='Stone / basalt variation':slot.material=bpy.data.materials['Stone / pale chipped edges']
# Two blue cloth pennants retain the base tower's recognizable silhouette.
for number,angle in enumerate((-math.pi/7,-math.pi*.48),1):
 radial=Vector((math.cos(angle),math.sin(angle),0));tangent=Vector((-math.sin(angle),math.cos(angle),0));center=radial*1.055
 points=[center-tangent*.20+Vector((0,0,1.37)),center+tangent*.20+Vector((0,0,1.37)),center+tangent*.20+Vector((0,0,.65)),center+Vector((0,0,.52)),center-tangent*.20+Vector((0,0,.65))]
 mesh=bpy.data.meshes.new(f'Pennant {number}');mesh.from_pydata([tuple(v) for v in points],[],[(0,1,2,3,4)]);mesh.update()
 flag=bpy.data.objects.new(f'Base / blue pennant {number}',mesh);col.objects.link(flag);flag.parent=root;flag.data.materials.append(bpy.data.materials['Cloth / river blue banner'])
 solid=flag.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.025
camera=scene.camera;camera.data.ortho_scale=7.5;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples
bpy.context.view_layer.update();core=next(o for o in col.objects if o.get('animation_role')=='fire-core');core.name='base-crystal';del core['animation_role'];rest=core.location.copy()
# A true gold focusing ring and two marker beads rotate/tilt with one joint.
focus=bpy.data.objects.new('focus-ring',None);col.objects.link(focus);focus.parent=root;focus.location=(0,0,2.65);bpy.context.view_layer.update()
def attach(obj):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 col.objects.link(obj);obj.matrix_world=root.matrix_world@obj.matrix_world;bpy.context.view_layer.update();world=obj.matrix_world.copy();obj.parent=focus;obj.matrix_world=world
bpy.ops.mesh.primitive_torus_add(major_radius=1.15,minor_radius=.055,major_segments=48,minor_segments=8,location=(0,0,2.65))
ring=bpy.context.object;ring.name='Focus / gold ring';ring.data.materials.append(bpy.data.materials['Metal / aged gold brass']);attach(ring)
for x in [-1.15,1.15]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.11,location=(x,0,2.65))
 bead=bpy.context.object;bead.name='Focus / orbit bead';bead.data.materials.append(bpy.data.materials['Metal / polished brass edges']);attach(bead)
bpy.context.view_layer.update()
shard=next(o for o in col.objects if o.parent==core and o.name.startswith('Crystal / main'))
tip=max((shard.matrix_world@v.co for v in shard.data.vertices),key=lambda v:v.z);socket=core.matrix_world.inverted()@tip
# Ready, gather, charged, release, rebound, settle: the crystal and ring move as 3D objects.
poses=[('rest',0,1,0,0),('gather',-.06,.98,.04,-.10),('charged',-.15,.94,.09,-.22),('release',.12,1.04,-.12,.26),('rebound',.06,1.02,-.06,.14),('settle',-.02,.99,-.02,.04)]
def pose(index):
 _,lift,scale,tilt,yaw=poses[index];core.location=rest+Vector((0,0,lift));core.scale=(scale,scale,scale);focus.rotation_euler=(tilt,0,yaw);bpy.context.view_layer.update()
def project(v):
 q=world_to_camera_view(scene,camera,Vector(v));return [q.x*640,(1-q.y)*640]
fixed=[o for o in col.objects if o.type=='MESH' and o.parent==root];fixed_matrices={o:o.matrix_world.copy() for o in fixed}
manifest={'source':f'art-source/defense/{asset_id}.blend','level':1,'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_base_magic_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','frame':{'width':640,'height':640,'ground':project((0,0,0)),'crop':[32,24,576,576],'orthographic_scale':7.5},'delivery_frame':{'width':256,'height':256,'crop':[12.8,9.6,230.4,230.4]},'clip':'base-magic-release','hit_at':.15,'duration':.39,'poses':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
from mathutils.bvhtree import BVHTree
def world_tree(obj,graph):
 ev=obj.evaluated_get(graph);mesh=ev.to_mesh();result=BVHTree.FromPolygons([ev.matrix_world@v.co for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons]);ev.to_mesh_clear();return result
for index,(name,*_) in enumerate(poses):
 pose(index);graph=bpy.context.evaluated_depsgraph_get();points=[]
 ring_tree=world_tree(ring,graph)
 for obj in col.objects:
  if obj.type=='MESH' and obj.parent==core:
   assert not ring_tree.overlap(world_tree(obj,graph)),('ring intersects crystal',name,obj.name)
 for obj in col.objects:
  if obj.type=='MESH':
   ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@v.co) for v in ev.data.vertices)
 bounds=[min(v[0] for v in points),min(v[1] for v in points),max(v[0] for v in points),max(v[1] for v in points)]
 assert bounds[0]>32 and bounds[1]>32 and bounds[2]<608 and bounds[3]<600,(name,bounds)
 drift=max(max(abs(obj.matrix_world[r][c]-matrix[r][c]) for r in range(4) for c in range(4)) for obj,matrix in fixed_matrices.items());assert drift<1e-6
 manifest['poses'].append({'name':name,'socket':project(core.matrix_world@socket),'bounds':bounds,'fixed_meshes':len(fixed),'foundation_drift':drift})
 if not args.check:
  scene.render.filepath=str(FRAMES/f'{name}.png');bpy.ops.render.render(write_still=True)
 print('POSE_DONE',index,name,flush=True)
if args.check:print('CHECK_PASS');sys.exit(0)
inputs=sum((['-i',str(FRAMES/f'{p[0]}.png')] for p in poses),[]);atlas=OUT/atlas_name
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=6,scale=1536:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(atlas)],check=True)
scene.render.fps=100;scene.frame_start=1;scene.frame_end=40
for frame,index in [(1,0),(6,1),(16,2),(17,3),(24,4),(32,5),(40,0)]:
 pose(index)
 for obj in (core,focus):
  for prop in (['location','scale'] if obj==core else ['rotation_euler']):obj.keyframe_insert(data_path=prop,frame=frame)
for obj in (core,focus):
 obj.animation_data.action.name=obj.name+' charge and release'
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
# The full animation, including interpolated transitions, must not intersect the crystal.
for frame in range(1,41):
 scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();ring_tree=world_tree(ring,graph)
 for obj in col.objects:
  if obj.type=='MESH' and obj.parent==core:assert not ring_tree.overlap(world_tree(obj,graph)),('animated ring intersects crystal',frame,obj.name)
manifest['clearance']={'sampled_frames':40,'ring_crystal_crossings':0}
scene.frame_set(1);bpy.context.view_layer.update()
# Batch evaluated surfaces under their actual joints; keep source parts editable.
original=list(col.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original};graph=bpy.context.evaluated_depsgraph_get();export=bpy.data.collections.new('Runtime temporary');scene.collection.children.link(export);clones={}
for obj in original:obj.name=names[obj]+'__editable'
for obj in original:
 clone=bpy.data.objects.new(names[obj],bpy.data.meshes.new_from_object(obj.evaluated_get(graph),depsgraph=graph)) if obj.type=='MESH' else obj.copy();clone.name=names[obj];export.objects.link(clone);clones[obj]=clone
for obj,clone in clones.items():clone.parent=clones.get(obj.parent);clone.matrix_world=matrices[obj]
bpy.context.view_layer.update();batches={}
for obj in clones.values():
 if obj.type=='MESH':batches.setdefault((obj.parent.name,tuple(m.name for m in obj.data.materials)),[]).append(obj)
for i,objects in enumerate(batches.values()):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name=f'Fire surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='base-magic-release',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);pose(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/'rest.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png',atlas_name]:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest();manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
coords=[[round((p['socket'][0]-320)/576*display_scale,6),round(.1+(p['socket'][1]-600)/576*display_scale,6)] for p in manifest['poses']]
socket_file='baseMagicSockets.ts';constant='BASE_MAGIC_SOCKETS'
(ROOT/'src/games/defense'/socket_file).write_text('// Generated by tools/blender/build_base_magic_action.py; offsets per tower display size.\nexport const '+constant+' = '+json.dumps(coords)+' as const;\n')
print('BASE_MAGIC_ACTION_COMPLETE',flush=True)
