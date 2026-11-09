import { fieldNotesForStage } from '../games/defense/fieldGuide';
import type { FieldNote } from '../games/defense/fieldGuide';
import type { Difficulty } from '../games/defense/types';
import './defense-field-guide.css';

const quickRules:Record<FieldNote['id'],string> = {
  wood:'나무·식물 → 불로 공격 · 물에는 강함',
  ice:'얼음 갑옷 → 불이나 충격으로 공략',
  stone:'돌 갑옷 → 충격으로 공략 · 불에는 강함',
  metal:'금속·젖은 적 → 연쇄 번개의 연결점',
  insulator:'절연 슬라임 → 번개에 강함 · 연쇄 차단',
};
const concepts:Record<FieldNote['id'],string> = {
  wood:'나무는 충분한 열과 산소가 있으면 타요.',
  ice:'얼음은 열에 녹고 충격에 깨질 수 있어요.',
  stone:'돌은 나무처럼 타지 않아요.',
  metal:'대부분의 금속은 전기가 잘 통해요.',
  insulator:'전기가 잘 통하지 않는 재료도 있어요.',
};

/** Optional, compact battle hints; never a quiz, calculation task or progress gate. */
export function DefenseFieldGuide({ stage, wave, difficulty = 'standard' }: {
  stage: number; wave?: number; difficulty?: Difficulty;
}) {
  const notes = fieldNotesForStage(stage, wave, difficulty);
  if (!notes.length) return null;
  const renderNote = (note:FieldNote) => <li className={`field-guide-quick field-guide-${note.id}`} key={note.id}>
    <span className="field-guide-material">{note.material}</span>
    <div><strong>{quickRules[note.id]}</strong><small>{concepts[note.id]}</small></div>
  </li>;
  return <details key={`${stage}:${wave ?? 'all'}:${difficulty}`} className="defense-field-guide">
    <summary>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/></svg>
      <span><strong>전술 힌트</strong><small>이번 전장의 약점만 빠르게</small></span>
      <span className="field-guide-count">{notes.length}가지</span>
      <span className="field-guide-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="field-guide-pages">
      <ul className="field-guide-quick-list">{notes.slice(0,3).map(renderNote)}</ul>
      {notes.length>3?<details className="field-guide-more"><summary>다른 상대 {notes.length-3}가지 더 보기 <span aria-hidden="true">⌄</span></summary><ul className="field-guide-quick-list">{notes.slice(3).map(renderNote)}</ul></details>:null}
      <p className="field-guide-footnote">공격 약점과 연쇄는 이 세계의 전투 규칙입니다.</p>
    </div>
  </details>;
}
