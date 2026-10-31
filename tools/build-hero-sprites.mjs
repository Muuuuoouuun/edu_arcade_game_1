// Bake delivery images from actual Blender pose renders; no game-time 3D renderer.
// Requires FFmpeg/libwebp, as the tower and castle-theme asset pipelines do.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = fileURLToPath(new URL('../public/defense/models/', import.meta.url));
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const modelPath = path.join(directory, 'dwarf-model.json');
const model = JSON.parse(readFileSync(modelPath, 'utf8'));
const poses = ['idle', 'windup', 'strike', 'recover'];
// Matches the campaign's common frame and groundY contract in art.ts.
// Alpha bounds alone cannot catch a camera shift between model iterations.
if (model.frame?.width !== 640 || model.frame?.height !== 640 ||
    !Array.isArray(model.frame?.ground) || model.frame.ground.length !== 2 ||
    !model.frame.ground.every((value, i) => Number.isFinite(value) && Math.abs(value - [320, 550][i]) < .05) ||
    model.nativeFacing !== 1) {
  throw new Error('Dwarf camera/facing contract changed: update the game mapping before exporting sprites.');
}
if (!poses.every(pose => model.poses?.some(frame => frame.name === pose && frame.file === `dwarf-${pose}.png`))) {
  throw new Error('Regenerate all four dwarf poses before exporting a complete game set.');
}
const files = [];
for (const pose of poses) {
  const id = `dwarf-${pose}`, source = path.join(directory, `${id}.png`);
  const header = readFileSync(source).subarray(0, 26);
  if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      header.readUInt32BE(16) !== 640 || header.readUInt32BE(20) !== 640 || header[25] !== 6) {
    throw new Error(`${id}: expected a 640×640 RGBA Blender render with the shared camera.`);
  }
  const destination = path.join(directory, `${id}-game.webp`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source,
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', destination]);
  const rgba = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', destination,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: 640 * 640 * 4 + 1024 });
  if (rgba.length !== 640 * 640 * 4) throw new Error(`${id}: invalid decoded sprite.`);
  let left = 640, top = 640, right = 0, bottom = 0;
  for (let y = 0; y < 640; y++) for (let x = 0; x < 640; x++) {
    if (rgba[(y * 640 + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  if (right <= left || bottom <= top || left < 8 || top < 8 || right > 632 || bottom > 632) {
    throw new Error(`${id}: silhouette [${left}, ${top}, ${right}, ${bottom}] needs camera padding.`);
  }
  files.push({ id, pose, source: `${id}.png`, file: `${id}-game.webp`, width: 640, height: 640,
    alpha_bbox: [left, top, right, bottom], alpha_threshold: 8, battle_crop: [0, 0, 640, 640],
    source_bytes: statSync(source).size, bytes: statSync(destination).size,
    source_sha256: digest(source), sha256: digest(destination) });
}
writeFileSync(path.join(directory, 'hero-sprites.json'), JSON.stringify({
  purpose: 'Four baked poses of the editable dwarf model; activate as one complete set in battle.',
  encoding: 'WebP quality 88; shared transparent 640px camera, no resize or individual pose cropping.',
  model_metadata_sha256: digest(modelPath), ground: model.frame.ground, nativeFacing: model.nativeFacing,
  files,
}, null, 2) + '\n');
console.log(`Built ${files.length} dwarf poses: ${files.reduce((sum, file) => sum + file.bytes, 0).toLocaleString()} bytes.`);
