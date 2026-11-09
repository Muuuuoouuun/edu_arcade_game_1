import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { activeGate, choicesVisible, currentLane, ITEM_INFO, METERS_PER_UNIT, raceLap, racePlace, raceScore, RACE_LENGTH, RACE_LIMIT } from '../games/race/engine';
import type { Item } from '../games/race/engine';
import { useRace } from '../games/race/useRace';
import type { RoundRecord } from '../lib/storage';
import { Art } from './Art';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import '../race.css';

const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

function ItemIcon({ item }: { item?: Item }) {
  return <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {item === 'shield' ? <path d="M16 3 27 7v9c0 7-11 13-11 13S5 23 5 16V7Zm-6 12 4 4 8-9"/> : item === 'boost' ? <><path d="M12 21 7 18C8 10 17 5 27 5c0 10-5 19-13 20Z"/><circle cx="20" cy="12" r="3"/><path d="m9 23-5 5m3-9-4 4m10 3-4 4"/></> : item === 'lightning' ? <path d="m19 2-13 17h9l-2 11 13-17h-9Z" fill="currentColor" stroke="none"/> : <><rect x="4" y="4" width="24" height="24" rx="7"/><path d="M12 12a4 4 0 1 1 6 3.5c-2 1-2 2-2 3M16 23h.01"/></>}
  </svg>;
}

