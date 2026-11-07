"""Fire tower Lv.2: fixed masonry, crystal charge and hinged bronze retainers.
Regenerate with npm run models:fire-action (Blender 4.3+, ffmpeg).
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/fire-tower-action'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=48);p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
asset_id='fire-tower-action';command='npm run models:fire-action';display_scale=1.16
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections['fire-tower'];root=bpy.data.objects['fire-tower'];root.location=(0,0,0)
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False;camera=scene.camera;camera.data.ortho_scale=7.5;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples
bpy.context.view_layer.update();core=next(o for o in col.objects if o.get('animation_role')=='fire-core');core.name='fire-core';rest=core.location.copy();hinges=[]
for i,angle in enumerate([math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]):
 claw=next(o for o in col.objects if o.name.startswith(f'Crown / bronze crystal claw {i+1}'))
 pivot=bpy.data.objects.new(f'bronze-claw-hinge-{i+1}',None);col.objects.link(pivot);pivot.parent=root;pivot.location=(.96*math.cos(angle),.96*math.sin(angle),1.86);pivot.rotation_mode='AXIS_ANGLE';pivot['animation_role']='crystal-retainer';bpy.context.view_layer.update()
 world=claw.matrix_world.copy();claw.parent=pivot;claw.matrix_world=world;hinges.append((pivot,angle))
bpy.context.view_layer.update();socket=core.matrix_world.inverted()@Vector((0,-.08,3.56))
# The same seven samples author the GLB; six unique poses are delivered to battle.
poses=[('rest',0,1,0),('gather',-.08,.97,-.025),('charged',-.21,.9,-.06),('release',.14,1.06,.43),('rebound',.08,1.02,.24),('settle',-.035,.99,.07)]
def pose(index):
 _,lift,scale,opening=poses[index];core.location=rest+Vector((0,0,lift));core.scale=(scale,scale,scale)
 for pivot,angle in hinges:pivot.rotation_axis_angle=(opening,-math.sin(angle),math.cos(angle),0)
 bpy.context.view_layer.update()
def project(v):
 q=world_to_camera_view(scene,camera,Vector(v));return [q.x*640,(1-q.y)*640]
fixed=[o for o in col.objects if o.type=='MESH' and o.parent==root];fixed_matrices={o:o.matrix_world.copy() for o in fixed}
manifest={'source':f'art-source/defense/{asset_id}.blend','level':2,'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_fire_tower_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','frame':{'width':640,'height':640,'ground':project((0,0,0)),'crop':[32,24,576,576],'orthographic_scale':7.5},'delivery_frame':{'width':384,'height':384,'crop':[19.2,14.4,345.6,345.6]},'clip':'fire-core-release','hit_at':.15,'duration':.39,'poses':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
for index,(name,*_) in enumerate(poses):
 pose(index);graph=bpy.context.evaluated_depsgraph_get();points=[]
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
inputs=sum((['-i',str(FRAMES/f'{p[0]}.png')] for p in poses),[]);atlas=OUT/'fire-action-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=6,scale=2304:384:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90','-compression_level','6',str(atlas)],check=True)
scene.render.fps=100;scene.frame_start=1;scene.frame_end=40
for frame,index in [(1,0),(6,1),(14,2),(16,3),(22,4),(31,5),(40,0)]:
 pose(index)
 for obj in [core]+[h[0] for h in hinges]:
  for prop in (['location','scale'] if obj==core else ['rotation_axis_angle']):obj.keyframe_insert(data_path=prop,frame=frame)
for obj in [core]+[h[0] for h in hinges]:
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
 objects[0].name=f'Fire surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='fire-core-release',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);pose(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/'rest.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png','fire-action-atlas.webp']:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
coords=[[round((p['socket'][0]-320)/576*display_scale,6),round(.1+(p['socket'][1]-600)/576*display_scale,6)] for p in manifest['poses']]
(ROOT/'src/games/defense/fireTowerSockets.ts').write_text('// Generated by tools/blender/build_fire_tower_action.py; offsets per tower display size.\nexport const FIRE_TOWER_SOCKETS = '+json.dumps(coords)+' as const;\n')
print('FIRE_ACTION_COMPLETE',flush=True)
