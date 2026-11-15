import { getPaths, getSlots } from './games/defense/data';
import './camera-comparison.css';

type Box = [number,number,number,number];
type Sprite = {src:string;width:number;height:number;box:Box};
const images='/defense/camera-comparison/';
const angles=[30,35,45,60] as const;
const root=document.getElementById('comparison')!;
const description=document.getElementById('screen-description')!;
const originals={hero:{src:'/defense/atlas.png',width:1254,height:1254,box:[38,65,275,250] as Box},tower:{src:'/defense/tower-models.png',width:1254,height:1254,box:[446,412,365,422] as Box}};
const enemies={sprout:{src:'/defense/atlas.png',width:1254,height:1254,box:[40,690,245,210] as Box},wood:{src:'/defense/monster-models.png',width:1086,height:1448,box:[38,59,324,323] as Box}};
const village:Sprite={src:'/defense/atlas.png',width:1254,height:1254,box:[965,355,270,290]};
let terrain:'clear'|'existing'='clear',zoom=1;

function load(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(src));image.src=src;});}
function bounds(image:HTMLImageElement):Box{
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas unavailable');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left||bottom<top)throw new Error('Empty render');
 return [left,top,right-left+1,bottom-top+1];
}
function commonBox(boxes:Box[]):Box{
 const x=Math.max(0,Math.min(...boxes.map(b=>b[0]))-4),y=Math.max(0,Math.min(...boxes.map(b=>b[1]))-4);
 const r=Math.min(512,Math.max(...boxes.map(b=>b[0]+b[2]))+4),b=Math.min(512,Math.max(...boxes.map(b=>b[1]+b[3]))+4);
 return [x,y,r-x,b-y];
}
function road():string{
 const points=getPaths(1)[0];let d=`M${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length-1;i++){const a=points[i-1],p=points[i],b=points[i+1],r=18,al=Math.hypot(p.x-a.x,p.y-a.y),bl=Math.hypot(b.x-p.x,b.y-p.y);d+=`L${p.x-(p.x-a.x)/al*r} ${p.y-(p.y-a.y)/al*r}Q${p.x} ${p.y} ${p.x+(b.x-p.x)/bl*r} ${p.y+(b.y-p.y)/bl*r}`;}
 return d+`L${points.at(-1)!.x} ${points.at(-1)!.y}`;
}
function frame(sprite:Sprite,x:number,y:number,size:number):string{
 const [bx,by,bw,bh]=sprite.box,w=size*Math.min(1,bw/bh),h=size*Math.min(1,bh/bw);
 return `<g transform="translate(${x} ${y})"><ellipse rx="${size*.38}" ry="${size*.12}" fill="#132a22" opacity=".26"/><svg x="${-w/2}" y="${size*.1-h}" width="${w}" height="${h}" viewBox="${bx} ${by} ${bw} ${bh}" preserveAspectRatio="xMidYMax meet" overflow="hidden"><image href="${sprite.src}" width="${sprite.width}" height="${sprite.height}"/></svg></g>`;
}
function simplifiedTerrain():string{
 const clusters:[[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[58,55,1],[148,35,.9],[340,55,1.2],[530,50,1],[820,60,1],[55,475,1],[330,520,1.1],[835,540,1]];
 return `<rect width="900" height="600" fill="#a2cb72"/><path d="M0 75 Q180 45 305 88T610 70T900 90V0H0ZM0 500Q190 465 360 520T690 505T900 490V600H0Z" fill="#83b664" opacity=".6"/><path d="M695 -25 C681 110 723 185 707 296 S681 492 704 625" stroke="#77bfd1" stroke-width="92" fill="none"/><path d="M695 -25 C681 110 723 185 707 296 S681 492 704 625" stroke="#9adce1" stroke-opacity=".6" stroke-width="56" fill="none"/>${clusters.map(([x,y,s])=>`<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="3" cy="14" rx="46" ry="18" fill="#537f4e" opacity=".3"/><path d="M-8-5h16v26H-8z" fill="#755943"/><circle cx="-22" cy="0" r="24" fill="#527e4b"/><circle cx="19" cy="-4" r="27" fill="#5e8d50"/><circle cy="-16" r="28" fill="#6b9e58"/><circle cx="-8" cy="-22" r="12" fill="#83af68" opacity=".65"/></g>`).join('')}<g fill="#86b366" opacity=".7"><ellipse cx="420" cy="150" rx="50" ry="13"/><ellipse cx="110" cy="270" rx="42" ry="12"/><ellipse cx="630" cy="330" rx="46" ry="13"/><ellipse cx="385" cy="460" rx="56" ry="15"/></g><g fill="none" stroke="#6eaa5d" stroke-width="3" stroke-linecap="round" opacity=".65"><path d="m100 340-4-8m4 8 5-9M335 160l-4-8m4 8 5-9M565 250l-4-8m4 8 5-9M590 555l-4-8m4 8 5-9M810 210l-4-8m4 8 5-9"/></g>`;
}
function board(hero:Sprite,tower:Sprite,label:string):string{
 const d=road(),w=900/zoom,h=600/zoom,x=(900-w)/2,y=(600-h)/2;
 const bg=terrain==='clear'?simplifiedTerrain():`<image href="/defense/forest.png" width="900" height="600" preserveAspectRatio="xMidYMid slice"/>`;
 const bridge=terrain==='clear'?`<g><rect x="630" y="396" width="160" height="69" rx="8" fill="#825d3d"/><rect x="635" y="404" width="150" height="52" rx="4" fill="#c3955e"/><path d="M635 414h150M635 438h150" stroke="#967046" stroke-width="4"/></g>`:`<image href="/defense/bridge.png" x="620" y="378" width="180" height="103" preserveAspectRatio="none"/>`;
 const slots=getSlots(1).filter(slot=>slot.unlock<=1&&slot.id!==3).map(slot=>`<ellipse cx="${slot.x}" cy="${slot.y}" rx="25" ry="9" fill="#e6efb7" fill-opacity=".38" stroke="#527c51" stroke-width="3" stroke-dasharray="5 4"/>`).join('');
 const bars=`<g><rect x="265" y="211" width="44" height="6" rx="3" fill="#572d22"/><rect x="265" y="211" width="38" height="6" rx="3" fill="#e58a69"/><rect x="338" y="211" width="44" height="6" rx="3" fill="#572d22"/><rect x="338" y="211" width="30" height="6" rx="3" fill="#e58a69"/></g>`;
 return `<div class="board-wrap"><svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${label}의 이안과 화염탑, 적을 숲 전장에 배치한 모의 화면">${bg}<path d="${d}" fill="none" stroke="#8d784c" stroke-opacity=".7" stroke-width="52" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${terrain==='clear'?'#e2c88f':'#d3b681'}" stroke-width="45" stroke-linejoin="round"/>${bridge}${slots}${frame(village,850,318,125)}<ellipse cx="405" cy="356" rx="30" ry="12" fill="#b5eecc" fill-opacity=".35" stroke="#e3fff0" stroke-width="3"/>${frame(enemies.sprout,235,285,54)}${frame(enemies.wood,286,285,68)}${frame(enemies.wood,359,285,68)}${bars}${frame(tower,500,347,100)}${frame(hero,405,355,84)}<path d="M398 318Q383 305 372 292" stroke="#ffcb70" stroke-width="3" stroke-linecap="round" opacity=".7" fill="none"/><circle cx="372" cy="292" r="7" fill="#ffb85f"/><circle cx="372" cy="292" r="3" fill="#fff2be"/></svg></div>`;
}
function enlarged(sprite:Sprite,label:string):string{return `<div class="model-cell"><svg viewBox="${sprite.box.join(' ')}" role="img" aria-label="${label} 확대 렌더"><image href="${sprite.src}" width="${sprite.width}" height="${sprite.height}"/></svg><small>${label}</small></div>`;}
async function init(){
 const names=['ian-proxy','fire-tower'];const loaded=await Promise.all(names.flatMap(name=>angles.map(angle=>load(`${images}${name}-${angle}.png`))));
 const heroBox=commonBox(loaded.slice(0,angles.length).map(bounds)),towerBox=commonBox(loaded.slice(angles.length).map(bounds));
 const notes:Record<number,string>={30:'얼굴과 옆면이 더 보이지만 위쪽 면은 상대적으로 적게 보입니다.',35:'얼굴과 타워 윗면을 함께 볼 수 있는 중간 지점입니다.',45:'타워 윗면은 잘 보이지만 임시 이안의 얼굴이 모자에 더 가려집니다.',60:'위에서 더 많이 보이지만 임시 이안의 모자가 얼굴을 크게 가립니다.'};
 function render(){
 let html=`<article class="angle-card"><div class="card-heading"><h3>기존 2D 아트</h3><span>아틀라스</span></div><div class="card-body">${board(originals.hero,originals.tower,'기존 2D 아트')}<p class="board-caption">전장 크기 · 기존 아틀라스</p><div class="models reference">현재 전투 아트의 크기와 그림체를 확인하는 기준입니다.</div><p class="card-note">기존 원화는 단일한 3D 카메라로 제작된 결과라고 가정하지 않습니다.</p></div></article>`;
 for(const angle of angles){const hero:Sprite={src:`${images}ian-proxy-${angle}.png`,width:512,height:512,box:heroBox},tower:Sprite={src:`${images}fire-tower-${angle}.png`,width:512,height:512,box:towerBox};html+=`<article class="angle-card"><div class="card-heading"><h3>${angle}°</h3><span>정사영 · 동일 배율</span></div><div class="card-body">${board(hero,tower,`${angle}도`)}<p class="board-caption">전장 크기 · 임시 이안 + 실제 3D 타워</p><div class="models">${enlarged(hero,'이안 임시 모델')}${enlarged(tower,'화염탑')}</div><p class="card-note">${notes[angle]}</p></div></article>`;}
 root.innerHTML=html;
 }
 document.querySelectorAll<HTMLInputElement>('input[name="terrain"]').forEach(input=>input.addEventListener('change',()=>{terrain=input.value==='clear'?'clear':'existing';render();}));
 document.querySelectorAll<HTMLInputElement>('input[name="zoom"]').forEach(input=>input.addEventListener('change',()=>{zoom=Number(input.value);document.getElementById('zoom-description')!.textContent=zoom===1?'전체 전장 표시 · 게임 엔진의 경로를 유지한 시안':'1.35배 확대 · 전장 가장자리가 잘립니다. 미니맵·이동은 이 시안에서 제공하지 않습니다.';render();}));
 render();
}
document.querySelectorAll<HTMLInputElement>('input[name="screen"]').forEach(input=>input.addEventListener('change',()=>{const screen=Number(input.value),width=screen-16;document.documentElement.style.setProperty('--board-width',`${width}px`);description.textContent=`${screen}px 화면 기준: 전장 폭 최대 ${width}px · 작은 창에서는 화면에 맞춰 축소`;}));
init().catch(()=>{root.innerHTML='<p role="alert">비교 이미지를 불러오지 못했습니다. 렌더 파일과 서버 상태를 확인해 주세요.</p>';});
