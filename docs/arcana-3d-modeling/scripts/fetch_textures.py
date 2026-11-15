"""Download the CC0 texture set used by build_theme_map.py --tex (Poly Haven, CC0 1.0).

  python3 fetch_textures.py <cache_dir> [--credits ../textures/credits.json]

Only the colour (diff) and height (disp) maps are fetched: the maps use them as a *detail layer* over the
game palette (colour variation + bump), so the art direction stays the approved bright stylised look.
The images are not committed; credits.json records every asset, author and URL.
"""
import json, os, sys, urllib.request

SET = {
    # id: (resolution, role)
    'leafy_grass': ('2k', 'forest ground: grass'),
    'stone_pathway': ('2k', 'forest road: warm flagstones'),
    'rock_face_03': ('2k', 'rock faces, cliff stones, slopes'),
    'forest_ground_04': ('1k', 'forest floor outside the board'),
    'river_small_rocks': ('1k', 'river bed'),
    'mossy_rock': ('1k', 'moss tops of rocks (forest)'),
    'snow_02': ('2k', 'snow ground, snow caps'),
    'grey_stone_path': ('2k', 'snow road: cold cobbles'),
    'bark_brown_02': ('1k', 'tree trunks, palisade logs'),
    'pine_bark': ('1k', 'conifer trunks'),
    'weathered_brown_planks': ('1k', 'bridge, fences, crates, doors'),
    'white_sandstone_blocks_02': ('1k', 'gate walls and towers, build-pad rims'),
    'rock_tile_floor': ('1k', 'build-pad floor'),
    'roof_slates_02': ('1k', 'teal roof tiles (tinted)'),
}
MAPS = {'diff': 'Diffuse', 'disp': 'Displacement'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'arcana-modeling-fetch'}), timeout=60) as r:
        return r.read()


def main():
    out = sys.argv[1]
    credits_path = sys.argv[sys.argv.index('--credits') + 1] if '--credits' in sys.argv else None
    os.makedirs(out, exist_ok=True)
    credits = []
    for tid, (res, role) in SET.items():
        files = json.loads(get(f'https://api.polyhaven.com/files/{tid}'))
        info = json.loads(get(f'https://api.polyhaven.com/info/{tid}'))
        entry = {'id': tid, 'name': info.get('name'), 'role': role, 'resolution': res, 'authors': sorted(info.get('authors', {})),
                 'license': 'CC0 1.0 (Poly Haven)', 'page': f'https://polyhaven.com/a/{tid}', 'files': {}}
        for short, key in MAPS.items():
            f = files[key][res]['jpg'] if 'jpg' in files[key][res] else files[key][res]['png']
            ext = os.path.splitext(f['url'])[1]
            path = os.path.join(out, f'{tid}_{short}{ext}')
            if not os.path.exists(path) or os.path.getsize(path) != f['size']:
                open(path, 'wb').write(get(f['url']))
            entry['files'][short] = {'url': f['url'], 'md5': f['md5'], 'bytes': f['size']}
        credits.append(entry)
        print('ok', tid, res)
    if credits_path:
        os.makedirs(os.path.dirname(os.path.abspath(credits_path)), exist_ok=True)
        json.dump({'source': 'Poly Haven (https://polyhaven.com), all assets CC0 1.0', 'textures': credits}, open(credits_path, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
