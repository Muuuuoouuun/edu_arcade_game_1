#!/usr/bin/env python3
"""Build the rush-only subset of Bagel Fat One (cycle 24).

The full TTF in public/fonts/ is 1.5 MB because it carries every Hangul glyph. The rush screens only use the
characters that appear in their sources, so this keeps ASCII plus every non-ASCII character found in
src/rush/*.ts (tests excluded), rush.html and src/rush/rush.css, and writes a WOFF2 next to a list of the kept
characters. src/rush/font.test.ts fails when a source starts using a character that is not in the list:
rerun this script then.

Usage: python3 tools/rush-font-subset.py   (needs fontTools and brotli: pip install fonttools brotli)
"""
import glob, os, shutil
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_FONT = os.path.join(ROOT, 'public/fonts/BagelFatOne-Regular.ttf')
OUT_DIR = os.path.join(ROOT, 'src/rush/fonts')


def sources():
    files = [f for f in glob.glob(os.path.join(ROOT, 'src/rush/*.ts')) if not f.endswith('.test.ts')]
    return sorted(files) + [os.path.join(ROOT, 'rush.html'), os.path.join(ROOT, 'src/rush/rush.css')]


def used_chars():
    chars = {chr(c) for c in range(0x20, 0x7F)}
    for path in sources():
        with open(path, encoding='utf-8') as f:
            chars |= {ch for ch in f.read() if ord(ch) > 0x7E and not ch.isspace()}
    return chars


def main():
    chars = used_chars()
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(SRC_FONT, opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, 'bagel-rush.woff2')
    subset.save_font(font, out, opts)
    with open(os.path.join(OUT_DIR, 'bagel-rush.chars.txt'), 'w', encoding='utf-8') as f:
        f.write(''.join(sorted(chars)) + '\n')
    shutil.copyfile(os.path.join(ROOT, 'public/fonts/OFL-BagelFatOne.txt'), os.path.join(OUT_DIR, 'OFL-BagelFatOne.txt'))
    print(f'{len(chars)} characters, {os.path.getsize(out)} bytes -> {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    main()
