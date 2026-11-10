# Arcana 독립 앱 전환 리뷰

**전제:** 제공된 코드와 스크린샷만 검토했습니다. `DefenseGame`, `storage`, `campaign` 구현은 보지 못했습니다. 테스트는 실행하지 않았습니다.

## 확인된 문제

**1. [중간 · 백스택] 전투 중 네이티브 뒤로가기가 라운드를 기록 없이 끝낼 수 있음**
- 근거: `handleNativeBack`은 Escape가 `preventDefault`되지 않으면 `NATIVE_BACK`을 보냅니다.
- `ArcanaApp`은 `playing` 상태이면 화면 구분 없이 `leave()`를 호출합니다.
- `playing`은 캠프와 전투를 모두 포함합니다. 따라서 전투의 Escape 핸들러가 특정 상태(시작 전, 결과창 전환 중 등)에서 처리를 거부하면, `onFinish` 없이 타이틀로 이동합니다.
- **가설:** 실제 발생 여부는 `DefenseGame`의 Escape 처리에 달려 있습니다(코드 미제공).
- 권장: `DefenseGame`이 캠프 화면일 때만 `NATIVE_BACK` 처리를 허용하는 플래그를 올려 보내도록 합니다.

**2. [낮음 · 설정/상태] `toggleSound`가 오래된 클로저 값을 사용함**
- 근거: `setSound(!saved.sound)`는 렌더 시점의 값을 쓰고, `setSaved`는 updater로 반전합니다.
- 빠른 연타 시 오디오 상태와 저장값이 잠깐 엇갈릴 수 있습니다. `[saved]` effect가 결국 맞춰 주지만 중복 호출입니다.
- 권장: effect만 단일 출처로 남기거나, updater 안에서 계산한 값으로 `setSound`를 호출합니다.

**3. [낮음 · 카피/영속성] 네이티브 앱에서 저장 위치 문구가 일치하지 않음**
- 근거: 타이틀은 "이 기기에 저장됩니다", `DefenseCamp`의 `camp-save-note`는 "이 브라우저에 저장돼요"입니다.
- 새 앱 ID로 바뀌어 레거시 앱 데이터가 자동 이전되지 않습니다. 사용자가 "브라우저"라는 문구를 보고 이전 앱 진행이 이어진다고 오해할 수 있습니다.
- 권장: 독립 앱에서는 "이 기기·이 앱"으로 통일합니다.

**4. [낮음 · 모바일 빌드] 빌드 스크립트의 경로와 디렉터리 취약성**
- `tools/prune-arcana-mobile.mjs`: `readdir(models)`에 존재 여부 가드가 없습니다. 출력에 `defense/models/`가 없으면 빌드가 실패합니다(위쪽 `rm`은 `force`인데 여기는 아님).
- `vite.config.ts`: `new URL(...).pathname`은 공백(`%20`)이 있는 경로나 Windows 경로에서 깨집니다. `fileURLToPath` 사용을 권장합니다.
- `.glb` 제거 후에도 전투나 캠프가 GLB를 런타임에 요청하는지는 확인하지 못했습니다. **가설:** `three` 청크가 모바일 번들에 남을 수 있습니다.

## 확인 결과 정상

- **설정 다이얼로그 뒤로가기:** `handleNativeBack` → 다이얼로그에 Escape 전달 → `Dialog`의 keydown이 닫음. 타이틀에서 다이얼로그가 없으면 최소화됨. 의도대로 동작합니다.
- **영웅 미리보기:** "무료 편성" 명시, 확정 버튼 분리, 해금 재확인(`visitors.includes`)이 있습니다. 닫힌 뒤 영웅 카드로 포커스가 복귀합니다. 세로·가로 스크린샷 모두 잘림이 없습니다.
- **`DefenseFieldGuide`:** 접힘 상태의 선택형 힌트이며 진행을 막지 않습니다.
- **reduced-motion:** 전역으로 애니메이션을 끕니다. 공방(workshop) 모션과 전투 모션을 분리했다면, 전투 피드백 연출까지 사라지는지는 별도 확인이 필요합니다.

## 참고

- `DefenseGame blocked={settings}`: 설정은 타이틀에서만 열리므로 항상 `false`로 전달되는 사실상 죽은 prop입니다. 정리를 권장합니다.
- `Dialog`의 포커스 셀렉터에 `a`, `summary`, `select`가 빠져 있습니다. 향후 다이얼로그에 링크나 `<details>`를 넣으면 포커스 트랩에서 누락됩니다.