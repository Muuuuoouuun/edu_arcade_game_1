"""Create the editable Moonlight companion wolf, directional bite/walk bakes and true animated GLBs.
Run npm run models:pet-wolf. Geometry only; no image planes or image inputs.
"""
import argparse,hashlib,json,math,shutil,subprocess,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/defense/models';FRAMES=ROOT/'art-source/defense/moonlight-wolf'
p=argparse.ArgumentParser();p.add_argument('--samples',type=int,default=64);p.add_argument('--check',action='store_true');p.add_argument('--preview',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
COL=bpy.data.collections.new('Moonlight companion / editable parts');bpy.context.scene.collection.children.link(COL);STUDIO=bpy.data.collections.new('Studio / common hero camera');bpy.context.scene.collection.children.link(STUDIO);ROOT_OBJ=None
def material(name,color,metal=0,rough=.55,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 n.inputs['Coat Weight'].default_value=.22 if metal else .035
 n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
 'fur':material('Moonlight / silver fur',(.68,.73,.76),0,.88),
 'white':material('Moonlight / ivory ruff and muzzle',(.93,.92,.84),0,.87),
 'grey':material('Moonlight / cool grey saddle',(.24,.29,.34),0,.9),
 'dark':material('Moonlight / nose and mouth',(.021,.028,.033),0,.62),
 'pink':material('Moonlight / warm inner ear',(.49,.27,.22),0,.87),
 'eye':material('Moonlight / eye whites',(.92,.96,.86),0,.4),
 'green':material('Moonlight / emerald eyes',(.025,.35,.035),.1,.35),
 'cloth':material('Moonlight / forest neckerchief',(.015,.13,.04),0,.88),
 'gold':material('Moonlight / warm gold trim',(.77,.43,.075),.68,.34),
 'gem':material('Moonlight / emerald pendant',(.04,.56,.025),.3,.28,.25),
}



def finish(o,name,mat=None,parent=None,bevel=0,smooth=False):
 o.name=name
 for col in list(o.users_collection):col.objects.unlink(o)
 COL.objects.link(o)
 if mat:o.data.materials.append(M[mat])
 bpy.context.view_layer.update()
 parent=parent or ROOT_OBJ
 if parent:
  matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
 if bevel:
  mod=o.modifiers.new('Forged softened edges','BEVEL');mod.width=bevel;mod.segments=2
  normal=o.modifiers.new('Weighted corners','WEIGHTED_NORMAL');normal.keep_sharp=True
 if smooth and o.type=='MESH':
  for poly in o.data.polygons:poly.use_smooth=True
 return o

def group(name,location=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);COL.objects.link(o);o.empty_display_type='PLAIN_AXES';o.empty_display_size=.15
 o.location=location;bpy.context.view_layer.update()
 if parent:
  matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
 bpy.context.view_layer.update();return o

def cube(name,loc,size,mat,parent=None,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent,bevel)

def ico(name,loc,size,mat,parent=None,sub=2):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent)

def uv(name,loc,size,mat,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=loc);o=bpy.context.object;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,name,mat,parent,smooth=True)

def mesh(name,verts,faces,mat,parent=None,bevel=0):
 d=bpy.data.meshes.new(name+' shape');d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);COL.objects.link(o)
 return finish(o,name,mat,parent,bevel)

def cyl(name,loc,radius,depth,mat,parent=None,vertices=12,bevel=.015):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
 return finish(bpy.context.object,name,mat,parent,bevel)

def rod(name,a,b,r,mat,parent=None,vertices=12):
 a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,parent,vertices)
 o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def beam(name,a,b,width,depth,mat,parent=None):
 a,b=Vector(a),Vector(b);o=cube(name,(a+b)/2,(width,depth,(b-a).length),mat,parent,min(width*.15,.035))
 o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def panel(name,points,y,thick,mat,parent=None,bevel=.02):
 n=len(points);v=[(x,y-thick/2,z) for x,z in points]+[(x,y+thick/2,z) for x,z in points]
 f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,v,f,mat,parent,bevel)

def rivet(name,loc,parent=None,r=.035):return uv(name,loc,(r,r,r),'gold',parent)




