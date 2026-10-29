import { DIFFICULTIES, getDifficulty } from '../games/defense/difficulty';
import { stageLabel } from '../games/defense/data';
import { GAME_INFO } from '../games/engine';
import type { GameId } from '../games/engine';
import type { GameStats, RoundRecord } from '../lib/storage';
import { Art } from './Art';
import { Icon } from './Icon';
import { quizModeLabel } from '../games/quizData';

export function Records({ rounds, stats, name, onPlay }: { rounds: RoundRecord[]; stats: GameStats; name: string; onPlay: (id: GameId) => void }) {
  return <main className="records" id="main">
    <h1>{name}의 플레이 기록</h1><p className="section-description">어제의 나를 넘는 한 판. 기록은 이 브라우저에 저장돼요.</p>
    <div className="record-games">{(Object.keys(GAME_INFO) as GameId[]).map(id => <section key={id} className={`record-card ${GAME_INFO[id].color}`}>
      <Art kind={GAME_INFO[id].art}/><h2>{GAME_INFO[id].title}</h2><span>나의 최고 기록</span><strong>{stats[id].best.toLocaleString()}<small>점</small></strong>
      <p>{stats[id].plays}번 플레이</p><button className="primary-button small" onClick={() => onPlay(id)}><Icon name="play" size={20}/>한 판 하기</button>
    </section>)}</div>
    <section className="history"><h2>최근 플레이</h2>{rounds.length === 0 ? <p className="empty-state">아직 첫 판 전이네요. 신나는 기록을 만들어 볼까요?</p> : <div className="history-list">{rounds.slice(-10).reverse().map((round, i) => <div className="history-row" key={`${round.date}-${i}`}><span className={`history-dot ${GAME_INFO[round.game].color}`}/><strong>{GAME_INFO[round.game].title}{round.game === 'race' && round.racePlace ? <small className="history-mode">{round.raceFinished === false ? '미완주' : `${round.racePlace}위`}{round.raceTime !== undefined ? ` · ${Math.floor(round.raceTime / 60)}분 ${Math.floor(round.raceTime % 60)}초` : ''}</small> : null}{round.game === 'defense' ? <small className="history-mode">{round.defenseStage ? `${stageLabel(round.defenseStage)} · ` : ''}{DIFFICULTIES[getDifficulty(round.defenseDifficulty)].name}</small> : null}{round.quizMode ? <small className="history-mode">{quizModeLabel(round.quizMode)}</small> : null}</strong><span>{new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(round.date))}</span><span>{round.game === 'defense' ? `${round.combo}마리 격퇴 · ${round.correct}/${round.total} 웨이브` : `최대 ${round.combo} 콤보`}</span><b>{round.score.toLocaleString()}점</b></div>)}</div>}</section>
  </main>;
}
