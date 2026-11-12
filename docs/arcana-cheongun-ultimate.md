# 청운의 뇌운 결계 동작

2026-11-09. 통합 브랜치 `45530ae` 기준. 원격 Claude 68회차는 main의 별도 청운 초안에 필살기 자세를 제안했다. 통합 브랜치에는 이미 더 상세한 청운 모델·8방향 시전/보행이 있어 이를 교체하지 않고, 기존 편집 원본에 전용 필살기 동작을 추가했다.

원본 `art-source/defense/concepts/2026-10-29/heroes/talisman-caster.png`와 `motion/talisman-cast-keyposes.png`의 부적·넓은 소매·청록 도포를 참고했다. 부적과 붓을 든 양팔을 들어 올린 후 0.5초 동안 원래 대기로 거둔다. 실제 스킬 피해가 즉시 발생하므로 새 동작도 높은 발동 자세에서 시작한다. 일반 공격·필살기 피해, 보상, 사거리와 시점은 변경하지 않았다.

## 제작과 전달

```sh
npm run models:cheongun-ultimate
npm run models:cheongun-ultimate -- --check
npm run models:cheongun-ultimate:check
```

- 기존 `art-source/defense/cheongun-tao.blend`에서 파생한 편집 원본: `art-source/defense/cheongun-ultimate.blend`.
- 실제 관절 동작: `public/defense/models/cheongun-ultimate.glb`, `cheongun-ultimate-0` 0.5초. 단일 모델 작업실 `model-lab.html?model=cheongun-ultimate`에서 재생한다.
- 공통 384×384 정사영 카메라 원본: `art-source/defense/cheongun-ultimate-frames/`, 8방향×3 PNG. 전투는 `public/defense/models/cheongun-ultimate-{0..7}-atlas.webp`의 192px 3포즈를 사용한다. PNG 미리보기와 카메라·크롭·해시 정보는 같은 경로의 `cheongun-ultimate.png`와 `.json`에 있다.
- 기존 모델의 16관절·부적·붓·소매 메시를 재사용한다. 별도의 평면 이미지 모델이나 유닛별 WebGL 렌더러는 없다. 8개 WebP 합계 84,342바이트, 디코딩 RGBA 약 3.38MiB다.
- 8방향 세트 중 하나라도 실패하면 기존 방향별 일반 시전으로 돌아간다. 동작 줄이기는 발동 자세를 유지하며, 일시정지·배속은 기존 시뮬레이션 시간을 따른다.

## 검증과 한계

Blender 51프레임·GLB 101시점에서 양발 최저 높이 약 0.005, 양팔 연결 최대 오차 0.000154 모델 단위, 종료 대기 관절 행렬 오차 0.00000014를 확인했다. 24 PNG·8 WebP의 투명도와 잘림 및 35개 산출물 해시를 검사했다. 관련 247개 테스트와 빌드가 통과했다.

실제 PC·가로 모바일 브라우저에서 필살기 발동·회수, 이동, 일시정지, 2배속, 동작 줄이기, 전투 이미지 실패 및 작업실 GLB 실패 대체를 조작했다. 전투에서는 GLB 요청이 없었다. 모바일은 에뮬레이션이며 실제 Android 메모리·성능 검증은 남아 있다. 이동 중 발동할 때 시전 자세가 이동하면서 발이 수평으로 미끄러질 수 있어 보행·시전 전신 연결이 다음 과제다. 작은 가로 화면에서는 시전 이펙트가 모델을 일부 가릴 수 있다. 증거는 `/tmp/arcana-loop-20261109-2252/`에 보관한다.
