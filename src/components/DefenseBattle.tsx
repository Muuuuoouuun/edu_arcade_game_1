import { useLayoutEffect, useRef, useState } from 'react';
import { DefenseBoard, DefenseSprite } from './DefenseBoard';
import { DefenseForecast } from './DefenseForecast';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { BRANCHES, HEROES, TOWERS, getSlots, getStage, stageLabel } from '../games/defense/data';
import { DIFFICULTIES } from '../games/defense/difficulty';
import { allowedBranches, upgradeCost } from '../games/defense/engine';
import type { TacticalAction } from '../games/defense/engine';
import { towerSpriteAsset } from '../games/defense/art';
import type { Campaign, DefenseState, Point, TowerKind } from '../games/defense/types';
import type { DefenseThemeId } from '../games/defense/themes';
import '../defense-mobile.css';

export type BattlePanel = { kind: 'build'; slot: number } | { kind: 'candidates'; slots: number[] } | { kind: 'recruit' | 'scout' | 'party' };
const terrainNames = { high: '고지대 · 사거리 증가', water: '물가 · 전기 연계', ice: '빙판 · 빠른 적 주의', plain: '평지' };

export function DefenseBattle({ state, campaign, themeId, aimingDash, selectedSlot, onPanel, onCandidates, onMove, onCancelAim, onDash, onSkill, onStart, onSpeed, onPause, storageFailed }: {
  themeId: DefenseThemeId;
  state: DefenseState; campaign: Campaign; aimingDash: boolean; selectedSlot: number | null; storageFailed: boolean;
  onPanel: (panel: BattlePanel) => void; onCandidates: (ids: number[]) => void; onMove: (point: Point) => void;
  onCancelAim: () => void; onDash: () => void; onSkill: () => void; onStart: () => void; onSpeed: () => void; onPause: () => void;
}) {
  const stage = getStage(state.stage), hero = HEROES[state.hero];
  const terminal = state.phase === 'won' || state.phase === 'lost';
  const canAct = !state.paused && !terminal && state.phase !== 'promotion';
  const skillReady = canAct && state.phase === 'wave' && state.skillCooldown === 0 && state.enemies.length > 0;
  const dashReady = canAct && state.phase === 'wave' && state.dashCooldown === 0;
  const mapSpace = useRef<HTMLDivElement>(null);
  const fontProbe = useRef<HTMLSpanElement>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [largeText, setLargeText] = useState(false);
  useLayoutEffect(() => {
    const element = mapSpace.current!;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      const next = Math.max(0, Math.min(width, height * 1.5));
      setMapWidth(old => Math.abs(old - next) > .5 ? next : old);
      setLargeText((fontProbe.current?.getBoundingClientRect().width ?? 16) >= 24);
    };
    const observer = new ResizeObserver(resize); observer.observe(element); if (fontProbe.current) observer.observe(fontProbe.current); resize();
    return () => observer.disconnect();
  }, []);
  const startLabel = state.phase === 'wave' ? `${state.wave}/4 진행` : state.phase === 'intermission' ? '다음 W' : '시작';

  return <main className={`battle-page battle-${stage.region} ${aimingDash ? 'battle-aiming' : ''} ${largeText ? 'battle-large-text' : ''}`} id="main" aria-label="아르카나 수비대 전투" data-phase={state.phase} data-paused={state.paused} data-aiming={aimingDash} data-dash-cooldown={state.dashCooldown.toFixed(2)} data-hero-x={state.heroPosition.x.toFixed(1)} data-hero-y={state.heroPosition.y.toFixed(1)}>
    <span className="battle-font-probe" ref={fontProbe} aria-hidden="true"/>
    <header className="battle-hud">
      <button className="battle-stage" onClick={() => onPanel({ kind: 'party' })} disabled={terminal || state.paused || state.phase === 'promotion'} aria-label="원정 정보와 전술 메뉴">{stageLabel(state.stage)}</button>
      <span className={`battle-health ${state.hp <= 5 ? 'danger' : ''}`} aria-label={`마을 체력 ${state.hp}`}><small>마을</small><Heart/><b>{state.hp}</b></span>
      {stage.expanded ? <span className={`battle-health ${state.outpostHp <= 4 ? 'danger' : ''}`} aria-label={`외곽 마을 체력 ${state.outpostHp}`}><small>외곽</small><Heart/><b>{state.outpostHp}</b></span> : null}
      <span className="battle-coins" aria-label={`전투 코인 ${state.coins}`}><Coin/><b>{state.coins}</b></span>
      <span className="battle-wave" aria-label={`웨이브 ${state.wave} / 4`}><small>웨이브</small><b>{state.wave}/4</b></span>
      <button className="battle-pause" onClick={onPause} disabled={terminal} aria-label="디펜스 일시정지"><Icon name="pause" size={20}/></button>
    </header>
    <div className="battle-body">
      <nav className="battle-utilities" aria-label="전투 준비 명령">
        <button className="battle-party" onClick={() => onPanel({ kind: 'party' })} disabled={!canAct}><DefenseSprite index={hero.sprite}/><span>전술</span></button>
        <button className="battle-recruit" onClick={() => onPanel({ kind: 'recruit' })} disabled={!canAct || campaign.visitors.length < 2}>용병</button>
        <button className="battle-scout" onClick={() => onPanel({ kind: 'scout' })} disabled={!canAct}>정찰</button>
        <button className="battle-speed" onClick={onSpeed} disabled={!canAct} aria-label={`전투 속도 ${state.speed}배`}>{state.speed}×</button>
        <button className="battle-start" onClick={onStart} disabled={!canAct || !['prep', 'intermission'].includes(state.phase)} aria-label={state.phase === 'intermission' ? '다음 웨이브 시작' : '웨이브 시작'}><Icon name="play" size={18}/><span>{startLabel}</span></button>
      </nav>
      <section className="battle-map-column" aria-label="방어 전장">
        <div className="battle-map-space" ref={mapSpace}>
          <div className="battle-map-size" style={{ width: mapWidth || '100%' }}>
            <DefenseBoard state={state} themeId={themeId} selectedSlot={selectedSlot} aimingDash={aimingDash} onSelect={slot => onPanel({ kind: 'build', slot })} onSelectCandidates={onCandidates} onCancelAim={onCancelAim} onMove={onMove}/>
          </div>
        </div>
        <div className={`battle-input-note ${aimingDash ? 'aiming' : ''}`} role="status">{aimingDash ? '전장을 탭하면 돌진 · 전투는 계속돼요' : state.paused ? '전술 선택 중 · 전투가 멈췄어요' : state.phase === 'prep' ? '건설 지점에 타워를 세우고 시작하세요' : '땅을 탭해 영웅 이동'}</div>
        <button className="battle-portrait-summary" onClick={() => onPanel({ kind: 'party' })} disabled={!canAct} aria-label="원정 정보와 전술 메뉴">
          <DefenseSprite index={hero.sprite}/><span><strong>{hero.name} <small>{DIFFICULTIES[state.difficulty].name}</small></strong><span>{stageLabel(state.stage)} · {stage.name}</span><small>{stage.expanded ? '두 마을을 함께 지켜 주세요' : '땅 탭 이동 · 공격은 자동'}</small></span><Icon name="back" size={18}/>
        </button>
        {storageFailed ? <p className="battle-save-warning" role="status">진행을 저장할 수 없어요. 창을 닫기 전 확인해 주세요.</p> : null}
      </section>
      <nav className="battle-commands" aria-label="영웅 액션">
        <button className="battle-skill" disabled={!skillReady} onClick={onSkill} aria-label="필살기 사용"><Icon name="star" size={25}/><span>필살기<small>{state.skillCooldown > 0 ? `${Math.ceil(state.skillCooldown)}초` : hero.skill}</small></span></button>
        <button className={`battle-dash ${aimingDash ? 'selected' : ''}`} disabled={!dashReady} onClick={onDash} aria-label={aimingDash ? '돌진 조준 취소' : '영웅 돌진 위치 선택'} aria-pressed={aimingDash}><DashIcon/><span>{aimingDash ? largeText ? '취소' : '돌진 취소' : '돌진'}<small>{state.dashCooldown > 0 ? `${Math.ceil(state.dashCooldown)}초` : aimingDash ? '한 번 더 눌러 취소' : '위치를 골라 질주'}</small></span></button>
      </nav>
    </div>
  </main>;
}

