# 아르카나 수비대 — 기술 아키텍처 (v0.1)

> 작성: 테크 리드 / 기준 문서: `00_brief.md` (고정 전제를 그대로 따름)
> 현재 저장소 상태: README만 있는 빈 저장소(`edu_arcade_game_1` = "교육용 게임 허브"). 빌드 설정·패키지 매니저·CI 모두 없음. 아래는 **처음부터 정하는** 구조이며, 수치(번들 크기 등)는 대략치이므로 마일스톤 1의 스파이크에서 실측으로 확정한다.

---

## 1. 스택 결정과 근거

### 1.1 요구 조건 (브리프에서 도출)

- 웹 브라우저, 모바일 세로/가로 + PC 마우스·키보드. 저사양 안드로이드까지.
- 1판 3~5분, "짧게 자주" 플레이 → **첫 로드가 가벼워야** 재방문 마찰이 줄어든다.
- 화면 요소는 많지 않다(적 수십 마리, 타워 슬롯 수 개, 투사체/이펙트). 물리 엔진·복잡한 씬 그래프 불필요.
- 문제 UI는 텍스트가 핵심(한글 표시, 4지선다 + 짧은 입력). **IME 입력(한글/영어), 접근성, 텍스트 렌더링 품질**이 중요.
- 허브에는 앞으로 다른 교육 게임이 들어온다. 게임마다 엔진을 강제하지 않는 구조가 유리.

### 1.2 후보 비교

번들 크기는 minify+gzip 기준 대략치(버전·트리셰이킹에 따라 달라짐). 마일스톤 1에서 실측.

| 항목 | Vanilla TS + Canvas 2D | Phaser 3 | PixiJS (v8) |
|---|---|---|---|
| 엔진 번들(gzip, 대략) | **0 KB** (자체 게임 킷 10~25KB) | 약 300~350KB (전체 기능 포함, 트리셰이킹 제한적) | 약 120~200KB (사용 모듈 따라 변동) |
| 학습 곡선 | 낮음(브라우저 표준 API). 단, 입력·에셋 로딩·오디오·씬 관리를 직접 작성 | 중간. 문서/예제 풍부, 팀 신규 합류자 온보딩 쉬움. 규약이 강함 | 중간. 렌더러뿐이라 루프·입력·씬은 직접 작성 |
| 모바일 성능 | 엔티티 ~100개 규모 2D에는 충분. 오프스크린 캐시로 최적화 여지 큼. 대량 스프라이트/파티클은 한계 | WebGL 기반, 대량 스프라이트에 강함. 대신 초기화 비용·메모리 큼 | WebGL/WebGPU, 렌더링 성능 최상급. 저사양 기기에서 WebGL 컨텍스트 이슈 가능성 |
| 여러 게임 공존 | **좋음** — 게임별 번들 분리, 허브가 엔진을 끌어안지 않음 | 게임마다 Phaser 중복 로드 위험(공용 청크로 빼야 함), 전역 상태/캔버스 수명 관리 주의 | 렌더러를 공용 청크로 공유하기 쉬움. 게임 로직은 별도 |
| 텍스트/UI | DOM 오버레이와 자연스럽게 결합 | 자체 텍스트·DOM 엘리먼트 지원, 하지만 IME 입력은 DOM이 낫다 | 텍스트 렌더링 비용(비트맵 폰트 필요 시 한글은 부담) |
| 결정론·헤드리스 시뮬 | 시뮬레이션과 렌더 분리가 **자연스럽다**(애초에 직접 설계) | 엔진 객체에 로직이 엮이기 쉬워 분리 규율 필요 | 렌더러라 분리 용이 |
| 리스크 | 직접 만드는 부분의 버그·유지보수 | 번들 크기, 엔진 버전 종속 | 직접 만드는 부분은 Vanilla와 유사 |

### 1.3 추천: **Vanilla TypeScript + Canvas 2D** (+ DOM 오버레이), Vite 빌드

이유:

1. **번들·로드**: 엔진 0KB로 "초기 로드 < 1.5MB" 예산(10절)에 가장 여유가 크다. 허브 첫 화면 → 게임 진입까지 추가 다운로드가 작다.
2. **게임 규모에 맞음**: 타워 디펜스 2D에는 물리·타일맵·씬 전환 등 Phaser의 핵심 기능이 대부분 불필요하다. 필요한 것은 고정 틱 루프, 스프라이트 그리기, 입력 정도.
3. **시뮬레이션/렌더 분리**: 밸런싱 시뮬레이터(8절)가 이 프로젝트의 성패를 좌우한다. 순수 TS 시뮬레이션 코어를 처음부터 DOM/Canvas 없이 설계하면 헤드리스 1000판이 거의 공짜로 따라온다.
4. **허브 공존**: 허브↔게임 계약(3절)이 엔진 중립이므로, 이후 다른 게임이 Phaser나 PixiJS를 써도 허브는 무관하다. 엔진 선택이 허브의 락인이 되지 않는다.
5. **문제 UI는 DOM**: 하단 문제 카드·입력창·콤보 HUD는 HTML/CSS로 구현(IME, 접근성, 반응형 레이아웃, 스크린 리더). Canvas는 전장(길·적·타워·이펙트)만 담당.

보완 규칙:

- 렌더러를 `Renderer` 인터페이스 뒤에 둔다(`draw(snapshot, alpha)`). 파티클/셰이더 등 연출이 Canvas 2D 한계에 부딪히면 **PixiJS를 렌더러 구현체로만 교체**한다(시뮬·UI·계약 변경 없음). 이것이 탈출구(Plan B). Phaser는 채택하지 않는다.
- "직접 만드는 부분"은 최소 킷으로 제한: 루프, 입력, 에셋 로더, 오디오 래퍼, 스프라이트 아틀라스. 이 킷은 처음엔 `games/arcana-guard/src/engine/`에 두고, 두 번째 게임이 같은 걸 필요로 할 때 `packages/`로 승격한다(미리 추상화하지 않음).

### 1.4 공통 도구 결정

