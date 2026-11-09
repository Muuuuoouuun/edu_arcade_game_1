import { useState } from 'react';
import { QUIZ_TOPICS, quizModeLabel } from '../games/quizData';
import type { QuizMode, QuizTopic } from '../games/quizData';
import { Art } from './Art';
import { Icon } from './Icon';

export function QuizSetup({ initialMode, onStart, onExit }: { initialMode: QuizMode; onStart: (mode: QuizMode) => void; onExit: () => void }) {
  const [mode, setMode] = useState<QuizMode>(initialMode);
  return <main className="quiz-setup" id="main">
    <button className="back-button" onClick={onExit}><Icon name="back"/>게임으로</button>
    <section className="quiz-intro">
      <div><span className="eyebrow">NEW GAME · KNOW & GO!</span><h1>상식 팡팡</h1><p>알면 바로 팡!<br/>세상 모든 호기심이 점수가 되는 시간.</p><div className="quiz-rules"><span>60초 한 판</span><span>4지선다</span><span>5콤보 피버</span></div></div>
      <Art kind="quiz"/>
    </section>
    <section className="quiz-selection" aria-labelledby="quiz-topic-title">
      <div className="quiz-selection-heading"><h2 id="quiz-topic-title">오늘은 어떤 상식?</h2><p>하나만 파도, 골고루 알아도 좋아요.</p></div>
      <div className="quiz-topics" role="group" aria-label="퀴즈 주제 선택">
        <button className={`topic-card mixed-topic ${mode === 'mixed' ? 'selected' : ''}`} aria-pressed={mode === 'mixed'} onClick={() => setMode('mixed')}><span className="topic-mark" aria-hidden="true">✦</span><span><strong>모두 섞기</strong><small>네 분야를 오가며 콤보 쌓기</small></span><span className="topic-check" aria-hidden="true">{mode === 'mixed' ? '✓' : '+'}</span></button>
        {(Object.keys(QUIZ_TOPICS) as QuizTopic[]).map(topic => <button key={topic} className={`topic-card topic-${topic} ${mode === topic ? 'selected' : ''}`} aria-pressed={mode === topic} onClick={() => setMode(topic)}><span className="topic-mark" aria-hidden="true">{QUIZ_TOPICS[topic].mark}</span><span><strong>{QUIZ_TOPICS[topic].label}</strong><small>{QUIZ_TOPICS[topic].description}</small></span><span className="topic-check" aria-hidden="true">{mode === topic ? '✓' : '+'}</span></button>)}
      </div>
      <div className="quiz-start"><div><strong>{quizModeLabel(mode)} · {mode === 'mixed' ? 64 : 16}문제</strong><p>60초가 지나거나 모든 문제를 풀면 한 판 끝!</p></div><button className="primary-button" onClick={() => onStart(mode)}><Icon name="play"/>팡팡 시작!</button></div>
      <p className="quiz-setup-tip">해설은 한 판이 끝나면 볼 수 있어요. 일단 신나게 도전!</p>
    </section>
  </main>;
}
