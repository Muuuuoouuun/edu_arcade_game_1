# 아르카나 모델 제작 과정

현재 웹 게임은 React 19 + Vite 7 기반이다. Blender 4.3.2에서 편집 가능한 모형을 제작하고, Three.js 0.186.1 작업실에서 구조·재질·발사 동작을 검토할 수 있다. 게임 전투는 기존 2.5D 방식으로 실행된다.

## 준비된 도구

| 도구 | 역할 |
|---|---|
| Node.js 22.23.4, npm | 게임·작업실 실행, 빌드, 테스트 |
| Blender 4.3.2 | 메시·재질 편집, CPU 렌더, GLB 내보내기 |
| Three.js 0.186.1 | 브라우저 모델 검토, 회전·확대·메시·발사 미리보기 |
| FFmpeg | 시연 녹화 편집·검증 |
| Chromium + Playwright | 실제 게임과 작업실 조작 검증 |

Blender·FFmpeg·Chromium은 이 환경에 제공된 설치를 검증해 사용했다. Three.js와 타입 선언은 프로젝트에 정확한 버전으로 추가했다. `npm ci`로 웹 의존성을 재설치할 수 있다. 계정·API 키가 필요하지 않다.

## 실행

```bash
export PATH=/workspace/.cloud-setup/tools/node-v22.23.4-linux-x64/bin:$PATH
cd /workspace/edu_arcade_game_1
npm ci
npm run dev
```

게임과 모델 작업실은 같은 서버를 사용한다. 작업실 문서는 `model-lab.html`이며, 개발 서버의 해당 경로에서 연다. 배포 빌드에도 별도 진입점으로 포함된다. 모델 라이브러리는 게임 번들과 분리했다.

## 수정 가능한 원본

`art-source/defense/towers.blend`에 다음 세 모형을 개별 컬렉션으로 보관했다.

- 화염 수정탑: 석재 기단, 금속 발톱, 발광 수정, 문장
- 관통 발리스타: 오크 구조물, 황동 보강, 활대·시위·관통탄, 회전 장치
- 물폭탄포: 압력 탱크, 유리·물 재질, 황동 배관, 포신과 핸들

원본에는 스튜디오 카메라와 조명도 있다. Blender에서 원본을 열어 메시와 재질을 수정할 수 있다. 코드로 재생성할 때는 `tools/blender/build_towers.py`의 치수·재질·부품을 수정한다. **재생성 명령은 출력 `.blend`, `.glb`, `.png`를 덮어쓰므로 수동 편집 원본은 다른 이름으로 보관한다.**

```bash
npm run models:build

# 하나의 모형만 다시 생성
blender -b --python tools/blender/build_towers.py -- --only fire-tower --size 640 --samples 128

# PNG 렌더를 생략하고 모델 내보내기
blender -b --python tools/blender/build_towers.py -- --skip-render
```

기본 렌더는 CPU Cycles, 640×640, 128 samples, 투명 배경이다. 이 Blender 빌드에는 OpenImageDenoise가 없어 노이즈 제거 옵션을 끄고 샘플 수를 높였다. 원본의 모델·조명·정사영 카메라로 새 이미지를 생성한다. 재생성 후 원본 `.blend`는 세 모형이 나란히 보이는 구도로 저장된다.

`public/defense/models/`에 `fire-tower`, `piercing-ballista`, `water-cannon`의 GLB·PNG와 `manifest.json`이 생성된다. GLB는 메시·재질을 포함하며 외부 텍스처 요청이 없다. 각 파일은 약 0.76~1.14MB다. Blender 원본은 Z-up, GLB는 Y-up이며 바닥 중심이 원점이다.

작업실은 `fire-core`, `turret`, `bolt`, `barrel` 피벗을 사용한다. 발사 미리보기는 이 부품을 움직이며 게임 엔진의 피해 계산과는 별개다. 원본 GLB에는 애니메이션 클립을 포함하지 않는다.

## 게임 아트와 연결

현재 전장에서는 `tower-models.png`, `monster-models.png`, `boss-models.png`와 영웅 모션 아틀라스를 사용한다. 새 모델링 원본 3종은 다음 아트 제작에 재사용할 수 있는 편집 자산과 정사영 출력이다. 모델을 전투 아트로 채택할 때는 기존 그림체·광원·바닥 기준·실루엣 크기를 비교한 뒤 `src/games/defense/art.ts`의 매핑에 연결한다.

아틀라스 프레임은 여백을 포함하되 이웃 그림이 비치지 않아야 한다. 포즈가 바뀔 때 몸 크기가 변하지 않도록 같은 몬스터는 공통 픽셀/월드 배율을 사용한다. 새로운 시전 포즈는 HP 바·상태 효과와 겹치지 않는지 확인한다.

