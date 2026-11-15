// Types for three.js's bundled meshoptimizer simplifier (the copy under examples/jsm/libs ships without them).
// Only what render.ts uses (cycle 62: hero ink hulls).
declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    readonly supported: boolean;
    readonly ready: Promise<void>;
    /** Returns the new index buffer and the relative error reached. Stride is in floats. */
    simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number, flags?: string[]): [Uint32Array, number];
  };
}
