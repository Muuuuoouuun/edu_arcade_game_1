"""Lightning Lv.2: fixed keep and rod, hinged conductors and a focusing ring.
Regenerate with npm run models:lightning-action (Blender 4.3+, ffmpeg).
"""
import argparse, hashlib, json, math, shutil, struct, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=48);p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
model_id='lightning-tower';asset_id=model_id+'-action';atlas_name='lightning-action-atlas.webp';command='npm run models:lightning-action';display_scale=1.16;FRAMES=ROOT/'art-source/defense'/asset_id
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections[model_id];root=bpy.data.objects[model_id];root.location=(0,0,0)
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False;camera=scene.camera;camera.data.ortho_scale=7.5;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples
# Preserve the central crystal and lightning rod. Only the two side conductors
# hinge around visible bearings; their brass feet move with the crystal.
bpy.context.view_layer.update()
core=next(o for o in col.objects if o.get('animation_role')=='fire-core');core.name='fixed-storm-crystal';core['animation_role']='fixed-crystal';core['animation_hint']='Central crystal and rod remain fixed during conductor release.'
conductors=[]
def joint(name,location):
 obj=bpy.data.objects.new(name,None);col.objects.link(obj);obj.parent=root;obj.location=location;obj.rotation_mode='XYZ';bpy.context.view_layer.update();return obj
def reparent(obj,parent):
 world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
brass=bpy.data.materials['Metal / aged gold brass'];steel=bpy.data.materials['Metal / forged steel blade']
def cylinder(name,location,radius,depth,material,parent,rotation=(0,0,0)):
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=depth,location=location,rotation=rotation);obj=bpy.context.object;obj.name=name
 for c in list(obj.users_collection):c.objects.unlink(obj)
 col.objects.link(obj);obj.data.materials.append(material);bevel=obj.modifiers.new('Soft machined edge','BEVEL');bevel.width=.015;bevel.segments=2
 obj.matrix_world=root.matrix_world@obj.matrix_world;bpy.context.view_layer.update();reparent(obj,parent);return obj
for side in [-1,1]:
 pivot=joint('conductor-left' if side<0 else 'conductor-right',(side*.69,.18,1.94));pivot['animation_role']='hinged-conductor'
 for obj in list(col.objects):
  if obj.name.startswith(('Crystal / orbiting ember shard','Crystal / shard foot')) and sum((obj.matrix_world@Vector(corner)).x for corner in obj.bound_box)*side>0:reparent(obj,pivot)
 # A fixed bearing and moving collar make the mechanical attachment readable.
 cylinder('Storm / fixed conductor bearing',(side*.69,.18,1.94),.15,.42,steel,root,(math.pi/2,0,0))
 cylinder('Storm / conductor brass collar',(side*.69,.18,2.12),.255,.16,brass,pivot)
 conductors.append((pivot,side))
ring=next(o for o in col.objects if o.name.startswith('Storm / arc ring'))
focus=joint('focus-ring',(0,0,2.45));focus['animation_role']='focus-ring';reparent(ring,focus)
# A metal carrier supports the luminous ring; this is geometry, not a billboard.
bpy.ops.mesh.primitive_torus_add(major_radius=.86,minor_radius=.055,major_segments=48,minor_segments=8,location=(0,0,2.45),rotation=tuple(ring.rotation_euler))
carrier=bpy.context.object;carrier.name='Storm / steel focusing carrier'
for c in list(carrier.users_collection):c.objects.unlink(carrier)
col.objects.link(carrier);carrier.data.materials.append(steel);carrier.matrix_world=root.matrix_world@carrier.matrix_world;bpy.context.view_layer.update();reparent(carrier,focus)
# Keep the luminous conductor visible on the outside of the steel rim.
ring.scale=(1.075,1.075,1.075)
animated=[j for j,_ in conductors]+[focus]
shards=[next(o for o in col.objects if o.parent==joint and o.name.startswith('Crystal / orbiting')) for joint,_ in conductors]
assert len(shards)==2
def center(obj):return sum((obj.matrix_world@Vector(v) for v in obj.bound_box),Vector())/8
poses=[('rest',.06,0,0),('gather',-.07,-.22,-.10),('charged',-.14,-.50,-.20),('release',.72,.55,.34),('rebound',.42,.29,.18),('settle',.17,.09,.05)]
def pose(index):
 _,opening,tilt,yaw=poses[index]
 for pivot,side in conductors:pivot.rotation_euler=(0,side*opening,0)
 focus.rotation_euler=(tilt,0,yaw);bpy.context.view_layer.update()
