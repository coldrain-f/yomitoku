# 데이터 및 API 명세

## 1. 공통 규칙

- 모든 ID는 추측하기 어려운 UUID 또는 동등한 식별자를 사용한다.
- 날짜와 시간은 DB에 UTC로 저장하고 API는 ISO 8601 형식으로 반환한다. 화면은 `Asia/Seoul` 기준으로 표시한다.
- API는 JSON을 사용하고, 변경 요청은 인증된 사용자 정보에서 `user_id`를 얻는다. 클라이언트가 보내는 사용자 ID를 신뢰하지 않는다.
- 학습자에게 문항을 제공하는 API는 제출 전 정답 여부, 정답 선택지 ID, 해설, 오답 해설을 반환하지 않는다.

## 2. 열거형

| 이름 | 값 |
| --- | --- |
| `role` | `learner`, `admin` |
| `item_status` | `review`, `held`, `published` |
| `length_type` | `short`, `medium`, `long` |
| `jlpt_level` | `N5`, `N4`, `N3`, `N2`, `N1` |
| `generation_status` | `queued`, `generating`, `validating`, `revising`, `ready_for_review`, `held`, `failed` |
| `validation_status` | `passed`, `warning`, `failed` |

## 3. 데이터 모델

### 3.1 사용자 `users`

| 필드 | 설명 |
| --- | --- |
| `id` | 내부 사용자 ID |
| `google_subject` | Google OAuth의 고유 subject |
| `email` | 로그인 이메일 |
| `role` | `learner` 또는 `admin` |
| `created_at`, `updated_at` | 생성/수정 시각 |

- 관리자 판별은 서버의 허용 이메일 또는 Google subject allowlist로 한다.
- 프론트의 관리자 버튼 노출은 편의를 위한 표시일 뿐, 관리자 권한의 근거가 될 수 없다.

### 3.2 문항 `reading_items`

| 필드 | 설명 |
| --- | --- |
| `id` | 문항 ID |
| `title` | 일본어 제목 |
| `passage` | 지문 원문 |
| `question` | 질문 |
| `explanation` | 정답 해설 |
| `official_level` | 실제 난이도 |
| `length_type` | 단문/중문/장문 |
| `topic` | 주제 |
| `recommended_seconds` | 문항별 권장 시간 |
| `status` | 검토 중, 보류, 게시 |
| `published_at` | 최초 게시 시각. 미게시 상태면 `null` |
| `created_at`, `updated_at` | 등록/수정 시각 |

- 기본 권장 시간은 `short=60`, `medium=150`, `long=270`초다.
- 생성 시 기본값을 넣되, 관리자가 필요하면 문항별 값으로 수정할 수 있다.
- 목록과 풀이 API는 `status=published`만 반환한다.

### 3.3 선택지 `reading_choices`

| 필드 | 설명 |
| --- | --- |
| `id` | 영구 선택지 ID |
| `reading_item_id` | 문항 ID |
| `text` | 선택지 문장 |
| `canonical_order` | 관리자 편집 기준 순서 |
| `is_correct` | 정답 여부 |
| `wrong_explanation` | 오답인 경우의 설명 |

- 선택지 ID는 화면 번호와 별개다.
- 학습 화면은 API가 받은 선택지를 매 시도마다 섞어 표시한다. 서버 제출은 `choice_id`로 판정한다.
- 정답은 정확히 하나여야 한다.

### 3.4 풀이 기록 `attempts`

| 필드 | 설명 |
| --- | --- |
| `id` | 시도 ID |
| `user_id`, `reading_item_id` | 사용자와 문항 |
| `selected_choice_id` | 제출한 선택지 ID |
| `is_correct` | 서버 판정 결과 |
| `started_at`, `submitted_at` | 시작/제출 시각 |
| `elapsed_seconds` | 제출 시점의 경과 시간 |
| `abandoned_at` | 포기 시각. 제출하지 않으면 통계 제외 |

- 재풀이는 새 `attempts` 레코드다.
- 제출 API는 선택지가 해당 문항에 속하는지, 제출 시간이 시작 시간보다 뒤인지 검사한다.
- 클라이언트가 보내는 정답 여부나 풀이 시간 계산 결과를 신뢰하지 않는다. 서버 시각을 기준으로 보정한다.

### 3.5 문항 평가 `item_feedback`

| 필드 | 설명 |
| --- | --- |
| `id` | 평가 ID |
| `user_id`, `reading_item_id` | 사용자와 문항 |
| `quality_rating` | 1~5 |
| `perceived_level` | N5~N1 |
| `comment` | 선택 입력 개선 의견 |
| `created_at`, `updated_at` | 생성/수정 시각 |

