"""Arcana redesign v0 — realm mood dioramas for the concept sheet.

Run (bpy 5.2 or Blender 5.2):
  python build_realm_dioramas.py -- --scene sky --out DIR --samples 64 --size 720
Scenes: forest | sky | market | clock | merge
Each scene is a small floating island on the same orthographic camera, so the five read as one set.
Shapes only (no image inputs). These are mood pieces for the design document, not game assets.
"""
import argparse, math, sys, random
from pathlib import Path
import bpy
from mathutils import Vector, Euler

p = argparse.ArgumentParser()
p.add_argument('--scene', default='sky', choices=['forest', 'sky', 'market', 'clock', 'merge'])
p.add_argument('--out', default='.')
p.add_argument('--samples', type=int, default=64)
p.add_argument('--size', type=int, default=720)
opts = p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
OUT = Path(opts.out); OUT.mkdir(parents=True, exist_ok=True)
random.seed(7)

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
COL = bpy.data.collections.new('Diorama'); bpy.context.scene.collection.children.link(COL)
MATS = {}

def mat(name, color, rough=.6, metal=0, emit=0):
    key = (name, color, emit)
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value = (*color, 1); n.inputs['Roughness'].default_value = rough
    n.inputs['Metallic'].default_value = metal
    n.inputs['Emission Color'].default_value = (*color, 1); n.inputs['Emission Strength'].default_value = emit
    MATS[key] = m; return m

def put(o, m, smooth=True, bevel=0):
    for c in list(o.users_collection): c.objects.unlink(o)
    COL.objects.link(o); o.data.materials.append(m)
    if smooth:
        for poly in o.data.polygons: poly.use_smooth = True
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 2
    return o

def cyl(loc, r, d, m, v=24, r2=None, rot=(0, 0, 0), bevel=0, smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r, radius2=r if r2 is None else r2, depth=d, location=loc, rotation=rot)
    return put(bpy.context.object, m, smooth, bevel)

def ico(loc, s, m, sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1, location=loc)
    o = bpy.context.object; o.scale = s if isinstance(s, tuple) else (s, s, s)
    bpy.ops.object.transform_apply(scale=True); return put(o, m)

