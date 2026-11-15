/** Coordinates measured from frontier-ballista.glb, including its authored root scale. */
export const BALLISTA = {scale:.65, muzzleHeight:2.6208, muzzleReach:2.0072, release:.1, duration:.4, interval:.8, turnRate:5, boltSpeed:32, boltLifetime:2} as const;
export type Position3={x:number;y:number;z:number};
export function angleDelta(from:number,to:number){return Math.atan2(Math.sin(to-from),Math.cos(to-from));}
export function turnToward(from:number,to:number,amount:number){const d=angleDelta(from,to);return from+Math.sign(d)*Math.min(Math.abs(d),amount);}
export function ballistaMuzzle(x:number,z:number,ground:number,heading:number):Position3{return{x:x+Math.sin(heading)*BALLISTA.muzzleReach,y:ground+BALLISTA.muzzleHeight,z:z+Math.cos(heading)*BALLISTA.muzzleReach};}