- 언어/빌드: TypeScript(strict), Vite(게임·허브 각각 앱 빌드, 게임은 허브에서 동적 import).
- 패키지 매니저/워크스페이스: pnpm workspaces (Turborepo는 패키지가 4개를 넘고 빌드 시간이 문제가 될 때 도입).
- 테스트: Vitest(단위·시뮬), Playwright(스모크, 모바일 뷰포트 에뮬레이션).
- 린트: ESLint + 패키지 경계 규칙(`games/*`끼리 import 금지, `edu-core`는 DOM 타입 금지).
- 런타임 검증: 콘텐츠 팩·저장 데이터 로드 시 스키마 검증(Valibot/Zod 중 번들이 작은 쪽 — 마일스톤 1에서 실측 후 결정).

---

## 2. 모노레포 디렉터리 제안

```
edu_arcade_game_1/
├─ apps/
│  └─ hub/                     # 허브 웹앱 (진입 화면, 게임 목록, 프로필, 팩 선택, 설정, 교사용 내보내기)
├─ games/
│  └─ arcana-guard/            # 아르카나 수비대 (게임 모듈)
│     ├─ src/
│     │  ├─ index.ts           # GameModule 구현 (허브 계약의 진입점)
│     │  ├─ sim/               # 순수 시뮬레이션 (DOM/Canvas 금지, 시드 RNG) ← 헤드리스 테스트 대상
│     │  ├─ render/            # Canvas 렌더러 (Renderer 구현)
│     │  ├─ ui/                # 문제 카드/HUD (DOM 오버레이)
│     │  ├─ engine/            # 루프·입력·에셋·오디오 최소 킷
│     │  └─ data/              # 카드/적/웨이브/스테이지 정의
│     ├─ sim-cli/              # 밸런싱 시뮬레이터 실행 스크립트 (Node)
│     └─ assets/               # 아틀라스, 사운드
├─ packages/
│  ├─ edu-core/                # 문항 엔진·난이도 적응·복습 큐·로그 스키마·저장 어댑터 인터페이스 (DOM 비의존)
│  └─ ui/                      # 허브/게임 공용 UI 컴포넌트·디자인 토큰·접근성 유틸
├─ docs/arcana-guard/          # 기획 문서 (기존)
├─ prototype/                  # 단일 HTML 프로토타입 (폐기 가능, 정식 구현과 분리)
├─ package.json / pnpm-workspace.yaml / tsconfig.base.json
└─ .github/workflows/          # CI: lint, typecheck, test, sim-regression, build
```

| 패키지 | 책임 |
|---|---|
| `apps/hub` | 게임 카탈로그, 프로필(닉네임만)·과목 팩 선택·설정 화면, 게임 동적 로드와 `GameHost` 구현, 저장소/로그 수집 파이프라인 소유. |
| `games/arcana-guard` | 타워 디펜스 규칙·렌더·UI 전부. 허브가 준 `GameContext`만 사용하고 저장소·네트워크에 직접 접근하지 않는다. |
| `packages/edu-core` | 콘텐츠 팩 로드/검증, 출제기(난이도 적응), 숙련도·봉인 카드(복습 큐) 갱신, 정답 판정/정규화, 로그 이벤트 타입과 빌더, 저장 어댑터 인터페이스. **어떤 게임에서도 재사용**. |
| `packages/ui` | 버튼·모달·토스트·접근성 포커스 처리·디자인 토큰(색/타이포/간격)·터치 타깃 규격. 게임 고유 연출은 포함하지 않는다. |

의존 방향(단방향, ESLint로 강제): `apps/hub → games/*, packages/*` / `games/* → packages/*` / `packages/ui → (없음)` / `packages/edu-core → (없음)`. `games/*` 간 import와 `edu-core → ui` 금지.

게임 격리 방식: 같은 페이지에서 **동적 import로 로드**한다(iframe 아님). 이유: 번들 공유(edu-core), 입력/DOM 접근, 디버깅 단순. 서드파티 게임을 받게 되면 그때 iframe + postMessage 어댑터를 같은 계약 위에 추가한다.

---

## 3. 허브 ↔ 게임 계약

원칙: 게임은 **받은 것만 쓰고 돌려줄 것만 돌려준다**. 저장·전송·사용자 식별은 허브 책임. 계약은 `contractVersion`으로 버전 관리하고 하위 호환을 유지한다.

```ts
// packages/edu-core/src/contract.ts

export const CONTRACT_VERSION = 1;

/** 게임이 export default 로 내보내는 모듈 */
export interface GameModule {
  readonly id: string;               // "arcana-guard"
  readonly contractVersion: number;  // 허브가 호환성 확인
  readonly supportedSubjects: SubjectId[];
  mount(container: HTMLElement, ctx: GameContext): Promise<GameHandle>;
}

/** 허브 → 게임 */
export interface GameContext {
  player: {
    id: PlayerId;                    // 로컬 생성 UUID. 실명/연락처 없음
    nickname: string;
    progress: Readonly<PlayerProgress>; // 이 게임 분량의 스냅샷(읽기 전용)
  };
  pack: ContentPack;                 // 허브가 로드·검증을 마친 선택된 과목 팩
  settings: GameSettings;
  /** 허브가 제공하는 서비스. 게임은 이것만 호출 */
  host: GameHost;
  signal: AbortSignal;               // 허브가 게임을 종료시킬 때 abort
}

export interface GameSettings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  lowPowerMode: "auto" | "on" | "off";  // 렌더 30fps 상한 등
  locale: "ko-KR";
  stageId?: StageId;                 // 허브가 이어하기 등으로 지정할 때
  seed?: number;                     // 재현/테스트용. 없으면 게임이 생성하고 결과에 기록
}

/** 게임 → 허브 (호출형 서비스) */
export interface GameHost {
  /** 로그 이벤트. 허브가 버퍼링·영속화·(2차) 전송 */
  log(event: LogEventInput): void;
  /** 판 종료 시 1회. 허브가 진행도 갱신·저장 */
  reportRunResult(result: RunResult): Promise<void>;
  /** 봉인 카드(틀린 문제) 등록/해제/복습 결과. 진행도 갱신은 허브(edu-core)가 수행 */
  sealItem(itemId: ItemId): void;
  resolveSealed(itemId: ItemId, correct: boolean): void;
  /** 허브 UI로 복귀 요청(메뉴의 '나가기') */
  requestExit(reason: "user" | "completed" | "error"): void;
  /** 에러 보고(허브가 사용자에게 안내) */
  reportError(err: { code: string; message: string; fatal: boolean }): void;
}

/** 허브가 제어하는 게임 인스턴스 */
export interface GameHandle {
  pause(reason: "visibility" | "hub-modal" | "user"): void;
  resume(): void;
  unmount(): Promise<void>;          // 리스너·타이머·오디오·캔버스 전부 해제
}
```

