# 군단 서리늑대 · 경로 방향과 접지 보행

2026-11-11. 기존 [은서리 늑대 컨셉](../../art-source/defense/concepts/2026-10-29/beasts/silverfrost-wolf.png)은 긴 몸과 네 발이 향하는 방향이 분명하다. 기존 군단 전장에서는 여덟 보행 자세가 움직여도 세 길 모두 같은 옆모습을 사용했다. 위·아래 길의 굽은 구간에서 늑대가 옆으로 미끄러지는 차이를 줄이기 위해, 원정에서 이미 만든 실제 3D 원본의 방향별 보행과 피격 베이크를 군단에 연결했다. **새 모델이나 새로운 Blender 애니메이션은 만들지 않았다.** 군단은 계속 Canvas2D에서 베이크를 그린다.

- 군단의 `LANES` 각 구간 접선에서 기존 화면 좌표의 8방향 중 하나를 선택한다. 현재 세 길에서 쓰이는 0·1·7 방향만 미리 읽고 방향별 이미지는 좌우 반전하지 않는다. 구간별 실제 이동 거리를 해당 방향과 표시 크기의 투영 보폭으로 나누어 보행 위상을 누적하므로, 길이 꺾여도 이전 거리를 새 방향의 보폭으로 다시 계산하지 않는다.
- 기존 관절 피격을 같은 방향·걸음과 접지 기준에서 선택한다. 판정·피해·적 경로·게임 속도는 변경하지 않는다. 진행이 멈추면 발도 멈추며, 일시정지와 배속을 시뮬레이션에 맞춘다. 동작 줄이기는 해당 방향의 접지된 4번 자세를 고정한다.
- 방향 보행 세 장 중 하나라도 실패하면 기존 옆모습 보행 세트로 돌아간다. 방향 피격 세트가 불완전하면 피격 시 기존 피격 자세를 사용한다. 기존 보행도 실패하면 기존 모델, 이어서 설산 삽화와 단순 형태로 대체한다. 대상이 왼쪽에 있을 때는 기존 좌우 반전 자세로 돌아가며, 세로 성분까지 반영한 목표 추적은 후속이다.
- 신규 압축 파일은 추가하지 않는다. 군단에서 쓰는 기존 보행 WebP 세 장은 약 127 KiB, 피격 세 장은 약 166 KiB이며, RGBA 디코딩 기준 추가 최대 약 12.75 MiB다. 브라우저·기기에 따른 실제 메모리는 측정하지 않았다.

## 기존 원본과 재생성

- 편집 원본: `art-source/defense/frost-wolf-stride.blend`, `art-source/defense/frost-wolf-flinch.blend`.
- 실제 관절 GLB: `public/defense/models/frost-wolf-stride.glb`, `public/defense/models/frost-wolf-flinch.glb`.
- 공통 카메라 렌더: `art-source/defense/wolf-stride/`, `art-source/defense/wolf-flinch/`.
- 전투 WebP: `public/defense/models/frost-stride-{0,1,7}-atlas.webp`, `frost-flinch-{0,1,7}-atlas.webp`.
- 메타데이터·해시: `public/defense/models/frost-wolf-stride.json`, `frost-wolf-flinch.json`.
- 재생성 및 기존 원본 검사: `npm run models:wolf-stride`, `npm run models:wolf-stride:check`, `npm run models:wolf-flinch`, `npm run models:wolf-flinch:check`. 군단 화면 검사는 서버 실행 후 `BASE=http://127.0.0.1:3127/ node tools/tests/legion-wolf-browser.cjs`.

## 검증과 한계

같은 1280×720 및 가로 844×390 브라우저 전장을 직접 조작하고 전후 화면을 비교했다. 방향 선택·경계 누적·접지 기준·피격·로딩 실패 단위 검사와 전체 659개 테스트, 웹·모바일 빌드가 통과했다. 빌드된 모바일 결과물에서 실제 군단 전투의 정지 시 캔버스 고정·재개·배속·화면 회전·동작 줄이기와 단계별 이미지 실패를 확인했다. 자연 전투에서 방향 피격 재생과 피격 이미지 실패 시 기존 포즈 대체도 확인했다. 모델 작업실에서는 PC·가로 모바일 GLB 재생/정지 및 GLB 실패 대체를 확인했다. 모바일의 정면·뒷면 시야는 옆모습보다 실루엣이 좁다. 8방향 전환은 단계적이며 보행에서 공격 대상의 모든 방향으로 자연스럽게 연결되지는 않는다. 실제 Android/iOS GPU·메모리와 사람 대상 가독성은 측정하지 않았다.
