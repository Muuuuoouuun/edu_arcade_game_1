// Finishing pass (high tier only): the scene is drawn into one off-screen target and one full-screen pass puts it on
// the canvas with edge anti-aliasing (FXAA, when the target has no MSAA), a gentle colour grade, a vignette and the glow
// of effect materials. The glow is three quarter-size passes (1/16 of the pixels each) fed by a mask in the scene's
// alpha channel (toonShader.ts `glow()`), so only shots, status cues and shockwaves bloom, never snow or pale stone.
// The low tier never builds any of this: it draws straight to the canvas as before.
import {
  BufferAttribute, BufferGeometry, Mesh, OrthographicCamera, Scene, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, Vector4, WebGLRenderTarget,
  type Camera, type WebGLRenderer,
} from 'three';

/** Colour finish of one region (frame.ts `FRAME_LOOK`). */
export interface Grade {
  /** 1 = unchanged. */
  saturation: number;
  /** 0-1: blend toward an S-curve (in display space), which deepens shades and lifts lights without clipping. */
  contrast: number;
  /** Per-channel gain: above 1 on red warms the frame. */
  gain: readonly [number, number, number];
  /** Corner darkening, 0-1. */
  vignette: number;
  /** Strength of the effect glow. */
  bloom: number;
}

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

/** Glow source at quarter size: four bilinear taps cover a 4x4 block; alpha below 1 marks a glow source. */
const PREFILTER = /* glsl */`
  uniform sampler2D tScene; uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 src( vec2 o ) { vec4 c = texture2D( tScene, vUv + o * uTexel ); return c.rgb * ( 1.0 - c.a ); }
  void main() { gl_FragColor = vec4( ( src( vec2( -1.0, -1.0 ) ) + src( vec2( 1.0, -1.0 ) ) + src( vec2( -1.0, 1.0 ) ) + src( vec2( 1.0, 1.0 ) ) ) * 0.25, 1.0 ); }`;
/** Separable 9-tap gaussian as five bilinear taps. */
const BLUR = /* glsl */`
  uniform sampler2D tSource; uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D( tSource, vUv ).rgb * 0.2270270270;
    c += ( texture2D( tSource, vUv + uDir * 1.3846153846 ).rgb + texture2D( tSource, vUv - uDir * 1.3846153846 ).rgb ) * 0.3162162162;
    c += ( texture2D( tSource, vUv + uDir * 3.2307692308 ).rgb + texture2D( tSource, vUv - uDir * 3.2307692308 ).rgb ) * 0.0702702703;
    gl_FragColor = vec4( c, 1.0 );
  }`;
const FINAL = /* glsl */`
  uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uTexel;
  uniform vec3 uGain; uniform vec4 uGrade; // saturation, contrast, vignette, bloom
  varying vec2 vUv;
  const vec3 LUMA = vec3( 0.299, 0.587, 0.114 );
  float luma( vec3 c ) { return dot( sqrt( max( c, 0.0 ) ), LUMA ); }
  #ifdef FXAA
  // Compact FXAA: four diagonal neighbours find the edge direction, four more taps blend along it (nine in all, one
  // on flat colour, which is most of a toon frame).
  vec3 antialias() {
    vec3 m = texture2D( tScene, vUv ).rgb;
    vec3 nw = texture2D( tScene, vUv + vec2( -1.0, -1.0 ) * uTexel ).rgb, ne = texture2D( tScene, vUv + vec2( 1.0, -1.0 ) * uTexel ).rgb;
    vec3 sw = texture2D( tScene, vUv + vec2( -1.0, 1.0 ) * uTexel ).rgb, se = texture2D( tScene, vUv + vec2( 1.0, 1.0 ) * uTexel ).rgb;
    float lm = luma( m ), lnw = luma( nw ), lne = luma( ne ), lsw = luma( sw ), lse = luma( se );
    float lo = min( lm, min( min( lnw, lne ), min( lsw, lse ) ) ), hi = max( lm, max( max( lnw, lne ), max( lsw, lse ) ) );
    if ( hi - lo < max( 0.03, hi * 0.08 ) ) return m;
    vec2 dir = vec2( - ( ( lnw + lne ) - ( lsw + lse ) ), ( lnw + lsw ) - ( lne + lse ) );
    float reduce = max( ( lnw + lne + lsw + lse ) * 0.03125, 0.0078125 );
    dir = clamp( dir / ( min( abs( dir.x ), abs( dir.y ) ) + reduce ), -8.0, 8.0 ) * uTexel;
    vec3 a = 0.5 * ( texture2D( tScene, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tScene, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
    vec3 b = a * 0.5 + 0.25 * ( texture2D( tScene, vUv - dir * 0.5 ).rgb + texture2D( tScene, vUv + dir * 0.5 ).rgb );
    float lb = luma( b );
    return ( lb < lo || lb > hi ) ? a : b;
  }
  #endif
  void main() {
    #ifdef FXAA
      vec3 c = antialias();
    #else
      vec3 c = texture2D( tScene, vUv ).rgb;
    #endif
    #ifdef BLOOM
      c += texture2D( tBloom, vUv ).rgb * uGrade.w;
    #endif
    c = mix( vec3( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ), c, uGrade.x ) * uGain;
    // Contrast on display-referred values: an S-curve keeps black and white where they are.
    vec3 g = sqrt( clamp( c, 0.0, 1.0 ) );
    g = mix( g, g * g * ( 3.0 - 2.0 * g ), uGrade.y );
    c = g * g;
    // Vignette toward ink blue, not black.
    vec2 q = vUv * 2.0 - 1.0;
    c *= mix( vec3( 1.0 ), vec3( 0.50, 0.55, 0.74 ), uGrade.z * smoothstep( 0.75, 2.0, dot( q, q ) ) );
    gl_FragColor = vec4( c, 1.0 );
    #include <colorspace_fragment>
    // One step of screen noise hides banding in the vignette.
    gl_FragColor.rgb += ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5 ) / 255.0;
  }`;