def project(v):
 q=world_to_camera_view(scene,camera,Vector(v));return [q.x*640,(1-q.y)*640]
# Include fixed core descendants, not just direct root children, in drift checks.
fixed=[o for o in col.objects if o.type=='MESH' and o.parent in (root,core)];fixed_matrices={o:o.matrix_world.copy() for o in fixed}
manifest={'source':f'art-source/defense/{asset_id}.blend','level':2,'root_scale':list(root.scale),'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_lightning_tower_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','frame':{'width':640,'height':640,'ground':project((0,0,0)),'crop':[32,24,576,576],'orthographic_scale':7.5},'delivery_frame':{'width':384,'height':384,'crop':[19.2,14.4,345.6,345.6]},'clip':'lightning-conductor-release','hit_at':.15,'duration':.39,'poses':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
for index,(name,*_) in enumerate(poses):
 pose(index);graph=bpy.context.evaluated_depsgraph_get();points=[]
 for obj in col.objects:
  if obj.type=='MESH':
   ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@v.co) for v in ev.data.vertices)
 bounds=[min(v[0] for v in points),min(v[1] for v in points),max(v[0] for v in points),max(v[1] for v in points)]
 assert bounds[0]>32 and bounds[1]>32 and bounds[2]<608 and bounds[3]<600,(name,bounds)
 drift=max(max(abs(obj.matrix_world[r][c]-matrix[r][c]) for r in range(4) for c in range(4)) for obj,matrix in fixed_matrices.items());assert drift<1e-6
 manifest['poses'].append({'name':name,'socket':project(root.matrix_world@Vector((0,0,3.82))),'bounds':bounds,'fixed_meshes':len(fixed),'foundation_drift':drift,'conductor_centers':[list(center(o)) for o in shards],'conductor_angles':[j.rotation_euler.y for j,_ in conductors],'ring_rotation':list(focus.rotation_euler)})
 if not args.check:
  scene.render.filepath=str(FRAMES/f'{name}.png');bpy.ops.render.render(write_still=True)
 print('POSE_DONE',index,name,flush=True)
for side in range(2):
 travel=(Vector(manifest['poses'][2]['conductor_centers'][side])-Vector(manifest['poses'][3]['conductor_centers'][side])).length
 assert travel>.4,('visible conductor must move',side,travel)
if args.check:print('CHECK_PASS');sys.exit(0)
inputs=sum((['-i',str(FRAMES/f'{p[0]}.png')] for p in poses),[]);atlas=OUT/atlas_name
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=6,scale=2304:384:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(atlas)],check=True)
scene.render.fps=100;scene.frame_start=1;scene.frame_end=40
for frame,index in [(1,0),(6,1),(14,2),(16,3),(24,4),(32,5),(40,0)]:
 pose(index)
 for obj in animated:obj.keyframe_insert(data_path='rotation_euler',frame=frame)
for obj in animated:
 obj.animation_data.action.name=obj.name+' charge and release'
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
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
 objects[0].name=f'Lightning surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='lightning-conductor-release',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);pose(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/'rest.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png',atlas_name]:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
glb=(OUT/f'{asset_id}.glb').read_bytes();chunk_size=struct.unpack_from('<I',glb,12)[0];gltf=json.loads(glb[20:20+chunk_size])
primitives=[p for mesh in gltf['meshes'] for p in mesh['primitives']]
manifest['runtime']={'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives),'mesh_nodes':len(gltf['meshes']),'draw_primitives':len(primitives),'materials':len(gltf['materials']),'animation_channels':len(gltf['animations'][0]['channels']),'atlas_decoded_rgba_bytes':2304*384*4}
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest()
manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
coords=[[round((p['socket'][0]-320)/576*display_scale,6),round(.1+(p['socket'][1]-600)/576*display_scale,6)] for p in manifest['poses']]
socket_file='lightningTowerSockets.ts';constant='LIGHTNING_TOWER_SOCKETS'
(ROOT/'src/games/defense'/socket_file).write_text('// Generated by tools/blender/build_lightning_tower_action.py; offsets per tower display size.\nexport const '+constant+' = '+json.dumps(coords)+' as const;\n')
print('LIGHTNING_ACTION_COMPLETE',flush=True)
