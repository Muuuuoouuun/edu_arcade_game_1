/** All durations are measured in simulation seconds, not wall clock. */
export const DASH_MOTION={duration:.2,distance:5,collisionSamples:20} as const;
export const DASH_VISUAL={duration:.36,segments:24,chips:6} as const;
export type DashTrace={from:{x:number;z:number};to:{x:number;z:number};at:number};
export type DashMotion=DashTrace&{progress:number;duration:number};
