"""Shared helpers for the Arcana modeling drafts (Blender 5.2 `bpy` module, CPU Cycles).

Angle contract (see ../README.md):
  * battle camera : orthographic, 60 deg above the horizon, looking north. The ground depth is stretched by
                    1/sin(60) so a render maps 1:1 onto the game's 900 x 600 board (same as terrain3d.ts).
  * sprite camera : orthographic, camera at (7,10,7) looking at (0,0,1.7) scaled by the unit size
                    (23.5 deg elevation, 35 deg yaw) - the shared camera of tools/blender/build_dwarf.py.
  * turnaround    : the sprite elevation at yaw 0 / 90 / 180 for front, side and back checks.
"""
import bpy, bmesh, math, re, json
from mathutils import Vector, Matrix, noise

SIN60 = math.sin(math.pi / 3)


def srgb(hex_or_rgb):
    """'#rrggbb' or (r,g,b) in sRGB 0..1 -> linear RGBA tuple."""
    if isinstance(hex_or_rgb, str):
        h = hex_or_rgb.lstrip('#')
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        rgb = list(hex_or_rgb)
    lin = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (lin[0], lin[1], lin[2], 1.0)


_MATS = {}


def mat(name, color, rough=.85, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, coat=0.0, bump=0.0, bump_scale=30.0):
    """Cached Principled material. `bump` adds a cheap procedural noise bump (surface micro detail)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = srgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = coat
    if emit is not None:
        p.inputs['Emission Color'].default_value = srgb(emit)
        p.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    if bump:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = bump_scale; n.inputs['Detail'].default_value = 6
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    m.diffuse_color = srgb(color)
    _MATS[name] = m
    return m


def vcol_mat(name, attribute='Col', rough=.9, bump=0.0, bump_scale=60.0, rough_attribute=None):
    """Material whose base colour comes from a per-vertex colour attribute."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = attribute   # glTF exports this as COLOR_0
    nt.links.new(a.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if rough_attribute:
        r = nt.nodes.new('ShaderNodeAttribute'); r.attribute_name = rough_attribute
        nt.links.new(r.outputs['Fac'], p.inputs['Roughness'])
    if bump:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = bump_scale; n.inputs['Detail'].default_value = 8
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    _MATS[name] = m
    return m


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def trs(loc=(0, 0, 0), r=None, scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    return Matrix.Translation(Vector(loc)) @ (r if r is not None else Matrix()) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1))


