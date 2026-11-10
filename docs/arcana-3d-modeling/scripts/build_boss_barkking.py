"""Bark King (고목왕) - the forest region boss, modelled to the PR #104 contract:
two huge arms, two root legs, a leaf crown and the purple chest fissure are the silhouette keys.

Rigid joint objects (origin = joint): root > legs, body > head, armL > foreL, armR > foreR.
The unit faces -Y; +X is its left arm. Poses follow the storyboard names: march, rage, rush.
Draft / production candidate: not wired into the game.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from arcana_bpy import MB, add_obj, ellipse, empty, mat, rot, trs
from arcana_unit import run

HEIGHT = 5.0
R = random.Random(104)
M = {}


def materials():
    M.update(
        bark=mat('Bark / deep', '#4b321f', .95, bump=.7, bump_scale=16), bark_m=mat('Bark / ridge', '#7a5531', .9, bump=.5, bump_scale=22),
        bark_l=mat('Bark / golden edge', '#b38c4e', .85, bump=.3, bump_scale=30), moss=mat('Moss', '#4f8a3a', .95),
        leaf=[mat('Leaf / shade', '#255a2e', .9), mat('Leaf / mid', '#3f8538', .9), mat('Leaf / sunlit', '#74aa45', .9)], leaf_y=mat('Leaf / gold fleck', '#c9d45a', .85),
        glow=mat('Glow / purple heart', '#a94cf0', .4, emit='#a640ff', emit_strength=2.6), char=mat('Bark / charred rim', '#2a1a30', 1.0),
        claw=mat('Claw / pale heartwood', '#dcc9a0', .65), fungi=mat('Fungus / bracket', '#d39f58', .8), fungi_l=mat('Fungus / pale rim', '#f1dcae', .8),
        dark=mat('Mouth / hollow', '#140c14', 1.0), vine=mat('Vine', '#3d7a34', .9))


# torso profile: (z, centre y, half width, half depth) - a gnarled trunk leaning forward
T = [(1.00, .05, .64, .52), (1.45, .02, .82, .66), (2.05, -.10, 1.06, .82), (2.65, -.22, 1.22, .88), (3.05, -.30, 1.0, .74), (3.40, -.36, .64, .54)]


def tp(z):
    z = min(max(z, T[0][0]), T[-1][0])
    for a, b in zip(T, T[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0]); return tuple(a[i] + (b[i] - a[i]) * t for i in (1, 2, 3))
    return T[-1][1:]


def surf(theta, z, off=0.0):
    cy, rx, ry = tp(z); return Vector((math.cos(theta) * (rx + off), cy + math.sin(theta) * (ry + off), z))


def front(x, z, off):
    cy, rx, ry = tp(z); return Vector((x, cy - ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)) - off, z))


def canopy(b, c, spread, zs, n, seed, small=False):
    r = random.Random(seed)
    for k in range(n):
        a = r.uniform(0, 6.28); d = spread * math.sqrt(r.random()); z = r.uniform(-zs, zs) * (1 - d / spread * .5)
        rr = r.uniform(.14, .24) if small else r.uniform(.26, .46)
        tone = 2 if z > zs * .2 else (0 if z < -zs * .35 else 1)
        b.ico(M['leaf'][tone], rr, 2, trs(c + Vector((math.cos(a) * d, math.sin(a) * d * .9, z))), jitter=rr * .3, jscale=2.2, seed=seed + k, squash=(1, 1, .8))
    for k in range(n // 2 + 5):                          # leaf tufts on the outline, a few gold flecks
        a = r.uniform(0, 6.28); d = spread * r.uniform(.8, 1.18); z = r.uniform(-zs, zs)
        b.ico(M['leaf_y'] if k % 4 == 0 else M['leaf'][r.choice([1, 2])], (.06 if small else .11) * r.uniform(.8, 1.3), 1,
              trs(c + Vector((math.cos(a) * d, math.sin(a) * d * .9, z))), jitter=.02, seed=seed + 100 + k)


def bundle(b, p0, p1, n, spread, radius, twist=1.6, bulge=.06, seg=7, mats=None):
    """Limb made of n roots twisting around the p0 -> p1 axis."""
    axis = p1 - p0; n1 = axis.cross(Vector((0, 1, 0)))
    if n1.length < 1e-4:
        n1 = axis.cross(Vector((1, 0, 0)))
    n1.normalize(); n2 = axis.cross(n1).normalized()
    for k in range(n):
        a0 = k * 2 * math.pi / n; pts, rad = [], []
        for i in range(7):
            t = i / 6; a = a0 + t * twist; s = math.sin(t * math.pi)
            pts.append(p0 + axis * t + (n1 * math.cos(a) + n2 * math.sin(a)) * (spread * (1 + .5 * s))); rad.append(radius + bulge * s)
        b.tube((mats or [M['bark'], M['bark_m']])[k % 2], pts, rad, seg=seg)


def body(b):
    b.loft(M['bark'], [ellipse((0, cy, z), rx, ry, 22) for z, cy, rx, ry in T], jitter=.075, jscale=1.3, seed=3)
    b.ico(M['bark'], .7, 2, trs((0, .05, 1.0), scale=(1, .85, .6)), jitter=.08, seed=5)                       # root-ball pelvis
    for k in range(18):                                  # bark ridges, leaving the chest open
        th0 = 2 * math.pi * k / 18 + R.uniform(-.1, .1)
        if abs(((th0 + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi) < .45:
            continue
        tw = R.uniform(-.25, .25); pts, rad = [], []
        for i in range(9):
            z = 1.0 + 2.32 * i / 8
            pts.append(surf(th0 + tw * (z - 1.0) + .08 * math.sin(z * 4 + k), z, .0)); rad.append(.09 - .035 * abs(i - 4) / 4)
        b.tube(M['bark_l'] if k % 4 == 0 else M['bark_m'], pts, rad, seg=6)
    zig = [(.03, 3.0, .02), (-.1, 2.74, .09), (.09, 2.47, .16), (-.07, 2.2, .14), (.08, 1.94, .09), (-.01, 1.66, .02)]    # heart fissure
    for a, c in zip(zig, zig[1:]):
        b.quad(M['char'], [front(a[0] - a[2] - .07, a[1], .012), front(a[0] + a[2] + .07, a[1], .012), front(c[0] + c[2] + .07, c[1], .012), front(c[0] - c[2] - .07, c[1], .012)])
        b.quad(M['glow'], [front(a[0] - a[2], a[1], .035), front(a[0] + a[2], a[1], .035), front(c[0] + c[2], c[1], .035), front(c[0] - c[2], c[1], .035)])
    for i, (x, z, w) in enumerate(zig[1:-1]):            # glowing veins crawling out of the fissure
        s = 1 if x > 0 else -1; pts = []
        for t in (0, .25, .5, .75, 1):
            pts.append(surf(-math.pi / 2 + s * (.12 + t * .95), z + t * (.42 if i % 2 else -.3) + .05 * math.sin(t * 6), .025))
        b.tube(M['glow'], pts, [.04, .032, .024, .016, .006], seg=5)
    for i, (x, z, w) in enumerate(zig[1:-1]):            # short side cracks
        s = -1 if x > 0 else 1
        b.quad(M['glow'], [front(x, z + .03, .03), front(x + s * .32, z + .16, .03), front(x + s * .3, z + .1, .03), front(x, z - .03, .03)])
    for k in range(13):                                  # mossy hump on the back and shoulders
        th = math.pi / 2 + R.uniform(-1.1, 1.1); z = R.uniform(2.3, 3.3)
        b.ico(M['leaf'][k % 3] if k % 2 else M['moss'], R.uniform(.24, .42), 2, trs(surf(th, z, .12), scale=(1, 1, .8)), jitter=.08, seed=120 + k)
    for k in range(4):                                   # bracket fungi
        th = math.pi * .78 + k * .22; z = 1.55 + k * .3
        b.cyl(M['fungi'], .24 - k * .02, .05, 10, trs(surf(th, z, -.04), rot('Z', math.degrees(th) - 90), (1, .7, 1)), smooth=False)
        b.cyl(M['fungi_l'], .25 - k * .02, .015, 10, trs(surf(th, z - .012, -.04), rot('Z', math.degrees(th) - 90), (1, .7, 1)), smooth=False)
    for k in range(7):                                   # vines hanging off the hump
        th = math.pi / 2 + R.uniform(-1.3, 1.3); p = surf(th, 2.9, .3); L = R.uniform(.6, 1.2)
        b.tube(M['vine'], [p, p + Vector((R.uniform(-.1, .1), .05, -L * .5)), p + Vector((R.uniform(-.15, .15), 0, -L))], .022, seg=4)
        for t in (.35, .7, 1.0):
            b.ico(M['leaf'][2], .06, 1, trs(p + Vector((0, .03, -L * t)), scale=(1.3, .6, .8)))


def head(b):
    c = Vector((0, -.62, 3.47))
    b.ico(M['bark'], .58, 3, trs(c, scale=(1.05, .95, .92)), jitter=.07, jscale=2.0, seed=11)
    for s in (-1, 1):
        b.tube(M['bark_m'], [(s * .04, -1.17, 3.52), (s * .27, -1.14, 3.62), (s * .55, -.98, 3.78)], [.1, .095, .05], seg=6)     # angry brow
        b.ico(M['char'], 1, 2, trs((s * .25, -1.08, 3.46), rot('Y', s * -18), (.18, .06, .09)))                                 # socket
        b.ico(M['glow'], 1, 2, trs((s * .25, -1.12, 3.46), rot('Y', s * -18), (.13, .05, .055)))                                # eye
        b.ico(M['bark_m'], .21, 2, trs((s * .42, -.98, 3.22), scale=(1, .8, 1)), jitter=.04, seed=3 + s)                        # cheek burl
    b.ico(M['bark_m'], .1, 2, trs((0, -1.21, 3.35), scale=(1, 1, 1.3)), jitter=.02)                                             # nose knot
    b.ico(M['dark'], 1, 2, trs((0, -1.1, 3.13), scale=(.31, .09, .1)))                                                          # hollow mouth
    b.ico(M['glow'], 1, 2, trs((0, -1.09, 3.12), scale=(.2, .05, .045)))
    for k in range(7):                                   # splinter teeth
        x = -.24 + k * .08
        b.cone(M['claw'], .032, 0, .1, 5, trs((x, -1.17, 3.21), rot('X', 180)))
        if k % 2 == 0:
            b.cone(M['claw'], .028, 0, .085, 5, trs((x + .03, -1.16, 3.04)))
    b.ico(M['bark'], .32, 2, trs((0, -.98, 3.0), scale=(1.2, .8, .6)), jitter=.05, seed=8)                                       # jaw
    for k in range(11):                                  # beard of hanging roots
        x = -.4 + k * .08; L = R.uniform(.55, 1.0) * (1 - abs(x) * .8); sway = R.uniform(-.08, .08)
        b.tube(M['bark_l'] if k % 3 == 0 else M['bark_m'], [(x, -1.02 + abs(x) * .25, 3.0), (x + sway, -1.12 + abs(x) * .25, 3.0 - L * .5), (x + sway * 2, -1.04 + abs(x) * .2, 3.0 - L)], [.065, .045, .012], seg=5)
    for s in (-1, 1):                                    # broken antler branches
        base = Vector((s * .36, -.5, 3.88)); tip = Vector((s * 1.12, -.42, 4.82)); mid = (base + tip) / 2 + Vector((s * .14, 0, -.06))
        b.tube(M['bark_m'], [base, mid, tip], [.14, .095, .035], seg=7)
        for (t, dx, dy, dz, L) in ((.45, s * .5, -.2, .35, .55), (.7, s * -.25, .1, .5, .45), (.25, s * .4, .25, .25, .38)):
            p = base.lerp(tip, t); d = Vector((dx, dy, dz))
            b.tube(M['bark_l'], [p, p + d * L * .6, p + d * L + Vector((0, 0, .08))], [.075, .045, .015], seg=5)
    canopy(b, Vector((0, -.22, 4.22)), 1.22, .56, 34, seed=40)


def arm_upper(b, s):
    sh = Vector((s * 1.4, -.12, 2.84)); el = Vector((s * 2.04, -.3, 1.72))
    b.ico(M['bark'], .58, 3, trs(sh, scale=(1, 1, .9)), jitter=.1, jscale=1.6, seed=20 + s)                 # shoulder burl
    for k in range(3):                                   # layered bark pauldron
        b.ico(M['bark_l'] if k == 1 else M['bark_m'], .52 - k * .07, 2, trs(sh + Vector((s * (.1 + k * .13), -.02, .24 - k * .03)), rot('Y', s * (25 + k * 14)), (1, 1, .36)), jitter=.05, seed=30 + k)
    bundle(b, sh, el, 4, .16, .2)
    canopy(b, sh + Vector((s * .08, .18, .5)), .46, .2, 8, seed=50 + s, small=True)


def arm_fore(b, s):
    el = Vector((s * 2.04, -.3, 1.72)); wr = Vector((s * 2.1, -.84, .98))
    b.ico(M['bark'], .44, 2, trs(el), jitter=.08, seed=60 + s)                                               # elbow knot
    bundle(b, el, wr, 5, .2, .2, twist=1.9, bulge=.09)
    axis = wr - el
    for k in range(3):                                   # bark plates on the forearm
        b.ico(M['bark_l'], .3, 2, trs(el + axis * (.22 + k * .26) + Vector((s * .3, -.08, .1)), rot('Y', s * 72), (1, 1.1, .3)), jitter=.04, seed=70 + k)
    for k in range(2):                                   # glow veins running down to the fist
        pts = [el + axis * t + Vector((s * (-.28 + k * .12), -.3 - .04 * math.sin(t * 9), .0)) for t in (.1, .35, .6, .85, 1.0)]
        b.tube(M['glow'], pts, [.03, .028, .024, .018, .008], seg=5)
    palm = wr + Vector((0, -.12, -.18))
    b.ico(M['bark_m'], .42, 2, trs(palm, scale=(1, 1.1, .75)), jitter=.06, seed=80 + s)
    for k in range(4):                                   # root fingers with pale claws
        x = (k - 1.5) * .21
        p0 = palm + Vector((x, -.2, -.05)); p1 = palm + Vector((x * 1.25, -.54, -.2)); p2 = palm + Vector((x * 1.3, -.64, -.5))
        b.tube(M['bark'] if k % 2 else M['bark_m'], [p0, p1, p2], [.13, .105, .055], seg=6)
        b.cone(M['claw'], .055, 0, .17, 6, trs(p2, rot('X', 200)))
    p0 = palm + Vector((-s * .3, -.05, 0))
    b.tube(M['bark_m'], [p0, p0 + Vector((-s * .22, -.22, -.12)), p0 + Vector((-s * .26, -.32, -.34))], [.115, .09, .045], seg=6)
    b.cone(M['claw'], .045, 0, .14, 6, trs(p0 + Vector((-s * .26, -.32, -.34)), rot('X', 200)))
    canopy(b, el + axis * .45 + Vector((s * .32, .1, .2)), .25, .1, 4, seed=85 + s, small=True)


def legs(b):
    for s in (-1, 1):
        hip = Vector((s * .52, .05, 1.2)); an = Vector((s * .7, 0, .44))
        b.ico(M['bark'], .48, 2, trs(hip, scale=(1, 1, .9)), jitter=.07, seed=90 + s)
        bundle(b, hip, an, 4, .14, .2, twist=1.2, bulge=.05)
        b.ico(M['bark_m'], .36, 2, trs(an + Vector((0, 0, -.05)), scale=(1.1, 1.1, .7)), jitter=.06, seed=95 + s)
        for k in range(7):                               # root toes gripping the road, longer towards the front
            a = math.radians(k * 360 / 7 + 12 * s); d = Vector((math.cos(a), math.sin(a), 0)); L = .55 + .38 * max(0.0, -math.sin(a))
            b.tube(M['bark'] if k % 2 else M['bark_m'], [an + Vector((0, 0, -.1)), an + d * L * .55 + Vector((0, 0, -.3)), an + d * L + Vector((0, 0, -.41))], [.16, .115, .04], seg=6)
        for k in range(3):
            b.ico(M['moss'], R.uniform(.12, .2), 2, trs(an + Vector((R.uniform(-.3, .3), R.uniform(-.1, .3), .12)), scale=(1, 1, .5)), jitter=.04, seed=99 + k)


def build(coll):
    materials()

    def part(fn, name, pivot, parent, parent_pivot, *a):
        b = MB(); fn(b, *a)
        bmesh.ops.translate(b.bm, vec=-Vector(pivot), verts=b.bm.verts)
        return add_obj(b.to_mesh(name), name=name, loc=Vector(pivot) - Vector(parent_pivot), coll=coll, parent=parent)

    root = empty('Bark King / root', coll=coll)
    part(legs, 'Legs / root feet', (0, 0, 0), root, (0, 0, 0))
    P_BODY, P_HEAD = (0, 0, 1.15), (0, -.4, 3.3)
    j = {'root': root}
    j['body'] = part(body, 'Body / trunk with heart fissure', P_BODY, root, (0, 0, 0))
    j['head'] = part(head, 'Head / face, antlers, leaf crown', P_HEAD, j['body'], P_BODY)
    for s, n in ((1, 'L'), (-1, 'R')):
        sh, el = (s * 1.4, -.12, 2.84), (s * 2.04, -.3, 1.72)
        j['arm' + n] = part(arm_upper, f'Arm {n} / shoulder and upper arm', sh, j['body'], P_BODY, s)
        j['fore' + n] = part(arm_fore, f'Arm {n} / forearm and root fist', el, j['arm' + n], sh, s)
    return j


POSES = {
    'march': {'joints': {'body': (6, 0, 0), 'head': (4, 0, 0), 'armL': (-14, 0, 0), 'foreL': (-12, 0, 0), 'armR': (12, 0, 0), 'foreR': (-6, 0, 0)}, 'glow': 1.0},
    'rage': {'joints': {'body': (-10, 0, 0), 'head': (-16, 0, 0), 'armL': (0, -118, 0), 'foreL': (0, -72, 0), 'armR': (0, 118, 0), 'foreR': (0, 72, 0)}, 'glow': 1.9},
    'rush': {'joints': {'body': (30, 0, 0), 'head': (-20, 0, 0), 'armL': (-58, 0, 8), 'foreL': (-28, 0, 0), 'armR': (-50, 0, -8), 'foreR': (-34, 0, 0)}, 'glow': 1.6},
}

if __name__ == '__main__':
    run('bark-king', build, POSES, HEIGHT, glow_names=('Glow / purple heart',), default_poses=['march', 'rage', 'rush'])
