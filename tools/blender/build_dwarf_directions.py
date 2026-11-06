"""Bake eight actual orientations of the existing dwarf attack; never mirror hands.
Run: npm run models:dwarf-directions
The editable source retains the original attack clip. No new combat rule or GLB is needed.
"""
import argparse, hashlib, json, math, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/dwarf.blend'
FRAMES=ROOT/'art-source/defense/dwarf-directions'
OUT=ROOT/'public/defense/models'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene;camera=scene.camera;root=bpy.data.objects['dwarf-guardian']
scene.cycles.samples=a.samples
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100
# All orientations use one enlarged camera; runtime compensates scale uniformly.
camera.data.ortho_scale=6.8
bpy.context.view_layer.update()
ground=world_to_camera_view(scene,camera,Vector((0,0,0)))
camera.data.shift_y+=ground.y-(1-550/640)
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*640,(1-p.y)*640))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground
inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
poses={'windup':7,'strike':11,'recover':17}
manifest={'source':'art-source/defense/dwarf-directions.blend','base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generator':'tools/blender/build_dwarf_directions.py','reference':'art-source/defense/atlases/melee-motion.png','frame':{'width':640,'height':640,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':384,'height':384,'ground':[192,330]},'mapping':'screen clockwise from east, 45 degree sectors; rotate actual +Y model, no mirroring','existing_glb':'dwarf-guardian.glb','clip':'dwarf-hammer-attack','directions':[],'files':[]}
FRAMES.mkdir(parents=True,exist_ok=True)
for direction in range(8):
 angle=direction*math.tau/8;screen=Vector((math.cos(angle),math.sin(angle)))
 world=inverse@screen;world.normalize();yaw=math.atan2(-world.x,world.y)
 root.rotation_euler.z=yaw
 entry={'index':direction,'screen_vector':list(screen),'yaw_radians':yaw,'poses':[]}
 for pose,frame in poses.items():
  scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in root.users_collection[0].objects:
   if obj.type!='MESH':continue
   evaluated=obj.evaluated_get(graph)
   for corner in evaluated.bound_box:points.append(project(evaluated.matrix_world@Vector(corner)))
  bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)]
  assert bounds[0]>8 and bounds[1]>8 and bounds[2]<632 and bounds[3]<632,(direction,pose,bounds)
  entry['poses'].append({'pose':pose,'frame':frame,'bounds':bounds})
  if not a.check:
   scene.render.filepath=str(FRAMES/f'dwarf-attack-{direction}-{pose}.png');bpy.ops.render.render(write_still=True)
 manifest['directions'].append(entry)
 if not a.check:
  destination=OUT/f'dwarf-attack-{direction}-atlas.webp'
  inputs=sum((['-i',str(FRAMES/f'dwarf-attack-{direction}-{pose}.png')] for pose in poses),[])
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=3,scale=1152:384:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(destination)],check=True)
  manifest['files'].append({'file':destination.name,'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
 print('DIRECTION_COMPLETE',direction,flush=True)
if not a.check:
 scene.frame_set(1);root.rotation_euler.z=manifest['directions'][1]['yaw_radians']
 scene['regeneration_command']='npm run models:dwarf-directions'
 scene['direction_mapping']=manifest['mapping']
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/manifest['source']))
 (OUT/'dwarf-directions.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('DIRECTION_CHECK_PASS' if a.check else 'DIRECTION_BAKE_PASS',flush=True)