const pass = (fragmentShader: string, uniforms: ShaderMaterial['uniforms']) => new ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

export class PostFX {
  private target: WebGLRenderTarget | null = null;
  private bloomA: WebGLRenderTarget | null = null;
  private bloomB: WebGLRenderTarget | null = null;
  private quadScene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private prefilter = pass(PREFILTER, { tScene: { value: null }, uTexel: { value: new Vector2() } });
  private blur = pass(BLUR, { tSource: { value: null }, uDir: { value: new Vector2() } });
  private final = pass(FINAL, { tScene: { value: null }, tBloom: { value: null }, uTexel: { value: new Vector2() }, uGain: { value: new Vector3(1, 1, 1) }, uGrade: { value: new Vector4(1, 0, 0, 0) } });
  private msaa = false;
  private bloom = true;
  /** Vignette multiplier: the model sheet turns it off. */
  vignette = 1;
  private grade: Grade = { saturation: 1, contrast: 0, gain: [1, 1, 1], vignette: 0, bloom: 0 };

  constructor() {
    // One triangle that covers the screen.
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new Mesh(geo, this.final);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get ready() { return !!this.target; }
  setGrade(g: Grade) { this.grade = g; }

  /** (Re)build the targets for a drawing-buffer size. `msaa`: multisample the scene target (pixel ratio below 2, where
   * the canvas itself used to be multisampled) and skip FXAA; otherwise FXAA does the edges. */
  setSize(width: number, height: number, msaa: boolean) {
    const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
    if (this.target && this.target.width === w && this.target.height === h && this.msaa === msaa) return;
    this.dispose();
    this.msaa = msaa;
    // 8-bit sRGB storage: the GPU encodes on write and decodes on read, so the passes work on linear values without
    // the banding of an 8-bit linear target or the cost of a float one.
    this.target = new WebGLRenderTarget(w, h, { samples: msaa ? 4 : 0, colorSpace: SRGBColorSpace });
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    this.bloomA = new WebGLRenderTarget(qw, qh, { depthBuffer: false, colorSpace: SRGBColorSpace });
    this.bloomB = new WebGLRenderTarget(qw, qh, { depthBuffer: false, colorSpace: SRGBColorSpace });
    (this.prefilter.uniforms.uTexel.value as Vector2).set(1 / w, 1 / h);
    (this.final.uniforms.uTexel.value as Vector2).set(1 / w, 1 / h);
    this.final.defines = { ...(msaa ? {} : { FXAA: 1 }), ...(this.bloom ? { BLOOM: 1 } : {}) };
    this.final.needsUpdate = true;
  }
  dispose() {
    this.target?.dispose(); this.bloomA?.dispose(); this.bloomB?.dispose();
    this.target = this.bloomA = this.bloomB = null;
  }

  private draw(renderer: WebGLRenderer, material: ShaderMaterial, to: WebGLRenderTarget | null) {
    this.quad.material = material;
    renderer.setRenderTarget(to);
    renderer.render(this.quadScene, this.camera);
  }
  /** `glow`: whether any glow source is on screen; without one the three quarter-size passes are skipped. */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, glow = true) {
    const target = this.target, a = this.bloomA, b = this.bloomB;
    if (!target || !a || !b) { renderer.render(scene, camera); return; }
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const g = this.grade, u = this.final.uniforms;
    const bloom = this.bloom && glow && g.bloom > 0;
    if (bloom) {
      this.prefilter.uniforms.tScene.value = target.texture;
      this.draw(renderer, this.prefilter, a);
      this.blur.uniforms.tSource.value = a.texture; (this.blur.uniforms.uDir.value as Vector2).set(1 / a.width, 0);
      this.draw(renderer, this.blur, b);
      this.blur.uniforms.tSource.value = b.texture; (this.blur.uniforms.uDir.value as Vector2).set(0, 1 / a.height);
      this.draw(renderer, this.blur, a);
    }
    u.tScene.value = target.texture; u.tBloom.value = a.texture;
    (u.uGain.value as Vector3).set(...g.gain);
    (u.uGrade.value as Vector4).set(g.saturation, g.contrast, g.vignette * this.vignette, bloom ? g.bloom : 0);
    this.draw(renderer, this.final, null);
  }
}