돌려주는 것 정리:

- **결과**: `host.reportRunResult(RunResult)` — 판당 1회(중도 이탈 시 `outcome: "abandoned"`로 1회).
- **로그 이벤트**: `host.log(...)` — 7절 스키마. 게임은 `eventId/ts/seq/sessionId`를 몰라도 되고, 허브가 봉투(envelope)를 채운다(`LogEventInput`은 봉투 필드 제외).
- **진행도 변경**: 게임이 `PlayerProgress`를 직접 수정하지 않는다. 게임은 사실(결과·봉인·해제)만 보고하고, 허브(edu-core 함수)가 진행도를 갱신한다 → 모든 게임이 같은 숙련도 규칙을 공유하고, 충돌 규칙(5절)을 한 곳에서 관리.

게임 수명 주기: `mount → (플레이 중 log/seal/resolveSealed) → reportRunResult → requestExit 또는 재시작 → unmount`. 탭 비활성/모달은 허브가 `pause/resume`을 호출하지만, 게임도 `visibilitychange`를 자체 감시(6절)하여 이중으로 안전.

---

## 4. 데이터 모델

```ts
// packages/edu-core/src/types.ts

type PlayerId = string; type ItemId = string; type SkillId = string;
type PackId = string; type CardId = string; type StageId = string;
type SubjectId = "math" | "english" | "science" | "korean-history";
type Difficulty = 1 | 2 | 3; // 1=쉬움(+3마나) 2=보통(+4) 3=어려움(+5)  ※ 브리프 4절

// ───────── 콘텐츠 팩 ─────────
interface ContentPack {
  schemaVersion: 1;
  id: PackId;                    // "math-fractions-g5"
  version: string;               // semver. 문항 수정 시 올림
  subject: SubjectId;
  title: string;
  gradeRange: [number, number];  // 예: [5, 6]
  skills: Skill[];               // 숙련도 추적 단위 (예: "분수 덧셈")
  items: Item[];
  license?: string;
}
interface Skill { id: SkillId; title: string; prerequisites?: SkillId[]; }

type Item = ChoiceItem | InputItem;
interface ItemBase {
  id: ItemId;                    // 팩 내 영구 ID. 문항 삭제해도 재사용 금지(로그/봉인 큐 참조)
  skillId: SkillId;
  difficulty: Difficulty;
  prompt: string;                // 짧은 문장. 수식은 일반 텍스트 규약(예: "3/4 + 1/4")
  media?: { kind: "image"; src: string; alt: string };
  explanation?: string;          // 해제 퀴즈/오답 후 보여줄 한 줄 해설
  tags?: string[];
}
interface ChoiceItem extends ItemBase {
  format: "choice";
  choices: string[];             // 보통 4개
  answerIndex: number;
  shuffle?: boolean;             // 기본 true
}
interface InputItem extends ItemBase {
  format: "input";
  accepted: string[];            // 허용 정답 목록(정규화 후 비교: 공백/대소문자/분수 표기 등)
  inputKind: "number" | "fraction" | "word";
}

// ───────── 플레이어 진행 (판 간 영구 진행) ─────────
interface PlayerProgress {
  schemaVersion: 1;
  playerId: PlayerId;
  updatedAt: number;                          // epoch ms (프로필 단위 메타)
  cards: Record<CardId, CardProgress>;        // 카드 해금(수집)
  sealed: Record<ItemId, SealedCard>;         // 봉인 카드 큐 (복습 큐)
  mastery: Record<string, Mastery>;           // key = `${packId}:${skillId}`
  stages: Record<StageId, StageProgress>;
  ledger: LedgerEntry[];                      // 카드 조각 등 재화 증감 기록(합산이 잔액)
}
interface CardProgress {
  unlocked: boolean; unlockedAt?: number;
  fragments: number;                          // 파생값 아님: ledger 합산의 캐시
  updatedAt: number;
}
interface SealedCard {
  itemId: ItemId; packId: PackId; skillId: SkillId;
  sealedAt: number;
  wrongCount: number;                         // 누적 오답
  box: 0 | 1 | 2 | 3;                         // 라이트너 상자(0=방금 틀림). 맞히면 +1, 틀리면 0
  dueAt: number;                              // 이 시각 이후 해제 퀴즈 후보
  resolvedAt?: number;                        // 해제 완료(큐에서 제외, 톰스톤 겸용)
  updatedAt: number;
}
interface Mastery {
  packId: PackId; skillId: SkillId;
  level: number;                              // 0~1, 지수이동평균(정답 1/오답 0, 속도 보정)
  attempts: number; correct: number;
  recentDifficulty: Difficulty;               // 적응 출제의 현재 목표 난이도
  medianMs?: number;                          // 최근 N회 응답 시간 중앙값
  updatedAt: number;
}
interface StageProgress { stars: 0|1|2|3; bestRunId?: string; clears: number; updatedAt: number; }
interface LedgerEntry { id: string; at: number; kind: "fragment"; cardId: CardId; delta: number; reason: "run-reward"|"review-bonus"; }

// ───────── 판 결과 ─────────
interface RunResult {
  runId: string;                              // UUID (멱등 키)
  gameId: "arcana-guard";
  playerId: PlayerId;
  packId: PackId; packVersion: string;
  stageId: StageId;
  balanceVersion: string;                     // 밸런스 데이터 버전(시뮬/로그 비교용)
  seed: number;                               // 재현용
  startedAt: number; durationMs: number;      // durationMs = 일시정지 제외 플레이 시간
  outcome: "cleared" | "failed" | "abandoned";
  wavesCleared: number; wavesTotal: number;
  towerHpLeft: number;                        // 0~10
  stars: 0 | 1 | 2 | 3;
  answered: number; correct: number;          // accuracy = correct/answered
  skipped: number;                            // 방치 자동 교체("회피")
  maxCombo: number;
  majorUsed: number;
  newlySealed: ItemId[];                      // 이번 판에서 새로 봉인된 문제
  reviewAttempts: { itemId: ItemId; correct: boolean }[];  // 판 종료 후 해제 퀴즈 결과
  rewards: { cardId: CardId; fragments: number; unlocked?: boolean }[];
}
```

설계 메모:

