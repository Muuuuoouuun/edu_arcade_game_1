import{BoxGeometry,BufferGeometry,Float32BufferAttribute,Color,Mesh,MeshStandardMaterial,PlaneGeometry}from'three';
import{heightAt}from'./engine.ts';
/** Visual gorge remains inside the blocked river; the gameplay surface is unchanged. */
export const CROSSING={left:3,right:9,water:-2.6,bed:-4.5,deck:.36} as const;
/** Input retains the deck when the visual root is replaced by a loaded GLB. */
export function bridgePickSurface(){
 const mesh=new Mesh(new BoxGeometry(8,.4,5.6),new MeshStandardMaterial({color:'#9b7550',roughness:.85}));
 mesh.position.set(6,.16,0);mesh.castShadow=mesh.receiveShadow=true;
 // The GLB can arrive before the first render: the detached pick mesh must already be in world space.
 mesh.updateMatrixWorld(true);return mesh;
}
/** Visual support under the fallback's eastern forest, outside the playable map. */
export function forestFallbackVerge(){
 const geometry=new PlaneGeometry(14,64,1,64);geometry.rotateX(-Math.PI/2);geometry.translate(39,0,0);
 const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,heightAt(p.getX(i),p.getZ(i)));geometry.computeVertexNormals();
 const surface=new Mesh(geometry,new MeshStandardMaterial({color:'#739a66',roughness:1}));surface.receiveShadow=true;return surface;
}
export function riverBanks(){
 const positions:number[]=[],colors:number[]=[];
 for(const side of[-1,1]){const edge=side===1?CROSSING.left:CROSSING.right;
  for(let z=-32;z<32;z+=2){const vertices:number[][]=[];
   for(const zz of[z,z+2]){const ridge=.1*Math.sin(zz*.9);
    // heightAt includes the bridge deck, but the bank underneath stays on the natural slope.
    const ground=Math.max(0,Math.min(1,(-zz-2)/10))*4.6;
    for(const[offset,y]of[[0,ground],[.18+ridge,ground-.35],[.48+ridge,ground*.45-1.6],[.85,-3.5]])vertices.push([edge+side*offset,y,zz]);
   }
   for(let j=0;j<3;j++){const face=side===1?[j+4,j+5,j+1,j]:[j,j+1,j+5,j+4],c=new Color(['#a4a58b','#8a927a','#5c685b'][j]);
    for(const i of[face[0],face[1],face[2],face[0],face[2],face[3]]){positions.push(...vertices[i]);colors.push(c.r,c.g,c.b);}
   }
  }
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 const mesh=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true,roughness:.9}));mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
