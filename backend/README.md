# Yomitoku backend

FastAPI API, PostgreSQL, Alembic, LangGraph 생성 워커로 구성된 백엔드다. React 앱은 저장소 루트에 있다.

## 로컬 실행

저장소 루트(`react-app`)에서 실행한다.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- OpenAPI: `http://localhost:8001/docs`
- Health: `http://localhost:8001/api/v1/health`
- PostgreSQL: `localhost:5433`

`GENERATION_PROVIDER=stub`이 기본값이며 외부 모델을 호출하지 않는다. Claude를 사용하려면 서버 환경 변수에 `GENERATION_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, 허용 모델 ID를 설정한다. API 키와 JWT 비밀값은 React에 노출하면 안 된다.

## 서비스 경계

- `reading_catalog`, `attempt_progress`, `attempt_views`, `attempts`: 학습 목록, 영구 점수, 풀이 응답 조립, 시도 상태 변경
- `reading_engagement`, `reading_feedback`, `learning_statistics`: 북마크·하이라이트, 평가·제보, 개인 통계
- `admin_item_queries`, `admin_reading_items`, `admin_generation`: 관리자 조회, 문항 변경, AI 생성 작업
- `generation_prompts`, `generation_provider`, `anthropic_generation_provider`: 프롬프트·공통 제공자 계약·Anthropic 어댑터

라우트는 HTTP·권한 처리만 담당하고, DB 변경과 조회 규칙은 서비스에 둔다.

## 인증과 권한

`POST /api/v1/auth/google`은 Google Identity Services ID 토큰을 검증하고 짧은 수명의 Yomitoku Bearer 토큰을 발급한다. 관리자 역할은 서버의 `ADMIN_GOOGLE_EMAILS` allowlist로만 결정한다.

`APP_ENV=development`와 `test`에서는 `X-Dev-Role`, `X-Dev-User-Id` 개발 헤더를 사용할 수 있다. 운영 환경에서는 거부된다.

## 생성 작업

관리자 생성 요청은 `POST /api/v1/admin/generation-jobs`로 작업만 만들고 `202 Accepted`를 반환한다. 별도 워커가 생성·규칙 검증·정답/품질 검증·재시도를 수행하며, 프론트는 작업 상태를 조회한다. `Idempotency-Key`와 사용자별 진행 중 작업 재사용으로 중복 생성을 막는다.

## 검증

```powershell
docker compose run --rm --no-deps api sh -c "pip install '.[dev]' && ruff check app tests && pytest -q"
```

운영 Compose, 백업, 기존 호스트 Caddy 연결은 [운영 배포 가이드](../docs/06-production-deployment.md)를 따른다.
