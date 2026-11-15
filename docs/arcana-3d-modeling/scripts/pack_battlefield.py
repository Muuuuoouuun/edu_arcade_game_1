"""Pack the real-time battlefield models (build_theme_map.py --hd --tex --rt --sets --blend) for hand-over.

  python3 pack_battlefield.py <render_dir> <data.ts> <out_dir>

Writes battlefield-<variant>.glb / .blend / .height.json and battlefield-manifest.json.
Stage -> variant: 1-3 forest-single, 4 forest-expanded, 5-7 snow-single, 8 snow-expanded.
The height file is the grounding contract for units (see battleGroundHeight in src/games/defense/battleModels.ts):
a 10 px grid of ground heights plus the build-pad tops and the bridge decks, all in board px above the road level.
"""
import hashlib, json, os, re, shutil, struct, sys

src, data_ts, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
VARIANTS = {'forest-single': ('forest-s1', 1), 'forest-expanded': ('forest-s4', 4), 'snow-single': ('snow-s5', 5), 'snow-expanded': ('snow-s8', 8)}
STAGES = {'forest-single': [1, 2, 3], 'forest-expanded': [4], 'snow-single': [5, 6, 7], 'snow-expanded': [8]}


def grab(name):
    text = open(data_ts, encoding='utf-8').read()
    body = re.search(r'export const ' + name + r'\s*:\s*[^=]+=\s*(\[.*?\n\];)', text, re.S).group(1).rstrip(';')
    body = re.sub(r'([{,]\s*)(\w+)\s*:', r'\1"\2":', body).replace("'", '"')
    return json.loads(re.sub(r',\s*([\]}])', r'\1', body))


def glb_stats(path):
    d = open(path, 'rb').read(); n = struct.unpack('<I', d[12:16])[0]; g = json.loads(d[20:20 + n]); acc = g['accessors']
    use = {}
    for node in g['nodes']:
        if 'mesh' in node:
            use[node['mesh']] = use.get(node['mesh'], 0) + 1
    tris = sum(sum(acc[p['indices']]['count'] // 3 for p in m['primitives']) * use.get(i, 0) for i, m in enumerate(g['meshes']))
    bv = g['bufferViews']
    return {'triangles': tris, 'nodes': len(g['nodes']), 'meshes': len(g['meshes']), 'materials': len(g['materials']), 'textures': len(g.get('images', [])),
            'texture_bytes': sum(bv[i['bufferView']]['byteLength'] for i in g.get('images', []) if 'bufferView' in i), 'extensions': g.get('extensionsUsed', [])}


def sample(h, x, y):
    fx = min(max(x / h['step'], 0), h['cols'] - 1.001); fy = min(max(y / h['step'], 0), h['rows'] - 1.001)
    ix, iy = int(fx), int(fy); tx, ty = fx - ix, fy - iy; v = h['heights']; c = h['cols']
    a, b, cc, d = v[iy * c + ix], v[iy * c + ix + 1], v[(iy + 1) * c + ix], v[(iy + 1) * c + ix + 1]
    return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty


manifest = {
    'contract': {
        'units': 'glTF metres, Y up. Board px = metres x 100. glTF origin = board (0, 600) on the road level.',
        'to_terrain3d': 'scene.scale = 100; scene.position.z = 600 / sin60  ->  matches boardToWorld() in src/games/defense/terrain3d.ts',
        'camera': 'authored for the 60 deg orthographic battle camera; ground depth is stretched by 1/sin60 like the game',
        'coverage_board_px': {'ground_mesh': {'x': [-260, 1160], 'y': [-260, 860]}, 'trees_rocks': {'x': [-232, 1132], 'y': [-45, 695]}},
        'ground': 'one relief mesh (10 px grid) + a water / ice sheet, both mapped to a single baked texture: grass blades, flowers, curb stones, '
                  'bank pebbles, flagstone joints and the sun shadows of every tree, rock, bridge and pad are in that texture',
        'not_included': 'village gates, towers, units, effects, build-pad buttons (the game draws them). Build-pad daises ARE included.',
        'materials': 'UV-mapped base-colour textures (palette x CC0 detail, 256 px tiles); normal maps on rock, stone block, roof tile, plank, bark, door',
    },
    'source': 'docs/arcana-3d-modeling/scripts/build_theme_map.py (Blender 5.2.3). Textures: CC0 1.0, Poly Haven - ../textures/credits.json',
    'variants': [],
}
for vid, (tag, stage) in VARIANTS.items():
    glb = os.path.join(src, f'{tag}-rt.glb')
    if not os.path.exists(glb):
        print('missing', glb); continue
    info = json.load(open(os.path.join(src, f'{tag}.json')))
    h = json.load(open(os.path.join(src, f'{tag}-height.json')))
    slots = [s for s in grab('SNOW_SLOTS' if stage >= 5 else 'SLOTS') if s['unlock'] <= stage]
    h['pads'] = [{'id': s['id'], 'x': s['x'], 'y': s['y'], 'terrain': s['terrain'],
                  'top': round(sample(h, s['x'], s['y']) + (15 if s['terrain'] == 'high' else 4.5) + 2.0, 1)} for s in slots]
    h['bridges'] = [] if stage >= 5 else [{'y': y, 'x0': 630, 'x1': 762, 'half_depth': 25, 'base': 6.4, 'rise': 5.5, 'deck': 'base + rise * sin(pi * (x - x0) / (x1 - x0))'}
                                          for y in ([430, 235] if stage == 4 else [430])]
    json.dump(h, open(os.path.join(out, f'battlefield-{vid}.height.json'), 'w'), separators=(',', ':'))
    shutil.copyfile(glb, os.path.join(out, f'battlefield-{vid}.glb'))
    entry = {'id': vid, 'stages': STAGES[vid], 'glb': f'battlefield-{vid}.glb', 'height': f'battlefield-{vid}.height.json'}
    blend = os.path.join(src, f'{tag}-rt.blend')
    if os.path.exists(blend):
        shutil.copyfile(blend, os.path.join(out, f'battlefield-{vid}.blend')); entry['blend'] = f'battlefield-{vid}.blend'; entry['blend_bytes'] = os.path.getsize(blend)
    data = open(glb, 'rb').read()
    entry.update({'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'stats': glb_stats(glb), 'ground_texture_px': info['rt']['ground_texture'],
                  'max_ground_height_px': h['max'], 'terrace_px': round(info['rt']['terrace'] * 100, 1),
                  'baked_scene': {k: info.get(k) for k in ('trees', 'rocks', 'tufts', 'flowers')}, 'source_triangles': info['stats']['triangles']})
    manifest['variants'].append(entry)
    print(vid, len(data), entry['stats']['triangles'])
json.dump(manifest, open(os.path.join(out, 'battlefield-manifest.json'), 'w'), indent=1, ensure_ascii=False)
