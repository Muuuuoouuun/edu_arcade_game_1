# Fable 이미지 검토 운영

이 도구는 기존 카르 이미지 검토 시험과 같은 짧은 요청을 재현하기 위한 **제작 환경용** CLI다. 각 실행은 이미지 하나와 문구 하나만 보낸다. 게임이나 Android 앱에서는 호출하지 않는다.

```bash
# 첫 입력: 프로젝트 안의 UTF-8 문서에 검토 질문 작성
python3 tools/fable_image_review.py \
  --image public/defense/models/kar-barbarian.png \
  --prompt-file docs/내-검토-질문.txt \
  --output-dir docs/내-새-검토결과 \
  --effort high --max-tokens 3000 --timeout 120
```

명령은 확인창 없이 **실제 Anthropic API에 호출하고 과금될 수 있다**. 호출 전 실제 예산과 이미지 전송 의도를 확인한다. 키는 `ANTHROPIC_API_KEY_KR2` 환경변수에서만 읽고 파일·로그에 기록하지 않는다. 다른 키나 모델로 자동 전환하지 않으며 모델은 `claude-fable-5-2`, effort는 반드시 명시한다. 입력 이미지는 프로젝트 내부의 PNG/JPEG/WebP 서명과 5MiB 제한을 확인한다. 서명 검사는 전체 이미지 디코딩·유효성을 보증하지 않는다. 문구 파일은 UTF-8·16KiB 이하여야 한다.

출력 디렉터리는 `docs/` 아래의 **새** 경로만 허용한다. `receipt.json`에 입력 경로·SHA-256·모델·effort·종료 사유·사용량과 상태를 기록하고 반환 본문이 있을 때만 `response.md`를 만든다. 키·HTTP 헤더·이미지 base64·추론 본문은 저장하지 않는다. 입력 파일 자체와 모델의 응답은 해당 파일에 남으므로 공개 가능 범위인지 확인한다.

| 상태 | 의미 |
| --- | --- |
| `complete` | 요청 모델이 확인되고 메시지 종료·`end_turn`·사용량·비어 있지 않은 본문이 도착 |
| `empty_response` | 정상 스트림이 끝났지만 본문이 없음. 답변으로 간주하지 않음 |
| `truncated_or_other_stop` | 본문은 있으나 `end_turn`이 아님. 완료 답변으로 간주하지 않음 |
| `incomplete_stream` | 메시지 종료 이벤트 없이 스트림이 끝남 |
| `model_mismatch`, `missing_usage` | 반환 모델 또는 사용량 확인 실패 |
| `http_rejected` | HTTP 4xx 응답. 본문이나 인증 헤더는 기록하지 않음 |
| `outcome_unknown` | 타임아웃·네트워크·서버·스트림 오류. 요청 처리나 과금을 알 수 없음 |

사용량은 제공자 반환값이며 금액은 이 도구가 추정하지 않는다. 타임아웃은 소켓 작업별 한도다. **자동 재시도는 하지 않는다.** 같은 모델·effort·토큰 한도·이미지·문구 해시의 요청은 `.fable-review.local/` 로컬 원장으로 중복 전송을 막는다. 프로세스가 요청 도중 중단되면 `outcome_unknown`이 남을 수 있다. 서버 사용 내역을 확인하고, 다시 요청해야 하는 경우에는 의도를 확인한 뒤 원장을 수동으로 관리한다. 이 로컬 원장은 다른 기기·복제본의 호출이나 서로 다른 입력의 호출을 막지 않는다.

오프라인 검증은 `python3 -m unittest discover -s tools -p 'test_fable_image_review.py' -v`. 네트워크와 유료 API 호출 없이 모의 응답으로 정상·빈 응답·잘림·모델 불일치·사용량 누락·타임아웃·HTTP 거부·중복 전송·경로 제한을 확인한다. 실제 모델의 예술적 판단·가격·실기기 게임 가독성을 검증하는 테스트가 아니다.
