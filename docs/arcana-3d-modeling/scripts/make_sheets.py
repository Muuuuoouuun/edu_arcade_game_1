"""Compose the review sheets from the raw Blender renders (plain Python + Pillow, no Blender needed).

  python3 make_sheets.py <map render dir> <unit render dir> <repo data.ts> <output dir>

Outputs (WebP): map battle underlays, board-sync overlay, dioramas, close-ups, boss angle sheets and
a game-scale mock-up that places the sprite-angle bosses on the 60 degree maps.
"""
import sys, os, re, json, math
from PIL import Image, ImageDraw, ImageFont

MAPS, UNITS, DATA, OUT = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
INK, PAPER = (236, 228, 204), (22, 30, 30)


def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def save(im, name, q=84):
    path = os.path.join(OUT, name); im.convert('RGB').save(path, 'WEBP', quality=q, method=6)
    print(f'{name}: {im.size[0]}x{im.size[1]}, {os.path.getsize(path)} B')


def label(im, text, xy=(10, 8), size=20):
    d = ImageDraw.Draw(im); f = font(size); x, y = xy
    w = d.textlength(text, font=f)
    d.rectangle((x - 6, y - 4, x + w + 6, y + size + 6), fill=(18, 28, 26)); d.text((x, y), text, font=f, fill=INK)


def row(images, gap=10, bg=PAPER):
    h = max(i.height for i in images); w = sum(i.width for i in images) + gap * (len(images) - 1)
    out = Image.new('RGB', (w, h), bg); x = 0
    for i in images:
        out.paste(i.convert('RGB'), (x, 0)); x += i.width + gap
    return out


def column(images, gap=10, bg=PAPER):
    w = max(i.width for i in images); h = sum(i.height for i in images) + gap * (len(images) - 1)
    out = Image.new('RGB', (w, h), bg); y = 0
    for i in images:
        out.paste(i.convert('RGB'), (0, y)); y += i.height + gap
    return out


