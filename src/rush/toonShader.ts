// Shader side of the toon look (look.ts `toon()`, `outlineMaterial()`): the three light bands, stepped cast shadows in the
// cool shade colour, the rim, the painted ground and the outline's minimum screen thickness. GLSL only; no scene objects.
import {
  Color, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderChunk, ShaderLib, SrcAlphaFactor, Vector2, Vector3, ZeroFactor, type Material,
} from 'three';

type Shader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/** Light colours shared by every toon material: one object per uniform, so a region change (frame.ts `FRAME_LOOK`)
 * sets `.value` once and every material follows. `shade` and `mid` multiply the key light in the two darker bands:
 * a cool blue-violet, never grey (key art: warm light, soft blue shadows). */
export const TOON_LIGHT = {
  shade: { value: new Color(0.36, 0.47, 0.86) },
  mid: { value: new Color(0.74, 0.79, 0.93) },
  rim: { value: new Color(1.0, 0.95, 0.84) },
  /** y: seconds (cloud shadows and water drift), z: cloud shadow depth (0-1). x is unused. */
  ground: { value: new Vector3(0, 0, 0) },
};
/** Toon bands by N·L, the steps of the old 105/185/255 gradient map: shade below -1/3, lit above 1/3. */
export const TOON_BANDS = { mid: -1 / 3, lit: 1 / 3 } as const;
const BAND = { mid: TOON_BANDS.mid.toFixed(4), lit: TOON_BANDS.lit.toFixed(4) };
/** The stock directional-shadow line this file swaps for a stepped one. If a three.js update rewords it, toon materials
 * keep the stock soft shadow, and `toonShaderHooks()` reports it (checked in quality.test.ts). */
const STOCK_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
const TOON_ANCHORS = ['#include <common>', '#include <lights_toon_pars_fragment>', '#include <shadowmap_pars_fragment>', '#include <lights_fragment_begin>', '#include <color_fragment>', '#include <opaque_fragment>'];
/** Whether the installed three.js still has every shader line the toon look patches. */
export function toonShaderHooks(): { anchors: boolean; shadow: boolean; outline: boolean } {
  const frag = ShaderLib.toon.fragmentShader;
  return {
    anchors: TOON_ANCHORS.every(a => frag.includes(a)) && ShaderLib.toon.vertexShader.includes('#include <project_vertex>'),
    shadow: ShaderChunk.lights_fragment_begin.includes(STOCK_SHADOW),
    outline: ShaderLib.basic.vertexShader.includes('#include <begin_vertex>') && ShaderLib.basic.fragmentShader.includes('#include <opaque_fragment>'),
  };
}

const TOON_PARS = /* glsl */`
varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
uniform vec3 rushShade;
uniform vec3 rushMid;
uniform vec3 rushRim;
uniform float rimStrength;
float rushShadow = 1.0;
float rushNdl = 1.0;
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	float ndl = dot( geometryNormal, directLight.direction );
	// Three flat bands. High tier: anti-aliased edges (the old nearest-filtered gradient map stair-stepped on round
	// bodies). Low tier: the same hard steps as that map, at the same cost.
	#ifdef RUSH_DETAIL
		float aa = fwidth( ndl ) * 0.75 + 0.0008;
		float mid = smoothstep( ${BAND.mid} - aa, ${BAND.mid} + aa, ndl );
		float lit = smoothstep( ${BAND.lit} - aa, ${BAND.lit} + aa, ndl );
	#else
		float mid = step( ${BAND.mid}, ndl );
		float lit = step( ${BAND.lit}, ndl );
	#endif
	// A cast shadow drops a surface that faces the light to the shade band: one clean step in the same cool colour as
	// the unlit side, not a grey multiply. Surfaces turned away from the light keep their N·L band (no acne there).
	#ifdef USE_SHADOWMAP
		mid *= mix( 1.0, rushShadow, smoothstep( 0.0, 0.1, ndl ) );
	#endif
	vec3 band = mix( rushShade, mix( rushMid, vec3( 1.0 ), lit ), mid );
	rushNdl = ndl;
	reflectedLight.directDiffuse += band * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon
`;
/** Four hardware-filtered taps on a fixed rotated square (no per-pixel noise), then a narrow threshold: a crisp edge
 * about one screen pixel soft. three's own lookup rotates its taps with screen noise, which a threshold turns to grit. */
