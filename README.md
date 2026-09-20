# 読み解く

일본어·한국어 독해 문항을 풀고, 결과·북마크·하이라이트를 개인 학습 기록으로 남기는 웹 서비스다. 학습자는 Google 로그인 후 독해를 시작하고, 관리자는 문항을 직접 등록하거나 AI 생성 작업을 검토·게시한다.

## 현재 기능

- 소개 랜딩과 Google 로그인, 학습자·관리자 서버 권한 분리
- 한국어/일본어 UI 전환과 언어별 문항 목록·필터·정렬·페이지네이션
- 검색어 300ms 디바운스, 이전 목록 요청 취소, 15초 요청 제한과 화면별 코드 분할
- 매 시도마다 섞이는 선택지, 복수 문항 제출, 서버 채점, 결과·통계, 같은 탭 새로고침 시 진행·결과 복원
- 북마크 즉시 저장과 되돌리기, 본문 하이라이트, 하이라이트 모아 보기·검색·삭제, 번역 보기
- 모바일 우측 하단의 시간·하이라이트 조작 UI
- 관리자 문항 목록·수동 등록·편집·상태 변경·삭제와 AI 제목/주제/해설 제안, 읽기 쉬운 권장 시간 선택
- LangGraph 워커 기반 AI 문항 생성·검증·재시도·사용량 이력

## 구조

```text
src/
  features/auth/        # 랜딩, 로그인, 인증 상태
  features/readings/    # 목록, 풀이, 결과, 하이라이트
  features/statistics/  # 개인 학습 통계
  features/admin/       # 관리자 목록, 편집, 생성, 생성 이력
  components/           # 공통 헤더, 다이얼로그, UI 요소
  hooks/                # 다이얼로그, 필터, 토스트, 번역
  lib/                  # API 클라이언트, 다국어, 정책, 표시 유틸리티

backend/
  app/api/routes/       # HTTP 라우트와 권한 경계
  app/services/         # 읽기/쓰기, 생성, 풀이, 통계 도메인 서비스
  app/worker/           # 생성 작업 워커
  tests/                # 비동기 DB 기반 백엔드 회귀 테스트
```

## 프론트엔드 개발

```powershell
npm install
npm run dev
```

- 개발 서버: `http://localhost:5173`
- 타입·프로덕션 빌드: `npm run build`
- 프론트엔드 테스트: `npm test`

`VITE_API_BASE_URL`을 지정하지 않으면 개발 API 주소는 `http://localhost:8001/api/v1`이다. Google 로그인에는 `VITE_GOOGLE_CLIENT_ID`가 필요하다.

## 백엔드 개발

저장소 루트에서 실행한다.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- API 문서: `http://localhost:8001/docs`
- 상태 확인: `http://localhost:8001/api/v1/health`
- PostgreSQL: `localhost:5433`

기본 `GENERATION_PROVIDER=stub`은 외부 AI 비용 없이 전체 생성 흐름을 검증한다. 실제 Claude 호출은 서버 `.env`에 `GENERATION_PROVIDER=anthropic`, 모델 ID, `ANTHROPIC_API_KEY`를 설정한 뒤에만 활성화한다.

백엔드 전체 테스트는 Docker Desktop이 실행된 상태에서 다음 명령으로 확인한다.

```powershell
docker compose run --rm --no-deps api sh -c "pip install '.[dev]' && pytest -q"
```

운영 배포와 환경 변수는 [운영 배포 가이드](./docs/06-production-deployment.md), 화면·API·QA 기준은 [문서 안내](./docs/README.md)에서 확인한다.
