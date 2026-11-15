"""Bake the existing grounded gait in eight real orientations, plus neutral stops.
Run: npm run models:dwarf-locomotion. Keeps dwarf.blend and dwarf-walk.blend intact.
"""
import argparse, hashlib, json, math, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/dwarf-walk.blend'
OUT=ROOT/'public/defense/models'
FRAMES=ROOT/'art-source/defense/dwarf-locomotion'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=32);p.add_argument('--check',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene;camera=scene.camera;root=bpy.data.objects['dwarf-guardian'];COL=root.users_collection[0];ROOT_OBJ=root
scene.cycles.samples=a.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100
camera.data.ortho_scale=6.8
bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
camera.data.shift_y+=ground.y-(1-330/384)
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground
inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
manifest={'source':'art-source/defense/dwarf-locomotion.blend','base_source':'art-source/defense/dwarf-walk.blend','base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_dwarf_locomotion.py','command':'npm run models:dwarf-locomotion','reference':'art-source/defense/atlases/melee-motion.png','frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'animation':{'clip':'dwarf-walk','fps':30,'first_frame':1,'last_frame':25,'duration_seconds':.8,'loop':True},'mapping':'screen clockwise from east; real +Y model rotation, no mirroring','render':{'engine':'Cycles CPU','samples':a.samples},'directions':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
for direction in range(8):
 angle=direction*math.tau/8;screen=Vector((math.cos(angle),math.sin(angle)));world=inverse@screen;world.normalize();yaw=math.atan2(-world.x,world.y)
 root.rotation_euler.z=yaw
 entry={'index':direction,'screen_vector':list(screen),'yaw_radians':yaw,'poses':[]}
 for step in range(9):
  scene.frame_set(1+min(step,7)*3)
  if step==8:
   # Neutral stance uses the original hip origins, with no stride offset or bob.
   scene.frame_set(1)
   for side,x in [('right',-.43),('left',.43)]:bpy.data.objects[f'walk-{side}-leg'].location=(x,0,1.05)
  bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in COL.objects:
   if obj.type!='MESH':continue
   evaluated=obj.evaluated_get(graph)
   points.extend(project(evaluated.matrix_world@Vector(c)) for c in evaluated.bound_box)
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
  assert bounds[0]>4 and bounds[1]>4 and bounds[2]<380 and bounds[3]<380,(direction,step,bounds)
  name=f'dwarf-locomotion-{direction}-{step}'
  entry['poses'].append({'name':name,'walk_frame':step if step<8 else None,'bounds':bounds})
  if not a.check:scene.render.filepath=str(FRAMES/f'{name}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not a.check:
  destination=OUT/f'dwarf-locomotion-{direction}-atlas.webp'
  inputs=sum((['-i',str(FRAMES/f'dwarf-locomotion-{direction}-{step}.png')] for step in range(9)),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=9,scale=2304:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(destination)],check=True)
  manifest['files'].append({'file':destination.name,'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
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
  bpy.ops.export_scene.gltf(filepath=str(OUT/'dwarf-locomotion.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='dwarf-walk',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
  return {'mesh_objects':len(meshes),'triangles':tris,'materials':len({m.name for o in meshes for m in o.data.materials})}
 finally:
  for o in list(export_col.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(export_col)
  for o,name in names.items():o.name=name

if not a.check:
 manifest['runtime']=export_runtime()
 scene['regeneration_command']='npm run models:dwarf-locomotion'
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
 # A genuine common-camera preview for the model lab fallback.
 import shutil
 shutil.copyfile(FRAMES/'dwarf-locomotion-1-8.png',OUT/'dwarf-locomotion.png')
 for path in [OUT/'dwarf-locomotion.glb',OUT/'dwarf-locomotion.png',ROOT/manifest['source']]:
  manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 (OUT/'dwarf-locomotion.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('DWARF_LOCOMOTION_CHECK_PASS' if a.check else 'DWARF_LOCOMOTION_BAKE_PASS',flush=True)
