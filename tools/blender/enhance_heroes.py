"""Hero model pass for the three playable base heroes (called by build_character_production.py).

Two steps, both reproducible from the preserved editable sources:

enhance(kind, root, col)  - before baking: chunkier proportions (bigger head, hands, eyes), readable top-view accents
                            (gecko crest, Bron's gold helmet trim, Popo's blue scarf and pauldron stripes), brighter
                            colour blocking that survives the game's toon ramp, and a triangle budget for tiny parts.
bake_painted_atlas(...)    - after the per-material tile atlas is built: one unique UV layout per hero and a Cycles
                            bake of colour x ambient occlusion, tangent normals and roughness/metal into the same
                            three 1024 maps. The game's toon material ignores metal and only reads the colour map,
                            so contact shadows are painted into the colour itself.

Front is +Y, up is +Z (Blender); the glTF exporter converts. Works in Blender 4.3 and the bpy 5.x module.
"""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

# --- small helpers -------------------------------------------------------------------------------------------------

def _bbox_center(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return sum(pts, Vector()) / 8


def _scale_about(objs, pivot, s):
    """Scale whole objects (and their children) about a world pivot. s: float or (x, y, z)."""
    sv = Vector(s) if hasattr(s, '__len__') else Vector((s, s, s))
    m = Matrix.Translation(pivot) @ Matrix.Diagonal((*sv, 1)) @ Matrix.Translation(-pivot)
    bpy.context.view_layer.update()
    for o in objs:
        o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()


def _grow(names, s, pivot=None):
    """Grow named objects, each about its own bounding-box centre unless a shared pivot is given."""
    for n in names:
        o = bpy.data.objects.get(n)
        if o is None:
            raise KeyError(f'hero enhance: missing source object {n!r}')
        _scale_about([o], pivot if pivot is not None else _bbox_center(o), s)


def _material(name, rgb, rough=0.5, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if hasattr(m, 'use_nodes') and not m.use_nodes:
        m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    return m


def _recolor(name, rgb=None, rough=None, metal=None):
    m = bpy.data.materials[name]
    bs = m.node_tree.nodes.get('Principled BSDF')
    if rgb is not None:
        bs.inputs['Base Color'].default_value = (*rgb, 1)
    if rough is not None:
        bs.inputs['Roughness'].default_value = rough
    if metal is not None:
        bs.inputs['Metallic'].default_value = metal


def _link(obj, col, parent, material, bevel=0.0, segments=2):
    col.objects.link(obj)
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('Chunky bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    for p in obj.data.polygons:
        p.use_smooth = True
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def _box(name, size, loc, col, parent, material, rot=(0, 0, 0), bevel=0.03):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    obj.rotation_euler = rot
    return _link(obj, col, parent, material, bevel)


def _sphere(name, radius, loc, col, parent, material, segments=12, rings=8, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    r = radius if hasattr(radius, '__len__') else (radius, radius, radius)
    bmesh.ops.scale(bm, vec=Vector(r), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    obj.rotation_euler = rot
    return _link(obj, col, parent, material)


def _blade(name, width, height, thick, loc, rot, col, parent, material):
    """A chunky leaf/crest blade: a flattened four-sided pyramid with a bevel, base centred on loc."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    w, t = width / 2, thick / 2
    base = [bm.verts.new(v) for v in [(-w, 0, 0), (0, t, 0), (w, 0, 0), (0, -t, 0)]]
    tip = bm.verts.new((0, 0, height))
    bm.faces.new(base[::-1])
    for i in range(4):
        bm.faces.new([base[i], base[(i + 1) % 4], tip])
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    obj.rotation_euler = rot
    o = _link(obj, col, parent, material, bevel=min(width, height) * 0.08, segments=1)
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def _surface_z(x, y, objs, z0=6.0):
    """Highest point of the given objects straight below (x, y), via the evaluated scene."""
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    best = None
    for o in objs:
        inv = o.matrix_world.inverted()
        ev = o.evaluated_get(graph)
        origin = inv @ Vector((x, y, z0))
        direction = (inv.to_3x3() @ Vector((0, 0, -1))).normalized()
        hit, loc, _n, _i = ev.ray_cast(origin, direction)
        if hit:
            z = (o.matrix_world @ loc).z
            best = z if best is None else max(best, z)
    return best


def _budget(root, small=0.16, mid=0.42, small_target=40, mid_target=96, bevel_under=0.3):
    """Tiny rivets, glints and studs were 224-triangle spheres; at 60 px a hero cannot show that. Collapse them,
    and give small bevelled parts a single bevel segment. Large visible forms keep their full shape."""
    for o in [root, *root.children_recursive]:
        if o.type != 'MESH':
            continue
        size = max(o.dimensions)
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        for mod in o.modifiers:
            if mod.type == 'BEVEL' and size < bevel_under:
                mod.segments = 1
        target = small_target if size < small else mid_target if size < mid else None
        if target and tris > target * 1.6:
            dec = o.modifiers.new('Hero triangle budget', 'DECIMATE')
            dec.ratio = target / tris


# --- per hero ------------------------------------------------------------------------------------------------------

def _bigger_head(head, s, lift=0.0):
    """Brawl-style head: scale every head part about the neck pivot, then lift it clear of the shoulders."""
    parts = list(head.children)
    _scale_about(parts, head.matrix_world.translation.copy(), s)
    for o in parts:
        o.matrix_world = Matrix.Translation(Vector((0, 0, lift))) @ o.matrix_world
    bpy.context.view_layer.update()


def _ranger(root, col):
    body, head = bpy.data.objects['body'], bpy.data.objects['head']
    _recolor('03 Leaf forest green', (0.13, 0.33, 0.035))
    _recolor('09 Eye gleam', (1.0, 0.98, 0.92))
    _recolor('06 Golden eye and brass', (0.98, 0.56, 0.04), metal=0.15)
    # Bigger head (Brawl-style 1:1.6 head to body), bigger hands and eye highlights.
    _bigger_head(head, 1.28, 0.03)
    _grow(['Eye catchlight', 'Eye catchlight.001'], 1.9)
    _grow(['Large golden eye', 'Large golden eye.001'], 1.08)
    sup = ['Supporting palm', 'Supporting thumb', 'Supporting curled finger', 'Supporting curled finger.001', 'Supporting curled finger.002']
    trg = ['Trigger palm', 'Trigger opposing thumb', 'Wrapped trigger finger', 'Wrapped trigger finger.001', 'Wrapped trigger finger.002']
    _grow(sup, 1.22, _bbox_center(bpy.data.objects['Supporting palm']))
    _grow(trg, 1.22, _bbox_center(bpy.data.objects['Trigger palm']))
    # Orange crest down the hood: the part of the gecko the high game camera sees most.
    crest = bpy.data.materials['08 Broad orange markings']
    _recolor('08 Broad orange markings', (0.95, 0.36, 0.03))
    hood = [bpy.data.objects[n] for n in ['Open leaf hood shell', 'Top hood crest', 'Broad gecko head', 'Broad brow hood leaf', 'Broad brow hood leaf.001']]
    # Fins run front to back (blade width along Y), leaning back; from above they read as an orange stripe.
    for i, (y, h, w, tilt) in enumerate([(0.32, 0.30, 0.26, 0.15), (0.10, 0.42, 0.32, 0.35), (-0.14, 0.38, 0.30, 0.55), (-0.38, 0.28, 0.24, 0.8)]):
        z = _surface_z(0, y, hood)
        if z is None:
            continue
        _blade(f'Hood crest spine {i}', w, h, 0.12, (0, y, z - 0.06), (0, -tilt, math.pi / 2), col, head, crest)
    # Gold buckle on the cross strap, visible from above.
    gold = bpy.data.materials['06 Golden eye and brass']
    _sphere('Quiver strap gold stud', (0.07, 0.04, 0.07), (-0.24, 0.38, 1.88), col, body, gold, 10, 6)


def _bron(root, col):
    body, head = bpy.data.objects['body'], bpy.data.objects['head']
    # Colour blocking for a toon ramp (metal is ignored in game): lighter blue steel, true gold trim, copper-orange beard.
    _recolor('Steel / blue forged armor', (0.20, 0.33, 0.42), metal=0.45)
    _recolor('Steel / bevel highlights', (0.52, 0.64, 0.70), metal=0.45)
    _recolor('Bronze / warm armor trim', (0.85, 0.47, 0.08), rough=0.3, metal=0.45)
    _recolor('Bronze / polished edge', (1.0, 0.72, 0.22), metal=0.45)
    _recolor('Hair / copper beard', (0.62, 0.20, 0.04))
    _recolor('Hair / warm braid ridges', (0.85, 0.38, 0.07))
    _recolor('Leather / burgundy straps', (0.28, 0.09, 0.05))
    _recolor('Skin / warm copper', (0.78, 0.42, 0.24))
    _recolor('Hammer / cold granite', (0.42, 0.47, 0.48))
    _recolor('Cloth / deep jade wool', (0.03, 0.30, 0.26))
    # Bigger head and beard, readable angry eyes with a catchlight, heavy brows.
    _bigger_head(head, 1.27, 0.05)
    beard = [o for o in head.children if o.name.startswith('Beard /')]
    _scale_about(beard, _bbox_center(bpy.data.objects['Beard / main tapered lobe.001']), (1.22, 1.15, 1.08))
    for side in ['', '.001']:
        _grow(['Face / eye white' + side], (1.45, 1.2, 1.6))
        _grow(['Face / determined pupil' + side], (1.5, 1.2, 1.6))
        _grow(['Face / thick copper brow' + side], (1.5, 1.4, 1.35))
        _grow(['Face / shadow under brow' + side], 1.15)
    gleam = _material('Eye / gleam catchlight', (1, 1, 1), 0.2)
    for side in ['', '.001']:
        c = _bbox_center(bpy.data.objects['Face / determined pupil' + side])
        _sphere('Face / catchlight' + side, (0.022, 0.012, 0.026), (c.x + 0.025, c.y + 0.03, c.z + 0.03), col, head, gleam, 8, 5)
    _grow(['Helmet / clan jade gem'], 1.6)
    _grow(['Helmet / clan gem border'], 1.45)
    _grow(['Helmet / front crest', 'Helmet / crown ridge'], (1.7, 1.05, 1.1))
    # Chunky fists.
    _grow(['Guard hand / fist'], 1.3)
    glove = ['Hammer hand / leather glove', 'Hammer hand / plated knuckle', 'Hammer hand / plated knuckle.001', 'Hammer hand / plated knuckle.002']
    _grow(glove, 1.25, _bbox_center(bpy.data.objects['Hammer hand / leather glove']))
    # Gold pauldron caps: two bright stripes the top-down camera reads as Bron's shoulders.
    gold = bpy.data.materials['Bronze / warm armor trim']
    for side, x in [('Guard', 0.78), ('Hammer', -0.78)]:
        arm = bpy.data.objects['guard-arm' if side == 'Guard' else 'hammer-arm']
        _box(f'{side} shoulder / gold rim', (0.80, 0.08, 0.08), (x, 0.36, 2.25), col, arm, gold, bevel=0.025)


def _bear(root, col):
    body, head = bpy.data.objects['body'], bpy.data.objects['head']
    _recolor('02 Ivory enamel armor', (0.80, 0.84, 0.86), metal=0.3)
    _recolor('05 Muted brass trim', (0.85, 0.52, 0.12), metal=0.4)
    _bigger_head(head, 1.24, 0.03)
    # Readable button eyes with a big highlight, a bigger nose, and soft pink inner ears.
    _grow(['Eye black', 'Eye black.001'], (1.9, 1.3, 2.0))
    _grow(['Eye socket', 'Eye socket.001'], (1.45, 1.1, 1.6))
    _grow(['Dark bear nose'], 1.18)
    for side in ['', '.001']:
        g = bpy.data.objects['Eye glint' + side]
        _grow(['Eye glint' + side], 2.8)
        c = _bbox_center(g)
        g.matrix_world = Matrix.Translation(Vector((0, 0.02, 0.012))) @ g.matrix_world
    ear = _material('Skin / inner ear pink', (0.78, 0.42, 0.44), 0.6)
    for side in ['', '.001']:
        o = bpy.data.objects['Ear inner bowl' + side]
        o.data.materials[0] = ear
        _grow(['Ear inner bowl' + side], 1.35)
        _grow(['Round bear ear' + side], 1.12)
    # Team-blue knitted scarf with a hanging tail (key art), seen from the high camera on snow.
    scarf = _material('Scarf / team blue wool cloth', (0.015, 0.13, 0.55), 0.7)
    o = bpy.data.objects['Navy neck scarf']
    o.data.materials[0] = scarf
    _grow(['Navy neck scarf'], (1.1, 1.12, 1.35))
    _box('Scarf / knot', (0.26, 0.2, 0.2), (0.34, 0.36, 2.52), col, body, scarf, rot=(0.2, 0.3, 0.5), bevel=0.06)
    _box('Scarf / hanging tail', (0.22, 0.09, 0.56), (0.42, 0.44, 2.2), col, body, scarf, rot=(0.25, 0.0, 0.18), bevel=0.04)
    _box('Scarf / tail stripe', (0.235, 0.1, 0.07), (0.45, 0.46, 2.0), col, body, bpy.data.materials['02 Ivory enamel armor'], rot=(0.25, 0.0, 0.18), bevel=0.02)
    # Blue stripes on top of both pauldrons, matching the existing hammer-side team bar.
    blue = bpy.data.materials['06 Team blue ice']
    for side, x in [('guard', 0.84), ('hammer', -0.84)]:
        arm = bpy.data.objects[f'{side}-arm']
        _box(f'Pauldron top team stripe {side}', (0.22, 0.66, 0.09), (x, -0.01, 2.43), col, arm, blue, bevel=0.025)
    # Bigger paws.
    paw = ['Hammer hand palm', 'Opposing thumb', 'Closed glove finger', 'Closed glove finger.001', 'Closed glove finger.002']
    _grow(paw, 1.2, _bbox_center(bpy.data.objects['Hammer hand palm']))


def enhance(kind, root, col):
    {'ranger': _ranger, 'bron': _bron, 'bear': _bear}[kind](root, col)
    # Bron has three times the parts of the others: one bevel segment below 0.6 m and leaner small parts.
    _budget(root, **({'small_target': 28, 'mid': 0.5, 'mid_target': 64, 'bevel_under': 0.6} if kind == 'bron' else {}))
    bpy.context.view_layer.update()


# --- painted atlas bake -----------------------------------------------------------------------------------------------

def _select(objs, active):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def bake_painted_atlas(meshes, atlas, folder, png, srgb_encode, size=1024, ao_samples=48, head=None):
    """Re-bake the tile atlas onto one unique UV layout per hero, multiplying a baked ambient occlusion into colour."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = False
    # 1. Tile UVs stay readable to the source material through a named UV node; a new layout gets packed for baking.
    nt = atlas.node_tree
    uvnode = nt.nodes.new('ShaderNodeUVMap')
    uvnode.uv_map = 'TileUV'
    textures = [n for n in nt.nodes if n.type == 'TEX_IMAGE']
    for t in textures:
        nt.links.new(uvnode.outputs['UV'], t.inputs['Vector'])
    head_set = set(head.children_recursive) if head else set()
    for o in meshes:
        uv = o.data.uv_layers
        for extra in [l for l in uv if l != uv.active]:
            uv.remove(extra)
        uv.active.name = 'TileUV'
        new = uv.new(name='BakeUV')
        uv.active = new
    _select(meshes, meshes[0])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Faces get texels where the eye goes: the head (eyes, brows, beard) twice the linear density.
    for o in meshes:
        if o in head_set:
            data = o.data.uv_layers['BakeUV'].data
            a = np.empty(len(data) * 2)
            data.foreach_get('uv', a)
            data.foreach_set('uv', a * 2.0)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    # 2. Targets.
    def target(name):
        # Float targets hold linear values: colour comes back linear, ORM/normal as their stored data.
        return bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    out = nt.nodes.new('ShaderNodeTexImage')
    bs = nt.nodes.get('Principled BSDF')
    outnode = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    surface_link = outnode.inputs['Surface'].links[0].from_socket
    emit = nt.nodes.new('ShaderNodeEmission')

    def bake(kind, image, source=None, samples=1, **kw):
        out.image = image
        nt.nodes.active = out
        out.select = True
        if source is not None:
            nt.links.new(source, emit.inputs['Color'])
            nt.links.new(emit.outputs['Emission'], outnode.inputs['Surface'])
        scene.cycles.samples = samples
        _select(meshes, meshes[0])
        bpy.ops.object.bake(type=kind, uv_layer='BakeUV', margin=6, margin_type='EXTEND', use_clear=True, **kw)
        nt.links.new(surface_link, outnode.inputs['Surface'])
        n = np.empty(size * size * 4, dtype=np.float32)
        image.pixels.foreach_get(n)
        return n.reshape(size, size, 4)[::-1, :, :3].copy()  # Blender rows start at the bottom

    col_tex = next(t for t in textures if t.image.colorspace_settings.name == 'sRGB')
    orm_tex = next(t for t in textures if any(l.to_node.type == 'SEPARATE_COLOR' for l in t.outputs['Color'].links))
    color = bake('EMIT', target('bake color'), col_tex.outputs['Color'])
    orm = bake('EMIT', target('bake orm'), orm_tex.outputs['Color'])
    normal = bake('NORMAL', target('bake normal'), normal_space='TANGENT')
    # Ambient occlusion with a temporary ground so soles, beard undersides and armpits darken.
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    ground = bpy.context.active_object
    if scene.world:
        scene.world.light_settings.distance = 0.6
    ao = bake('AO', target('bake ao'), samples=ao_samples)[:, :, 0]
    bpy.data.objects.remove(ground, do_unlink=True)
    # 3. Paint: soft occlusion (never black) plus a gentle cool tint in the deepest creases.
    occ = np.clip(ao, 0, 1) ** 0.8
    shade = 0.38 + 0.62 * occ
    painted = color * shade[:, :, None]
    painted = painted * (1 - 0.06 * (1 - occ))[:, :, None] + np.array([0.0, 0.01, 0.03]) * (1 - occ)[:, :, None]
    png(folder / 'color.png', srgb_encode(np.clip(painted, 0, 1)))
    png(folder / 'normal.png', np.clip(normal, 0, 1))
    png(folder / 'orm.png', np.clip(orm, 0, 1))
    # 4. New material on the unique layout; the tile layout is dropped from the delivery.
    m = bpy.data.materials.new('Arcana shared painted atlas')
    if hasattr(m, 'use_nodes') and not m.use_nodes:
        m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    pb = nodes.get('Principled BSDF')
    for suffix in ['color', 'normal', 'orm']:
        image = bpy.data.images.load(str(folder / f'{suffix}.png'), check_existing=False)
        image.colorspace_settings.name = 'sRGB' if suffix == 'color' else 'Non-Color'
        image.pack()
        node = nodes.new('ShaderNodeTexImage')
        node.image = image
        if suffix == 'color':
            links.new(node.outputs['Color'], pb.inputs['Base Color'])
        elif suffix == 'normal':
            nm = nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = 0.45
            links.new(node.outputs['Color'], nm.inputs['Color'])
            links.new(nm.outputs['Normal'], pb.inputs['Normal'])
        else:
            sep = nodes.new('ShaderNodeSeparateColor')
            links.new(node.outputs['Color'], sep.inputs['Color'])
            links.new(sep.outputs['Green'], pb.inputs['Roughness'])
            links.new(sep.outputs['Blue'], pb.inputs['Metallic'])
    for o in meshes:
        o.data.materials.clear()
        o.data.materials.append(m)
        uv = o.data.uv_layers
        uv.remove(uv['TileUV'])
        uv['BakeUV'].name = 'UVMap'
        uv.active = uv['UVMap']
        uv['UVMap'].active_render = True
    for img in [i for i in bpy.data.images if i.name.startswith('bake ')]:
        bpy.data.images.remove(img)
    bpy.data.materials.remove(atlas)
    return m
