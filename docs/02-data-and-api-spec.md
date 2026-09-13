# 데이터 및 API 명세

## 공통 규칙

- API 접두사는 `/api/v1`이고 JSON의 필드명은 camelCase다.
- DB 시간은 UTC로 저장하며 API는 ISO 8601을 반환한다.
- ID는 UUID다. 보호 요청의 사용자 ID와 역할은 Bearer 토큰에서만 얻는다.
- 학습자 상세 API는 제출 전 `isCorrect`, 정답 ID, 해설, 오답 해설을 반환하지 않는다.
- 전체 응답 형태와 필수 필드는 FastAPI OpenAPI 문서(`/docs`)를 최종 기준으로 한다.

## 핵심 데이터 모델

| 모델 | 역할 |
| --- | --- |
| `users` | Google subject, 이메일, `learner`/`admin` 역할 |
| `reading_items` | 제목, 지문, 언어, 등급, 유형, 주제, 권장 시간, 출처, 게시 상태 |
| `reading_questions`, `reading_choices` | 문항별 질문과 선택지. 선택지는 정답·오답 해설·관리자 기준 순서를 가짐 |
| `attempts`, `attempt_answers` | 시도별 선택지 섞기 순서, 질문별 답, 채점 결과, 시간, 포기 상태 |
| `item_bookmarks`, `passage_highlights` | 사용자별 북마크와 UTF-16 오프셋 기반 하이라이트 |
| `item_feedback`, `item_reports` | 품질·체감 난이도 평가와 오류 제보 |
| `generation_jobs`, `generation_usage_events`, `item_validations` | AI 생성 요청, 모델 사용량, 검증 기록 |

문항 상태는 `review`, `held`, `published`다. 삭제는 소프트 삭제가 아니며 연결된 데이터는 외래키 cascade로 함께 제거된다.

## 인증

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/auth/google` | Google ID 토큰 검증 후 Yomitoku Bearer 토큰 발급 |
| `GET` | `/me` | 현재 로그인 사용자와 역할 반환 |
| `POST` | `/auth/logout` | 클라이언트 토큰 제거를 위한 204 응답 |

관리자 역할은 `ADMIN_GOOGLE_EMAILS` 서버 allowlist만으로 결정한다. 개발 전용 `X-Dev-Role`, `X-Dev-User-Id` 헤더는 development/test 환경에서만 허용한다.

## 학습 API

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| `GET` | `/reading-items` | 선택 | 검색·필터·정렬·페이지네이션 목록. 로그인 시 개인 상태·북마크 포함 |
| `GET` | `/reading-items/{itemId}` | 로그인 | 풀이용 상세. 정답은 비공개 |
| `PUT`/`DELETE` | `/reading-items/{itemId}/bookmark` | 로그인 | 북마크 설정·해제 |
| `POST` | `/reading-items/{itemId}/translation` | 로그인 | 지문·질문·선택지 번역 |
| `GET`/`POST` | `/reading-items/{itemId}/highlights` | 로그인 | 문항 하이라이트 조회·생성 |
| `DELETE` | `/reading-items/{itemId}/highlights/{highlightId}` | 로그인 | 하이라이트 삭제 |
| `GET` | `/reading-items/highlights` | 로그인 | 하이라이트 모아 보기·검색·페이지네이션 |
| `POST` | `/reading-items/{itemId}/attempts` | 로그인 | 새 풀이 시도와 섞인 선택지 순서 생성 |
| `GET` | `/reading-items/attempts/{attemptId}` | 로그인 | 진행 중 또는 제출된 시도 상태 복원 |
| `POST` | `/reading-items/attempts/{attemptId}/submit` | 로그인 | 질문별 답안 제출과 서버 채점 |
| `POST` | `/reading-items/attempts/{attemptId}/abandon` | 로그인 | 시도 포기 |
| `PUT` | `/reading-items/{itemId}/feedback` | 로그인 | 품질·체감 난이도 평가 upsert |
| `POST` | `/reading-items/{itemId}/reports` | 로그인 | 오류 제보 |
| `GET` | `/me/statistics` | 로그인 | 개인 학습 통계 |

목록은 `q`, `language`, `level`, `length`, `status`, `time`, `bookmarked`, `sort`, `page`, `pageSize`를 지원한다. `bookmarked=true`은 로그인 사용자만 의미가 있다.

## 관리자 API

모든 `/admin/*` 경로는 관리자 Bearer 토큰을 요구한다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET`/`POST` | `/admin/reading-items` | 관리자 목록과 수동 문항 등록 |
| `GET`/`PATCH`/`DELETE` | `/admin/reading-items/{itemId}` | 상세 조회·편집·영구 삭제 |
| `POST` | `/admin/reading-items/{itemId}/publish` | 게시 |
| `POST` | `/admin/reading-items/{itemId}/hold` | 보류 |
| `POST` | `/admin/reading-items/{itemId}/unhold` | 보류 해제 후 검토 상태 |
| `POST` | `/admin/reading-items/title-suggestion` | AI 제목 제안 |
| `POST` | `/admin/reading-items/topic-suggestion` | AI 주제 제안 |
| `POST` | `/admin/reading-items/explanation-suggestion` | AI 해설 제안 |
| `GET` | `/admin/generation-model-options` | 생성 화면 모델 선택지 |
| `POST` | `/admin/generation-jobs` | 생성 작업 생성. 신규는 202, 진행 중/동일 요청 재사용은 200 |
| `GET` | `/admin/generation-jobs`, `/admin/generation-jobs/active`, `/admin/generation-jobs/{jobId}` | 이력·활성 작업·개별 상태 조회 |

## 점수·집계 규칙

- 시도 결과는 서버 시각으로 계산하고, 포기한 시도는 통계에 포함하지 않는다.
- 목록의 영구 점수는 첫 제출이 정답·권장 시간 이내면 100, 첫 제출이 정답·시간 초과면 90, 오답 뒤 재도전 정답이면 80이다.
- 문항 정답률은 사용자별 최신 제출 1건을 사용한다. 결과 화면의 도전 수는 제출한 고유 사용자 수다.
- 체감 난이도는 사용자별 최신 평가를 쓰며, 최소 유효 투표 수를 만족할 때만 일반 목록에 공개한다.
