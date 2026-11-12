import { DefenseTerrain3D } from './DefenseTerrain3D';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DefenseSprite } from './DefenseBoard';
import { DefenseFieldGuide } from './DefenseFieldGuide';
import { Icon } from './Icon';
import { Dialog } from './Dialog';
import { campaignFacilities, campaignRequest, stageReason, stageUnlocked, territoryProgress, trainingCost } from '../games/defense/campaign';
import { getStage, HEROES, STAGES } from '../games/defense/data';
import { DIFFICULTIES, DIFFICULTY_ORDER, getDifficulty } from '../games/defense/difficulty';
import type { Campaign, Difficulty, HeroId } from '../games/defense/types';
import { DEFENSE_THEMES, THEME_ORDER, themeUnlocked } from '../games/defense/themes';
import type { DefenseThemeId } from '../games/defense/themes';
import '../camp.css';
import '../defense-difficulty.css';
import '../defense-themes.css';
import '../camp-art.css';
import '../camp-redesign.css';
import '../arcana-selection.css';
import '../legion.css';

type Props = {
  campaign: Campaign;
  onLegion: () => void;
  onDepart: (stage: number) => void;
  onChooseHero: (hero: HeroId) => void;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  onTrain: () => void;
  onExit: () => void;
  storageFailed: boolean;
  themeId: DefenseThemeId;
  onSelectTheme: (theme: DefenseThemeId) => void;
  themeStorageFailed: boolean;
};
type FacilityId = ReturnType<typeof campaignFacilities>[number]['id'];
const heroOrder:HeroId[] = ['mage','elf','dwarf','tao','barbarian','druid'];
const difficultyTags:Record<Difficulty,string> = {relaxed:'가볍게 모험',standard:'균형 잡힌 도전',veteran:'빠르고 거센 습격'};
const regionNames = {forest:'청록의 숲',snow:'서리산맥'};
const regionSummary = {forest:'숲길과 물길을 따라, 이웃 마을을 지켜요.',snow:'빙판을 달리는 적들과 서리군주가 기다려요.'};