## 검증

```bash
npm run build
npm test
```

Blender 생성·렌더·GLB 재가져오기·원본 재열기를 확인했다. 작업실에서 세 모델 로드, 실제 캔버스 변화, 발사 완료, 메시 전환, 모바일 선택·터치를 검증했다. 게임은 전투·일시정지·배속·분기 선택을 별도로 확인한다. 자동 검증은 Chromium 기준이며 실제 모바일 GPU 성능은 별도 측정 대상이다.

개발 서버는 자산이 바뀌면 연결된 화면을 새로고침할 수 있으므로 모델 재생성은 전투 시연 전에 마친다. 클라우드 환경 재시작 안내에도 설치 버전과 작업 과정을 저장했다. 환경 설정 초안 저장과 환경 게시는 별도 단계다.

## 설산 타워 시안과 부분 재생성

`frost-beacon`은 눈 덮인 석조 기단과 얼음 수정을 조합한 새 설산 타워 시안이다. 모델 작업실에서 회전·확대·메시와 발광 미리보기를 확인하고 GLB를 내려받을 수 있다. 아직 게임 전투의 아트 또는 규칙에 연결하지 않은 시안이다. 원본은 `art-source/defense/frost-beacon.blend`, 출력은 `public/defense/models/frost-beacon.glb`와 `.png`다. 다음 명령은 이 세 파일을 덮어쓰므로 수동 편집본은 먼저 다른 이름으로 보관한다.

```bash
blender -b --python tools/blender/build_frost_beacon.py
```

기존 세 타워를 `--only`로 재생성하면 기존 `manifest.json`의 다른 모델 항목을 보존한다. 기존 목록이 없으면 생성한 모델만 기록한다. `--skip-render`를 쓰면 PNG를 새로 만들지 않는다. 목록의 `sprite_status`는 `existing-not-regenerated` 또는 `missing`으로 구분하며, 파일이 없으면 `sprite`는 `null`이다. 이전 PNG가 있더라도 새 GLB와 같은 버전이라고 가정해서는 안 된다. 기존 세 타워의 `.blend`는 부분 재생성 시에도 전체를 다시 쓰므로 수동 편집본은 별도 보관해야 한다.

## 시각 정체성 변형

설산 시안의 석재·눈·황동·깃발에 질감을 더한 `frost-guardian`은 별도 Blender 원본·GLB·PNG와 작업실 항목으로 제공한다. 원본과 전투 아트는 보존한다. 재질 기준과 재생성 명령은 [시각 기준](arcana-visual-identity.md)을 참조한다. GLB에는 이미지 맵이 포함되어 별도 텍스처 파일 요청이 없다.

## 세 타워 질감 개선판

기존 타워의 모양과 작업실 미리보기 피벗을 유지하면서, 별도 `crafted` 변형에 석재·목재·금속·천의 색상 맵을 추가했다. 화염 수정탑에는 주변 불씨 수정을, 물폭탄포에는 압력계를 더했다. 이미지 맵은 GLB 안에 포함되어 별도 텍스처 요청이 없다. 기존 `towers.blend`, 세 GLB와 PNG, `manifest.json`은 그대로 둔다.

- 편집 원본: `art-source/defense/towers-crafted.blend`
- 출력: `public/defense/models/`의 `fire-tower-crafted`, `piercing-ballista-crafted`, `water-cannon-crafted` GLB·PNG와 `manifest-crafted.json`
- 작업실: 세 타워 중 하나를 선택하고 **질감 개선판** 버튼으로 원본과 전환한다. 이 선택은 해당 화면에서 유지된다.

```bash
blender -b --python-exit-code 1 --python tools/blender/build_towers.py -- --variant crafted --samples 96
```

부분 생성도 가능하다: `--variant crafted --only fire-tower`. 생성 명령은 개선판 `.blend`와 선택된 개선판 출력 파일을 덮어쓴다. 수동 편집한 원본은 다른 이름으로 보관한다. 생성 모델은 작업실용이며 기존 전투 아틀라스에는 적용하지 않았다. 실제 게임 적용 시 기존 2.5D 화면의 크기·광원·발사 위치를 다시 맞춰야 한다.

## 영웅 무기 원형

영웅 6명의 속성·직업·기존 모습에 맞춘 정적 무기 원형을 모델 작업실의 **영웅 무기** 분류에 추가했다. 편집 원본은 `art-source/defense/hero-armory.blend`이며 개별 GLB와 PNG를 포함한다. 디자인 구분, 전투 속성과 시안의 한계, 재생성 명령은 [영웅 무기 시안](arcana-hero-armory.md)을 참고한다.
