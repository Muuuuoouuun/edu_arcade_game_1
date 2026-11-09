import { CHOICE_DISTANCE, LANES, LAP_LENGTH, RACE_LENGTH, currentLane, trackCurve } from './engine';
import type { RaceState } from './engine';

export type RaceAssets = { sprites: Map<string, HTMLCanvasElement>; valley: HTMLImageElement; mobileValley: HTMLImageElement };
export async function loadRaceAssets(): Promise<RaceAssets> {
  const load = async (src: string) => { const img = new Image(); img.src = src; await img.decode(); return img; };
  const [atlas, valley, mobileValley] = await Promise.all([load('/race/atlas.png'), load('/race/valley.png'), load('/race/valley-mobile.png')]);
  const sprites = new Map<string, HTMLCanvasElement>();
  // Cache atlas frames and rival palettes once, rather than filtering a large atlas every frame.
  for (const [cell, hues] of [[0, [0]], [1, [0, 74, 148]], [2, [0, 90, -55]], [3, [0]]] as const) {
    for (const hue of hues) {
      const sprite = document.createElement('canvas'); sprite.width = 384; sprite.height = 384;
      const context = sprite.getContext('2d')!;
      context.filter = hue ? `hue-rotate(${hue}deg)` : 'none';
      context.drawImage(atlas, cell % 2 * atlas.width / 2, Math.floor(cell / 2) * atlas.height / 2, atlas.width / 2, atlas.height / 2, 0, 0, 384, 384);
      sprites.set(`${cell}:${hue}`, sprite);
    }
  }
  return { sprites, valley, mobileValley };
}

type Point = { x: number; y: number; half: number; scale: number };
type Sprite = { z: number; lane: number; cell: number; size: number; hue?: number; label?: string; glow?: boolean };

