# 이미지 자산 점검 목록

2026-11-09 기준. `public`의 이미지 53개와 `/workspace/generated_images`의 40개를 모두 열어 보았다. 53개는 방어 이미지 26개(이 중 모델 렌더 14개), 허브 아트 7개, 레이스 3개, 국기 16개, 아이콘 1개다. 폰트·빌드 산출물·의존성·GLB/BLEND는 이미지 수에서 제외했다. 아래의 “동일”은 SHA-256으로 파일 내용이 완전히 같은 경우이며, 일치하지 않는 이미지는 사용되지 않았다고 단정할 수 없다.

## 프로젝트 이미지 53개

| 파일 | 크기 / 형식 | 역할 |
|---|---|---|
| [art/cat.png](/workspace/edu_arcade_game_1/public/art/cat.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [art/defense.png](/workspace/edu_arcade_game_1/public/art/defense.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [art/mascot.png](/workspace/edu_arcade_game_1/public/art/mascot.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [art/quiz.png](/workspace/edu_arcade_game_1/public/art/quiz.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [art/race.png](/workspace/edu_arcade_game_1/public/art/race.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [art/rocket.png](/workspace/edu_arcade_game_1/public/art/rocket.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [art/tiles.png](/workspace/edu_arcade_game_1/public/art/tiles.png) | 1254×1254 RGBA | 허브·해당 게임의 대표 그림 |
| [defense/atlas.png](/workspace/edu_arcade_game_1/public/defense/atlas.png) | 1254×1254 RGBA | 기본 유닛·시설 아틀라스와 대체 이미지 |
| [defense/boss-models.png](/workspace/edu_arcade_game_1/public/defense/boss-models.png) | 1774×887 RGBA | 두 보스의 상태 포즈 |
| [defense/bridge.png](/workspace/edu_arcade_game_1/public/defense/bridge.png) | 1774×887 RGBA | 숲 전장 다리 |
| [defense/camp-props.png](/workspace/edu_arcade_game_1/public/defense/camp-props.png) | 2172×724 RGBA | 거점 시설 3종 |
| [defense/camp.png](/workspace/edu_arcade_game_1/public/defense/camp.png) | 1536×1024 RGB | 거점 배경 |
| [defense/forest.png](/workspace/edu_arcade_game_1/public/defense/forest.png) | 1536×1024 RGB | 숲 전투·지역 이미지 |
| [defense/melee-motion.png](/workspace/edu_arcade_game_1/public/defense/melee-motion.png) | 1254×1254 RGBA | 근접 영웅·늑대 공격 3포즈 |
| [defense/models/bron-hammer.png](/workspace/edu_arcade_game_1/public/defense/models/bron-hammer.png) | 480×480 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/cheongun-sword.png](/workspace/edu_arcade_game_1/public/defense/models/cheongun-sword.png) | 480×480 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/fire-tower-crafted.png](/workspace/edu_arcade_game_1/public/defense/models/fire-tower-crafted.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/fire-tower.png](/workspace/edu_arcade_game_1/public/defense/models/fire-tower.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/frost-beacon.png](/workspace/edu_arcade_game_1/public/defense/models/frost-beacon.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/frost-guardian.png](/workspace/edu_arcade_game_1/public/defense/models/frost-guardian.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/ian-staff.png](/workspace/edu_arcade_game_1/public/defense/models/ian-staff.png) | 480×480 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/kar-hammer.png](/workspace/edu_arcade_game_1/public/defense/models/kar-hammer.png) | 480×480 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/luna-staff.png](/workspace/edu_arcade_game_1/public/defense/models/luna-staff.png) | 480×480 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/piercing-ballista-crafted.png](/workspace/edu_arcade_game_1/public/defense/models/piercing-ballista-crafted.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/piercing-ballista.png](/workspace/edu_arcade_game_1/public/defense/models/piercing-ballista.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/riel-bow.png](/workspace/edu_arcade_game_1/public/defense/models/riel-bow.png) | 480×480 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/water-cannon-crafted.png](/workspace/edu_arcade_game_1/public/defense/models/water-cannon-crafted.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/models/water-cannon.png](/workspace/edu_arcade_game_1/public/defense/models/water-cannon.png) | 640×640 RGBA | 작업실 정적 3D 모델의 렌더·미리보기 |
| [defense/monster-models.png](/workspace/edu_arcade_game_1/public/defense/monster-models.png) | 1086×1448 RGBA | 일반 적 포즈 |
| [defense/ranged-motion.png](/workspace/edu_arcade_game_1/public/defense/ranged-motion.png) | 1086×1448 RGBA | 원거리 영웅 공격 3포즈 |
| [defense/snow-atlas.png](/workspace/edu_arcade_game_1/public/defense/snow-atlas.png) | 1024×1536 RGBA | 설산 영웅·적·시설 아틀라스 |
| [defense/snow.png](/workspace/edu_arcade_game_1/public/defense/snow.png) | 1536×1024 RGB | 설산 전투·지역 이미지 |
| [defense/tower-models.png](/workspace/edu_arcade_game_1/public/defense/tower-models.png) | 1254×1254 RGBA | 3종 기반·6종 분기 전투 타워 |
| [favicon.svg](/workspace/edu_arcade_game_1/public/favicon.svg) | SVG | 허브 아이콘 SVG |
| [flags/au.svg](/workspace/edu_arcade_game_1/public/flags/au.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/br.svg](/workspace/edu_arcade_game_1/public/flags/br.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/ca.svg](/workspace/edu_arcade_game_1/public/flags/ca.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/ch.svg](/workspace/edu_arcade_game_1/public/flags/ch.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/cn.svg](/workspace/edu_arcade_game_1/public/flags/cn.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/de.svg](/workspace/edu_arcade_game_1/public/flags/de.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/es.svg](/workspace/edu_arcade_game_1/public/flags/es.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/fr.svg](/workspace/edu_arcade_game_1/public/flags/fr.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/gb.svg](/workspace/edu_arcade_game_1/public/flags/gb.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/in.svg](/workspace/edu_arcade_game_1/public/flags/in.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/it.svg](/workspace/edu_arcade_game_1/public/flags/it.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/jp.svg](/workspace/edu_arcade_game_1/public/flags/jp.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/kr.svg](/workspace/edu_arcade_game_1/public/flags/kr.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/se.svg](/workspace/edu_arcade_game_1/public/flags/se.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/us.svg](/workspace/edu_arcade_game_1/public/flags/us.svg) | SVG | 국기 퀴즈용 SVG |
| [flags/za.svg](/workspace/edu_arcade_game_1/public/flags/za.svg) | SVG | 국기 퀴즈용 SVG |
| [race/atlas.png](/workspace/edu_arcade_game_1/public/race/atlas.png) | 1254×1254 RGBA | 레이싱 배경 또는 스프라이트 |
| [race/valley-mobile.png](/workspace/edu_arcade_game_1/public/race/valley-mobile.png) | 1024×1536 RGB | 레이싱 배경 또는 스프라이트 |
| [race/valley.png](/workspace/edu_arcade_game_1/public/race/valley.png) | 1536×1024 RGB | 레이싱 배경 또는 스프라이트 |

