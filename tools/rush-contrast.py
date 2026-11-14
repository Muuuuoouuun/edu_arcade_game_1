# Contrast measurement (cycles 74, 92, 102): CIELAB ΔE between each enemy's main colour and the floor under it, and of the
# frost and ward floor cues against the floor, from the frames tools/rush-contrast.cjs takes.
# Usage: python3 tools/rush-contrast.py <outDir> [stage prefixes, default s2 s3 s7 s8; mid-field rows: s7mid s8mid ...]
# Method: enemy pixels are those that differ from the empty frame; ink (L < 20) is left out; the largest of three
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
def boxes(name):
    E = Image.open(f'{d}/{name}-empty.png').convert('RGB')
    for p in json.load(open(f'{d}/{name}-pts.json')):
        cx, cy = p['x'] * p['dpr'], (p['y'] + p['hy']) / 2 * p['dpr']
        h = max(30, abs(p['y'] - p['hy']) * p['dpr'] * 1.3)
        box = [int(cx - h * 0.8), int(cy - h), int(cx + h * 0.8), int(cy + h * 0.9)]
        box = [max(0, box[0]), max(0, box[1]), min(E.width, box[2]), min(E.height, box[3])]
        yield p['kind'], box, E, p['y'] * p['dpr'] + (p['y'] - p['hy']) * p['dpr'] * 0.86
for st in (sys.argv[2:] or ['s2', 's3', 's7', 's8']):
    P = Image.open(f'{d}/{st}plain.png').convert('RGB'); F = Image.open(f'{d}/{st}frost.png').convert('RGB'); W = Image.open(f'{d}/{st}ward.png').convert('RGB')
    for kind, box, E, foot in boxes(st + 'plain'):
        plain, bg = main_color(E, P, box); frost, _ = main_color(E, F, box); ward, _ = main_color(E, W, box)
        fr, fbg = ring_color(E, P, F, box, foot); wr, wbg = ring_color(E, P, W, box, foot)
        D = lambda a, b: f'{math.dist(a, b):5.1f}' if a and b else '  n/a'
        sh, md = stand_out(E, P, box); fsh, fmd = stand_out(E, F, box)
        S = lambda share, medv: f'{share * 100:4.0f}% med {medv:5.1f}' if share is not None else '        n/a'
        print(f"{st} {kind:10s} floorL {bg[0]:4.0f} | stands out {S(sh, md)} | frosted stands out {S(fsh, fmd)} | main vs floor {D(plain,bg)} | frost main vs floor {D(frost,bg)} vs plain {D(frost,plain)} | ward main vs floor {D(ward,bg)} vs plain {D(ward,plain)} vs frost {D(ward,frost)} | frost floor cue vs floor {D(fr,fbg)} | ward floor cue vs floor {D(wr,wbg)}")
for name in ['s5boss', 's10boss']:
    try:
        A = Image.open(f'{d}/{name}.png').convert('RGB')
        for kind, box, E, foot in boxes(name):
            m, bg = main_color(E, A, box); sh, md = stand_out(E, A, box)
            if kind == 'boss': print(name, f'boss stands out {sh * 100:.0f}% med {md:.1f} | main', [round(v) for v in m], 'vs floor', round(math.dist(m, bg), 1))
    except FileNotFoundError: pass
