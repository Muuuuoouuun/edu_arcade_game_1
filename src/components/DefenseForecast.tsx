import { memo, useMemo } from 'react';
import { getWavePlan } from '../games/defense/difficulty';
import { ENEMIES, getStage } from '../games/defense/data';
import type { DefenseState, Difficulty, EnemyKind } from '../games/defense/types';
import { DefenseSprite } from './DefenseBoard';

/** Only integer combat milestones update the scout panel, never animation frames. */
export const DefenseForecast = memo(function DefenseForecast({ stage, wave, phase, difficulty, spawned, alive, expanded = false }: {
  stage: number; wave: number; phase: DefenseState['phase']; difficulty: Difficulty; spawned: number; alive: number; expanded?: boolean;
}) {
  const fighting = phase === 'wave', terminal = phase === 'won' || phase === 'lost';
  const next = Math.min(4, fighting || terminal ? wave : wave + 1);
  const plan = useMemo(() => getWavePlan(stage, next, difficulty), [stage, next, difficulty]);
  const groups = useMemo(() => {
    const counts = new Map<EnemyKind, number>();
    for (const kind of plan) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return [...counts];
  }, [plan]);
  const remaining = Math.max(0, plan.length - spawned) + alive;
  const boss = plan.find(kind => kind === 'boss' || kind === 'frostboss');
  const cleared = Math.max(0, plan.length - remaining);
  return <details open={expanded || undefined} className={`defense-forecast ${fighting ? 'in-combat' : ''}`}>
    <summary>
      <span className="defense-scout-title">{terminal ? '원정 정찰 기록' : fighting ? `웨이브 ${wave}` : `다음 웨이브 ${next}`}<small>{fighting ? `${remaining}마리 남음` : `${plan.length}마리`}</small></span>
      {fighting ? <span className="defense-wave-track" role="progressbar" aria-label="웨이브 진행" aria-valuemin={0} aria-valuemax={plan.length} aria-valuenow={cleared}><i style={{ width: `${plan.length ? cleared / plan.length * 100 : 0}%` }}/></span> : <span className="defense-scout-tip">{boss ? `${ENEMIES[boss].name} 출현` : difficulty === 'veteran' ? '빠른 증원 주의' : '적 편성과 약점 확인'}</span>}
      <span className="defense-scout-toggle">정찰 <b aria-hidden="true">⌄</b></span>
    </summary>
    <div className="defense-scout-content">
      <div className="defense-scout-enemies">{groups.map(([kind, count]) => <div key={kind} className={kind.includes('boss') ? 'boss' : ''}>
        <DefenseSprite index={ENEMIES[kind].sprite}/><span><strong>{ENEMIES[kind].name} <b>×{count}</b></strong><small>{ENEMIES[kind].elementHint}</small></span>
      </div>)}</div>
      <p>{getStage(stage).expanded ? '두 갈래 진입로 · 영웅과 용병으로 빈 길목을 보완하세요.' : '건설 지점 선택 → 타워 건설 · 빈 땅을 누르면 영웅 이동'}</p>
    </div>
  </details>;
});
