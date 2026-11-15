"""Author timber/lantern recoil in a copy of the gate. Masonry and ground stay fixed.
Run: npm run models:forest-gate-impact. Requires the existing forest-gate.blend.
"""
import bpy,math,json,hashlib,subprocess,shutil
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'art-source/defense/forest-gate.blend';OUT=ROOT/'public/defense/models';SOURCE=ROOT/'art-source/defense';FRAMES=SOURCE/'forest-gate-impact';FRAMES.mkdir(exist_ok=True)
base_metadata=json.loads((OUT/'forest-gate.json').read_text())
assert hashlib.sha256(BASE.read_bytes()).hexdigest()==base_metadata['source_sha256'],'Rebuild the static gate before baking its impact clip'
bpy.ops.wm.open_mainfile(filepath=str(BASE));scene=bpy.context.scene;parts=[o for o in scene.objects if o.type=='MESH'];groups={}
for name,loc in [('roof',(0,0,3.35)),('tower-left',(-1.92,.1,3.06)),('tower-right',(1.92,.1,3.06)),('lantern-left',(-1.12,-1.1,2.17)),('lantern-right',(1.12,-1.1,2.17))]:
 o=bpy.data.objects.new('Impact / '+name,None);scene.collection.objects.link(o);o.location=loc;groups[name]=o
bpy.context.view_layer.update()
for obj in parts:
 name=obj.name;group=None
 if name.startswith(('Central roof shingle','Oak ridge cap')):group=groups['roof']
 elif name.startswith(('Lookout oak post','Lookout sill','Layered leaf roof','Brass roof lip','Roof crown')):group=groups['tower-left' if obj.location.x<0 else 'tower-right']
 elif name.startswith(('Lantern glow','Lantern cap','Lantern foot','Lantern frame')):group=groups['lantern-left' if obj.location.x<0 else 'lantern-right']
 if group:
  matrix=obj.matrix_world.copy();obj.parent=group;obj.matrix_world=matrix
fixed=[o for o in parts if o.parent is None];fixed_matrices={o.name:o.matrix_world.copy() for o in fixed}
rest={name:o.location.copy() for name,o in groups.items()}
# Independent rigid joints: stone does not wobble with the lighter timber and lamps.
poses=[(1,0,0,0),(3,-5,.07,-23),(7,2.8,-.03,15),(12,-.8,.012,-5),(19,0,0,0)]
for frame,angle,offset,swing in poses:
 for name,obj in groups.items():
  obj.location=rest[name].copy()
  if name.startswith('lantern'):
   obj.rotation_euler=(0,math.radians(swing*(.85 if name.endswith('right') else 1)),0)
  else:
   factor=.75 if name=='roof' else .85 if name.endswith('right') else 1
   obj.rotation_euler=(0,math.radians(angle*factor),0);obj.location.x+=offset*factor
  for prop in ('location','rotation_euler'):obj.keyframe_insert(data_path=prop,frame=frame)
for name,obj in groups.items():
 obj.animation_data.action.name='Gate impact / '+name
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.render.fps=30;scene.frame_start=1;scene.frame_end=19;scene.cycles.samples=96;scene.cycles.use_denoising=False
samples=[]
for frame in range(1,20):
 scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();coords=[]
 for o in fixed:assert all(abs(o.matrix_world[i][j]-fixed_matrices[o.name][i][j])<1e-7 for i in range(4) for j in range(4)),o.name
 for z in (.5,1,1.8,2.5):assert not scene.ray_cast(graph,Vector((0,-4,z)),Vector((0,1,0)),distance=8)[0],('blocked passage',frame,z)
 for obj in parts:
  evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh()
  for vertex in mesh.vertices:
   v=world_to_camera_view(scene,scene.camera,obj.matrix_world@vertex.co);coords.append((v.x*512,(1-v.y)*512))
  evaluated.to_mesh_clear()
 bounds=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords)];assert min(bounds[:2])>8 and max(bounds[2:])<504,(frame,bounds)
 samples.append({'frame':frame,'time':(frame-1)/30,'bounds':bounds})
 if frame in (1,3,7,12):
  scene.render.filepath=str(FRAMES/f'gate-impact-{(1,3,7,12).index(frame)}.png');bpy.ops.render.render(write_still=True)
scene.frame_set(1);bpy.context.view_layer.update();scene['regeneration_command']='npm run models:forest-gate-impact';bpy.context.preferences.filepaths.save_version=0
source=SOURCE/'forest-gate-impact.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
# Evaluate bevels and batch per rigid joint + material, preserving the five animation pivots.
graph=bpy.context.evaluated_depsgraph_get();batches={};exports=[]
for obj in parts:
 clone=bpy.data.objects.new(obj.name,bpy.data.meshes.new_from_object(obj.evaluated_get(graph),depsgraph=graph));scene.collection.objects.link(clone);clone.parent=obj.parent;clone.matrix_world=obj.matrix_world.copy();batches.setdefault((obj.parent.name if obj.parent else '',obj.data.materials[0].name),[]).append(clone)
for (parent,mat),objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name=(parent or 'Fixed masonry')+' / '+mat;exports.append(objects[0])
bpy.ops.object.select_all(action='DESELECT')
for obj in [*exports,*groups.values()]:obj.select_set(True)
bpy.context.view_layer.objects.active=groups['roof'];glb=OUT/'forest-gate-impact.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='forest-gate-impact',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
files=[FRAMES/f'gate-impact-{i}.png' for i in range(4)];atlas=OUT/'forest-gate-impact-atlas.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*sum((['-i',str(f)] for f in files),[]),'-filter_complex','hstack=inputs=4','-frames:v','1','-c:v','libwebp','-quality','92',str(atlas)],check=True)
preview=OUT/'forest-gate-impact.png';shutil.copyfile(files[0],preview)
manifest={'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'base_source_sha256':hashlib.sha256(BASE.read_bytes()).hexdigest(),'regeneration_command':'npm run models:forest-gate-impact','camera':base_metadata['camera'],'battle':base_metadata['battle'],'clip':'forest-gate-impact','duration':.6,'frames':[1,3,7,12],'simulation_age_boundaries':[0,.12,.29,.46,.6],'fixed_parts':len(fixed),'animated_joints':list(groups),'runtime_meshes':len(exports),'samples':samples,'files':[{'path':str(f.relative_to(ROOT)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in [*files,glb,atlas,preview]]}
(OUT/'forest-gate-impact.json').write_text(json.dumps(manifest,indent=2)+'\n');print('GATE_IMPACT_COMPLETE',len(exports),'runtime meshes')
