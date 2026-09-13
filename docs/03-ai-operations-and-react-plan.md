# AI 생성 운영과 프론트엔드 구조

## AI 생성 작업

관리자 요청은 즉시 작업만 생성하고, 별도 워커가 비용이 드는 처리를 수행한다.

```text
생성 요청
  -> queued
  -> generate
  -> validate_schema
  -> verify_answer + verify_quality
  -> decide
     -> revise 또는 retry_generate
     -> ready_for_review / held / failed
```

- 생성 작업은 `Idempotency-Key`와 사용자별 활성 작업 재사용으로 중복을 막는다.
- AI 생성 문항은 질문 하나와 선택지 네 개를 만든다. 수동 문항은 유형에 따라 복수 질문을 지원한다.
- 학습자에게 표시되는 선택지는 섞이므로, 생성 해설과 오답 해설은 선택지 번호·위치를 언급하면 안 된다.
- 검증을 통과해도 자동 게시하지 않는다. 생성된 문항은 관리자 검토를 거쳐 `published`가 된다.
- 구조화된 JSON이 잘리거나 형식이 맞지 않으면 제한된 출력 재시도 뒤 `failed`로 기록한다.

## 제공자와 프롬프트

- `generation_prompts.py`: 프롬프트와 토큰 제한 상수
- `generation_provider.py`: 공통 결과·사용량 타입, 비용 계산, Stub 제공자, factory
- `anthropic_generation_provider.py`: Anthropic SDK 호출과 JSON Schema 응답 해석

기본 `stub` 제공자는 외부 비용 없이 생성·검증·UI 흐름을 검증한다. `anthropic` 제공자는 서버에만 있는 API 키를 사용한다. 모델 ID와 허용 모델 목록은 운영 환경 변수로 관리한다.

## 기록과 안전장치

- `generation_jobs`에는 요청 조건, 상태, 현재 노드, 모델, 프롬프트 버전, 오류, 생성 문항을 기록한다.
- `generation_usage_events`에는 단계별 입력·출력·캐시 토큰, 비용, 중단 사유를 기록한다.
- `item_validations`에는 정답·품질 검증의 상태, 점수, issue code, 근거를 기록한다.
- 생성 요청은 관리자만 가능하다. API 키·JWT 비밀값·DB 비밀번호는 프론트나 GitHub Pages에 두지 않는다.

## 프론트엔드 구조

React 앱은 기능별 폴더와 가벼운 훅을 사용한다.

- `features/auth`: 랜딩, Google 로그인, 현재 사용자
- `features/readings`: 목록·필터, 시도 복원, 제출, 하이라이트, 번역
- `features/admin`: 목록·편집·수동 등록·생성·생성 이력
- `lib/api.ts`: API 요청·응답 변환과 오류 코드 처리
- `lib/i18n.tsx`: 한국어·일본어 UI 번역과 API 오류 메시지 번역

서버 데이터는 화면별 훅에서 가져오고, 다이얼로그·선택·토스트처럼 짧게 사는 상태만 React 상태로 둔다. 새 기능은 먼저 해당 기능 폴더의 훅·컴포넌트·회귀 테스트에 추가한다.
