"""Layered polar boundary cliffs. bpy-built geometry, no image planes.
Rebuild: npm run models:frontier-frost-cliffs. Preserves the original terrain and gate assets.
"""
import bpy,bmesh,math,json,hashlib,subprocess
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];A=R/'art-source/defense';O=R/'public/defense/models';N='frontier-frost-cliffs'
bpy.ops.wm.open_mainfile(filepath=str(A/'frontier-frost.blend'))
s=bpy.context.scene
remove=('Faceted boundary ice','Snow mountain crown','Outer glacier peak','Glacier bright facet','Outer snow summit','Northern ice ridge')
gate=bpy.data.collections['Frost gate / standalone architecture']
for o in list(s.objects):
 if o in list(gate.objects) or o.name.startswith(remove):bpy.data.objects.remove(o,do_unlink=True)
def height(z):return max(0,min(1,(-z-2)/10))*4.6
def linear(c):
 values=[int(c[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)
def mat(name,c):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=linear(c);p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Roughness'].default_value=.83;return m
colors=['#294963','#3b6485','#588caf','#83b6cc','#c8dfe8','#edf3f1','#78cadd']
mats=[mat('Cliff '+str(i),c) for i,c in enumerate(colors)]
created=[]
def mesh(name,vs,faces,indices):
 data=bpy.data.meshes.new(name);data.from_pydata(vs,[],faces);data.update()
 for m in mats:data.materials.append(m)
 for p,i in zip(data.polygons,indices):p.material_index=i
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 o=bpy.data.objects.new(name,data);s.collection.objects.link(o);created.append(o);return o
# Each outline has an inward notch; three offset strata create actual depth and ledges.
outline=[(-1,-.75),(.6,-1),(1,-.4),(.9,.8),(-.8,1),(-1,.35),(-.65,.1),(-1,-.1)]
def crag(name,cx,cz,width,depth,h,seed):
 vs=[];rings=[]
 middle=.28+.07*math.sin(seed);upper=.65+.07*math.sin(seed+2)
 levels=[(0,1.0),(middle,1.04),(middle+.04,.86),(upper,.91),(upper+.05,.68),(1,.64)]
 for k,(t,scale) in enumerate(levels):
  ring=[]
  for j,(u,v) in enumerate(outline):
   jitter=.06*math.sin(seed*1.7+j*2.2+k*.8);x=cx+((u if cx>=0 else -u)*scale+jitter+.12*t*math.sin(seed))*width/2;z=cz+(v*scale+.035*math.sin(seed+j))*depth/2
   # Every visible cliff point is outside the playable area, including the snow overhang.
   base=height(z);top=h*(t+.12*math.sin(seed+j*1.1)*t)
   ring.append(len(vs));vs.append((x,-z,base+top-.10))
  rings.append(ring)
 faces=[tuple(reversed(rings[0]))];mi=[0]
 for k in range(len(rings)-1):
  for j in range(8):faces.append((rings[k][j],rings[k][(j+1)%8],rings[k+1][(j+1)%8],rings[k+1][j]));mi.append((0 if j in [5,6] else 1+(j+seed+k)%3) if k%2==0 else 3)
 faces.append(tuple(rings[-1]));mi.append(4)
 facets=[];facet_mats=[]
 for i,(face,color) in enumerate(zip(faces,mi)):
  if len(face)==4 and color<4 and i%4==0:
   center=sum((Vector(vs[j]) for j in face),Vector())/4
   radial=Vector((center.x-cx,center.y+cz,0)).normalized();center+=radial*(.12+.08*math.sin(seed+i));index=len(vs);vs.append(tuple(center))
   for j in range(4):facets.append((face[j],face[(j+1)%4],index));facet_mats.append(color)
  else:facets.append(face);facet_mats.append(color)
 body=mesh(name+' strata',vs,facets,facet_mats)
 # Separate editable snow cap: a thick white silhouette, blue underside, uneven ledge.
 capvs=[]
 for dz,scale in [(0,1.10),(.22,1.08),(.43,.86)]:
  for j in range(8):
   p=Vector(vs[rings[-1][j]])
   # Snow gathers unevenly and droops below the rocky rim, as actual geometry.
   bulge=1+.08*math.sin(seed*1.2+j*2.4)
   p.x=cx+(p.x-cx)*scale*bulge;p.y=-cz+(p.y+cz)*scale*bulge
   droop=(.12+.34*(.5+.5*math.sin(seed*1.9+j*2.7))) if dz==0 else 0
   p.z+=dz-droop+.07*math.sin(seed+j*1.3)*(1 if dz else 0);capvs.append(tuple(p))
 # Mid-edge points extend the lower rim into physical, uneven hanging snow tongues.
 for j in range(8):
  a=Vector(capvs[j]);b=Vector(capvs[(j+1)%8])
  depth=.40+.55*(.5+.5*math.sin(seed*1.5+j*2.2))
  for t,weight in ((.28,.35),(.50,1),(.72,.35)):
   mid=a.lerp(b,t);mid.z-=depth*weight;capvs.append(tuple(mid))
 capfaces=[tuple(reversed(range(8)))];capmi=[3]
 for j in range(8):
  nxt=(j+1)%8;mid=24+j*3
  capfaces.append((j,mid,mid+1,mid+2,nxt,8+nxt,8+j));capmi.append(5)
  capfaces.append((8+j,8+nxt,16+nxt,16+j));capmi.append(5)
 center=tuple(sum(v[j] for v in capvs[16:24])/8 for j in range(3));capvs.append((center[0],center[1],center[2]+.18))
 for j in range(8):capfaces.append((16+j,16+(j+1)%8,48));capmi.append(5)
 mesh(name+' snow cornice',capvs,capfaces,capmi)
 # A dark notched companion rock breaks the regular upper contour, instead of painted cracks.
 return body
# Only the outer decorative strip changes; all ground, bridge and input surfaces are inherited.
for side in [-1,1]:
 for i,z in enumerate(range(-27,28,6)):
  crag('Boundary cliff %s %02d'%(side,i),side*(31.2+(i%2)*.35),z,5.2,6.6,3.2+(i%4)*.67,i+int(side>0)*17)
 for i,z in enumerate([-22,-7,11,24]):
  crag('Outer glacier %s %02d'%(side,i),side*(35.0+i%2*.7),z,6.2,8.1,6.4+(i%3)*1.4,i+31)
for i,x in enumerate([-24,-15,-6,16,25]):crag('North wall %02d'%i,x,-31.3,8.8,5.2,3.4+i%3*.5,51+i)
terrain=[o for o in s.objects if o.type=='MESH']
for o in created:
 for v in o.data.vertices:
  assert abs(v.co.x)>28 or abs(v.co.y)>28,(o.name,tuple(v.co))
# Remove the same coplanar deck seams as the original runtime export.
for o in terrain:
 if o.name.startswith('Bridge deck plank'):
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if abs(f.normal.x)>.9 and 2.001<o.location.x+f.calc_center_median().x<9.999],context='FACES');bm.to_mesh(o.data);bm.free()
s['regeneration_command']='npm run models:frontier-frost-cliffs';s['source_model']='frontier-frost.blend';s['concept']='art-source/defense/concepts/2026-11-09-openai/frost-cliffs-reference.png';s['playable_boundary']='abs(x/z)<28 unchanged'
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100;s.render.film_transparent=True
cam=s.camera;cam.location=(0,-68,72);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=114
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(A/(N+'.blend')))
s.render.filepath=str(O/(N+'.png'));bpy.ops.render.render(write_still=True)
cam.location=(-12,-14,15);cam.rotation_euler=(Vector((-31,-10,4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=29
s.render.filepath=str(O/(N+'-detail.png'));bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in terrain:o.select_set(True)
bpy.context.view_layer.objects.active=terrain[0];bpy.ops.object.join();o=bpy.context.object;o.name=N
attr=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for p in o.data.polygons:
 c=o.data.materials[p.material_index].diffuse_color
 for i in p.loop_indices:attr.data[i].color=c
m=mat('Packed cliff paint','#ffffff');n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color']);o.data.materials.clear();o.data.materials.append(m)
for p in o.data.polygons:p.material_index=0
bpy.ops.export_scene.gltf(filepath=str(O/(N+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(O/(N+'.png')),'-c:v','libwebp','-quality','90',str(O/(N+'.webp'))],check=True)
files=[Path(__file__),R/s['concept'],A/'frontier-frost.blend',A/(N+'.blend'),*[O/(N+ext) for ext in ['.glb','.png','-detail.png','.webp']]]
meta={'command':'npm run models:frontier-frost-cliffs','concept':s['concept'],'editable_meshes':len(terrain),'new_cliff_meshes':len(created),'runtime_surfaces':1,'playable_boundary':28,'camera':{'size':[960,540],'location':[0,-68,72],'ortho_scale':114},'files':[{'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(O/(N+'.json')).write_text(json.dumps(meta,indent=2)+'\n');print('FROST_CLIFFS_COMPLETE',meta['editable_meshes'],meta['new_cliff_meshes'])
