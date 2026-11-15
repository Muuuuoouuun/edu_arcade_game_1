"""Rapid crossbow Lv.2: fixed keep, yaw, string release and reciprocating magazine feed.
Run: npm run models:rapid-action (Blender 4.3+, ffmpeg).
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=48);p.add_argument('--check',action='store_true');p.add_argument('--reuse-renders',action='store_true',help='Repack unchanged rendered poses when editing only the GLB clip');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
model_id='rapid-crossbow';asset_id=model_id+'-action';prefix='rapid-action';command='npm run models:rapid-action';display_scale=1.16;FRAMES=ROOT/'art-source/defense'/asset_id
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections[model_id];root=bpy.data.objects[model_id];root.location=(0,0,0)
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False
camera=scene.camera;camera.data.ortho_scale=7.5;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
bpy.context.view_layer.update()
turret=next(o for o in col.objects if o.get('animation_role')=='turret');turret.name='aim-platform';del turret['animation_role']
bolt=next(o for o in col.objects if o.get('animation_role')=='bolt');bolt.name='loaded-bolt';del bolt['animation_role'];bolt_rest=bolt.location.copy()
def joint(name,world,parent):
 obj=bpy.data.objects.new(name,None);col.objects.link(obj);obj.parent=parent;obj.location=parent.matrix_world.inverted()@Vector(world);bpy.context.view_layer.update();return obj
limbs=[];strings=[];animated=[]
# Author coordinates belong to the scaled model root, never unscaled world space.
for side in [-1,1]:
 hinge=joint('bow-left' if side<0 else 'bow-right',root.matrix_world@Vector((side*.36,-.72,2.35)),turret)
 for obj in list(col.objects):
  if obj.type=='MESH' and obj.parent==turret and obj.name.startswith(('Bow / laminated','Bow / dark laminated','Bow / tip binding','Bow / broad outer','Ascended / gilded bow tip','Ascended / gold limb band')) and obj.matrix_world.translation.x*side>0:
   matrix=obj.matrix_world.copy();obj.parent=hinge;obj.matrix_world=matrix
 bpy.context.view_layer.update();tip=hinge.matrix_world.inverted()@(root.matrix_world@Vector((side*1.58,-.12,2.46)));limbs.append((side,hinge,tip));animated.append(hinge)
 rope_joint=joint('string-left' if side<0 else 'string-right',(0,0,0),turret)
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.026,depth=1)
 rope=bpy.context.object;rope.name='Braided string segment'
 for c in list(rope.users_collection):c.objects.unlink(rope)
 col.objects.link(rope);rope.parent=rope_joint;rope.location=(0,0,0);rope.data.materials.append(next(o for o in col.objects if o.name.startswith('Bow / tensioned rope')).data.materials[0]);strings.append(rope_joint);animated.append(rope_joint)
for obj in list(col.objects):
 if obj.name.startswith('Bow / tensioned rope'):bpy.data.objects.remove(obj,do_unlink=True)
animated.append(bolt)
# The feed tray slides on real steel guide rails. Its lever pivots with the tray.
def reparent(obj,parent):
 world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
hopper=joint('magazine-feed',root.matrix_world@Vector((0,.5,2.80)),turret)
for obj in list(col.objects):
 if obj.name.startswith('Magazine /'):reparent(obj,hopper)
lever=joint('magazine-lever',root.matrix_world@Vector((0,.96,2.80)),hopper)
for obj in list(col.objects):
 if obj.name.startswith(('Magazine / lever arm','Magazine / lever brass grip')):reparent(obj,lever)
hopper_rest=hopper.location.copy();animated.extend([hopper,lever]);wheels=[]
for side in [-1,1]:
 wheel=joint('rewind-left' if side<0 else 'rewind-right',root.matrix_world@Vector((side*.60,.72,2.12)),turret)
 for obj in list(col.objects):
  if obj.name.startswith(('Winch / hand wheel','Winch / wheel spoke','Winch / crank handle')) and sum((obj.matrix_world@Vector(c)).x for c in obj.bound_box)*side>0:reparent(obj,wheel)
 wheels.append(wheel);animated.append(wheel)
 for y in [.12,1.12]:
  bpy.ops.mesh.primitive_cube_add(size=1,location=(side*.32,y,2.64));obj=bpy.context.object;obj.name='Feed / brass guide stop';obj.scale=(.13,.12,.16)
  for c in list(obj.users_collection):c.objects.unlink(obj)
  col.objects.link(obj);obj.data.materials.append(bpy.data.materials['Metal / aged gold brass']);bpy.context.view_layer.update();obj.matrix_world=root.matrix_world@obj.matrix_world;bpy.context.view_layer.update();reparent(obj,turret)
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.045,depth=1.0,location=(side*.32,.62,2.67),rotation=(math.pi/2,0,0));obj=bpy.context.object;obj.name='Feed / steel slider rail'
 for c in list(obj.users_collection):c.objects.unlink(obj)
 col.objects.link(obj);obj.data.materials.append(bpy.data.materials['Metal / forged steel blade']);obj.matrix_world=root.matrix_world@obj.matrix_world;bpy.context.view_layer.update();reparent(obj,turret)
for obj in col.objects:
 if obj.name.startswith('Bolt / feather fletching'):obj.data.materials[0]=bpy.data.materials['Cloth / ember red banner']
fixed=[o for o in col.objects if o.type=='MESH' and o.parent==root];fixed_matrices={o:o.matrix_world.copy() for o in fixed}

# The launch socket is the loaded spearhead, independent of a hidden/reloading bolt.
launch_local=turret.matrix_world.inverted()@(root.matrix_world@Vector((0,-2.05,2.52)))
def pose(index,next_index=None,mix=0):
 next_index=index if next_index is None else next_index
 def blend(values):return values[index]*(1-mix)+values[next_index]*mix
 release=blend([0,1,.5,0])
 for side,hinge,_ in limbs:hinge.rotation_euler.z=-side*.22*release
 bolt.location=bolt_rest+Vector((0,blend([0,0,0,.18]),0));bolt.scale=((1 if [True,False,False,True][index if mix<1 else next_index] else .001),)*3
 hopper.location=hopper_rest+Vector((0,blend([0,.04,.18,.08]),0));lever.rotation_euler.x=blend([0,-.18,-.65,-.28])
 for wheel in wheels:wheel.rotation_euler.x=blend([0,.12,.9,.4])
 bpy.context.view_layer.update()
 center=Vector((0,.8-1.35*release,2.45))-Vector((0,0,1.82))
 for (_,hinge,tip),rope in zip(limbs,strings):
  end=turret.matrix_world.inverted()@(hinge.matrix_world@tip);delta=center-end
  rope.location=(end+center)/2;rope.rotation_euler=delta.to_track_quat('Z','Y').to_euler();rope.scale=(1,1,delta.length)
 bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*640,(1-p.y)*640))
# Preserve the existing common camera, display scale and ground anchor in all views.
camera.data.ortho_scale=7.5;old_ground=project((0,0,0));camera.data.ortho_scale=7.5
ground=project((0,0,0));ground_y=ground.y-576*(.1+(old_ground.y-600)/576*1.16)/display_scale
px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
poses=['ready','release','draw','feed']
manifest={'source':f'art-source/defense/{asset_id}.blend','level':2,'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_rapid_crossbow_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','frame':{'width':640,'height':640,'ground':list(ground),'crop':[32,24,576,576],'orthographic_scale':7.5,'display_ground_y':ground_y,'previous_ground':list(old_ground)},'delivery_frame':{'width':256,'height':256,'crop':[12.8,9.6,230.4,230.4],'ground_y':ground_y*256/640},'render':{'engine':'Cycles CPU','samples':args.samples},'animation':{'clip':'rapid-feed-release','fps':100,'first_frame':1,'last_frame':35,'duration_seconds':.34,'hit_at':.1},'directions':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
previous=json.loads((OUT/f'{asset_id}.json').read_text()) if args.reuse_renders else None
if previous:
 assert previous['base_source_sha256']==manifest['base_source_sha256'] and previous['render']['samples']==args.samples,'Cannot reuse different source/render settings'
for index in range(8):
 angle=index*math.tau/8;screen=Vector((math.cos(angle),math.sin(angle)));world=inverse@screen;world.normalize();yaw=math.atan2(world.x,-world.y);turret.rotation_euler.z=yaw
 entry={'index':index,'yaw':yaw,'poses':[]}
 for phase,name in enumerate(poses):
  pose(phase)
  for (_,hinge,_),rope in zip(limbs,strings):
   binding=next(o for o in col.objects if o.parent==hinge and o.name.startswith('Bow / tip binding'))
   ends=[rope.matrix_world@Vector((0,0,z)) for z in [-.5,.5]]
   assert min((end-binding.matrix_world.translation).length for end in ends)<1e-5,'String must meet its moving bow tip'
  graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in col.objects:
   if obj.type=='MESH':
    ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@v.co) for v in ev.data.vertices)
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
  assert bounds[0]>32 and bounds[1]>24 and bounds[2]<608 and bounds[3]<600,(index,name,bounds)
  drift=max(max(abs(obj.matrix_world[r][c]-m[r][c]) for r in range(4) for c in range(4)) for obj,m in fixed_matrices.items());assert drift<1e-6
  muzzle=project(turret.matrix_world@launch_local);entry['poses'].append({'name':name,'muzzle':list(muzzle),'bounds':bounds,'foundation_drift':drift,'fixed_meshes':len(fixed),'magazine_center':list(hopper.matrix_world.translation),'lever_rotation':list(lever.rotation_euler)})
  if previous:
   expected=previous['directions'][index]['poses'][phase]
   assert max(abs(x-y) for x,y in zip(bounds,expected['bounds']))<1e-5 and (muzzle-Vector(expected['muzzle'])).length<1e-5,'Only unchanged render poses can be reused'
   assert (FRAMES/f'{prefix}-{index}-{name}.png').is_file()
  elif not args.check:scene.render.filepath=str(FRAMES/f'{prefix}-{index}-{name}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not args.check:
  dst=OUT/f'{prefix}-{index}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'{prefix}-{index}-{name}.png')] for name in poses),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=4,scale=1024:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
  manifest['files'].append({'file':dst.name,'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
 print('DIRECTION_DONE',index,flush=True)
if args.check:print('CHECK_PASS');sys.exit(0)
turret.rotation_euler.z=0;scene.render.fps=100;scene.frame_start=1;scene.frame_end=35
# Sample the changing string endpoints densely: coarse transform interpolation detaches them.
timeline=[(1,0),(10,0),(11,1),(19,2),(27,3),(35,0)]
for frame in range(1,36):
 start,end=next((a,b) for a,b in zip(timeline,timeline[1:]) if a[0]<=frame<=b[0])
 pose(start[1],end[1],(frame-start[0])/(end[0]-start[0]))
 for obj in animated:
  for path in ['location','rotation_euler','scale']:obj.keyframe_insert(data_path=path,frame=frame)
for obj in animated:
 obj.animation_data.action.name='Rapid feed / '+obj.name
 for curve in obj.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='CONSTANT' if obj==bolt and curve.data_path=='scale' else 'LINEAR'
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
 objects[0].name=f'Rapid surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
meshes=[o for o in export.objects if o.type=='MESH'];triangles=0
for obj in meshes:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
manifest['runtime']={'mesh_objects':len(meshes),'triangles':triangles,'materials':len({m.name for obj in meshes for m in obj.data.materials})}
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='rapid-feed-release',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);pose(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/f'{prefix}-4-ready.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png']:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest()
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Runtime muzzle offsets are generated from the very same camera and joints.
coords=[[[round((p['muzzle'][0]-320)/576*display_scale,6),round((p['muzzle'][1]-ground_y)/576*display_scale,6)] for p in d['poses']] for d in manifest['directions']]
muzzle_file='rapidCrossbowMuzzles.ts';constant='RAPID_CROSSBOW_MUZZLES'
(ROOT/'src/games/defense'/muzzle_file).write_text('// Generated by tools/blender/build_rapid_crossbow_action.py; offsets per tower display size.\nexport const '+constant+' = '+json.dumps(coords)+' as const;\nexport const RAPID_CROSSBOW_FRAME = '+json.dumps({'groundY':ground_y*256/640,'displayScale':display_scale})+' as const;\n')
print('RAPID_ACTION_COMPLETE',flush=True)
