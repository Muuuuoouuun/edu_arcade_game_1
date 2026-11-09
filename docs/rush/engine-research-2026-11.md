# 엔진·프레임워크 조사 (2026-11-09)

목표: 브롤스타즈식 **손으로 조작하는 실시간 전투**와 킹샷식 **마을 방어·성장**을 섞은 모바일 게임 시제품을, **1시간 단위 AI 개발 루프**로 계속 키울 수 있는 기술 조합 고르기.

## 방향 확정 후 판단 (2026-11-10)

사용자가 정한 방향은 다음과 같다.
- **플레이는 킹샷식**(마을 성장 + PvE, 실시간 PvP 없음).
- **렌더 톤은 브롤스타즈풍**.

실시간 경쟁 대전이 빠졌으므로 WebView의 가장 큰 약점(저지연 네트워크)이 문제가 되지 않는다. 그래서 **TypeScript + Three.js + Capacitor를 출시 경로로 유지한다.** 남은 위험은 보급형 기기의 렌더 성능과 메모리다.
- 이 위험은 [루프 백로그](loop.md)의 **실기기 게이트**로 확인한다.
- 게이트를 통과하지 못하면 이 순서로 검토한다:
  1. Cocos Creator: TypeScript를 유지하고 네이티브 런타임으로 간다.
  2. Unity(C#).
- 규칙 코어(`sim.ts`·`data.ts`·`bot.ts`)가 엔진에 의존하지 않는다는 점은 테스트로 고정했다. 그래서 전환 비용이 작게 유지된다.
- Colyseus는 ‘채택 예정’에서 **보류**로 내린다. 협동 PvE 모드를 만들 때 다시 검토한다.

## WebGPURenderer A/B 결과 (2026-11-10, 07회차)

[측정 기록](cycles/07-spike.md) 요약:
- WebGPU가 없는 환경에서는 WebGL2 백엔드로 문제없이 대체된다.
- 우리 툰 림·잉크 외곽선(`onBeforeCompile` GLSL)이 무시돼 **외곽선이 사라진다.**
- 기존 청크 설정에서는 `three/webgpu`가 공유 청크에 합쳐져 **기본 번들이 +600KB(gzip +169KB)** 커진다.
- 컨테이너에서는 실제 WebGPU가 장치 손실로 동작하지 않아 성능을 판단할 수 없다.

→ **WebGLRenderer 유지.** 전환하려면 `look.ts`를 TSL로 옮기고, 청크 설정을 바꾸고(사용자 확인 필요), 실기기에서 측정해야 한다.

## 결론 (요약)

| 판정 | 선택 |
| --- | --- |
| **채택 (지금)** | TypeScript **결정적 시뮬레이션 코어** + **Three.js** 렌더러 + Vite + Capacitor(Android) |
| 보류 (2026-11-10 PvP 제외) | Colyseus 서버. 협동 PvE 모드를 만들 때 재검토. 같은 `sim.ts`로 서버 판정 가능 |
| 시험 (루프에서 시간 제한 스파이크) | ~~Three.js `WebGPURenderer` A/B~~ (07회차: 보류, 위 결과), PixiJS 8 / Phaser 4 (2.5D 스프라이트 경로), Babylon.js 9, ECS(Koota·bitECS) |
| 보류 (재검토 조건 있음) | Godot 4.6(GDScript), Unity 6(C#), Cocos Creator 3.8, libGDX(Java) |

C#·Java를 지금 들여오는 것은 과합니다. 이유와 재검토 조건은 아래 [C#·Java 판단](#cjava-판단)에 적었습니다.

## 평가 기준 (이 프로젝트 기준 가중치)

| 기준 | 가중치 | 왜 중요한가 |
| --- | ---: | --- |
| 에이전트 루프 운용성 | 30% | 클라우드 리눅스 컨테이너에서 헤드리스 테스트·빌드, 텍스트 diff 가능한 소스, Playwright 브라우저 검증이 모두 돼야 1시간 루프가 돈다 |
| 모바일 실행 품질 | 20% | 중급 안드로이드에서 60fps, 수십~수백 유닛, 이펙트 |
| 기존 자산 재사용 | 20% | TS 테스트 170개, Capacitor Android 빌드, Blender→GLB 파이프라인, 모델 작업실 |
| 실시간 대전 경로 | 15% | 서버 판정 대전으로 확장할 때 시뮬레이션 코드를 공유할 수 있는가 |
| 도구·생태계 | 15% | 문서, 라이브러리, 에디터, 인력 |

## 후보 비교

버전은 2026-11-09에 `npm view`로 직접 확인한 값입니다(프로젝트 설치 버전은 괄호). 엔진 출시 정보는 아래 출처를 따릅니다.

| 후보 | 현재 버전 | 루프 운용 | 모바일 | 재사용 | 대전 | 생태계 | 총평 |
| --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| **TS 시뮬 + Three.js** | three 0.187.0 (0.186.1) | 5 | 4 | 5 | 5 | 4 | **채택.** 의존성 추가 0, GLB 그대로, WebGL2 기본·WebGPU 선택 |
| TS 시뮬 + Babylon.js | @babylonjs/core 9.35.0 | 5 | 4 | 3 | 5 | 4 | 엔진급 기능(인스펙터·물리·GUI)이 필요해지면 후보. 9.0(2026-03) |
| TS 시뮬 + PixiJS 8 | pixi.js 8.22.0 | 5 | 5 | 3 | 5 | 4 | 2D/2.5D 스프라이트 경로의 최고 속도. WebGPU 우선·WebGL 대체 |
| Phaser 4 | phaser 4.2.1 | 5 | 4 | 3 | 4 | 4 | 2D 올인원(씬·입력·트윈·파티클). 렌더러는 WebGL 재작성, WebGPU는 예정 |
| PlayCanvas | playcanvas 2.23.3 | 4 | 4 | 3 | 4 | 3 | 웹 3D 엔진. 에디터는 클라우드 중심 |
| Excalibur / KAPLAY | 1.0.0 / 3001.0.19 | 5 | 3 | 2 | 3 | 2 | 소규모 2D에 적합. 이 장르에는 얇음 |
| Godot 4.6 (GDScript) | 4.6.x (2026-01) | 3 | 4 | 1 | 2 | 4 | 헤드리스 CLI·텍스트 씬은 좋음. 전면 재작성, 웹 내보내기는 WebGL 호환 렌더러만 |
| Godot 4.6 (C#) | 〃 | 1 | 4 | 1 | 2 | 4 | **C# 프로젝트는 웹 내보내기 불가**(4.6~4.7) → 브라우저 검증 루프 단절 |
| Unity 6 (C#) | 6.x | 1 | 5 | 1 | 3 | 5 | 모바일 품질·생태계 최고. Personal 라이선스가 Hub 로그인 전용이라 컨테이너 헤드리스 빌드 어려움, 씬/프리팹 GUID YAML |
| Cocos Creator | 3.8.8 안정 / 4 알파(MIT) | 2 | 5 | 1 | 3 | 4 | 아시아 모바일 캐주얼 강자. 에디터 중심, Cocos 4는 아직 알파 |
| libGDX (Java) | — | 2 | 4 | 1 | 2 | 2 | 이 장르에서 TS 대비 이점 거의 없음 |

보조 라이브러리:

| 용도 | 후보 | 현재 판단 |
| --- | --- | --- |
| 실시간 서버 | Colyseus 0.18.12 (@colyseus/sdk 0.18.9) | 대전·협동 스파이크 때 도입. 0.17부터 TS 전 구간 타입 안전·자동 재접속 |
| ECS | Koota 0.6.6, bitECS 0.4.0 | 엔티티 수백 이상·시스템 분리가 필요할 때. 지금 배열 기반 시뮬로 충분 |
| 물리 | Rapier 0.21.0 (2d/3d-compat) | 진짜 물리(래그돌·밀치기 연쇄)가 필요할 때만. 현재는 원·사각 충돌로 충분 |
| 빌드 | Vite 8.3.7 (7.2.2 사용 중) | 급하지 않음. 별도 회차에서 업그레이드 검토 |
| 모바일 셸 | Capacitor 8.6.0 (동일) | 유지 |

## 왜 이 조합인가

1. **결정적 시뮬레이션을 엔진 밖에 둔다.** `src/rush/sim.ts`는 DOM·시계·`Math.random` 없이 고정 60Hz로 돈다. 같은 시드와 입력이면 같은 결과다. 그래서
   - 헤드리스 `node --test`로 **게임 규칙과 밸런스를 자동 검증**한다(“영웅만/탑만으로는 진다, 둘 다 쓰면 이긴다”).
   - 렌더러를 바꿔도(Three.js ↔ Pixi ↔ Babylon) 게임 규칙은 그대로다.
   - 나중에 Colyseus 서버가 같은 파일로 판정한다(클라이언트 예측·리플레이도 같은 코드).
2. **Three.js는 이미 있다.** 의존성 추가 없이 기존 GLB(도마뱀 궁수 등)를 영웅으로 바로 썼다. 브롤스타즈처럼 3D 캐릭터를 높은 고정 카메라로 보는 구도에 맞다.
3. **루프 검증이 끝까지 자동화된다.** 테스트 → 타입 검사 → 빌드 → Playwright(데스크톱·모바일 가로, 터치 조작 포함) → 스크린샷까지 한 컨테이너에서 돈다.

## C#·Java 판단

**지금은 과하다.** 근거:
- **검증 루프가 끊긴다.** Unity Personal은 Hub 로그인으로만 활성화되고 수동 활성화를 지원하지 않는다. CI용 우회는 커뮤니티 방법뿐이다. Godot C#은 웹으로 내보낼 수 없다.
- **대전으로 가면 언어 하나가 유리하다.** TS면 클라이언트와 서버가 같은 시뮬레이션을 쓴다. C#/Java가 섞이면 규칙을 두 언어로 이중 관리한다.
- **재작성 비용.** 테스트·Android 빌드·GLB 파이프라인을 버려야 한다.
- Java/Kotlin은 이미 `android/`의 Capacitor 네이티브 플러그인 범위에 있고, 그 정도가 적정선이다.

**재검토 조건 (하나라도 해당하면 루프에서 시간 제한 비교 스파이크):**
- 중급 안드로이드 실기기에서 최적화(인스턴싱·LOD·스프라이트 대체) 후에도 목표 장면 60fps 실패 → Godot(GDScript) 또는 Unity 비교.
- 에디터 중심으로 일하는 아티스트·레벨 디자이너가 합류 → Unity 검토.
- 서버 부하가 커져 Node로 감당이 안 됨 → 서버만 .NET/Go 검토(시뮬 공유 방식 재설계 필요).

## 아직 확인하지 못한 것

- **실기기 성능.** 이 컨테이너의 브라우저는 소프트웨어 렌더링(SwiftShader)이라 FPS는 기기 성능이 아니다. 실기기 측정은 사용자 기기 또는 클라우드 디바이스 팜이 필요하다.
- Three.js r182의 WebGPURenderer 기본 권장 시점, Phaser 4 정식 출시일은 2차 출처 기준이다. 채택 결정에 쓰기 전 공식 릴리스 노트로 다시 확인한다.

## 출처

- Phaser 4: [Phaser 3 vs Phaser 4 (2026-05)](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4), [Phaser v4 RC4](https://phaser.io/news/2025/05/phaser-v4-release-candidate-4), [Phaser 4 렌더링 개념](https://phaser.io/tutorials/phaser-4-rendering-concepts), [GameDev.net: Phaser 4 released](https://gamedev.net/news/2759-phaser-4-released/)
- Three.js WebGPU: [WebGPURenderer 매뉴얼](https://threejs.org/manual/en/webgpurenderer), [WebGPU + Three.js 마이그레이션 가이드 2026](https://www.utsubo.com/blog/webgpu-threejs-migration-guide), [WebGPU 성능 토론](https://discourse.threejs.org/t/webgpu-performance-issue/87939)
- PixiJS: [Pixi v8 출시](https://pixijs.com/blog/pixi-v8-launches), [PixiJS v8.20.0](https://gamedev.net/news/pixijs-v8200-released-r5221/), [WebGPU vs WebGL 2026](https://app.cinevva.com/hi/guides/webgpu-vs-webgl-games)
- Babylon.js: [Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0), [GameFromScratch v9](https://gamefromscratch.com/babylon-game-engine-v9-release/)
- Godot: [Godot 4.6 출시 기사](https://cinevva-site.pages.dev/news/2026-02-27-godot-4-6-released), [C# 웹 내보내기 포럼](https://forum.godotengine.org/t/is-there-an-update-on-exporting-c-projects-to-web/128821), [web .NET 프로토타입](https://github.com/raulsntos/godot4-web-dotnet-prototype), [웹 내보내기 문서 4.5](https://docs.godotengine.org/fr/4.5/tutorials/export/exporting_for_web.html)
- Unity: [라이선스 관리 문서](https://docs.unity3d.com/ja/current/Manual/ManagingYourUnityLicense.html), [Docker 활성화 이슈](https://issuetracker.unity3d.com/issues/cannot-activate-license-within-a-docker-container), [GameCI 이슈](https://github.com/game-ci/unity-orb/issues/74)
- Cocos: [Cocos 4 MIT 공개](https://www.streetinsider.com/PRNewswire/COCOS+4+Is+Here,+Fully+Open+Source/25799933.html), [Cocos 현황 정리(2026-10)](https://www.issoh.co.jp/md/tech/4880), [3.8 LTS](https://discuss.cocos2d-x.org/t/cocos-creator-3-8-is-here-learn-more-about-it-in-our-release-notes/59194)
- Colyseus: [0.17 발표](https://colyseus.io/blog/colyseus-017-is-here/), [문서](https://docs.colyseus.io/learn)
