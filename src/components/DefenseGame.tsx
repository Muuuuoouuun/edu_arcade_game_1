import { useCallback, useEffect, useRef, useState } from 'react';
import { DefenseSprite } from './DefenseBoard';
import DefenseCamp from './DefenseCamp';
import { DefenseBattle, DefenseTacticalPanel } from './DefenseBattle';
import type { BattlePanel } from './DefenseBattle';
import { addPauseReason, clearPauseReason, isPaused, openTacticalSession, commitTacticalAction } from '../games/defense/tactics';
import type { PauseReason, PauseReasons, TacticalSession } from '../games/defense/tactics';
import type { TacticalAction } from '../games/defense/engine';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { createDefense, actDefense, stepDefense, questSatisfied as isQuestSatisfied, allowedBranches, upgradeCost } from '../games/defense/engine';
import { STAGES, HEROES, TOWERS, BRANCHES, ENEMIES, getStage, getSlots, stageLabel, getRegion, STAGE_COUNT } from '../games/defense/data';
import { readCampaign, writeCampaign, stageUnlocked, completeRun, acknowledgeVisitor, trainCampaign, selectHero, selectDifficulty, trainingCost } from '../games/defense/campaign';
import { DIFFICULTIES } from '../games/defense/difficulty';
import type { Campaign, DefenseAction, DefenseState, HeroId, TowerKind } from '../games/defense/types';
import type { RoundRecord } from '../lib/storage';
import { playSound, playCombatSound, unlockAudio } from '../lib/sound';
import { preloadDefenseMotion, towerSpriteAsset } from '../games/defense/art';
import { availableTheme, readDefenseTheme, themeUnlocked, writeDefenseTheme } from '../games/defense/themes';
import type { DefenseThemeId } from '../games/defense/themes';
import '../defense.css';
import '../defense-combat.css';

type Reward = ReturnType<typeof completeRun>;
const towerOrder: TowerKind[] = ['crossbow', 'magic', 'cannon'];
const greeting: Record<HeroId, string> = {
  mage: '작은 마을부터 함께 지켜 봐요. 우리의 이야기는 이제 시작이에요.',
  elf: '마을을 지켰다는 이야기를 들었어요. 제 활도 수비대에 보태고 싶어요.',
  dwarf: '목숨을 구해 준 은혜는 갚아야지! 대장간을 열겠네. 장비는 내게 맡기게.',
  tao: '숲의 기운이 심상치 않군요. 강 건너 마을까지, 제 부적으로 돕겠습니다.',
  barbarian: '서리산맥까지 올라왔다고? 마음에 드는군! 내 전투 망치로 앞길을 열어 주지.',
  druid: '다친 숲의 친구들을 돌봐 주셨군요. 저와 달빛 늑대도 함께하겠어요.',
};
function freshRunId() { return crypto.randomUUID(); }
function latestStage(c: Campaign) { return Math.min(STAGE_COUNT, c.cleared.length + 1); }
function completedWaves(s: DefenseState) { return s.phase === 'won' ? 4 : ['intermission', 'promotion'].includes(s.phase) ? s.wave : Math.max(0, s.wave - 1); }
function combatFeedback(before: DefenseState, next: DefenseState) {
  if (before === next || next.paused) return;
  const fresh = next.effects.filter(effect => effect.id >= before.nextId);
  if (fresh.some(effect => effect.kind === 'dash')) { playCombatSound('slash', (next.heroPosition.x - 450) / 450); return; }
  const heavy = fresh.find(effect => effect.kind === 'skill' || effect.kind === 'interrupt' || effect.kind === 'freeze' || effect.kind === 'shockwave');
  if (heavy) {
    playCombatSound(heavy.kind === 'freeze' ? 'freeze' : heavy.kind === 'shockwave' ? 'impact' : 'skill', (heavy.to.x - 450) / 450);
    return;
  }
  const shell = next.projectiles.find(projectile => projectile.id >= before.nextId && projectile.kind === 'shell');
  if (shell) { playCombatSound('cannon', (shell.from.x - 450) / 450); return; }
  const strike = next.attacks.find(attack => attack.fired && (attack.kind === 'melee' || attack.kind === 'slam') && !before.attacks.find(old => old.id === attack.id)?.fired);
  if (strike) { playCombatSound(strike.element === 'impact' ? 'impact' : 'slash', (strike.to.x - 450) / 450); return; }
  const hit = fresh.find(effect => effect.kind === 'impact' || effect.kind === 'chain');
  if (hit) { playCombatSound(hit.element === 'impact' || hit.element === 'physical' ? 'impact' : 'cast', (hit.to.x - 450) / 450); return; }
  const shot = next.projectiles.find(projectile => projectile.id >= before.nextId);
  if (shot) playCombatSound(shot.kind === 'arrow' ? 'arrow' : 'cast', (shot.from.x - 450) / 450);
}