export function drawRace(ctx: CanvasRenderingContext2D, width: number, height: number, s: RaceState, assets: RaceAssets, reducedMotion: boolean) {
  const horizon = height * 0.43;
  const unit = Math.max(150, Math.min(380, width * 0.30));
  const curve = trackCurve(s.distance);
  const project = (z: number): Point => {
    const scale = 160 / (160 + Math.max(0, z) + 90);
    const bend = (trackCurve(s.distance + z * 0.65) - curve) * width * 0.46 * (1 - scale);
    return { scale, x: width / 2 + bend - s.x * width * 0.20 * scale,
      y: horizon + (height - horizon + 45 - (width < 600 ? 90 : 0)) * scale,
      half: width * 0.72 * scale };
  };
  const polygon = (color: string | CanvasGradient, ...points: number[]) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath(); ctx.fill();
  };
  const band = (a: Point, b: Point, left: number, right: number, color: string) => polygon(color,
    a.x + a.half * left, a.y - 0.5, a.x + a.half * right, a.y - 0.5,
    b.x + b.half * right, b.y + 0.7, b.x + b.half * left, b.y + 0.7);
  const atlasSprite = (cell: number, x: number, bottom: number, size: number, hue = 0) => {
    ctx.drawImage(assets.sprites.get(`${cell}:${hue}`)!, x - size / 2, bottom - size, size, size);
  };

  ctx.clearRect(0, 0, width, height);
  const bgShift = -curve * width * 0.045 - s.x * width * 0.012;
  const scenery = width < 600 ? assets.mobileValley : assets.valley;
  const split = width < 600 ? 0.60 : 0.72;
  // Two depth layers from the generated panorama: sky/cliffs and nearby grass.
  ctx.drawImage(scenery, 0, 0, scenery.width, scenery.height * split,
    -width * 0.07 + bgShift, 0, width * 1.14, height * 0.56);
  ctx.drawImage(scenery, 0, scenery.height * split, scenery.width, scenery.height * (1 - split),
    -width * 0.07 + bgShift * 1.5, height * 0.56 - 1, width * 1.14, height * 0.44 + 1);

  // The moving road is projected geometry; sprite and world positions use the same projection.
  const road = Array.from({ length: 120 }, (_, i) => ({ z: 1904 - i * 16, p: project(1904 - i * 16) }));
  road.push({ z: -90, p: { ...project(0), y: height + 30, half: width } });
  const ribbon = (factor: number, color: string | CanvasGradient) => polygon(color,
    ...road.flatMap(({ p }) => [p.x - p.half * factor, p.y]),
    ...[...road].reverse().flatMap(({ p }) => [p.x + p.half * factor, p.y]));
  ribbon(1.12, '#d1bc8a'); ribbon(1.07, '#fff9eb');
  const asphalt = ctx.createLinearGradient(0, horizon, 0, height);
  asphalt.addColorStop(0, '#817b8d'); asphalt.addColorStop(1, '#655e70');
  ribbon(1, asphalt);
  for (let segment = 0; segment < road.length - 1; segment++) {
    const { z, p: far } = road[segment], near = road[segment + 1].p;
    const stripe = Math.floor((s.distance + z) / 65) % 2 === 0;
    band(far, near, -1.07, -1, stripe ? '#ffb16d' : '#fff9eb');
    band(far, near, 1, 1.07, stripe ? '#ffb16d' : '#fff9eb');
    band(far, near, -0.975, -0.963, '#e2dce1');
    band(far, near, 0.963, 0.975, '#e2dce1');
    if (stripe) for (const lane of [-1 / 3, 1 / 3]) band(far, near, lane - 0.007, lane + 0.007, '#eee8e9');
    // Subtle asphalt grain moves with the surface, not with the camera.
    const worldSegment = Math.floor((s.distance + z) / 16);
    for (let i = 0; i < 3; i++) {
      const side = Math.sin(worldSegment * 17.31 + i * 45.2) * 0.92;
      ctx.fillStyle = i % 2 ? '#ffffff0a' : '#201b3c0c';
      ctx.fillRect(near.x + near.half * side, near.y, Math.max(1, near.scale * 4), Math.max(1, (near.y - far.y) * 0.7));
    }
  }

  const finishAt = Math.min(RACE_LENGTH, (Math.floor(s.distance / LAP_LENGTH) + 1) * LAP_LENGTH);
  const finishZ = finishAt - s.distance;
  if (finishZ < 900) {
    for (let row = 0; row < 2; row++) {
      const far = project(finishZ + 20 + row * 12), near = project(finishZ + row * 12);
      for (let col = 0; col < 12; col++) band(far, near, -1 + col / 6, -1 + (col + 1) / 6, (col + row) % 2 ? '#fff9f0' : '#302641');
    }
  }

  const sprites: Sprite[] = [];
  for (let i = 0; i < s.rivals.length; i++) {
    const r = s.rivals[i], z = r.distance - s.distance;
    if (z > -35 && z < 1400) sprites.push({ z, lane: r.x, cell: 1, size: 1, hue: i * 74, label: r.slow > 0 ? '찌릿!' : r.name });
  }
  for (const cone of s.obstacles) {
    const z = cone.at - s.distance;
    if (z > -20 && z < 850) sprites.push({ z, lane: cone.x, cell: 3, size: 0.50 });
  }
  const gate = s.gates[s.gateIndex];
  if (gate && gate.at - s.distance <= CHOICE_DISTANCE && gate.at >= s.distance) {
    LANES.forEach((lane, i) => sprites.push({ z: gate.at - s.distance, lane, cell: 2, size: 0.77, hue: i === 1 ? 90 : i === 2 ? -55 : 0,
      label: String(i + 1), glow: currentLane(s.x) === i }));
  }
  sprites.sort((a, b) => b.z - a.z);
  for (const sprite of sprites) {
    const p = project(sprite.z), x = p.x + p.half * sprite.lane, size = unit * sprite.size * p.scale;
    const float = sprite.cell === 2 ? 16 * p.scale + (reducedMotion ? 0 : Math.sin(s.elapsed * 3) * 4 * p.scale) : 0;
    if (sprite.glow) {
      ctx.save(); ctx.shadowColor = '#ffe48c'; ctx.shadowBlur = 14; ctx.strokeStyle = '#ffefaa'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, p.y - float - size / 2, size * 0.51, size * 0.51, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    atlasSprite(sprite.cell, x, p.y - float, size, sprite.hue);
    if (sprite.label && p.scale > 0.17) {
      ctx.font = `700 ${Math.max(10, 19 * p.scale)}px Pretendard, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#35264c'; ctx.shadowBlur = 5;
      ctx.fillText(sprite.label, x, p.y - float - size * 0.9); ctx.shadowBlur = 0;
    }
  }

  const player = project(0), px = player.x + player.half * s.x;
  const playerSize = unit * player.scale;
  const bob = reducedMotion || s.phase !== 'racing' ? 0 : Math.sin(s.distance * 0.11) * Math.min(1.5, s.speed / 90);
  if (s.shield > 0) {
    ctx.save(); ctx.strokeStyle = '#a2ffff'; ctx.fillStyle = '#8ee4ff33'; ctx.lineWidth = 3;
    ctx.shadowColor = '#75eaff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.ellipse(px, player.y - playerSize * 0.48, playerSize * 0.62, playerSize * 0.60, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  if (!reducedMotion && (s.boost > 0 || s.driftCharge > 0.25)) {
    ctx.save(); ctx.strokeStyle = s.boost > 0 ? '#ffdb7c' : '#adf9ff'; ctx.lineWidth = s.boost > 0 ? 4 : 2;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? -1 : 1, offset = (s.elapsed * 75 + i * 13) % 48;
      ctx.beginPath(); ctx.moveTo(px + side * playerSize * 0.32, player.y - playerSize * 0.1 + offset * 0.4);
      ctx.lineTo(px + side * (playerSize * 0.32 + offset * 0.5), player.y + offset); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.save(); ctx.translate(px, player.y + bob); ctx.rotate(reducedMotion ? 0 : -s.steering * (s.wasDrifting ? 0.12 : 0.055));
  atlasSprite(0, 0, 0, playerSize); ctx.restore();

  // Contrast behind native controls; leaves the scene's sky and scenery untinted.
  const shade = ctx.createLinearGradient(0, height - 150, 0, height);
  shade.addColorStop(0, '#21182f00'); shade.addColorStop(1, '#21182f80');
  ctx.fillStyle = shade; ctx.fillRect(0, height - 150, width, 150);
}