- **`Item.id`는 영구 ID**. 팩이 갱신돼도 봉인 큐·로그가 같은 문항을 가리켜야 한다. 문항 내용이 의미 있게 바뀌면 새 ID를 부여한다.
- **재화(카드 조각)는 `ledger`(증감 기록) 합산**을 정답으로 보고 `fragments`는 캐시 → 두 기기에서 따로 쌓아도 합산 시 손실이 없다(5절).
- 판 안의 강화(Lv2~4)는 런타임 상태이며 저장하지 않는다(브리프 5절).

---

## 5. 저장 전략

### 5.1 1차: 오프라인 우선, 로컬 저장

| 저장소 | 용도 | 비고 |
|---|---|---|
| IndexedDB (`edu-hub` DB) | 프로필, `PlayerProgress`, 판 결과(`runs`), 로그 이벤트 outbox(`events`), 콘텐츠 팩 캐시 | 래퍼는 얇게 직접 작성 또는 경량 라이브러리 사용. 모든 쓰기는 트랜잭션 |
| localStorage | 마지막 프로필 id, 설정(소리/저전력), 스키마 버전 | 부팅 시 동기 읽기가 필요한 것만. 전부 try/catch(사생활 모드·차단 대비) |
| Cache Storage / Service Worker (PWA) | 앱 셸·아틀라스·팩 JSON 오프라인 캐시 | 마일스톤 4. 업데이트는 "다음 실행 시 적용" |

- **저장소 어댑터 인터페이스**(`StorageAdapter`)를 `edu-core`에 정의하고 IndexedDB 구현을 허브에 둔다. 테스트와 헤드리스 시뮬은 메모리 구현을 쓴다.
- **스키마 버전 + 마이그레이션 함수 체인**(`v1→v2→…`). 로드 시 검증 실패하면 원본을 `backup` 스토어에 보관하고 안전 초기화(사용자에게 안내).
- **저장 시점**: 판 종료(`reportRunResult`) 시 트랜잭션 1회로 `runs + progress + ledger + events` 반영. 로그 이벤트는 판 도중 메모리 버퍼에 쌓고 웨이브 종료/일시정지/`pagehide`에 flush(배터리·성능상 매 이벤트 쓰기 금지).
- **데이터 유실 방지**: `navigator.storage.persist()` 요청. iOS Safari는 장기 미사용 시 스크립트 생성 데이터가 정리될 수 있으므로 (a) 홈 화면 추가(PWA) 안내, (b) **진행도 내보내기/가져오기(JSON 파일)** 를 허브 설정에 1차부터 제공, (c) 2차 동기화를 앞당길 신호로 삼는다.
- **프라이버시**: 식별자는 로컬 UUID와 닉네임뿐. 이름·학교·연락처를 수집하지 않는다. (만 14세 미만 개인정보 이슈는 변경 제안 참고.)

### 5.2 2차: 서버 동기화 전환 경로

단계적으로 **로컬 우선 구조를 깨지 않고** 서버를 덧댄다.

1. **동기화 어댑터 인터페이스 선도입(1차에서)**: `SyncAdapter { pushEvents(batch), pushSnapshot(progress), pull(since) }`. 1차는 `NoopSyncAdapter`.
2. **이벤트 outbox**: 로그 이벤트와 `RunResult`는 불변(append-only) + `eventId/runId` 멱등 키. 서버는 중복 수신을 무시. 전송 실패 시 지수 백오프, 온라인 복귀/`visibilitychange` 시 재시도.
3. **스냅샷 동기화**: `PlayerProgress`는 아래 충돌 규칙으로 병합 후 양방향 반영.
4. **서버 선택**:
   - **추천: Supabase** — Postgres + Row Level Security + 익명 로그인(→ 반 코드/교사 초대로 승격). 교사용 리포트(집계 쿼리)와 가장 맞고 서버 코드 최소.
   - 대안: 단순 REST(소형 서버) — `POST /events`, `PUT /progress/:playerId`, `GET /progress/:playerId?since=`. 교사 기능이 "내보내기" 수준에서 끝난다면 충분.
   - 어느 쪽이든 게임 코드는 변경 없음(허브의 어댑터만 교체).
5. **교사 리포트 1차 대안**: 서버 없이 허브 설정에서 로그를 **JSON/CSV로 내보내기** → 교사에게 전달. 2차에 대시보드로 대체.

### 5.3 충돌 규칙

원칙: **이벤트는 병합하지 않고 합집합**, **상태는 필드 단위 규칙**, 시계 오차를 고려해 서버 수신 시각을 보조 키로 쓴다.

| 데이터 | 규칙 |
|---|---|
| 로그 이벤트 / RunResult | append-only. `eventId`/`runId` 기준 중복 제거 후 합집합. 충돌 없음 |
| 카드 해금(`unlocked`) | 한 번 true면 되돌리지 않음(OR 병합). `unlockedAt`은 더 이른 값 |
| 재화(카드 조각) | `ledger` 항목을 `id` 기준 합집합 → 잔액은 합산. 소비(차감)도 ledger 항목이라 이중 지출 방지는 서버 승인 전까지 "낙관적, 사후 보정" |
| 봉인 카드 큐 | 문항(`itemId`) 단위 LWW(`updatedAt` 큰 쪽). 단 `resolvedAt`이 있으면 톰스톤 우선(다른 기기에서 해제된 건 되살리지 않음), `wrongCount`는 max |
| 숙련도(`mastery`) | 키 단위 LWW. 단 `attempts`가 더 큰 쪽을 우선(데이터가 많은 쪽이 더 신뢰할 만함), 동률이면 `updatedAt` |
| 스테이지 별 | max(stars), clears는 RunResult 합집합에서 재계산 |
| 설정 | LWW (기기별 설정이므로 동기화하지 않아도 됨) |

시계: 클라이언트 `updatedAt`은 신뢰하지 않는 전제로, 서버가 수신 시각을 부여한다. 클라이언트 시계가 미래로 크게 어긋난 값(예: 서버 시각 +1일 초과)은 서버 시각으로 클램프.

---

## 6. 게임 루프

### 6.1 구조: 고정 틱 시뮬레이션 + 가변 렌더

