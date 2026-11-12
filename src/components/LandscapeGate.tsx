import {useEffect,useRef,useState} from 'react';
import './landscapeGate.css';
export function usePortrait(){
 const [portrait,setPortrait]=useState(()=>matchMedia('(orientation: portrait)').matches);
 useEffect(()=>{const query=matchMedia('(orientation: portrait)'),change=()=>setPortrait(query.matches);change();query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 return portrait;
}
export function LandscapeGate({active}:{active:boolean}){
 const title=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(!active)return;const previous=document.activeElement;title.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[active]);
 return active?<div className="landscape-gate" role="dialog" aria-modal="true" aria-labelledby="landscape-title" onKeyDown={e=>{if(e.key==='Tab'||e.key==='Escape'){e.preventDefault();e.stopPropagation();title.current?.focus();}}}><span aria-hidden="true">↻</span><h2 id="landscape-title" tabIndex={-1} ref={title}>가로로 돌려 주세요</h2><p>넓은 전장을 볼 수 있도록<br/>가로 화면에서 플레이해요.</p><small>전투는 멈춰 있어요. 회전 후 직접 재개할 수 있어요.</small></div>:null;
}