export default function RaceGame({ best, blocked, onExit, onFinish }: { best: number; blocked: boolean; onExit: () => void; onFinish: (record: RoundRecord) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRace(canvas, blocked);
  const s = game.state;
  const recorded = useRef(false), bestBefore = useRef(best);
  const gate = activeGate(s), showChoices = choicesVisible(s);
  const nextGate = s.gates[s.gateIndex];
  const correct = s.reviews.filter(review => review.correct).length;
  const mistakes = s.reviews.filter(review => !review.correct);
  const score = raceScore(s);
  const inventoryItem = s.inventory[0];
  const playing = s.phase === 'racing';
  const controlsDisabled = !playing;

  useEffect(() => {
    if (s.phase !== 'finished') { recorded.current = false; bestBefore.current = best; return; }
    if (recorded.current) return;
    recorded.current = true;
    onFinish({ game: 'race', score, correct, total: s.reviews.length, combo: s.maxCombo, date: new Date().toISOString(), racePlace: racePlace(s), raceTime: s.elapsed, raceFinished: s.finishReason === 'finish' });
  }, [s, score, correct, best, onFinish]);

  const pointer = (key: string) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); game.hold(key, true); },
    onPointerUp: () => game.hold(key, false), onPointerCancel: () => game.hold(key, false), onLostPointerCapture: () => game.hold(key, false),
  });

  return <main id="main" className="race-page">
    <div className="race-title"><button className="back-button" onClick={playing || s.phase === 'countdown' ? game.pause : onExit}><Icon name="back"/>게임으로</button><h1>사이언스 카트</h1><span className="race-clock" aria-label="주행 시간">{time(s.elapsed)} <small>/ {time(RACE_LIMIT)}</small></span></div>
    <section className={`race-stage ${s.boost > 0 ? 'boosting' : ''}`} aria-label="사이언스 카트 레이스">
      <canvas ref={canvas} role="img" aria-label="과학 밸리의 굽은 도로 위를 달리는 카트. 방향키 또는 아래 버튼으로 조향합니다."/>
      <div className="race-hud">
        <div className="race-position" aria-label="현재 순위"><strong>{racePlace(s)}<small>위</small></strong><span>/ 4</span></div>
        <div aria-label="현재 바퀴"><strong>{raceLap(s)}</strong><span>/ 3 <small>LAP</small></span></div>
        <div aria-label="현재 속도"><strong>{Math.round(s.speed * METERS_PER_UNIT * 3.6)}</strong><span className="speed-unit">km/h</span></div>
        <button className="race-pause" onClick={game.pause} disabled={!playing && s.phase !== 'countdown'} aria-label="레이스 일시 정지"><Icon name="pause" size={27}/></button>
      </div>
      {playing || s.phase === 'paused' ? <>
        {gate ? <div className="race-question" key={gate.question.id}><p>아이템 상자까지 <strong>{Math.max(0, Math.ceil((gate.at - s.distance) * METERS_PER_UNIT))} m</strong></p><h2 aria-live="polite">{gate.question.prompt}</h2>{!showChoices && playing ? <span className="race-read-first">먼저 문제를 읽어요. 곧 정답 상자가 나타나요!</span> : null}</div> : !s.notice ? <div className="race-next-gate">{nextGate ? `다음 아이템 상자까지 ${Math.ceil((nextGate.at - s.distance) * METERS_PER_UNIT)} m` : '마지막 스퍼트! 결승선까지 달려요!'}</div> : null}
        {s.notice ? <div className={`race-notice ${s.notice.kind} ${gate ? 'below-question' : ''}`} role="status"><strong>{s.notice.title}</strong><p>{s.notice.body}</p></div> : null}
        <div className="race-effects" aria-live="polite">{s.boost > 0 ? <span className="boost-effect">BOOST!</span> : null}{s.shield > 0 ? <span className="shield-effect">쉴드 {Math.ceil(s.shield)}초</span> : null}{s.lightning > 0 ? <span className="lightning-effect">찌릿! 라이벌 감속</span> : null}{s.slow > 0 ? <span className="slow-effect">감속 중</span> : null}{s.wasDrifting ? <span className="drift-effect">{s.driftCharge >= 0.85 ? '드리프트 놓으면 부스트!' : '드리프트 충전 중'}</span> : null}</div>
      </> : null}
      <div className="race-controls">
        <div className="race-steering"><button {...pointer('left')} onClick={event => { if (event.detail === 0) game.nudge(-1); }} disabled={controlsDisabled} aria-label="왼쪽으로 조향"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><button {...pointer('right')} onClick={event => { if (event.detail === 0) game.nudge(1); }} disabled={controlsDisabled} aria-label="오른쪽으로 조향"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button><button {...pointer('drift')} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); game.hold('drift', true); } }} onKeyUp={event => { if (event.key === 'Enter') game.hold('drift', false); }} onBlur={() => game.hold('drift', false)} disabled={controlsDisabled} className={`race-drift ${s.wasDrifting ? 'active' : ''}`} aria-label="드리프트 누르고 조향" title="Shift를 누른 채 조향하고 놓으면 짧은 부스터">DRIFT<span>SHIFT</span></button></div>
        <div className="race-answers" role="group" aria-label="정답 상자 차선 선택">
          {showChoices && gate ? gate.question.choices.map((choice, index) => <button key={`${gate.question.id}-${index}`} className={currentLane(s.x) === index ? 'selected' : ''} onClick={() => game.choose(index)} aria-label={`${index + 1}번 차선: ${choice}`} aria-pressed={currentLane(s.x) === index}><kbd>{index + 1}</kbd><span>{choice}</span></button>) : <p className="race-steer-tip">{gate ? '문제를 읽고 정답 상자로!' : '코너를 돌아 순위를 올려봐요!'}</p>}
        </div>
        <button className="race-item" disabled={controlsDisabled || !inventoryItem} onClick={game.item} aria-label={inventoryItem ? `${ITEM_INFO[inventoryItem].name} 사용` : '아이템 없음'}><ItemIcon item={inventoryItem}/><span>{inventoryItem ? ITEM_INFO[inventoryItem].short : '아이템 없음'}<small>SPACE{s.inventory.length > 1 ? ` · +${s.inventory.length - 1}` : ''}</small></span></button>
      </div>
      <p className="race-help">← → 조향 · 1–3 정답 차선 · Shift 드리프트 · Space 아이템</p>
      <div className="race-progress" role="progressbar" aria-label="레이스 진행도" aria-valuenow={Math.round(s.distance / RACE_LENGTH * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${s.distance / RACE_LENGTH * 100}%` }}/></div>
      {s.phase === 'ready' ? <div className="race-ready-overlay"><div className="race-ready-panel"><Art kind="race"/><div><h2>과학으로 추월해!</h2><p>정답 상자를 통과하면 아이템 획득.<br/>틀리면 꽝·감속! 짧은 해설로 다시 도전해요.</p><ul><li><strong>3바퀴 레이스</strong> · 컴퓨터 카트 3대와 대결</li><li><strong>자동 가속</strong> · 방향키 / 화면 버튼으로 조향</li><li><strong>문제를 먼저 읽고</strong> · 1–3 또는 답을 눌러 차선 이동</li><li><strong>아이템 버튼 / Space</strong> · 부스터·쉴드·번개 사용</li></ul><p className="race-ready-note">실제 통과한 차선으로 정답 판정 · 제한 시간 3분</p>{game.assetError ? <><p className="race-load-error">트랙 그림을 불러오지 못했어요.</p><button className="primary-button" onClick={game.retry}>다시 불러오기</button></> : <button className="primary-button" onClick={game.start} disabled={!game.ready}><Icon name="play"/>{game.ready ? '레이스 시작!' : '트랙 준비 중…'}</button>}</div></div></div> : null}
      {s.phase === 'countdown' ? <div className="race-countdown" role="status"><strong>{Math.max(1, Math.ceil(s.countdown))}</strong><p>자동으로 출발해요. 준비!</p></div> : null}
    </section>
    {s.phase === 'paused' && !blocked ? <Dialog title="레이스 일시 정지" onClose={game.resume}><Art kind="race" className="dialog-art"/><h2>잠깐 피트 스톱!</h2><p>시간과 라이벌도 함께 멈췄어요.</p><button className="primary-button" onClick={game.resume}><Icon name="play"/>레이스 계속</button><button className="text-button" onClick={onExit}>게임 목록으로 나가기</button></Dialog> : null}
    {s.phase === 'finished' ? <Dialog title="레이스 결과" className="race-result"><Art kind="race" className="dialog-art"/><h2>{s.finishReason === 'timeout' ? '다음엔 완주까지!' : racePlace(s) === 1 ? '짜릿한 우승!' : '멋지게 완주했어요!'}</h2><div className="race-result-place">{racePlace(s)}<small>위 / 4</small></div><p>{s.finishReason === 'finish' ? `3바퀴 완주 · ${time(s.elapsed)}` : '제한 시간 종료 · 미완주'}{score > bestBefore.current ? ' · 최고 기록!' : ''}</p><div className="result-stats"><div><strong>{score.toLocaleString()}</strong><span>점수</span></div><div><strong>{correct}<small> / {s.reviews.length}</small></strong><span>정답 상자</span></div><div><strong>{s.maxCombo}</strong><span>최대 콤보</span></div></div>{mistakes.length ? <details className="review race-review"><summary>아까 그 과학, 짧게 다시 보기 ({mistakes.length})</summary><ol>{mistakes.map(({ question, selected }) => <li key={question.id}><strong>{question.prompt}</strong><p>내 답: {selected ?? '상자를 놓침'}</p><b>정답: {question.answer}</b><p>{question.explanation}</p></li>)}</ol></details> : null}<button className="primary-button" onClick={game.restart}><Icon name="play"/>한 번 더 질주!</button><button className="text-button" onClick={onExit}>게임 목록으로</button></Dialog> : null}
  </main>;
}