ROOT_OBJ=group('moonlight-wolf');body=group('body',(0,0,1.1),ROOT_OBJ);head=group('head',(0,.62,1.62),body);jaw=group('jaw',(0,1.02,1.63),head)
ico('Body / compact silver barrel',(0,-.05,1.10),(.51,.84,.49),'fur',body)
ico('Body / dark saddle',(0,-.19,1.37),(.44,.65,.24),'grey',body)
ico('Chest / full ivory ruff',(0,.48,1.25),(.49,.42,.53),'white',body)
ico('Haunch / rounded rump',(0,-.63,1.01),(.48,.38,.47),'fur',body)
# A short muzzle and large bright eyes distinguish a companion from the enemy's long predatory head.
uv('Head / round silver skull',(0,.78,1.96),(.52,.45,.48),'fur',head)
ico('Head / white muzzle',(0,1.18,1.78),(.33,.37,.24),'white',head)
ico('Head / black nose',(0,1.49,1.86),(.15,.09,.10),'dark',head)
ico('Jaw / lower mouth',(0,1.24,1.60),(.28,.28,.09),'dark',jaw)
ico('Jaw / ivory chin',(0,1.23,1.55),(.28,.27,.10),'white',jaw)
for side in [-1,1]:
 for i in range(2):ico('Jaw / small tooth',(side*.18,1.20+i*.17,1.68),(.035,.04,.065),'white',jaw,1)
 # Face eyes are angled onto the forward cheeks, readable from three-quarter cameras.
 uv('Eye / dark outline',(side*.32,1.125,2.05),(.145,.055,.16),'dark',head)
 uv('Eye / white',(side*.32,1.165,2.055),(.12,.03,.135),'eye',head)
 uv('Eye / green iris',(side*.32,1.192,2.055),(.074,.015,.094),'green',head)
 uv('Eye / pupil',(side*.32,1.205,2.055),(.035,.008,.064),'dark',head)
 uv('Eye / glint',(side*.30,1.214,2.09),(.024,.007,.03),'eye',head)
 ico('Face / ivory eyebrow',(side*.30,1.10,2.25),(.16,.055,.065),'white',head,1)
 for i in range(3):
  pts=[(side*.34,2.04-i*.14),(side*(.65-i*.025),1.98-i*.16),(side*.38,1.84-i*.15)]
  panel('Face / cheek fur',pts,.80,.25,'white' if i%2 else 'fur',head,.018)
ears=[]
for side in [-1,1]:
 ear=group(('left' if side>0 else 'right')+'-ear',(side*.33,.64,2.30),head);ears.append(ear)
 panel('Ear / grey outside',[(side*.12,2.28),(side*.40,2.89),(side*.61,2.30)],.64,.24,'grey',ear,.025)
 panel('Ear / silver edge',[(side*.20,2.34),(side*.40,2.77),(side*.54,2.34)],.775,.035,'white',ear,.014)
 panel('Ear / warm centre',[(side*.29,2.36),(side*.40,2.67),(side*.47,2.36)],.80,.025,'pink',ear,.012)
for side in [-1,1]:
 panel('Ruff / chest fur',[(side*.19,1.59),(side*.53,1.42),(side*.33,.99)],.57,.28,'white',body,.025)
# Collar, folded green scarf and gold setting are modeled instead of being painted on the fur.
for i in range(16):
 a=i*math.tau/16;b=(i+1)*math.tau/16
 for z,mat,r in [(1.38,'cloth',.08),(1.45,'gold',.023),(1.31,'gold',.023)]:
  rod('Collar / band',(.43*math.cos(a),.43+.32*math.sin(a),z),(.43*math.cos(b),.43+.32*math.sin(b),z),r,mat,body,8)
panel('Scarf / green front fold',[(-.38,1.43),(.38,1.43),(0,.93)],.81,.07,'cloth',body,.02)
rod('Scarf / left gold hem',(-.38,.86,1.43),(0,.86,.93),.025,'gold',body,8);rod('Scarf / right gold hem',(.38,.86,1.43),(0,.86,.93),.025,'gold',body,8)
pendant=group('pendant',(0,.88,1.26),body)
panel('Pendant / gold diamond',[(0,1.49),(.20,1.25),(0,1.01),(-.20,1.25)],.90,.10,'gold',pendant,.015)
panel('Pendant / faceted green centre',[(0,1.42),(.13,1.25),(0,1.08),(-.13,1.25)],.97,.07,'gem',pendant,.008)
# Short fluffy tail curls upward. Two links allow delayed follow-through.
tail=group('tail',(0,-.81,1.18),body);tailtip=group('tail-tip',(-.30,-1.13,1.69),tail)
for name,loc,size,mat,parent in [('Tail / base',(-.11,-1.03,1.34),(.25,.33,.29),'grey',tail),('Tail / silver curl',(-.30,-1.14,1.62),(.31,.30,.38),'fur',tail),('Tail / ivory tip',(-.37,-1.08,1.98),(.22,.24,.34),'white',tailtip)]:
 o=ico(name,loc,size,mat,parent);o.rotation_euler.y=-.30