export default function DefenseGame({ blocked, onExit, onFinish, sound, onToggleSound }: { blocked: boolean; onExit: () => void; onFinish: (record: RoundRecord) => void; sound: boolean; onToggleSound: () => void }) {
  const [mode, setMode] = useState<'camp' | 'battle'>('camp');
  const modeRef = useRef<'camp' | 'battle'>('camp');
  const [campaign, setCampaign] = useState(readCampaign);
  const campaignRef = useRef(campaign);
  const [themePreference, setThemePreference] = useState(readDefenseTheme);
  const [themeStorageFailed, setThemeStorageFailed] = useState(false);
  const themeId = availableTheme(themePreference, campaign.cleared);
  const [state, setState] = useState(() => createDefense(latestStage(campaign), campaign.selectedHero, campaign.training, campaign.difficulty));
  const stateRef = useRef(state);
  const runId = useRef('');
  if (!runId.current) runId.current = freshRunId();
  const recordedRun = useRef('');
  const [reward, setReward] = useState<Reward | null>(null);
  const [arriving, setArriving] = useState<HeroId | null>(() => campaign.visitors.find(h => !campaign.seenVisitors.includes(h)) || null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [, setArtRevision] = useState(0);
  const [aimingDash, setAimingDash] = useState(false);
  const aimingRef = useRef(false);
  const [reasons, setReasons] = useState<PauseReasons>([]);
  const reasonsRef = useRef<PauseReasons>([]);
  type OpenPanel = { view: BattlePanel; session: TacticalSession };
  const [tactical, setTactical] = useState<OpenPanel | null>(null);
  const tacticalRef = useRef<OpenPanel | null>(null);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const chooseTheme = (id: DefenseThemeId) => {
    if (blockedRef.current || modeRef.current !== 'camp' || !themeUnlocked(id, campaignRef.current.cleared)) return;
    setThemePreference(id);
    setThemeStorageFailed(!writeDefenseTheme(id));
  };
  const publish = useCallback((next: DefenseState) => { stateRef.current = next; setState(next); }, []);
  const persist = useCallback((next: Campaign) => {
    campaignRef.current = next; setCampaign(next); setStorageFailed(!writeCampaign(next));
  }, []);
  const cancelAim = useCallback(() => { aimingRef.current = false; setAimingDash(false); }, []);
  const applyReasons = useCallback((next: PauseReasons, current = stateRef.current) => {
    reasonsRef.current = next; setReasons(next); publish({ ...current, paused: isPaused(next) });
  }, [publish]);
  const pause = useCallback((reason: PauseReason) => {
    if (modeRef.current !== 'battle' || ['won', 'lost'].includes(stateRef.current.phase)) return;
    cancelAim(); applyReasons(addPauseReason(reasonsRef.current, reason));
  }, [cancelAim, applyReasons]);
  const resume = useCallback((reason: 'manual' | 'system') => {
    if (blockedRef.current || document.hidden) return;
    applyReasons(clearPauseReason(reasonsRef.current, reason));
  }, [applyReasons]);
  const dispatch = useCallback((action: DefenseAction) => {
    if (modeRef.current !== 'battle' || blockedRef.current) return;
    if (action.type === 'pause') { pause('manual'); return; }
    if (action.type === 'resume') { resume('manual'); return; }
    const before = stateRef.current;
    if (action.type === 'hire' && !campaignRef.current.visitors.includes(action.hero)) return;
    const next = actDefense(before, action);
    if (next === before) return;
    combatFeedback(before, next); publish(next);
    if (['build', 'upgrade', 'hire', 'promote'].includes(action.type)) playSound('flip');
    if (action.type === 'start-wave') { unlockAudio(); playSound('start'); }
  }, [pause, resume, publish]);
  const openPanel = useCallback((view: BattlePanel) => {
    if (blockedRef.current || modeRef.current !== 'battle' || reasonsRef.current.includes('system')) return;
    const target = view.kind === 'build' ? { kind: 'slot' as const, slot: view.slot } : view.kind === 'recruit' ? { kind: 'hire' as const } : { kind: 'scout' as const };
    const session = openTacticalSession(stateRef.current, runId.current, freshRunId(), target);
    if (!session) return;
    const next = { view, session };
    tacticalRef.current = next; setTactical(next); cancelAim();
    applyReasons(addPauseReason(reasonsRef.current, 'tactical'));
  }, [applyReasons, cancelAim]);
  const closePanel = useCallback(() => {
    if (blockedRef.current || reasonsRef.current.includes('system')) return;
    tacticalRef.current = null; setTactical(null);
    applyReasons(clearPauseReason(reasonsRef.current, 'tactical'));
  }, [applyReasons]);
  const purchase = useCallback((source: TacticalSession, action: TacticalAction, confirmSell?: boolean) => {
    const result = commitTacticalAction(stateRef.current, tacticalRef.current?.session ?? null,
      { runId: source.runId, sessionId: source.id, action, confirmSell },
      { runId: runId.current, active: modeRef.current === 'battle', reasons: blockedRef.current ? addPauseReason(reasonsRef.current, 'blocked') : reasonsRef.current, visitors: campaignRef.current.visitors });
    if (!result.ok) return;
    // Invalidate the session synchronously: an already queued second click cannot buy again.
    tacticalRef.current = null; setTactical(null);
    applyReasons(clearPauseReason(reasonsRef.current, 'tactical'), result.state); playSound('flip');
  }, [applyReasons]);
  const toggleDash = useCallback(() => {
    const current = stateRef.current;
    if (blockedRef.current || current.paused || current.phase !== 'wave' || current.dashCooldown > 0) return;
    aimingRef.current = !aimingRef.current; setAimingDash(aimingRef.current);
  }, []);
  const moveHero = useCallback((point: { x: number; y: number }) => {
    if (blockedRef.current || stateRef.current.paused) return;
    dispatch({ type: aimingRef.current ? 'dash' : 'move', point }); cancelAim();
  }, [dispatch, cancelAim]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [mode, state.stage]);
  useEffect(() => {
    let active = true;
    void preloadDefenseMotion().then(() => { if (active) setArtRevision(value => value + 1); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (mode !== 'battle') return;
    let frame = 0, last = performance.now(), lastPublish = last, accumulated = 0;
    let lastPublishedState = stateRef.current;
    const fixedStep = 1 / 60;
    const tick = (now: number) => {
      const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      const before = stateRef.current;
      const finishing = (before.phase === 'won' || before.phase === 'lost') && before.effects.length > 0;
      if (modeRef.current === 'battle' && !blockedRef.current && !document.hidden && (['prep', 'wave', 'intermission'].includes(before.phase) || finishing) && !before.paused) {
        accumulated += elapsed * (finishing ? 1 : before.speed);
        let next = before;
        while (accumulated >= fixedStep) {
          next = stepDefense(next, fixedStep); accumulated -= fixedStep;
          if (next.phase === 'promotion' || (!finishing && (next.phase === 'won' || next.phase === 'lost'))) { accumulated = 0; break; }
        }
        combatFeedback(before, next); stateRef.current = next;
        if (next !== lastPublishedState && (now - lastPublish >= 32 || before.phase !== next.phase)) {
          lastPublish = now; lastPublishedState = next; setState(next);
        }
      } else accumulated = 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);
  useEffect(() => {
    let shiftAlone = false;
    const cancelShift = () => { shiftAlone = false; };
    const interrupt = () => { cancelShift(); pause('system'); };
    const visibility = () => { if (document.hidden) interrupt(); };
    const orientation = matchMedia('(orientation: portrait)');
    const keyboard = (event: KeyboardEvent) => {
      if (modeRef.current !== 'battle' || event.defaultPrevented || event.repeat || blockedRef.current) return;
      const target = event.target as HTMLElement;
      if (target?.closest('[role="dialog"]')) return;
      if (!['ShiftLeft', 'ShiftRight'].includes(event.code)) cancelShift();
      if (event.code === 'Escape') {
        event.preventDefault();
        if (aimingRef.current) cancelAim(); else if (tacticalRef.current) closePanel(); else pause('manual');
        return;
      }
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (['ShiftLeft', 'ShiftRight'].includes(event.code)) { shiftAlone = !event.altKey && !event.ctrlKey && !event.metaKey; return; }
      if (target?.closest('button,summary,a,[role="button"]')) return;
      if (event.code === 'Space') { event.preventDefault(); dispatch({ type: 'skill' }); }
    };
    const keyup = (event: KeyboardEvent) => {
      if (!['ShiftLeft', 'ShiftRight'].includes(event.code)) return;
      const alone = shiftAlone; cancelShift();
      if (!alone || event.defaultPrevented || blockedRef.current || modeRef.current !== 'battle') return;
      if ((event.target as HTMLElement)?.closest('[role="dialog"],input,textarea,select,[contenteditable="true"]')) return;
      toggleDash();
    };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', interrupt);
    orientation.addEventListener('change', interrupt); window.addEventListener('orientationchange', interrupt);
    window.addEventListener('keydown', keyboard); window.addEventListener('keyup', keyup); window.addEventListener('pointerdown', cancelShift);
    return () => {
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', interrupt);
      orientation.removeEventListener('change', interrupt); window.removeEventListener('orientationchange', interrupt);
      window.removeEventListener('keydown', keyboard); window.removeEventListener('keyup', keyup); window.removeEventListener('pointerdown', cancelShift);
    };
  }, [pause, cancelAim, closePanel, dispatch, toggleDash]);
  useEffect(() => {
    if (modeRef.current !== 'battle') return;
    if (blocked) { cancelAim(); applyReasons(addPauseReason(addPauseReason(reasonsRef.current, 'blocked'), 'system')); }
    else if (reasonsRef.current.includes('blocked')) applyReasons(clearPauseReason(reasonsRef.current, 'blocked'));
  }, [blocked, applyReasons, cancelAim]);
  useEffect(() => { if (state.phase !== 'wave' || state.paused || blocked) cancelAim(); }, [state.phase, state.paused, blocked, cancelAim]);
  useEffect(() => {
    if (mode !== 'battle' || (state.phase !== 'won' && state.phase !== 'lost') || recordedRun.current === runId.current) return;
    recordedRun.current = runId.current;
    const result = completeRun(campaignRef.current, runId.current, state);
    persist(result.campaign);
    setReward(result);
    setArriving(result.campaign.visitors.find(h => !result.campaign.seenVisitors.includes(h)) || null);
    onFinish({ game: 'defense', defenseDifficulty: state.difficulty, defenseStage: state.stage, score: state.kills * 25 + completedWaves(state) * 150 + (state.phase === 'won' ? 1000 : 0), correct: completedWaves(state), total: 4, combo: state.kills, date: new Date().toISOString() });
    playSound(state.phase === 'won' ? 'finish' : 'wrong');
  }, [state, persist, onFinish, mode]);


  const resetInterface = () => {
    tacticalRef.current = null; setTactical(null); reasonsRef.current = []; setReasons([]); cancelAim();
  };
  const begin = (stage: number, hero = campaignRef.current.selectedHero) => {
    if (blockedRef.current || !stageUnlocked(campaignRef.current, stage)) return;
    modeRef.current = 'battle'; setMode('battle'); resetInterface(); runId.current = freshRunId(); setReward(null);
    publish(createDefense(stage, hero, campaignRef.current.training, campaignRef.current.difficulty));
  };
  const chooseHero = (hero: HeroId) => {
    if (blockedRef.current || modeRef.current !== 'camp' || !campaignRef.current.visitors.includes(hero)) return;
    persist(selectHero(campaignRef.current, hero));
  };
  const train = () => {
    if (blockedRef.current || modeRef.current !== 'camp') return;
    const before = campaignRef.current;
    const next = trainCampaign(before); persist(next);
    if (next.training > before.training) playSound('correct');
  };
  const returnToCamp = () => {
    if (blockedRef.current) return;
    modeRef.current = 'camp'; setMode('camp'); resetInterface(); setReward(null);
    publish(createDefense(latestStage(campaignRef.current), campaignRef.current.selectedHero, campaignRef.current.training, campaignRef.current.difficulty));
  };
  const joinVisitor = () => {
    if (!arriving || blockedRef.current) return;
    const next = acknowledgeVisitor(campaignRef.current, arriving); persist(next);
    setArriving(next.visitors.find(h => !next.seenVisitors.includes(h)) || null); playSound('start');
  };
  const stage = getStage(state.stage), hero = HEROES[state.hero];
  const sideVillage = getRegion(state.stage) === 'snow' ? '산맥 피난소' : '강 건너 마을';
  const terminal = state.phase === 'won' || state.phase === 'lost';
  const systemPaused = reasons.includes('system');
  const promotionNames: Record<HeroId, [string, string]> = { mage: ['화염 현자', '결계 현자'], elf: ['명사수', '숲의 추적자'], dwarf: ['파쇄 장인', '요새 공병'], tao: ['뇌전 도사', '결계 도사'], barbarian: ['분노의 전사', '산맥의 수호자'], druid: ['야수왕', '달빛 수호자'] };
  const powerDescription = state.hero === 'druid'
    ? '영웅의 기본 공격·필살기와 늑대 공격 피해 +40%'
    : '영웅의 기본 공격과 필살기 피해 +40%';
  const controlDescription = state.hero === 'druid'
    ? '영웅 기본 공격 사거리 +65 · 필살기의 기존 둔화 5초 유지'
    : state.hero === 'tao'
      ? '영웅 기본 공격 사거리 +65 · 필살기의 기존 둔화 4초 유지'
      : '영웅 기본 공격 사거리 +65 · 필살기에 4초 둔화 추가';
  return <div className="defense-root" data-theme={themeId}>{mode === 'camp' ? <DefenseCamp themeId={themeId} onSelectTheme={chooseTheme} themeStorageFailed={themeStorageFailed} campaign={campaign} onDepart={begin} onChooseHero={chooseHero} onSelectDifficulty={difficulty => { if (!blockedRef.current) persist(selectDifficulty(campaignRef.current, difficulty)); }} onTrain={train} onExit={() => { if (!blockedRef.current) onExit(); }} storageFailed={storageFailed}/> : <>
    <div inert={state.paused || blocked || !!arriving || terminal || state.phase === 'promotion' || undefined}>
      <DefenseBattle themeId={themeId} state={state} campaign={campaign} aimingDash={aimingDash} selectedSlot={tactical?.view.kind === 'build' ? tactical.view.slot : null} onPanel={openPanel} onCandidates={slots => openPanel({ kind: 'candidates', slots })} onMove={moveHero} onCancelAim={cancelAim} onDash={toggleDash} onSkill={() => { cancelAim(); dispatch({ type: 'skill' }); }} onStart={() => dispatch({ type: 'start-wave' })} onSpeed={() => dispatch({ type: 'speed' })} onPause={() => pause('manual')} storageFailed={storageFailed}/>
    </div>
    {tactical && !terminal ? <DefenseTacticalPanel key={tactical.session.id} panel={tactical.view} state={state} campaign={campaign} active={!blocked && !systemPaused} onClose={closePanel} onPanel={openPanel} onBuy={(action, confirmSell) => purchase(tactical.session, action, confirmSell)}/> : null}
    {!blocked && systemPaused && !terminal && !arriving ? <Dialog title="전장으로 돌아오기" className="defense-dialog defense-return" onClose={() => resume('system')}><h2>준비되면 다시 시작해요</h2><p>화면이 바뀌어 전투를 멈췄어요.<br/>{tactical ? '선택하던 전술은 그대로 남아 있어요.' : '마을과 수비대가 기다리고 있어요.'}</p><button className="defense-primary" onClick={() => resume('system')}>{tactical ? '전술 선택으로 돌아오기' : reasons.includes('manual') ? '일시정지로 돌아오기' : '계속 방어하기'}</button></Dialog> : null}
    {!blocked && reasons.includes('manual') && !systemPaused && !terminal && !arriving && !tactical ? <Dialog title="원정 일시정지" className="defense-dialog" onClose={() => resume('manual')}><h2>잠시 숨 고르기</h2><p>전투와 재사용 시간이 멈췄어요.</p><button className="defense-primary" onClick={() => resume('manual')}>계속 방어하기</button><button className="defense-secondary" onClick={() => openPanel({ kind: 'party' })}>수비대와 전술 보기</button><button className="defense-secondary" onClick={onToggleSound}><Icon name={sound ? 'sound' : 'muted'} size={20}/>{sound ? '효과음 끄기' : '효과음 켜기'}</button><button className="defense-secondary" onClick={() => begin(state.stage)}>이 스테이지 다시 준비</button><button className="defense-text-button" onClick={returnToCamp}>거점으로 돌아가기</button><small>현재 전투는 종료되고, 완료한 원정과 성장 기록은 유지돼요.</small></Dialog> : null}
    {!blocked && state.phase === 'promotion' && !state.paused ? <Dialog title="영웅 전직" className="defense-dialog defense-promotion-dialog"><DefenseSprite index={hero.sprite}/><h2>새로운 힘이 깨어났어요</h2><p>{hero.name}의 이번 원정 전직을 선택하세요.</p><div className="defense-promotions"><button onClick={() => dispatch({ type: 'promote', choice: 'power' })}><strong>{promotionNames[state.hero][0]}</strong><span>{powerDescription}</span></button><button onClick={() => dispatch({ type: 'promote', choice: 'control' })}><strong>{promotionNames[state.hero][1]}</strong><span>{controlDescription}</span></button></div><small>다음 원정에서는 다른 길도 선택할 수 있어요.</small></Dialog> : null}

    {!blocked && terminal && state.effects.length === 0 && reward && !arriving ? <Dialog title={state.phase === 'won' ? '방어 성공' : '다시 도전'} className="defense-dialog defense-result"><DefenseSprite index={state.phase === 'won' ? 15 : hero.sprite}/><h2>{state.phase === 'won' ? state.stage === STAGE_COUNT ? '서리산맥을 지켰어요!' : state.stage === 4 ? '청록의 숲을 지켰어요!' : '마을을 지켰어요!' : '수비대를 다시 모아요'}</h2><p>{state.phase === 'won' ? stage.expanded && state.outpostHp <= 0 ? `본 마을은 지켰어요. ${sideVillage} 구조는 다시 도전할 수 있어요.` : state.stage === 4 ? '거점에 서리산맥의 새로운 구조 요청이 도착했어요.' : state.stage === STAGE_COUNT ? '피난소까지 안전해졌어요. 두 지역 원정 완료!' : '안전해진 길로 새로운 소식이 찾아옵니다.' : '거점에서 장비와 수비대를 정비하고 다시 도전해 보세요.'}</p><div className="defense-result-stats"><span>격퇴<strong>{state.kills}</strong></span><span>방어 웨이브<strong>{completedWaves(state)} / 4</strong></span><span>성장 골드<strong>+{reward.goldEarned} G</strong></span></div>{reward.difficultyBonus > 0 ? <p className="defense-difficulty-reward">{DIFFICULTIES[state.difficulty].name} 보너스 +{reward.difficultyBonus} G 포함</p> : null}{reward.questReward > 0 ? <p className="defense-quest-reward">추가 퀘스트 완료! +{reward.questReward} G 포함</p> : null}{reward.firstClear ? <p className="defense-first-clear">첫 클리어 보상을 받았어요.</p> : null}<button className="defense-primary" onClick={returnToCamp}>거점으로 돌아가기</button><button className="defense-secondary" onClick={() => begin(state.phase === 'won' && state.stage < STAGE_COUNT ? state.stage + 1 : state.stage)}>{state.phase === 'won' && state.stage < STAGE_COUNT ? '다음 원정 바로 출발' : '같은 스테이지 다시 하기'}</button><button className="defense-text-button" onClick={onExit}>게임 허브로</button></Dialog> : null}
  </>}
    {!blocked && arriving && (!terminal || state.effects.length === 0) ? <Dialog title="새로운 방문자" className="defense-dialog defense-visitor-dialog"><div className="defense-arrival-art"><DefenseSprite index={HEROES[arriving].sprite}/></div><p className="defense-arrival-line">수비대의 소문을 듣고 찾아왔어요</p><h2>{HEROES[arriving].name}의 방문</h2><p className="defense-greeting">“{greeting[arriving]}”</p><div className="defense-unlock-note">{arriving === 'elf' ? '엘프 궁수 · 영웅 선택과 용병 고용 해금' : arriving === 'dwarf' ? '드워프 공병 · 대장간과 영구 장비 강화 해금' : arriving === 'tao' ? '동방의 도사 · 부적과 번개 지원 해금' : arriving === 'barbarian' ? '바바리안 전사 · 충격 돌진과 근접 방어 해금' : arriving === 'druid' ? '수인 드루이드 · 달빛 늑대 펫과 소환 전투 해금' : '수비대에 합류'}</div><button className="defense-primary" onClick={joinVisitor}>수비대에 맞이하기</button></Dialog> : null}
  </div>;
}
