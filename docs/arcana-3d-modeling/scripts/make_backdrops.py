"""Pack the baked battle backdrops (build_theme_map.py --hd --tex --views backdrop) for the game.

  python3 make_backdrops.py <render_dir> <out_dir> [credits.json]

Writes <out_dir>/{forest,snow}-{single,expanded}.webp and manifest.json (projection contract + hashes).
Stage -> variant: 1-3 forest-single, 4 forest-expanded, 5-7 snow-single, 8 snow-expanded (getStage().expanded).
"""
import hashlib, json, os, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
credits = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(out, exist_ok=True)
VARIANTS = {'forest-single': 'forest-s1', 'forest-expanded': 'forest-s4', 'snow-single': 'snow-s5', 'snow-expanded': 'snow-s8'}
manifest = {
    'projection': {
        'camera': 'orthographic, 60 deg above the horizon, looking north (src/games/defense/terrain3d.ts TERRAIN_ELEVATION = PI/3)',
        'ground_plane': 'board (x, y) on the ground maps 1:1; world depth = y / sin60',
        'coverage_board_px': {'x': [-210, 1110], 'y': [-20, 620]},
        'note': 'Lay the image on a ground plane 1320 x 640/sin60 centred on board (450, 300). Covers landscape screens up to 2.2:1 '
                '(844 x 390 shows ~1300 board px). Gates, villages, towers, units and build-pad buttons are NOT baked in: the game draws them.',
    },
    'source': 'docs/arcana-3d-modeling/scripts/build_theme_map.py --hd --tex (Blender 5.2.3, Cycles CPU + OIDN)',
    'textures': 'CC0 1.0, Poly Haven - see ../textures/credits.json',
    'variants': [],
}
for vid, tag in VARIANTS.items():
    png = os.path.join(src, f'{tag}-backdrop.png')
    if not os.path.exists(png):
        print('missing', png); continue
    im = Image.open(png).convert('RGB')
    path = os.path.join(out, f'{vid}.webp')
    im.save(path, 'WEBP', quality=86, method=6)
    data = open(path, 'rb').read()
    info = json.load(open(os.path.join(src, f'{tag}.json'))) if os.path.exists(os.path.join(src, f'{tag}.json')) else {}
    manifest['variants'].append({'id': vid, 'file': f'{vid}.webp', 'size': list(im.size), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                                 'stages': {'forest-single': [1, 2, 3], 'forest-expanded': [4], 'snow-single': [5, 6, 7], 'snow-expanded': [8]}[vid],
                                 'scene': {k: info.get(k) for k in ('trees', 'rocks', 'tufts', 'flowers', 'stats')}})
    print(vid, im.size, len(data))
json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
