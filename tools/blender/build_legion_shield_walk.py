"""Author a grounded Legion shield walk from the editable shield soldier.

  blender --background --python-exit-code 1 --python tools/blender/build_legion_shield_walk.py

The source bash model is never overwritten. A pair of separate leg assemblies
translate through an eight-sample planted/swing cycle; all shoes remain level.
"""
import hashlib,json,math,shutil,subprocess
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector,Quaternion

ROOT=Path(__file__).resolve().parents[2]; SOURCE=ROOT/'art-source/defense'; PUBLIC=ROOT/'public/defense/models'; FRAMES=SOURCE/'legion-shield-walk-frames';FRAMES.mkdir(parents=True,exist_ok=True)
source=SOURCE/'legion-shield.blend'; bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;scene.frame_set(10)
root=bpy.data.objects['legion-shield-soldier'];body=bpy.data.objects['legion-body-pivot'];coll=root.users_collection[0]; camera=scene.camera
parts=[o for o in coll.objects if o.type=='MESH']
for obj in coll.objects:
 if obj.animation_data:obj.animation_data_clear()
for name in ('legion-body-pivot','legion-shield-shoulder','legion-spear-shoulder'):
 o=bpy.data.objects[name];o.rotation_mode='QUATERNION';o.rotation_quaternion=Quaternion((1,0,0,0))
legs=[]
for side in ('right','left'):
 obj=bpy.data.objects.new('walk '+side+' leg pivot',None);coll.objects.link(obj);obj.parent=root;obj.location=(0,0,0)
 for part in parts:
  if part.name.startswith((side+' boot',side+' leg')):
   before=part.matrix_world.copy();part.parent=obj;part.matrix_world=before
 legs.append(obj)
D=Vector((-.82,.57,0)).normalized();scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.fps=30;scene.frame_start=1;scene.frame_end=25

def foot(phase):
 # Half the cycle pushes the body forward while planted; the opposite foot
 # is lifted and recovered to the front. Keys are linear and loop exactly.
 if phase<=.5:return (.34-.68*phase*2,0)
 q=(phase-.5)*2;return (-.34+.68*q,.14*math.sin(math.pi*q))
for index in range(9):
 phase=(index%8)/8; frame=1+index*3
 for leg,offset in zip(legs,(0,.5)):
  u=(phase+offset)%1;travel,lift=foot(u);leg.location=D*travel+Vector((0,0,lift));leg.keyframe_insert(data_path='location',frame=frame)
 body.location.z=.82+.025*(1-math.cos(phase*4*math.pi));body.keyframe_insert(data_path='location',frame=frame)
for o in legs+[body]:
 o.animation_data.action.name='Legion shield walk / '+o.name
 for curve in o.animation_data.action.fcurves:
  for key in curve.keyframe_points:key.interpolation='LINEAR'

# During each half-cycle the planted foot travels .68 model units backwards
# relative to the body, so a full forward cycle must advance 1.36 units.
# Verify the interpolated joint positions, not just the eight baked samples.
support=[]; min_ground=1; max_support_drift=0
for i in range(81):
 phase=i/80;f=1+phase*24;scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
 heights=[leg.location.z for leg in legs];min_ground=min(min_ground,*heights)
 assert min(heights)>=-.00001 and min(abs(v) for v in heights)<.00001,(phase,heights)
 if phase<=.5: support.append((0,legs[0].location.dot(D)+1.36*phase))
 if .5<=phase<=1: support.append((1,legs[1].location.dot(D)+1.36*phase))
for leg in (0,1):
 values=[v for side,v in support if side==leg];max_support_drift=max(max_support_drift,max(values)-min(values))
assert max_support_drift<.00001,max_support_drift

