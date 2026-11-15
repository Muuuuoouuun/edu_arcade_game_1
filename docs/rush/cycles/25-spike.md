# 25회차: 엔진 스파이크, 이 컨테이너에서 안드로이드 빌드가 되는가

| 항목 | 값 |
| --- | --- |
| 시각 | 2026-11-11 00:42 ~ 00:48 KST (예약 회차. 23:42 KST 회차는 작업자 재시작으로 건너뛰었다) |
| 기준 | `1bf7a28` |
| 레인 | 엔진 스파이크 (24회차 다음 후보: Capacitor 안드로이드 빌드 가능성) |
| 상태 | **완료**. 판정: **SDK만 있으면 된다**(남은 것은 사용자 결정 둘) |
| 다음 레인 | 킹덤 메타 |

## 질문

실행 방식은 TypeScript + Capacitor(안드로이드)다. 실기기 게이트를 하려면 APK가 필요하다. 이 클라우드 컨테이너에서 APK를 만들 수 있는가? 안 된다면 무엇이 빠졌는가?

## 범위 (시간 제한, 제품 코드 변경 없음)

- JDK, Gradle, 안드로이드 SDK, 네트워크(구글 SDK 저장소, Maven)를 확인한다.
- 저장소의 `android/` 프로젝트 설정을 읽는다.
- SDK 설치는 **안드로이드 SDK 라이선스 동의**가 필요하다. 사용자 대신 동의하지 않는다. 동의 전까지 할 수 있는 것만 하고, 필요한 다운로드 크기를 잰다.
- 러시를 앱으로 묶으려면 무엇을 정해야 하는지 적는다.

## 수용 기준

- [x] 도구·네트워크 확인 표
- [x] 빌드까지 남은 단계와 사용자 결정 사항
- [x] 제품 코드 변경 없음. `test:rush`, `tsc`, `build`, `smoke:rush` 통과

## 결과

**도구와 네트워크**

| 항목 | 상태 |
| --- | --- |
| JDK | OpenJDK 21.0.12 있음 |
| Gradle | 시스템 8.14.3 있음. 프로젝트 래퍼(8.14.3 all)도 내려받았다 |
| 안드로이드 SDK | **없음**(`ANDROID_HOME` 없음, `sdkmanager` 없음) |
| 구글 SDK 저장소 `dl.google.com` | 열림(200) |
| `maven.google.com` | 열림(200) |
| Maven Central | 열림. 첫 시도에 429(요청 과다)가 여러 번 나왔고, 두 번 다시 시도하자 모두 받았다. 공유 출구 IP의 속도 제한으로 보인다 |
| 저장소 `android/` | 있음(아르카나 수비대 앱, `appId io.github.muuuuoouuun.arcana`, `webDir dist-mobile`, compile/target SDK 36, AGP 8.13.0) |

**어디까지 갔나** (저장소 `android/`를 스크래치에 복사해서 시험. 저장소 파일은 바꾸지 않았다)
1. `./gradlew help`: 플러그인 의존성을 받는 중 Maven Central 429로 실패했다. 다시 시도해 해결했다. `~/.gradle`이 862 MB가 됐다.
2. Capacitor 생성 파일이 없어 실패했다. `npm run build:mobile`(무시되는 `dist-mobile/`, 37 MB)을 만들고 스크래치에서 `npx cap sync android`를 돌려 해결했다.
3. `./gradlew assembleDebug`는 **“SDK location not found”**로 멈췄다. 남은 것은 SDK뿐이다.

**SDK에 필요한 것** (구글 저장소 목록 기준, 리눅스)

| 패키지 | 크기 |
| --- | ---: |
| `cmdline-tools;latest` | 181.1 MB |
| `platforms;android-36` | 65.9 MB |
| `build-tools;36.0.0` | 63.7 MB |
| `platform-tools` | 9.1 MB |
| 합계 | 약 320 MB |

모두 **Android SDK 라이선스(`android-sdk-license`)** 동의가 필요하다. 사용자 대신 동의하지 않았다.

## 사용자 결정 사항

1. **이 컨테이너에서 Android SDK 라이선스에 동의하고 SDK(약 320 MB)를 설치해도 되는가.**
   - 되면 다음 회차에 디버그 APK를 만들 수 있다. 만든 APK는 실기기 게이트(백로그 9)에 쓴다.
   - 컨테이너는 새로 시작하면 지워진다. 계속 쓰려면 환경 설정 스크립트에 설치를 넣어야 한다. 이것도 사용자 승인이 필요하다.
2. **러시를 어떤 앱으로 묶을 것인가.** 지금 `android/`는 아르카나 수비대 앱이고, 웹 묶음은 `dist-mobile`이다(러시 미포함). 선택지는 다음 셋이다.
   - (a) 러시 전용 앱: 새 `appId`, `rush.html`을 시작 페이지로 하는 별도 빌드
   - (b) 아르카나 앱 안에 러시 진입점 추가
   - (c) 시험용으로만 잠시 `webDir`을 러시 빌드로 바꾼 디버그 APK

   어느 쪽이든 공용 파일(`capacitor.config.ts`, `vite.config.ts`, `package.json` 스크립트)을 바꿔야 한다. 그래서 사용자 확인이 필요하다.

## 검증

- `npm run test:rush`: 47개 통과. 제품 코드는 바꾸지 않았다.
- `npx tsc --noEmit`, `npm run build`: 통과.
- `npm run smoke:rush`: 30/30 통과.
- `git status`: 이 기록 파일 말고는 변경이 없다. `dist-mobile/`은 무시 목록에 있다.

## 다음

- **다음 레인: 킹덤 메타.** 후보는 영웅 조각 보상(높은 별에 훈련 재료)이다.
- 백로그 상위 3개
  1. (킹덤 메타) 영웅 조각 보상
  2. (성능·모바일) 실기기 게이트. 위 사용자 결정 둘이 먼저다
  3. (렌더 톤·모델) 영웅 두 명 실루엣 점검
