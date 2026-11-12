"""Arcana theme battlefields (forest 'Verdant woods' / snow 'Silverfrost range') as detailed 3D dioramas.

Every road, build pad, river and ice band is generated from the game's own board data (src/games/defense/data.ts)
and from the engine's zone constants, so a render at the battle camera lies 1:1 on the 900 x 600 board.

Run (Blender 5.2 bpy module):
  python build_theme_map.py -- --data <repo>/src/games/defense/data.ts --stage 4 --views battle,beauty --out <dir>
Options: --size 1350 --samples 64 --gate (add the theme gate set) --glb --blend --seed 7
Draft / production candidate: nothing here is wired into the game.
"""
import sys, os, math, random, argparse, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from arcana_bpy import (MB, SIN60, add_obj, area, battle_camera, camera, collection, mat, read_board, render, reset_scene,
                        rot, setup_render, srgb, stats, sun, trs, vcol_mat)

ap = argparse.ArgumentParser()
ap.add_argument('--data', required=True); ap.add_argument('--stage', type=int, default=1); ap.add_argument('--out', required=True)
ap.add_argument('--views', default='battle'); ap.add_argument('--size', type=int, default=1350); ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--gate', action='store_true'); ap.add_argument('--glb', action='store_true'); ap.add_argument('--blend', action='store_true')
ap.add_argument('--seed', type=int, default=7)
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

THEME = 'snow' if args.stage >= 5 else 'forest'
EXPANDED = args.stage in (4, 8)
SNOW = THEME == 'snow'
board = read_board(args.data)[THEME]
PATHS = board['paths'][:2 if EXPANDED else 1]
SLOTS = [s for s in board['slots'] if s['unlock'] <= args.stage]
HERO = (440, 390) if SNOW else (440, 355)                 # createDefense() start position
VILLAGES = [(850, 318)] + ([(852, 131)] if EXPANDED else [])  # where the game layer draws the village sprites
MARGIN = 150
rng = random.Random(args.seed * 1000 + args.stage)
nrng = np.random.default_rng(args.seed * 77 + args.stage)


def W(x, y, z=0.0):
    """Board pixel -> world. Depth is stretched by 1/sin60 so the 60 deg camera shows the board 1:1."""
    return Vector((x / 100.0, (600.0 - y) / 100.0 / SIN60, z))


# ---------------------------------------------------------------- numpy helpers
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def _hash(ix, iy, seed):
    n = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + seed * 982451653) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, seed=0):
    ix, iy = np.floor(x), np.floor(y); fx, fy = x - ix, y - iy
    u, v = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed); c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def fbm(x, y, scale, octaves=4, seed=0):
    total, amp, f = 0.0, .5, 1.0 / scale
    for i in range(octaves):
        total = total + amp * vnoise(x * f, y * f, seed + i * 17); amp *= .5; f *= 2
    return total / (1 - .5 ** octaves)


def ext_paths():
    out = []
    for path in PATHS:
        pts = [(p['x'], p['y']) for p in path]
        (ax, ay), (bx, by) = pts[0], pts[1]; L = math.hypot(bx - ax, by - ay)
        pts[0] = (ax - (bx - ax) / L * 220, ay - (by - ay) / L * 220)
        (ax, ay), (bx, by) = pts[-2], pts[-1]; L = math.hypot(bx - ax, by - ay)
        pts[-1] = (bx + (bx - ax) / L * 30, by + (by - ay) / L * 30)
        out.append(pts)
    return out


EPATHS = ext_paths()


def path_dist(X, Y):
    d = np.full(np.shape(X), 1e9)
    for pts in EPATHS:
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L, 0, 1)
            d = np.minimum(d, np.hypot(X - ax - t * dx, Y - ay - t * dy))
    return d


def pts_dist(X, Y, pts):
    d = np.full(np.shape(X), 1e9)
    for (px, py) in pts:
        d = np.minimum(d, np.hypot(X - px, Y - py))
    return d


# Engine zones: forest water e.x in (650,735); snow ice e.x in [300,520]. Banks wobble only outside those limits.
def band_edges(Y):
    if SNOW:
        return 296 - 9 * fbm(Y * 0 + 3.0, Y, 70, 3, 5), 524 + 9 * fbm(Y * 0 + 9.0, Y, 80, 3, 6)
    return 648 - 8 * fbm(Y * 0 + 3.0, Y, 60, 3, 5), 737 + 8 * fbm(Y * 0 + 9.0, Y, 75, 3, 6)


def band_mask(X, Y, soft=7.0):
    lb, rb = band_edges(Y)
    return smooth(lb - soft, lb + soft, X) * (1 - smooth(rb - soft, rb + soft, X))


def outside(X, Y):
    return np.maximum(np.maximum(-X, X - 900), np.maximum(np.maximum(-Y, Y - 600), 0))


def inside(X, Y):
    """Distance to the nearest board edge, positive inside the 900 x 600 board."""
    return np.minimum(np.minimum(X, 900 - X), np.minimum(Y, 600 - Y))


HIGH = [(s['x'], s['y']) for s in SLOTS if s['terrain'] == 'high']
SLOT_PTS = [(s['x'], s['y']) for s in SLOTS]
GATES = [(900, 300)] + ([(900, 115)] if EXPANDED else [])


def height_field(X, Y):
    d = path_dist(X, Y); band = band_mask(X, Y)
    h = .045 * (fbm(X, Y, 120, 4, 1) - .5) + .012 * (fbm(X, Y, 22, 3, 2) - .5)
    m = outside(X, Y)
    hills = smooth(15, 150, m) * (.30 + .55 * fbm(X, Y, 160, 3, 3))
    for (gx, gy) in GATES:                                   # keep the gate apron flat
        hills = hills * smooth(110, 190, np.hypot((X - gx) * .8, Y - gy))
    h = h + hills
    plat = np.zeros_like(h)
    for (px, py) in HIGH:
        plat = np.maximum(plat, 1 - smooth(38, 64, np.hypot(X - px, Y - py)))
    plat = plat * smooth(24, 44, d)
    h = h + .26 * plat
    h = h * (1 - .92 * (1 - smooth(22, 46, d)))             # roads stay level
    if SNOW:
        h = h + .05 * smooth(.55, .8, fbm(X, Y, 55, 3, 11)) * smooth(40, 70, d)    # wind drifts
        h = h * (1 - band) + (-.035) * band
    else:
        h = h * (1 - band) + (-.24 + .05 * fbm(X, Y, 30, 2, 8)) * band
    return h, d, band, plat


# ---------------------------------------------------------------- scene
scene = reset_scene()
C_TERRAIN, C_WATER, C_PROPS, C_FLORA, C_SET, C_STUDIO = (collection(n) for n in ('Terrain', 'Water and ice', 'Props', 'Flora', 'Theme set', 'Studio'))

PAL = {
    'forest': dict(g=['#84b246', '#5d983b', '#a9c95b', '#3f7836'], dirt=['#dcc18c', '#c3a36c'], edge='#86703f', rut='#a98b58',
                   rock=['#9a9d92', '#6a7068'], bed='#3c6f6c', floor='#3a6a33', top='#6f9a45'),
    'snow': dict(g=['#e3ecf2', '#cfdde7', '#f1f6f9', '#b3c9d9'], dirt=['#bfd0d9', '#a6bcc8'], edge='#6f8f9c', rut='#8eaab8',
                 rock=['#8b96a0', '#5d6873'], bed='#7fb9d2', floor='#bccfdc', top='#e9f1f6'),
}[THEME]


def lin3(c):
    return np.array(srgb(c)[:3])


