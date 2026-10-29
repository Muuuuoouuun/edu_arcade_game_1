import { useState } from 'react';
import { GAME_INFO } from '../games/engine';
import type { GameId } from '../games/engine';
import { Art } from './Art';
import { Icon } from './Icon';
import './prototype-entry.css';

export function Lobby({ best, onPlay }: { best: number; onPlay: (id: GameId) => void }) {
  const [category, setCategory] = useState('전체');
  const games = (Object.keys(GAME_INFO) as GameId[]).filter(id => category === '전체' || GAME_INFO[id].category === category);
  return <main className="lobby" id="main">
    <section className="welcome" aria-label="환영합니다">
      <div><h1>한 판 더, <span>똑똑하게.</span></h1><p>신나게 놀다 보면, 실력은 덤.</p></div>
      <div className="handwritten"><Icon name="star" size={40}/><span>오늘은 어떤 게임?</span></div>
    </section>
    <section className="featured" aria-labelledby="featured-title">
      <Art kind="rocket" className="featured-art" />
      <div className="featured-copy">
        <h2 id="featured-title">숫자 팡팡</h2>
        <p>생각보다 손이 먼저! 정답을 터뜨려 콤보를 이어가요.</p>
        <span className="challenge-text">60초 스피드 챌린지</span>
        <div className="featured-actions"><button className="primary-button" onClick={() => onPlay('math')}><Icon name="play" size={30}/>지금 플레이</button><div className="best-score"><span>최고 기록</span><strong>{best.toLocaleString()}점</strong></div></div>
      </div>
    </section>
    <section className="game-library" aria-labelledby="library-title">
      <div className="library-heading"><h2 id="library-title">골라 하는 재미</h2>
        <div className="filters" aria-label="게임 종류">{['전체', '수학', '단어', '기억력', '상식', '레이싱', '디펜스'].map(item => <button key={item} className={category === item ? 'selected' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      </div>
      <div className="game-grid">{games.map(id => {
        const info = GAME_INFO[id];
        return <button className={`game-card ${info.color}`} key={id} onClick={() => onPlay(id)} aria-label={`${info.title} 플레이`}>
          <div className="game-card-copy"><h3>{info.title}</h3><p>{info.description}</p></div>
          <Art kind={info.art}/><span className="round-play"><Icon name="play" size={29}/></span>
        </button>;
      })}</div>
    </section>
    {(category === '전체' || category === '디펜스') && <section className="prototype-entry" aria-labelledby="prototype-title">
      <div className="prototype-entry-copy">
        <span className="prototype-badge">새로운 플레이 · 프로토타입</span>
        <h2 id="prototype-title">3D 카드 수비대</h2>
        <p>정답으로 마나를 모으고, 네 가지 카드로 다섯 웨이브를 버텨요.</p>
        <small>수학 퀴즈 모드 · 한 판씩 플레이 · 캠페인 진행도와 별도</small>
        <a href="prototype/3d_game.html" className="prototype-play"><Icon name="play" size={22}/>3D 수비 시작</a>
      </div>
      <Art kind="defense"/>
    </section>}
    <footer className="footer"><strong>공부 말고, 일단 플레이.</strong><span><Icon name="keyboard" size={24}/>키보드와 터치 모두 OK</span></footer>
  </main>;
}
