// Delivery copies of Blender renders. Requires FFmpeg with libwebp, as art:themes does.
// Keep the full 640px transparent canvas so SVG crop and ground-anchor coordinates match.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, 'public/defense/models');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = [];
for (const id of ['fire-tower', 'piercing-ballista', 'water-cannon']) {
  const source = path.join(directory, `${id}.png`);
  const header = readFileSync(source).subarray(0, 26);
  if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      header.readUInt32BE(16) !== 640 || header.readUInt32BE(20) !== 640 || header[25] !== 6) {
    throw new Error(`${id}: expected a 640×640 RGBA Blender render; update the sprite framing contract before changing it.`);
  }
  const destination = path.join(directory, `${id}-game.webp`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source,
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', destination]);
  const rgba = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', destination,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: 640 * 640 * 4 + 1024 });
  if (rgba.length !== 640 * 640 * 4) throw new Error(`${id}: invalid decoded game sprite.`);
  let left = 640, top = 640, right = 0, bottom = 0;
  for (let y = 0; y < 640; y++) for (let x = 0; x < 640; x++) {
    if (rgba[(y * 640 + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  // Matches BAKED_TOWERS in art.ts. Future modeling changes must fit this frame
  // or deliberately update the battle framing contract, rather than silently clip.
  if (right <= left || bottom <= top || left < 32 || top < 24 || right > 608 || bottom > 600) {
    throw new Error(`${id}: visible silhouette [${left}, ${top}, ${right}, ${bottom}] does not fit the battle crop.`);
  }
  files.push({ id, source: `${id}.png`, file: `${id}-game.webp`, width: 640, height: 640,
    alpha_bbox: [left, top, right, bottom], alpha_threshold: 8, battle_crop: [32, 24, 576, 576],
    source_bytes: statSync(source).size, bytes: statSync(destination).size,
    source_sha256: digest(source), sha256: digest(destination) });
}
writeFileSync(path.join(directory, 'game-sprites.json'), JSON.stringify({
  purpose: 'Battlefield delivery copies; the editable Blender source and full PNG/GLB assets are preserved.',
  encoding: 'WebP quality 88; original transparent canvas, no resize or crop.', files,
}, null, 2) + '\n');
console.log(`Built ${files.length} tower sprites: ${files.reduce((sum, file) => sum + file.bytes, 0).toLocaleString()} bytes.`);