const TOON_SHADOW = /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
float rushCastShadow( sampler2DShadow map, vec2 size, float bias, vec4 coord ) {
	coord.xyz /= coord.w;
	coord.z += bias;
	if ( coord.x <= 0.0 || coord.x >= 1.0 || coord.y <= 0.0 || coord.y >= 1.0 || coord.z >= 1.0 ) return 1.0;
	vec2 t = 0.8 / size;
	float s = texture( map, vec3( coord.xy + vec2( t.x, t.y * 0.4 ), coord.z ) ) + texture( map, vec3( coord.xy + vec2( - t.x * 0.4, t.y ), coord.z ) )
		+ texture( map, vec3( coord.xy + vec2( - t.x, - t.y * 0.4 ), coord.z ) ) + texture( map, vec3( coord.xy + vec2( t.x * 0.4, - t.y ), coord.z ) );
	return smoothstep( 0.38, 0.62, s * 0.25 );
}
#endif
`;
const TOON_SHADOW_CALL = /* glsl */`
		#if defined( SHADOWMAP_TYPE_PCF )
		rushShadow = ( directLight.visible && receiveShadow ) ? rushCastShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, vDirectionalShadowCoord[ i ] ) : 1.0;
		#else
		${STOCK_SHADOW}
		#endif