```
rAF(frameTime):
  dt = min(frameTime - last, 250ms)          // 긴 정지 후 폭주 방지
  accumulator += dt
  steps = 0
  while accumulator >= TICK_MS (100) and steps < MAX_CATCHUP (5):
      sim.step(inputQueue.drain())           // 시뮬레이션 1틱 = 0.1초
      accumulator -= TICK_MS; steps++
  if steps == MAX_CATCHUP: accumulator = 0   // 따라잡기 포기(스파이럴 방지)
  alpha = accumulator / TICK_MS              // 0~1
  renderer.draw(sim.snapshot(), alpha)       // 직전·현재 틱 사이를 보간해서 그림
  ui.update(sim.hudState())                  // DOM은 값이 바뀐 때만 갱신
```

- **TICK = 초당 10틱(100ms)** — 브리프의 "10초 방치", "5초 휴식", "1마나/5초" 같은 수치가 모두 틱 정수배(100/50/…틱)로 떨어진다. 틱레이트는 `config.TICK_RATE` 상수로 두어 밸런싱 결과에 따라 변경 가능(예: 투사체 판정이 거칠면 20틱).
- **보간 렌더**: 10틱은 눈으로 보면 끊기므로, 적/투사체 위치는 `prev→curr` 선형 보간해 60fps처럼 보이게 한다. 판정(피격·탑 도달)은 틱에서만 일어난다.
- **시뮬레이션은 시간에 비의존**: `step()`은 `dt`를 받지 않고 틱 수만 센다 → 같은 시드·같은 입력이면 항상 같은 결과(결정론). 난수는 시드 RNG(예: mulberry32) 하나만 사용하고 `Math.random` 금지(lint 규칙).
- **입력은 큐를 거쳐 틱 경계에서 적용**: 답 선택/소환/강화 입력은 `{tick, action}`으로 큐잉. 헤드리스 봇도 같은 입력 인터페이스를 쓴다.
- **실시간 측정과 틱 시간 분리**: 응답 소요 ms(`elapsedMs`)는 `performance.now()` 기준(일시정지 구간 제외). "10초 방치 자동 교체"는 **틱 기준**(일시정지 중엔 진행 안 함). 두 시계를 혼용하지 않는다.

### 6.2 탭 비활성 / 일시정지

- `document.visibilitychange`(hidden) / `pagehide` / `window.blur`(모바일 앱 전환 포함) → 즉시 `pause("visibility")`: 루프 정지(rAF 취소), 오디오 일시정지, 문제 타이머 정지, 로그 버퍼 flush.
- 복귀 시 자동 재개하지 않고 **"계속하기" 오버레이 + 3초 카운트다운**(아이가 놀라지 않도록). 일시정지 중 흐른 실시간은 `accumulator`에 반영하지 않는다(복귀 직후 `last = now`로 재설정).
- 허브 모달/뒤로가기도 `GameHandle.pause`로 동일 경로.

### 6.3 모바일 배터리·발열

- **렌더 비용 절감**: 정적 배경(길, 탑, 슬롯)은 오프스크린 캔버스에 1회 렌더 후 `drawImage`. 변화 있는 레이어만 매 프레임 갱신. 스프라이트는 단일 아틀라스. 캔버스 `alpha: false`, `desynchronized` 힌트는 실측 후 결정.
- **해상도 제한**: 논리 해상도(가로 960×540 / 세로 540×960 기준)를 CSS로 스케일하고, `devicePixelRatio`는 상한 2(저사양/저전력 모드 1.5 이하).
- **프레임 상한**: 보간 렌더라 30fps로 내려도 게임플레이는 동일. 저전력 모드 `on`이거나, 최근 3초 p95 프레임 시간 > 20ms면 자동으로 30fps 상한(`auto`)으로 낮춘다. `Battery Status API`는 지원이 불균일하므로 의존하지 않는다(사용자 설정 + 프레임 시간 기반).
- **일시정지 시 완전 정지**: 정지 상태에서 rAF/타이머/오디오 컨텍스트 모두 중단(`audioContext.suspend()`).
- **메모리/GC**: 틱 루프에서 객체 생성 최소화(적·투사체·이펙트 오브젝트 풀링), 문자열 연결·배열 재할당 지양.
- **`prefers-reduced-motion`** 반영: 화면 흔들림·번쩍임 제거, 파티클 축소.

---

## 7. 로그 이벤트 스키마 (교사 리포트용)

### 7.1 봉투(envelope) — 모든 이벤트 공통, 허브가 채움

| 필드 | 설명 |
|---|---|
| `schema` | 스키마 버전 (정수, 현재 1) |
| `eventId` | UUID (멱등 키) |
| `type` | 이벤트 종류 |
| `ts` | 발생 시각 epoch ms (클라이언트) |
| `seq` | 세션 내 증가 번호(순서 복원) |
| `playerId` / `sessionId` / `runId` | 누구의 / 앱 실행 단위 / 판 단위 |
| `gameId` / `packId` / `packVersion` | 어떤 게임·팩에서 |
| `data` | 이벤트별 본문(아래) |

### 7.2 이벤트별 `data`

| type | 필드 |
|---|---|
| `item_shown` | `itemId, skillId, difficulty, format, waveIndex, source`("normal" \| "review") |
| `item_answered` | `itemId, skillId, correct, elapsedMs, difficulty, response`(선택한 index 또는 입력 문자열), `comboBefore, manaGained, waveIndex, source` |
| `item_skipped` | `itemId, skillId, difficulty, reason`("idle_timeout" \| "user_swap"), `elapsedMs, waveIndex` (브리프의 "회피") |
| `wave_cleared` | `waveIndex, towerHpLeft, answered, correct, skipped, maxCombo, durationMs` |
| `run_finished` | `outcome, stageId, stars, wavesCleared, towerHpLeft, answered, correct, skipped, maxCombo, majorUsed, durationMs, newlySealed, balanceVersion, seed` |

- `elapsedMs` = 문제가 화면에 뜬 시점부터 응답까지의 **일시정지 제외** 실시간.
- 교사 리포트의 핵심 지표(정답률, 평균/중앙 응답 시간, 스킬별 약점, 회피율, 복습 해제율)가 위 필드만으로 계산되도록 설계했다.
- **정답 자체(정답 텍스트)는 로그에 넣지 않는다**(문항은 `itemId`+`packVersion`으로 조회). 오답 분석을 위해 `response`는 기록.
- 성능: 이벤트는 작게(대략 200~300B), 한 판 약 60~120개 → 한 판 최대 수십 KB 이하.

### 7.3 JSON 예시

