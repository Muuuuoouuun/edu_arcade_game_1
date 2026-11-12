import{Matrix4,Vector3}from'three';import{heightAt,type Point}from'./engine.ts';
/** Local terrain tangent only; discontinuous ledges still require a projected decal. */
export function heroRingMatrix(p:Point,scale=1,lift=.07){const dx=(heightAt(p.x+.1,p.z)-heightAt(p.x-.1,p.z))/.2,dz=(heightAt(p.x,p.z+.1)-heightAt(p.x,p.z-.1))/.2,right=new Vector3(1,dx,0).multiplyScalar(scale),back=new Vector3(0,-dz,-1).multiplyScalar(scale),normal=new Vector3().crossVectors(right,back).normalize();return new Matrix4().makeBasis(right,back,normal).setPosition(p.x,heightAt(p.x,p.z)+lift,p.z);}
