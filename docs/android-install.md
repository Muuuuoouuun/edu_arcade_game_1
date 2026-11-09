# Android 시험 설치판

아르카나 수비대를 Capacitor 8.6으로 독립 패키징한다. `dist-mobile`의 아르카나 코드·폰트·전투 이미지는 APK 내부 `assets/public`에 포함된다. 교육 허브 진입점·레이싱/퀴즈 이미지와 제작 작업실용 GLB는 포함하지 않는다. 개발 서버 URL을 설정하지 않으며 API 키나 Claude 호출은 앱에 포함하지 않는다.

## 빌드

필요 환경: Node 22 이상, JDK 21, Android SDK Platform 36 / Build Tools 36.0.0, platform-tools. Gradle 8.14.3은 저장소의 wrapper가 사용한다.

```bash
npm ci
npm run android:sync
# ANDROID_HOME 또는 Android Studio가 생성한 android/local.properties로 SDK 위치 지정
cd android
./gradlew assembleDebug lintDebug
```

SDK가 설정된 환경에서는 `npm run android:debug`로 웹 빌드→동기화→APK 생성을 실행할 수 있다. `npm run android:open`은 설치된 Android Studio에서 프로젝트를 연다. 이번 클라우드의 JDK는 `/workspace/.cloud-setup/tools/jdk21`, SDK는 `/workspace/.cloud-setup/tools/android-sdk`에 설치했다. 해당 환경에서 빌드할 때는 `JAVA_HOME`과 `ANDROID_HOME`을 이 경로로 지정한다. 회사·클라우드 네트워크에서는 기존 프록시/CA를 유지하고 Gradle JVM에도 해당 설정을 전달한다. 인증 값을 저장소나 앱 설정에 넣지 않는다. 환경별 SDK 경로, 빌드 결과, 키스토어는 Git에서 제외된다.

산출물: `android/app/build/outputs/apk/debug/app-debug.apk`.

- 앱 이름: 아르카나 수비대
- 시험판 패키지 ID: `io.github.muuuuoouuun.arcana.debug`
- 출시판 후보 ID: `io.github.muuuuoouuun.arcana` (아직 출시 빌드·서명 없음)
- 최소 Android: 7.0 / API 24. 게임 화면에는 업데이트된 Android System WebView가 필요하다. 최소 OS에서의 화면·성능 검증 완료를 뜻하지 않는다.

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n io.github.muuuuoouuun.arcana.debug/io.github.muuuuoouuun.arcade.MainActivity
```

휴대폰에서 APK를 열 경우 해당 파일 앱/브라우저의 앱 설치 허용이 필요하다. 디버그 APK는 시험용이며 Play Store 출시 파일이 아니다. 릴리스 서명 키와 스토어 계정 설정은 이번 변경에 포함하지 않는다.

## 설치판 동작

- 전용 타이틀 → 마을/동료/성장/원정 → 별도 전장으로 진입한다. 기존 캠페인 규칙과 저장 키를 유지한다.
- 뒤로가기: 활성 대화창의 기존 닫기 동작 → 진행 중 게임의 일시정지 → 거점에서 타이틀 → 타이틀에서는 앱 최소화 순서다. 일시정지 대화창을 뒤로 닫으면 사용자의 명시적 동작으로 재개된다. 타이틀이나 거점으로 나가려면 대화창의 나가기/거점 버튼을 사용한다. 필수 선택 대화창은 뒤로가기로 건너뛰지 않는다.
- 앱을 배경으로 보내면 디펜스 전투를 멈추고 오디오를 정지한다. 화면으로 돌아온 것만으로 자동 재개하지 않는다.
- 전투 진동은 기존 설정·모션 줄이기·빈도 제한을 따른다. 네이티브 진동 API에서는 패턴의 진동 시간을 합친 짧은 단일 진동을 사용한다.
- Android 시스템 표시줄은 스와이프로 다시 표시할 수 있다. 노치·표시줄·프로필 입력 키보드의 인셋을 WebView 컨테이너에 적용한다.

## 저장과 확인 범위

이번 독립 앱은 기존 `arcade` 패키지와 별도로 설치된다. 기존 플레이그라운드 설치판 데이터가 새 `arcana` 패키지로 자동 이전되지 않는다. 같은 주소의 웹 저장 키는 유지한다.

완료한 캠페인·설정·기록은 앱 내부 WebView 저장소에 남는다. 기존 브라우저 저장과 자동 공유하지 않는다. **앱 삭제·데이터 초기화·다른 기기로의 이동 시 기록은 보존되지 않는다.** 클라우드 백업은 구성하지 않았다. Android 자동 백업도 꺼져 있다. 같은 시험판 서명과 패키지로 `adb install -r` 업데이트하면 기존 앱 데이터가 유지된다. 서명이 다른 시험판은 업데이트 설치가 거부될 수 있다. 시험판과 출시판은 다른 패키지로 공존하며 기록 자동 이전 기능은 없다.

진행 중 전투의 중간 저장은 이번 범위에 없다. OS가 프로세스를 종료하면 해당 전투는 다시 준비하고, 이미 완료·저장한 성장 기록을 읽는다.

브라우저에서 네이티브 신호를 모의한 검사, Android APK 빌드·lint, 에뮬레이터 설치 검사는 서로 구분해 기록한다. 물리 휴대폰의 발열·배터리·진동 감각과 안정적인 60fps는 별도 검증 대상이다. 모바일 전용 빌드에서 모델 작업실·다른 실험 페이지와 GLB를 이미 제외했다. 2026-11-09 APK는 빌드·lint 및 브라우저 실행을 검증하며, 연결된 실기기가 없어 설치·발열·기기 성능 검증은 별도다.