```json
{
  "schema": 1,
  "eventId": "0b7d2d4e-6e0e-4c5b-9a2f-0f6a1c1d9a11",
  "type": "item_answered",
  "ts": 1767225612345,
  "seq": 42,
  "playerId": "p_8c1f2a",
  "sessionId": "s_41aa90",
  "runId": "r_a7b3c2",
  "gameId": "arcana-guard",
  "packId": "math-fractions-g5",
  "packVersion": "1.0.2",
  "data": {
    "itemId": "mf-0173",
    "skillId": "frac-add-unlike",
    "correct": false,
    "elapsedMs": 6420,
    "difficulty": 2,
    "response": 1,
    "comboBefore": 4,
    "manaGained": 0,
    "waveIndex": 2,
    "source": "normal"
  }
}
```

```json
{
  "schema": 1, "eventId": "5d1c7a8e-2f0b-4c0a-b1d3-77e5a9f0c202", "type": "item_skipped",
  "ts": 1767225630001, "seq": 44, "playerId": "p_8c1f2a", "sessionId": "s_41aa90", "runId": "r_a7b3c2",
  "gameId": "arcana-guard", "packId": "math-fractions-g5", "packVersion": "1.0.2",
  "data": { "itemId": "mf-0181", "skillId": "frac-compare", "difficulty": 3,
            "reason": "idle_timeout", "elapsedMs": 10000, "waveIndex": 2 }
}
```

```json
{
  "schema": 1, "eventId": "c9a0e1f3-3b6d-4f55-8d0e-1a2b3c4d5e33", "type": "wave_cleared",
  "ts": 1767225688000, "seq": 61, "playerId": "p_8c1f2a", "sessionId": "s_41aa90", "runId": "r_a7b3c2",
  "gameId": "arcana-guard", "packId": "math-fractions-g5", "packVersion": "1.0.2",
  "data": { "waveIndex": 2, "towerHpLeft": 8, "answered": 9, "correct": 7,
            "skipped": 1, "maxCombo": 5, "durationMs": 41200 }
}
```

```json
{
  "schema": 1, "eventId": "e2f4a6b8-1c3d-4e5f-9a7b-8c9d0e1f2a44", "type": "run_finished",
  "ts": 1767225802000, "seq": 118, "playerId": "p_8c1f2a", "sessionId": "s_41aa90", "runId": "r_a7b3c2",
  "gameId": "arcana-guard", "packId": "math-fractions-g5", "packVersion": "1.0.2",
  "data": { "outcome": "cleared", "stageId": "stage-01", "stars": 2, "wavesCleared": 5,
            "towerHpLeft": 7, "answered": 41, "correct": 33, "skipped": 2, "maxCombo": 8,
            "majorUsed": 1, "durationMs": 214000, "newlySealed": ["mf-0173", "mf-0190"],
            "balanceVersion": "0.3.0", "seed": 918273645 }
}
```

(`item_shown`은 `item_answered`와 같은 봉투에 `data: { itemId, skillId, difficulty, format, waveIndex, source }`.)

---

## 8. 테스트 전략

### 8.1 밸런싱 시뮬레이터 (헤드리스 1000판)

**전제**: `games/arcana-guard/src/sim/`은 DOM/Canvas/`Math.random`/`Date.now`를 쓰지 않는 순수 TS. 입력은 `{tick, action}` 큐, 상태는 직렬화 가능.

구성:

1. **시뮬 코어**: `createRun(config, seed) → Run`, `run.step(actions)`, `run.isOver()`, `run.result()`. 브라우저 게임과 **같은 코드**를 쓴다(복사본 금지 → 시뮬 결과가 실제 게임과 일치).
2. **봇(플레이어 모델)**: 사람 플레이를 파라미터로 모사.
   - `accuracy`(정답 확률, 난이도별), `responseTime`(로그정규분포 평균/분산, 난이도별), `idleRate`(방치 확률),
   - 소환/강화 정책(그리디: 마나가 차면 비용 대비 효율 높은 행동; 속성 균형형/단일 속성형 등 2~3종).
   - 프로필 예: `expert`(정답 95%, 3초), `average`(80%, 5초), `struggling`(55%, 8초), `idle`(문제를 안 풂).
3. **CLI**(`sim-cli/`): `pnpm sim --runs 1000 --profile average --stage stage-01 --seed 1`. 시드를 `seed0 + i`로 바꿔 1000판 실행, 병렬은 `worker_threads`. 한 판 = 약 2,000~3,000틱(3~5분 × 10틱/초 ≈ 1,800~3,000)이므로 1000판은 수십 초 이내 목표.
4. **산출물**: 프로필별 클리어율, 별 분포, 탑 HP 분포(히스토그램), 웨이브별 이탈 지점(어느 웨이브에서 실패하는가), 평균 마나 획득/사용, 콤보 3/5/8 도달 비율, 메이저 사용 횟수, 판 길이 분포. JSON + 표 출력.
5. **회귀 가드(CI)**: `balance-targets.json`에 프로필별 **허용 구간**을 둔다. 예(초안, 수치는 밸런싱 문서가 확정):
   - `expert` 클리어율 85~97%, `average` 60~80%, `struggling` 25~45%
   - **`idle`(안 풀기) 클리어율 0% — 필수 불변식** (브리프 3절: "문제를 안 풀고 버티는 전략은 불가능")
   - 정답률이 높을수록 클리어율이 단조 증가(`accuracy` 스윕 40%→100%, 10% 단위로 확인)
   구간을 벗어나면 CI 실패 → 데이터(카드/적/웨이브) 변경 PR이 밸런스를 깨는 것을 막는다. 시드 1000개 고정이므로 노이즈 없음(결정론).
6. **민감도 분석**: 정답 마나 +3/4/5, 자동 회복, 소환 비용 등 한 파라미터씩 ±20% 스윕해 클리어율 변화를 표로 출력 → 밸런싱 문서의 조정 근거로 사용.

### 8.2 단위 테스트 대상 (Vitest)

