import { ENEMIES } from '../games/defense/data';
import { fieldNotesForStage } from '../games/defense/fieldGuide';
import type { Difficulty } from '../games/defense/types';
import './defense-field-guide.css';

/** An opt-in field notebook. Native disclosures work without timers, modal
 * focus, quiz prompts, persistence, or changing the battle's pause state. */
export function DefenseFieldGuide({ stage, wave, difficulty = 'standard' }: {
  stage: number; wave?: number; difficulty?: Difficulty;
}) {
  const notes = fieldNotesForStage(stage, wave, difficulty);
  if (!notes.length) return null;
  return <details key={`${stage}:${wave ?? 'all'}:${difficulty}`} className="defense-field-guide">
    <summary>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5C8 3 5 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Zm0 0v15M5 8l4 1M5 12l4 1m6-4 4-1m-4 5 4-1"/></svg>
      <span><strong>수비대 관찰노트</strong><small>재료를 알면 전술이 보여요</small></span>
      <span className="field-guide-count">{notes.length}가지</span>
      <span className="field-guide-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="field-guide-pages">
      <p className="field-guide-intro">궁금한 재료를 펼쳐 보세요.</p>
      {notes.map(note => <details className={`field-guide-note field-guide-${note.id}`} key={note.id}>
        <summary><span className="field-guide-material">{note.material}</span><strong>{note.title}</strong><span className="field-guide-chevron" aria-hidden="true">⌄</span></summary>
        <div className="field-guide-entry">
          <p className="field-guide-enemies">{note.kinds.map(kind => ENEMIES[kind].name).join(' · ')}</p>
          <dl><div><dt>전장 규칙</dt><dd>{note.combat}</dd></div><div><dt>자연의 원리</dt><dd>{note.nature}</dd></div></dl>
        </div>
      </details>)}
      <p className="field-guide-footnote">피해 배율·내성·연쇄 공격은 이 세계의 전투 규칙이에요.</p>
    </div>
  </details>;
}
