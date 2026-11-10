/** Simulation-time lifetime of the visual trace; dash movement remains instantaneous. */
export const DASH_VISUAL={duration:.36,segments:24,chips:6} as const;
export type DashTrace={from:{x:number;z:number};to:{x:number;z:number};at:number};