| 대상 | 핵심 케이스 |
|---|---|
| `edu-core` 출제기 | 난이도 적응(연속 정답 시 상향·오답 시 하향·경계값), 스킬 선행조건, 최근 출제 문항 중복 회피, 봉인 카드 우선 편성 비율 |
| 정답 판정/정규화 | 분수 표기("1/2" = "2/4"?는 팩 정책에 따라), 소수, 공백·전각 문자, 영어 대소문자, 한글 자모 조합 상태 |
| 숙련도 갱신 | EMA 계산, 속도 보정, `attempts` 누적, 상한/하한 |
| 봉인 큐 | 등록·중복 등록, 라이트너 상자 승급/강등, `dueAt` 계산, 해제 퀴즈 선택(1~3개) |
| 콘텐츠 팩 검증 | 필수 필드, `answerIndex` 범위, ID 중복, 존재하지 않는 `skillId`, 입력형 `accepted` 비어 있음 |
| 병합 함수(5.3) | 각 규칙의 교환·결합·멱등 성질(property-based: 순서를 섞어도 결과 동일) |
| 로그 빌더 | 스키마 필수 필드, `seq` 단조 증가, 일시정지 제외 `elapsedMs` |
| 시뮬 코어 | 결정론(같은 시드·입력 → 동일 결과 해시), 콤보 3/5/8 효과, 탑 HP 감소 규칙(일반 -1/정예 -2/보스 -5), 마나 소스 제한, 방치 10초 자동 교체 |
| 게임 루프 | 가짜 시계로 accumulator 동작(긴 정지 후 최대 5틱 캐치업), 일시정지 시 시간 미진행 |
| 저장 어댑터 | 마이그레이션 체인, 손상 데이터 복구, 쿼터 초과 처리(메모리 구현 + fake-indexeddb) |

### 8.3 그 외

- **통합/스모크(Playwright)**: 허브 → 팩 선택 → 게임 마운트 → 한 판(속도 배율 지원 테스트 훅) → 결과 저장 → 새로고침 후 진행도 유지. 모바일 뷰포트(세로/가로)와 PC 둘 다.
- **계약 테스트**: 가짜 `GameHost`로 `GameModule` 계약 위반(unmount 후 리스너 잔존, 결과 미보고 등) 점검.
- **실기기 체크리스트**(수동, 마일스톤마다): 저사양 안드로이드 1대, iOS Safari 1대 — 입력 지연, 한글 IME, 백그라운드 전환, 발열.
- **접근성**: 키보드만으로 문제 응답(1~4 키), 포커스 표시, 색 대비(WCAG AA), 색에만 의존하지 않는 속성 구분.

---

## 9. 성능 예산

### 9.1 로드

| 항목 | 예산 |
|---|---|
| **초기 로드 총량**(허브 첫 화면 → 첫 판 시작 가능, 전송량 기준) | **< 1.5MB** |
| JS 합계(gzip): 허브 + edu-core + ui + 게임 코어 | 목표 < 150KB (엔진 미사용 덕분) |
| 게임 청크 | 허브 첫 화면에서는 로드하지 않고 선택 시 동적 import. 로드 후 첫 판까지 추가 < 1MB |
| 스프라이트 아틀라스 | 합계 < 500KB (WebP/PNG 팔레트 최적화). 스테이지별 지연 로드 |
| 오디오 | 첫 판 필수 분량 < 300KB(짧은 효과음 몇 개, 압축). BGM·나머지는 사용자 첫 입력 이후 지연 로드 |
| 콘텐츠 팩 | 팩당 JSON gzip < 150KB. 선택한 팩만 로드·캐시 |
| 폰트 | **한글 웹폰트 전체 임베드 금지**(1MB 이상 가능). 시스템 폰트 스택 우선. 로고/제목용은 사용 글자만 서브셋(woff2) |
| 첫 화면(LCP) | 저사양 안드로이드 4G 환경 3초 이내 |

예산 초과는 CI에서 `size-limit` 같은 번들 가드로 실패 처리.

### 9.2 런타임 (기준 기기: 저사양 안드로이드)

기준 기기 정의(예): RAM 2~3GB, 엔트리급 SoC(예: Cortex-A53 계열 8코어 1.8GHz 이하 / Mali-G52급), Android Chrome 최신-2 버전. 구체 모델은 마일스톤 1에서 확정.

| 항목 | 예산 / 조건 |
|---|---|
| 프레임 | 목표 60fps. **프레임당 JS(틱+렌더+UI) 평균 ≤ 8ms, p95 ≤ 14ms** |
| 60fps 유지 조건 | 동시 활성 적 ≤ 40, 투사체 ≤ 60, 파티클 ≤ 150, 캔버스 백버퍼 ≤ 약 1M 픽셀(DPR 상한 적용) |
| 폴백 | 최근 3초 p95 > 20ms면 자동 30fps 상한 + 파티클 절반. 30fps에서도 게임플레이 동일(시뮬 10틱 고정) |
| 입력 지연 | 답 선택 탭 → 시각 피드백 < 100ms |
| 메모리 | 게임 실행 중 JS 힙 + 텍스처 합계 < 150MB, 판 반복 10회 후 증가 < 10%(누수 점검) |
| GC | 틱 루프에서 프레임당 할당 최소화(풀링). 장기 GC 정지로 인한 끊김(>50ms) 3분 플레이 중 0~1회 |
| 배터리/발열 | 5분 플레이 시 기기 표면 온도 급상승·쓰로틀링 없음(수동 점검), 백그라운드 전환 시 CPU 사용 0 |

측정 방법: Chrome DevTools 원격 디버깅 + 게임 내 `?perf=1` 오버레이(프레임 시간 p50/p95, 틱 시간, 엔티티 수) + CI의 번들 크기 리포트. 마일스톤마다 같은 시나리오(스테이지 5웨이브 최대 부하)로 비교.

---

## 10. 1차 구현 마일스톤 (4개, 각 1~2주)

### M1. 기반 공사 + 기술 스파이크 (1~2주)

- 범위: pnpm 모노레포, Vite, TS strict, ESLint 경계 규칙, Vitest, CI(lint/typecheck/test/build/size-limit). `apps/hub` 셸(게임 목록 1개, 프로필 생성, 팩 선택 스텁). `GameModule` 계약과 `GameHost` 구현. `edu-core` 뼈대(팩 로더+검증, 로그 타입). `games/arcana-guard`에 고정 틱 루프 + Canvas에 길·탑·적 1종 이동. 저사양 안드로이드에서 60fps 스파이크. 번들 크기 실측(스택 결정의 검증).
- 완료 기준: (1) CI 그린, (2) 허브에서 게임 진입→나가기→재진입 시 누수 없음(계약 테스트 통과), (3) 기준 기기에서 적 40마리 이동 p95 프레임 ≤ 14ms 실측치 기록, (4) 초기 로드 실측치가 예산의 70% 이하. 미달 시 PixiJS 렌더러 전환 여부를 이 시점에 결정.

