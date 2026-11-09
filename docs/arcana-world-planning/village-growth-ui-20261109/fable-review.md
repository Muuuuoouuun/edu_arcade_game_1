## 전제
소스(DefenseCamp.tsx, campaign.ts, followup 문서)만 검토. 스크린샷·CSS·data.ts 미열람. 영웅 이름은 소스 기준: 이안(mage, 시작 영웅), 리엘(ranger, 1-1), 브론(dwarf, 1-2), 청운(shrine, 1-3), 드루이드+펫(beast, 7), 카르(문서). 개명 금지.

## 우선순위 UI 이슈
1. **[높음/전체] 입장 CTA 3중 중복** — `camp-enter-stage`, `camp-depart`, `camp-departure-dock` 모두 `onDepart(stage.id)`. 5탭안에서는 dock 1개만 전역 고정, 나머지는 요청 탭 안 1개로 축소.
2. **[높음/탭] 탭이 상태만 바꿈(확인)** — `section`은 `data-section`과 aria-label만 바꾸고 모든 섹션이 항상 렌더됨. 노출은 CSS 추정(가설). 5탭 전환 시 조건부 렌더로 바꿔야 모바일 스크롤 길이·포커스 이동(`menuRef` 스크롤 로직)이 예측 가능.
3. **[중간/문구] "추가 퀘스트 보상 수령 완료"** — `completeRun`은 `questClaimed`로 자동 1회 지급. "수령"은 버튼을 암시하므로 "퀘스트 완료"로 변경. 수령 버튼 추가 금지(중복 지급 위험).
4. **[중간/정보] 골드 상한 1,000,000 무표시** — `Math.min(MAX_GOLD,…)`로 조용히 절삭. 성장 탭 미리보기에 상한 표시.
5. **[낮음/라벨] 동료 탭 설명 "출전 영웅과 장비"** — 장비(공용 강화)는 `aside`의 `camp-forge`에 있음. 성장 탭으로 이동하면 해소.

## 5탭 매핑·점진 해금(알림 없음)
- 마을: 기존 home(테마·시설). 항상.
- 동료: roster + `acknowledgeVisitor`. `visitors−seenVisitors`가 있을 때만 점 1개, 탭 진입 시 해제. 항상.
- 요청: letter·지역·FieldGuide·난이도. 항상.
- 성장: `visitors.includes('dwarf')`(1-2 클리어) 후 노출. 이전엔 기존 `camp-coming` 문구만.
- 가방: 유물 1개 획득 전까지 탭 자체 숨김. **현재 Campaign 타입·normalize에 아이템 없음(미구현)**.

## 비전투 NPC 3역(신규 재화·타이머·뽑기 없음)
1. **촌장/전령(요청자)** — `campaignRequest().from`('청록 마을의 촌장'/'서리산맥의 전령') 재사용, `stageReason`을 대사로 출력.
2. **기록관(마을 변화)** — `territoryProgress`·`campaignFacilities` 파생. 클리어 1·2·3·7에 초소(sprite 4)·대장간(22)·도원(23)·쉼터(24) 레이어가 파노라마에 추가, 5 클리어 시 설산 깃발. 데이터 추가 없이 `cleared`만 읽음.
3. **보관인(가방)** — 유물 이름만 보관(조류 나침반·폭풍 옥종, 문서상 수치 미정). 장착 슬롯 1, 효과는 "미정" 표기, 전투 적용 안 함.

## 요청→보상→강화 흐름
요청 탭 선택 → 입장 → `completeRun`이 클리어 골드+퀘스트 골드를 1회 자동 합산(`processedRuns`·`questClaimed`) → 결과 화면 `resultFollowUp.pendingQuest` 안내 → 성장 탭 **결정적 미리보기**: `Lv.{training}→{training+1}`, `+{training*8}%→+{(training+1)*8}%`, 비용 `trainingCost`, 잔액 `gold−cost`. 이 골드는 영구 성장 골드이며 전투 코인(`state.coins`)과 별개임을 한 줄로 명시.

## 엣지 케이스
- 유물 저장 시 `version` 변경 금지: normalize는 `version!==1`이면 `createCampaign()`으로 **전체 초기화**. 선택 필드로 추가.
- `storageFailed` 중 강화: 골드 소모 후 기록 소실 가능 → 성장 탭에도 경고 재노출.
- 패배 시 `min(40,kills*2)` 지급, 퀘스트 0 — 결과 문구 분리.
- 재도전에서 퀘스트 조건 충족 시 1회 지급됨 → "클리어한 마을도 퀘스트 가능" 안내가 `questsLeft`와 일치해야 함.
- 보상 배율은 `state.difficulty` 기준. 거점 미리보기(`campaign.difficulty`)와 입장 직전 동일해야 함.
- `processedRuns` 100개 초과 시 오래된 runId 탈락(가설: 재지급 가능성 낮음).

## 모바일 수용 기준(문서 390×844·844×390 기준)
- 5탭 터치 영역 ≥44px, 가로 넘침 없음, `aria-pressed` 유지.
- 화면당 주 CTA 1개, dock 항상 보임.
- 성장 미리보기 전/후 값이 스크롤 없이 한 화면.
- 해금 전 탭은 비활성 아닌 숨김, 배지는 미확인 동료 1종만.
- 실기기 검증 전 성능·출시 품질 주장 금지(문서 방침 준수).