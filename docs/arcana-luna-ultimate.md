# 루나 · 덩굴의 포효 동작

기존 [루나 원본](arcana-luna-model.md)의 여우 귀·구리빛 머리·잎 고리 지팡이를 유지한다. 원래 필살기는 일반 시전 포즈를 재사용해 기본 마법과 구분이 어려웠다. 원본 컨셉 `art-source/defense/atlases/ranged-motion.png`와 원격 Claude 방향 기획 74회차(`005ab09`)의 높이 든 지팡이 아이디어를 참고하되, 별도 초안 몸체를 캠페인에 덮어쓰지 않았다.

기존 루나의 실제 양팔·지팡이 관절로 **즉시 발동 → 자세 회수** 0.5초를 만들고, 고정 카메라의 8방향 × 3자세를 2.5D 전투에 연결했다. 지팡이는 손의 자식이고 두 발은 제자리를 지킨다. 작은 화면에서는 실제 3D 보석 소켓을 각 렌더 프레임에 투영한 좌표에 녹색 빛을 표시한다. 빛은 돌진 중 몸의 변형도 따르고 동작 줄이기에서는 고정된다. 기존 적중 지점 덩굴 표식과 피해·둔화·쿨다운·동료 늑대 동작은 그대로다.

- 재생성: `npm run models:luna-ultimate`, 검사: `npm run models:luna-ultimate:check`.
- 원본: `art-source/defense/luna-ultimate.blend`; 3D 작업실: `public/defense/models/luna-ultimate.glb`.
- 384px 공통 카메라 PNG 24장과 192px 전투 아틀라스 8장, 소켓·해시 메타데이터 `public/defense/models/luna-ultimate.json`, 생성 좌표 `src/games/defense/druidUltimateSockets.ts`를 함께 보관한다. 배포 전투는 이미지 세트가 전부 준비될 때만 교체하고 실패하면 기존 루나 시전 이미지로 돌아간다.
- GLB 101개 보간 표본에서 발바닥 최저 +0.005, 팔 연결 최대 오차 약 0.00014 모델 단위, 지팡이 손 상승 0.70, 준비 자세 복귀 오차 0.000001 미만을 확인했다. 8방향 × 51시점의 화면 경계도 검사한다.
- 전투에는 WebGL 렌더러를 추가하지 않는다. 여덟 전투 아틀라스는 약 106KB이며 RGBA 디코딩 크기는 약 3.38MiB다. 작업실 GLB는 약 1.64MB·51메시·24,384삼각형이다. Android 실기기 메모리·성능과 이동 중 발 고정은 검증하지 않았다.