### M2. 핵심 루프 플레이 가능 + 시뮬레이터 v0 (1~2주)

- 범위: 문제 카드(DOM, 4지선다+입력) → 마나 → 소환/강화 → 4속성 타워 → 적 3종+보스 → 웨이브 5개 → 콤보 3/5/8 → 탑 HP/별 판정. 수학 샘플 팩. 일시정지/탭 비활성 처리. `sim/` 순수화 + 봇 2종 + CLI로 1000판 실행.
- 완료 기준: (1) 한 판(3~5분)을 처음부터 끝까지 모바일/PC에서 플레이 가능, (2) 시뮬 1000판이 60초 이내 완료, `idle` 봇 클리어율 0%, (3) 같은 시드 재실행 시 결과 해시 동일(결정론), (4) 브리프 4절 수치가 `data/`에 반영되고 코드에 하드코딩 없음.

### M3. 메타 진행 + 복습 루프 + 저장 + 로그 (1~2주)

- 범위: IndexedDB 저장(마이그레이션 포함), 카드 해금/조각 ledger, 봉인 카드 큐 + 판 종료 후 해제 퀴즈(1~3개) + 시작 마나 보너스, 난이도 적응 출제, 로그 이벤트 5종 수집·저장, 로그/진행도 JSON·CSV 내보내기, 4개 과목 팩 로드(샘플 분량이어도 형식 검증 통과), 메이저 아르카나 3종.
- 완료 기준: (1) 새로고침/재시작 후 진행도·봉인 큐 유지, (2) 오답 → 봉인 → 다음 판 해제 퀴즈 → 맞히면 보너스까지 E2E 통과, (3) 7절 스키마의 이벤트 5종이 실제 판에서 생성되고 CSV로 정답률·평균 응답 시간 계산 가능, (4) 병합 함수 property 테스트 통과(2차 동기화 준비), (5) 팩 4종 검증 통과.

### M4. 밸런싱·성능·오프라인·출시 준비 (1~2주)

- 범위: 시뮬 기반 밸런스 조정 + `balance-targets.json` CI 가드, 성능 최적화(오프스크린 캐시, 풀링, 저전력 모드), PWA 오프라인(서비스 워커), 접근성(키보드·대비·reduced motion), 튜토리얼 스테이지(웨이브 3개), `SyncAdapter` 인터페이스와 Noop 구현(2차 대비), 실기기 테스트.
- 완료 기준: (1) 9절 예산 전부 충족 또는 예외 승인 기록, (2) 프로필별 클리어율이 목표 구간 안(CI 통과), (3) 비행기 모드에서 설치된 PWA로 한 판 완주·저장, (4) 저사양 안드로이드 + iOS Safari에서 5판 연속 플레이 크래시/누수 없음, (5) 접근성 체크리스트 통과.

일정 합계 4~8주. 위험이 큰 항목(저사양 성능, 한글 IME, iOS 저장소 유실)을 M1~M3에 앞당겨 배치했다.

---

## 변경 제안

1. **문제 UI를 Canvas가 아닌 DOM 오버레이로 구현** — 무엇을: 브리프 3절 "화면 하단 문제 카드"의 구현 방식을 HTML/CSS로 확정(전장만 Canvas). / 왜: 한글·영어 IME 입력, 접근성, 반응형(세로/가로) 대응이 훨씬 쉽고 저사양에서 텍스트 렌더링 비용이 낮다. / 영향 범위: UI/UX 문서의 레이아웃 명세(오버레이 영역 높이), 프로토타입은 영향 없음.
2. **시뮬 틱레이트를 설정값으로 두고 기본 10틱/초 유지** — 무엇을: 요청된 10틱/초를 기본으로 하되 `TICK_RATE` 상수화, 투사체 판정이 거칠면 20틱으로 상향 허용. / 왜: 소환 타워의 사거리·투사체 판정 정밀도는 메카닉 문서에서 확정되며, 틱을 바꿔도 보간 렌더로 체감은 같다. / 영향 범위: 메카닉·밸런싱 문서의 모든 "초 단위" 수치는 틱 정수배로 정의해야 함(예: 자동 회복 1마나/5초 = 50틱).
3. **교사 리포트 1차 범위를 "로컬 로그 내보내기(JSON/CSV)"로 한정** — 무엇을: 서버 대시보드는 2차로 미루고 1차는 허브에서 내보내기 제공. / 왜: 서버·계정·개인정보 이슈 없이 교사 가치를 검증할 수 있고, 로그 스키마가 먼저 안정화된다. / 영향 범위: 브리프의 "보호자/교사 팩 선택" 외 교사 기능 범위를 기획에서 명시해야 함. 2차 일정(서버)은 별도 산정.
4. **아동(만 14세 미만) 개인정보 정책 선확정** — 무엇을: 1차는 닉네임+로컬 UUID만 사용, 2차 서버 동기화 전에 법정대리인 동의·보관 기간·삭제 요청 절차를 법무/기획이 확정. / 왜: 대상 연령(만 11~14세)이 개인정보보호법상 보호 대상에 걸쳐 있고, 동기화 시점부터 개인정보 처리가 실제로 발생한다(법적 해석은 전문가 확인 필요). / 영향 범위: 허브 프로필 화면, 2차 서버 선택(리전·RLS), 로그 필드(식별 정보 추가 금지).
5. **프로토타입(`prototype/index.html`)을 정식 코드와 분리된 폐기 가능 산출물로 선언하되, 규칙 로직은 `sim/` 형태로 이식 가능하게 작성** — 무엇을: 프로토타입의 밸런스 규칙을 순수 함수로 짜 두어 M2에서 그대로 이식. / 왜: 단일 HTML 제약(외부 의존성 없음)과 정식 모노레포 구조가 충돌하지만, 규칙 로직 재작성 비용은 줄이고 싶다. / 영향 범위: 프로토타입 작업 지침(코드 구조 권장), M2 일정 단축 효과.
6. **정답 로그에 정답 텍스트 미포함, `item_answered.response`만 기록** — 무엇을: 7절 스키마의 개인정보·용량 원칙. / 왜: 로그 크기를 줄이고, 팩 버전으로 문항을 재조회하면 충분하다. / 영향 범위: 팩 버전 관리 규칙(문항 ID 영구 불변)이 데이터 문서에도 동일하게 반영돼야 함.