## 생성 이미지 보관함 40개

22개는 프로젝트 이미지와 바이트 단위로 동일하다. 나머지 18개는 화면 시안·다른 버전 등을 포함하며 변형·파생 관계는 이 검사만으로 확정할 수 없다. 이미지 삭제나 교체는 하지 않았다.

| 번호·파일 | 관찰한 내용 | 프로젝트 원본과의 관계 |
|---|---|---|
| 00 [exec-116a0239-28a0-4f6c-af65-576ede4ed4a4.png](/workspace/generated_images/exec-116a0239-28a0-4f6c-af65-576ede4ed4a4.png) | 방어 기본 아틀라스 유사본 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 01 [exec-1343f739-2cf4-48a3-946f-6dd8a50282b7.png](/workspace/generated_images/exec-1343f739-2cf4-48a3-946f-6dd8a50282b7.png) | 방어 거점 데스크톱 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 02 [exec-13940fe1-393b-4e69-926e-f6cf530406ab.png](/workspace/generated_images/exec-13940fe1-393b-4e69-926e-f6cf530406ab.png) | 나무 다리 | [defense/bridge.png](/workspace/edu_arcade_game_1/public/defense/bridge.png) |
| 03 [exec-1e786c91-cb14-42c0-83eb-69ae6d8c9478.png](/workspace/generated_images/exec-1e786c91-cb14-42c0-83eb-69ae6d8c9478.png) | 원거리 영웅 포즈 유사본 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 04 [exec-256418d5-2ba0-4319-af97-0acd8f012bea.png](/workspace/generated_images/exec-256418d5-2ba0-4319-af97-0acd8f012bea.png) | 레이스 대표 이미지 | [art/race.png](/workspace/edu_arcade_game_1/public/art/race.png) |
| 05 [exec-3051aea3-2d82-4d75-9a64-cfd7e1957ba9.png](/workspace/generated_images/exec-3051aea3-2d82-4d75-9a64-cfd7e1957ba9.png) | 상식 퀴즈 대표 이미지 | [art/quiz.png](/workspace/edu_arcade_game_1/public/art/quiz.png) |
| 06 [exec-3989a121-6972-4630-ae12-b09a14567b74.png](/workspace/generated_images/exec-3989a121-6972-4630-ae12-b09a14567b74.png) | 근접 영웅·늑대 포즈 | [defense/melee-motion.png](/workspace/edu_arcade_game_1/public/defense/melee-motion.png) |
| 07 [exec-3d12cfe0-cd25-4887-bf55-ceb5010cfa19.png](/workspace/generated_images/exec-3d12cfe0-cd25-4887-bf55-ceb5010cfa19.png) | 숲 전장 배경 후보 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 08 [exec-3db9b4ea-56d3-46ea-9819-cfd6ad8c6afc.png](/workspace/generated_images/exec-3db9b4ea-56d3-46ea-9819-cfd6ad8c6afc.png) | 설산 영웅·적 아틀라스 | [defense/snow-atlas.png](/workspace/edu_arcade_game_1/public/defense/snow-atlas.png) |
| 09 [exec-415181a1-93e5-4ee2-a275-cd2927759546.png](/workspace/generated_images/exec-415181a1-93e5-4ee2-a275-cd2927759546.png) | 숫자 캐릭터 | [art/mascot.png](/workspace/edu_arcade_game_1/public/art/mascot.png) |
| 10 [exec-45b10fad-3b77-4736-9c0a-a7c63fef6b8f.png](/workspace/generated_images/exec-45b10fad-3b77-4736-9c0a-a7c63fef6b8f.png) | 허브 캐릭터 모음 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 11 [exec-4ddb2efa-a1c0-47c5-96ab-081050d80391.png](/workspace/generated_images/exec-4ddb2efa-a1c0-47c5-96ab-081050d80391.png) | 허브 데스크톱 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 12 [exec-51921f9e-27fc-4926-927c-d24fc6a25b78.png](/workspace/generated_images/exec-51921f9e-27fc-4926-927c-d24fc6a25b78.png) | 레이스 모바일 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 13 [exec-58d8bf73-53dc-4731-ba10-b222f0c9f74c.png](/workspace/generated_images/exec-58d8bf73-53dc-4731-ba10-b222f0c9f74c.png) | 방어 모바일 전투 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 14 [exec-59d00524-8714-42b8-b60d-024eb56b6955.png](/workspace/generated_images/exec-59d00524-8714-42b8-b60d-024eb56b6955.png) | 보스 포즈 유사본 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 15 [exec-5b048700-f579-4e58-8800-0f110b4316bb.png](/workspace/generated_images/exec-5b048700-f579-4e58-8800-0f110b4316bb.png) | 설산 전투 데스크톱 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 16 [exec-6fe7ac21-6b45-4295-8954-49e6bcffa794.png](/workspace/generated_images/exec-6fe7ac21-6b45-4295-8954-49e6bcffa794.png) | 일반 몬스터 포즈 유사본 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 17 [exec-7f30e320-abbd-42a2-acfe-3a78ddf62990.png](/workspace/generated_images/exec-7f30e320-abbd-42a2-acfe-3a78ddf62990.png) | 레이스 카트·아이템 아틀라스 | [race/atlas.png](/workspace/edu_arcade_game_1/public/race/atlas.png) |
| 18 [exec-84584845-2393-4c8c-b62b-efaf48b40c30.png](/workspace/generated_images/exec-84584845-2393-4c8c-b62b-efaf48b40c30.png) | 레이스 모바일 배경 | [race/valley-mobile.png](/workspace/edu_arcade_game_1/public/race/valley-mobile.png) |
| 19 [exec-84bb7388-2aad-46e5-9542-076e94e388c3.png](/workspace/generated_images/exec-84bb7388-2aad-46e5-9542-076e94e388c3.png) | 원거리 영웅 포즈 | [defense/ranged-motion.png](/workspace/edu_arcade_game_1/public/defense/ranged-motion.png) |
| 20 [exec-8c293ecc-1567-479c-a568-b5c1ea3a730f.png](/workspace/generated_images/exec-8c293ecc-1567-479c-a568-b5c1ea3a730f.png) | 허브 모바일 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 21 [exec-90e08f9c-6570-4a7e-b20b-6ed36398b74d.png](/workspace/generated_images/exec-90e08f9c-6570-4a7e-b20b-6ed36398b74d.png) | 9종 타워 아틀라스 | [defense/tower-models.png](/workspace/edu_arcade_game_1/public/defense/tower-models.png) |
| 22 [exec-97a978fe-fec6-41d3-81a2-88f6384203e7.png](/workspace/generated_images/exec-97a978fe-fec6-41d3-81a2-88f6384203e7.png) | 숫자 게임 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 23 [exec-98dafaac-bfdc-479a-b515-911a7f9513dc.png](/workspace/generated_images/exec-98dafaac-bfdc-479a-b515-911a7f9513dc.png) | 근접 영웅·늑대 포즈 유사본 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 24 [exec-9c177583-f117-4bc8-816d-8ad278232c05.png](/workspace/generated_images/exec-9c177583-f117-4bc8-816d-8ad278232c05.png) | 방어 전투 화면 구성 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 25 [exec-a66afd6d-9cc6-4147-83c8-760bb0797668.png](/workspace/generated_images/exec-a66afd6d-9cc6-4147-83c8-760bb0797668.png) | 숲 거점 배경 | [defense/camp.png](/workspace/edu_arcade_game_1/public/defense/camp.png) |
| 26 [exec-a6c635bc-0b6b-4653-89dd-34db7a155bf9.png](/workspace/generated_images/exec-a6c635bc-0b6b-4653-89dd-34db7a155bf9.png) | 보스 포즈 | [defense/boss-models.png](/workspace/edu_arcade_game_1/public/defense/boss-models.png) |
| 27 [exec-abfad51d-202d-48e1-81ca-f745ebc21e35.png](/workspace/generated_images/exec-abfad51d-202d-48e1-81ca-f745ebc21e35.png) | 기본 4×4 아틀라스 | [defense/atlas.png](/workspace/edu_arcade_game_1/public/defense/atlas.png) |
| 28 [exec-ac0e80df-c67a-47a9-a974-5eece0db1604.png](/workspace/generated_images/exec-ac0e80df-c67a-47a9-a974-5eece0db1604.png) | 방어 거점 모바일 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 29 [exec-ad026826-ed05-46f6-9bf5-d2a9cc678bcf.png](/workspace/generated_images/exec-ad026826-ed05-46f6-9bf5-d2a9cc678bcf.png) | 일반 몬스터 포즈 | [defense/monster-models.png](/workspace/edu_arcade_game_1/public/defense/monster-models.png) |
| 30 [exec-ad1798e6-c0b1-466d-98b1-c0163fcd78c6.png](/workspace/generated_images/exec-ad1798e6-c0b1-466d-98b1-c0163fcd78c6.png) | 레이스 데스크톱 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 31 [exec-ae27ae90-d0d8-40a1-b8c6-20b553cb9326.png](/workspace/generated_images/exec-ae27ae90-d0d8-40a1-b8c6-20b553cb9326.png) | 숲 전장 배경 | [defense/forest.png](/workspace/edu_arcade_game_1/public/defense/forest.png) |
| 32 [exec-b01aec57-bc3b-4e5a-b603-9b3a840e0b78.png](/workspace/generated_images/exec-b01aec57-bc3b-4e5a-b603-9b3a840e0b78.png) | 짝꿍 타일 이미지 | [art/tiles.png](/workspace/edu_arcade_game_1/public/art/tiles.png) |
| 33 [exec-bd538965-aac6-4973-8978-bd6985266812.png](/workspace/generated_images/exec-bd538965-aac6-4973-8978-bd6985266812.png) | 설산 전장 배경 | [defense/snow.png](/workspace/edu_arcade_game_1/public/defense/snow.png) |
| 34 [exec-c06d6984-55f5-4c50-8fa5-b7db6e6653c0.png](/workspace/generated_images/exec-c06d6984-55f5-4c50-8fa5-b7db6e6653c0.png) | 단어 게임 고양이 | [art/cat.png](/workspace/edu_arcade_game_1/public/art/cat.png) |
| 35 [exec-c4790c13-a96b-42aa-a388-bbeb004e062b.png](/workspace/generated_images/exec-c4790c13-a96b-42aa-a388-bbeb004e062b.png) | 숫자 로켓 이미지 | [art/rocket.png](/workspace/edu_arcade_game_1/public/art/rocket.png) |
| 36 [exec-c78dcca5-65db-4518-9927-5f0761ed31bc.png](/workspace/generated_images/exec-c78dcca5-65db-4518-9927-5f0761ed31bc.png) | 방어 데스크톱 화면 시안 | 정확히 동일한 파일 없음; 파생 여부 미확정 |
| 37 [exec-e34e632a-6fc3-4c55-9e6e-37f7ac39e83a.png](/workspace/generated_images/exec-e34e632a-6fc3-4c55-9e6e-37f7ac39e83a.png) | 거점 건물 3종 | [defense/camp-props.png](/workspace/edu_arcade_game_1/public/defense/camp-props.png) |
| 38 [exec-e9700472-c074-41d8-befb-e179769aa558.png](/workspace/generated_images/exec-e9700472-c074-41d8-befb-e179769aa558.png) | 아르카나 대표 이미지 | [art/defense.png](/workspace/edu_arcade_game_1/public/art/defense.png) |
| 39 [exec-fb082e0f-da94-4c39-9c3e-c7d74761e38f.png](/workspace/generated_images/exec-fb082e0f-da94-4c39-9c3e-c7d74761e38f.png) | 레이스 데스크톱 배경 | [race/valley.png](/workspace/edu_arcade_game_1/public/race/valley.png) |

