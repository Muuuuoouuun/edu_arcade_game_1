"""Brace against knockback and return to the frozen walking stance.
Regenerate: npm run models:wolf-brace. Existing stride/collapse assets remain intact.
"""
import bpy,math,json,hashlib,argparse,sys,subprocess,shutil,struct
from pathlib import Path
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'art-source/defense/frost-wolf-stride.blend';OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/wolf-brace';FRAMES.mkdir(exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;COL=bpy.data.collections['Frost wolf / editable parts'];root=bpy.data.objects['wolf-root'];heading=bpy.data.objects['wolf-heading'];heading.rotation_euler.z=0
keys=['near-front','far-front','near-back','far-back'];legs={k:bpy.data.objects['leg-'+k] for k in keys};knees={k:bpy.data.objects['knee-'+k] for k in keys};feet={k:bpy.data.objects['foot-'+k] for k in keys}
animated=[root,*[bpy.data.objects[n] for n in ['neck','head','jaw','tail']],*legs.values(),*knees.values(),*feet.values()]
starts=[];anchors=[]
for gait in range(8):
 scene.frame_set(1+gait*10);bpy.context.view_layer.update();starts.append({o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in animated});anchors.append({k:feet[k].matrix_world.translation.copy() for k in keys})
for o in COL.objects:o.animation_data_clear()
scene.render.fps=200;scene.frame_start=1;scene.frame_end=109;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.cycles.samples=48
smooth=lambda t:max(0,min(1,t))**2*(3-2*max(0,min(1,t)))
def pose(gait,frame):
 t=(frame-1)/200;weight=smooth(t/.08) if t<=.08 else 1-smooth((t-.08)/.46)
 for o in animated:o.location,o.rotation_euler,o.scale=starts[gait][o.name]
 root.location.x-=.07*weight;root.location.z-=.16*weight;root.rotation_euler.y+=.07*weight
 bpy.data.objects['neck'].rotation_euler.y+=.06*weight;bpy.data.objects['head'].rotation_euler.y-=.09*weight;bpy.data.objects['jaw'].rotation_euler.y+=.04*weight
 tail=bpy.data.objects['tail'];tail.rotation_euler.x+=.08*weight;tail.rotation_euler.y-=.12*weight
 targets={k:Vector((v.x+(.07 if 'front' in k else -.04)*weight,v.y,v.z+(.16-v.z)*weight)) for k,v in anchors[gait].items()}
 bpy.context.view_layer.update()
 for k,leg in legs.items():
  target=root.matrix_world.inverted()@targets[k]-leg.location;tx,tz=target.x,target.z;l1=.85;l2=math.hypot(.2,.57);beta=-math.atan2(.2,.57)
  cosine=(tx*tx+tz*tz-l1*l1-l2*l2)/(2*l1*l2);assert -1<=cosine<=1,(gait,frame,k,cosine)
  bend=(-1 if 'front' in k else 1)*math.acos(cosine);theta=math.atan2(-tx,-tz)-math.atan2(l2*math.sin(bend),l1+l2*math.cos(bend))
  leg.rotation_euler=(0,theta,0);knees[k].rotation_euler=(0,bend-beta,0);feet[k].rotation_euler=(0,-root.rotation_euler.y-theta-bend+beta,0)
 bpy.context.view_layer.update()
 return targets
actions=[];records=[];max_error=0;max_tilt=0;min_paw=1
for gait in range(8):
 for o in animated:o.animation_data_clear()
 for frame in range(1,110):
  targets=pose(gait,frame);row={}
  for k,foot in feet.items():
   err=(foot.matrix_world.translation-targets[k]).length;max_error=max(max_error,err);assert err<1e-5
   tilt=(foot.matrix_world.to_3x3()@Vector((0,0,1))).normalized().angle(Vector((0,0,1)));max_tilt=max(max_tilt,tilt);assert tilt<1e-4
   paw=bpy.data.objects['paw-'+k];bottom=min((paw.matrix_world@v.co).z for v in paw.data.vertices);min_paw=min(min_paw,bottom);assert bottom>-.0001
   row[k]={'target':list(targets[k]),'lowest_paw':bottom}
  floor=min((o.matrix_world@v.co).z for o in COL.objects if o.type=='MESH' for v in o.data.vertices);assert floor>-.001,(gait,frame,floor)
  records.append({'gait':gait,'frame':frame,'feet':row,'lowest_vertex':floor})
  for o in animated:
   for prop in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=prop,frame=frame)
 group=[]
 for o in animated:
  a=o.animation_data.action;a.name=f'Frost wolf brace {gait} / {o.name}';a.use_fake_user=True;group.append(a)
  for c in a.fcurves:
   for key in c.keyframe_points:key.interpolation='LINEAR'
 actions.append(group)
def activate(gait):
 for o,a in zip(animated,actions[gait]):o.animation_data_create();o.animation_data.action=a
 scene.frame_set(1);bpy.context.view_layer.update()
