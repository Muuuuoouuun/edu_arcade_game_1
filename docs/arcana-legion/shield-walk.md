# 군단 방패병 · 접지 보행과 남청 망토

2026-11-11. 기존 전투는 적에게 달려가는 방패병의 본체가 움직여도 다리가 고정돼 미끄러져 보였다. 기존 창수 컨셉과 OpenAI 이미지 생성 도구로 만든 [턴어라운드](../../art-source/defense/concepts/2026-11-11/legion-shield-turnaround.png)·[보행 참고 시트](../../art-source/defense/concepts/2026-11-11/legion-shield-walk-reference.png)를 직접 보고 넓게 버틴 발, 남청 망토, 주홍 목도리와 금장 청록 방패를 우선했다. 생성된 시트는 모델링 참고 이미지이며 3D 모델이나 전투 스프라이트가 아니다.

기존 편집 원본 생성기에 두께가 있는 남청 어깨 망토와 금색 하단 가장자리를 실제 메시로 추가했다. 몸통 천을 남청으로 낮춰 밝은 청록 방패 및 상아 앞판과 분리했다. 동일한 모델에서 대기·강타·보행을 다시 렌더해 자세가 바뀔 때 망토가 사라지지 않는다. 모델은 60개 편집 메시로 구성된다.

`legion-shield-walk.blend`는 기존 강타 원본을 별도 파일로 열어 양다리 메시를 각각의 독립적인 움직임 그룹에 연결한다. 0.8초의 8포즈 보행은 한 발이 바닥을 밀 때 다른 발이 최대 0.14 모델 단위 올라와 회수한다. 81시점 검사의 최소 발 높이는 0, 진행 방향으로 지지발 오차는 약 0.00000014 모델 단위였다. 이는 모델 공간의 평면 접지 검사이며 스킨 리깅·경사 지형 IK는 아니다.

전장에서는 **실제 시뮬레이션 위치 변화량**을 병사 ID별 화면 상태로 누적한다. 같은 시간의 반복 그리기와 정지는 누적하지 않고, 새 웨이브·순간 귀환·초기화는 걷기로 취급하지 않는다. 기존 피해와 강타 타이밍은 그대로이며 실제 공격 효과의 발생이 보행보다 우선한다. 동작 줄이기는 기본 자세, 보행 파일 실패는 기존 대기·강타, 원본 이미지도 실패하면 절차형 방패병으로 대체한다. 한 장의 공유 WebP를 Canvas2D에서 사용하고 유닛별 WebGL을 만들지 않는다.

## 원본과 재생성

- 편집 원본: `art-source/defense/legion-shield.blend`, `art-source/defense/legion-shield-walk.blend`.
- 움직이는 메시 GLB: `public/defense/models/legion-shield.glb`, `legion-shield-walk.glb`. 모델 작업실에서 각각 강타와 보행을 재생한다.
- 공통 카메라 PNG: `art-source/defense/legion-shield-frames/`, `legion-shield-walk-frames/`.
- 전투용 WebP: `public/defense/models/legion-shield-atlas.webp`, `legion-shield-walk-atlas.webp`.
- `public/defense/models/legion-shield.json`, `legion-shield-walk.json`에 카메라·발 기준·크롭·파일 해시와 보폭을 기록한다. 보행 WebP는 약 60 KiB다.

```bash
blender --background --python-exit-code 1 --python tools/blender/build_legion_shield.py
npm run models:legion-shield-walk
```

이후 `node --experimental-strip-types --test src/games/legion/shieldMotion.test.ts src/games/legion/shieldWalk.test.ts`로 파일 해시·모델 채널·접지 및 공격 우선순위를 검사한다. 서버 실행 시 `BASE=http://127.0.0.1:3284/ node tools/tests/legion-shield-walk-browser.cjs`는 PC/가로 모바일의 실제 배치·이동·일시정지·배속·화면 회전과 동작 줄이기·로딩 실패를 확인한다.

보행 자세 사이를 베이크 프레임으로 전환하므로 임의의 월드 위치에 고정하는 IK는 없다. 강타가 시작되면 보행에서 즉시 넘어가며 별도의 전신 보간도 없다. 창은 시트와 달리 세워 든 기존 실루엣이다. 병사 간 기존 진형 겹침, 실기기 GPU·메모리와 사람 대상 가독성은 별도 검증이 필요하다.