# Root-space limb links are solved from the moving hip, a knee bend and grounded paw target.
paws=[];uppers=[];lowers=[];hips=[];paw_rest=[]
for tag,x,y in [('front-left',-.37,.56),('front-right',.37,.56),('rear-left',-.37,-.58),('rear-right',.37,-.58)]:
 hip=group(tag+'-hip',(x,y,1.18 if y>0 else 1.08),body);hips.append(hip)
 ico(tag+' / soft haunch',(x,y,1.03),(.23,.27,.33),'fur',body)
 paw=group(tag+'-paw',(x,y,.12),ROOT_OBJ);paws.append(paw);paw_rest.append(Vector((x,y,.12)))
 cube(tag+' / sole',(x,y+.06,.075),(.29,.42,.14),'white',paw,.055)
 ico(tag+' / paw dome',(x,y+.05,.18),(.19,.25,.15),'white',paw)
 for dx in [-.08,0,.08]:rod(tag+' / toe crease',(x+dx,y+.24,.10),(x+dx,y+.25,.19),.008,'grey',paw,6)
 for section,out,r,mat in [('upper',uppers,.17,'fur'),('lower',lowers,.12,'white')]:
  joint=group(tag+'-'+section,(0,0,0),ROOT_OBJ);uv(tag+' / '+section,(0,0,.5),(r,r,.60),mat,joint);out.append(joint)