def build_terrain():
    step = 5
    xs = np.arange(-MARGIN, 900 + MARGIN + 1, step, dtype=float); ys = np.arange(-MARGIN, 600 + MARGIN + 1, step, dtype=float)
    X, Y = np.meshgrid(xs, ys)
    H, d, band, plat = height_field(X, Y)
    gy, gx = np.gradient(H, step / 100 / SIN60, step / 100)
    slope = np.hypot(gx, gy)
    n1, n2, n3 = fbm(X, Y, 140, 4, 21), fbm(X, Y, 38, 3, 22), fbm(X, Y, 9, 2, 23)
    g = [lin3(c) for c in PAL['g']]
    col = g[0][None, None, :] * (1 - n1[..., None]) + g[1][None, None, :] * n1[..., None]
    col = col + (g[2] - col) * (smooth(.56, .78, n2) * .65)[..., None]
    col = col + (g[3] - col) * (smooth(.6, .85, 1 - n2) * .35)[..., None]
    col = col * (.92 + .16 * n3)[..., None]
    m = outside(X, Y)
    col = col + (lin3(PAL['floor']) - col) * (smooth(20, 120, m) * .55)[..., None]
    rock = smooth(.5, 1.0, slope) * (1 - smooth(18, 30, d) * 0 - 0)
    rc = lin3(PAL['rock'][0])[None, None, :] * (1 - n2[..., None]) + lin3(PAL['rock'][1])[None, None, :] * n2[..., None]
    col = col + (rc - col) * rock[..., None]
    # road: light core, darker rim, two cart ruts
    road = (1 - smooth(18, 25, d)); rim = smooth(15, 21, d) * (1 - smooth(24, 31, d))
    dc = lin3(PAL['dirt'][0])[None, None, :] * (1 - n2[..., None]) + lin3(PAL['dirt'][1])[None, None, :] * n2[..., None]
    dc = dc * (.93 + .14 * n3)[..., None]
    col = col + (dc - col) * road[..., None]
    col = col + (lin3(PAL['edge']) - col) * (rim * (.55 if not SNOW else .5))[..., None]
    rut = np.exp(-((d - 8.5) / 2.2) ** 2) * road
    col = col + (lin3(PAL['rut']) - col) * (rut * .6)[..., None]
    # river bed / under-ice
    col = col + (lin3(PAL['bed']) - col) * band[..., None]
    if SNOW:
        col = col + (lin3('#b4cbdc') - col) * (smooth(.0, .07, -(H - H.max()) * 0) * 0)[..., None]
    ny, nx = X.shape
    world_y = (600.0 - Y) / 100.0 / SIN60
    verts = np.stack([X / 100.0, world_y, H], axis=-1).reshape(-1, 3)
    idx = np.arange(ny * nx).reshape(ny, nx)
    faces = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new('Terrain / ' + THEME)
    me.from_pydata(verts.tolist(), [], faces.tolist()); me.update()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', np.concatenate([np.clip(col, 0, 1).reshape(-1, 3), np.ones((ny * nx, 1))], axis=1).ravel())
    me.materials.append(vcol_mat('Ground / painted vertex colour', 'Col', rough=.92 if not SNOW else .78, bump=.25 if not SNOW else .12, bump_scale=90))
    add_obj(me, coll=C_TERRAIN)
    return xs, ys, H


xs, ys, HGRID = build_terrain()


def hz(x, y):
    fx = min(max((x - xs[0]) / (xs[1] - xs[0]), 0), len(xs) - 1.001); fy = min(max((y - ys[0]) / (ys[1] - ys[0]), 0), len(ys) - 1.001)
    ix, iy = int(fx), int(fy); tx, ty = fx - ix, fy - iy
    a, b, c, d = HGRID[iy, ix], HGRID[iy, ix + 1], HGRID[iy + 1, ix], HGRID[iy + 1, ix + 1]
    return float(a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty)


def build_band_surface():
    """River water (forest) or the frozen river sheet (snow) with painted flow / frost and the scraped ice road."""
    step = 2.5
    x0, x1 = (270, 550) if SNOW else (628, 757)
    gx = np.arange(x0, x1 + .1, step); gy = np.arange(-MARGIN, 600 + MARGIN + .1, 5.0)
    X, Y = np.meshgrid(gx, gy); lb, rb = band_edges(Y); mid = (lb + rb) / 2; half = (rb - lb) / 2
    centre = np.clip(1 - np.abs(X - mid) / half, 0, 1)
    if SNOW:
        n1, n2 = fbm(X, Y, 90, 3, 31), fbm(X, Y, 16, 3, 32)
        col = lin3('#93d2ea')[None, None, :] * (1 - n1[..., None]) + lin3('#62b3d8')[None, None, :] * n1[..., None]
        col = col + (lin3('#d9eef6') - col) * (smooth(.56, .8, n2) * .45)[..., None]          # frost blooms
        col = col + (lin3('#e3ecf2') - col) * ((1 - smooth(.0, .2, centre)) * .85)[..., None]  # snow creeping in from the banks
        d = path_dist(X, Y); road = 1 - smooth(18, 25, d)
        scr = vnoise(X / 3.0, Y / 3.0, 40)
        rc = lin3('#c4e3ee')[None, None, :] * (1 - scr[..., None] * .4) + lin3('#8fbfd4')[None, None, :] * (scr[..., None] * .4)
        col = col + (rc - col) * (road * .9)[..., None]
        col = col + (lin3('#6ea5bd') - col) * ((smooth(15, 21, d) * (1 - smooth(23, 29, d))) * .55)[..., None]
        z = np.full(X.shape, -.004); rough, name = .16, 'Ice sheet / frozen river'
    else:
        flow = vnoise(X / 7.0, Y / 46.0, 41); n2 = fbm(X, Y, 14, 2, 42)
        col = lin3('#62cfd0')[None, None, :] * (1 - smooth(.15, .8, centre)[..., None]) + lin3('#1f88a8')[None, None, :] * smooth(.15, .8, centre)[..., None]
        col = col + (lin3('#c9f3f1') - col) * (smooth(.62, .8, flow) * .5)[..., None]          # flow streaks
        foam = (1 - smooth(.04, .2, centre)) * smooth(.35, .6, n2)
        casc = np.exp(-((Y - 66) / 13.0) ** 2) * smooth(.3, .6, n2) + np.exp(-((Y - 58) / 4.0) ** 2) * .9
        col = col + (lin3('#ffffff') - col) * np.clip(foam * .9 + casc * .85, 0, 1)[..., None]
        z = -.055 + .012 * np.sin(Y / 23.0) + np.where(Y < 56, .05, 0.0); rough, name = .1, 'Water / river with flow streaks'
    ny, nx = X.shape
    verts = np.stack([X / 100.0, (600.0 - Y) / 100.0 / SIN60, z], axis=-1).reshape(-1, 3)
    idx = np.arange(ny * nx).reshape(ny, nx)
    faces = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new(name); me.from_pydata(verts.tolist(), [], faces.tolist()); me.update()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', np.concatenate([np.clip(col, 0, 1).reshape(-1, 3), np.ones((ny * nx, 1))], axis=1).ravel())
    me.materials.append(vcol_mat('Band / ' + name, 'Col', rough=rough, bump=.35 if not SNOW else .08, bump_scale=140 if not SNOW else 60))
    add_obj(me, coll=C_WATER)


build_band_surface()

