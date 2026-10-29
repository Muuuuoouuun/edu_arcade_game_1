import { Icon } from './Icon';

export function Header({ page, sound, name, onPage, onSound, onProfile }: {
  page: 'games' | 'records'; sound: boolean; name: string;
  onPage: (page: 'games' | 'records') => void; onSound: () => void; onProfile: () => void;
}) {
  return <header className="header">
    <button className="brand" onClick={() => onPage('games')} aria-label="플레이그라운드 홈"><Icon name="gamepad" size={44} /><span>PLAYGROUND</span></button>
    <nav className="nav" aria-label="주 메뉴">
      <button className={page === 'games' ? 'active' : ''} onClick={() => onPage('games')} aria-current={page === 'games' ? 'page' : undefined}>게임</button>
      <button className={page === 'records' ? 'active' : ''} onClick={() => onPage('records')} aria-current={page === 'records' ? 'page' : undefined}>내 기록</button>
    </nav>
    <div className="header-actions">
      <button className="icon-button sound-button" onClick={onSound} aria-label={sound ? '효과음 끄기' : '효과음 켜기'} aria-pressed={sound}><Icon name={sound ? 'sound' : 'muted'} size={26}/></button>
      <button className="icon-button avatar" onClick={onProfile} aria-label={`${name} 프로필 수정`}><Icon name="user" size={25}/></button>
    </div>
  </header>;
}
