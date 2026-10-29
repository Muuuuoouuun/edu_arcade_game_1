import { useEffect, useRef, useState } from 'react';
import type { GameId } from '../games/engine';
import { GAME_INFO } from '../games/engine';
import { useRound } from '../games/useRound';
import type { RoundRecord } from '../lib/storage';
import { Art } from './Art';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { QuizQuestion, QuizReview } from './QuizQuestion';
import { quizModeLabel } from '../games/quizData';
import type { QuizMode } from '../games/quizData';

export function Game({ id, best, quizMode = 'mixed', onExit, onFinish, onReplay, onChangeTopic }: { id: GameId; best: number; quizMode?: QuizMode; onExit: () => void; onFinish: (record: RoundRecord) => void; onReplay: () => void; onChangeTopic: () => void }) {
  const [seed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0]);
  const { state: s, question, quizQuestion, quizCount, cards, answer, flip, pause, resume } = useRound(id, seed, quizMode);
  const saved = useRef(false);
  const bestBefore = useRef(best).current;
  const info = GAME_INFO[id];
  const fever = s.combo >= 5;
  useEffect(() => {
    if (s.phase !== 'result' || saved.current) return;
    saved.current = true;
    onFinish({ game: id, score: s.score, correct: s.correct, total: s.total, combo: s.maxCombo, date: new Date().toISOString(), ...(id === 'quiz' ? { quizMode } : {}) });
  }, [s.phase, s.score, s.correct, s.total, s.maxCombo, id, quizMode, onFinish]);

  return <main className={`game-page game-${id}`} id="main">
    <div className="game-title-row"><button className="back-button" onClick={s.phase === 'playing' ? pause : onExit}><Icon name="back"/>게임으로</button><div className="game-heading"><h1>{info.title}</h1><p>{id === 'quiz' ? `${quizModeLabel(quizMode)} · 아는 만큼 팡! 콤보로 세계 정복!` : info.caption}</p></div></div>
    <section className={`arena ${fever ? 'fever' : ''} ${s.remaining < 10000 ? 'time-low' : ''}`} aria-label={`${info.title} 게임 화면`}>
      <div className="hud"><div className="hud-stat timer"><span className="clock-icon" aria-hidden="true"/><strong>{Math.ceil(s.remaining / 1000)}<small>초</small></strong></div><div className="hud-stat"><Icon name="star" size={32}/><strong>{s.score.toLocaleString()}<small>점</small></strong></div><div className="hud-stat combo-stat"><span className="combo-icon" aria-hidden="true">✦</span><strong>{s.combo}<small>콤보</small></strong></div><button className="icon-button pause-button" onClick={pause} disabled={s.phase !== 'playing'} aria-label="일시 정지"><Icon name="pause"/></button></div>
      <div className="timer-track" role="progressbar" aria-label="남은 시간" aria-valuenow={Math.ceil(s.remaining / 1000)} aria-valuemin={0} aria-valuemax={60}><div style={{ width: `${s.remaining / 600}%` }}/></div>
      {id === 'memory' ? <div className="memory-board">{cards.map(card => {
        const matched = s.matched.includes(card.pair);
        const visible = matched || s.flipped.includes(card.id);
        return <button className={`memory-card ${visible ? 'flipped' : ''} ${matched ? 'matched' : ''}`} key={card.id} onClick={() => flip(card.id)} disabled={matched || s.phase !== 'playing' || s.flipped.includes(card.id) || s.flipped.length === 2} aria-label={visible ? card.label : `카드 ${card.id + 1} 뒤집기`} aria-pressed={visible}>{visible ? <span>{card.label}</span> : <Art kind="tiles"/>}{matched ? <span className="matched-mark">✓</span> : null}</button>;
      })}</div> : <>
        {quizQuestion ? <QuizQuestion question={quizQuestion} index={s.index} count={quizCount}/> : <div className="question-stage"><Art kind={id === 'word' ? 'cat' : 'rocket'} className="arena-art"/><div className={`question-cloud ${question.prompt.length > 7 ? 'long-question' : ''}`}><span className="level-label">{id === 'math' ? `LEVEL ${question.level}` : '이 뜻의 단어는?'}</span><h2 key={s.index}>{question.prompt}{id === 'math' ? <span> = ?</span> : null}</h2></div></div>}
        <div className="answers">{question.choices.map((choice, index) => {
          const selected = s.feedback?.selected === choice;
          const correct = s.feedback && s.feedback.answer === choice;
          return <div className="answer-slot" key={index}><button className={`answer-bubble ${choice.length > 7 ? 'long-answer' : ''} ${selected ? 'chosen' : ''} ${correct ? 'correct' : ''} ${selected && !s.feedback?.correct ? 'wrong' : ''}`} onClick={() => answer(choice)} disabled={s.phase !== 'playing' || Boolean(s.feedback)} aria-label={`답 ${choice}`}><span>{choice}</span></button><kbd>{index + 1}</kbd></div>;
        })}</div>
      </>}
      <div className={`feedback ${s.feedback ? 'visible' : ''} ${s.feedback?.correct ? 'good' : 'bad'}`} aria-live="polite">{s.feedback ? s.feedback.correct ? `${s.combo > 1 ? `${s.combo} COMBO!` : '팡! 정답!'} +${s.feedback.points}` : `괜찮아! 정답은 ${s.feedback.answer}` : ''}</div>
      {fever && s.phase === 'playing' ? <div className="fever-label">FEVER! 점수 ×2</div> : null}
      {s.phase === 'countdown' ? <div className="countdown-overlay"><div className="countdown-number" key={s.countdown}>{s.countdown}</div><p>{id === 'memory' ? '영어와 뜻을 짝지어 보세요!' : '준비됐나요? 팡팡 시작!'}</p></div> : null}
    </section>
    <p className="game-instruction">{id === 'memory' ? '카드 두 장을 뒤집어 영어와 뜻의 짝을 맞춰요' : <>정답을 클릭하거나 <strong>1–4</strong> 키를 누르세요</>}</p>
    {s.phase === 'paused' ? <Dialog title="일시 정지" onClose={resume}><Art kind={info.art} className="dialog-art"/><h2>잠깐 쉬어가요.</h2><p>준비되면 콤보를 이어가 볼까요?</p><button className="primary-button" onClick={resume}><Icon name="play"/>계속 플레이</button><button className="text-button" onClick={onExit}>게임 목록으로 나가기</button>{id === 'quiz' ? <button className="text-button" onClick={onChangeTopic}>다른 주제 고르기</button> : null}</Dialog> : null}
    {s.phase === 'result' ? <Dialog title="플레이 결과" className="result-dialog"><Art kind={info.art} className="dialog-art"/><h2>{s.score > bestBefore ? '최고 기록, 팡!' : s.total === 0 ? '다음 판은 더 신나게!' : '한 판 제대로 놀았다!'}</h2><strong className="result-score">{s.score.toLocaleString()}<small>점</small></strong><div className="result-stats"><div><strong>{s.correct}<small> / {s.total}</small></strong><span>{id === 'memory' ? '찾은 짝꿍 / 시도' : '맞힌 문제'}</span></div><div><strong>{s.maxCombo}</strong><span>최대 콤보</span></div></div>{id === 'quiz' ? <QuizReview reviews={s.reviews}/> : s.mistakes.length ? <details className="review"><summary>아까 그 문제, 정답 보기 ({s.mistakes.length})</summary><ul>{[...new Set(s.mistakes)].map((mistake, i) => <li key={i}>{mistake}</li>)}</ul></details> : null}<button className="primary-button" onClick={onReplay}><Icon name="play"/>한 판 더!</button>{id === 'quiz' ? <button className="text-button" onClick={onChangeTopic}>다른 주제 고르기</button> : null}<button className="text-button" onClick={onExit}>게임 목록으로</button></Dialog> : null}
  </main>;
}