# ---------------------------------------------------------------- materials
M = dict(
    trunk=mat('Wood / bark', '#5b3d26', .95, bump=.5, bump_scale=60), trunk_l=mat('Wood / bark lit', '#7a5636', .95),
    wood=mat('Wood / plank', '#a8764a', .8, bump=.3, bump_scale=120), wood_d=mat('Wood / plank dark', '#6f4a2f', .85), wood_l=mat('Wood / cut end', '#d9b27a', .8),
    leaf=[mat('Leaf / shade', '#285c30', .9), mat('Leaf / mid', '#44883a', .9), mat('Leaf / sunlit', '#7cb146', .9)],
    pine=[mat('Pine / deep teal', '#1d5247', .9), mat('Pine / mid', '#2f7458', .9), mat('Pine / tip', '#4c9468', .9)],
    maple=[mat('Maple / shade', '#9b3324', .9), mat('Maple / mid', '#cf5631', .9), mat('Maple / sunlit', '#ee9440', .9)],
    bush=[mat('Bush / shade', '#2f6a31', .9), mat('Bush / mid', '#55933c', .9), mat('Bush / lit', '#8cbf52', .9)],
    rock=mat('Rock / facet', PAL['rock'][0], .9, bump=.4, bump_scale=40), rock_d=mat('Rock / shade', PAL['rock'][1], .95), rock_top=mat('Rock / moss or snow top', PAL['top'], .9),
    stone=mat('Stone / ivory block', '#cfc8b4', .85, bump=.25, bump_scale=80), stone_d=mat('Stone / joint', '#8f8a7b', .9), stone_l=mat('Stone / pad inlay', '#ebe3cc', .8),
    teal=mat('Cloth / teal', '#1f7a72', .7), vermilion=mat('Cloth / vermilion', '#c8452c', .7), ivory=mat('Cloth / ivory emblem', '#f3ead2', .7),
    roof=mat('Roof / teal tile', '#236c69', .6), roof_l=mat('Roof / teal ridge', '#3b9a8e', .6), brass=mat('Metal / brass', '#c79a3e', .35, metal=1.0),
    iron=mat('Metal / dark iron', '#3b4245', .5, metal=.8), glow=mat('Light / lantern', '#ffe2a0', .4, emit='#ffc45e', emit_strength=7.0),
    fire=mat('Light / brazier fire', '#ffb14a', .4, emit='#ff7a1e', emit_strength=9.0), snow=mat('Snow / cap', '#e6eef4', .75),
    ice=mat('Ice / crystal', '#9fe3f4', .08, emit='#8fdcf3', emit_strength=.55, coat=1.0), ice_d=mat('Ice / crack', '#3f86a8', .4),
    rune=mat('Pad / rune inlay', '#49b7a6' if not SNOW else '#7cc9ee', .4, emit='#49d7c0' if not SNOW else '#8fd8ff', emit_strength=.35),
    grass=[mat('Grass / blade', '#6ea63f', .9), mat('Grass / blade lit', '#a6cf5c', .9)], dry=[mat('Grass / winter straw', '#c8b98a', .9), mat('Grass / winter straw lit', '#e6dcb4', .9)],
    petal=[mat('Flower / ivory', '#fff6d8', .7), mat('Flower / gold', '#f4c443', .7), mat('Flower / vermilion', '#e2553a', .7), mat('Flower / violet', '#b89be0', .7)],
    cap=mat('Mushroom / cap', '#c9462e', .6), stem=mat('Mushroom / stem', '#efe4cc', .8), reed=mat('Reed / stalk', '#7fa04b', .9), cattail=mat('Reed / cattail', '#6a4528', .9),
    door=mat('Wood / gate door', '#7a5230', .8, bump=.4, bump_scale=140), dark=mat('Shadow / opening', '#1c2320', 1.0), rope=mat('Rope / hemp', '#b99a63', .9),
    thatch=mat('Roof / snowy timber', '#6c4a33', .85), fur=mat('Cloth / hide', '#8c6d4c', .95),
)


def top_tone(b, verts, m, nz=.5):
    b.bm.normal_update(); i = b._mi(m)
    for f in {f for v in verts for f in v.link_faces}:
        if f.normal.z > nz:
            f.material_index = i


# ---------------------------------------------------------------- prototypes
def tree_broad(seed, pal):
    r = random.Random(seed); b = MB(); h = r.uniform(.44, .6); lean = r.uniform(-.07, .07)
    b.tube(M['trunk'], [(0, 0, -.03), (lean * .35, 0, h * .5), (lean, .02, h + .12)], [.085, .06, .045], seg=8)
    for k in range(5):                                   # root flare
        a = k * 2 * math.pi / 5 + r.uniform(-.3, .3)
        b.tube(M['trunk'], [(0, 0, .12), (math.cos(a) * .09, math.sin(a) * .09, .03), (math.cos(a) * .17, math.sin(a) * .17, -.03)], [.036, .03, .012], seg=5)
    for k in range(3):                                   # boughs
        a = r.uniform(0, 6.28); L = r.uniform(.18, .27); z = h * r.uniform(.62, .95)
        b.tube(M['trunk_l'], [(lean, 0, z), (lean + math.cos(a) * L * .6, math.sin(a) * L * .6, z + L * .45), (lean + math.cos(a) * L, math.sin(a) * L, z + L * .7)], [.03, .022, .012], seg=5)
    cz = h + .24
    for k in range(r.randint(15, 19)):                   # layered foliage masses: shade below, sunlit on top
        a = r.uniform(0, 6.28); rad = r.uniform(.04, .34); zz = cz + r.uniform(-.14, .2) - rad * .25; rr = r.uniform(.11, .19)
        tone = 2 if zz > cz + .06 else (0 if zz < cz - .06 else 1)
        b.ico(pal[tone], rr, 2, trs((lean + math.cos(a) * rad, math.sin(a) * rad, zz)), jitter=rr * .3, jscale=2.4, seed=seed * 10 + k, squash=(1, 1, .78))
    b.ico(pal[1], .24, 2, trs((lean, 0, cz - .02)), jitter=.05, seed=seed + 77, squash=(1, 1, .7))      # core mass
    b.ico(pal[2], .17, 2, trs((lean - .03, -.03, cz + .25)), jitter=.045, seed=seed + 99, squash=(1, 1, .68))
    for k in range(9):                                   # small leaf tufts breaking the outline
        a = r.uniform(0, 6.28); b.ico(pal[r.choice([0, 1, 2])], r.uniform(.045, .075), 1, trs((lean + math.cos(a) * .4, math.sin(a) * .4, cz + r.uniform(-.14, .14))), jitter=.02, seed=seed + k)
    return b.to_mesh(f'Tree / broadleaf {seed}')


def tree_conifer(seed, snowy):
    r = random.Random(seed); b = MB(); tiers = r.choice([5, 6]); R = r.uniform(.3, .36); z = .2
    b.cyl(M['trunk'], .05, .34, 7, taper=.75)
    for i in range(tiers):
        ri = R * (1 - i / tiers * .8); hg = .36 - i * .03
        b.cone(M['pine'][0 if i % 2 == 0 else 1], ri, ri * .1, hg, 12, trs((0, 0, z), rot('Z', i * 17 + seed * 5)), star=.3, droop=.045)
        b.cone(M['pine'][2], ri * .62, ri * .08, hg * .78, 12, trs((0, 0, z + hg * .16), rot('Z', i * 17 + seed * 5 + 15)), star=.25)   # lit inner layer
        if snowy:
            b.cone(M['snow'], ri * .8, ri * .07, hg * .72, 12, trs((0, 0, z + hg * .3), rot('Z', i * 17 + seed * 5 + 7)), star=.22, smooth=True)
        z += hg * .5
    b.cone(M['snow'] if snowy else M['pine'][2], .035, .0, .12, 6, trs((0, 0, z + .08)))
    return b.to_mesh(f'Tree / conifer {seed}')