class MB:
    """Small bmesh builder: add primitives with a transform and a material, then bake to one mesh."""

    def __init__(self):
        self.bm = bmesh.new(); self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _finish(self, verts, m, M, smooth):
        if M is not None:
            bmesh.ops.transform(self.bm, matrix=M, verts=verts)
        idx = self._mi(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = idx; f.smooth = smooth
        return verts

    def ico(self, m, r=1.0, sub=2, M=None, jitter=0.0, jscale=3.0, seed=0.0, smooth=True, squash=None):
        verts = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)['verts']
        if jitter:
            off = Vector((seed * 1.37, seed * .71, seed * 2.11))
            for v in verts:
                v.co += v.co.normalized() * noise.noise(v.co * jscale / max(r, 1e-6) + off) * jitter
        if squash:
            for v in verts:
                v.co.x *= squash[0]; v.co.y *= squash[1]; v.co.z *= squash[2]
        return self._finish(verts, m, M, smooth)

    def cone(self, m, r1, r2, depth, seg=10, M=None, smooth=False, star=0.0, droop=0.0, cap=True):
        """Cone/cylinder with its base at z=0. `star` pulls every other base vertex inwards (jagged skirt)."""
        verts = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=max(r2, 1e-4), depth=depth)['verts']
        for v in verts:
            v.co.z += depth / 2
        if star or droop:
            step = 2 * math.pi / seg
            for v in verts:
                if v.co.z < 1e-5:
                    k = round(math.atan2(v.co.y, v.co.x) / step)
                    if k % 2:
                        v.co.x *= (1 - star); v.co.y *= (1 - star)
                    else:
                        v.co.z -= droop
        return self._finish(verts, m, M, smooth)

    def cyl(self, m, r, depth, seg=12, M=None, smooth=True, taper=1.0, cap=True):
        return self.cone(m, r, r * taper, depth, seg, M, smooth, cap=cap)

    def box(self, m, size=(1, 1, 1), M=None, bevel=0.0, smooth=False):
        verts = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        for v in verts:
            v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        if bevel:
            edges = list({e for v in verts for e in v.link_edges})
            res = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect='EDGES', profile=.5)
            verts = res['verts']
        return self._finish(verts, m, M, smooth)

    def tube(self, m, points, radii, seg=8, smooth=True, cap=True):
        """Swept tube through `points` (list of Vector) with per-point radii - roots, limbs, branches."""
        pts = [Vector(p) for p in points]
        if isinstance(radii, (int, float)):
            radii = [radii] * len(pts)
        rings = []
        up = Vector((0, 0, 1))
        prev_x = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            x = t.cross(up)
            if x.length < 1e-4:
                x = t.cross(Vector((1, 0, 0)))
            x.normalize()
            if prev_x is not None and x.dot(prev_x) < 0:
                x = -x
            prev_x = x
            y = t.cross(x).normalized()
            ring = [self.bm.verts.new(p + (x * math.cos(a) + y * math.sin(a)) * radii[i]) for a in (2 * math.pi * k / seg for k in range(seg))]
            rings.append(ring)
        verts = [v for ring in rings for v in ring]
        for a, b in zip(rings, rings[1:]):
            for k in range(seg):
                self.bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
        if cap:
            self.bm.faces.new(list(reversed(rings[0]))); self.bm.faces.new(rings[-1])
        return self._finish(verts, m, None, smooth)

    def loft(self, m, rings, smooth=True, cap=True, jitter=0.0, jscale=1.5, seed=0.0):
        """Skin a list of closed rings (each a list of points, same length) - torsos, blades, capes are built this way."""
        off = Vector((seed * 1.3, seed * .7, seed * 2.1)); vr = []
        for ring in rings:
            row = []
            for p in ring:
                p = Vector(p)
                if jitter:
                    c = sum((Vector(q) for q in ring), Vector()) / len(ring); d = (p - c)
                    if d.length > 1e-6:
                        p = p + d.normalized() * noise.noise(p * jscale + off) * jitter
                row.append(self.bm.verts.new(p))
            vr.append(row)
        n = len(vr[0])
        for a, b in zip(vr, vr[1:]):
            for k in range(n):
                self.bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
        if cap:
            self.bm.faces.new(list(reversed(vr[0]))); self.bm.faces.new(vr[-1])
        return self._finish([v for row in vr for v in row], m, None, smooth)

    def sheet(self, m, grid, smooth=True):
        """Open surface from a 2D grid of points (rows x cols) - cloth, capes, banners."""
        vr = [[self.bm.verts.new(Vector(p)) for p in row] for row in grid]
        for a, b in zip(vr, vr[1:]):
            for k in range(len(a) - 1):
                self.bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
        return self._finish([v for row in vr for v in row], m, None, smooth)

    def quad(self, m, corners, smooth=False):
        verts = [self.bm.verts.new(Vector(c)) for c in corners]
        self.bm.faces.new(verts)
        return self._finish(verts, m, None, smooth)

    def to_mesh(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        return me


def add_obj(me, name=None, loc=(0, 0, 0), rz=0.0, scale=1.0, coll=None, parent=None):
    o = bpy.data.objects.new(name or me.name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    o.location = Vector(loc); o.rotation_euler = (0, 0, rz)
    o.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    if parent:
        o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), coll=None, parent=None):
    o = bpy.data.objects.new(name, None)
    (coll or bpy.context.scene.collection).objects.link(o)
    o.location = Vector(loc); o.empty_display_size = .2
    if parent:
        o.parent = parent
    return o


def collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
    return bpy.context.scene


def setup_render(scene, w, h, samples=64, transparent=False, world=('#cfe3ee', 1.0)):
    scene.render.engine = 'CYCLES'
    c = scene.cycles
    c.device = 'CPU'; c.samples = samples; c.use_denoising = True
    try:
        c.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    c.max_bounces = 4; c.diffuse_bounces = 2; c.glossy_bounces = 2; c.transmission_bounces = 2; c.transparent_max_bounces = 4
    scene.render.resolution_x = w; scene.render.resolution_y = h; scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    wd = bpy.data.worlds.new('World'); wd.use_nodes = True
    bg = wd.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = srgb(world[0]); bg.inputs['Strength'].default_value = world[1]
    scene.world = wd


def sun(name, direction, energy=3.0, color='#fff4e0', angle=3.0, coll=None):
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = srgb(color)[:3]; d.angle = math.radians(angle)
    o = bpy.data.objects.new(name, d); (coll or bpy.context.scene.collection).objects.link(o)
    o.rotation_euler = Vector(direction).normalized().to_track_quat('-Z', 'Y').to_euler()
    return o


def area(name, loc, target, power, size=4.0, color='#ffffff', coll=None):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = srgb(color)[:3]
    o = bpy.data.objects.new(name, d); (coll or bpy.context.scene.collection).objects.link(o)
    o.location = Vector(loc); o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
    return o


def camera(name, loc, target, ortho_scale=None, lens=50.0, coll=None, clip=(.1, 400)):
    d = bpy.data.cameras.new(name)
    if ortho_scale:
        d.type = 'ORTHO'; d.ortho_scale = ortho_scale
    else:
        d.lens = lens
    d.clip_start, d.clip_end = clip
    o = bpy.data.objects.new(name, d); (coll or bpy.context.scene.collection).objects.link(o)
    o.location = Vector(loc); o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
    return o