- 한 사용자는 한 문항에 하나의 현재 평가만 가진다. 다시 보내면 upsert로 갱신한다.
- 체감 난이도 집계에는 사용자별 최신 평가만 사용한다.

### 3.6 오류 제보 `item_reports`

| 필드 | 설명 |
| --- | --- |
| `id` | 제보 ID |
| `user_id`, `reading_item_id` | 사용자와 문항 |
| `content` | 제보 내용 |
| `status` | `open`, `reviewed`, `resolved` |
| `created_at`, `updated_at` | 생성/수정 시각 |

### 3.7 생성 및 검증

`generation_jobs`는 LangGraph 작업 단위다. 요청 조건, 그래프 thread ID, 현재 노드, 재생성 횟수, 생성·검증 모델 ID, 프롬프트 버전, 토큰 수, 비용, 상태, 오류를 저장한다. 체크포인트는 이 작업 ID에 연결된 영속 저장소에 둔다.

`item_validations`는 검증 역할(`answer`, `quality`), 모델 ID, `passed`/`warning`/`failed` 상태, 점수, issue code, 지문 근거, 구조화된 원본 결과를 저장한다. 정답 단일성, 오답 구분성, 해설 논리의 최종 판정과 세부 결과는 이 기록에서 재현할 수 있어야 한다.

작업 상태는 `queued`, `generating`, `validating`, `revising`, `ready_for_review`, `held`, `failed`를 사용한다. 작업 상태와 문항의 `review`/`held`/`published` 상태는 별도로 관리한다. 자세한 흐름은 [03-ai-operations-and-react-plan.md](./03-ai-operations-and-react-plan.md)에 정의한다.

## 4. API 계약

`/api/v1`을 공통 접두사로 사용한다. 아래의 보호 API는 세션 또는 Bearer 토큰 인증을 요구한다.

### 4.1 인증과 현재 사용자

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| `GET` | `/me` | 로그인 | 현재 사용자와 역할 반환 |
| `POST` | `/auth/logout` | 로그인 | 세션 종료 |
| `POST` | `/auth/google` | 공개 | Google Identity Services ID 토큰 검증 및 Yomitoku Bearer 토큰 발급 |

`POST /auth/google` 요청은 Google의 `credential`(ID 토큰)을 받는다. API는 Google 서명, issuer, audience, 만료, 이메일 검증 여부를 확인한 뒤 Google `sub`로 로컬 사용자를 만들거나 갱신한다. 응답의 `accessToken`은 브라우저 세션에서만 사용하며 `AUTH_ACCESS_TOKEN_TTL_SECONDS` 뒤 만료된다.

관리자 역할은 `ADMIN_GOOGLE_EMAILS` 서버 allowlist로만 결정한다. 액세스 토큰의 역할은 서버 서명으로 보호되며, 프론트의 관리자 링크 노출은 권한 근거가 아니다.

`GET /me` 예시:

```json
{
  "id": "user_123",
  "role": "learner"
}
```

### 4.2 공개 목록과 풀이

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| `GET` | `/reading-items` | 공개 | 게시 문항 목록, 검색/필터/정렬/페이지네이션 |
| `GET` | `/reading-items/{itemId}` | 로그인 | 풀이용 문항 상세. 정답 비공개 |
| `POST` | `/reading-items/{itemId}/attempts` | 로그인 | 시도 시작 |
| `POST` | `/attempts/{attemptId}/submit` | 로그인 | 답안 제출 및 채점 |
| `POST` | `/attempts/{attemptId}/abandon` | 로그인 | 풀이 포기 |

목록 쿼리:

```text
GET /api/v1/reading-items?q=図書館&level=N2&length=medium&status=wrong&sort=published_desc&page=1&pageSize=10
```

- `status`는 로그인 사용자만 사용할 수 있다.
- `sort`는 `published_desc`, `published_asc`, `level_asc`, `level_desc`, `perceived_level_asc`, `perceived_level_desc`를 지원한다.
- 체감 난이도 미집계 문항은 체감 난이도 정렬에서 마지막에 둔다.

목록 응답 핵심 예시:

```json
{
  "items": [
    {
      "id": "item_123",
      "title": "地域の図書館が残すもの",
      "officialLevel": "N2",
      "perceivedLevel": "N1",
      "perceivedLevelVisible": true,
      "lengthType": "medium",
      "topic": "교육",
      "recommendedSeconds": 150,
      "publishedAt": "2026-08-29T01:00:00Z",
      "myLatestStatus": "wrong"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "totalItems": 42,
  "totalPages": 5
}
```

