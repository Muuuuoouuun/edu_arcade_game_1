import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Lobby } from './components/Lobby';
import { Game } from './components/Game';
import { Records } from './components/Records';
import { Dialog } from './components/Dialog';
import { Icon } from './components/Icon';
import { addRound, readSaved, saveState } from './lib/storage';
import type { RoundRecord } from './lib/storage';
import { playSound, setSound, unlockAudio } from './lib/sound';
import type { GameId } from './games/engine';
import type { QuizMode } from './games/quizData';
import { QuizSetup } from './components/QuizSetup';

const DefenseGame = lazy(() => import('./components/DefenseGame'));
const RaceGame = lazy(() => import('./components/RaceGame'));

export default function App() {
  const [saved, setSaved] = useState(readSaved);
  const [page, setPage] = useState<'games' | 'records'>('games');
  const [game, setGame] = useState<GameId | null>(null);
  const [round, setRound] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode>('mixed');
  const [quizReady, setQuizReady] = useState(false);
  const [profile, setProfile] = useState(false);
  const [name, setName] = useState(saved.name);
  useEffect(() => { saveState(saved); setSound(saved.sound); }, [saved]);
  const finish = useCallback((record: RoundRecord) => setSaved(previous => addRound(previous, record)), []);
  const play = (id: GameId) => { unlockAudio(); playSound('start'); setGame(id); setQuizReady(false); setPage('games'); setRound(n => n + 1); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const startQuiz = (mode: QuizMode) => { unlockAudio(); playSound('start'); setQuizMode(mode); setQuizReady(true); setRound(n => n + 1); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const goPage = (next: 'games' | 'records') => { setGame(null); setPage(next); };
  const toggleSound = () => { setSound(!saved.sound); setSaved(s => ({ ...s, sound: !s.sound })); unlockAudio(); };
  return <div className="app-shell"><a className="skip-link" href="#main">본문으로 바로 가기</a><Header page={page} sound={saved.sound} name={saved.name} onPage={goPage} onSound={() => { setSound(!saved.sound); setSaved(s => ({ ...s, sound: !s.sound })); unlockAudio(); }} onProfile={() => { setName(saved.name); setProfile(true); }}/>
    {game === 'defense' ? <Suspense fallback={<main id="main" className="game-loading" role="status">수비대의 마을을 준비하고 있어요…</main>}><DefenseGame key={`defense-${round}`} blocked={profile} sound={saved.sound} onToggleSound={toggleSound} onExit={() => setGame(null)} onFinish={finish}/></Suspense> : game === 'race' ? <Suspense fallback={<main id="main" className="game-loading" role="status">카트를 준비하고 있어요…</main>}><RaceGame key={`race-${round}`} best={saved.stats.race.best} blocked={profile} onExit={() => setGame(null)} onFinish={finish}/></Suspense> : game === 'quiz' && !quizReady ? <QuizSetup initialMode={quizMode} onStart={startQuiz} onExit={() => setGame(null)}/> : game ? <Game key={`${game}-${round}`} id={game} quizMode={quizMode} best={saved.stats[game].best} onExit={() => setGame(null)} onFinish={finish} onReplay={() => game === 'quiz' ? startQuiz(quizMode) : play(game)} onChangeTopic={() => setQuizReady(false)}/> : page === 'records' ? <Records rounds={saved.rounds} stats={saved.stats} name={saved.name} onPlay={play}/> : <Lobby best={saved.stats.math.best} onPlay={play}/>}
    {profile ? <Dialog title="내 프로필" onClose={() => setProfile(false)}><button className="icon-button dialog-close" onClick={() => setProfile(false)} aria-label="프로필 닫기"><Icon name="close"/></button><div className="profile-avatar"><Icon name="user" size={40}/></div><h2>뭐라고 부를까요?</h2><form onSubmit={event => { event.preventDefault(); setSaved(s => ({ ...s, name: name.trim() || '플레이어' })); setProfile(false); }}><label htmlFor="player-name">플레이어 이름</label><input id="player-name" autoComplete="nickname" maxLength={12} value={name} onChange={event => setName(event.target.value)}/><button className="primary-button" type="submit">저장하기</button></form></Dialog> : null}
  </div>;
}
