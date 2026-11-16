# Contrast measurement (cycles 74, 92, 102): CIELAB ΔE between each enemy's main colour and the floor under it, and of the
# frost and ward floor cues against the floor, from the frames tools/rush-contrast.cjs takes.
# Usage: python3 tools/rush-contrast.py <outDir> [stage prefixes, default s2 s3 s7 s8; mid-field rows: s7mid s8mid ...]
# Method: enemy pixels are those that differ from the empty frame; ink (L < 20) is left out; the largest of three
# (cycle 109: 'BODY' lines measure the whole body from the body-only frame, no enemy shadow/blob/ring; cycle 114: 'SHAPE'
# lines take the body area from a flat-colour mask frame (cycle 126: one colour per kind), so floor-coloured parts
# still count and a neighbour's spill does not; prefer SHAPE)
# k-means clusters is the main colour. Criterion (art-direction.md): main vs floor >= 30; cues clearly above 15.
import json, sys, math, random
from PIL import Image
d = sys.argv[1]
def lab(rgb):
    def lin(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = map(lin, rgb)
    X = (0.4124*r + 0.3576*g + 0.1805*b) / 0.95047; Y = 0.2126*r + 0.7152*g + 0.0722*b; Z = (0.0193*r + 0.1192*g + 0.9505*b) / 1.08883
    f = lambda t: t ** (1/3) if t > 0.008856 else 7.787*t + 16/116
    return (116*f(Y) - 16, 500*(f(X) - f(Y)), 200*(f(Y) - f(Z)))
def kmeans(pts, k=3, it=12):
    random.seed(1); cs = random.sample(pts, k)
    for _ in range(it):
        groups = [[] for _ in cs]
        for p in pts: groups[min(range(len(cs)), key=lambda i: math.dist(p, cs[i]))].append(p)
        cs = [tuple(sum(q[j] for q in g) / len(g) for j in range(3)) if g else cs[i] for i, g in enumerate(groups)]
    return sorted(zip(cs, groups), key=lambda cg: -len(cg[1]))
med = lambda L: tuple(sorted(x[i] for x in L)[len(L) // 2] for i in range(3))
def main_color(E, A, box):
    body, back = [], []
    for x in range(box[0], box[2], 2):
        for y in range(box[1], box[3], 2):
            a, e = A.getpixel((x, y)), E.getpixel((x, y))
            if sum(abs(a[i] - e[i]) for i in range(3)) > 60:
                la = lab(a)
                if la[0] >= 20: body.append(la); back.append(lab(e))
    if len(body) < 20: return None, None
    (m, grp), *_ = kmeans(body)
    return m, med(back)
def stand_out(E, A, box):
    """Deterministic (cycle 102): of an enemy's non-ink pixels, the share whose ΔE to the floor under them is >= 30,
    and the median ΔE. Unlike the main-colour cluster it does not flip on two-tone models (robe and trim, fur collars)."""
    ds = []
    for x in range(box[0], box[2], 2):
        for y in range(box[1], box[3], 2):
            a, e = A.getpixel((x, y)), E.getpixel((x, y))
            if sum(abs(a[i] - e[i]) for i in range(3)) > 60:
                la = lab(a)
                if la[0] >= 20: ds.append(math.dist(la, lab(e)))
    if len(ds) < 20: return None, None
    ds.sort()
    return sum(1 for d in ds if d >= 30) / len(ds), ds[len(ds) // 2]
def ring_color(E, P, A, box, foot):
    # pixels the status adds on the FLOOR: differ from the plain-enemy frame, and the plain frame there is still floor
    cue, back = [], []
    for x in range(box[0], box[2]):
        for y in range(box[1], box[3]):
            a, p, e = A.getpixel((x, y)), P.getpixel((x, y)), E.getpixel((x, y))
            if sum(abs(a[i] - p[i]) for i in range(3)) > 40 and sum(abs(p[i] - e[i]) for i in range(3)) < 12:
                cue.append(lab(a)); back.append(lab(e))
    if len(cue) < 15: return None, None
    # the most saturated half of the added pixels = the ring (the rest is the shell's pale fringe over the floor)
    b = med(back); order = sorted(range(len(cue)), key=lambda i: -math.hypot(cue[i][1] - b[1], cue[i][2] - b[2]))[:max(8, len(cue) // 2)]
    return med([cue[i] for i in order]), b
def body_window(pts, i, wide=False):
    """Cycle 109: the screen window for enemy i, halfway to its row neighbours, from well above its head to just below
    its feet (device px). Whole-body measurement uses every masked pixel in it instead of the small head box."""
    p = pts[i]; dpr = p['dpr']; fx, fy = p['x'] * dpr, p['y'] * dpr
    xs = sorted(q['x'] * dpr for q in pts)
    left = max([x for x in xs if x < fx - 1], default=None); right = min([x for x in xs if x > fx + 1], default=None)
    half = 420 if wide else 200
    x0 = (left + fx) / 2 if left is not None else fx - half; x1 = (right + fx) / 2 if right is not None else fx + half
    return [int(x0), int(fy - (560 if wide else 360)), int(x1), int(fy + 40)]
def body_stand_out(E, B, win, E2=None):
    """Share of the body's non-ink pixels with ΔE >= 30 to the floor under them, median ΔE, and the pixel count. Body
    pixels: the body-only frame differs from the empty frame (no enemy shadow, blob or ring is drawn there)."""
    ds = []
    x0, y0, x1, y1 = max(0, win[0]), max(0, win[1]), min(E.width, win[2]), min(E.height, win[3])
    for x in range(x0, x1, 2):
        for y in range(y0, y1, 2):
            a, e = B.getpixel((x, y)), E.getpixel((x, y))
            if E2 is not None:
                e2 = E2.getpixel((x, y))
                if sum(abs(e[i] - e2[i]) for i in range(3)) > 30: continue  # moves on its own (water, camera drift)
            if sum(abs(a[i] - e[i]) for i in range(3)) > 60:
                la = lab(a)
                if la[0] >= 20: ds.append(math.dist(la, lab(e)))
    if len(ds) < 20: return None, None, len(ds)
    ds.sort()
    return sum(1 for d in ds if d >= 30) / len(ds), ds[len(ds) // 2], len(ds)
def is_mask(c):
    """A pixel of the cycle 114 shape mask: flat magenta (#ff00ff, allowing for the finishing pass)."""
    r, g, b = c
    return r > 150 and b > 150 and g < 0.45 * min(r, b)
# Cycle 126: the mask frame draws each kind in its own flat colour (render.ts MASK_COLOR), so an enemy's body is the
# pixels of its colour only; a big neighbour's body or shell spilling into the window no longer counts.
MASK_RGB = {'grunt': (255, 0, 0), 'skirmisher': (0, 255, 0), 'brute': (0, 0, 255), 'shield': (255, 255, 0),
            'shaman': (255, 0, 255), 'wolf': (0, 255, 255), 'boss': (255, 128, 0)}
def mask_kind(c):
    for k, m in MASK_RGB.items():
        if max(abs(c[0] - m[0]), abs(c[1] - m[1]), abs(c[2] - m[2])) <= 70: return k
    return None
def shape_stand_out(E, B, M, win, E2=None, kind=None):
    """Cycle 114: like body_stand_out, but the body is every magenta pixel of the mask frame, so parts as pale as the
    floor count as body instead of dropping out of the mask."""
    ds = []
    x0, y0, x1, y1 = max(0, win[0]), max(0, win[1]), min(E.width, win[2]), min(E.height, win[3])
    for x in range(x0, x1, 2):
        for y in range(y0, y1, 2):
            mp, e = M.getpixel((x, y)), E.getpixel((x, y))
            if (mask_kind(mp) != kind) if kind else not is_mask(mp): continue
            # Only what the enemy drew: sand paths match the boss orange and water the wolf cyan in the empty frame too.
            if kind and sum(abs(mp[i] - e[i]) for i in range(3)) <= 60: continue
            a = B.getpixel((x, y))
            if E2 is not None and sum(abs(e[i] - E2.getpixel((x, y))[i]) for i in range(3)) > 30: continue
            la = lab(a)
            if la[0] >= 20: ds.append(math.dist(la, lab(e)))
    if len(ds) < 20: return None, None, len(ds)
    ds.sort()
    return sum(1 for d in ds if d >= 30) / len(ds), ds[len(ds) // 2], len(ds)
def clipped(M, win, kind):
    """Cycle 138: the kind's mask reaches a frame edge, so part of the body is off screen and the share describes only
    what is left (near the town the battle camera is clamped and the road and field rows sit on the top edge)."""
    x0, x1 = max(0, win[0]), min(M.width, win[2])
    for y in (0, 1, M.height - 2, M.height - 1):
        for x in range(x0, x1, 2):
            if mask_kind(M.getpixel((x, y))) == kind: return True
    return False
def body_rows(st):
    """One line per enemy: whole-body stand-out, plain and frosted (needs the -body frames, cycle 109)."""
    try:
        E = Image.open(f'{d}/{st}plain-empty.png').convert('RGB')
        try: E2 = Image.open(f'{d}/{st}plain-empty2.png').convert('RGB')
        except FileNotFoundError: E2 = None
        BP = Image.open(f'{d}/{st}plain-body.png').convert('RGB'); BF = Image.open(f'{d}/{st}frost-body.png').convert('RGB')
        try: MP = Image.open(f'{d}/{st}plain-mask.png').convert('RGB'); MF = Image.open(f'{d}/{st}frost-mask.png').convert('RGB')
        except FileNotFoundError: MP = MF = None
        try: BW = Image.open(f'{d}/{st}ward-body.png').convert('RGB'); MW = Image.open(f'{d}/{st}ward-mask.png').convert('RGB')
        except FileNotFoundError: BW = MW = None
    except FileNotFoundError: return
    pts = json.load(open(f'{d}/{st}plain-pts.json'))
    for i, p in enumerate(pts):
        win = body_window(pts, i)
        sh, md, n = body_stand_out(E, BP, win, E2); fsh, fmd, fn = body_stand_out(E, BF, win, E2)
        S = lambda share, medv, n: f'{share * 100:4.0f}% med {medv:5.1f} ({n:5d} px)' if share is not None else '            n/a'
        print(f"{st} {p['kind']:10s} BODY stands out {S(sh, md, n)} | frosted {S(fsh, fmd, fn)}")
        if MP is not None:
            # The kind's own colour marks its body, so the window can be wide (the boss reaches past the halfway line).
            k = p['kind']; wide = body_window(pts, i, wide=True); wide = [wide[0], win[1], wide[2], win[3]]
            wide = [min(wide[0], int(p['x'] * p['dpr']) - 300), wide[1], max(wide[2], int(p['x'] * p['dpr']) + 300), wide[3]]
            sh, md, n = shape_stand_out(E, BP, MP, wide, E2, k); fsh, fmd, fn = shape_stand_out(E, BF, MF, wide, E2, k)
            ward = f" | warded {S(*shape_stand_out(E, BW, MW, wide, E2, k))}" if MW is not None else ''
            edge = ' [clipped: off the frame edge, reference only]' if clipped(MP, wide, k) else ''
            print(f"{st} {p['kind']:10s} SHAPE stands out {S(sh, md, n)} | frosted {S(fsh, fmd, fn)}{ward}{edge}")
def boxes(name):
    E = Image.open(f'{d}/{name}-empty.png').convert('RGB')
    for p in json.load(open(f'{d}/{name}-pts.json')):
        cx, cy = p['x'] * p['dpr'], (p['y'] + p['hy']) / 2 * p['dpr']
        h = max(30, abs(p['y'] - p['hy']) * p['dpr'] * 1.3)
        box = [int(cx - h * 0.8), int(cy - h), int(cx + h * 0.8), int(cy + h * 0.9)]
        box = [max(0, box[0]), max(0, box[1]), min(E.width, box[2]), min(E.height, box[3])]
        yield p['kind'], box, E, p['y'] * p['dpr'] + (p['y'] - p['hy']) * p['dpr'] * 0.86
import os
for st in (sys.argv[2:] or ['s2', 's3', 's7', 's8']):
    if not os.path.exists(f'{d}/{st}plain.png'): continue  # e.g. only the boss scenes were captured (ONLY=s10boss)
    P = Image.open(f'{d}/{st}plain.png').convert('RGB'); F = Image.open(f'{d}/{st}frost.png').convert('RGB'); W = Image.open(f'{d}/{st}ward.png').convert('RGB')
    for kind, box, E, foot in boxes(st + 'plain'):
        plain, bg = main_color(E, P, box); frost, _ = main_color(E, F, box); ward, _ = main_color(E, W, box)
        fr, fbg = ring_color(E, P, F, box, foot); wr, wbg = ring_color(E, P, W, box, foot)
        D = lambda a, b: f'{math.dist(a, b):5.1f}' if a and b else '  n/a'
        sh, md = stand_out(E, P, box); fsh, fmd = stand_out(E, F, box)
        S = lambda share, medv: f'{share * 100:4.0f}% med {medv:5.1f}' if share is not None else '        n/a'
        print(f"{st} {kind:10s} floorL {bg[0]:4.0f} | stands out {S(sh, md)} | frosted stands out {S(fsh, fmd)} | main vs floor {D(plain,bg)} | frost main vs floor {D(frost,bg)} vs plain {D(frost,plain)} | ward main vs floor {D(ward,bg)} vs plain {D(ward,plain)} vs frost {D(ward,frost)} | frost floor cue vs floor {D(fr,fbg)} | ward floor cue vs floor {D(wr,wbg)}")
for st in (sys.argv[2:] or ['s2', 's3', 's7', 's8']): body_rows(st)
for name in ['s5boss', 's10boss']:
    try:
        E = Image.open(f'{d}/{name}-empty.png').convert('RGB'); B = Image.open(f'{d}/{name}-body.png').convert('RGB')
        try: E2 = Image.open(f'{d}/{name}-empty2.png').convert('RGB')
        except FileNotFoundError: E2 = None
        pts = json.load(open(f'{d}/{name}-pts.json'))
        for i, p in enumerate(pts):
            sh, md, n = body_stand_out(E, B, body_window(pts, i, wide=True), E2)
            if sh is not None: print(name, f'BODY stands out {sh * 100:.0f}% med {md:.1f} ({n} px)')
            try:
                M = Image.open(f'{d}/{name}-mask.png').convert('RGB')
                sh, md, n = shape_stand_out(E, B, M, body_window(pts, i, wide=True), E2, p['kind'])
                if sh is not None: print(name, f'SHAPE stands out {sh * 100:.0f}% med {md:.1f} ({n} px)')
            except FileNotFoundError: pass
    except FileNotFoundError: pass
for name in ['s5boss', 's10boss']:
    try:
        A = Image.open(f'{d}/{name}.png').convert('RGB')
        for kind, box, E, foot in boxes(name):
            m, bg = main_color(E, A, box); sh, md = stand_out(E, A, box)
            if kind == 'boss': print(name, f'boss stands out {sh * 100:.0f}% med {md:.1f} | main', [round(v) for v in m], 'vs floor', round(math.dist(m, bg), 1))
    except FileNotFoundError: pass
