"""64px grayscale silhouette check for the baked monster atlases (read-only).

Usage: python3 -I tools/check-monster-silhouettes.py [--out sheet.png]
Every public/defense/models/*-atlas.webp (1152x384, three poses) contributes its first frame (walk-a),
cropped to the alpha box, fitted into 60px and bottom-aligned in a 64x64 cell. For each pair it prints
the alpha-mask overlap (IoU), the mean gray and the gray spread inside the mask.
Provisional rule (a target to tune, not a measured standard): distinct if IoU < 0.65,
or mean gray differs by >= 30, or gray spread differs by >= 12. Exit code: 0 all distinct, 1 a pair is confusable, 2 for input errors.
Requires Pillow and NumPy.
"""
import argparse, itertools, sys
from pathlib import Path
from PIL import Image, ImageOps
import numpy as np

CELL, FIT = 64, 60
def die(message):
    print(message, file=sys.stderr)
    sys.exit(2)

models = Path(__file__).resolve().parent.parent / 'public/defense/models'
parser = argparse.ArgumentParser()
parser.add_argument('--out')
args = parser.parse_args()

def fit(img):
    box = img.getchannel('A').point(lambda v: 255 if v > 127 else 0).getbbox()
    if box is None:
        raise ValueError('empty alpha')
    img = img.crop(box)
    s = FIT / max(img.size)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cell.alpha_composite(img, ((CELL - img.width) // 2, CELL - 2 - img.height))
    return cell

cells = {}
for file in sorted(models.glob('*-atlas.webp')):
    atlas = Image.open(file).convert('RGBA')
    if atlas.size != (1152, 384):
        die(f'{file.name}: expected a 1152x384 atlas, got {atlas.size}')
    try:
        cells[file.name.removesuffix('-atlas.webp')] = fit(atlas.crop((0, 0, 384, 384)))
    except ValueError:
        die(f'{file.name}: first frame is fully transparent')
if len(cells) < 2:
    die('need at least two *-atlas.webp files')

mask = {k: np.array(v.getchannel('A')) > 127 for k, v in cells.items()}
gray = {k: np.array(ImageOps.grayscale(v.convert('RGB')), dtype=float) for k, v in cells.items()}
stat = {k: (gray[k][mask[k]].mean(), gray[k][mask[k]].std()) for k in cells}
for k, (mean, spread) in stat.items():
    print(f'{k:16s} mean gray {mean:5.0f}  spread {spread:4.0f}')
rows = []
for a, b in itertools.combinations(cells, 2):
    iou = (mask[a] & mask[b]).sum() / (mask[a] | mask[b]).sum()
    dg, ds = abs(stat[a][0] - stat[b][0]), abs(stat[a][1] - stat[b][1])
    rows.append((iou, a, b, dg, ds, iou < .65 or dg >= 30 or ds >= 12))
for iou, a, b, dg, ds, ok in sorted(rows, reverse=True):
    print(f'{a:16s} {b:16s} IoU {iou:.2f}  gray diff {dg:4.0f}  spread diff {ds:4.0f}  {"distinct" if ok else "CONFUSABLE"}')
if args.out:
    sheet = Image.new('RGB', ((CELL + 8) * len(cells), CELL * 2 + 16), (255, 255, 255))
    for i, (k, v) in enumerate(cells.items()):
        bg = Image.new('RGBA', (CELL, CELL), (255, 255, 255, 255))
        bg.alpha_composite(v)
        sheet.paste(ImageOps.grayscale(bg.convert('RGB')).convert('RGB'), (i * (CELL + 8) + 4, 4))
        sheet.paste(Image.fromarray((~mask[k] * 255).astype('uint8')).convert('RGB'), (i * (CELL + 8) + 4, CELL + 12))
    sheet.save(args.out)
bad = [r for r in rows if not r[5]]
print(f'{len(cells)} models, {len(rows)} pairs, {len(bad)} confusable')
sys.exit(1 if bad else 0)