def tree_bare(seed):
    r = random.Random(seed); b = MB(); h = r.uniform(.5, .7)
    b.tube(M['trunk'], [(0, 0, -.02), (.02, 0, h * .5), (-.02, .01, h)], [.06, .045, .03], seg=7)
    for k in range(6):
        a = r.uniform(0, 6.28); z = h * r.uniform(.45, 1.0); L = r.uniform(.2, .36)
        tip = (math.cos(a) * L, math.sin(a) * L, z + L * .8); midp = (math.cos(a) * L * .55, math.sin(a) * L * .55, z + L * .3)
        b.tube(M['trunk'], [(0, 0, z), midp, tip], [.028, .018, .007], seg=5)
        a2 = a + r.uniform(-.9, .9)
        b.tube(M['trunk'], [midp, (midp[0] + math.cos(a2) * .12, midp[1] + math.sin(a2) * .12, midp[2] + .12)], [.012, .004], seg=4)
        b.ico(M['snow'], .03, 1, trs(midp, scale=(1.6, 1, .5)))
    return b.to_mesh(f'Tree / bare {seed}')


def bush(seed, pal):
    r = random.Random(seed); b = MB()
    for k in range(r.randint(4, 6)):
        a = r.uniform(0, 6.28); rad = r.uniform(0, .1); rr = r.uniform(.07, .12)
        b.ico(pal[min(2, k // 2)], rr, 2, trs((math.cos(a) * rad, math.sin(a) * rad, rr * .7 + k * .012)), jitter=rr * .25, seed=seed + k, squash=(1, 1, .78))
    return b.to_mesh(f'Bush {seed}')


def rock(seed, big=False):
    r = random.Random(seed); b = MB()
    v = b.ico(M['rock'], 1, 2, trs((0, 0, .32), rot('Z', r.uniform(0, 360)), (1, r.uniform(.7, .95), r.uniform(.5, .75))), jitter=.3, jscale=1.6, seed=seed, smooth=False)
    top_tone(b, v, M['rock_top'], .62)
    if big:
        v = b.ico(M['rock_d'], .55, 2, trs((.75, .15, .16), rot('Z', 40), (1, .8, .6)), jitter=.2, jscale=1.8, seed=seed + 5, smooth=False); top_tone(b, v, M['rock_top'], .62)
        v = b.ico(M['rock'], .4, 1, trs((-.7, -.25, .1), rot('Z', 10), (1, .9, .6)), jitter=.14, seed=seed + 9, smooth=False); top_tone(b, v, M['rock_top'], .62)
    return b.to_mesh(f'Rock {seed}')


def tuft(seed, pal):
    r = random.Random(seed); b = MB()
    for k in range(6):
        a = r.uniform(0, 6.28); L = r.uniform(.05, .09); w = .012; lx, ly = math.cos(a) * L * .5, math.sin(a) * L * .5
        px, py = -math.sin(a) * w, math.cos(a) * w
        b.quad(pal[k % 2], [(px + lx * .2, py + ly * .2, 0), (-px + lx * .2, -py + ly * .2, 0), (lx, ly, L)])
    return b.to_mesh(f'Grass tuft {seed}')


def flower(i):
    b = MB(); b.quad(M['grass'][0], [(.006, 0, 0), (-.006, 0, 0), (0, 0, .05)])
    b.ico(M['petal'][i], .02, 1, trs((0, 0, .055), scale=(1, 1, .6)), smooth=True); b.ico(M['petal'][1], .008, 1, trs((0, 0, .066)))
    return b.to_mesh(f'Flower {i}')


def mushroom():
    b = MB()
    for (x, y, s) in ((0, 0, 1.0), (.045, .02, .7), (-.03, .04, .55)):
        b.cyl(M['stem'], .012 * s, .05 * s, 6, trs((x, y, 0))); b.ico(M['cap'], .034 * s, 2, trs((x, y, .05 * s), scale=(1, 1, .6)))
        b.ico(M['stem'], .008 * s, 1, trs((x + .012 * s, y - .01 * s, .066 * s)))
    return b.to_mesh('Mushroom cluster')


def reeds(seed):
    r = random.Random(seed); b = MB()
    for k in range(8):
        a = r.uniform(0, 6.28); d = r.uniform(0, .05); L = r.uniform(.14, .24); x, y = math.cos(a) * d, math.sin(a) * d; lean = r.uniform(-.04, .04)
        b.quad(M['reed'], [(x - .006, y, 0), (x + .006, y, 0), (x + lean, y, L)])
        if k % 3 == 0:
            b.cyl(M['cattail'], .009, .045, 5, trs((x + lean, y, L - .01)))
    return b.to_mesh(f'Reeds {seed}')


def stump():
    b = MB(); b.cyl(M['trunk'], .095, .13, 9, taper=.85); b.cyl(M['wood_l'], .078, .006, 9, trs((0, 0, .13)))
    b.cyl(M['wood'], .04, .003, 9, trs((0, 0, .137)))
    for k in range(4):
        a = k * 1.57 + .4; b.tube(M['trunk'], [(0, 0, .05), (math.cos(a) * .12, math.sin(a) * .12, .0), (math.cos(a) * .18, math.sin(a) * .18, -.03)], [.035, .025, .01], seg=5)
    b.box(M['iron'], (.02, .09, .06), trs((.02, 0, .2), rot('Y', 25))); b.cyl(M['wood'], .01, .2, 5, trs((.03, 0, .15), rot('Y', 60)))   # axe left in the stump
    return b.to_mesh('Stump with axe')


def log_pile():
    b = MB()
    for (y, z) in ((-.09, .05), (0, .05), (.09, .05), (-.045, .125), (.045, .125), (0, .2)):
        b.cyl(M['trunk'], .047, .42, 8, trs((-.21, y, z), rot('Y', 90)))
        for x in (-.212, .212):
            b.cyl(M['wood_l'], .04, .004, 8, trs((x, y, z), rot('Y', 90)))
    return b.to_mesh('Log pile')


def fence(n=3):
    b = MB()
    for k in range(n + 1):
        b.cyl(M['wood_d'], .018, .2, 6, trs((k * .26, 0, 0), rot('Y', (k % 2) * 4 - 2))); b.cone(M['snow'] if SNOW else M['wood_l'], .02, .004, .025, 6, trs((k * .26, 0, .2)))
    for z in (.08, .15):
        b.box(M['wood'], (n * .26 + .06, .014, .028), trs((n * .13, 0, z), rot('X', 6)))
    return b.to_mesh('Fence run')


def lantern():
    b = MB(); b.cyl(M['wood_d'], .016, .44, 6); b.box(M['wood_d'], (.14, .016, .016), trs((.06, 0, .42)))
    b.cyl(M['rope'], .003, .05, 4, trs((.12, 0, .37)))
    b.box(M['glow'], (.05, .05, .065), trs((.12, 0, .335))); b.box(M['iron'], (.06, .06, .008), trs((.12, 0, .3)))
    b.cone(M['roof'], .05, .005, .035, 4, trs((.12, 0, .368), rot('Z', 45)))
    b.cyl(M['stone'], .04, .03, 8)
    return b.to_mesh('Lantern post')


def signpost():
    b = MB(); b.cyl(M['wood_d'], .018, .36, 6)
    b.box(M['wood'], (.2, .012, .055), trs((.05, 0, .3), rot('Z', 12))); b.box(M['wood'], (.17, .012, .05), trs((-.04, 0, .22), rot('Z', -160)))
    b.cone(M['wood'], .03, .001, .05, 3, trs((.16, .0, .3), rot('Y', 90)))
    return b.to_mesh('Signpost')


def banner(cloth):
    b = MB(); b.cyl(M['wood_d'], .014, .72, 6); b.ico(M['brass'], .022, 1, trs((0, 0, .73)))
    b.box(M['wood_d'], (.2, .012, .012), trs((.09, 0, .68)))
    pts = [(.02, 0, .67), (.18, 0, .67), (.18, 0, .36), (.10, 0, .3), (.02, 0, .36)]
    b.quad(cloth, pts)
    b.quad(M['ivory'], [(.10, -.003, .6), (.145, -.003, .52), (.10, -.003, .44), (.055, -.003, .52)])
    b.quad(M['brass'], [(.02, -.002, .385), (.18, -.002, .385), (.18, -.002, .37), (.02, -.002, .37)])
    return b.to_mesh('Banner pole')


def brazier():
    b = MB()
    for k in range(3):
        a = k * 2.094; b.tube(M['iron'], [(math.cos(a) * .07, math.sin(a) * .07, 0), (math.cos(a) * .03, math.sin(a) * .03, .16)], .008, seg=4)
    b.cone(M['iron'], .03, .075, .06, 8, trs((0, 0, .15)))
    for k in range(4):
        b.ico(M['fire'], .03 - k * .005, 1, trs((rng.uniform(-.02, .02), rng.uniform(-.02, .02), .21 + k * .03), scale=(1, 1, 1.5)))
    return b.to_mesh('Brazier')


def crystals(seed):
    r = random.Random(seed); b = MB()
    for k in range(r.randint(4, 6)):
        a = r.uniform(0, 6.28); d = r.uniform(0, .09); L = r.uniform(.14, .34); rr = L * .2; tilt = r.uniform(-22, 22)
        Mx = trs((math.cos(a) * d, math.sin(a) * d, 0), rot('Z', math.degrees(a)) @ rot('Y', tilt))
        b.cone(M['ice'], rr, rr * .9, L * .55, 6, Mx, smooth=False, cap=False)
        b.cone(M['ice'], rr * .9, .0, L * .45, 6, Mx @ trs((0, 0, L * .55)), smooth=False)
    return b.to_mesh(f'Ice crystals {seed}')


def drift(seed):
    b = MB(); b.ico(M['snow'], 1, 3, trs(scale=(1, .7, .22)), jitter=.2, jscale=1.4, seed=seed); return b.to_mesh(f'Snow drift {seed}')


def crate():
    b = MB(); b.box(M['wood'], (.12, .12, .1), trs((0, 0, .05)), bevel=.008)
    for z in (.015, .085):
        b.box(M['wood_d'], (.125, .125, .014), trs((0, 0, z)))
    b.cyl(M['wood_d'], .05, .13, 9, trs((.14, .03, 0), scale=(1, 1, 1))); b.cyl(M['iron'], .052, .012, 9, trs((.14, .03, .03))); b.cyl(M['iron'], .052, .012, 9, trs((.14, .03, .09)))
    if SNOW:
        b.ico(M['snow'], .06, 1, trs((0, 0, .105), scale=(1, 1, .3)))
    return b.to_mesh('Crate and barrel')


def pad(terrain):
    """Build-pad dais. Stretched 1/sin60 in depth by the instance so it reads as the game's round pad."""
    b = MB(); high = terrain == 'high'; base = .15 if high else .045
    if high:
        b.cyl(M['stone_d'], .30, .05, 20, smooth=False); b.cyl(M['stone'], .275, .1, 20, trs((0, 0, .05)), smooth=False)
    b.cyl(M['stone_d'], .255, base, 20, smooth=False)
    for k in range(12):                                  # rim blocks
        a = k * 2 * math.pi / 12
        b.box(M['stone'] if k % 2 else M['stone_l'], (.105, .05, .03), trs((math.cos(a) * .225, math.sin(a) * .225, base + .012), rot('Z', math.degrees(a) + 90)), bevel=.006)
    b.cyl(M['stone_l'], .185, .012, 20, trs((0, 0, base)), smooth=False)
    b.box(M['rune'], (.22, .022, .006), trs((0, 0, base + .012))); b.box(M['rune'], (.022, .22, .006), trs((0, 0, base + .012)))
    b.cyl(M['rune'], .05, .008, 10, trs((0, 0, base + .011)))
    if high:
        for a in (45, 135, 225, 315):
            ar = math.radians(a); b.cyl(M['wood_d'], .012, .16, 5, trs((math.cos(ar) * .25, math.sin(ar) * .25, .15)))
            b.quad(M['vermilion'] if SNOW else M['teal'], [(math.cos(ar) * .25, math.sin(ar) * .25, .3), (math.cos(ar) * .25 + .06, math.sin(ar) * .25, .28), (math.cos(ar) * .25, math.sin(ar) * .25, .25)])
    if terrain == 'water':
        for a in (20, 160, 250):
            ar = math.radians(a); b.cyl(M['wood_d'], .02, .12, 6, trs((math.cos(ar) * .27, math.sin(ar) * .27, -.04)))
        b.tube(M['rope'], [(math.cos(.35) * .27, math.sin(.35) * .27, .07), (0, .3, .04), (math.cos(2.8) * .27, math.sin(2.8) * .27, .07)], .005, seg=4)
    if terrain == 'ice':
        for a, L in ((30, .12), (150, .09), (270, .1)):
            ar = math.radians(a); b.cone(M['ice'], .025, .0, L, 6, trs((math.cos(ar) * .27, math.sin(ar) * .27, 0), rot('Y', 12)), smooth=False)
    return b.to_mesh(f'Build pad / {terrain}')


def bridge(yb):
    """Plank bridge across the engine's water zone (x 650..735) at board row yb."""
    b = MB(); x0, x1 = 630, 762; L = (x1 - x0) / 100; depth = .5 / SIN60
    arch = lambda t: .05 + .055 * math.sin(math.pi * t)
    n = 14
    for k in range(n):
        t = (k + .5) / n; x = -L / 2 + L * t
        b.box(M['wood'] if k % 2 else M['wood_l'], (L / n * .9, depth, .028), trs((x, 0, arch(t)), rot('Y', -math.degrees(math.atan(.055 * math.pi * math.cos(math.pi * t) / L))) @ rot('Z', rng.uniform(-1.5, 1.5))), bevel=.004)
    for side in (-1, 1):
        y = side * depth / 2
        b.tube(M['wood_d'], [(-L / 2 + L * t, y * .96, arch(t) - .03) for t in (0, .25, .5, .75, 1)], .022, seg=6)          # beam
        b.tube(M['wood_d'], [(-L / 2 + L * t, y, arch(t) + .15) for t in (0, .25, .5, .75, 1)], .014, seg=6)                # hand rail
        for t in (0, .25, .5, .75, 1):
            b.cyl(M['wood_d'], .018, .2, 6, trs((-L / 2 + L * t, y, arch(t) - .03))); b.cone(M['wood_l'], .022, .004, .03, 6, trs((-L / 2 + L * t, y, arch(t) + .17)))
        for t in (0, 1):                                    # lantern posts at both ends
            b.cyl(M['wood_d'], .02, .34, 6, trs((-L / 2 + L * t, y, arch(t) - .03))); b.box(M['glow'], (.04, .04, .05), trs((-L / 2 + L * t, y, arch(t) + .33)))
            b.cone(M['roof'], .042, .004, .03, 4, trs((-L / 2 + L * t, y, arch(t) + .355), rot('Z', 45)))
    for x in (-L * .22, L * .22):                           # piles standing in the water
        for side in (-1, 1):
            b.cyl(M['trunk'], .03, .34, 7, trs((x, side * depth * .42, -.26)))
    add_obj(b.to_mesh(f'Bridge / row {yb}'), loc=W((x0 + x1) / 2, yb, 0), coll=C_PROPS)


def gate_forest():
    """Verdant citadel gate set: ivory stone wall, teal roofs and banners, brass finials, warm lanterns."""
    b = MB(); wl = 3.1
    b.box(M['stone'], (.24, wl, .56), trs((0, 0, .28)), bevel=.012)
    b.box(M['stone_d'], (.27, wl, .05), trs((0, 0, .03)))
    for k in range(13):                                     # crenellations
        b.box(M['stone_l'], (.26, .13, .1), trs((0, -wl / 2 + .12 + k * (wl - .24) / 12, .61)), bevel=.008)
    b.box(M['stone'], (.4, .92, .9), trs((0, 0, .45)), bevel=.014)                      # gatehouse
    b.box(M['dark'], (.06, .5, .52), trs((-.2, 0, .26)))
    for side in (-1, 1):                                   # door leaves swung open
        b.box(M['door'], (.03, .25, .5), trs((-.3, side * .32, .25), rot('Z', side * 55)))
        for z in (.12, .38):
            b.box(M['iron'], (.034, .26, .03), trs((-.3, side * .32, z), rot('Z', side * 55)))
    for k in range(9):                                     # arch stones
        a = math.pi * k / 8; b.box(M['stone_l'], (.07, .075, .075), trs((-.21, math.cos(a) * .29, .52 + math.sin(a) * .1), rot('X', math.degrees(a) - 90)), bevel=.006)
    b.cone(M['roof'], .58, .06, .36, 4, trs((0, 0, .9), rot('Z', 45), (.75, 1, 1))); b.box(M['roof_l'], (.04, .5, .03), trs((0, 0, 1.23)))
    b.ico(M['brass'], .035, 1, trs((0, 0, 1.28)))
    for side in (-1, 1):                                   # flanking towers
        y = side * .78
        b.cyl(M['stone'], .25, 1.08, 14, trs((0, y, 0)), smooth=True); b.cyl(M['stone_d'], .27, .06, 14, trs((0, y, .72))); b.cyl(M['stone_l'], .275, .07, 14, trs((0, y, 1.02)), smooth=False)
        b.cone(M['roof'], .34, .02, .52, 14, trs((0, y, 1.09)), smooth=True); b.cone(M['roof_l'], .345, .3, .05, 14, trs((0, y, 1.08)))
        b.ico(M['brass'], .03, 1, trs((0, y, 1.63))); b.cyl(M['brass'], .006, .12, 4, trs((0, y, 1.62)))
        b.box(M['dark'], (.04, .05, .14), trs((-.24, y, .8))); b.box(M['glow'], (.03, .04, .05), trs((-.245, y, .5)))
        b.quad(M['teal'], [(-.262, y - .1, .98), (-.262, y + .1, .98), (-.262, y + .1, .62), (-.262, y, .54), (-.262, y - .1, .62)])
        b.quad(M['ivory'], [(-.265, y, .9), (-.265, y + .05, .81), (-.265, y, .72), (-.265, y - .05, .81)])
        b.quad(M['brass'], [(-.264, y - .1, .995), (-.264, y + .1, .995), (-.264, y + .1, .975), (-.264, y - .1, .975)])
    for k in range(16):                                    # ivy
        y = rng.uniform(-wl / 2, wl / 2); z = rng.uniform(.15, .56)
        b.ico(M['leaf'][k % 3], rng.uniform(.035, .07), 1, trs((-.13, y, z), scale=(.5, 1, 1)), jitter=.015, seed=k)
    return b.to_mesh('Gate / verdant citadel')


def gate_snow():
    """Mountain refuge gate: sharpened log palisade, timber lodge gate with a snow-loaded roof, vermilion banners."""
    b = MB(); wl = 3.0
    n = 30
    for k in range(n):
        y = -wl / 2 + k * wl / (n - 1)
        if abs(y) < .36:
            continue
        hgt = .52 + .05 * math.sin(k * 1.7)
        b.cyl(M['trunk'], .052, hgt, 7, trs((rng.uniform(-.01, .01), y, 0))); b.cone(M['wood_l'], .052, .0, .1, 7, trs((0, y, hgt)))
        b.ico(M['snow'], .04, 1, trs((0, y, hgt + .05), scale=(1, 1, .5)))
    for z in (.18, .4):
        b.box(M['wood_d'], (.03, wl, .04), trs((-.06, 0, z)))
    for side in (-1, 1):
        b.cyl(M['trunk'], .075, .98, 8, trs((0, side * .42, 0)))
        b.quad(M['vermilion'], [(-.09, side * .42 - .09, .86), (-.09, side * .42 + .09, .86), (-.09, side * .42 + .09, .5), (-.09, side * .42, .42), (-.09, side * .42 - .09, .5)])
        b.quad(M['ivory'], [(-.093, side * .42, .76), (-.093, side * .42 + .045, .68), (-.093, side * .42, .6), (-.093, side * .42 - .045, .68)])
    b.box(M['thatch'], (.5, 1.2, .05), trs((0, 0, 1.0), rot('Y', 0)))
    for side in (-1, 1):                                   # pitched roof boards + snow load
        b.box(M['thatch'], (.36, 1.24, .04), trs((side * .15, 0, 1.12), rot('Y', side * 28)), bevel=.006)
        b.box(M['snow'], (.3, 1.2, .05), trs((side * .14, 0, 1.165), rot('Y', side * 28)), bevel=.02)
    b.cyl(M['wood_d'], .03, 1.28, 6, trs((0, -.64, 1.2), rot('X', -90)))
    b.box(M['dark'], (.04, .6, .7), trs((.05, 0, .35)))
    for side in (-1, 1):
        b.box(M['door'], (.03, .3, .66), trs((-.12, side * .36, .33), rot('Z', side * 60)))
    b.ico(M['fur'], .09, 2, trs((-.02, 0, .92), scale=(.4, 2.2, .6)))
    return b.to_mesh('Gate / mountain refuge')


# ---------------------------------------------------------------- placement
occupied = []


def free(x, y, r):
    return all((x - ox) ** 2 + (y - oy) ** 2 > (r + orad) ** 2 for ox, oy, orad in occupied)


def place(me, x, y, scale=1.0, rz=None, coll=None, zoff=0.0, stretch=False):
    o = add_obj(me, loc=W(x, y, hz(x, y) + zoff), rz=rng.uniform(0, 6.283) if rz is None else rz, scale=scale, coll=coll or C_FLORA)
    if stretch:
        o.scale = (scale, scale / SIN60, scale)
    return o


def candidates(n, x0=-MARGIN, x1=900 + MARGIN, y0=-MARGIN, y1=600 + MARGIN):
    X = nrng.uniform(x0, x1, n); Y = nrng.uniform(y0, y1, n)
    return X, Y, path_dist(X, Y), band_mask(X, Y), pts_dist(X, Y, SLOT_PTS), inside(X, Y)


def clear_of_sets(x, y):
    return all(math.hypot((x - gx) * .7, y - gy) > 135 for gx, gy in GATES) and all(math.hypot(x - vx, y - vy) > 78 for vx, vy in VILLAGES) and math.hypot(x - HERO[0], y - HERO[1]) > 70


# build pads, bridges, theme set first so flora keeps clear of them
for s in SLOTS:
    o = add_obj(pad(s['terrain']), name=f"Build pad {s['id'] + 1} / {s['terrain']}", loc=W(s['x'], s['y'], max(hz(s['x'], s['y']), 0) + .005), coll=C_PROPS)
    o.scale = (1, 1 / SIN60, 1); occupied.append((s['x'], s['y'], 34))
if not SNOW:
    for pts in PATHS:
        for a, b_ in zip(pts, pts[1:]):
            if a['y'] == b_['y'] and min(a['x'], b_['x']) < 650 and max(a['x'], b_['x']) > 652:
                bridge(a['y']); occupied.append((692, a['y'], 70))
if args.gate:
    for i, (gx, gy) in enumerate(GATES):
        g = add_obj(gate_snow() if SNOW else gate_forest(), loc=W(gx + 12, gy, 0), coll=C_SET, scale=1.0 if i == 0 else .72)
occupied += [(HERO[0], HERO[1], 46)] + [(vx, vy, 60) for vx, vy in VILLAGES]

# trees ----------------------------------------------------------------
if SNOW:
    T_A = [tree_conifer(s, True) for s in (1, 2, 3, 4)]; T_B = [tree_bare(s) for s in (11, 12)]; T_C = []
else:
    T_A = [tree_conifer(s, False) for s in (1, 2, 3)]; T_B = [tree_broad(s, M['leaf']) for s in (21, 22, 23, 24)]; T_C = [tree_broad(31, M['maple'])]
X, Y, D, B, S, O = candidates(9000)
n_border = n_inner = 0
for x, y, d, bm_, sd, o in zip(X, Y, D, B, S, O):
    border = o < 44                                       # forest belt hugging the board edge and the margins
    if d < (52 if border else 74) or bm_ > .02 or sd < (66 if border else 88) or not clear_of_sets(x, y):
        continue
    if border and o > 0 and rng.random() < .25:           # thin the belt inside the board so the ground stays readable
        continue
    gap = 30 if border else 62
    if not border and n_inner >= (15 if not SNOW else 12):
        continue
    if not free(x, y, gap * .5):
        continue
    pick = rng.random()
    if SNOW:
        me = rng.choice(T_A) if pick < .86 else rng.choice(T_B)
    else:
        me = rng.choice(T_A) if pick < (.58 if border else .25) else (rng.choice(T_C) if pick > .95 else rng.choice(T_B))
    place(me, x, y, rng.uniform(.52, .74) * (1.12 if border else 1.0))
    occupied.append((x, y, gap * .5)); n_border += int(border); n_inner += int(not border)

# rocks: free scatter, river / ice banks, plateau rims --------------------
ROCKS = [rock(s) for s in (41, 42, 43, 44)] + [rock(45, True), rock(46, True)]
X, Y, D, B, S, O = candidates(1600)
n_rock = 0
for x, y, d, bm_, sd, o in zip(X, Y, D, B, S, O):
    if n_rock >= 46 or d < 34 or bm_ > .02 or sd < 44 or not clear_of_sets(x, y) or not free(x, y, 12):
        continue
    big = rng.random() < .25
    place(rng.choice(ROCKS[4:] if big else ROCKS[:4]), x, y, rng.uniform(.07, .12) * (1.5 if big else 1), coll=C_PROPS, zoff=-.01)
    occupied.append((x, y, 16 if big else 10)); n_rock += 1
for yb in range(-130, 740, 14):                             # banks
    lb, rb = band_edges(np.array([float(yb)])); lb, rb = float(lb[0]), float(rb[0])
    for xb in (lb - rng.uniform(2, 9), rb + rng.uniform(2, 9)):
        yy = yb + rng.uniform(-5, 5)
        if float(path_dist(np.array([xb]), np.array([yy]))[0]) < 34 or rng.random() < (.35 if not SNOW else .6):
            continue
        place(rng.choice(ROCKS[:4]), xb, yy, rng.uniform(.045, .1), coll=C_PROPS, zoff=-.015)
for (px, py) in HIGH:                                      # cliff stones around the high ground
    for k in range(14):
        a = k * 2 * math.pi / 14 + rng.uniform(-.15, .15); rr = rng.uniform(47, 58); x, y = px + math.cos(a) * rr, py + math.sin(a) * rr
        if float(path_dist(np.array([x]), np.array([y]))[0]) > 30:
            place(rng.choice(ROCKS[:4]), x, y, rng.uniform(.07, .11), coll=C_PROPS, zoff=-.04)
if not SNOW:                                               # cascade ledge + stepping stones in the river
    for xb in range(650, 740, 11):
        place(rng.choice(ROCKS[:4]), xb + rng.uniform(-3, 3), 52 + rng.uniform(-4, 4), rng.uniform(.06, .1), coll=C_PROPS, zoff=.2)
    for (xb, yb) in ((668, 150), (712, 205), (680, 330), (716, 520), (672, 560)):
        place(rng.choice(ROCKS[:4]), xb, yb, rng.uniform(.05, .08), coll=C_PROPS, zoff=.17)

# small flora -------------------------------------------------------------
BUSH = [bush(s, M['bush']) for s in (51, 52, 53)] if not SNOW else [drift(s) for s in (51, 52, 53)]
X, Y, D, B, S, O = candidates(2500)
n_b = 0
for x, y, d, bm_, sd, o in zip(X, Y, D, B, S, O):
    if n_b >= (70 if not SNOW else 60) or d < 36 or bm_ > .02 or sd < 42 or not clear_of_sets(x, y) or not free(x, y, 9):
        continue
    if SNOW:
        o_ = place(rng.choice(BUSH), x, y, rng.uniform(.12, .3), coll=C_FLORA, zoff=-.005)
    else:
        place(rng.choice(BUSH), x, y, rng.uniform(.7, 1.2))
    occupied.append((x, y, 9)); n_b += 1

TUFT = [tuft(s, M['dry'] if SNOW else M['grass']) for s in (61, 62, 63, 64)]
X, Y, D, B, S, O = candidates(12000 if not SNOW else 5000)
n_t = 0
for x, y, d, bm_, sd, o in zip(X, Y, D, B, S, O):
    if d < 27 or bm_ > .02 or sd < 30 or o < -110:
        continue
    if SNOW and rng.random() < .55:
        continue
    place(rng.choice(TUFT), x, y, rng.uniform(.8, 1.6)); n_t += 1
    if n_t >= (3200 if not SNOW else 700):
        break

n_f = 0
if not SNOW:
    FLOWER = [flower(i) for i in range(4)]; MUSH = mushroom(); REED = [reeds(s) for s in (71, 72, 73)]
    for _ in range(46):                                    # flower drifts
        cx, cy = rng.uniform(20, 880), rng.uniform(20, 580); kind = rng.randrange(4)
        for _ in range(rng.randint(5, 11)):
            x, y = cx + rng.gauss(0, 13), cy + rng.gauss(0, 13)
            if float(path_dist(np.array([x]), np.array([y]))[0]) > 27 and float(band_mask(np.array([x]), np.array([y]))[0]) < .02 and float(pts_dist(np.array([x]), np.array([y]), SLOT_PTS)[0]) > 30:
                place(FLOWER[kind], x, y, rng.uniform(.9, 1.5)); n_f += 1
    for (ox, oy, orad) in list(occupied)[:]:
        if orad in (15, 22) and rng.random() < .22:
            place(MUSH, ox + rng.uniform(-14, 14), oy + rng.uniform(8, 16), rng.uniform(.9, 1.4))
    for yb in range(-120, 730, 9):                         # reeds along the banks
        lb, rb = band_edges(np.array([float(yb)])); lb, rb = float(lb[0]), float(rb[0])
        for xb in (lb + 1, rb - 1):
            if rng.random() < .45 and float(path_dist(np.array([xb]), np.array([float(yb)]))[0]) > 36:
                place(rng.choice(REED), xb + rng.uniform(-3, 3), yb, rng.uniform(.8, 1.4), zoff=.14)
else:
    CRYS = [crystals(s) for s in (81, 82, 83)]
    for yb in range(-110, 720, 46):                        # crystal growths on the frozen banks
        lb, rb = band_edges(np.array([float(yb)])); lb, rb = float(lb[0]), float(rb[0])
        for xb in (lb + rng.uniform(4, 16), rb - rng.uniform(4, 16)):
            yy = yb + rng.uniform(-14, 14)
            if rng.random() < .7 and float(path_dist(np.array([xb]), np.array([yy]))[0]) > 40 and float(pts_dist(np.array([xb]), np.array([yy]), SLOT_PTS)[0]) > 44:
                place(rng.choice(CRYS), xb, yy, rng.uniform(.7, 1.3), coll=C_PROPS, zoff=.03)
    # ice cracks: thin dark seams over the sheet
    cb = MB()
    for _ in range(26):
        x = rng.uniform(305, 515); y = rng.uniform(-100, 700); a = rng.uniform(0, 6.28); pts = [(x, y)]
        for _ in range(rng.randint(4, 8)):
            a += rng.uniform(-.7, .7); L = rng.uniform(14, 30); x, y = x + math.cos(a) * L, y + math.sin(a) * L
            if 300 < x < 520:
                pts.append((x, y))
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1; nx, ny = -dy / L * .8, dx / L * .8
            cb.quad(M['ice_d'], [W(ax + nx, ay + ny, .001), W(ax - nx, ay - ny, .001), W(bx - nx * .4, by - ny * .4, .001), W(bx + nx * .4, by + ny * .4, .001)])
    add_obj(cb.to_mesh('Ice cracks'), coll=C_WATER)

# story props along the road -------------------------------------------------
def along(path_i, dist_px, side_px):
    pts = EPATHS[path_i]; left = dist_px
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay)
        if left <= L:
            t = left / L; nx, ny = -(by - ay) / L, (bx - ax) / L
            return ax + (bx - ax) * t + nx * side_px, ay + (by - ay) * t + ny * side_px, math.atan2(-(by - ay), bx - ax)
        left -= L
    return pts[-1][0], pts[-1][1], 0.0


LANT, SIGN, FEN, CRATE = lantern(), signpost(), fence(3), crate()
BAN = banner(M['vermilion'] if SNOW else M['teal']); BRAZ = brazier() if SNOW else None
total_len = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(EPATHS[0], EPATHS[0][1:]))
for i, pts in enumerate(EPATHS):
    plen = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
    for k, back in enumerate((60, 150, 250, 380)):          # lights leading to the village
        x, y, ang = along(i, plen - back, 33 if k % 2 else -33)
        if float(band_mask(np.array([x]), np.array([y]))[0]) < .02 and float(pts_dist(np.array([x]), np.array([y]), SLOT_PTS)[0]) > 36:
            place(BRAZ if SNOW and k % 2 == 0 else LANT, x, y, 1.0, rz=ang + (math.pi if k % 2 else 0), coll=C_PROPS)
    x, y, ang = along(i, 250, -36); place(SIGN, x, y, 1.0, rz=ang, coll=C_PROPS)
    for back, side in ((105, 30), (105, -30), (190, 31), (190, -31)):
        x, y, ang = along(i, plen - back, side)
        if float(pts_dist(np.array([x]), np.array([y]), SLOT_PTS)[0]) > 40 and float(band_mask(np.array([x]), np.array([y]))[0]) < .02:
            place(FEN, x - 30 * math.cos(ang), y + 30 * math.sin(ang), 1.0, rz=ang, coll=C_PROPS)
    x, y, ang = along(i, plen - 75, 46); place(CRATE, x, y, 1.0, rz=ang + .4, coll=C_PROPS)
    x, y, ang = along(i, plen - 40, -44); place(BAN, x, y, 1.0, rz=math.pi / 2, coll=C_PROPS)
    x, y, ang = along(i, 235, 40); place(BAN, x, y, .85, rz=math.pi / 2, coll=C_PROPS)
if not SNOW:
    STUMP, LOGS = stump(), log_pile()
    spots = [(315, 455), (350, 500), (130, 420), (560, 90), (250, 60), (470, 545)]
    for k, (x, y) in enumerate(spots):
        if float(path_dist(np.array([float(x)]), np.array([float(y)]))[0]) > 45 and float(pts_dist(np.array([float(x)]), np.array([float(y)]), SLOT_PTS)[0]) > 50:
            place(LOGS if k % 3 == 1 else STUMP, x, y, 1.0, coll=C_PROPS)

# ---------------------------------------------------------------- light, cameras, output
setup_render(scene, args.size, round(args.size * 2 / 3), args.samples, world=('#c7dcec', .85) if not SNOW else ('#bcd2ea', .8))
sun('Sun / west-southwest', (.56, .30, -.77), 3.3 if not SNOW else 2.5, '#fff1d6' if not SNOW else '#fff6ea', 4.0, C_STUDIO)
centre = W(450, 300)
cams = {
    'battle': battle_camera(coll=C_STUDIO),
    'wide': battle_camera(margin=120, coll=C_STUDIO),
    'beauty': camera('Beauty / south-west 3-4', centre + Vector((-5.4, -9.4, 6.6)), centre + Vector((.5, .2, 0)), lens=40, coll=C_STUDIO),
    'close': camera('Close / gate and crossing', W(585, 690, 0) + Vector((0, 0, 2.5)), W(800, 330, .2), lens=46, coll=C_STUDIO),
}
os.makedirs(args.out, exist_ok=True)
tag = f"{THEME}-s{args.stage}" + ('-gate' if args.gate else '')
info = {'theme': THEME, 'stage': args.stage, 'expanded': EXPANDED, 'slots': len(SLOTS), 'paths': len(PATHS), 'trees': int(n_border + n_inner), 'rocks': int(n_rock), 'tufts': int(n_t), 'flowers': int(n_f),
        'blender': bpy.app.version_string, 'stats': stats()}
for view in [v for v in args.views.split(',') if v]:
    if view in ('beauty', 'close'):
        scene.render.resolution_x, scene.render.resolution_y = args.size, round(args.size * 9 / 16)
    elif view == 'wide':
        scene.render.resolution_x, scene.render.resolution_y = args.size, round(args.size * (600 + 240) / (900 + 240))
        cams['wide'].data.ortho_scale = (900 + 240) / 100
    else:
        scene.render.resolution_x, scene.render.resolution_y = args.size, round(args.size * 2 / 3)
    render(scene, cams[view], os.path.join(args.out, f'{tag}-{view}.png'))
if args.glb:
    bpy.ops.export_scene.gltf(filepath=os.path.join(args.out, f'{tag}.glb'), export_format='GLB', export_apply=True, export_yup=True)
    info['glb_bytes'] = os.path.getsize(os.path.join(args.out, f'{tag}.glb'))
if args.blend:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, f'{tag}.blend'))
json.dump(info, open(os.path.join(args.out, f'{tag}.json'), 'w'), indent=1)
print('DONE', json.dumps(info))
