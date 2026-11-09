import type { Object3D } from 'three';

// Workshop-only secondary motion. Mixer and idle never write the rig together.
export function createBronIdle(root:Object3D) {
 const names = ['body','head','guard-arm','hammer-arm'] as const;
 const nodes = names.map(name => root.getObjectByName(name));
 if(nodes.some(node => !node))return null;
 const rest = nodes.map(node => ({node:node!,y:node!.position.y,x:node!.rotation.x,z:node!.rotation.z}));
 const [body,head,guard,arm] = rest;
 let phase = 0, weight = 0;
 function restore() {
  for(const part of rest){part.node.position.y = part.y;part.node.rotation.x = part.x;part.node.rotation.z = part.z;}
  phase = 0; weight = 0;
 }
 return {
  restore,
  update(dt:number) {
   phase += dt; weight = Math.min(1,weight+dt/.4);
   const breath = Math.sin(phase*Math.PI*2*.21)*weight;
   const sway = Math.sin(phase*Math.PI*2*.12)*weight;
   body.node.position.y = body.y+breath*.011;
   body.node.rotation.z = body.z+sway*.012;
   head.node.rotation.x = head.x-breath*.012;
   guard.node.rotation.x = guard.x+breath*.022;
   arm.node.rotation.x = arm.x-breath*.016;
  },
 };
}