`;
/** Rim: a warm kicker toward the light, about half as strong on the unlit side so the cool shade keeps its colour. */
const TOON_RIM = /* glsl */`
float rimF = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
outgoingLight += rushRim * rimStrength * pow( rimF, 2.6 ) * ( 0.55 + 0.45 * smoothstep( -0.35, 0.35, rushNdl ) );
`;
/** Painted ground (flat scenery only): the base colour comes from the mesh (vertex colours, per region); this adds
 * flat-toned blotches with a crisp edge, a faint 2 m tile checker for scale, sparse tufts or pebbles one tone lighter,
 * and slow cloud shadows. All multiplicative and small, so the ground stays calmer than anything standing on it. */
const GROUND_PARS = /* glsl */`
varying vec3 vRushWorld;
uniform vec3 rushGround;
float rushHash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
float rushNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( rushHash( i ), rushHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( rushHash( i + vec2( 0.0, 1.0 ) ), rushHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;
const GROUND_DETAIL = /* glsl */`
{
	vec2 gp = vRushWorld.xz;
	float px = length( fwidth( gp ) );
	// Blotches: two octaves of value noise cut into flat tones.
	float n = rushNoise( gp * 0.42 ) * 0.62 + rushNoise( gp * 1.13 + 17.0 ) * 0.38;
	float e = px * 0.6 + 0.004;
	float tone = smoothstep( 0.56 - e, 0.56 + e, n ) * 0.045 - ( 1.0 - smoothstep( 0.40 - e, 0.40 + e, n ) ) * 0.05;
	// Tiles: every other 2 m square a touch lighter.
	vec2 tile = floor( gp * 0.5 );
	tone += ( mod( tile.x + tile.y, 2.0 ) - 0.5 ) * 0.022;
	// Tufts and pebbles: one small mark in about a third of the half-metre cells.
	vec2 cell = floor( gp * 2.0 ), cf = fract( gp * 2.0 );
	float h = rushHash( cell );
	vec2 at = vec2( 0.25 + 0.5 * rushHash( cell + 7.1 ), 0.25 + 0.5 * rushHash( cell + 3.7 ) );
	vec2 dd = ( cf - at ) * vec2( 1.0, 2.2 - 1.2 * h );
	float mark = step( 0.66, h ) * ( 1.0 - smoothstep( 0.11 - px, 0.11 + px, length( dd ) ) );
	tone += mark * ( h > 0.86 ? -0.07 : 0.085 );
	diffuseColor.rgb *= 1.0 + tone;
	// Cloud shadows: wide soft patches that drift east, cool like every other shadow.
	float cloud = rushNoise( gp * 0.055 + vec2( rushGround.y * 0.016, rushGround.y * 0.006 ) ) * 0.7 + rushNoise( gp * 0.13 - vec2( rushGround.y * 0.011, 0.0 ) ) * 0.3;
	diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.80, 0.86, 0.97 ), rushGround.z * smoothstep( 0.52, 0.68, cloud ) );
}
`;

const toons = new Set<Material>();
let detail = false;
/** High-tier shader extras (anti-aliased bands, painted ground): compiled in or out, never branched on, so the low
 * tier's programs carry none of it. Every toon material is recompiled when the tier changes. */
export function setToonDetail(on: boolean): void {
  if (on === detail) return;
  detail = on;
  for (const m of toons) m.needsUpdate = true;
}
export const toonDetail = () => detail;
/** Track a toon material so a tier change can recompile it (dropped again when it is disposed). */
export function trackToon(m: Material): void { toons.add(m); m.addEventListener('dispose', () => toons.delete(m)); }

/** Patch a MeshToonMaterial program. `ground`: flat scenery that gets the painted detail on the high tier. */
export function patchToon(shader: Shader, rim: number, ground: boolean): void {
  const hooks = toonShaderHooks();
  if (!hooks.anchors) return;
  ground = ground && detail;
  shader.uniforms.rushShade = TOON_LIGHT.shade; shader.uniforms.rushMid = TOON_LIGHT.mid; shader.uniforms.rushRim = TOON_LIGHT.rim;
  shader.uniforms.rimStrength = { value: rim };
  let frag = shader.fragmentShader
    .replace('#include <lights_toon_pars_fragment>', TOON_PARS)
    .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + TOON_SHADOW)
    .replace('#include <opaque_fragment>', (rim > 0 ? TOON_RIM : '') + '#include <opaque_fragment>');
  if (detail) frag = '#define RUSH_DETAIL\n' + frag;
  if (hooks.shadow) frag = frag.replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin.replace(STOCK_SHADOW, TOON_SHADOW_CALL));
  if (ground) {
    shader.uniforms.rushGround = TOON_LIGHT.ground;
    frag = frag.replace('#include <common>', '#include <common>\n' + GROUND_PARS).replace('#include <color_fragment>', '#include <color_fragment>\n' + GROUND_DETAIL);
    shader.vertexShader = 'varying vec3 vRushWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvRushWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  }
  shader.fragmentShader = frag;
}

/** Viewport the outlines are drawn into: x = half the drawing-buffer height in pixels, y = thinnest allowed outline in
 * buffer pixels. The view sets x on resize and on a quality change. */
export const OUTLINE_VIEW = { value: new Vector2(360, 1.5) };
/** Inverted hull pushed out along the normal by `width` object units, but never thinner on screen than OUTLINE_VIEW.y
 * pixels: at low pixel ratios the thin hulls of bushes, walls and hero parts broke into dashes. */
export function patchOutline(shader: Shader, width: number): void {
  shader.uniforms.outlineWidth = { value: width };
  shader.uniforms.outlineView = OUTLINE_VIEW;
  shader.vertexShader = 'uniform float outlineWidth;\nuniform vec2 outlineView;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
	vec4 oPos = vec4( position, 1.0 );
	float oScale = length( modelMatrix[ 0 ].xyz );
	#ifdef USE_INSTANCING
		oPos = instanceMatrix * oPos;
		oScale *= length( instanceMatrix[ 0 ].xyz );
	#endif
	float oMin = outlineView.y * - ( modelViewMatrix * oPos ).z / ( projectionMatrix[ 1 ][ 1 ] * outlineView.x );
	vec3 transformed = vec3( position ) + normal * max( outlineWidth, oMin / max( oScale, 0.0001 ) );`);
}

const glowing = new Set<Material>();
/** 1 while the frame is drawn into the finishing pass's target, 0 while it goes straight to the canvas. */
const GLOW_MASK = { value: 0 };
const maskBlend = (m: Material, on: boolean) => { m.blendSrcAlpha = on ? ZeroFactor : OneFactor; };
/** Turn the glow mask on (frame drawn into the finishing pass's target) or off (straight to the canvas, whose alpha
 * must stay 1: three's canvas always has an alpha channel, and a lowered alpha would let the page show through). */
export function setGlowMask(on: boolean): void {
  if ((GLOW_MASK.value === 1) === on) return;
  GLOW_MASK.value = on ? 1 : 0;
  for (const m of glowing) if (m.transparent) maskBlend(m, on);
}
/** Mark an effect material (shots, status rings, shockwaves) as a glow source. The scene's alpha channel is the mask
 * the bloom pass reads (post.ts): everything writes alpha 1, a glow source lowers it by `amount`. With the mask off
 * (low tier) the material draws exactly as before. */
export function glow<T extends Material>(m: T, amount = 1): T {
  if (glowing.has(m)) return m;
  glowing.add(m);
  m.addEventListener('dispose', () => glowing.delete(m));
  if (m.transparent) {
    // Colour blends as usual. Alpha: with the mask on, the target's alpha is multiplied down by the fragment's opacity
    // (source factor zero); with it off this is ordinary blending (source factor one).
    m.blending = CustomBlending; m.blendSrc = SrcAlphaFactor; m.blendDst = OneMinusSrcAlphaFactor; m.blendDstAlpha = OneMinusSrcAlphaFactor;
    maskBlend(m, GLOW_MASK.value === 1);
  } else {
    const a = Math.max(0, Math.min(1, amount)).toFixed(3), prev = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer);
      shader.uniforms.rushGlowMask = GLOW_MASK;
      shader.fragmentShader = 'uniform float rushGlowMask;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>\ngl_FragColor.a = 1.0 - ${a} * rushGlowMask;`);
    };
    m.customProgramCacheKey = () => `${key}glow${a}`;
  }
  return m;
}
