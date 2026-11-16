# 146회차: 엔진 스파이크, 러시 페이지 자바스크립트는 무엇으로 이루어졌나

| 항목 | 값 |
| --- | --- |
| 시각 | 2026-11-16 18:41 ~ 18:58 KST (예약 회차) |
| 기준 | `d30946f` (145회차 뒤) |
| 레인 | 엔진 스파이크 |
| 상태 | 완료, 코드는 바꾸지 않음 (설정 한 줄로 5.2 kB gzip 줄일 수 있음, 사용자 승인 필요) |
| 다음 레인 | 킹덤 메타 |

## 문제

엔진 스파이크 백로그는 실기기 측정(57)과 우선순위 낮은 PixiJS·Phaser 비교만 남았다. 컨테이너에서 잴 수 있는 엔진 질문으로, 러시 페이지가 받는 자바스크립트를 나눠 본다. 지금 빌드에서 러시는 네 덩어리다: 러시 코드 242 kB(gzip 88.8), three 핵심 268(71.3), three 렌더러 358(87.5), three 도구(GLTF 로더 등) 101(28.5). 63·81회차가 타이틀 바이트를 보았지만 그 뒤 60회 넘게 코드가 늘었다.

## 범위

- 설정을 바꾸지 않고 `npx vite build --sourcemap --outDir <스크래치패드>`로 지도 파일을 만들어, 덩어리마다 원본 파일별 바이트를 센다(`source-map-js`).
- 러시 코드 덩어리에서 첫 화면에 필요 없는 큰 모듈(디버그·측정·시트 모드 등)이 있으면 동적 import로 미루는 것을 시험하고 첫 화면 바이트를 잰다. `vite.config.ts`는 바꾸지 않는다(사용자 승인 필요).

## 가설

러시 코드 덩어리의 큰 몫은 `render.ts`·`main.ts`이고, 첫 화면에 필요 없는 모듈은 작아서 미뤄도 이득이 몇 kB에 그친다.

## 수용 기준

- [x] 덩어리별·파일별 바이트 표(상위 항목)
- [x] 미룰 만한 모듈이 있으면 전후 첫 화면 바이트, 없으면 근거
- [x] `test:rush`, `tsc`, `build` 통과 (소스를 바꾸지 않아 `smoke:rush`는 돌리지 않음)

## 결과

### 덩어리별 원본 파일(압축 전, 지도 파일로 셈)

| 덩어리 | 크기 | 큰 몫 |
| --- | ---: | --- |
| `rush` | 232.0 kB | render.ts 66.4 (28.6%), main.ts 24.8, sim.ts 22.1, mapScenery.ts 17.8, town.ts 16.3, music.ts 9.7, kingdom.ts 9.7, townScene.ts 9.0, maps.ts 8.0, defenceModels.ts 8.0, frame.ts 6.4, post.ts 5.9 |
| `three-core` | 261.3 kB | three.core.js 전부 |
| `three-renderer` | 350.0 kB | three.module.js 98.3% |
| `three-tools` | 99.0 kB | GLTFLoader 42.8, meshopt 해독기 25.8, **OrbitControls 19.4**, BufferGeometryUtils 7.7, **RoomEnvironment 1.9**, **SkeletonUtils 0.4** |

- **러시 코드**: 큰 몫은 모두 타이틀의 시연 전투에서 바로 쓰는 것이다(그리기·시뮬레이션·지도 장식·마을). 첫 화면 뒤로 미룰 만한 큰 모듈은 없다. 가설대로다.
- **찾은 것**: `three-tools`의 OrbitControls·RoomEnvironment·SkeletonUtils는 러시가 아니라 모델 실험 페이지(`src/model-lab.ts`)만 쓴다. `vite.config.ts`의 `manualChunks`가 `three/examples`를 모두 한 덩어리로 묶어서, 러시 페이지도 이것을 받는다(웹 빌드만, 앱 빌드는 모델 실험 페이지를 빼므로 해당 없음).

### 설정 변형 시험(저장소 설정은 그대로, 추적하지 않는 임시 설정으로 빌드)

페이지가 정적으로 받는 자바스크립트 합(gzip −9):

| 페이지 | 지금 | 변형 1: 셋을 `three-lab` 덩어리로 | 변형 2: 셋은 수동 묶음에서 빼기 |
| --- | ---: | ---: | ---: |
| 러시 | 289.4 kB | 289.5 kB (그래도 받음: `three-tools`가 `three-lab`을 가져옴) | **284.2 kB (−5.2)**, 압축 전 994 → 972 kB |
| 모델 실험 | 209.8 kB | 210.0 kB | 209.9 kB |
| 개척지(frontier) | 286.1 kB | — | 281.0 kB (−5.1) |
| 아르카나(index)·아케이드 | 93.5 / 87.8 kB | — | 93.2 / 87.5 kB |

- 변형 1은 롤업이 두 수동 덩어리를 서로 잇는 바람에 러시가 여전히 받았다. 변형 2(`manualChunks`에서 그 셋이면 `return;`)는 롤업이 모델 실험 쪽에 넣어 러시·개척지에서 빠진다.
- **제안(사용자 승인 필요, `vite.config.ts`는 승인 없이 바꾸지 않음)**: `manualChunks`의 `/examples/` 줄 앞에 한 줄.

```ts
if (/OrbitControls|RoomEnvironment|SkeletonUtils/.test(id)) return; // model lab only
```

  러시 첫 화면 −5.2 kB gzip(−1.8%), 휴대폰이 해석할 자바스크립트 −22 kB. 크지 않지만 위험도 적다.

## 검증

- 소스를 바꾸지 않았다(`git status`: 이 기록만. 임시 설정은 `node_modules/.cache`에 만들고 지웠다). `npm run test:rush` 149개 통과(설계 기둥 포함), `npx tsc --noEmit`·`npm run build` 통과. `smoke:rush`는 바뀐 소스가 없어 돌리지 않았다(144회차 `8620095`에서 41개 통과).

## 다음

- **다음 레인: 킹덤 메타.**
- 백로그 상위 3개
  1. (성능·모바일, **사용자 측정 필요**) 실제 휴대폰 `?bench=1&quality=high|low` 값으로 자동 품질 문턱 확인(125회차), 낮춤 순간 끊김(140회차)도 함께
  2. (PvE 콘텐츠, **사용자 결정**) 영웅 균형(포포가 8~10스테이지에서 2~4단계 강함, 130회차)과 기둥 시험 정의(104회차)를 함께
  3. (엔진 스파이크, **사용자 승인 필요**) `vite.config.ts` 한 줄: 모델 실험 전용 three 도구를 러시 덩어리에서 빼기(−5.2 kB gzip, 146회차)
