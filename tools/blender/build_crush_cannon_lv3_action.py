"""Crush cannon Lv.3: fixed keep, aimed stone-shot rack and twin buffer axial recoil.
Run: npm run models:crush-action-lv3 (Blender 4.3+, ffmpeg).
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/towers.blend';OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=48);p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
model_id='crush-cannon-lv3';asset_id=model_id+'-action';prefix='crush-lv3-action';command='npm run models:crush-action-lv3';display_scale=1.16*1.025*8/7.5;FRAMES=ROOT/'art-source/defense'/asset_id
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;col=bpy.data.collections[model_id];root=bpy.data.objects[model_id];root.location=(0,0,0)
for other in list(bpy.data.collections):
 if other not in (col,bpy.data.collections['Studio / camera and soft lights']):
  for obj in list(other.objects):bpy.data.objects.remove(obj,do_unlink=True)
  bpy.data.collections.remove(other)
col.hide_render=False
camera=scene.camera;camera.data.ortho_scale=8.0;camera.location=(9,-12,12);camera.rotation_euler=(Vector((0,0,2.35))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
bpy.context.view_layer.update()
platform=bpy.data.objects.new('aim-platform',None);col.objects.link(platform);platform.parent=root;platform.location=(0,0,1.75);bpy.context.view_layer.update()
for obj in list(col.objects):
 if obj.parent==root and (obj.get('animation_role')=='turret' or obj.name.startswith(('Shot rack /','Ascended / tidal crown','Ascended / crown side','Ascended / orbiting'))):
  matrix=obj.matrix_world.copy();obj.parent=platform;obj.matrix_world=matrix
barrel=next(o for o in col.objects if o.get('animation_role')=='barrel');barrel.name='barrel';rest=barrel.location.copy()
bpy.context.view_layer.update();tip=Vector((0,-1.48,2.42))+Vector((0,-1.26,.4)).normalized()*.06
muzzle_local=barrel.matrix_world.inverted()@(root.matrix_world@tip)
# Exposed twin buffers read as a heavy siege carriage. All new meshes are real geometry.
def attach(obj,parent):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 col.objects.link(obj);bpy.context.view_layer.update();obj.matrix_world=root.matrix_world@obj.matrix_world;bpy.context.view_layer.update();world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world

def rod(name,a,b,radius,material,parent):
 a,b=Vector(a),Vector(b);delta=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=delta.length,location=(a+b)/2)
 obj=bpy.context.object;obj.name=name;obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler();obj.data.materials.append(bpy.data.materials[material]);attach(obj,parent);return obj
for obj in list(col.objects):
 if obj.name.startswith('Shot rack / loose stone shot'):bpy.data.objects.remove(obj,do_unlink=True)
 elif obj.name.startswith(('Shot rack /','Ascended / tidal crown','Ascended / crown side','Ascended / orbiting')):
  obj.location.y+=.38
  if obj.name.startswith('Ascended / orbiting'):obj.location.z+=.32
  if obj.name.startswith(('Ascended / tidal crown','Ascended / crown side')):obj.location.z-=.12
for side in [-1,1]:
 x=side*.68
 rod('Buffer / fixed iron sleeve',(x,-.48,2.165),(x,.18,1.956),.13,'Metal / forged steel blade',platform)
 rod('Buffer / brass end collar',(x,-.52,2.178),(x,-.43,2.149),.155,'Metal / aged gold brass',platform)
 rod('Buffer / sliding polished piston',(x,-1.03,2.34),(x,-.24,2.089),.066,'Metal / aged gold brass',barrel)
 rod('Buffer / barrel saddle',(side*.38,-.90,2.24),(x,-.90,2.30),.075,'Metal / forged steel blade',barrel)
 rod('Buffer / deck bracket',(x,.10,1.75),(x,.10,1.98),.095,'Metal / aged gold brass',platform)
# Lv.3 reinforced cradle: wide guide rails with brass sliding shoes, independent of the fixed keep.
def block(name,center,size,material,parent):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);obj=bpy.context.object;obj.name=name;obj.scale=size;obj.data.materials.append(bpy.data.materials[material]);attach(obj,parent)
 bevel=obj.modifiers.new('Heavy edge bevel','BEVEL');bevel.width=.025;bevel.segments=2
 return obj
for side in [-1,1]:
 x=side*.84
 rod('Siege guide / fixed steel rail',(x,-1.04,2.39),(x,.02,2.053),.065,'Metal / forged steel blade',platform)
 rod('Siege guide / moving brass shoe',(x,-.76,2.301),(x,-.52,2.225),.115,'Metal / aged gold brass',barrel)
 rod('Siege guide / moving saddle',(side*.38,-.65,2.25),(x,-.65,2.266),.075,'Metal / forged steel blade',barrel)
 for y in [-1.05,.04]:
  z=2.06-(y*.4/1.26)
  rod('Siege guide / fixed rail stop',(x,y-.035,z+.011),(x,y+.035,z-.011),.12,'Metal / aged gold brass',platform)
  rod('Siege guide / fixed deck leg',(x,y,1.76),(x,y,z-.05),.075,'Metal / aged gold brass',platform)
# Lower fixed pennants below the broad rotating siege carriage.
for obj in col.objects:
 if obj.name.startswith(('Ascended / pennant','Ascended / river pennant')):
  side=1 if obj.matrix_world.translation.x>0 else -1;matrix=obj.matrix_world.copy();matrix.translation+=root.matrix_world.to_3x3()@Vector((side*.16,.12,-1.40));obj.matrix_world=matrix
for side in [-1,1]:
 for z in [.82,1.22]:block('Pennant mount / fixed wall bracket',(side*.80,.78,z),(.32,.12,.12),'Metal / aged gold brass',root)
# Source animation roles are replaced by the actual authored clip, never doubled procedurally.
for obj in col.objects:
 if 'animation_role' in obj:del obj['animation_role']
bpy.context.view_layer.update()
fixed=[o for o in col.objects if o.type=='MESH' and o.parent==root];fixed_matrices={o:o.matrix_world.copy() for o in fixed}
from mathutils.bvhtree import BVHTree
barrel_surfaces=[o for o in col.objects if o.type=='MESH' and (o.name.startswith('Barrel /') or o.name.startswith('Ascended / gilded muzzle'))]
rack_surfaces=[o for o in col.objects if o.type=='MESH' and o.name.startswith(('Shot rack /','Ascended / orbiting'))]
def assert_clearance():
 graph=bpy.context.evaluated_depsgraph_get()
 def tree(obj):
  ev=obj.evaluated_get(graph);mesh=ev.to_mesh();v=[ev.matrix_world@p.co for p in mesh.vertices];f=[list(p.vertices) for p in mesh.polygons];result=BVHTree.FromPolygons(v,f);ev.to_mesh_clear();return result
 racks={o:tree(o) for o in rack_surfaces}
 for o in barrel_surfaces:
  t=tree(o)
  for other,bvh in racks.items():assert not t.overlap(bvh),('Barrel/rack collision',o.name,other.name)
 return len(barrel_surfaces)*len(rack_surfaces)
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*640,(1-p.y)*640))
camera.data.ortho_scale=7.5;previous_ground=project((0,0,0));camera.data.ortho_scale=8.0
ground=project((0,0,0));ground_y=ground.y-576*(.1+(previous_ground.y-600)/576*1.16*1.025)/display_scale
px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
def recoil(value):barrel.location=rest+Vector((0,value,-value*.4/1.26))
poses={'ready':0,'recoil':.22,'return':.10,'settle':.025}
manifest={'source':f'art-source/defense/{asset_id}.blend','level':3,'regeneration_command':command,'display_scale':display_scale,'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_crush_cannon_lv3_action.py','reference':'art-source/defense/concepts/2026-10-29/props/six-tower-modules.png','render':{'engine':'Cycles CPU','samples':args.samples,'denoising':False},'frame':{'width':640,'height':640,'ground':list(ground),'previous_ground':list(previous_ground),'display_ground_y':ground_y,'crop':[32,24,576,576],'orthographic_scale':8.0},'delivery_frame':{'width':256,'height':256,'ground_y':ground_y*.4,'crop':[12.8,9.6,230.4,230.4]},'animation':{'clip':'crush-cannon-fire','fps':100,'first_frame':1,'last_frame':53,'duration_seconds':.52,'hit_at':.28,'peak_recoil_at':.29},'directions':[],'files':[]}
# Validate the whole swept upper assembly against the fixed pennants before rendering.
def surface(obj):
 ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();points=[ev.matrix_world@v.co for v in mesh.vertices];tree=BVHTree.FromPolygons(points,[p.vertices[:] for p in mesh.polygons]);ev.to_mesh_clear();return tree,([min(p[k] for p in points) for k in range(3)],[max(p[k] for p in points) for k in range(3)])
pennants=[o for o in fixed if o.name.startswith(('Ascended / pennant','Ascended / river pennant'))];pennant_surfaces={o.name:surface(o) for o in pennants};upper=[o for o in platform.children_recursive if o.type=='MESH']
for direction in range(8):
 world=inverse@Vector((math.cos(direction*math.tau/8),math.sin(direction*math.tau/8)));world.normalize();platform.rotation_euler.z=math.atan2(world.x,-world.y)
 for frame in range(53):
  timeline=[(0,0),(28,0),(29,.22),(36,.10),(44,.025),(52,0)];a,b=next((a,b) for a,b in zip(timeline,timeline[1:]) if a[0]<=frame<=b[0]);recoil(a[1]+(b[1]-a[1])*(frame-a[0])/(b[0]-a[0]));bpy.context.view_layer.update()
  if direction==0:assert_clearance()
  for obj in upper:
   ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());points=[ev.matrix_world@Vector(v) for v in ev.bound_box];lo=[min(p[k] for p in points) for k in range(3)];hi=[max(p[k] for p in points) for k in range(3)];tree=None
   for name,(other,(olo,ohi)) in pennant_surfaces.items():
    if any(olo[k]>hi[k] or lo[k]>ohi[k] for k in range(3)):continue
    if tree is None:tree=surface(obj)[0]
    assert not tree.overlap(other),(direction,frame,obj.name,name)
manifest['pennant_clearance']={'directions':8,'frames_per_direction':53,'upper_meshes':len(upper),'fixed_pennants':len(pennants),'surface_intersections':0}
manifest['structure']={'pennant_offset':[.16,.12,-1.40],'rack_offset_y':.38,'orbit_raise':.32,'crown_lower':.12,'guide_rail_x':[-.84,.84]}
FRAMES.mkdir(parents=True,exist_ok=True)
for index in range(8):
 angle=index*math.tau/8;screen=Vector((math.cos(angle),math.sin(angle)));world=inverse@screen;world.normalize();yaw=math.atan2(world.x,-world.y);platform.rotation_euler.z=yaw
 entry={'index':index,'yaw':yaw,'poses':[]}
 for pose,value in poses.items():
  recoil(value);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in col.objects:
   if obj.type=='MESH':
    ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@v.co) for v in ev.data.vertices)
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
  assert bounds[0]>32 and bounds[1]>24 and bounds[2]<608 and bounds[3]<600,(index,pose,bounds)
  muzzle=project(barrel.matrix_world@muzzle_local)
  drift=max(max(abs(o.matrix_world[r][c]-m[r][c]) for r in range(4) for c in range(4)) for o,m in fixed_matrices.items());assert drift<1e-6
  pairs=assert_clearance() if index==0 else pairs
  entry['poses'].append({'name':pose,'muzzle':list(muzzle),'bounds':bounds,'recoil':value,'foundation_drift':drift,'fixed_meshes':len(fixed)})
  if not args.check:
   scene.render.filepath=str(FRAMES/f'{prefix}-{index}-{pose}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not args.check:
  dst=OUT/f'{prefix}-{index}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'{prefix}-{index}-{pose}.png')] for pose in poses),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=4,scale=1024:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
  manifest['files'].append({'file':dst.name,'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
 print('DIRECTION_DONE',index,flush=True)
if args.check:print('CHECK_PASS');sys.exit(0)
# A real object animation, shared by the editable source and exported workshop GLB.
platform.rotation_euler.z=0;scene.render.fps=100;scene.frame_start=1;scene.frame_end=53
for frame,value in [(1,0),(29,0),(30,.22),(37,.10),(45,.025),(53,0)]:
 recoil(value);barrel.keyframe_insert(data_path='location',frame=frame)
barrel.animation_data.action.name='Crush cannon axial recoil'
for curve in barrel.animation_data.action.fcurves:
 for key in curve.keyframe_points:key.interpolation='LINEAR'
for frame in range(1,54):
 scene.frame_set(frame);bpy.context.view_layer.update();assert_clearance()
manifest['clearance']={'sampled_frames':53,'barrel_rack_pairs':pairs,'surface_crossings':0}
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
 objects[0].name=f'Crush surface {i:02}'
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:obj.select_set(True)
meshes=[o for o in export.objects if o.type=='MESH'];triangles=0
for obj in meshes:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
manifest['runtime']={'mesh_objects':len(meshes),'triangles':triangles,'materials':len({m.name for o in meshes for m in o.data.materials})}
bpy.context.view_layer.objects.active=clones[root]
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='crush-cannon-fire',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
for obj in list(export.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(export)
for obj,name in names.items():obj.name=name
scene.frame_set(1);recoil(0);scene['regeneration_command']=command;bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
shutil.copyfile(FRAMES/f'{prefix}-4-ready.png',OUT/f'{asset_id}.png')
for name in [f'{asset_id}.glb',f'{asset_id}.png']:
 file=OUT/name;manifest['files'].append({'file':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
manifest['frame_files']=[{'file':str(f.relative_to(ROOT)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(FRAMES.glob('*.png'))]
manifest['reference_sha256']=hashlib.sha256((ROOT/manifest['reference']).read_bytes()).hexdigest()
manifest['source_sha256']=hashlib.sha256((ROOT/manifest['source']).read_bytes()).hexdigest()
manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(OUT/f'{asset_id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Runtime muzzle offsets are generated from the very same camera and joints.
coords=[[[round((p['muzzle'][0]-320)/576*display_scale,6),round((p['muzzle'][1]-ground_y)/576*display_scale,6)] for p in d['poses']] for d in manifest['directions']]
muzzle_file='crushCannonLv3Muzzles.ts';constant='CRUSH_CANNON_LV3_MUZZLES'
(ROOT/'src/games/defense'/muzzle_file).write_text('// Generated by tools/blender/build_crush_cannon_lv3_action.py; offsets per tower display size.\nexport const '+constant+' = '+json.dumps(coords)+' as const;\nexport const CRUSH_CANNON_LV3_FRAME = '+json.dumps({'groundY':ground_y*.4,'displayScale':display_scale})+' as const;\n')
print('CRUSH_ACTION_COMPLETE',flush=True)