# Preserve one camera and one crop across all frames. Sample every vertex after
# deformation; feet cannot go below the original ground, at least one remains planted.
bounds=[];all_points=[];samples=[]
for i in range(8):
 scene.frame_set(1+i*3);bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();points=[];minima={}
 for part in parts:
  obj=part.evaluated_get(dep);mesh=obj.to_mesh();name=part.name
  for vertex in mesh.vertices:
   world=obj.matrix_world@vertex.co;point=world_to_camera_view(scene,camera,world);points.append((point.x*384,(1-point.y)*384))
   for side in ('left','right'):
    if name.startswith(side+' boot'): minima[side]=min(minima.get(side,100),world.z)
  obj.to_mesh_clear()
 assert min(minima.values())>=-.002,(i,minima)
 assert min(abs(v) for v in minima.values())<.002,(i,minima)
 bbox=[min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
 assert bbox[0]>1 and bbox[1]>1 and bbox[2]<383 and bbox[3]<383,(i,bbox)
 bounds.append([round(x,3) for x in bbox]);samples.append({'frame':i,'feet_min_z':{k:round(v,6) for k,v in minima.items()}});all_points+=points
 scene.render.filepath=str(FRAMES/f'legion-shield-walk-{i}.png');bpy.ops.render.render(write_still=True)
left=max(0,math.floor(min(x for x,y in all_points))-3);top=max(0,math.floor(min(y for x,y in all_points))-3);right=min(384,math.ceil(max(x for x,y in all_points))+3);bottom=min(384,math.ceil(max(y for x,y in all_points))+3);crop=[left,top,right-left,bottom-top]
old=json.loads((PUBLIC/'legion-shield.json').read_text());body_span=old['frame']['body_span'];display_scale=round(max(crop[2:])/body_span*1.22,6)
# Preserve the bash atlas crop centre so changing from walk to hit doesn't
# shift the entire character even though the leg motion changes its bounds.
base=old['frame']['crop'];cx=base[0]+base[2]/2
radius=math.ceil(max(cx-min(crop[0],base[0]),max(crop[0]+crop[2],base[0]+base[2])-cx))
left=math.floor(cx-radius);right=math.ceil(cx+radius);top=min(crop[1],base[1]);bottom=max(crop[1]+crop[3],base[1]+base[3]);crop=[left,top,right-left,bottom-top]
display_scale=round(max(crop[2:])/body_span*1.22,6)
atlas=PUBLIC/'legion-shield-walk-atlas.webp';inputs=[]
for i in range(8):inputs.extend(['-i',str(FRAMES/f'legion-shield-walk-{i}.png')])
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex','hstack=inputs=8','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(atlas)],check=True)
preview=PUBLIC/'legion-shield-walk.png';shutil.copyfile(FRAMES/'legion-shield-walk-0.png',preview)
# Camera projection is affine: advance one full 1.36-unit cycle and
# preserve body scale when mapping to the 43-unit Legion battlefield sprite.
a=world_to_camera_view(scene,camera,Vector((0,0,0)));b=world_to_camera_view(scene,camera,D*1.36);projected=((a.x-b.x)*384,(a.y-b.y)*384);stride_ratio=math.hypot(*projected)*display_scale/max(crop[2:])
scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT')
for o in coll.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
model=PUBLIC/'legion-shield-walk.glb';bpy.ops.export_scene.gltf(filepath=str(model),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='legion-shield-walk',export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True)
new_source=SOURCE/'legion-shield-walk.blend';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(new_source))
files=[atlas,model,preview]+[FRAMES/f'legion-shield-walk-{i}.png' for i in range(8)]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
meta={'id':'legion-shield-walk','source':str(new_source.relative_to(ROOT)),'base_source':str(source.relative_to(ROOT)),'base_source_sha256':sha(source),'source_sha256':sha(new_source),'generator':'tools/blender/build_legion_shield_walk.py','regeneration_command':'blender --background --python-exit-code 1 --python tools/blender/build_legion_shield_walk.py','camera':'legion-shield shared orthographic','clip':'legion-shield-walk','duration_seconds':.8,'frame':{'width':384,'height':384,'ground_y':330,'crop':crop,'body_span':body_span,'display_scale':display_scale},'model_stride':1.36,'projected_stride_per_display_size':stride_ratio,'continuous_checks':{'samples':81,'min_leg_z':min_ground,'max_support_drift':max_support_drift},'bounds':bounds,'samples':samples,'files':[{'file':str(p.relative_to(ROOT)),'sha256':sha(p),'bytes':p.stat().st_size} for p in files]}
(PUBLIC/'legion-shield-walk.json').write_text(json.dumps(meta,indent=2)+'\n')
settings={'width':384,'height':384,'crop':crop,'groundY':330,'displayScale':display_scale,'stridePerSize':stride_ratio}
(ROOT/'src/games/legion/shieldWalkFrame.ts').write_text('// Generated by tools/blender/build_legion_shield_walk.py.\nexport const SHIELD_WALK_FRAME = '+json.dumps(settings,separators=(',',':'))+' as const;\n')
print('LEGION_SHIELD_WALK_COMPLETE '+json.dumps({'crop':crop,'display_scale':display_scale,'stride_ratio':stride_ratio,'samples':samples,'files':len(files)}))
