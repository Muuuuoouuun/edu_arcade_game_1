import { QUIZ_TOPICS } from '../games/quizData';
import type { QuizQuestion as Question } from '../games/quizData';

export function QuizQuestion({ question, index, count }: { question: Question; index: number; count: number }) {
  return <div className={`quiz-question ${question.flag ? 'with-flag' : ''}`}>
    <div className="quiz-question-meta"><span>{QUIZ_TOPICS[question.topic].label}</span><span>{index + 1} / {count}</span></div>
    <div className="quiz-prompt" key={question.id}>
      {question.flag ? <img className="quiz-flag" src={`/flags/${question.flag}.svg`} alt={question.flagDescription} draggable={false}/> : <span className="quiz-question-number" aria-hidden="true">Q.</span>}
      <h2>{question.prompt}</h2>
    </div>
  </div>;
}

export function QuizReview({ reviews }: { reviews: { question: Question; correct: boolean; selected: string }[] }) {
  if (!reviews.length) return null;
  return <details className="review quiz-review"><summary>아하! 정답과 해설 보기 ({reviews.length})</summary>
    <ol>{reviews.map(({ question, correct, selected }, i) => <li key={question.id}>
      <div className="review-label"><span>{i + 1}. {QUIZ_TOPICS[question.topic].label}</span><b className={correct ? 'review-correct' : 'review-wrong'}>{correct ? '✓ 정답' : '다음엔 정답!'}</b></div>
      {question.flag ? <img src={`/flags/${question.flag}.svg`} alt={`${question.answer} 국기`}/> : null}
      <strong>{question.prompt}</strong>
      {!correct ? <p className="review-selected">내 답: {selected}</p> : null}
      <p className="review-answer">정답: {question.answer}</p><p>{question.explanation}</p>
    </li>)}</ol>
  </details>;
}