풀이 상세 응답에는 `choices: [{ id, text }]`만 포함하고 `isCorrect`, `explanation`, `wrongExplanation`은 포함하지 않는다.

답안 제출 요청:

```json
{
  "selectedChoiceId": "choice_456",
  "clientElapsedSeconds": 188
}
```

제출 응답에는 `isCorrect`, `selectedChoiceId`, `correctChoiceId`, `explanation`, `selectedChoiceWrongExplanation`, `elapsedSeconds`, `recommendedSeconds`, `itemAccuracy`, `challengerCount`를 포함한다.

### 4.3 통계, 평가, 제보

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| `GET` | `/me/statistics` | 로그인 | 전체/유형별/난이도별 통계 |
| `PUT` | `/reading-items/{itemId}/feedback` | 로그인 | 문항 평가 upsert |
| `POST` | `/reading-items/{itemId}/reports` | 로그인 | 오류 제보 등록 |

### 4.4 관리자

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/admin/reading-items` | 관리 목록, 검색/필터/정렬/페이지네이션 |
| `POST` | `/admin/reading-items` | 수동 문항 생성 또는 생성 결과 확정 |
| `GET` | `/admin/reading-items/{itemId}` | 편집 상세와 운영 지표 |
| `PATCH` | `/admin/reading-items/{itemId}` | 제목, 내용, 난이도, 유형, 주제, 선택지, 해설 수정 |
| `POST` | `/admin/reading-items/{itemId}/publish` | 게시 |
| `POST` | `/admin/reading-items/{itemId}/hold` | 보류 |
| `POST` | `/admin/reading-items/{itemId}/unhold` | 보류 취소 후 검토 중 |
| `DELETE` | `/admin/reading-items/{itemId}` | 영구 삭제 |
| `POST` | `/admin/generation-jobs` | AI 지문 생성 작업 요청. `202 Accepted`와 작업 ID 반환 |
| `GET` | `/admin/generation-jobs/{jobId}` | 생성/검증 상태, 현재 노드, 재시도 횟수, 검증 결과 조회 |

관리 API는 모두 `role=admin`을 서버에서 요구한다.

## 5. 통계 및 집계 규칙

### 5.1 헤더와 개인 통계

- 전체 생성 문항 수: 영구 삭제되지 않은 모든 문항의 수. `review`, `held`, `published`를 모두 포함한다.
- 풀이 완료 수: 해당 사용자가 한 번 이상 제출한 서로 다른 문항 수.
- 문항별 최근 제출: 사용자와 문항 조합에서 `submitted_at`이 가장 최신인 제출 기록.
- 전체 정답률: 문항별 최근 제출 기록 중 정답 수 / 전체 수. 결과가 없으면 `-`로 표시한다.
- 평균 풀이 시간: 문항별 최근 제출 기록의 `elapsed_seconds` 평균. `mm:ss`로 반올림해 표시한다.
- 유형별/난이도별 분모: 영구 삭제되지 않은 전체 생성 문항 수. 완료 수, 정답률, 평균 시간은 해당 그룹의 문항별 최근 제출 기록을 사용한다.

### 5.2 문항 정답률과 도전 수

- 도전 수: 해당 문항을 한 번 이상 제출한 고유 사용자 수.
- 문항 정답률: 각 사용자의 해당 문항 최신 제출 1건만 사용한 정답 비율.
- 도전 수가 0이면 정답률은 `-`, 도전 수는 `0명`으로 표시한다.

### 5.3 체감 난이도

- 유효 평가는 사용자별 최신 `item_feedback.perceived_level`이다.
- 10명 미만이면 일반 목록과 결과에는 `체감 집계 중`을 표시한다.
- 10명 이상이면 `N5=1`부터 `N1=5`로 환산한 중앙값을 체감 난이도로 사용한다. 중앙값이 두 값 사이이면 더 높은 난이도 값을 사용한다.
- 관리자 화면에는 집계 값과 유효 평가 인원을 표시한다.
- 일반 목록에는 체감 난이도만 표시하고 인원 수는 표시하지 않는다.

## 6. 트랜잭션과 삭제

- 게시, 보류, 보류 취소, 편집은 문항 상태와 `updated_at`을 원자적으로 갱신한다.
- 삭제 API는 문항 존재와 관리자 권한을 확인한 뒤 한 DB 트랜잭션으로 실행한다.
- 삭제 대상은 문항, 선택지, 시도, 평가, 오류 제보, 생성 작업, 검증 결과다.
- 삭제 후 복구를 위한 소프트 삭제 컬럼, 휴지통, 화면상 보류 대체 상태를 두지 않는다.
- 삭제 중 참조 무결성 오류가 발생하면 전체를 롤백하고 오류를 반환한다.
