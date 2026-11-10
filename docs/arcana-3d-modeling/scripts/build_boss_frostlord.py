"""Frost Lord (서리군주) - the snow region boss, modelled to the PR #104 contract:
white beard, gold crown, navy cape, gold trim, ice pauldrons and ONE greatsword (never a staff).

Rigid joint objects (origin = joint): root > legs, body > head, armL > foreL, armR > foreR > sword, fx:rune.
The unit faces -Y; +X is its left arm. Poses follow the storyboard names: march, channel, interrupt.
Draft / production candidate: not wired into the game.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from arcana_bpy import MB, add_obj, ellipse, empty, mat, rot, trs
from arcana_unit import run

HEIGHT = 5.0
R = random.Random(208)
M = {}


def materials():
    M.update(
        navy=mat('Armour / navy steel', '#1f3466', .34, metal=.75), navy_l=mat('Armour / navy edge', '#3a5aa8', .3, metal=.7), navy_d=mat('Armour / under plates', '#111c3a', .5, metal=.6),
        gold=mat('Trim / gold', '#d6aa44', .28, metal=1.0), gold_d=mat('Trim / gold shade', '#9a7424', .35, metal=1.0),
        ice=mat('Ice / pauldron crystal', '#a5e6f6', .07, emit='#7fd6f5', emit_strength=.5, coat=1.0), blade=mat('Ice / greatsword blade', '#8fdcf2', .05, emit='#5cc4ee', emit_strength=.42, coat=1.0),
        core=mat('Ice / blade core', '#d8f7ff', .1, emit='#a8ecff', emit_strength=1.1), eye=mat('Glow / frost eyes', '#c8f6ff', .3, emit='#8fe6ff', emit_strength=5.0),
        rune=mat('Glow / channel rune', '#bff2ff', .3, emit='#7fdcff', emit_strength=3.0),
        cape=mat('Cape / navy wool', '#18275a', .9, bump=.25, bump_scale=120), lining=mat('Cape / lining', '#2b448f', .85), fur=mat('Fur / collar', '#eef2f6', .95, bump=.5, bump_scale=60),
        beard=mat('Beard / white', '#f1f3f6', .85, bump=.4, bump_scale=70), beard_d=mat('Beard / shade lock', '#c5d0de', .85), skin=mat('Skin / frost-pale', '#cdb8a8', .7),
        leather=mat('Grip / navy wrap', '#14204a', .8), dark=mat('Shadow / visor', '#0d1226', 1.0))


def crystal(b, m, base, direction, length, radius, seg=6):
    """Hexagonal ice shard: short prism, long point."""
    Mx = trs(base, Vector(direction).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4())
    b.cone(m, radius * .8, radius, length * .4, seg, Mx, smooth=False, cap=False)
    b.cone(m, radius, 0.0, length * .6, seg, Mx @ trs((0, 0, length * .4)), smooth=False)


def loop(c, rx, ry, n=14, tilt=None):
    pts = ellipse(c, rx, ry, n, tilt); return pts + [pts[0], pts[1]]


def legs(b):
    for s in (-1, 1):
        x = s * .52
        b.box(M['navy'], (.5, .8, .3), trs((x, -.14, .15)), bevel=.05)                                   # sabaton
        b.box(M['gold'], (.52, .22, .2), trs((x, -.5, .12)), bevel=.04)                                  # toe cap
        b.cone(M['ice'], .07, 0, .2, 6, trs((x, -.6, .16), rot('X', -70)), smooth=False)
        b.cone(M['navy'], .3, .25, .78, 12, trs((x, 0, .28)), smooth=True)                               # greave
        for z in (.3, .98):
            b.cyl(M['gold'], .315 if z < .5 else .27, .07, 12, trs((x, 0, z)), smooth=True)
        b.box(M['navy_l'], (.08, .1, .6), trs((x, -.27, .66)), bevel=.02)                                # shin ridge
        b.ico(M['gold'], .22, 2, trs((x, -.16, 1.1), scale=(1, .8, 1)))                                  # knee cop
        crystal(b, M['ice'], (x, -.3, 1.12), (0, -.8, .6), .34, .07)
        b.cyl(M['navy_d'], .3, .5, 12, trs((x, 0, 1.08)), smooth=True)                                   # thigh mail


T = [(1.34, .0, .78, .6), (1.62, .0, .88, .68), (2.1, -.02, 1.02, .78), (2.62, -.05, 1.16, .84), (2.96, -.05, 1.0, .72), (3.16, -.04, .58, .5)]


def tp(z):
    z = min(max(z, T[0][0]), T[-1][0])
    for a, c in zip(T, T[1:]):
        if a[0] <= z <= c[0]:
            t = (z - a[0]) / (c[0] - a[0]); return tuple(a[i] + (c[i] - a[i]) * t for i in (1, 2, 3))
    return T[-1][1:]


def surf(theta, z, off=0.0):
    cy, rx, ry = tp(z); return Vector((math.cos(theta) * (rx + off), cy + math.sin(theta) * (ry + off), z))


def body(b):
    b.loft(M['navy'], [ellipse((0, cy, z), rx, ry, 24) for z, cy, rx, ry in T])                          # cuirass
    for k in range(10):                                  # tassets: overlapping skirt plates with gold hems
        a = 2 * math.pi * k / 10 + math.pi / 10; c = Vector((math.cos(a) * .9, math.sin(a) * .7, 1.2))
        Mx = trs(c, rot('Z', math.degrees(a) + 90) @ rot('X', 13))
        b.box(M['navy'] if k % 2 else M['navy_l'], (.5, .06, .62), Mx, bevel=.02)
        b.box(M['gold'], (.5, .07, .07), Mx @ trs((0, 0, -.3)), bevel=.015)
        b.box(M['gold_d'], (.06, .075, .5), Mx @ trs((0, -.005, .02)))
    b.cyl(M['gold'], 1.0, .17, 24, trs((0, 0, 1.56), scale=(.9, .7, 1)), smooth=True)                    # belt
    b.box(M['gold'], (.42, .1, .34), trs((0, -.66, 1.64)), bevel=.04); crystal(b, M['ice'], (0, -.74, 1.64), (0, -1, 0), .16, .1, 4)
    b.tube(M['gold'], [surf(-math.pi / 2, z, .012) for z in (1.75, 2.1, 2.5, 2.9)], .05, seg=6)             # breast ridge
    for s in (-1, 1):                                    # sweeping gold bands and rivets
        b.tube(M['gold'], [surf(-math.pi / 2 + s * t * 1.25, 2.86 - t * .9, .012) for t in (0, .25, .5, .75, 1)], [.045, .04, .035, .03, .02], seg=6)
        b.tube(M['gold_d'], [surf(-math.pi / 2 + s * t * 1.1, 2.0 - t * .25, .012) for t in (0.1, .4, .7, 1)], .028, seg=5)
        for t in (.3, .6, .9):
            b.ico(M['gold'], .04, 1, trs(surf(-math.pi / 2 + s * t * 1.2, 2.45, .02)))
    em = surf(-math.pi / 2, 2.52, .02)                    # chest emblem: gold lozenge with an ice heart
    b.box(M['gold'], (.36, .05, .36), trs(em, rot('Y', 45)), bevel=.03); crystal(b, M['eye'], em + Vector((0, -.03, 0)), (0, -1, 0), .12, .1, 4)
    b.cyl(M['gold'], .6, .2, 20, trs((0, -.04, 3.06), scale=(1, .86, 1)), smooth=True)                   # gorget
    b.cyl(M['navy_l'], .56, .12, 20, trs((0, -.04, 3.2), scale=(1, .86, 1)), smooth=True)
    rows, cols = 14, 21; grid = []                       # cape with folds, wrapping the shoulders
    for i in range(rows):
        t = i / (rows - 1); row = []
        for jx in range(cols):
            u = -1 + 2 * jx / (cols - 1); half = 1.05 + .6 * t
            y = .6 + .36 * t + .1 * math.sin(u * 7.5 + 1.3) * (.25 + .75 * t) - (u * u) * .34 * (1 - t * .55)
            row.append((u * half, y, 3.08 - t * 2.92 + .05 * math.cos(u * 7.5) * t))
        grid.append(row)
    b.sheet(M['cape'], grid)
    b.sheet(M['lining'], [[(x * .985, y - .03, z) for (x, y, z) in row] for row in grid])
    b.tube(M['gold'], [Vector(p) + Vector((0, .01, -.01)) for p in grid[-1]], .035, seg=5)                 # gold hem
    for k in range(18):                                  # fur collar over the shoulders
        a = math.radians(-35 + k * 250 / 17); p = Vector((math.cos(a) * .98, .1 + math.sin(a) * .62, 3.08 + .06 * math.sin(k)))
        b.ico(M['fur'], R.uniform(.2, .28), 2, trs(p, scale=(1, 1, .8)), jitter=.08, jscale=3.0, seed=300 + k)
    b.tube(M['gold'], [(-.78, -.5, 3.0), (-.4, -.72, 2.86), (0, -.78, 2.8), (.4, -.72, 2.86), (.78, -.5, 3.0)], .03, seg=5)   # clasp chain
    for s in (-1, 1):
        b.ico(M['gold'], .1, 2, trs((s * .78, -.5, 3.0))); crystal(b, M['ice'], (s * .78, -.58, 3.0), (0, -1, 0), .1, .06, 4)


def head(b):
    b.ico(M['skin'], .43, 3, trs((0, -.1, 3.58), scale=(1, 1, 1.05)))
    b.ico(M['skin'], .1, 2, trs((0, -.55, 3.54), scale=(1, 1, 1.2)))                                     # nose
    for s in (-1, 1):
        b.ico(M['dark'], 1, 2, trs((s * .16, -.46, 3.66), scale=(.12, .05, .06)))
        b.ico(M['eye'], 1, 2, trs((s * .16, -.49, 3.66), scale=(.075, .035, .04)))                        # glowing eyes
        b.tube(M['beard'], [(s * .04, -.52, 3.74), (s * .2, -.52, 3.8), (s * .38, -.42, 3.76)], [.05, .06, .025], seg=5)      # heavy brows
        b.tube(M['beard'], [(s * .03, -.56, 3.42), (s * .22, -.6, 3.34), (s * .5, -.52, 3.16), (s * .62, -.46, 3.22)], [.07, .085, .06, .015], seg=6)   # moustache
        b.box(M['navy'], (.07, .34, .5), trs((s * .43, -.12, 3.62)), bevel=.02); b.box(M['gold'], (.08, .36, .06), trs((s * .43, -.12, 3.38)))    # cheek guards
    b.ico(M['beard'], .52, 3, trs((0, -.36, 3.2), scale=(1, .72, 1.0)), jitter=.05, jscale=2.5, seed=14)  # beard mass
    for k in range(11):                                  # layered locks falling over the breastplate
        x = -.46 + k * .092; L = (1.15 - abs(x) * 1.1) * R.uniform(.85, 1.1); w = R.uniform(-.06, .06)
        b.tube(M['beard_d'] if k % 2 else M['beard'], [(x, -.62 + abs(x) * .35, 3.2), (x + w, -.8 + abs(x) * .3, 3.2 - L * .45), (x + w * 1.5, -.86 + abs(x) * .25, 3.2 - L * .8), (x + w * 2, -.84 + abs(x) * .2, 3.2 - L)], [.1, .095, .065, .015], seg=6)
    for s in (-1, 1):                                    # side braids with gold rings
        pts = [(s * .5, -.42, 3.2), (s * .58, -.6, 2.85), (s * .56, -.7, 2.5), (s * .5, -.72, 2.2)]
        b.tube(M['beard'], pts, [.085, .08, .065, .02], seg=6)
        for p in pts[1:3]:
            b.cyl(M['gold'], .09, .06, 8, trs(p), smooth=True)
    b.ico(M['navy'], .49, 3, trs((0, -.04, 3.78), scale=(1, 1.02, .72)))                                 # helm cap
    b.cyl(M['gold'], .5, .17, 20, trs((0, -.05, 3.78)), smooth=True)                                     # crown band
    b.box(M['gold'], (.07, .12, .34), trs((0, -.55, 3.72)), bevel=.02)                                   # nasal bar
    crystal(b, M['eye'], (0, -.56, 3.9), (0, -1, .2), .12, .07, 4)
    for k in range(8):                                   # crown points
        a = 2 * math.pi * k / 8 + math.pi / 8
        b.cone(M['gold'], .09, 0, .26, 4, trs((math.cos(a) * .47, -.05 + math.sin(a) * .47, 3.94), rot('Z', math.degrees(a))), smooth=False)
    for (x, y, L, rad, tx) in ((0, -.02, 1.0, .15, 0), (-.25, .05, .68, .11, -.28), (.25, .05, .68, .11, .28), (-.12, .22, .5, .09, -.12), (.14, .22, .54, .09, .14), (0, -.26, .46, .08, 0)):
        crystal(b, M['ice'], (x, y - .05, 3.9), (tx, y * .6, 1), L, rad)                                  # ice spires growing through the crown
    for k in range(7):                                   # hair at the nape
        x = -.3 + k * .1
        b.tube(M['beard_d'], [(x, .3, 3.6), (x * 1.1, .46, 3.3), (x * 1.2, .5, 3.0)], [.09, .08, .03], seg=5)


def arm_upper(b, s):
    sh = Vector((s * 1.18, 0, 3.0)); el = Vector((s * 1.44, -.05, 2.14))
    b.tube(M['navy_d'], [sh, (sh + el) / 2 + Vector((s * .04, 0, 0)), el], [.3, .28, .25], seg=10)        # mail sleeve
    for k in range(3):                                   # three lames of the pauldron, each with a gold rim
        c = sh + Vector((s * (.08 + k * .16), 0, .16 - k * .13)); tilt = rot('Y', s * (18 + k * 16))
        b.ico(M['navy'] if k != 1 else M['navy_l'], .66 - k * .08, 3, trs(c, tilt, (1, 1.05, .46)))
        b.tube(M['gold'], loop(c + Vector((0, 0, -.02)), .66 - k * .08, (.66 - k * .08) * 1.05, 16, tilt), .035, seg=5)
    for (dx, dy, L, rad) in ((.0, 0, 1.0, .16), (.34, -.2, .78, .13), (.3, .26, .7, .12), (-.22, -.24, .56, .1), (-.2, .26, .5, .09), (.6, .0, .5, .1)):
        crystal(b, M['ice'], sh + Vector((s * dx * .7, dy, .34)), (s * (dx + .25), dy * .8, 1), L, rad)     # ice growing out of the shoulder
    b.ico(M['gold'], .26, 2, trs(el, scale=(1, 1, 1)))                                                    # elbow cop
    crystal(b, M['ice'], el + Vector((s * .1, .12, 0)), (s * .6, .7, .2), .34, .07)


def arm_fore(b, s):
    el = Vector((s * 1.44, -.05, 2.14)); hand = Vector((s * 1.46, -.46, 1.46)); axis = hand - el
    b.tube(M['navy'], [el, el + axis * .5, el + axis * .9], [.25, .3, .28], seg=10)                       # vambrace
    for t in (.18, .82):
        b.tube(M['gold'], loop(el + axis * t, .3 if t > .5 else .27, .3 if t > .5 else .27, 12, axis.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()), .03, seg=5)
    for k in range(3):                                   # ice fins along the outer forearm
        crystal(b, M['ice'], el + axis * (.25 + k * .22) + Vector((s * .22, .08, 0)), (s * 1, .5, .5), .3 - k * .04, .06, 4)
    b.box(M['navy'], (.44, .44, .42), trs(hand + axis.normalized() * .12, axis.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()), bevel=.07)   # gauntlet
    b.box(M['gold'], (.46, .46, .09), trs(hand + axis.normalized() * .02, axis.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()), bevel=.02)
    for k in range(4):
        b.ico(M['gold'], .06, 1, trs(hand + axis.normalized() * .3 + Vector(((k - 1.5) * .11, -.12, 0))))


def sword(b):
    """Built upright from the hand (origin): pommel below, blade along +Z."""
    b.cyl(M['leather'], .065, .78, 10, trs((0, 0, -.42)), smooth=True)
    for k in range(6):
        b.cyl(M['gold_d'], .07, .025, 10, trs((0, 0, -.38 + k * .12)), smooth=True)
    b.ico(M['gold'], .13, 2, trs((0, 0, -.5))); crystal(b, M['eye'], (0, 0, -.58), (0, 0, -1), .16, .07, 4)
    b.box(M['gold'], (1.0, .16, .16), trs((0, 0, .42)), bevel=.04)                                        # crossguard
    for s in (-1, 1):
        b.cone(M['gold'], .1, 0, .3, 6, trs((s * .5, 0, .42), rot('Y', s * 60)), smooth=False); crystal(b, M['ice'], (s * .3, 0, .5), (s * .5, 0, 1), .3, .06)
    crystal(b, M['eye'], (0, -.1, .42), (0, -1, 0), .12, .09, 4); crystal(b, M['eye'], (0, .1, .42), (0, 1, 0), .12, .09, 4)
    prof = [(.5, .2, .06), (.8, .26, .075), (1.5, .25, .07), (2.3, .22, .06), (2.85, .15, .045), (3.22, .012, .008)]   # (z, half width, half thickness)
    b.loft(M['blade'], [[(w, 0, z), (0, t, z), (-w, 0, z), (0, -t, z)] for z, w, t in prof], smooth=False)
    b.loft(M['core'], [[(w * .22, 0, z), (0, t * 1.25, z), (-w * .22, 0, z), (0, -t * 1.25, z)] for z, w, t in prof[:-1]], smooth=False)
    for (z, s, L) in ((.75, 1, .34), (1.05, -1, .3), (1.45, 1, .22), (1.95, -1, .2)):                        # frost barbs on the edges
        crystal(b, M['ice'], (s * .22, 0, z), (s * 1, 0, .7), L, .05, 4)


def rune(b):
    """Ground sigil shown only while channelling: the visible tell of the 2.5 s charge."""
    for rr, w in ((1.9, .06), (1.45, .035)):
        b.tube(M['rune'], loop((0, 0, .02), rr, rr, 40), w, seg=4)
    for k in range(6):
        a = k * math.pi / 3; b.tube(M['rune'], [(math.cos(a) * .35, math.sin(a) * .35, .02), (math.cos(a) * 1.9, math.sin(a) * 1.9, .02)], .03, seg=4)
        a2 = a + math.pi / 6; crystal(b, M['ice'], (math.cos(a2) * 1.9, math.sin(a2) * 1.9, 0), (math.cos(a2) * .2, math.sin(a2) * .2, 1), .5, .09)


def build(coll):
    materials()

    def part(fn, name, pivot, parent, parent_pivot, *a):
        b = MB(); fn(b, *a)
        bmesh.ops.translate(b.bm, vec=-Vector(pivot), verts=b.bm.verts)
        return add_obj(b.to_mesh(name), name=name, loc=Vector(pivot) - Vector(parent_pivot), coll=coll, parent=parent)

    root = empty('Frost Lord / root', coll=coll)
    part(legs, 'Legs / sabatons and greaves', (0, 0, 0), root, (0, 0, 0))
    P_BODY, P_HEAD = (0, 0, 1.45), (0, -.05, 3.3)
    j = {'root': root}
    j['body'] = part(body, 'Body / cuirass, tassets, cape', P_BODY, root, (0, 0, 0))
    j['head'] = part(head, 'Head / beard, crown, ice spires', P_HEAD, j['body'], P_BODY)
    for s, n in ((1, 'L'), (-1, 'R')):
        sh, el = (s * 1.18, 0, 3.0), (s * 1.44, -.05, 2.14)
        j['arm' + n] = part(arm_upper, f'Arm {n} / ice pauldron', sh, j['body'], P_BODY, s)
        j['fore' + n] = part(arm_fore, f'Arm {n} / vambrace and gauntlet', el, j['arm' + n], sh, s)
    hand = (-1.46, -.5, 1.42)
    b = MB(); sword(b)
    j['sword'] = add_obj(b.to_mesh('Greatsword / ice blade'), loc=Vector(hand) - Vector((-1.44, -.05, 2.14)), coll=coll, parent=j['foreR'])
    j['fx:rune'] = part(rune, 'FX / channel rune', (0, 0, 0), root, (0, 0, 0))
    return j


POSES = {
    # sword carried low and forward, tip just above the road
    'march': {'joints': {'body': (4, 0, 0), 'head': (2, 0, 0), 'armL': (10, 0, 0), 'foreL': (-14, 0, 0), 'armR': (-12, 0, 0), 'foreR': (-10, 0, 0), 'sword': (128, 0, 16)}, 'glow': 1.0},
    # the 2.5 s charge: blade raised overhead, rune on the ground, eyes and blade flare
    'channel': {'joints': {'body': (-6, 0, 0), 'head': (-10, 0, 0), 'armL': (-128, -30, 0), 'foreL': (-30, 0, 0), 'armR': (-128, 30, 0), 'foreR': (-30, 0, 0), 'sword': (158, 0, 0)}, 'glow': 2.4, 'show': ['fx:rune']},
    # interrupted: knocked back, blade dropped to the side, light dimmed
    'interrupt': {'joints': {'body': (-16, 0, 6), 'head': (-12, 0, -10), 'armL': (-40, 60, 0), 'foreL': (-30, 0, 0), 'armR': (20, 40, 0), 'foreR': (-20, 0, 0), 'sword': (70, 0, -30)}, 'glow': .35},
}

if __name__ == '__main__':
    run('frost-lord', build, POSES, HEIGHT, glow_names=('Ice / greatsword blade', 'Ice / blade core', 'Glow / frost eyes', 'Glow / channel rune', 'Ice / pauldron crystal'),
        default_poses=['march', 'channel', 'interrupt'])
