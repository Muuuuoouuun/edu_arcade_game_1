# 서리늑대의 방향을 유지하는 동작 줄이기

2026-11-10. 기존 [은서리 늑대 컨셉](../art-source/defense/concepts/2026-10-29/beasts/silverfrost-wolf.png)의 낮은 사족 자세와 실제 설산 전장을 비교했다. 일반 전투는 이미 여덟 방향·여덟 걸음을 사용하지만, 동작 줄이기에서는 옆모습 한 장으로 대체되어 대각선으로 가는 늑대의 진행 방향을 읽기 어려웠다. 넉백 때는 오히려 마지막 보행 단계로 바뀌어 정지 자세도 달랐다.

동작 줄이기에서 기존 방향별 베이크의 네 발이 닿은 네 번째 인덱스 자세를 고정한다. 이동 거리·일반 피격·넉백 속도와 무관하게 같은 자세를 유지하며, 방향이 바뀌면 그 방향의 자세를 선택한다. 기존 메타데이터의 0.5주기 표본에서 네 발의 최저점이 지면에 닿는다. 일반 설정의 보행·피격·넉백·사망, 게임의 이동·피해와 타격 시점은 변경하지 않는다. 방향별 보행 이미지가 불완전하면 기존 늑대 이미지로 돌아간다. 동작 줄이기에서는 필요 없는 넉백 아틀라스가 실패해도 방향별 고정 자세가 유지된다.

새 모델이나 베이크를 제작한 작업은 아니다. 기존 편집 원본 `art-source/defense/frost-wolf-stride.blend`, GLB `public/defense/models/frost-wolf-stride.glb`, 공통 카메라 PNG `art-source/defense/wolf-stride/`, 전투용 `public/defense/models/frost-stride-*-atlas.webp`, 메타데이터 `public/defense/models/frost-wolf-stride.json`을 그대로 사용한다. 해당 원본 재생성 명령은 `npm run models:wolf-stride`다.

`npm test`, `npm run build`, `npm run build:mobile`을 확인한다. 실행 중인 Vite 서버와 Playwright가 있으면 `BASE_URL=http://127.0.0.1:3100/ node tools/tests/frost-wolf-reduced-browser.cjs`로 실제 전투 컴포넌트에서 8방향·이동 위상·피격·넉백과 선택적 이미지 실패를 확인한다. PC 1440×900, 모바일 가로 844×390의 실제 설산 전투에서 시작·일시정지·재개·배속과 실패 대체를 확인했으며, 방향별 포즈의 비교 화면은 제어된 전투 상태를 사용했다. 실기기 Android와 새로운 컨셉의 체형 모델링은 검증·제작하지 않았다.