def box(loc, s, m, rot=(0, 0, 0), bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = s; bpy.ops.object.transform_apply(scale=True)
    return put(o, m, False, bevel)

def torus(loc, R, r, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot)
    return put(bpy.context.object, m)

def rod(a, b, r, m, v=10):
    a, b = Vector(a), Vector(b)
    o = cyl((a + b) / 2, r, (b - a).length, m, v)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler(); return o

def gear(loc, R, teeth, depth, m, rot=(0, 0, 0)):
    """Flat toothed gear as one prism mesh (axis = local Z), with a hub."""
    n = teeth * 4; pts = []
    for i in range(n):
        a = 2 * math.pi * i / n; r = R + (.13 if (i % 4) in (1, 2) else 0)
        pts.append((r * math.cos(a), r * math.sin(a)))
    verts = [(x, y, -depth / 2) for x, y in pts] + [(x, y, depth / 2) for x, y in pts]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    d = bpy.data.meshes.new('gear'); d.from_pydata(verts, [], faces); d.update()
    o = bpy.data.objects.new('gear', d); o.location = loc; o.rotation_euler = rot
    put(o, m, False, .015)
    cyl(loc, R * .3, depth * 1.6, m, 16, rot=rot)
    return o

def island(top, under, rim=None, R=2.2, floating=True):
    """Ground disc with a rocky underside; floating islands get a long hanging cone."""
    cyl((0, 0, -.18), R, .36, top, 40, bevel=.06)
    if rim: torus((0, 0, -.02), R, .07, rim)
    if floating:
        cyl((0, 0, -1.1), R * .96, 1.5, under, 9, r2=.25, smooth=False)
        for k in range(5):
            a = k * 1.3; ico((math.cos(a) * R * .55, math.sin(a) * R * .55, -1.0 - .3 * (k % 2)), (.45, .45, .7), under, 1)
    else:
        cyl((0, 0, -.6), R * .98, .6, under, 40)

def cloud(loc, s, m):
    for k, (dx, dz, r) in enumerate(((0, 0, 1), (.8, -.1, .75), (-.8, -.12, .7), (.35, .3, .7), (-.4, .25, .6))):
        ico((loc[0] + dx * s, loc[1], loc[2] + dz * s), r * s, m, 2)

def tree(loc, h, m_trunk, m_leaf, snow=None):
    x, y, z = loc
    cyl((x, y, z + h * .2), .1 * h, h * .4, m_trunk, 8)
    for k in range(3):
        c = cyl((x, y, z + h * (.45 + .2 * k)), (.55 - .14 * k) * h, .5 * h, m_leaf, 10, r2=.02)
        if snow: cyl((x, y, z + h * (.62 + .2 * k)), (.25 - .06 * k) * h, .18 * h, snow, 10, r2=.02)

def lantern(loc, r, glow, frame):
    x, y, z = loc
    ico((x, y, z), (r, r, r * 1.25), glow, 2)
    cyl((x, y, z + r * 1.25), r * .55, r * .25, frame, 12)
    cyl((x, y, z - r * 1.25), r * .55, r * .25, frame, 12)
    rod((x, y, z + r * 1.4), (x, y, z + r * 2.4), r * .08, frame, 6)

S = opts.scene
INK = mat('ink', (.02, .05, .06), .7)
TEAL = mat('teal', (.02, .32, .34), .5); TEAL_L = mat('teal light', (.05, .55, .55), .45)
IVORY = mat('ivory', (.82, .76, .60), .6); VERM = mat('vermilion', (.80, .14, .04), .5)
GOLD = mat('gold', (.90, .62, .18), .3, .6); WOOD = mat('wood', (.30, .15, .06), .7)
ROCK = mat('rock', (.30, .27, .30), .85); ROCK_D = mat('rock dark', (.13, .12, .16), .9)
world_col = (.62, .78, .86); sun = (1, .92, .8); env = .9

if S == 'forest':   # 1막: 청록 숲과 설산 — 재료 상성
    GRASS = mat('grass', (.18, .45, .14), .8); SNOW = mat('snow', (.86, .90, .96), .5)
    island(GRASS, ROCK, GOLD)
    cyl((1.05, -.15, .02), 1.25, .1, SNOW, 32)                       # snowfield half
    rod((-2, -.3, .02), (2, .5, .02), .32, mat('path', (.74, .58, .36), .8))
    for (x, y, h) in ((-1.4, .9, 1.1), (-.9, 1.5, .9), (-1.7, -.2, .8), (-.5, -1.4, .9)):
        tree((x, y, 0), h, WOOD, mat('leaf', (.10, .40, .14), .7))
    for (x, y, h) in ((1.3, .9, 1.0), (1.6, -.5, .8), (.6, -1.2, .7)):
        tree((x, y, .05), h, WOOD, mat('pine', (.05, .22, .14), .7), SNOW)
    # magic tower (fire branch)
    cyl((0, .2, .5), .38, 1.0, IVORY, 16, r2=.32, bevel=.02); cyl((0, .2, 1.1), .46, .2, TEAL, 16)
    cyl((0, .2, 1.45), .44, .5, TEAL, 16, r2=.02); ico((0, .2, 1.25), .16, mat('flame', (1, .45, .05), .3, 0, 6))
    for k in range(3): ico((.9 + .1 * k, .1, .25), .12, mat('ice', (.55, .8, 1), .2, 0, .3), 1)
    world_col = (.66, .82, .80)
elif S == 'sky':    # 2막: 하늘섬 등대 — 바람과 섬 끌어오기
    GRASS = mat('grass', (.32, .62, .30), .8); CLOUD = mat('cloud', (.95, .96, 1.0), .9)
    island(GRASS, ROCK, None, 1.7)
    for k in range(6):  # lighthouse: alternating teal / ivory bands
        cyl((0, 0, .25 + .42 * k), .55 - .05 * k, .42, TEAL if k % 2 else IVORY, 20, r2=.5 - .05 * k)
    cyl((0, 0, 2.85), .42, .5, mat('glass', (1, .85, .45), .1, 0, 5), 16)
    cyl((0, 0, 3.25), .5, .35, VERM, 16, r2=.05)
    torus((0, 0, 2.6), .45, .05, GOLD)
    for k in range(2): rod((0, 0, 2.85), (math.cos(k * 3.14 + .6) * 2.0, math.sin(k * 3.14 + .6) * 2.0, 2.6), .07, mat('beam', (1, .85, .45), .2, 0, 3), 8)
    # a second, smaller island pulled closer by a chain (the realm's mechanic)
    cyl((2.6, -1.2, -.1), .7, .25, GRASS, 24); cyl((2.6, -1.2, -.6), .65, .8, ROCK, 8, r2=.1, smooth=False)
    tree((2.6, -1.2, .05), .7, WOOD, mat('leaf', (.20, .55, .25), .7))
    for k in range(7):
        t = k / 6; rod((1.1 + 1.0 * t, -.45 - .5 * t, .05 + .25 * math.sin(t * math.pi)), (1.24 + 1.0 * t, -.52 - .5 * t, .05 + .25 * math.sin((t + .14) * math.pi)), .045, GOLD, 6)
    for (x, y, z, s) in ((-2.4, .6, -1.2, .6), (1.9, 1.6, -1.6, .7), (-1.0, -2.2, -2.0, .5), (2.8, .9, 1.6, .35)):
        cloud((x, y, z), s, CLOUD)
    for k in range(3):  # wind ribbons
        pts = [Vector((-2.6 + .9 * i, 1.4 - .35 * k, 1.0 + .35 * k + .2 * math.sin(i))) for i in range(6)]
        for a, b in zip(pts, pts[1:]): rod(a, b, .03, mat('wind', (.85, .95, 1), .2, 0, .8), 6)
    world_col = (.55, .78, .95)
elif S == 'market':  # 3막: 달장터 — 등불 색
    GROUND = mat('night ground', (.08, .10, .16), .8); STONE = mat('paving', (.20, .20, .26), .8)
    island(GROUND, ROCK_D, None, 2.2, floating=False)
    for i in range(-3, 4):
        for j in range(-3, 4):
            if i * i + j * j < 9: box((i * .5, j * .5, .02), (.46, .46, .05), STONE, bevel=.01)
    RED = mat('lantern red', (1, .22, .06), .3, 0, 1.6); BLUE = mat('lantern blue', (.12, .5, 1), .3, 0, 1.6); YEL = mat('lantern yellow', (1, .75, .15), .3, 0, 1.6)
    for (x, y, rot, roof) in ((-1.0, .7, .2, VERM), (1.1, .5, -.3, TEAL)):  # stalls with tiled roofs
        for dx in (-.55, .55):
            for dy in (-.35, .35): rod((x + dx, y + dy, 0), (x + dx, y + dy, 1.0), .05, WOOD, 6)
        box((x, y, .45), (1.2, .7, .08), WOOD)
        r = box((x, y, 1.12), (1.5, 1.0, .1), roof, (0, .12, rot))
        for k, c in enumerate((RED, YEL, BLUE)): lantern((x - .45 + .45 * k, y + .45, .82), .11, c, INK)
        for k in range(4): ico((x - .4 + .27 * k, y, .58), .09, mat('goods', (.8, .5 + .1 * k, .2), .5), 1)
    # lantern string across the plaza
    for k in range(9):
        t = k / 8; x = -1.8 + 3.6 * t; z = 1.9 - .5 * math.sin(t * math.pi)
        lantern((x, -.6, z), .1, (RED, YEL, BLUE)[k % 3], INK)
    rod((-1.8, -.6, 0), (-1.8, -.6, 2.1), .05, WOOD, 6); rod((1.8, -.6, 0), (1.8, -.6, 2.1), .05, WOOD, 6)
    # a small horned goblin (dokkaebi) merchant with a lantern club
    body = mat('dokkaebi', (.18, .35, .55), .6)
    ico((0, -1.3, .35), (.28, .24, .32), body); ico((0, -1.3, .78), .22, body)
    for s in (-1, 1): cyl((s * .11, -1.3, 1.0), .05, .2, IVORY, 8, r2=.005)
    ico((-.08, -1.12, .82), .04, YEL, 1); ico((.08, -1.12, .82), .04, YEL, 1)
    rod((.25, -1.3, .3), (.45, -1.3, .9), .04, WOOD, 6); lantern((.47, -1.3, 1.0), .1, BLUE, INK)
    world_col = (.10, .14, .30); sun = (.55, .6, .9); env = .8
elif S == 'clock':   # 4막: 태엽 왕국 — 부품 조립
    BRASS = mat('brass', (.75, .48, .16), .35, .9); COPPER = mat('copper', (.65, .26, .12), .4, .8)
    PLATE = mat('plate', (.32, .30, .28), .55, .6); STEAM = mat('steam', (.92, .92, .9), .9)
    island(mat('cobble', (.42, .36, .30), .85), ROCK, BRASS, 2.0)
    cyl((0, 0, .7), .65, 1.4, PLATE, 8, r2=.5, bevel=.03, smooth=False)   # tower body
    cyl((0, 0, 1.5), .78, .2, BRASS, 8, smooth=False)
    gear((0, .62, 1.0), .38, 10, .1, BRASS, (math.pi / 2, 0, 0))
    gear((.45, .55, .55), .22, 8, .1, COPPER, (math.pi / 2, 0, 0))
    cyl((0, 0, 1.85), .35, .5, COPPER, 16)
    rod((0, 0, 2.1), (.9, .4, 2.3), .07, BRASS); ico((.95, .42, 2.3), .14, mat('core', (.4, .9, 1), .2, 0, 6), 2)  # cannon arm
    gear((-1.3, .6, .5), .5, 12, .14, BRASS, (math.pi / 2, .3, 0)); gear((-1.2, -.9, .3), .35, 9, .12, COPPER, (0, 0, 0))
    for k in range(4): rod((1.2, -1.2 + .3 * k, 0), (1.2, -1.2 + .3 * k, .4 + .3 * k), .1, COPPER, 12)  # pipes
    for k in range(4): ico((1.2 + .1 * k, -.3 + .1 * k, .9 + .35 * k), .18 + .05 * k, STEAM, 2)
    # wind-up key on top
    rod((0, 0, 2.1), (0, 0, 2.6), .05, BRASS, 8); torus((0, 0, 2.75), .18, .05, BRASS, (math.pi / 2, 0, 0))
    world_col = (.86, .76, .62); sun = (1, .85, .65)
else:                # 5막·마을: 합류 — 네 땅의 조각이 한 마을에
    GRASS = mat('grass', (.25, .52, .22), .8)
    island(GRASS, ROCK, GOLD, 2.5)
    torus((0, 0, .03), .9, .06, IVORY); cyl((0, 0, .02), .9, .05, mat('plaza', (.80, .70, .50), .7), 32)
    ico((0, 0, .35), (.2, .2, .35), mat('beacon', (.4, .95, .9), .2, 0, 4), 2)
    # forest corner
    tree((-1.6, 1.0, 0), 1.0, WOOD, mat('leaf', (.10, .40, .14), .7)); tree((-1.1, 1.6, 0), .8, WOOD, mat('leaf2', (.14, .48, .16), .7))
    cyl((-1.5, .2, .4), .3, .8, IVORY, 12, r2=.26); cyl((-1.5, .2, 1.0), .34, .4, TEAL, 12, r2=.02)
    # sky lighthouse corner
    for k in range(4): cyl((1.4, 1.2, .2 + .35 * k), .32 - .03 * k, .35, TEAL if k % 2 else IVORY, 16, r2=.29 - .03 * k)
    cyl((1.4, 1.2, 1.65), .25, .3, mat('glass', (1, .85, .45), .1, 0, 5), 12); cyl((1.4, 1.2, 1.95), .3, .25, VERM, 12, r2=.03)
    # market corner
    for dx in (-.4, .4): rod((1.3 + dx, -1.2, 0), (1.3 + dx, -1.2, .8), .04, WOOD, 6)
    box((1.3, -1.2, .9), (1.0, .7, .08), VERM, (0, .1, -.3))
    for k, c in enumerate(((1, .25, .08), (1, .8, .2), (.15, .55, 1))): lantern((.95 + .35 * k, -.95, .65), .09, mat(f'lan{k}', c, .3, 0, 1.6), INK)
    # clockwork corner
    BRASS = mat('brass', (.75, .48, .16), .35, .9)
    cyl((-1.3, -1.2, .45), .4, .9, mat('plate', (.32, .30, .28), .55, .6), 8, r2=.32, smooth=False)
    gear((-1.3, -.82, .55), .25, 8, .08, BRASS, (math.pi / 2, 0, 0))
    # roads from each corner to the plaza
    for (x, y) in ((-1.5, .2), (1.4, 1.2), (1.3, -1.2), (-1.3, -1.2)):
        rod((x * .55, y * .55, .02), (x * .25, y * .25, .02), .16, mat('path', (.74, .58, .36), .8), 8)
    CLOUD = mat('cloud', (.95, .96, 1.0), .9)
    cloud((-2.8, -.5, -1.4), .6, CLOUD); cloud((2.6, .8, -1.8), .5, CLOUD)
    world_col = (.60, .76, .86)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = opts.samples; scene.cycles.use_denoising = True
scene.render.resolution_x = opts.size; scene.render.resolution_y = opts.size
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'; scene.view_settings.exposure = -.35
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (*world_col, 1); bg.inputs[1].default_value = env * .55
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam)
cam_d.type = 'ORTHO'; cam_d.ortho_scale = 7.4
cam.location = (8, -9, 7.2); cam.rotation_euler = (Vector((0, 0, .5)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); scene.camera = cam
ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = 4.2 if S != 'market' else .6; ld.color = sun; ld.angle = .2
lo = bpy.data.objects.new('sun', ld); scene.collection.objects.link(lo); lo.rotation_euler = (math.radians(50), 0, math.radians(35))
fd = bpy.data.lights.new('fill', 'AREA'); fd.energy = 600 if S != 'market' else 420; fd.size = 6; fd.color = (.7, .85, 1)
fo = bpy.data.objects.new('fill', fd); scene.collection.objects.link(fo); fo.location = (-6, -4, 5); fo.rotation_euler = (Vector((0, 0, 0)) - fo.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = str(OUT / f'realm-{S}.png'); bpy.ops.render.render(write_still=True)
print('REALM', S)
