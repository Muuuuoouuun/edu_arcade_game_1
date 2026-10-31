import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DefenseSprite } from './DefenseBoard';
import { DefenseFieldGuide } from './DefenseFieldGuide';
import { Icon } from './Icon';
import { campaignFacilities, campaignRequest, stageUnlocked, trainingCost } from '../games/defense/campaign';
import { getStage, HEROES, STAGES } from '../games/defense/data';
import { DIFFICULTIES, DIFFICULTY_ORDER, getDifficulty } from '../games/defense/difficulty';
import type { Campaign, Difficulty, HeroId } from '../games/defense/types';
import { DEFENSE_THEMES, THEME_ORDER, themeUnlocked } from '../games/defense/themes';
import type { DefenseThemeId } from '../games/defense/themes';
import '../camp.css';
import '../defense-difficulty.css';
import '../defense-themes.css';
import '../camp-art.css';

type Props = {
  campaign: Campaign;
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
const regionNames = {forest:'청록의 숲',snow:'서리산맥'};
const regionArt = {forest:'/defense/forest.png',snow:'/defense/snow.png'};
const regionSummary = {forest:'숲길과 물길을 따라, 이웃 마을을 지켜요.',snow:'빙판을 달리는 적들과 서리군주가 기다려요.'};

export default function DefenseCamp({campaign,onDepart,onChooseHero,onSelectDifficulty,onTrain,onExit,storageFailed,themeId,onSelectTheme,themeStorageFailed}:Props) {
  const menuRef = useRef<HTMLElement>(null);
  const [section,setSection] = useState<'expedition'|'companions'|'home'>('expedition');
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
  const snowOpen = stageUnlocked(campaign,5);
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
      <button className="camp-back" onClick={onExit}><Icon name="back" size={18}/><span>게임으로</span></button>
      <h1>아르카나 수비대</h1>
      <span className="camp-gold" aria-label={`성장 골드 ${campaign.gold}`}><Gold/>{campaign.gold.toLocaleString()}<small>G</small></span>
    </div>
    {storageFailed ? <p className="camp-save-warning" role="status">진행을 저장할 수 없어요. 현재 원정은 계속할 수 있지만, 창을 닫으면 기록이 사라질 수 있어요.</p> : null}
    <section className="camp-panorama" aria-labelledby="camp-panorama-title">
      <picture key={themeId}>
        <img src={theme.image} width="1200" height="800" alt={`${theme.name}, 원정을 준비하는 수비대의 거점`} fetchPriority="high" decoding="async"/>
      </picture>
      <div className="camp-panorama-shade"/>
      <div className="camp-panorama-copy">
        <p className="camp-art-kicker">ARCANA · 수비대의 거점</p>
        <h2 id="camp-panorama-title">모험이 시작되는 곳</h2>
        <p>{theme.name}에서 동료를 모으고,<br/>다음 마을로 떠날 준비를 해요.</p>
        <div className="camp-panorama-party"><DefenseSprite index={HEROES[campaign.selectedHero].sprite}/><span><small>이번 원정의 영웅</small><strong>{HEROES[campaign.selectedHero].name}</strong></span><button onClick={()=>{setSection('companions');menuRef.current?.scrollIntoView({block:'start',behavior:'instant'});menuRef.current?.querySelector<HTMLButtonElement>('[data-camp-menu=companions]')?.focus({preventScroll:true});}}>동료 선택 ↗</button></div>
      </div>
      <div className="camp-expedition-card">
        <span>다음 목적지 · {difficultyInfo.name}</span>
        <h3>{stage.label} {stage.name}</h3>
        <p>{stage.weather} · {completed?'다시 지키는 마을':'새로운 구조 요청'}</p>
        <button className="camp-enter-stage" onClick={()=>onDepart(stage.id)} disabled={!stageUnlocked(campaign,stage.id)}><Icon name="play" size={20}/>스테이지 입장<span aria-hidden="true">↗</span></button>
        <small>입장 후 전장에서 타워를 배치해요</small>
      </div>
      <span className="camp-panorama-caption">{theme.name} · {campaign.cleared.length}개 원정 완료</span>
    </section>
    <nav ref={menuRef} className="camp-art-nav" aria-label="원정 준비 메뉴">
      {([{id:'expedition',name:'원정 선택',detail:'지역과 난이도'},{id:'companions',name:'동료',detail:'출전 영웅과 장비'},{id:'home',name:'나의 거점',detail:'테마와 시설'}] as const).map(item=><button key={item.id} data-camp-menu={item.id} aria-controls="camp-preparation-panel" aria-pressed={section===item.id} onClick={()=>setSection(item.id)}><strong>{item.name}</strong><span>{item.detail}</span></button>)}
    </nav>
    <div className="camp-layout" id="camp-preparation-panel" role="region" aria-label={section==='expedition'?'원정 선택':section==='companions'?'동료와 장비':'거점 테마와 시설'}>
      <section className="camp-village" aria-labelledby="camp-title">
        <div className="camp-intro"><h2 id="camp-title">수비대의 거점</h2><p>{campaign.cleared.length ? '구해 낸 사람들이 모여, 다음 모험을 준비합니다.' : '이안과 함께 시작하는, 우리 수비대의 첫 모험.'}</p></div>
        <div className="camp-home">
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
          <section className="camp-services" aria-labelledby="camp-services-title">
            <div className="camp-services-heading"><h3 id="camp-services-title">문을 연 시설</h3><span>동료 {campaign.visitors.length}명 · 시설 {facilities.length}곳</span></div>
            <div className="camp-service-list">{facilities.map(f=><button key={f.id} className={`camp-service ${selectedFacility===f.id?'selected':''}`} onClick={()=>setSelectedFacility(current=>current===f.id?null:f.id)} aria-label={`${f.name} 살펴보기`} aria-expanded={selectedFacility===f.id} aria-controls="camp-service-detail">
              <DefenseSprite index={f.sprite ?? 7}/><span>{f.id==='ranger'?'정찰 초소':f.name}</span><Icon name="back" size={14}/>
            </button>)}</div>
            <div id="camp-service-detail">{focusedFacility?<div className="camp-service-detail" role="status"><div><strong>{focusedFacility.name}</strong><p>{focusedFacility.description}</p></div><button onClick={()=>setSelectedFacility(null)} aria-label="시설 안내 닫기"><Icon name="close" size={17}/></button></div>:null}</div>
            {!campaign.cleared.length?<p className="camp-service-next">첫 방어를 마치면 새로운 동료와 시설이 찾아옵니다.</p>:null}
          </section>
        </div>
        <section className="camp-roster" aria-label="출전 영웅 선택">
          <div className="camp-roster-heading"><h2>함께하는 동료</h2><span>영웅을 고르고 원정을 떠나요</span></div>
          <div className={`camp-heroes ${campaign.visitors.length>4?'camp-heroes-many':''}`}>
            {campaign.visitors.map(id=><button key={id} className={campaign.selectedHero===id?'selected':''} onClick={()=>onChooseHero(id)} aria-label={`${HEROES[id].name} 출전 영웅 선택`} aria-pressed={campaign.selectedHero===id}>
              <DefenseSprite index={HEROES[id].sprite}/><span><strong>{HEROES[id].name}</strong><small>{HEROES[id].role}</small>{campaign.selectedHero===id?<em>출전 영웅</em>:null}</span>
            </button>)}
          </div>
          {nextVisitorStage?.visitor?<p className="camp-next-arrival"><Icon name="star" size={16}/>{nextVisitorStage.label} 방어를 마치면 <strong>{HEROES[nextVisitorStage.visitor].name}</strong>의 방문이 기다리고 있어요.</p>:<p className="camp-next-arrival"><Icon name="star" size={16}/>여섯 동료가 모였어요. 서로 다른 조합으로 원정에 도전해요.</p>}
        </section>
      </section>
      <aside className="camp-command" aria-label="구조 요청과 원정 준비">
        <section className={`camp-letter ${stage.region==='snow'?'camp-letter-snow':''}`} aria-labelledby="request-title">
          <h2 id="request-title">{letterTitle}</h2>
          <div className="camp-letter-rule" aria-hidden="true"/>
          <p className="camp-sender"><span>보낸 사람</span><strong>{request?.stage===selectedStage?request.from:stage.region==='snow'?'서리산맥의 전령':'청록 마을의 촌장'}</strong></p>
          <p className="camp-letter-body">{letterBody}</p>
          <div className="camp-region-art"><img src={regionArt[stage.region]} alt={stage.region==='snow'?'눈 덮인 서리산맥의 전장':'청록의 숲과 물길'}/><span>{stage.label} {stage.name}</span></div>
          <div className="camp-difficulty" role="group" aria-labelledby="camp-difficulty-title">
            <h3 id="camp-difficulty-title">원정 난이도</h3>
            <div className="camp-difficulty-choices">{DIFFICULTY_ORDER.map(mode=><button key={mode} type="button" className={difficulty===mode?'selected':''} aria-pressed={difficulty===mode} aria-label={`${DIFFICULTIES[mode].name} 난이도 선택`} onClick={()=>onSelectDifficulty(mode)}><span className={`camp-difficulty-mark camp-difficulty-mark-${mode}`} aria-hidden="true"/><strong>{DIFFICULTIES[mode].name}</strong></button>)}</div>
            <p className="camp-difficulty-description" aria-live="polite">{difficultyInfo.description}</p>
            <p className="camp-difficulty-note">동료 해금과 추가 퀘스트 보상은 같아요.</p>
          </div>
          <div className="camp-request-reward"><span>{completed?'재도전 보상':'첫 방어 보상'}{difficultyInfo.rewardMultiplier>1?<small className="camp-difficulty-reward">정예 +40% 반영</small>:null}</span><strong><Gold/>{departureReward} G</strong></div>
          <p className="camp-quest-preview">{campaign.questClaimed.includes(stage.id)?'추가 퀘스트 보상 수령 완료':`추가 퀘스트 +${stage.questReward} G · ${stage.quest}`}</p>
          <button className="camp-depart" onClick={()=>onDepart(stage.id)} disabled={!stageUnlocked(campaign,stage.id)}><Icon name="play" size={25}/>{completed?'다시 스테이지 입장':'스테이지 입장'}<Icon name="back" size={19}/></button>
          {snowOpen && !campaign.cleared.includes(5) && stage.region==='snow'?<p className="camp-new-request" role="status">숲 너머에서도 수비대를 기다리고 있어요.</p>:null}
        </section>
        <section className="camp-regions" aria-label="지역과 스테이지 선택"><h2>지역 선택</h2>
          <div className="camp-region-tabs">{(['forest','snow'] as const).map(region=><button key={region} onClick={()=>selectRegion(region)} disabled={region==='snow'&&!snowOpen} aria-pressed={stage.region===region} className={stage.region===region?'selected':''}><RegionIcon snow={region==='snow'}/><span>{regionNames[region]}</span></button>)}</div>
          <p>{stage.region==='forest'&&!snowOpen?'숲의 마지막 마을을 지키면, 설산에서 소식이 옵니다.':regionSummary[stage.region]}</p>
          <nav className="camp-stages" aria-label={`${regionNames[stage.region]} 스테이지`}>{chapterStages.map(s=><button key={s.id} className={`${s.id===selectedStage?'selected':''} ${campaign.cleared.includes(s.id)?'complete':''}`} disabled={!stageUnlocked(campaign,s.id)} onClick={()=>setSelectedStage(s.id)} aria-label={`${s.label} ${s.name}${campaign.cleared.includes(s.id)?' 완료':''}`} aria-current={s.id===selectedStage?'step':undefined}><span>{campaign.cleared.includes(s.id)?'✓':s.order}</span><strong>{s.label}</strong></button>)}</nav>
        </section>
        {stageUnlocked(campaign,stage.id)?<DefenseFieldGuide stage={stage.id} difficulty={difficulty}/>:null}
        {forgeOpen?<section className="camp-forge"><DefenseSprite index={22}/><div><h2>공용 장비 Lv.{campaign.training}</h2><p>모든 영웅·타워 공격력 <strong>+{campaign.training*8}%</strong></p><button onClick={onTrain} disabled={campaign.training>=5||campaign.gold<trainingCost(campaign)}>{campaign.training>=5?'최종 강화 완료':<><Gold/>강화 {trainingCost(campaign)} G</>}</button></div></section>:<section className="camp-coming"><DefenseSprite index={2}/><div><h2>길이 안전해지면</h2><p>대장장이를 구하고, 거점에 대장간을 열어요.</p><span>1-2 방어 후 찾아옵니다</span></div></section>}
      </aside>
    </div>
    <p className="camp-save-note">완료한 원정과 성장은 이 브라우저에 저장돼요. 전투 중 배치는 다음 원정에서 새로 준비해요.</p>
    <div className="camp-departure-dock" aria-label="선택한 원정으로 출발">
      <div><strong>{HEROES[campaign.selectedHero].name} · {stage.label}</strong><span>{stage.name} · {difficultyInfo.name}</span></div>
      <button onClick={()=>onDepart(stage.id)} disabled={!stageUnlocked(campaign,stage.id)}><Icon name="play" size={22}/>스테이지 입장</button>
    </div>
  </main>;
}
function Gold(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f6cb68" stroke="#9d7130" strokeWidth="1.6"/><circle cx="12" cy="12" r="7" fill="none" stroke="#fff1b3" strokeWidth="1.2"/><path d="M12 7v10m-2-8 2-2" stroke="#8e6127" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>}
function RegionIcon({snow}:{snow:boolean}){return <svg viewBox="0 0 24 24" aria-hidden="true">{snow?<><path d="m1 21 7-16 5 9 4-12 6 19Z" fill="currentColor"/><path d="m5 12 3-7 4 7-4-2Z M14 11l3-9 3 10-3-3Z" fill="#e5f0e5"/></>:<><path d="M12 1 5 10h3l-5 7h6v6h6v-6h6l-5-7h3Z" fill="currentColor"/></>}</svg>}