## Higgsfield 결과 4개

이전 채팅에서 생성해 이미지 내용을 확인한 원격 콘셉트다. 프로젝트의 실제 전투 아틀라스에는 포함되지 않으며, 이번 점검에서 외부 자산을 프로젝트에 복사하거나 3D 모델로 변환하지 않았다. 원격 링크의 장기 유지 여부는 확인되지 않았다.

| 시안 | 원격 이미지 | 점검 |
|---|---|---|
| 서리군주 | [서리군주 이미지](https://d8j0ntlcm91z4.cloudfront.net/user_3KJ5DX1VtXBc4XuxXWu4umNUt3r/hf_20261109_062139_f3c17f2c-1732-43a1-acf2-f0513f9c7b30.png) | 왕관·흰 수염·얼음 검은 유사. 정면성이 강하고 불투명 배경이어서 전투 포즈용 원본 아님 |
| 화염 타워 | [화염 타워 이미지](https://d8j0ntlcm91z4.cloudfront.net/user_3KJ5DX1VtXBc4XuxXWu4umNUt3r/hf_20261109_063501_ac333e03-0abc-4476-95a2-37765aacdf1b.png) | 수정·불꽃·금속 질감 참고. 전투 아틀라스보다 높은 비율 |
| 관통 발리스타 | [발리스타 이미지](https://d8j0ntlcm91z4.cloudfront.net/user_3KJ5DX1VtXBc4XuxXWu4umNUt3r/hf_20261109_063501_44d771f2-95a4-4156-b74c-703a1a197a8a.png) | 목재·활대·볼트 참고. 깃발과 몸체 비율은 기존과 차이 |
| 물폭탄포 | [물폭탄포 이미지](https://d8j0ntlcm91z4.cloudfront.net/user_3KJ5DX1VtXBc4XuxXWu4umNUt3r/hf_20261109_063502_ba84300b-23be-4cdf-9e8b-62cec8e58f09.png) | 유리 탱크·관·물 표면 참고. 포신 방향과 몸체 비율은 별도 조정 |

위 판정과 작업 단계는 [캐릭터·모델링 제작 기획](arcana-character-modeling-plan.md)을 따른다.
