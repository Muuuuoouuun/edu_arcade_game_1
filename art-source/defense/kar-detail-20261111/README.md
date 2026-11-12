# 카르 망치 디테일 시안 · 2026-11-11

기존 Frontier 카르 원본의 편집 사본이다. 앞선 Fable 5.2 `high` 이미지 검토의 망치 자루·손 주변 구분과 망치 양끝 실루엣 의견을 참고하되, 실제 변경은 이 Frontier 원본의 카메라에서 별도 판단했다. 게임에는 연결하지 않았고 원본 파일을 덮어쓰지 않는다.

- 원본: `model-bridge-20261110/blender/frontier-kar.blend` 및 `models/frontier-kar-game.glb` (Frontier `bec8041`).
- 런타임 망치의 자루 부근 정점의 X/Y를 1.22배, 망치 머리 끝부분을 중심에서 최대 12% 넓혀 손과 무기 형태의 구분을 시험했다. 장갑·캐릭터 색·수치·애니메이션 판정은 바꾸지 않았다.
- 편집용 개별 부품에도 비슷한 비율 조정을 적용했으나 원본이 별개의 메시로 구성돼 **런타임 표면의 정점 변형과 완전히 동일하지 않다**. 최종 저작용으로 채택하기 전 두 표현을 수동 대조·정렬해야 한다.
- [전](before.png)과 [후](after.png)는 같은 384px 카메라·조명·16샘플 Cycles 정지 렌더다. 작은 모바일 화면에 대한 가독성 개선은 아직 실측하지 않았으며 8방향·전 동작의 손/무기 관통도 검증하지 않았다.
- [GLB](kar-detail.glb)는 기존 19개 동작 클립의 곡선·시간 및 노드 대상을 이전 GLB에서 가져왔다. 메시 13개, primitive 20개다. 손 위치와 공격 시점이 캠페인에 맞는다는 뜻은 아니다. 캡슐 충돌, 화면 가림, 모바일 GPU·메모리 성능은 미검증이다.

재생성은 **이 폴더의 산출물을 덮어쓴다**. 원본/사본을 보존해야 하면 별도 위치로 복사한 후 실행한다.

```sh
blender --python-exit-code 1 -b art-source/defense/model-bridge-20261110/blender/frontier-kar.blend --python tools/blender/detail_kar_frontier_20261111.py
python3 tools/tests/check-kar-detail.py
```

검사는 GLB 청크·19개 클립의 샘플 바이트, 타깃 노드·타임라인·보간, 메시 수, 출력 SHA-256을 대조한다. GLB를 Blender 4.3.2에서 별도 재가져오기도 했다. 런타임 캡처나 실기기 플레이 테스트를 대신하지 않는다.
