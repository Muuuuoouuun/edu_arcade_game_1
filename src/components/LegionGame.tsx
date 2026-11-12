import { useCallback, useEffect, useRef, useState } from 'react';
import { createLegion, actLegion, stepLegion, deploymentIssue } from '../games/legion/engine';
import { POPULATION_CAP, UNIT_DEFS, WAVE_COUNT, WAVE_TOTALS } from '../games/legion/data';
import type { LegionAction, LegionState, Point, UnitKind } from '../games/legion/types';
import { DefenseSprite } from './DefenseBoard';
import { spriteAsset } from '../games/defense/art';
import { legionShieldAsset } from '../games/legion/shieldMotion';
import LegionBoard from './LegionBoard';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { NATIVE_BACKGROUND } from '../lib/nativeEvents';
import { playCombatSound, playSound, unlockAudio } from '../lib/sound';
import '../legion.css';

const ORDER:UnitKind[] = ['shield','archer','mage','beast'];
const BEST_KEY = 'arcana.legion.best.v1';
function readBest() { try { const n=Number(localStorage.getItem(BEST_KEY)); return Number.isFinite(n)?Math.max(0,Math.min(100000,Math.trunc(n))):0; } catch { return 0; } }
const phaseNames = {prep:'배치 준비',wave:'자동 전투',intermission:'다음 습격 준비',won:'방어 성공',lost:'방어선 붕괴'};
const anchorPoints: {name:string;point:Point}[] = [
  {name:'상단 전열',point:{x:970,y:300}}, {name:'중앙 전열',point:{x:970,y:450}}, {name:'하단 전열',point:{x:970,y:610}},
  {name:'상단 후열',point:{x:1210,y:300}}, {name:'중앙 후열',point:{x:1210,y:450}}, {name:'하단 후열',point:{x:1210,y:610}},
];

