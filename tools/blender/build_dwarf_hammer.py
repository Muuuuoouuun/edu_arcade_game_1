"""Author a grounded eight-pose hammer sequence from the existing editable guardian.
Run npm run models:dwarf-hammer. Keeps previous attack and walk assets intact.
"""
import argparse, hashlib, json, math, shutil, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/dwarf.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/dwarf-hammer-sequence'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;camera=scene.camera;root=bpy.data.objects['dwarf-guardian'];COL=root.users_collection[0];ROOT_OBJ=root
scene.frame_set(1);bpy.context.view_layer.update()
# Keep feet and leg armor fixed while the trunk absorbs the hammer's weight.
objects={name:bpy.data.objects[name] for name in ['body','head','hammer-arm','hammer-forearm','hammer','guard-arm']}
rest={name:(o.location.copy(),o.rotation_euler.copy()) for name,o in objects.items()}
for o in COL.objects:o.animation_data_clear()
# time, name, upper arm, wrist, trunk pitch, head, guard, elbow, trunk Y, trunk Z
keys=[(0,'ready',0,0,0,0,0,0,0,0),(.05,'brace',.15,.06,-.025,.015,.06,.10,-.025,-.045),(.12,'lift',.72,.14,-.065,.03,.12,.16,-.04,-.025),(.19,'apex',1.24,.18,-.08,.045,.18,.05,-.035,0),(.24,'contact',-.98,-1.72,.10,-.055,-.17,0,.055,-.035),(.30,'rebound',-.74,-1.38,.07,-.035,-.12,.08,.03,-.015),(.39,'recover',-.20,-.80,.035,-.015,-.08,.06,.01,0),(.47,'settle',-.06,-.18,.008,-.004,-.02,.02,0,0),(.52,'ready',0,0,0,0,0,0,0,0)]
scene.render.fps=100;scene.frame_start=1;scene.frame_end=53
for t,name,arm,wrist,trunk,head,guard,elbow,y,z in keys:
 for n,o in objects.items():o.location=rest[n][0];o.rotation_euler=rest[n][1]
 for n,rx in [('hammer-arm',arm),('hammer',wrist),('body',trunk),('head',head),('guard-arm',guard),('hammer-forearm',elbow)]:objects[n].rotation_euler.x=rx
 objects['body'].location.y+=y;objects['body'].location.z+=z
 for o in objects.values():
  for path in ['location','rotation_euler']:o.keyframe_insert(data_path=path,frame=1+round(t*100))