camera=scene.camera
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()
manifest={'source':'art-source/defense/frost-wolf-brace.blend','generator':'tools/blender/build_frostwolf_brace.py','regeneration_command':'npm run models:wolf-brace','base_source':str(SOURCE.relative_to(ROOT)),'base_source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'reference':'art-source/defense/concepts/2026-10-29/beasts/silverfrost-wolf.png','frame':{'width':384,'height':384,'ground':list(ground),'crop':[8,40,368,304],'orthographic_scale':camera.data.ortho_scale,'display_scale':368/(315/1.12)},'delivery_frame':{'width':192,'height':192,'ground':list(ground/2),'crop':[4,20,184,152],'columns':8,'rows':3},'duration':.54,'fps':200,'samples_seconds':[.10,.30,.46],'velocity_cutoffs':[65,22,7],'checks':{'samples':872,'max_paw_target_error':max_error,'max_paw_tilt':max_tilt,'min_paw_height':min_paw},'samples':records,'clips':[],'directions':[],'files':[],'render':{'engine':'Cycles CPU','samples':48}}
if args.check:print('FROST_BRACE_CHECK_PASS',json.dumps(manifest['checks']));sys.exit(0)
exports=[]
for gait in range(8):
 activate(gait);heading.rotation_euler.z=0;bpy.ops.object.select_all(action='DESELECT')
 for o in COL.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=root;path=OUT/f'frost-wolf-brace-{gait}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=f'frost-wolf-brace-{gait}',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True)
 exports.append(path);manifest['clips'].append({'name':f'frost-wolf-brace-{gait}','gait':gait,'duration':.54})
def read_glb(path):
 data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);off=20+length;blen=struct.unpack_from('<I',data,off)[0];return doc,bytearray(data[off+8:off+8+blen])
base,blob=read_glb(exports[0]);names={n['name']:i for i,n in enumerate(base['nodes']) if 'name' in n}
for path in exports[1:]:
 doc,binary=read_glb(path);mapping={};clip=doc['animations'][0]
 for sampler in clip['samplers']:
  for key in ['input','output']:
   old=sampler[key]
   if old not in mapping:
    a=dict(doc['accessors'][old]);v=doc['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]*4;assert a['componentType']==5126
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);payload=b''.join(binary[offset+i*stride:offset+i*stride+size] for i in range(a['count']))
    while len(blob)%4:blob.append(0)
    a['bufferView']=len(base['bufferViews']);a.pop('byteOffset',None);base['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(payload)});blob.extend(payload);mapping[old]=len(base['accessors']);base['accessors'].append(a)
   sampler[key]=mapping[old]
 for channel in clip['channels']:channel['target']['node']=names[doc['nodes'][channel['target']['node']]['name']]
 base['animations'].append(clip)
base['buffers'][0]['byteLength']=len(blob);j=json.dumps(base,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
dest=OUT/'frost-wolf-brace.glb';dest.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
for path in exports:path.unlink()
manifest['runtime']={'meshes':len(base['meshes']),'triangles':sum(base['accessors'][p['indices']]['count']//3 for m in base['meshes'] for p in m['primitives']),'materials':len(base['materials'])}
for direction in range(8):
 world=inverse@Vector((math.cos(direction*math.tau/8),math.sin(direction*math.tau/8)));world.normalize();heading.rotation_euler.z=math.atan2(world.y,world.x)
 inputs=[];entry={'direction':direction,'yaw':heading.rotation_euler.z,'poses':[]}
 for gait in range(8):
  activate(gait)
  for sample,frame in enumerate([21,61,93]):
   scene.frame_set(frame);bpy.context.view_layer.update();points=[]
   for o in COL.objects:
    if o.type=='MESH':points.extend(project(o.matrix_world@v.co) for v in o.data.vertices)
   bounds=[min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)];assert bounds[0]>8 and bounds[1]>40 and bounds[2]<376 and bounds[3]<344,(direction,gait,sample,bounds)
   entry['poses'].append({'gait':gait,'sample':sample,'frame':frame,'bounds':bounds});path=FRAMES/f'frost-brace-{direction}-{gait}-{sample}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
 inputs=sum((['-i',str(FRAMES/f'frost-brace-{direction}-{gait}-{sample}.png')] for sample in range(3) for gait in range(8)),[])
 layout='|'.join(f'{(i%8)*384}_{(i//8)*384}' for i in range(24))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'xstack=inputs=24:layout={layout},scale=1536:576:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','90',str(OUT/f'frost-brace-{direction}-atlas.webp')],check=True)
 manifest['directions'].append(entry);print('DIRECTION_DONE',direction,flush=True)
heading.rotation_euler.z=0;activate(0);scene['regeneration_command']='npm run models:wolf-brace';scene['gait_actions']='Assign Frost wolf brace N / JOINT to all 17 named joints; N=0..7.';bpy.context.preferences.filepaths.save_version=0
blend=ROOT/manifest['source'];bpy.ops.wm.save_as_mainfile(filepath=str(blend));shutil.copyfile(FRAMES/'frost-brace-0-0-0.png',OUT/'frost-wolf-brace.png')
manifest['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();manifest['reference_sha256']=hashlib.sha256((ROOT/manifest['reference']).read_bytes()).hexdigest()
for path in [blend,dest,OUT/'frost-wolf-brace.png',*sorted(FRAMES.glob('*.png')),*sorted(OUT.glob('frost-brace-*-atlas.webp'))]:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'frost-wolf-brace.json').write_text(json.dumps(manifest,indent=2)+'\n');print('FROST_BRACE_BAKE_PASS',flush=True)
