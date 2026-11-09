import{BufferGeometry,Float32BufferAttribute,Color,Mesh,MeshStandardMaterial}from'three';
/** Visual gorge remains inside the blocked river; the gameplay surface is unchanged. */
export const CROSSING={left:3,right:9,water:-2.6,bed:-4.5,deck:.36} as const;
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