for o in objects.values():
 o.animation_data.action.name='Grounded hammer / '+o.name
 for curve in o.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.cycles.samples=a.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;camera.data.ortho_scale=6.8
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));camera.data.shift_y+=ground.y-(1-330/384);bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
manifest={'source':'art-source/defense/dwarf-hammer-sequence.blend','base_source':'art-source/defense/dwarf.blend','base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_dwarf_hammer.py','command':'npm run models:dwarf-hammer','reference':'art-source/defense/atlases/melee-motion.png','frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'animation':{'clip':'dwarf-hammer-sequence','fps':100,'first_frame':1,'last_frame':53,'duration_seconds':.52,'contact_seconds':.24,'poses':[{'name':k[1],'seconds':k[0],'frame':1+round(k[0]*100)} for k in keys]},'render':{'engine':'Cycles CPU','samples':a.samples},'directions':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
for direction in range(8):
 angle=direction*math.tau/8;screen=Vector((math.cos(angle),math.sin(angle)));world=inverse@screen;world.normalize();yaw=math.atan2(-world.x,world.y);root.rotation_euler.z=yaw
 entry={'index':direction,'yaw_radians':yaw,'poses':[],'contact_trail':[]}
 # The short contact ribbon follows actual hammer-center positions, not a generic arc.
 for sample in range(7):
  frame=20+sample*5/6;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
  entry['contact_trail'].append(list(project(bpy.data.objects['Hammer / granite heart'].matrix_world.translation)))
 for t,name,*_ in keys[:-1]:
  scene.frame_set(1+round(t*100));bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in COL.objects:
   if obj.type=='MESH':
    ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
  assert min(bounds[:2])>4 and max(bounds[2:])<380,(direction,name,bounds)
  entry['poses'].append({'name':name,'seconds':t,'bounds':bounds})
  if not a.check:scene.render.filepath=str(FRAMES/f'dwarf-hammer-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not a.check:
  dst=OUT/f'dwarf-hammer-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'dwarf-hammer-{direction}-{k[1]}.png')] for k in keys[:-1]),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=8,scale=2048:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
  manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
 print('DIRECTION_COMPLETE',direction,flush=True)
scene.frame_set(1);root.rotation_euler.z=0;bpy.context.view_layer.update()
def export_runtime():
 scene.frame_set(1);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
 original=list(COL.objects);names={o:o.name for o in original};matrices={o:o.matrix_world.copy() for o in original}
 export_col=bpy.data.collections.new('Runtime export temporary');scene.collection.children.link(export_col);clones={}
 for o in original:o.name=names[o]+'__editable'
 try:
  for o in original:
   if o.type=='MESH':
    d=bpy.data.meshes.new_from_object(o.evaluated_get(graph),depsgraph=graph);c=bpy.data.objects.new(names[o],d)
   else:c=o.copy();c.name=names[o]
   export_col.objects.link(c);clones[o]=c
  for o,c in clones.items():c.parent=clones.get(o.parent);c.matrix_world=matrices[o]
  bpy.context.view_layer.update();batches={}
  for c in clones.values():
   if c.type=='MESH':batches.setdefault((c.parent.name,tuple(m.name for m in c.data.materials)),[]).append(c)
  for i,objects in enumerate(batches.values()):
   bpy.ops.object.select_all(action='DESELECT')
   for o in objects:o.select_set(True)
   bpy.context.view_layer.objects.active=objects[0]
   if len(objects)>1:bpy.ops.object.join()
   objects[0].name=f'Dwarf surface {i+1:02}'
  meshes=[o for o in export_col.objects if o.type=='MESH'];tris=0
  for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
  bpy.ops.object.select_all(action='DESELECT')
  for o in export_col.objects:o.select_set(True)
  bpy.context.view_layer.objects.active=clones[ROOT_OBJ]
  bpy.ops.export_scene.gltf(filepath=str(OUT/'dwarf-hammer-sequence.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='dwarf-hammer-sequence',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
  return {'mesh_objects':len(meshes),'triangles':tris,'materials':len({m.name for o in meshes for m in o.data.materials})}
 finally:
  for o in list(export_col.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(export_col)
  for o,name in names.items():o.name=name

if not a.check:
 manifest['runtime']=export_runtime()
 scene['regeneration_command']='npm run models:dwarf-hammer';bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
 shutil.copyfile(FRAMES/'dwarf-hammer-1-ready.png',OUT/'dwarf-hammer-sequence.png')
 for path in [OUT/'dwarf-hammer-sequence.glb',OUT/'dwarf-hammer-sequence.png',ROOT/manifest['source']]:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 (OUT/'dwarf-hammer-sequence.json').write_text(json.dumps(manifest,indent=2)+'\n')
if not a.check:
 coords=[[[round((x-192)/384*manifest['frame']['display_scale'],7),round((y-330)/384*manifest['frame']['display_scale'],7)] for x,y in d['contact_trail']] for d in manifest['directions']]
 (ROOT/'src/games/defense/dwarfHammerTrail.ts').write_text('// Generated from the real hammer center by tools/blender/build_dwarf_hammer.py.\nexport const DWARF_HAMMER_TRAIL = '+json.dumps(coords)+' as const;\n')
print('HAMMER_CHECK_PASS' if a.check else 'HAMMER_BAKE_PASS',flush=True)