socket=group('bite-socket',(0,1.53,1.77),head)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
world=bpy.data.worlds.new('Moonlight studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.18,.24,.27,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
cam_data=bpy.data.cameras.new('Common hero orthographic camera');camera=bpy.data.objects.new(cam_data.name,cam_data);STUDIO.objects.link(camera);cam_data.type='ORTHO';cam_data.ortho_scale=6.8
camera.location=(7,10,7);camera.rotation_euler=(Vector((0,0,1.7))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.context.view_layer.update();ground=world_to_camera_view(scene,camera,Vector((0,0,0)));cam_data.shift_y+=ground.y-(1-330/384)
for name,loc,power,size,color in [('Warm key',(-4,6,8),850,4,(1,.83,.65)),('Cool fill',(5,3,5),600,4,(.65,.83,1)),('Warm rim',(1,-5,7),1000,3,(1,.80,.52))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);STUDIO.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
def project(v):
 p=world_to_camera_view(scene,camera,Vector(v));return Vector((p.x*384,(1-p.y)*384))
ground=project((0,0,0));px=project((1,0,0))-ground;py=project((0,1,0))-ground;inverse=Matrix(((px.x,py.x),(px.y,py.y))).inverted()


joints=[body,head,jaw,tail,tailtip,pendant,*ears,*paws,*uppers,*lowers];rests={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in joints}
def solve_legs():
 bpy.context.view_layer.update()
 for i,(hip,paw,upper,lower) in enumerate(zip(hips,paws,uppers,lowers)):
  a=hip.matrix_world.translation.copy();b=paw.location.copy();mid=(a+b)*.5;mid.y+=-.10 if i<2 else .17;mid.x+=-.015 if i%2==0 else .015
  for joint,p,q in [(upper,a,mid),(lower,mid,b)]:joint.location=p;joint.rotation_euler=(q-p).to_track_quat('Z','Y').to_euler();joint.scale=(1,1,(q-p).length)
def clear_motion():
 for o in joints:o.animation_data_clear();o.location=rests[o][0];o.rotation_euler=rests[o][1];o.scale=rests[o][2]
 solve_legs()
def key(frame):
 for o in joints:
  for path in ['location','rotation_euler','scale']:o.keyframe_insert(data_path=path,frame=frame)
def animate(mode):
 clear_motion();scene.render.fps=100;scene.frame_start=1;scene.frame_end=42 if mode=='bite' else 81
 if mode=='bite':
  # Plant every paw, gather the chest, open the jaw, snap at the existing .13 second contact, settle.
  poses=[(1,0,0,0,0,0),(5,-.055,-.075,.055,-.08,.04),(9,-.14,-.15,.12,-.44,.12),(12,-.035,-.10,.015,-.32,.15),(14,.25,-.025,-.19,0,.07),(20,.16,-.06,-.12,-.025,-.13),(29,.045,-.035,-.025,0,-.06),(37,-.01,-.008,.015,0,.025),(42,0,0,0,0,0)]
  for frame in range(1,43):
   a=next(p for p in reversed(poses) if p[0]<=frame);b=next((p for p in poses if p[0]>frame),a);t=(frame-a[0])/max(1,b[0]-a[0]);t=t*t*(3-2*t);v=[a[i]+(b[i]-a[i])*t for i in range(1,6)]
   body.location=rests[body][0]+Vector((0,v[0],v[1]));body.rotation_euler.x=v[2]*.22;body.rotation_euler.z=-v[2]*.15;head.rotation_euler.z=v[2]*.25;head.rotation_euler.x=v[2];jaw.rotation_euler.x=v[3];tail.rotation_euler.x=v[4];tailtip.rotation_euler.x=-v[4]*.7;pendant.rotation_euler.x=-v[4]*.6
   for i,e in enumerate(ears):e.rotation_euler.x=v[4]*.4;e.rotation_euler.y=v[4]*(.3 if i else -.3)
   solve_legs();key(frame)
 else:
  for frame in range(81):
   phase=frame/80;s=math.sin(phase*math.tau)
   body.location=rests[body][0]+Vector((.014*s,0,.024*(1-math.cos(phase*math.tau*2))));head.rotation_euler.x=.025*s;tail.rotation_euler.z=.12*s;tailtip.rotation_euler.z=-.08*s;pendant.rotation_euler.x=.08*s
   for i,e in enumerate(ears):e.rotation_euler.x=.025*s
   for i,paw in enumerate(paws):
    p=(phase+(0 if i in [0,3] else .5))%1;forward=.17-.68*p if p<.5 else -.17+.34*(p-.5)*2;lift=0 if p<.5 else .11*math.sin((p-.5)*2*math.pi)
    paw.location=paw_rest[i]+Vector((0,forward,lift))
   solve_legs();key(frame+1)
 for o in joints:
  o.animation_data.action.name='Moonlight '+mode+' / '+o.name
  for curve in o.animation_data.action.fcurves:
   for k in curve.keyframe_points:k.interpolation='LINEAR'
 scene.frame_set(1);bpy.context.view_layer.update()
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
   objects[0].name=f'Moonlight surface {i+1:02}'
  meshes=[o for o in export_col.objects if o.type=='MESH'];tris=0
  for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
  bpy.ops.object.select_all(action='DESELECT')
  for o in export_col.objects:o.select_set(True)
  bpy.context.view_layer.objects.active=clones[ROOT_OBJ]
  bpy.ops.export_scene.gltf(filepath=str(OUT/f'{asset_id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=clip_name,export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_extras=True)
  return {'mesh_objects':len(meshes),'triangles':tris,'materials':len({m.name for o in meshes for m in o.data.materials})}
 finally:
  for o in list(export_col.objects):bpy.data.objects.remove(o,do_unlink=True)
  bpy.data.collections.remove(export_col)
  for o,name in names.items():o.name=name

OUT.mkdir(parents=True,exist_ok=True);FRAMES.mkdir(parents=True,exist_ok=True)
manifest={'generator':'tools/blender/build_pet_wolf.py','command':'npm run models:pet-wolf','reference':'public/defense/snow-atlas.png','reference_actor':'Moonlight companion / second row left','additional_concept':'art-source/defense/concepts/2026-10-29/variants/silverfrost-wolf-variants.png','reference_sha256':hashlib.sha256((ROOT/'public/defense/snow-atlas.png').read_bytes()).hexdigest(),'frame':{'width':384,'height':384,'ground':list(ground),'orthographic_scale':6.8,'display_scale':1.2*6.8/5.8},'delivery_frame':{'width':256,'height':256,'ground':[128,220]},'render':{'engine':'Cycles CPU','samples':args.samples},'clips':[],'directions':{'bite':[],'walk':[]},'files':[]}
for mode in ['bite','walk']:
 animate(mode);asset_id='moonlight-wolf'+('-walk' if mode=='walk' else '');clip_name='moonlight-'+mode
 poses=[('ready',1),('gather',5),('windup',9),('launch',12),('strike',14),('rebound',20),('recover',29),('settle',37)] if mode=='bite' else [(str(i),1+i*10) for i in range(8)]
 for direction in range(8):
  angle=direction*math.tau/8;world=inverse@Vector((math.cos(angle),math.sin(angle)));world.normalize();ROOT_OBJ.rotation_euler.z=math.atan2(-world.x,world.y);entry={'index':direction,'yaw':ROOT_OBJ.rotation_euler.z,'poses':[]}
  for name,frame in poses:
   scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
   for obj in COL.objects:
    if obj.type=='MESH':
     ev=obj.evaluated_get(graph);points.extend(project(ev.matrix_world@Vector(c)) for c in ev.bound_box)
   bounds=[min(v.x for v in points),min(v.y for v in points),max(v.x for v in points),max(v.y for v in points)];assert min(bounds[:2])>4 and max(bounds[2:])<380,(mode,direction,name,bounds)
   entry['poses'].append({'name':name,'frame':frame,'bounds':bounds,'socket':list(project(socket.matrix_world.translation))})
   if args.preview:
    if mode=='bite' and direction in [0,1]:scene.render.filepath=f'/tmp/arcana-pet-wolf-preview-{direction}-{name}.png';bpy.ops.render.render(write_still=True)
   elif not args.check:scene.render.filepath=str(FRAMES/f'moonlight-{mode}-{direction}-{name}.png');bpy.ops.render.render(write_still=True)
  manifest['directions'][mode].append(entry)
  if not args.check and not args.preview:
   dst=OUT/f'moonlight-{mode}-{direction}-atlas.webp';inputs=sum((['-i',str(FRAMES/f'moonlight-{mode}-{direction}-{name}.png')] for name,_ in poses),[])
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',f'hstack=inputs={len(poses)},scale={256*len(poses)}:256:flags=lanczos','-frames:v','1','-c:v','libwebp','-quality','88','-compression_level','6',str(dst)],check=True)
   manifest['files'].append({'file':str(dst.relative_to(ROOT)),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
  print('DIRECTION_COMPLETE',mode,direction,flush=True)
 ROOT_OBJ.rotation_euler.z=0;scene.frame_set(1);bpy.context.view_layer.update()
 if not args.check and not args.preview:
  stats=export_runtime();scene['regeneration_command']='npm run models:pet-wolf';bpy.context.preferences.filepaths.save_version=0;source=ROOT/f'art-source/defense/{asset_id}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));shutil.copyfile(FRAMES/f'moonlight-{mode}-1-{poses[0][0]}.png',OUT/f'{asset_id}.png')
  manifest['clips'].append({'asset':asset_id,'clip':clip_name,'fps':100,'first_frame':1,'last_frame':scene.frame_end,'duration_seconds':(scene.frame_end-1)/100,'baked_frames':[frame for _,frame in poses],'hit_seconds':.13 if mode=='bite' else None,'runtime':stats,'source':str(source.relative_to(ROOT))})
  for path in [source,OUT/f'{asset_id}.glb',OUT/f'{asset_id}.png']:manifest['files'].append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
if not args.check and not args.preview:
 (OUT/'moonlight-wolf.json').write_text(json.dumps(manifest,indent=2)+'\n')
 coords=[[[round((p['socket'][0]-192)/384*manifest['frame']['display_scale'],7),round((p['socket'][1]-330)/384*manifest['frame']['display_scale'],7)] for p in d['poses']] for d in manifest['directions']['bite']]
 (ROOT/'src/games/defense/petWolfSockets.ts').write_text('// Generated by tools/blender/build_pet_wolf.py from the actual bite socket.\nexport const PET_WOLF_SOCKETS = '+json.dumps(coords)+' as const;\n')
print('PET_WOLF_CHECK_PASS' if args.check or args.preview else 'PET_WOLF_BAKE_PASS',flush=True)
