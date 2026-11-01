// Delivery copies of the painted pose atlases. Requires FFmpeg with libwebp.
// Source PNGs live in art-source/defense/atlases; the battle loads the WebP copies.
// Same pixel dimensions and lossless alpha, so every viewBox in art.ts stays valid.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = path.join(root, 'art-source/defense/atlases');
const outDir = path.join(root, 'public/defense');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const decode = file => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file,
  '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: 1 << 28 });
const files = [];
for (const id of ['monster-models', 'boss-models', 'tower-models', 'melee-motion', 'ranged-motion']) {
  const source = path.join(sourceDir, `${id}.png`), destination = path.join(outDir, `${id}.webp`);
  const header = readFileSync(source).subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source,
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '92', '-compression_level', '6', destination]);
  const before = decode(source), after = decode(destination);
  if (after.length !== width * height * 4 || before.length !== after.length) throw new Error(`${id}: size changed.`);
  let alphaDiff = 0, colorSum = 0, colorN = 0;
  for (let i = 0; i < after.length; i += 4) {
    alphaDiff = Math.max(alphaDiff, Math.abs(before[i + 3] - after[i + 3]));
    if (before[i + 3] > 8) for (let c = 0; c < 3; c++) { colorSum += Math.abs(before[i + c] - after[i + c]); colorN++; }
  }
  if (alphaDiff > 0) throw new Error(`${id}: alpha channel changed (${alphaDiff}).`);
  files.push({ id, file: `${id}.webp`, source: `art-source/defense/atlases/${id}.png`, width, height,
    source_bytes: statSync(source).size, bytes: statSync(destination).size,
    mean_abs_color_error_opaque: Number((colorSum / colorN).toFixed(3)), alpha_max_diff: alphaDiff,
    source_sha256: digest(source), sha256: digest(destination) });
}
writeFileSync(path.join(outDir, 'atlases.json'), JSON.stringify({
  purpose: 'Battlefield delivery copies of painted pose atlases; originals are preserved in art-source.',
  encoding: 'WebP quality 92 via libwebp; same dimensions, lossless alpha, no crop or resize.', files,
}, null, 2) + '\n');
console.log(`Built ${files.length} atlases: ${files.reduce((s, f) => s + f.source_bytes, 0).toLocaleString()} -> ${files.reduce((s, f) => s + f.bytes, 0).toLocaleString()} bytes.`);