export default function DefenseCamp({onLegion,campaign,onDepart,onChooseHero,onSelectDifficulty,onTrain,onExit,storageFailed,themeId,onSelectTheme,themeStorageFailed}:Props) {
  const menuRef = useRef<HTMLElement>(null);
  const [section,setSection] = useState<'expedition'|'companions'|'home'|'growth'>('home');
  const [confirmUpgrade,setConfirmUpgrade] = useState(false);
  const [previewHero,setPreviewHero] = useState<HeroId|null>(null);
  const [heroNotice,setHeroNotice] = useState('');
  const [upgradeNotice,setUpgradeNotice] = useState('');
  const previousTraining = useRef(campaign.training);
  useEffect(()=>{
    if(campaign.training>previousTraining.current)setUpgradeNotice(`공용 장비 Lv.${campaign.training} 강화 완료 · 모든 영웅·타워 공격력 +${campaign.training*8}%`);
    previousTraining.current = campaign.training;
  },[campaign.training]);
  const openSection = (next:typeof section) => {
    setSection(next);
    menuRef.current?.scrollIntoView({block:'start',behavior:'instant'});
    menuRef.current?.querySelector<HTMLButtonElement>(`[data-camp-menu=${next}]`)?.focus({preventScroll:true});
  };
  const request = campaignRequest(campaign);
  const [selectedStage,setSelectedStage] = useState(request?.stage ?? 8);
  const [selectedFacility,setSelectedFacility] = useState<FacilityId|null>(null);
  const stage = getStage(selectedStage);
  const theme = DEFENSE_THEMES[themeId];
  const facilities = campaignFacilities(campaign).filter(f=>f.unlocked);
  const focusedFacility = facilities.find(f=>f.id===selectedFacility);
  const completed = campaign.cleared.includes(selectedStage);
  const difficulty = getDifficulty(campaign.difficulty);
  const difficultyInfo = DIFFICULTIES[difficulty];
  const departureReward = Math.round((completed ? 30 + stage.id * 10 : 100 + stage.id * 40) * difficultyInfo.rewardMultiplier);
  const nextVisitorStage = STAGES.find(s=>s.visitor && !campaign.visitors.includes(s.visitor));
  const forgeOpen = campaign.visitors.includes('dwarf');
  const cost = trainingCost(campaign);
  const atMax = campaign.training>=5;
  const canUpgrade = forgeOpen&&!atMax&&campaign.gold>=cost;
  const snowOpen = stageUnlocked(campaign,5);
  const territory = territoryProgress(campaign);
  const reason = stageReason(campaign,stage.id);
  const allDone = campaign.cleared.length === STAGES.length;
  const chapterStages = STAGES.filter(s=>s.region===stage.region);
  const selectRegion = (region:'forest'|'snow') => {
    const stages = STAGES.filter(s=>s.region===region);
    const next = stages.find(s=>!campaign.cleared.includes(s.id));
    setSelectedStage(next && stageUnlocked(campaign,next.id) ? next.id : stages[0].id);
  };
  const letterTitle = allDone ? '두 지역에 평화가 찾아왔어요' : completed ? '다시 찾아가는 마을' : stage.region==='snow' ? '설산에서 온 구조 요청' : campaign.cleared.length ? '새로운 구조 요청' : '우리 마을을 지켜 주세요';
  const letterBody = allDone ? '함께 모인 수비대로 다른 조합을 시험해 보세요. 아직 놓친 추가 퀘스트에도 다시 도전할 수 있어요.' : completed ? `${stage.name}의 길목을 다시 지켜 주세요. 새로운 영웅과 타워 조합을 시험할 수 있어요.` : stage.story;
  return <main className="camp-page camp-themed camp-art" id="main" data-screen="preparation" data-section={section} data-theme={themeId} style={{'--theme-accent':theme.accent,'--theme-ink':theme.ink} as CSSProperties}>
    <div className="camp-heading">
      <button className="camp-back" onClick={onExit}><Icon name="back" size={18}/><span>뒤로</span></button>
      <h1>아르카나 수비대</h1>
      <span className="camp-gold" aria-label={`성장 골드 ${campaign.gold}`}><Gold/>{campaign.gold.toLocaleString()}<small>G</small></span>
    </div>
    {storageFailed ? <p className="camp-save-warning" role="status">진행을 저장할 수 없어요. 현재 원정은 계속할 수 있지만, 창을 닫으면 기록이 사라질 수 있어요.</p> : null}
    <a className="camp-frontier-entry" href="/frontier.html"><span><b>변경 전장 · 입체 공간에서 다른 방식으로 싸워요</b><small>성문 방어 / 분대 지휘 / 영웅 직접 조작 · 독립 훈련</small></span><strong>입장 ↗</strong></a>
    <a className="camp-frontier-entry" href="/rush.html"><span><b>마을 수비 · 아르카나 러시</b><small>3D 직접 전투와 마을 성장 · 원정과 성장·보상을 따로 저장해요</small></span><strong>입장 ↗</strong></a>
    <button className="camp-legion-entry" onClick={onLegion}><span className="legion-entry-mark" aria-hidden="true">⚑</span><span><strong>군단 방어</strong><small>배치·소환만으로 싸우는 자동 전투 · 3개 진입로 · 4번의 습격</small></span><b aria-hidden="true">↗</b></button>
    <section className="camp-panorama" aria-labelledby="camp-panorama-title">
      <picture key={themeId}>
        <img src={theme.image} width="1200" height="800" alt={`${theme.name}, 원정을 준비하는 수비대의 거점`} fetchPriority="high" decoding="async"/>
      </picture>
      <div className="camp-panorama-shade"/>
      <div className="camp-panorama-copy">
        <p className="camp-art-kicker">ARCANA · 수비대의 거점</p>
        <h2 id="camp-panorama-title">{section==='growth'?'브론의 대장간':section==='companions'?'함께 지키는 사람들':section==='expedition'?'다음 마을의 부름':theme.name}</h2>
        <p>{theme.name}에서 동료를 모으고,<br/>다음 마을로 떠날 준비를 해요.</p>
        <div className="camp-panorama-party"><DefenseSprite index={HEROES[campaign.selectedHero].sprite}/><span><small>이번 원정의 영웅</small><strong>{HEROES[campaign.selectedHero].name}</strong></span><button onClick={()=>openSection('companions')}>동료 선택 ↗</button></div>
      </div>
      <div className="camp-expedition-card">
        <span>다음 목적지 · {difficultyInfo.name}</span>
        <h3>{stage.label} {stage.name}</h3>
        <p>{stage.weather} · {completed?'다시 지키는 마을':'새로운 구조 요청'}</p>
        <p className="camp-territory" aria-label={`구한 마을 ${territory.rescued}곳, 전체 ${territory.total}곳${territory.questsLeft?`, 남은 추가 퀘스트 ${territory.questsLeft}개`:''}`}><span className="camp-territory-pips" aria-hidden="true">{STAGES.map(s=><i key={s.id} className={campaign.cleared.includes(s.id)?'on':s.id===stage.id?'now':''}/>)}</span><b>구한 마을 {territory.rescued}/{territory.total}</b>{territory.questsLeft?<em>추가 퀘스트 {territory.questsLeft}개 남음</em>:null}</p>
        {reason?<p className="camp-stage-reason" data-reason={reason.kind}>{reason.kind==='visitor'?<>첫 방어 시 <b>{HEROES[reason.hero].name}</b> 합류</>:reason.kind==='region'?<>방어하면 <b>설산</b>에서 구조 요청이 와요</>:<>추가 퀘스트 <b>+{reason.reward} G</b></>}</p>:null}
        <button className="camp-enter-stage" onClick={()=>onDepart(stage.id)} disabled={!stageUnlocked(campaign,stage.id)}><Icon name="play" size={20}/>스테이지 입장<span aria-hidden="true">↗</span></button>
        <small>입장 후 전장에서 타워를 배치해요</small>
      </div>
      <span className="camp-panorama-caption">{theme.name} · {campaign.cleared.length}개 원정 완료</span>
    </section>
    <nav ref={menuRef} className="camp-art-nav" aria-label="원정 준비 메뉴">
      {([{id:'home',name:'마을',detail:'풍경과 시설'},{id:'companions',name:'동료',detail:'출전 영웅'},{id:'growth',name:'성장',detail:'공용 장비'},{id:'expedition',name:'원정',detail:'요청과 보상'}] as const).map(item=><button key={item.id} data-camp-menu={item.id} aria-controls="camp-preparation-panel" aria-pressed={section===item.id} onClick={()=>setSection(item.id)}><strong>{item.name}</strong><span>{item.detail}</span></button>)}
    </nav>
    <div className="camp-layout" id="camp-preparation-panel" role="region" aria-label={section==='expedition'?'원정 선택':section==='companions'?'출전 영웅':section==='growth'?'공용 장비 강화':'거점 테마와 시설'}>
      <section className="camp-village" aria-labelledby="camp-title">
        <div className="camp-intro"><h2 id="camp-title">수비대의 거점</h2><p>{campaign.cleared.length ? '구해 낸 사람들이 모여, 다음 모험을 준비합니다.' : '이안과 함께 시작하는, 우리 수비대의 첫 모험.'}</p></div>
        <div className="camp-home">
          <section className="camp-hero-state"><div><p className="camp-art-kicker">우리 마을의 오늘</p><h2>동료 {campaign.visitors.length}명 · 열린 시설 {facilities.length}곳</h2><p>{nextVisitorStage?.visitor?`${nextVisitorStage.label} 방어 후 ${HEROES[nextVisitorStage.visitor].name}이 찾아옵니다.`:'모든 동료가 모였어요. 다음 원정을 함께 준비하세요.'}</p></div><button className="camp-facility-action" onClick={()=>openSection('companions')}>동료 만나기 ↗</button></section>
          <section className="camp-services" aria-labelledby="camp-services-title">
            <div className="camp-services-heading"><h3 id="camp-services-title">문을 연 시설</h3><span>시설을 눌러 안으로 들어가요</span></div>
            <div className="camp-service-list">{facilities.map(f=><button key={f.id} className={`camp-service ${selectedFacility===f.id?'selected':''}`} onClick={()=>setSelectedFacility(current=>current===f.id?null:f.id)} aria-label={`${f.name} 살펴보기`} aria-expanded={selectedFacility===f.id} aria-controls="camp-service-detail">
              <DefenseSprite index={f.sprite ?? 7}/><span>{f.id==='ranger'?'정찰 초소':f.name}</span><Icon name="back" size={14}/>
            </button>)}</div>
            <div id="camp-service-detail">{focusedFacility?<div className="camp-service-detail" role="status"><div><strong>{focusedFacility.name}</strong><p>{focusedFacility.description}</p><button className="camp-facility-action" onClick={()=>openSection(focusedFacility.id==='forge'?'growth':'companions')}>{focusedFacility.id==='forge'?'장비 강화하러 가기':'동료 편성하러 가기'} ↗</button></div><button onClick={()=>setSelectedFacility(null)} aria-label="시설 안내 닫기"><Icon name="close" size={17}/></button></div>:null}</div>
            {!campaign.cleared.length?<p className="camp-service-next">첫 방어를 마치면 새로운 동료와 시설이 찾아옵니다.</p>:null}
          </section>
          <section className="camp-theme-picker" aria-labelledby="camp-theme-title">
            <div className="camp-theme-heading"><h3 id="camp-theme-title">거점 테마</h3><p>거점과 성문의 외형이 바뀌어요. 전투 능력은 같아요.</p></div>
            <div className="camp-theme-options">{THEME_ORDER.map(id=>{
              const option=DEFENSE_THEMES[id],unlocked=themeUnlocked(id,campaign.cleared),selected=themeId===id;
              const unlockLabel=option.unlockStage ? `${getStage(option.unlockStage).label} 방어 후` : '처음부터 사용';
              return <button key={id} type="button" className={`camp-theme-option ${selected?'selected':''}`} data-theme-id={id} disabled={!unlocked} aria-pressed={selected} aria-label={`${option.name} 테마${unlocked?' 선택':` · ${unlockLabel} 해금`}`} onClick={()=>onSelectTheme(id)}>
                <img src={option.thumbnail} width="600" height="400" alt="" loading="lazy" decoding="async"/>
                <span><strong>{option.name}</strong><small>{selected?'✓ 적용 중':unlocked?'선택하기':unlockLabel}</small></span>
              </button>;
            })}</div>
            {themeStorageFailed?<p className="camp-theme-save-warning" role="status">선택한 테마를 저장하지 못했어요. 지금 원정에는 적용돼요.</p>:null}
          </section>
        </div>
        <section className="camp-roster" aria-label="출전 영웅 선택">
          <div className="camp-roster-heading"><h2>함께하는 동료</h2><span>영웅을 고르고 원정을 떠나요</span></div>
          <div className="camp-current-hero"><DefenseSprite index={HEROES[campaign.selectedHero].sprite}/><div><span>이번 원정의 영웅</span><strong>{HEROES[campaign.selectedHero].name}</strong><p>{HEROES[campaign.selectedHero].trait}</p></div><span className="camp-hero-ready">편성 중</span></div>
          <div className="camp-heroes camp-heroes-many">
            {heroOrder.map(id=>{
              const unlocked=campaign.visitors.includes(id),arrival=STAGES.find(s=>s.visitor===id),selected=campaign.selectedHero===id;
              return <button key={id} className={`${selected?'selected':''} ${unlocked?'':'camp-hero-locked'}`} onClick={()=>setPreviewHero(id)} disabled={!unlocked} aria-label={`${HEROES[id].name} ${unlocked?'영웅 살펴보기':`${arrival?.label} 방어 후 합류`}`} aria-pressed={selected}>
                <span className="camp-hero-card-art"><DefenseSprite index={HEROES[id].sprite}/></span><span><strong>{HEROES[id].name}</strong><small>{HEROES[id].role}</small><em>{selected?'출전 영웅':unlocked?'살펴보기 ↗':`${arrival?.label} 방어 후 합류`}</em></span>
              </button>;
            })}
          </div>
          <p className="camp-hero-selection-notice" role="status">{heroNotice}</p>
          <p className="camp-party-note">영웅 편성은 무료 · 용병 한 명은 전장에서 120코인으로 고용</p>
          {nextVisitorStage?.visitor?<p className="camp-next-arrival"><Icon name="star" size={16}/>{nextVisitorStage.label} 방어를 마치면 <strong>{HEROES[nextVisitorStage.visitor].name}</strong>의 방문이 기다리고 있어요.</p>:<p className="camp-next-arrival"><Icon name="star" size={16}/>여섯 동료가 모였어요. 서로 다른 조합으로 원정에 도전해요.</p>}
        </section>
      </section>
      <aside className="camp-command" aria-label="구조 요청과 원정 준비">
        <section className={`camp-letter ${stage.region==='snow'?'camp-letter-snow':''}`} aria-labelledby="request-title">
          <h2 id="request-title">{letterTitle}</h2>
          <div className="camp-letter-rule" aria-hidden="true"/>
          <p className="camp-sender"><span>보낸 사람</span><strong>{request?.stage===selectedStage?request.from:stage.region==='snow'?'서리산맥의 전령':'청록 마을의 촌장'}</strong></p>
          <p className="camp-letter-body">{letterBody}</p>
          <div className="camp-region-art" role="img" aria-label={stage.region==='snow'?'서리산맥의 입체 지형':'청록의 숲과 물길의 입체 지형'}><DefenseTerrain3D stage={stage.id} mode="camp"/><span>{stage.label} {stage.name}</span></div>
          <div className="camp-difficulty" role="group" aria-labelledby="camp-difficulty-title">
            <h3 id="camp-difficulty-title">원정 난이도</h3>
            <div className="camp-difficulty-choices">{DIFFICULTY_ORDER.map(mode=><button key={mode} type="button" className={difficulty===mode?'selected':''} aria-pressed={difficulty===mode} aria-label={`${DIFFICULTIES[mode].name} 난이도 선택`} onClick={()=>onSelectDifficulty(mode)}><span className={`camp-difficulty-mark camp-difficulty-mark-${mode}`} aria-hidden="true"/><strong>{DIFFICULTIES[mode].name}</strong><small>{difficultyTags[mode]}</small></button>)}</div>
            <p className="camp-difficulty-description" aria-live="polite">{difficultyInfo.description}</p>
            <p className="camp-difficulty-note">동료 해금과 추가 퀘스트 보상은 같아요.</p>
          </div>
          <div className="camp-request-reward"><span>{completed?'재도전 보상':'첫 방어 보상'}{difficultyInfo.rewardMultiplier>1?<small className="camp-difficulty-reward">정예 +{Math.round((difficultyInfo.rewardMultiplier-1)*100)}% 반영</small>:null}</span><strong><Gold/>{departureReward} G</strong></div>
          <p className="camp-quest-preview">{campaign.questClaimed.includes(stage.id)?'추가 퀘스트 보상 지급 완료':`추가 퀘스트 +${stage.questReward} G · ${stage.quest}`}</p>
          <button className="camp-depart" onClick={()=>onDepart(stage.id)} disabled={!stageUnlocked(campaign,stage.id)}><Icon name="play" size={25}/>{completed?'다시 스테이지 입장':'스테이지 입장'}<Icon name="back" size={19}/></button>
          {snowOpen && !campaign.cleared.includes(5) && stage.region==='snow'?<p className="camp-new-request" role="status">숲 너머에서도 수비대를 기다리고 있어요.</p>:null}
        </section>
        <section className="camp-regions" aria-label="지역과 스테이지 선택"><h2>지역 선택</h2>
          <div className="camp-region-tabs">{(['forest','snow'] as const).map(region=><button key={region} onClick={()=>selectRegion(region)} disabled={region==='snow'&&!snowOpen} aria-pressed={stage.region===region} className={stage.region===region?'selected':''}><RegionIcon snow={region==='snow'}/><span>{regionNames[region]}</span></button>)}</div>
          <p>{stage.region==='forest'&&!snowOpen?'숲의 마지막 마을을 지키면, 설산에서 소식이 옵니다.':regionSummary[stage.region]}</p>
          <nav className="camp-stages" aria-label={`${regionNames[stage.region]} 스테이지`}>{chapterStages.map(s=><button key={s.id} className={`${s.id===selectedStage?'selected':''} ${campaign.cleared.includes(s.id)?'complete':''}`} disabled={!stageUnlocked(campaign,s.id)} onClick={()=>setSelectedStage(s.id)} aria-label={`${s.label} ${s.name}${campaign.cleared.includes(s.id)?' 완료':''}`} aria-current={s.id===selectedStage?'step':undefined}><span className="camp-stage-number">{campaign.cleared.includes(s.id)?'✓':s.order}</span><span className="camp-stage-card-copy"><strong>{s.label} · {s.name}</strong><small>{!stageUnlocked(campaign,s.id)?`${getStage(s.id-1).label} 방어 후 개방`:s.weather}</small></span><span className="camp-stage-state">{campaign.cleared.includes(s.id)?'방어 완료':s.id===selectedStage?'선택됨':stageUnlocked(campaign,s.id)?'원정':'잠김'}</span></button>)}</nav>
        </section>
        {stageUnlocked(campaign,stage.id)?<DefenseFieldGuide stage={stage.id} difficulty={difficulty}/>:null}

      </aside>
      <section className="camp-growth" aria-labelledby="growth-title">
        <div className="camp-upgrade-hero"><div className="camp-upgrade-glow"/><img src="/defense/models/dwarf-guardian.png" width="640" height="640" alt="큰 망치를 든 드워프 공병 브론" loading="lazy"/><span>BRON · 수비대의 대장장이</span><p>“다음 방어는 더 든든하게 준비하지.”</p></div>
        <div className="camp-upgrade-copy"><p className="camp-art-kicker">오래 남는 성장</p><h2 id="growth-title">{forgeOpen?'공용 장비를 더 단단하게':'브론이 찾아오면 문을 열어요'}</h2><p>{forgeOpen?'모든 영웅과 타워에 적용되는 영구 공격력 강화입니다.':'1-2 제재소를 지키면 브론과 대장간이 함께 찾아옵니다.'}</p>
          {forgeOpen?<><div className="camp-upgrade-stats"><div><span>현재 · Lv.{campaign.training}</span><strong>+{campaign.training*8}%</strong></div><div><span>{atMax?'최종 단계':'다음 · Lv.'+(campaign.training+1)}</span><strong>+{Math.min(5,campaign.training+1)*8}%</strong></div></div>
          <dl className="camp-upgrade-cost"><div><dt>보유 성장 골드</dt><dd>{campaign.gold.toLocaleString()} G</dd></div><div><dt>강화 비용</dt><dd>{atMax?'—':`${cost} G`}</dd></div><div><dt>{atMax?'추가 강화':campaign.gold>=cost?'강화 후 남는 골드':'부족한 골드'}</dt><dd>{atMax?'—':`${Math.abs(campaign.gold-cost).toLocaleString()} G`}</dd></div></dl>
          {storageFailed?<p className="camp-save-warning" role="status">진행을 저장할 수 없어요. 지금 강화해도 창을 닫으면 반영되지 않을 수 있어요.</p>:null}
          <button className="camp-upgrade-action" disabled={!canUpgrade} onClick={()=>setConfirmUpgrade(true)}>{atMax?'최종 강화 완료':canUpgrade?`강화하기 · ${cost} G`:`${cost-campaign.gold} G가 더 필요해요`}</button>
          {!atMax&&!canUpgrade?<button className="camp-facility-action" onClick={()=>openSection('expedition')}>보상을 얻을 원정 보기 ↗</button>:null}
          <p className="camp-upgrade-notice" role="status">{upgradeNotice}</p></>:<button className="camp-upgrade-action" onClick={()=>{setSelectedStage(request?.stage??1);openSection('expedition');}}>구조 원정 계속하기</button>}
          <div className="camp-upgrade-note"><strong>성장 골드와 전투 코인은 달라요</strong><p>이 강화는 다음 원정에도 남아요. 전투 중 포탑 레벨·속성 선택·용병 고용은 이번 원정에만 적용됩니다.</p></div>
        </div>
      </section>
    </div>
    <p className="camp-save-note">완료한 원정과 성장은 이 기기에 저장돼요. 전투 중 배치는 다음 원정에서 새로 준비해요.</p>
    {section==='expedition'?<div className="camp-departure-dock" aria-label="선택한 원정으로 출발">
      <div><strong>{HEROES[campaign.selectedHero].name} · {stage.label}</strong><span>{stage.name} · {difficultyInfo.name}</span></div>
      <button onClick={()=>onDepart(stage.id)} disabled={!stageUnlocked(campaign,stage.id)}><Icon name="play" size={22}/>스테이지 입장</button>
    </div>:null}
    {previewHero?<Dialog title={`${HEROES[previewHero].name} 출전 영웅 선택`} className="camp-hero-dialog" onClose={()=>setPreviewHero(null)}>
      <div className="camp-hero-dialog-heading"><p className="camp-art-kicker">수비대 편성</p><button className="camp-hero-dialog-close" onClick={()=>setPreviewHero(null)} aria-label="영웅 선택 닫기"><Icon name="close" size={20}/></button></div>
      <div className="camp-hero-portrait" style={{'--hero-color':HEROES[previewHero].color} as CSSProperties}><DefenseSprite index={HEROES[previewHero].sprite}/><span aria-hidden="true"/></div>
      <div className="camp-hero-dialog-copy"><p>{HEROES[previewHero].role}</p><h2>{HEROES[previewHero].name}</h2><p>{HEROES[previewHero].description}</p><div className="camp-hero-skill"><Icon name="star" size={18}/><span><small>필살기</small><strong>{HEROES[previewHero].skill}</strong></span></div><p className="camp-hero-confirm-note">무료 편성 · 골드를 사용하지 않아요</p></div>
      <div className="camp-hero-dialog-actions"><button onClick={()=>setPreviewHero(null)}>돌아가기</button><button className="camp-upgrade-action" onClick={()=>{if(campaign.visitors.includes(previewHero)){onChooseHero(previewHero);setHeroNotice(`${HEROES[previewHero].name} 편성 완료`);}setPreviewHero(null);}}>이 영웅으로 출전</button></div>
    </Dialog>:null}
    {confirmUpgrade?<Dialog title="공용 장비 강화 확인" className="camp-upgrade-dialog" onClose={()=>setConfirmUpgrade(false)}><p className="camp-art-kicker">공용 장비 강화</p><h2>Lv.{campaign.training} → Lv.{campaign.training+1}</h2><p>모든 영웅·타워 공격력 +{campaign.training*8}% → +{(campaign.training+1)*8}%</p><dl className="camp-upgrade-cost"><div><dt>사용할 성장 골드</dt><dd>{cost} G</dd></div><div><dt>강화 후 잔액</dt><dd>{Math.max(0,campaign.gold-cost).toLocaleString()} G</dd></div></dl>{storageFailed?<p className="camp-save-warning" role="status">저장할 수 없는 상태예요. 지금 강화해도 창을 닫으면 반영되지 않을 수 있어요.</p>:null}<div className="camp-upgrade-dialog-actions"><button onClick={()=>setConfirmUpgrade(false)}>돌아가기</button><button className="camp-upgrade-action" disabled={!canUpgrade} onClick={()=>{if(canUpgrade)onTrain();setConfirmUpgrade(false);}}>강화 확정</button></div></Dialog>:null}
  </main>;
}
function Gold(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f6cb68" stroke="#9d7130" strokeWidth="1.6"/><circle cx="12" cy="12" r="7" fill="none" stroke="#fff1b3" strokeWidth="1.2"/><path d="M12 7v10m-2-8 2-2" stroke="#8e6127" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>}
function RegionIcon({snow}:{snow:boolean}){return <svg viewBox="0 0 24 24" aria-hidden="true">{snow?<><path d="m1 21 7-16 5 9 4-12 6 19Z" fill="currentColor"/><path d="m5 12 3-7 4 7-4-2Z M14 11l3-9 3 10-3-3Z" fill="#e5f0e5"/></>:<><path d="M12 1 5 10h3l-5 7h6v6h6v-6h6l-5-7h3Z" fill="currentColor"/></>}</svg>}