def battle_camera(board_w=900, board_h=600, margin=0, coll=None):
    """Exact game-board framing: 60 deg orthographic, looking north; ground is depth-stretched by 1/sin60."""
    target = Vector(((board_w / 2) / 100, (board_h / 2) / 100 / SIN60, 0))
    elev = math.pi / 3; dist = 60
    loc = target + Vector((0, -math.cos(elev) * dist, math.sin(elev) * dist))
    return camera('Battle camera / 60deg ortho', loc, target, ortho_scale=(board_w + 2 * margin) / 100, coll=coll)


def sprite_camera(height=3.4, yaw_deg=35.0, target_z=None, coll=None, name='Sprite camera / 23.5deg ortho'):
    """The dwarf script's shared camera, scaled to a unit `height`; yaw 0 = front (unit faces -Y... +Y is back)."""
    k = height / 3.4
    tz = (1.7 * k) if target_z is None else target_z
    horiz = math.hypot(7, 10) * k; z = 7 * k
    a = math.radians(yaw_deg)
    # yaw measured from the unit's front (-Y) towards its right (+X)
    loc = Vector((math.sin(a) * horiz, -math.cos(a) * horiz, z))
    return camera(name, loc, (0, 0, tz), ortho_scale=5.8 * k, coll=coll)


def ellipse(c, rx, ry, n=16, tilt=None, phase=0.0):
    """Horizontal ellipse of n points around centre c (optionally transformed by a 4x4 `tilt` about c)."""
    pts = [Vector((math.cos(2 * math.pi * k / n + phase) * rx, math.sin(2 * math.pi * k / n + phase) * ry, 0)) for k in range(n)]
    if tilt is not None:
        pts = [tilt @ p for p in pts]
    return [Vector(c) + p for p in pts]


def unit_views(height, coll=None):
    """The fixed angle set every unit is checked at (README: angle contract)."""
    k = height / 3.4; tz = 1.7 * k; r = 14 * k
    e60 = math.pi / 3
    def ortho(name, loc):
        return camera(name, loc, (0, 0, tz), ortho_scale=5.8 * k, coll=coll)
    return {
        'sprite': sprite_camera(height, -35.0, coll=coll, name='Sprite / 23.5deg, unit faces right'),
        'front': sprite_camera(height, 0.0, coll=coll, name='Turnaround / front'),
        'side': sprite_camera(height, -90.0, coll=coll, name='Turnaround / side'),
        'back': sprite_camera(height, 180.0, coll=coll, name='Turnaround / back'),
        # true battle camera: 60 deg above the horizon. `flank` = unit walking east as the board sees it,
        # `turned` = unit turned 45 deg towards the camera.
        'battle-flank': ortho('Battle 60deg / flank', (-r * math.cos(e60), 0, tz + r * math.sin(e60))),
        'battle-turned': ortho('Battle 60deg / turned 45', (-r * math.cos(e60) * .7071, -r * math.cos(e60) * .7071, tz + r * math.sin(e60))),
    }


def studio_lights(height, coll=None):
    k = height / 3.4
    area('Key / warm upper left', (-6 * k, -7 * k, 9 * k), (0, 0, 1.8 * k), 900 * k * k, 5 * k, '#fff0d8', coll)
    area('Fill / cool right', (8 * k, -3 * k, 4 * k), (0, 0, 1.6 * k), 260 * k * k, 6 * k, '#cfe2ff', coll)
    area('Rim / back', (2 * k, 8 * k, 7 * k), (0, 0, 2.0 * k), 500 * k * k, 4 * k, '#ffe6c0', coll)


def shadow_catcher(radius, coll=None):
    b = MB(); b.cyl(mat('Studio / ground', '#b9c3b4', 1.0), radius, .02, 48, trs((0, 0, -.02)))
    o = add_obj(b.to_mesh('Studio ground'), coll=coll); o.is_shadow_catcher = True
    return o


def render(scene, cam, path):
    scene.camera = cam; scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def read_board(data_ts):
    """Parse PATHS / SLOTS (forest) and SNOW_PATHS / SNOW_SLOTS from the game's data.ts so maps stay in sync."""
    text = open(data_ts, encoding='utf-8').read()

    def grab(name):
        m = re.search(r'export const ' + name + r'\s*:\s*[^=]+=\s*(\[.*?\n\];)', text, re.S)
        body = m.group(1).rstrip(';')
        body = re.sub(r'([{,]\s*)(\w+)\s*:', r'\1"\2":', body).replace("'", '"')
        body = re.sub(r',\s*([\]}])', r'\1', body)
        return json.loads(body)

    return {'forest': {'paths': grab('PATHS'), 'slots': grab('SLOTS')}, 'snow': {'paths': grab('SNOW_PATHS'), 'slots': grab('SNOW_SLOTS')}}


def stats(objs=None):
    objs = objs if objs is not None else [o for o in bpy.data.objects if o.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get(); tris = 0
    for o in objs:
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    return {'objects': len(objs), 'meshes': len({o.data.name for o in objs}), 'triangles': tris}