/** Separate army simulation: never grants classic stage rewards or changes its campaign. */
export default function LegionGame({blocked,onExit,sound}:{blocked:boolean;onExit:()=>void;sound:boolean}) {
  const [state,setState]=useState(createLegion), stateRef=useRef(state);
  const [selected,setSelected]=useState<UnitKind>('shield');
  const [inspected,setInspected]=useState<number|null>(null);
  const [pauseReason,setPauseReason]=useState<'manual'|'system'|null>(null);
  const pauseRef=useRef(pauseReason), blockedRef=useRef(blocked), soundRef=useRef(sound);
  blockedRef.current=blocked; soundRef.current=sound;
  const [speed,setSpeed]=useState<1|2>(1),speedRef=useRef(speed);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [help,setHelp]=useState(false),helpRef=useRef(false);
  const [message,setMessage]=useState('병종을 고르고 청록색 구역을 눌러 배치하세요.');
  const [best,setBest]=useState(readBest),[saveFailed,setSaveFailed]=useState(false);
  const recorded=useRef(false), resetClock=useRef(true);
  const publish=useCallback((next:LegionState)=>{stateRef.current=next;setState(next);},[]);
  const pause=useCallback((reason:'manual'|'system')=>{pauseRef.current=reason;setPauseReason(reason);resetClock.current=true;},[]);
  const canAct=()=>!blockedRef.current&&!pauseRef.current&&!helpRef.current&&!document.hidden;
  const dispatch=useCallback((action:LegionAction)=>{
    if(blockedRef.current||pauseRef.current||helpRef.current||document.hidden)return;
    const before=stateRef.current;
    if(action.type==='deploy'){const issue=deploymentIssue(before,action.kind,action.point);if(issue){setMessage(issue);return;}}
    const next=actLegion(before,action);
    publish(next);
    if(action.type==='deploy'){
      setMessage(next.units.length>before.units.length?`${UNIT_DEFS[action.kind].name} 소환 완료 · 이동과 공격은 자동입니다.`:next.notice||'이 위치에는 소환할 수 없어요.');
      if(next.units.length>before.units.length){unlockAudio();playSound('flip');}
    }
    if(action.type==='remove'){setInspected(null);setMessage('부대를 정비했어요. 다른 위치에 다시 소환할 수 있어요.');}
    if(action.type==='start'&&next.phase==='wave'){unlockAudio();playSound('start');setInspected(null);setMessage('전투 중에도 병종과 위치를 골라 추가 소환할 수 있어요.');}
  },[publish]);
  const place=(point:Point)=>dispatch({type:'deploy',kind:selected,point});
  const resume=()=>{if(blockedRef.current||document.hidden)return;pauseRef.current=null;setPauseReason(null);resetClock.current=true;};
  const reset=()=>{if(blockedRef.current)return;recorded.current=false;setSaveFailed(false);pauseRef.current=null;setPauseReason(null);helpRef.current=false;setHelp(false);resetClock.current=true;setInspected(null);publish(createLegion());setMessage('병종을 고르고 청록색 구역을 눌러 배치하세요.');};
  useEffect(()=>{ document.body.classList.add('legion-active'); return()=>document.body.classList.remove('legion-active'); },[]);
  useEffect(()=>{
    let frame=0,last=performance.now(),accumulator=0,lastPublish=last,lastSound=-Infinity;
    const tick=(now:number)=>{
      const s=stateRef.current;
      if(resetClock.current||blockedRef.current||pauseRef.current||helpRef.current||document.hidden||(s.phase!=='wave'&&s.effects.length===0)){
        accumulator=0;last=now;resetClock.current=false;
      }else{
        accumulator+=Math.min(.1,(now-last)/1000)*speedRef.current;last=now;
        let next=s;
        while(accumulator>=1/30){next=stepLegion(next,1/30);accumulator-=1/30;}
        stateRef.current=next;
        if(soundRef.current&&next.kills>s.kills&&now-lastSound>180){playCombatSound('impact',0);lastSound=now;}
        if(now-lastPublish>=1000/30||next.phase!==s.phase||(s.effects.length>0&&next.effects.length===0)){setState(next);lastPublish=now;}
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[]);
  useEffect(()=>{
    const interrupt=()=>{if(!['won','lost'].includes(stateRef.current.phase))pause('system');};
    const visibility=()=>{if(document.hidden)interrupt();};
    const key=(event:KeyboardEvent)=>{if(event.code==='Escape'&&!event.defaultPrevented){event.preventDefault();if(!blockedRef.current)pause('manual');}};
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const changeMotion=()=>setReduced(motion.matches);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',interrupt);
    window.addEventListener(NATIVE_BACKGROUND,interrupt);window.addEventListener('orientationchange',interrupt);
    window.addEventListener('keydown',key);motion.addEventListener('change',changeMotion);
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',interrupt);window.removeEventListener(NATIVE_BACKGROUND,interrupt);window.removeEventListener('orientationchange',interrupt);window.removeEventListener('keydown',key);motion.removeEventListener('change',changeMotion);};
  },[pause]);
  useEffect(()=>{if(state.phase!=='prep')setMessage(state.notice);},[state.phase]);
  useEffect(()=>{if(blocked)pause('system');},[blocked,pause]);
  useEffect(()=>{
    if(!['won','lost'].includes(state.phase)||recorded.current)return;
    recorded.current=true;
    const score=Math.max(readBest(),state.kills);setBest(score);
    try{localStorage.setItem(BEST_KEY,String(score));}catch{setSaveFailed(true);}
    playSound(state.phase==='won'?'finish':'wrong');
  },[state.phase,state.kills]);
  const terminal=state.phase==='won'||state.phase==='lost';
  const disabled=blocked||!!pauseReason||help||terminal;
  const population=state.units.length;
  const canStart=!disabled&&['prep','intermission'].includes(state.phase)&&population>0;
  const unit=state.units.find(u=>u.id===inspected);
  const selectedDef=UNIT_DEFS[selected];
  return <main id="main" className="legion-game" data-screen="legion" data-phase={state.phase} data-time={state.time.toFixed(2)} data-kills={state.kills} data-enemies={state.enemies.length}>
    <div className="legion-shell" inert={disabled||undefined}>
      <header className="legion-header">
        {state.phase!=='wave'?<button className="legion-home" onClick={()=>pause('manual')} aria-label="군단 방어 메뉴"><Icon name="back" size={18}/></button>:null}
        <div className="legion-title"><span>ARCANA · LEGION</span><h1>군단 방어 <small>{phaseNames[state.phase]}</small></h1></div>
        <div className="legion-resource" aria-label={`마을 체력 ${state.hp}`}><span>마을</span><strong>{state.hp}<i>/20</i></strong></div>
        <div className="legion-resource"><span>웨이브</span><strong>{state.wave}<i>/{WAVE_COUNT}</i></strong></div>
        <div className="legion-resource legion-coins"><span>소환 골드</span><strong>{state.coins}</strong></div>
        <button className="legion-speed" aria-label={`전투 속도 ${speed}배`} onClick={()=>{if(canAct()){const n=speedRef.current===1?2:1;speedRef.current=n;setSpeed(n);}}}>×{speed}</button>
        {state.phase!=='wave'?<button className="legion-help-head" aria-label="배치 도움말" onClick={()=>{if(canAct()){helpRef.current=true;setHelp(true);resetClock.current=true;}}}>?</button>:null}
        <button className="legion-pause" onClick={()=>pause('manual')} aria-label="군단 전투 일시정지">Ⅱ</button>
      </header>
      <section className="legion-battlefield" aria-label="군단 배치와 자동 전투">
        <LegionBoard state={state} selected={selected} onPlace={place} onInspect={id=>{if(canAct()&&stateRef.current.phase!=='wave')setInspected(id);}} disabled={disabled} reducedMotion={reduced}/>
        <div className="legion-field-top"><span>이동 · 공격 · 스킬 자동</span><span>전장 적 <b>{state.enemies.length}</b> · 격퇴 <b>{state.kills}</b></span></div>
        {state.phase==='prep'?<div className="legion-deploy-hint">병종 선택 → 청록색 구역에 배치</div>:null}
        {state.phase==='wave'?<div className="legion-wave-progress" aria-label={`출현 ${state.spawned}/${WAVE_TOTALS[state.wave-1]}`}><span>습격 {state.spawned}/{WAVE_TOTALS[state.wave-1]}</span><progress max={WAVE_TOTALS[state.wave-1]} value={state.spawned}/></div>:null}
        {unit&&state.phase!=='wave'?<div className="legion-unit-panel"><strong>{UNIT_DEFS[unit.kind].name}</strong><span>체력 {Math.ceil(unit.hp)}/{unit.maxHp}</span><button onClick={()=>dispatch({type:'remove',id:unit.id})}>회수 +{Math.floor(UNIT_DEFS[unit.kind].cost/UNIT_DEFS[unit.kind].count)} G</button><button onClick={()=>setInspected(null)} aria-label="부대 정보 닫기">×</button></div>:null}
      </section>
      <footer className="legion-command">
        <div className="legion-supply"><span>출전 병력</span><strong>{population}<i>/{POPULATION_CAP}</i></strong><small>최고 격퇴 {best}</small></div>
        <div className="legion-cards" role="group" aria-label="소환 병종 선택">{ORDER.map(kind=>{const d=UNIT_DEFS[kind],unavailable=state.coins<d.cost||population+d.count>POPULATION_CAP;return <button key={kind} className={`legion-card ${unavailable?'unavailable':''}`} aria-pressed={selected===kind} onClick={()=>{if(canAct()){setSelected(kind);setInspected(null);setMessage(`${d.name} ${d.count}명 · ${d.description}`);}}} aria-label={`${d.name} ${d.count}명, ${d.cost} 골드`}><LegionPortrait kind={kind} index={d.sprite}/><span><strong>{d.name}<small> ×{d.count}</small></strong><b>{d.cost} G</b></span></button>;})}</div>
        <div className="legion-primary-actions">{state.phase==='wave'?null:<button className="legion-start" disabled={!canStart} onClick={()=>dispatch({type:'start'})}>{state.phase==='intermission'?'다음 습격':'전투 시작'}<span>▶</span></button>}

        </div>
      </footer>
      <div className="legion-placement-strip"><div className="legion-placement-buttons" role="group" aria-label={`${selectedDef.name} 빠른 배치`}>{anchorPoints.map(a=><button key={a.name} disabled={state.coins<selectedDef.cost||population+selectedDef.count>POPULATION_CAP} onClick={()=>place(a.point)}>{a.name}</button>)}</div></div>
      <p className="legion-portrait-tip">가로로 돌리면 세 진입로와 전선을 더 넓게 볼 수 있어요.</p>
    </div>
    <p className="legion-live-status" role="status">{message}</p>
    {!blocked&&pauseReason&&!terminal?<Dialog title="군단 방어 일시정지" className="legion-dialog" onClose={resume}><p className="legion-eyebrow">LEGION DEFENSE</p><h2>{pauseReason==='system'?'잠시 전투를 멈췄어요':'수비대 작전실'}</h2><p>소환·이동·공격이 모두 멈췄어요.</p><button onClick={resume}>계속하기</button><button onClick={reset}>처음부터 다시 배치</button><button onClick={onExit}>마을로 돌아가기</button><small>진행 중인 군단 전투는 종료됩니다. 최고 격퇴 기록은 이 기기에 저장됩니다.</small></Dialog>:null}
    {!blocked&&help&&!pauseReason?<Dialog title="군단 배치 도움말" className="legion-dialog" onClose={()=>{helpRef.current=false;setHelp(false);resetClock.current=true;}}><p className="legion-eyebrow">배치하고, 함께 지켜라</p><h2>개별 조작 없는 군단 전투</h2><p>병종을 고른 뒤 청록색 구역에 소환하세요. 방패병은 바라보는 정면에서 받는 피해를 70% 막아요. 뒤에서 맞으면 막을 수 없으니 앞에 배치하고 후열을 지켜 주세요.</p><p>전투 중 이동·공격·스킬은 자동입니다. 추가 소환으로 전선을 보강하세요. 준비 중 부대를 누르면 회수할 수 있어요.</p><p>마을 체력이 0이 되거나 보스가 돌파하면 패배합니다. 네 번의 습격을 막아내세요.</p><button onClick={()=>{helpRef.current=false;setHelp(false);resetClock.current=true;}}>배치로 돌아가기</button></Dialog>:null}
    {!blocked&&terminal?<Dialog title={state.phase==='won'?'군단 방어 성공':'군단 방어 실패'} className="legion-dialog legion-result"><p className="legion-eyebrow">LEGION DEFENSE</p><h2>{state.phase==='won'?'군단이 마을을 지켰어요':'전선을 다시 세워요'}</h2><p>{state.notice}</p><div className="legion-result-stats"><span>격퇴<strong>{state.kills}</strong></span><span>마을 체력<strong>{state.hp}</strong></span><span>최고 기록<strong>{best}</strong></span></div>{saveFailed?<p role="status">기록을 저장하지 못했어요. 현재 결과는 확인할 수 있습니다.</p>:null}<button onClick={reset}>다른 조합으로 재도전</button><button onClick={onExit}>마을로 돌아가기</button></Dialog>:null}
  </main>;
}

function LegionPortrait({kind,index}:{kind:UnitKind;index:number}) {
  const art=kind==='shield'?legionShieldAsset():spriteAsset(index);
  const [failedSource,setFailedSource]=useState('');
  useEffect(()=>{if(!art)return;let active=true;const image=new Image();image.onload=()=>{if(active)setFailedSource('');};image.onerror=()=>{if(active)setFailedSource(art.src);};image.src=art.src;return()=>{active=false;};},[art?.src]);
  if(kind==='shield'&&failedSource!==art.src)return <DefenseSprite index={index} art={art}/>;
  if(kind!=='shield') return failedSource===art.src
    ? <svg className="def-sprite legion-portrait-fallback" viewBox="0 0 48 56" aria-hidden="true">{kind==='beast'?<><path d="M9 29 13 11l10 8 11-8 5 18-5 15-11 5-10-5z" fill="#7fa9a2" stroke="#d5eee1" strokeWidth="2"/><circle cx="18" cy="29" r="2" fill="#183a3b"/><circle cx="30" cy="29" r="2" fill="#183a3b"/><path d="M20 38h8" stroke="#183a3b" strokeWidth="3" strokeLinecap="round"/></>:<><circle cx="24" cy="28" r="19" fill="#315e60" stroke="#d5eee1" strokeWidth="2"/><text x="24" y="36" textAnchor="middle" fontSize="26" fill="#f1d58d">{kind==='archer'?'↗':'✦'}</text></>}</svg>
    : <DefenseSprite index={index} art={art}/>;
  return <svg className="def-sprite" viewBox="0 0 48 56" aria-hidden="true"><ellipse cx="24" cy="51" rx="18" ry="4" fill="#06252b"/><path d="M13 30h22v16H13z" fill="#367b8b"/><path d="M15 44h7v9h-9zm13 0h7l2 9h-9z" fill="#bfc7bd"/><rect x="13" y="12" width="23" height="20" rx="9" fill="#e6d0a3"/><path d="M11 22Q10 5 24 5t14 17H11" fill="#c4d3ce" stroke="#607c82" strokeWidth="2"/><path d="M21 5h6v17h-6z" fill="#f4c568"/><path d="M15 24h18v6H15z" fill="#253c42"/><path d="m26 31 15 2v12l-7 8-8-8z" fill="#2b8fa1" stroke="#efcd81" strokeWidth="2"/><path d="M33 35v10m-4-6h8" stroke="#f9da8e" strokeWidth="2"/><path d="M7 19v22" stroke="#dfeae6" strokeWidth="4"/><path d="M3 38h9" stroke="#e5bd68" strokeWidth="3"/></svg>;
}