export function DefenseTacticalPanel({ panel, state, campaign, active, onClose, onPanel, onBuy }: {
  panel: BattlePanel; state: DefenseState; campaign: Campaign; active: boolean;
  onClose: () => void; onPanel: (panel: BattlePanel) => void; onBuy: (action: TacticalAction, confirmSell?: boolean) => void;
}) {
  const [confirmSell, setConfirmSell] = useState(false);
  const slot = panel.kind === 'build' ? getSlots(state.stage).find(item => item.id === panel.slot) : null;
  const tower = slot ? state.towers.find(item => item.slot === slot.id) : null;
  const stage = getStage(state.stage), hero = HEROES[state.hero];
  const title = panel.kind === 'build' ? `${panel.slot + 1}번 · ${tower ? TOWERS[tower.kind].name : '타워 건설'}` : panel.kind === 'candidates' ? '건설 지점 선택' : panel.kind === 'recruit' ? '용병 고용' : panel.kind === 'scout' ? '정찰' : '수비대 전술';
  const refund = tower ? Math.floor((TOWERS[tower.kind].cost + (tower.level >= 2 ? 80 : 0) + (tower.level >= 3 ? 120 : 0)) * .75) : 0;
  const costLabel = (cost: number) => state.coins < cost ? `${cost - state.coins} 부족` : `${cost} 코인`;
  return <Dialog title={title} className={`defense-tactical panel-${panel.kind} ${slot && slot.x > 450 ? 'tactical-left' : ''}`} onClose={onClose} active={active}>
    <header className="tactical-heading"><div><h2>{title}</h2><p>전술 정지 <span>· <Coin/> {state.coins}</span>{slot ? ` · ${terrainNames[slot.terrain]}` : ''}</p></div><button onClick={onClose} aria-label="전술 패널 닫기"><Icon name="close"/></button></header>
    <div className="tactical-content">
      {panel.kind === 'candidates' ? <div className="tactical-candidates">{panel.slots.map(id => { const location = getSlots(state.stage).find(s => s.id === id)!; const built = state.towers.find(t => t.slot === id); return <button key={id} onClick={() => onPanel({ kind: 'build', slot: id })}><strong>{id + 1}번 지점</strong><span>{terrainNames[location.terrain]} · {built ? TOWERS[built.kind].name : '빈 지점'}</span></button>; })}</div> : null}
      {panel.kind === 'build' && slot ? tower ? <>
        <div className="tactical-upgrades">{tower.level === 1 ? allowedBranches(tower.kind).map(branch => <button key={branch} disabled={state.coins < upgradeCost(tower)} onClick={() => onBuy({ type: 'upgrade', slot: tower.slot, branch })}><DefenseSprite index={TOWERS[tower.kind].sprite} art={towerSpriteAsset(tower.kind, branch, 2)}/><strong>{BRANCHES[branch].name}</strong><span>{BRANCHES[branch].description}</span><b>{costLabel(upgradeCost(tower))}</b></button>) : tower.level === 2 ? <button disabled={state.coins < upgradeCost(tower)} onClick={() => onBuy({ type: 'upgrade', slot: tower.slot })}><DefenseSprite index={TOWERS[tower.kind].sprite} art={towerSpriteAsset(tower.kind, tower.branch, 3)}/><strong>최종 강화 · Lv.3</strong><span>공격력과 사거리 강화</span><b>{costLabel(upgradeCost(tower))}</b></button> : <p className="tactical-maxed"><Icon name="star"/> 최종 강화 완료</p>}</div>
        {confirmSell ? <div className="tactical-sell-confirm"><span>{slot.id + 1}번 타워를 팔고 {refund}코인을 받을까요?</span><button onClick={() => onBuy({ type: 'sell', slot: slot.id }, true)}>판매 확정</button><button onClick={() => setConfirmSell(false)}>취소</button></div> : <button className="tactical-sell" onClick={() => setConfirmSell(true)}>타워 판매 · {refund}코인 반환</button>}
      </> : <div className="tactical-towers">{(['crossbow', 'magic', 'cannon'] as TowerKind[]).map(kind => <button key={kind} disabled={state.coins < TOWERS[kind].cost} onClick={() => onBuy({ type: 'build', slot: slot.id, kind })}><DefenseSprite index={TOWERS[kind].sprite}/><strong>{TOWERS[kind].name}</strong><span>{kind === 'crossbow' ? '빠른 단일 공격' : kind === 'magic' ? '속성 마법 공격' : '충격 범위 공격'}</span><b>{costLabel(TOWERS[kind].cost)}</b></button>)}</div> : null}
      {panel.kind === 'recruit' ? state.mercenary ? <div className="tactical-hired"><DefenseSprite index={HEROES[state.mercenary].sprite}/><strong>{HEROES[state.mercenary].name}</strong><p>이번 원정에 함께하고 있어요.</p></div> : <div className="tactical-recruits">{campaign.visitors.filter(id => id !== state.hero).map(id => <button key={id} disabled={state.coins < 120} onClick={() => onBuy({ type: 'hire', hero: id })}><DefenseSprite index={HEROES[id].sprite}/><span><strong>{HEROES[id].name}</strong><small>{HEROES[id].role}</small></span><b>{costLabel(120)}</b></button>)}{campaign.visitors.length < 2 ? <p>첫 마을을 지키면 새로운 동료가 찾아옵니다.</p> : null}</div> : null}
      {panel.kind === 'scout' ? <DefenseForecast stage={state.stage} wave={state.wave} phase={state.phase} difficulty={state.difficulty} spawned={state.spawned} alive={state.enemies.length} expanded/> : null}
      {panel.kind === 'party' ? <div className="tactical-party"><div className="tactical-hero"><DefenseSprite index={hero.sprite}/><div><h3>{hero.name}</h3><p>{hero.role}</p><small>{hero.description}</small></div></div><p>{stageLabel(state.stage)} {stage.name} · {DIFFICULTIES[state.difficulty].name}</p><div className="tactical-menu"><button onClick={() => onPanel({ kind: 'recruit' })}>용병 고용</button><button onClick={() => onPanel({ kind: 'scout' })}>적 편성 정찰</button></div><div className="tactical-quest"><strong>추가 퀘스트</strong><p>{stage.quest}</p><small>{campaign.questClaimed.includes(state.stage) ? '추가 보상 수령 완료' : `클리어 시 추가 ${stage.questReward} G`}</small></div><p className="tactical-help">공격은 자동 · 땅을 눌러 이동<br/>돌진: 위치 선택 · 필살기: 즉시 발동</p></div> : null}
    </div>
  </Dialog>;
}

function Coin() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f7c75b" stroke="#9a6523" strokeWidth="1.8"/><circle cx="12" cy="12" r="7" fill="none" stroke="#fff2aa" strokeWidth="1.4"/><path d="M12 7v10m-2-8 2-2" fill="none" stroke="#9a6523" strokeWidth="1.8"/></svg>; }
function Heart() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.4 12.5C-2 7 5.4-.3 12 6c6.6-6.3 14 1 8.6 6.5Z" fill="#f36e6b" stroke="#782f36" strokeWidth="1.2"/></svg>; }
function DashIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3h5l-1 7 5 5v4H8v-5l3-11Z" fill="currentColor" stroke="none"/><path d="M8 21h13M3 7h4M1 12h5M2 17h3"/></svg>; }
