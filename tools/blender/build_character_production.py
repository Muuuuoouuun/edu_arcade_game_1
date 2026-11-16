"""Build three shared, textured character deliveries from preserved editable sources.

Blender 4.3: blender -b -t 4 --python-exit-code 1 --python tools/blender/build_character_production.py -- --hero all
Analytic material atlases are authored here; reference illustrations are never projected onto geometry.
The hero pass in tools/blender/enhance_heroes.py (proportions, faces, accents, painted occlusion bake) runs by default;
--legacy rebuilds the previous delivery for comparisons. Also runs with the bpy 5.x module:
python tools/blender/build_character_production.py -- --hero all
"""
import argparse, hashlib, json, math, struct, sys, zlib
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import enhance_heroes

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art-source/defense/characters-v2'
PUBLIC = ROOT / 'public/defense/models/characters-v2'
CONFIG = {
 'ranger': ('gecko-ranger', 'art-source/defense/prototypes/gecko-ranger/gecko-ranger.blend', 'gecko-ranger', 'gecko-seed-shot', 31, 'art-source/defense/concepts/2026-11-09/gecko-ranger.png'),
 'bron': ('dwarf-guardian', 'art-source/defense/dwarf.blend', 'dwarf-guardian', 'dwarf-hammer-attack', 25, 'public/defense/atlas.png'),
 'bear': ('polar-bear', 'art-source/defense/prototypes/polar-bear/polar-bear.blend', 'polar-bear-guardian', 'polar-bear-attack', 25, 'art-source/defense/concepts/2026-11-09/polar-bear-guardian.png'),
}
p = argparse.ArgumentParser(); p.add_argument('--hero', choices=['all', *CONFIG], default='all'); p.add_argument('--skip-render', action='store_true'); p.add_argument('--samples', type=int, default=64); p.add_argument('--legacy', action='store_true', help='skip the hero pass (previous delivery)')
args = p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

def png(path, rgb):
    """Write generated texture data, with no image-library or remote-service dependency."""
    a = np.uint8(np.clip(rgb, 0, 1)*255+.5); h,w,c = a.shape
    def chunk(tag, data): return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    raw = b''.join(b'\0'+row.tobytes() for row in a)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))

def srgb(c): return np.where(c<=.0031308,c*12.92,1.055*np.power(np.maximum(c,0),1/2.4)-.055)

def category(name):
    n=name.lower()
    if any(x in n for x in ['eye','pupil','gleam','glint','nose','muzzle','throat','belly','skin /']): return 'smooth'
    if 'gecko spring' in n or 'orange markings' in n: return 'scales'
    if 'leaf' in n: return 'leaf'
    if any(x in n for x in ['fur','hair','beard']): return 'fur'
    if any(x in n for x in ['cloth','wool','navy']): return 'cloth'
    if any(x in n for x in ['wood','chestnut']): return 'wood'
    if 'leather' in n: return 'leather'
    if any(x in n for x in ['stone','granite']): return 'stone'
    if 'ice' in n: return 'ice'
    return 'metal'

