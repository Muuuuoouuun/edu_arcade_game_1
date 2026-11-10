import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Dialog } from './components/Dialog';
import { Icon } from './components/Icon';
import { readCampaign } from './games/defense/campaign';
import { STAGE_COUNT } from './games/defense/data';
import { addRound, readSaved, saveState } from './lib/storage';
import type { RoundRecord } from './lib/storage';
import { playSound, setSound, unlockAudio } from './lib/sound';
import { NATIVE_BACK } from './lib/nativeEvents';

const DefenseGame = lazy(() => import('./components/DefenseGame'));

/** The standalone game shares only legacy preferences and campaign data with the arcade. */
export default function ArcanaApp() {
  const [saved, setSaved] = useState(readSaved);
  const [campaign, setCampaign] = useState(readCampaign);
  const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState(false);
  const hasJourney = campaign.cleared.length > 0 || campaign.processedRuns.length > 0;

  useEffect(() => { saveState(saved); setSound(saved.sound); }, [saved]);
  const finish = useCallback((record: RoundRecord) => setSaved(previous => addRound(previous, record)), []);
  const leave = useCallback(() => {
    setPlaying(false);
    setCampaign(readCampaign());
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  useEffect(() => {
    const back = (event: Event) => {
      // Native runtime gives dialogs and battle's Escape handler first refusal.
      // Only an unhandled camp back reaches here; title back may minimize the app.
      if (playing) { event.preventDefault(); leave(); }
    };
    window.addEventListener(NATIVE_BACK, back);
    return () => window.removeEventListener(NATIVE_BACK, back);
  }, [playing, leave]);
  const start = () => {
    unlockAudio(); playSound('start'); setPlaying(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const toggleSound = () => {
    setSaved(previous => ({ ...previous, sound: !previous.sound }));
    unlockAudio();
  };

  return <div className={`arcana-app ${playing ? 'arcana-playing' : 'arcana-on-title'}`}>
    <a className="skip-link" href="#main">본문으로 바로 가기</a>
    {playing ? <Suspense fallback={<main id="main" className="arcana-loading" role="status"><span aria-hidden="true">✦</span>마을의 문을 여는 중…</main>}>
      <DefenseGame blocked={settings} sound={saved.sound} onToggleSound={toggleSound} onExit={leave} onFinish={finish}/>
    </Suspense> : <main id="main" className="arcana-title">
      <div className="arcana-title-art" aria-hidden="true"/>
      <div className="arcana-title-haze" aria-hidden="true"/>
      <div className="arcana-title-content">
        <header className="arcana-title-top"><span className="arcana-world-mark">✦ THE GUARDIANS OF ARCANA</span><button className="arcana-settings-button" onClick={() => setSettings(true)} aria-label="게임 설정 열기"><SettingsIcon/></button></header>
        <div className="arcana-title-brand"><p>작은 마을에서 시작되는 큰 모험</p><span className="arcana-wordmark" aria-hidden="true">ARCANA</span><h1>아르카나 수비대</h1><div className="arcana-title-rule" aria-hidden="true"><i/>✦<i/></div></div>
        <div className="arcana-title-bottom">
          <p className="arcana-title-story">동료를 모으고, 마을을 지켜라.<br/>다음 모험이 당신을 기다린다.</p>
          {hasJourney ? <div className="arcana-journey"><span>당신의 수비대</span><strong>구한 마을 {campaign.cleared.length}/{STAGE_COUNT} <i>·</i> 동료 {campaign.visitors.length}명</strong></div> : <p className="arcana-title-chapter">첫 번째 이야기 · 청록의 숲</p>}
          <button className="arcana-start" onClick={start}><Icon name="play" size={25}/><span>{hasJourney ? '모험 이어가기' : '수비대 결성하기'}</span><span aria-hidden="true">→</span></button>
          <p className="arcana-title-save">진행 상황은 이 기기에 저장됩니다</p>
        </div>
      </div>
    </main>}
    {settings ? <Dialog title="게임 설정" className="arcana-settings-dialog" onClose={() => setSettings(false)}>
      <button className="arcana-dialog-close" onClick={() => setSettings(false)} aria-label="설정 닫기"><Icon name="close"/></button>
      <p className="arcana-eyebrow">ARCANA</p><h2>게임 설정</h2>
      <div className="arcana-setting-row"><span><strong>효과음과 진동</strong><small>공격과 결정적인 순간의 피드백</small></span><button role="switch" aria-checked={saved.sound} aria-label="효과음과 진동" onClick={toggleSound}><Icon name={saved.sound ? 'sound' : 'muted'} size={20}/>{saved.sound ? '켜짐' : '꺼짐'}</button></div>
      <p className="arcana-settings-note">진동은 지원 기기에서만 작동합니다. 기기의 동작 줄이기 설정을 사용하면 화면 연출과 진동을 줄입니다.</p>
      <div className="arcana-settings-world"><strong>아르카나 수비대</strong><p>한 명의 영웅, 서로 다른 동료들.<br/>작은 마을을 지키며 넓혀 가는 판타지 원정.</p></div>
      <button className="arcana-start arcana-settings-done" onClick={() => setSettings(false)}>돌아가기</button>
    </Dialog> : null}
  </div>;
}

function SettingsIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3 1-2h4l1 2 2 1 2-.1 2 3-1 2v3l1 2-2 3-2-.1-2 1-1 2h-4l-1-2-2-1-2 .1-2-3 1-2V9L3 7l2-3 2 .1Z" transform="translate(0 1)"/><circle cx="12" cy="12" r="3.5"/></svg>;
}
