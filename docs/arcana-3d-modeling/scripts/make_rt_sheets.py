"""Review sheets for the real-time battlefield models.

  python3 make_rt_sheets.py <rt_render_dir> <ingame_dir> <approved_dir> <out_dir>

<rt_render_dir>: build_theme_map.py --rt output, <ingame_dir>: integration/ingame-check.cjs screenshots,
<approved_dir>: art-source/defense/concepts/2026-11-13-approved-gameplay.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

rt, ingame, approved, out = sys.argv[1:5]
os.makedirs(out, exist_ok=True)
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception:
    FONT = ImageFont.load_default()


def fit(path, w):
    im = Image.open(path).convert('RGB'); return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def label(im, text):
    d = ImageDraw.Draw(im); box = d.textbbox((0, 0), text, font=FONT)
    d.rectangle((0, 0, box[2] + 20, box[3] + 16), fill=(18, 44, 40)); d.text((10, 6), text, fill=(244, 234, 211), font=FONT); return im


def stack(items, w, path, cols=1):
    ims = [label(fit(p, w), t) for p, t in items if os.path.exists(p)]
    if not ims:
        return
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    H = sum(max(i.height for i in r) for r in rows) + 8 * (len(rows) - 1)
    sheet = Image.new('RGB', (w * cols + 8 * (cols - 1), H), (18, 44, 40)); y = 0
    for r in rows:
        for k, im in enumerate(r):
            sheet.paste(im, (k * (w + 8), y))
        y += max(i.height for i in r) + 8
    sheet.save(path, quality=84, method=6); print(os.path.basename(path), sheet.size, os.path.getsize(path))


for theme, st in (('forest', 4), ('snow', 8)):
    stack([(f'{ingame}/s{st}-now.png', f'main now - procedural terrain ({theme}, stage {st})'),
           (f'{ingame}/s{st}-glb.png', 'battlefield GLB in the same renderer - prep'),
           (f'{ingame}/s{st}-glb-wave.png', 'battlefield GLB - wave running, units grounded by the height contract')], 1266, f'{out}/rt-ingame-{theme}.webp')
    stack([(f'{rt}/{theme}-s{st}-rt-beauty.png', f'real-time scene, 3/4 view ({theme})'), (f'{rt}/{theme}-s{st}-rt-close.png', 'close: UV textures on roof, stone, plank, bark'),
           (f'{rt}/{theme}-s{st}-rt-battle.png', 'battle camera (60 deg ortho, board 1:1)')], 1200, f'{out}/rt-{theme}-views.webp')
    g = f'{rt}/{theme}-s{st}-rt-tex/ground.webp'
    if os.path.exists(g):
        im = Image.open(g).convert('RGB'); im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS).save(f'{out}/rt-{theme}-ground-texture.webp', quality=82, method=6)
stack([(f'{approved}/01-battle-forest.png', 'approved still 01 (target, AI concept)'), (f'{rt}/forest-s4-rt-beauty.png', 'real-time battlefield model (this folder)')], 1100, f'{out}/rt-vs-approved.webp', cols=2)
stack([(f'{ingame}/s1-glb.png', '1-1 forest single'), (f'{ingame}/s5-glb.png', '2-1 snow single')], 1266, f'{out}/rt-ingame-single.webp')
