// Requires FFmpeg with libwebp. Keeps the archived concept PNGs unchanged.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = 'public/defense/themes';
const sources = { verdant: 'verdant-citadel', steel: 'blue-steel-bastion', unryeong: 'unryeong-castle', twilight: 'twilight-castle' };
mkdirSync(path.join(root, directory), { recursive: true });
const files = [];
for (const [id, sourceName] of Object.entries(sources)) {
  const source = `art-source/defense/concepts/2026-10-29/castles/${sourceName}.png`;
  for (const [suffix, width, quality] of [['', 1200, 82], ['-small', 600, 78]]) {
    const file = `${id}${suffix}.webp`, destination = path.join(root, directory, file);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(root, source),
      '-vf', `scale=${width}:-1`, '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', destination]);
    files.push({ file, source, width, bytes: statSync(destination).size, sha256: createHash('sha256').update(readFileSync(destination)).digest('hex') });
  }
}
writeFileSync(path.join(root, directory, 'manifest.json'), JSON.stringify({
  purpose: 'Cosmetic campaign settlement illustrations; original concepts are preserved.',
  encoding: 'WebP, aspect-preserving resize only; no crop or retouch.', files,
}, null, 2) + '\n');
console.log(`Built ${files.length} theme images (${files.reduce((sum, file) => sum + file.bytes, 0).toLocaleString()} bytes).`);