def fit(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def board():
    text = open(DATA, encoding='utf-8').read()

    def grab(name):
        m = re.search(r'export const ' + name + r'\s*:\s*[^=]+=\s*(\[.*?\n\];)', text, re.S)
        body = re.sub(r'([{,]\s*)(\w+)\s*:', r'\1"\2":', m.group(1).rstrip(';')).replace("'", '"')
        return json.loads(re.sub(r',\s*([\]}])', r'\1', body))

    return {'forest': (grab('PATHS'), grab('SLOTS')), 'snow': (grab('SNOW_PATHS'), grab('SNOW_SLOTS'))}


BOARD = board()
mp = lambda n: Image.open(os.path.join(MAPS, n))

# 1. battle underlays: exactly the 900 x 600 board at the 60 degree camera
fs1, ss5 = mp('forest-s1-battle.png'), mp('snow-s5-battle.png')
a, b = fit(fs1, 900), fit(ss5, 900)
label(a, 'Forest 1-1 . battle camera 60 deg ortho . 900 x 600 board 1:1'); label(b, 'Snow 2-1 . battle camera 60 deg ortho . 900 x 600 board 1:1')
save(row([a, b]), 'maps-battle.webp')
for src, name in ((fs1, 'forest-battle-1350.webp'), (ss5, 'snow-battle-1350.webp')):
    save(src, name, 86)

# 2. board-sync overlay: the game's own path polylines, slots and engine zones drawn over the render
def overlay(im, theme, stage, expanded):
    im = fit(im, 900).convert('RGB'); d = ImageDraw.Draw(im, 'RGBA'); paths, slots = BOARD[theme]
    zone = (650, 735) if theme == 'forest' else (300, 520)
    for x in zone:
        d.line((x, 0, x, 600), fill=(255, 255, 255, 190), width=2)
    for path in paths[:2 if expanded else 1]:
        pts = [(p['x'], p['y']) for p in path]; d.line(pts, fill=(230, 40, 60, 235), width=3)
        for (x, y) in pts:
            d.ellipse((x - 5, y - 5, x + 5, y + 5), outline=(230, 40, 60, 255), width=2)
    for s in slots:
        if s['unlock'] <= stage:
            d.ellipse((s['x'] - 24, s['y'] - 24, s['x'] + 24, s['y'] + 24), outline=(255, 214, 80, 255), width=3)
    return im


a = overlay(fs1, 'forest', 1, False); b = overlay(ss5, 'snow', 5, False)
label(a, 'red = PATHS . gold = SLOTS (r 24) . white = engine water zone x 650..735', size=17)
label(b, 'red = SNOW_PATHS . gold = SNOW_SLOTS . white = engine ice zone x 300..520', size=17)
save(row([a, b]), 'maps-board-sync.webp')

# 3. dioramas, close-ups, wide posters (expanded stages with the theme gate set)
for view, name, w in (('beauty', 'maps-diorama.webp', 1100), ('close', 'maps-close.webp', 1100), ('wide', 'maps-wide.webp', 1000)):
    a, b = fit(mp(f'forest-s4-gate-{view}.png'), w), fit(mp(f'snow-s8-gate-{view}.png'), w)
    label(a, f'Forest 1-4 (two lanes) + verdant citadel gate . {view}'); label(b, f'Snow 2-4 (two lanes) + mountain refuge gate . {view}')
    save(column([a, b]), name)

# 4. boss angle sheets
def unit(n):
    return Image.open(os.path.join(UNITS, n)).convert('RGBA')


def on(bg_rgb, im, size):
    out = Image.new('RGBA', (size, size), bg_rgb + (255,)); im = im.resize((size, size), Image.LANCZOS); out.alpha_composite(im); return out.convert('RGB')


def angle_sheet(uid, title, poses, bg):
    top = []
    for p in poses:
        t = on(bg, unit(f'{uid}-{p}-sprite.png'), 400); label(t, f'sprite 23.5 deg . {p}', size=16); top.append(t)
    views = [('front', 'front'), ('side', 'side'), ('back', 'back'), ('battle-flank', 'battle 60 deg . walking east'), ('battle-turned', 'battle 60 deg . turned 45')]
    bottom = []
    for v, text in views:
        t = on(bg, unit(f'{uid}-{poses[0]}-{v}.png'), 240); label(t, text, size=13); bottom.append(t)
    sheet = column([row(top), row(bottom)])
    head = Image.new('RGB', (sheet.width, 44), PAPER); label(head, title, (10, 8), 22)
    save(column([head, sheet], gap=0), f'{uid}-angles.webp')


angle_sheet('bark-king', 'Bark King . forest boss . poses march / rage / rush + turnaround', ['march', 'rage', 'rush'], (74, 96, 70))
angle_sheet('frost-lord', 'Frost Lord . snow boss . poses march / channel / interrupt + turnaround', ['march', 'channel', 'interrupt'], (86, 104, 124))

# 5. game-scale mock-up: sprite-angle bosses drawn at their in-game size on the 60 degree maps
def mock(map_im, uid, poses, spots, px):
    im = fit(map_im, 900).convert('RGBA')
    for pose, (x, y) in zip(poses, spots):
        s = unit(f'{uid}-{pose}-sprite.png'); k = px / 640 * 1.9          # the unit fills about half of its 640 frame
        s = s.resize((round(640 * k), round(640 * k)), Image.LANCZOS)
        im.alpha_composite(s, (round(x - 320 * k), round(y - 550 * k)))  # shared ground anchor (320, 550)
    return im.convert('RGB')


MEASURE = {'units': {}}


def lum(rgb):
    r, g, b_ = rgb; return .2126 * r + .7152 * g + .0722 * b_


def measure(map_im, uid, poses, spots, px):
    """Frame fit, in-game size and luminance contrast against the map patch under each placed sprite."""
    base = fit(map_im, 900).convert('RGB'); k = px / 640 * 1.9; out = {}
    for pose, (x, y) in zip(poses, spots):
        s = unit(f'{uid}-{pose}-sprite.png'); box = s.getchannel('A').point(lambda v: 255 if v > 200 else 0).getbbox()   # alpha > 200: body only, not the soft ground shadow
        px_u = [p[:3] for p in s.crop(box).getdata() if p[3] > 128]
        lu = sum(lum(p) for p in px_u) / len(px_u)
        patch = base.crop((round(x - 320 * k + box[0] * k), round(y - 550 * k + box[1] * k), round(x - 320 * k + box[2] * k), round(y - 550 * k + box[3] * k)))
        pm = list(patch.getdata()); lm = sum(lum(p) for p in pm) / len(pm)
        out[pose] = {'frame_bbox': box, 'frame_margin_px': min(box[0], box[1], 640 - box[2], 640 - box[3]),
                     'board_px': [round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)], 'phone_px_h': round((box[3] - box[1]) * k * 482 / 900),
                     'luminance_unit': round(lu), 'luminance_map': round(lm), 'contrast': round(abs(lu - lm))}
    hb = lambda n: (lambda bx: bx[3] - bx[1])(unit(n).getchannel('A').point(lambda v: 255 if v > 200 else 0).getbbox())
    out['battle_flank_height_ratio'] = round(hb(f'{uid}-{poses[0]}-battle-flank.png') / hb(f'{uid}-{poses[0]}-sprite.png'), 2)
    info = json.load(open(os.path.join(UNITS, uid + '.json')))
    out['triangles'] = info['stats']['triangles']; out['objects'] = info['stats']['objects']; out['glb_bytes'] = info.get('glb_bytes'); out['pose_top_z'] = {p: v['top_z'] for p, v in info['poses'].items()}
    MEASURE['units'][uid] = out


measure(fs1, 'bark-king', ['march', 'rage', 'rush'], [(150, 172), (420, 287), (600, 432)], 115)
measure(ss5, 'frost-lord', ['march', 'channel', 'interrupt'], [(120, 152), (410, 322), (700, 457)], 135)
MEASURE['maps'] = {n[:-5]: {k: v for k, v in json.load(open(os.path.join(MAPS, n))).items() if k != 'blender'} for n in sorted(os.listdir(MAPS)) if n.endswith('.json')}
json.dump(MEASURE, open(os.path.join(OUT, 'measurements.json'), 'w'), indent=1)
print(json.dumps(MEASURE['units'], indent=1))

a = mock(fs1, 'bark-king', ['march', 'rage', 'rush'], [(150, 172), (420, 287), (600, 432)], 115)
b = mock(ss5, 'frost-lord', ['march', 'channel', 'interrupt'], [(120, 152), (410, 322), (700, 457)], 135)
label(a, 'Bark King at in-game size (115 px box) on the forest map', size=17); label(b, 'Frost Lord at in-game size (135 px box) on the snow map', size=17)
full = row([a, b]); save(full, 'mock-game-scale.webp')
phone = row([fit(a, 482), fit(b, 482)]); save(phone, 'mock-phone-482.webp', 88)