def make_atlas(materials, folder):
    size=1024; grid=math.ceil(math.sqrt(len(materials))); cell=size//grid; pad=8
    color=np.full((size,size,3),.5); normal=np.zeros((size,size,3));normal[:]=(.5,.5,1); orm=np.ones((size,size,3));orm[:,:,1]=.7;orm[:,:,2]=0
    for i,m in enumerate(materials):
        bs=m.node_tree.nodes.get('Principled BSDF'); base=np.array(bs.inputs['Base Color'].default_value[:3]); rough=bs.inputs['Roughness'].default_value; metal=bs.inputs['Metallic'].default_value
        y,x=np.mgrid[0:cell,0:cell];u=np.clip((x-pad)/(cell-2*pad),0,1);v=np.clip((y-pad)/(cell-2*pad),0,1)
        kind=category(m.name); h=np.zeros_like(u); light=np.ones_like(u)
        grain=.5*np.sin(u*39+v*23)+.3*np.sin(u*83-v*57)+.2*np.cos(v*113+u*17)
        if kind=='scales':
            xx=(u*9+(np.floor(v*10)%2)*.5)%1-.5; yy=(v*10)%1-.5
            d=(xx/.51)**2+(yy/.55)**2; h=np.maximum(0,1-d)*.55
            light=.92+.12*h-.10*np.exp(-((d-.92)/.12)**2)
        elif kind=='leaf':
            mid=np.exp(-((u-.5)/.018)**2); veins=np.exp(-(np.sin((v-np.abs(u-.5)*.8)*math.pi*7)/.14)**2)
            h=.35*mid+.14*veins;light=.96+.14*mid+.065*veins+.035*grain
        elif kind=='wood':
            lines=np.sin((u*13+.15*np.sin(v*8))*math.pi);h=.12*lines
            light=.94+.095*lines+.025*grain
        elif kind=='leather':
            seams=np.exp(-((u-.12)/.012)**2)+np.exp(-((u-.88)/.012)**2)
            stitch=seams*(np.cos(v*math.pi*24)>.25);h=.18*stitch
            light=.95+.18*stitch+.025*grain
        elif kind=='fur':
            tufts=np.cos((u*13+np.sin(v*17)*.35)*math.pi)*np.sin(v*math.pi*12)
            h=.12*tufts;light=.98+.05*tufts+.015*grain
        elif kind=='cloth':
            weave=np.sin(u*math.pi*24)*np.sin(v*math.pi*24);h=.07*weave
            light=.97+.025*weave+.035*np.sin(u*math.pi*4)
        elif kind=='stone': h=.10*grain;light=.96+.06*grain
        elif kind=='metal':
            h=.015*grain;light=.91+.12*np.sin(u*math.pi)+.035*np.cos(v*8)+.012*grain
        elif kind=='ice': light=.94+.07*np.sin((u+v)*math.pi*4);h=.035*grain
        dx,dy=np.gradient(h);n=np.stack([-dy*5,-dx*5,np.ones_like(u)],axis=-1);n/=np.linalg.norm(n,axis=-1,keepdims=True)
        r,c=divmod(i,grid);a,b=r*cell,c*cell
        color[a:a+cell,b:b+cell]=srgb(np.clip(base[None,None,:]*light[:,:,None],0,1))
        normal[a:a+cell,b:b+cell]=n*.5+.5
        orm[a:a+cell,b:b+cell,1]=np.clip(rough+.035*grain,.2,.95);orm[a:a+cell,b:b+cell,2]=metal
    for suffix,data in [('color',color),('normal',normal),('orm',orm)]:png(folder/f'{suffix}.png',data)
    m=bpy.data.materials.new('Arcana shared illustrated atlas');m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
    for suffix in ['color','normal','orm']:
        image=bpy.data.images.load(str(folder/f'{suffix}.png'));image.colorspace_settings.name='sRGB' if suffix=='color' else 'Non-Color';image.pack()
        node=nodes.new('ShaderNodeTexImage');node.image=image;node.interpolation='Linear'
        if suffix=='color':links.new(node.outputs['Color'],bs.inputs['Base Color'])
        elif suffix=='normal':
            nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;links.new(node.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
        else:
            sep=nodes.new('ShaderNodeSeparateColor');links.new(node.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    return m,grid,cell,pad

def action_fcurves(action):
    """F-curves of an action in Blender 4.3 (flat) and 4.4+/5.x (layered actions with slot channel bags)."""
    if hasattr(action,'fcurves'):return list(action.fcurves)
    return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]

def parent_keep(obj,parent):
    bpy.context.view_layer.update(); matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix

def detail_line(name,points,radius,material,parent,col):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=1;curve.resolution_u=1
    line=curve.splines.new('POLY');line.points.add(len(points)-1)
    for p,co in zip(line.points,points):p.co=(*co,1)
    obj=bpy.data.objects.new(name,curve);col.objects.link(obj);obj.data.materials.append(material);parent_keep(obj,parent);return obj

def build(kind):
    slug,source,root_name,attack_name,last,reference=CONFIG[kind];folder=OUT/slug;folder.mkdir(parents=True,exist_ok=True);PUBLIC.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/source));scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update();root=bpy.data.objects[root_name];col=root.users_collection[0]
    root['delivery']='Arcana shared character v2: textured, articulated idle/walk/attack';root['reference']=reference
    if not args.legacy:enhance_heroes.enhance(kind,root,col)
    body=bpy.data.objects['body'];head=bpy.data.objects['head']
    old_objects=[root,*root.children_recursive];mats=sorted({m for o in old_objects if o.type=='MESH' for m in o.data.materials if m},key=lambda m:m.name)
    # Readable, physically modeled seams. These are attached to the same pivots as the source costume.
    if kind=='ranger':
        leafmat=next(m for m in mats if 'sunlit' in m.name)
        for i,(x,z) in enumerate([(-.62,.62),(-.34,.43),(0,.36),(.34,.43),(.62,.62)]):
            detail_line('Cape raised leaf vein '+str(i),[(x*.35,-.325,2.17),(x*.7,-.47,1.3),(x,-.48,z+.08)],.014,leafmat,body,col)
        leather=next(m for m in mats if 'Chestnut' in m.name)
        detail_line('Cross-body leather strap',[(-.38,.29,2.17),(-.12,.38,1.65),(.28,.37,1.2)],.045,leather,body,col)
    # Each foot assembly now has a dedicated rigid pivot. Source attack keeps its upper-body joints.
    legs=[]
    for side,sign in [('left',-1),('right',1)]:
        joint=bpy.data.objects.new('leg-'+side,None);col.objects.link(joint);joint.parent=root;joint.location=(sign*.43,0,.8);legs.append(joint)
    for obj in old_objects:
        if obj.type!='MESH' or obj.parent!=root:continue
        n=obj.name.lower()
        is_leg= any(w in n for w in (['thigh','shin','ankle','foot','toe'] if kind=='ranger' else ['leg','sole','boot','ankle','greave','shin']))
        if is_leg:parent_keep(obj,legs[0] if obj.matrix_world.translation.x<0 else legs[1])
    assert all(len(l.children)>0 for l in legs), 'leg grouping failed'
    # Bake evaluated modifiers into editable mesh copies, assign one packed material while preserving pivots.
    bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();objects=[root,*root.children_recursive]
    atlas,grid,cell,pad=make_atlas(mats,folder);index={m.name:i for i,m in enumerate(mats)}
    for obj in objects:
        if obj.type not in ['MESH','CURVE']:continue
        evaluated=obj.evaluated_get(graph);mesh=bpy.data.meshes.new_from_object(evaluated,depsgraph=graph)
        # The source leaf prisms contain inconsistent face winding. Blender's two-sided preview
        # conceals it, but a game back-face outline would fill the leaves with black triangles.
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
        matrix=obj.matrix_world.copy();parent=obj.parent;name=obj.name
        if kind=='bear' and any(word in name.lower() for word in ['hammer handle','hammer head','hammer striking','hammer round','handle lower']):obj['rushHideForThrow']=True
        if obj.type=='CURVE':
            bpy.data.objects.remove(obj,do_unlink=True);obj=bpy.data.objects.new(name,mesh);col.objects.link(obj);obj.parent=parent;obj.matrix_world=matrix
        else:obj.modifiers.clear();obj.data=mesh
        old_uv=mesh.uv_layers.active; old_values=[tuple(v.uv) for v in old_uv.data] if old_uv else None
        uv=old_uv or mesh.uv_layers.new(name='UVMap');coords=np.array([v.co[:] for v in mesh.vertices]);mins=coords.min(axis=0);span=np.maximum(coords.max(axis=0)-mins,.001)
        source_mats=list(mesh.materials)
        for face in mesh.polygons:
            mat=source_mats[face.material_index];tile=index[mat.name];row,column=divmod(tile,grid);axes=[j for j in range(3) if j!=max(range(3),key=lambda j:abs(face.normal[j]))]
            for loop in face.loop_indices:
                if old_values:u,v=old_values[loop];u=min(1,max(0,u));v=min(1,max(0,v))
                else:
                    pos=coords[mesh.loops[loop].vertex_index];u,v=[float((pos[j]-mins[j])/span[j]) for j in axes]
                # PNG row zero is top; Blender UV origin is bottom.
                uv.data[loop].uv=((column*cell+pad+u*(cell-2*pad))/1024,1-(row*cell+pad+(1-v)*(cell-2*pad))/1024)
            face.material_index=0
        mesh.materials.clear();mesh.materials.append(atlas)
    if not args.legacy:
        meshes=[o for o in [root,*root.children_recursive] if o.type=='MESH']
        atlas=enhance_heroes.bake_painted_atlas(meshes,atlas,folder,png,srgb,head=head)
    nodes=[o for o in [root,*root.children_recursive] if o.type=='EMPTY'];rest={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in nodes}
    # Preserve the source attack in a named NLA track, then create two independent looping clips.
    attack_actions={o:o.animation_data.action for o in nodes if o.animation_data and o.animation_data.action}
    for o in nodes:
        o.animation_data_clear()
        for attr,value in zip(['location','rotation_euler','scale'],rest[o]):setattr(o,attr,value.copy())
    def track(obj,action,name,end):
        obj.animation_data_create();obj.animation_data.action=None;t=obj.animation_data.nla_tracks.new();t.name=name;s=t.strips.new(name,1,action);s.action_frame_start=1;s.action_frame_end=end;s.frame_start=1;s.frame_end=end
        t.mute=True
    for o,action in attack_actions.items():track(o,action,attack_name,last)
    for mode,end in [('idle',61),('walk',31)]:
        for o in [body,head,*legs]+([bpy.data.objects['curled-tail']] if kind=='ranger' else []):
            action=bpy.data.actions.new(f'{kind}-{mode}/{o.name}');o.animation_data_create();o.animation_data.action=action
            loc,rot,scale=rest[o]
            for frame in range(1,end+1):
                t=(frame-1)/(end-1);o.location=loc.copy();o.rotation_euler=rot.copy();o.scale=scale.copy()
                if o in legs and mode=='walk':
                    phase=(t+(0 if o==legs[0] else .5))%1
                    if phase<.5:forward=.20-.8*phase;lift=0
                    else:forward=-.20+.8*(phase-.5);lift=.15*math.sin((phase-.5)*math.tau)
                    o.location.y+=forward;o.location.z+=lift
                elif o==body:
                    o.location.z+=.018*(1-math.cos(t*math.tau*(2 if mode=='walk' else 1)))
                    if mode=='walk':o.rotation_euler.y+=.025*math.sin(t*math.tau)
                elif o==head:o.rotation_euler.z+=.018*math.sin(t*math.tau)
                elif o.name=='curled-tail':o.rotation_euler.z+=.045*math.sin(t*math.tau)
                o.keyframe_insert(data_path='location',frame=frame);o.keyframe_insert(data_path='rotation_euler',frame=frame);o.keyframe_insert(data_path='scale',frame=frame)
            for fc in action_fcurves(action):
                for key in fc.keyframe_points:key.interpolation='LINEAR'
            track(o,action,f'{kind}-{mode}',end)
            for attr,value in zip(['location','rotation_euler','scale'],rest[o]):setattr(o,attr,value.copy())
    scene.frame_start=1;scene.frame_end=61;scene.render.fps=30
    # Muted NLA tracks are still exported when requested with export_nla_strips; solo tracks during preview below.
    for o in nodes:
        if o.animation_data:
            for t in o.animation_data.nla_tracks:t.mute=False
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/f'{slug}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_anim_slide_to_zero=True,export_extras=True)
    # NLA export samples the first walk key for the default node transform. Restore neutral leg defaults;
    # the explicit walk clip still contains the alternating stance/swing keys.
    path=PUBLIC/f'{slug}.glb';raw=path.read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+json_size]);tail=raw[20+json_size:]
    for n in doc['nodes']:
        if n.get('name') in ['leg-left','leg-right']:n['translation'][2]=0
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail)
    import shutil
    shutil.copyfile(path,ROOT/f'src/rush/models/{slug}.glb')
    def pose(mode,frame):
        for o in nodes:
            if o.animation_data:
                for t in o.animation_data.nla_tracks:t.mute=t.name!=mode
            for attr,value in zip(['location','rotation_euler','scale'],rest[o]):setattr(o,attr,value.copy())
        scene.frame_set(frame);bpy.context.view_layer.update()
    pose(f'{kind}-idle',1)
    # Orthographic turnaround renders from the actual textured delivery geometry.
    camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=5.2;camera.data.shift_x=0;camera.data.shift_y=0
    scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    for label,position in [('front',(0,10,3.7)),('side',(10,0,3.7)),('back',(0,-10,3.7)),('three-quarter',(7,10,6))]:
        camera.location=position;camera.rotation_euler=(Vector((0,0,1.75))-camera.location).to_track_quat('-Z','Y').to_euler()
        if not args.skip_render:scene.render.filepath=str(folder/f'{label}.png');bpy.ops.render.render(write_still=True)
    if not args.skip_render:
        import shutil
        shutil.copyfile(folder/'three-quarter.png',PUBLIC/f'{slug}.png')
        for view in ['front','side','back','three-quarter']:
            shutil.copyfile(folder/f'{view}.png',PUBLIC/f'{slug}-{view}.png')
        # Town portrait (src/rush/art/hero-<asset>.webp): head and shoulders from the three-quarter direction, 192 px,
        # transparent, from the same delivery geometry as the battle model.
        pts=[o.matrix_world@Vector(c) for o in head.children_recursive if o.type=='MESH' for c in o.bound_box]
        top=max(p.z for p in pts);mid=sum(pts,Vector())/len(pts);size=2.6
        target=Vector((mid.x,mid.y,top-size*.36));direction=(Vector((7,10,6))-Vector((0,0,1.75))).normalized()
        camera.data.ortho_scale=size;camera.location=target+direction*10;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.resolution_x=scene.render.resolution_y=192;scene.cycles.samples=max(args.samples,96)
        scene.render.image_settings.file_format='WEBP';scene.render.image_settings.quality=90
        scene.render.filepath=str(ROOT/f'src/rush/art/hero-{slug}.webp');bpy.ops.render.render(write_still=True)
        scene.render.image_settings.file_format='PNG';scene.render.resolution_x=scene.render.resolution_y=640
    # Save with idle active, all atlas images packed; the generator restores all tracks for export.
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(folder/f'{slug}.blend'))
    meshes=[o for o in root.children_recursive if o.type=='MESH'];triangles=0
    for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    manifest={'hero':kind,'asset':slug,'source':source,'reference':reference,'reference_sha256':hashlib.sha256((ROOT/reference).read_bytes()).hexdigest(),'generator':'tools/blender/build_character_production.py','materials':1,'texture_size':1024,'texture_maps':['color','normal','orm'],'source_material_tiles':[{'name':m.name,'surface':category(m.name)} for m in mats],'triangles':triangles,'meshes':len(meshes),'clips':[attack_name,f'{kind}-idle',f'{kind}-walk'],'rig':'Articulated rigid pivots, including independent leg assemblies; no deforming skin weights','glb_bytes':(PUBLIC/f'{slug}.glb').stat().st_size,'glb_sha256':hashlib.sha256((PUBLIC/f'{slug}.glb').read_bytes()).hexdigest(),'limits':['Concept-guided procedural surface textures, not a photogrammetry reconstruction','No physical-device FPS measurement','Rush retains its snowball prop and attack timing for Popo']}
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print('CHARACTER_COMPLETE',json.dumps(manifest,ensure_ascii=False))

for hero in CONFIG if args.hero=='all' else [args.hero]:build(hero)
