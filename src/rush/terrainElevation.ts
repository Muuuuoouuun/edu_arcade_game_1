import { BufferGeometry, Color, Float32BufferAttribute, Ray, Vector3 } from 'three';
import { ARENA, LANES, TOWN } from './data.ts';

/** One connected walking surface. Simulation remains x/z; this is not a rigid-body or jumping system. */
export const APPROACH = { startZ: 1, endZ: 5, height: 1.2, baseY: -1.2 } as const;
export function heightAt(_x: number, z: number): number {
  return Math.max(0, Math.min(APPROACH.height, (z - APPROACH.startZ) * .3));
}
export function normalAt(_x: number, z: number, out = new Vector3()): Vector3 {
  return out.set(0, 1, z > APPROACH.startZ && z < APPROACH.endZ ? -.3 : 0).normalize();
}

/** Exact intersection with the same three planar sections used by the mesh, including boundary points. */
export function raycastTerrain(ray: Ray, out = new Vector3()): Vector3 | null {
  let nearest = Infinity;
  for (const [lo, hi, slope, intercept] of [
    [ARENA.minZ, APPROACH.startZ, 0, 0],
    [APPROACH.startZ, APPROACH.endZ, .3, -.3],
    [APPROACH.endZ, ARENA.maxZ, 0, APPROACH.height],
  ]) {
    const denom = ray.direction.y - slope * ray.direction.z;
    if (Math.abs(denom) < 1e-10) continue;
    const t = (slope * ray.origin.z + intercept - ray.origin.y) / denom;
    if (t < 0 || t >= nearest) continue;
    const x = ray.origin.x + ray.direction.x * t, z = ray.origin.z + ray.direction.z * t;
    if (x < ARENA.minX - 1e-7 || x > ARENA.maxX + 1e-7 || z < lo - 1e-7 || z > hi + 1e-7) continue;
    nearest = t;
  }
  return Number.isFinite(nearest) ? ray.at(nearest, out) : null;
}

function segmentDistance(x: number, z: number, a: {x:number;z:number}, b: {x:number;z:number}) {
  const dx=b.x-a.x, dz=b.z-a.z, t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}
/** Broad earthy bands, not a checkerboard: road and plaza still correspond to the actual lanes. */
export function groundColorAt(x: number, z: number): number {
  if (Math.hypot(x-TOWN.x,z-TOWN.z)<TOWN.radius+2.2) return 0xcfc19c;
  let distance=Infinity;
  for(const lane of LANES)for(let i=1;i<lane.length;i++)distance=Math.min(distance,segmentDistance(x,z,lane[i-1],lane[i]));
  if(distance<1.3)return 0xcdb383;
  if(distance<1.7)return 0xa99a69;
  return Math.sin(x*.37+z*.21)+Math.cos(z*.31-x*.15)>.3?0x779958:0x678b50;
}

/** Ground vertices are in world coordinates. No rotation or translation is needed. */
export function createGroundGeometry(): BufferGeometry {
  const positions:number[]=[], colors:number[]=[], uv:number[]=[], indices:number[]=[], color=new Color();
  const w=ARENA.maxX-ARENA.minX, d=ARENA.maxZ-ARENA.minZ;
  for(let iz=0;iz<=d;iz++)for(let ix=0;ix<=w;ix++) {
    const x=ARENA.minX+ix,z=ARENA.minZ+iz;
    positions.push(x,heightAt(x,z),z);color.setHex(groundColorAt(x,z));colors.push(color.r,color.g,color.b);uv.push(ix/w,1-iz/d);
  }
  for(let iz=0;iz<d;iz++)for(let ix=0;ix<w;ix++) {
    const a=iz*(w+1)+ix,b=a+1,c=a+w+1,e=c+1;indices.push(a,c,b,b,c,e);
  }
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

/** A non-walkable 1.1 m rim supports the hedge, then drops to a closed rock skirt. Collision stays at ARENA. */
export function createCliffGeometry(): BufferGeometry {
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],color=new Color();
  const edges:[number,number][]= [];
  for(let x=ARENA.minX;x<ARENA.maxX;x++)edges.push([x,ARENA.minZ]);
  for(let z=ARENA.minZ;z<ARENA.maxZ;z++)edges.push([ARENA.maxX,z]);
  for(let x=ARENA.maxX;x>ARENA.minX;x--)edges.push([x,ARENA.maxZ]);
  for(let z=ARENA.maxZ;z>ARENA.minZ;z--)edges.push([ARENA.minX,z]);
  for(let i=0;i<edges.length;i++) {
    const [x,z]=edges[i],[nx,nz]=edges[(i+1)%edges.length],a=positions.length/3;
    const ox=x===ARENA.minX?x-1.1:x===ARENA.maxX?x+1.1:x,oz=z===ARENA.minZ?z-1.1:z===ARENA.maxZ?z+1.1:z;
    const nox=nx===ARENA.minX?nx-1.1:nx===ARENA.maxX?nx+1.1:nx,noz=nz===ARENA.minZ?nz-1.1:nz===ARENA.maxZ?nz+1.1:nz;
    positions.push(ox,heightAt(x,z),oz,nox,heightAt(nx,nz),noz,nox,APPROACH.baseY,noz,ox,APPROACH.baseY,oz);
    color.setHex(i%3===0?0x7c8e7a:0x657d70);for(let j=0;j<2;j++)colors.push(color.r,color.g,color.b);
    color.setHex(0x405f59);for(let j=0;j<2;j++)colors.push(color.r,color.g,color.b);
    indices.push(a,a+1,a+2,a,a+2,a+3);
    const b=positions.length/3;
    positions.push(x,heightAt(x,z),z,nx,heightAt(nx,nz),nz,nox,heightAt(nx,nz),noz,ox,heightAt(x,z),oz);
    color.setHex(0x678b50);for(let j=0;j<4;j++)colors.push(color.r,color.g,color.b);
    indices.push(b,b+1,b+2,b,b+2,b+3);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
