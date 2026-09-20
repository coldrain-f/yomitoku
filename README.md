# 読み解く

> AI-assisted full-stack portfolio project · Japanese/Korean reading-learning service

일본어·한국어 독해 학습에서 문항 탐색, 풀이, 피드백, 복습과 콘텐츠 운영을 하나의 흐름으로 연결한 웹 서비스다. 학습자는 Google 로그인 후 독해를 풀고 결과·북마크·하이라이트를 학습 기록으로 남긴다. 관리자는 문항을 직접 등록하거나 AI 생성 작업을 검토한 뒤 게시한다.

## 문제와 해결 방식

독해 학습은 문항을 찾는 과정, 긴 지문을 풀며 근거를 다시 찾는 과정, 틀린 이유를 복습하는 과정이 끊기기 쉽다. 読み解く는 다음 흐름을 하나로 설계했다.

```text
조건에 맞는 문항 탐색
  → 시도별 선택지 순서로 풀이
  → 문항별 정답 수·해설 확인
  → 같은 조건의 다음 미풀이 문항 또는 복습 기록으로 이동
```

서비스 운영에서는 AI가 만든 문항을 자동 게시하지 않는다. 생성·스키마 검증·정답/품질 검증·관리자 검토를 거쳐서만 학습자에게 공개한다.

## 핵심 구현

- 소개 랜딩과 Google 로그인, 학습자·관리자 서버 권한 분리
- 한국어/일본어 UI 전환과 언어별 문항 목록·필터·정렬·페이지네이션
- 검색어 300ms 디바운스, 이전 목록 요청 취소, 15초 요청 제한과 화면별 코드 분할
- 매 시도마다 섞이는 선택지, 복수 문항 제출, 서버 채점, 결과·통계, 같은 탭 새로고침 시 진행·결과 복원
- 북마크 즉시 저장과 되돌리기, 본문 하이라이트, 하이라이트 모아 보기·검색·삭제, 번역 보기
- 모바일 우측 하단의 시간·하이라이트 조작 UI
- 관리자 문항 목록·수동 등록·편집·상태 변경·삭제와 AI 제목/주제/해설 제안, 읽기 쉬운 권장 시간 선택
- LangGraph 워커 기반 AI 문항 생성·검증·재시도·사용량 이력

## 설계에서 중시한 점

| 주제 | 구현 결정 | 사용자·운영 효과 |
| --- | --- | --- |
| 느린 검색 | 300ms 디바운스, 이전 요청 취소, 15초 요청 제한 | 빠른 입력 중 불필요한 요청과 오래된 결과 덮어쓰기를 줄임 |
| 학습 연속성 | 현재 시도 ID·답안을 탭 세션에 보관하고 서버 시도를 재조회 | 같은 탭 새로고침 뒤에도 풀이·결과를 복원 |
| 다음 학습 | 현재 검색어·언어·등급·유형·북마크 조건 전체에서 미풀이 문항 조회 | 현재 페이지를 순환하며 같은 문항을 다시 권하는 문제를 방지 |
| 반복 조작 | 북마크 즉시 반영과 되돌리기, 변경된 초안에만 이탈 확인 | 자주 반복하는 행동의 확인 단계를 줄이고 데이터 손실은 방지 |
| 접근성 | 다이얼로그 포커스 이동·순환·복귀, 선택지 방향키 조작 | 키보드만으로도 핵심 흐름을 수행 가능 |

구현 근거와 선택하지 않은 대안, 검증 범위는 [포트폴리오 사례 연구](./docs/00-portfolio-case-study.md)에 정리했다.

## AI 협업과 책임

이 프로젝트는 AI 에이전트를 구현 파트너로 사용했다. AI는 코드·테스트·문서의 초안을 제안하고 반복 작업을 지원했으며, 프로젝트 소유자는 제품 범위와 수용 기준을 정하고 결과를 검토·수정·검증하는 방식으로 진행했다.

포트폴리오에서는 AI가 작성한 코드를 모두 수작업으로 작성했다고 주장하지 않는다. 대신 문제 정의, 요구사항 우선순위, 설계 결정, 회귀 검증과 배포 판단처럼 실제로 설명하고 재현할 수 있는 책임을 명시한다.

## 검증과 현재 한계

- 최신 프런트엔드 검증: `npm test` 16개 파일·24개 테스트, `npm run build` 통과 (2026-09-20 기준)
- 백엔드는 Ruff와 pytest를 별도 워크플로에서 검사한다. 프런트엔드 테스트를 PR CI에서 실행하는 일은 후속 개선 항목이다.
- 풀이·결과 복원은 같은 브라우저 탭의 로그인 세션을 대상으로 한다. URL만으로 다른 사용자에게 학습 시도를 공유하지 않는다.
- 실제 Google 로그인, 운영 API, iPhone Safari·Android Chrome에서의 종단 간 검증은 [QA 체크리스트](./docs/04-acceptance-checklist.md)의 다음 단계다.

## 저장소 구조

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

## 로컬 실행

### 프론트엔드

```powershell
npm install
npm run dev
```

- 개발 서버: `http://localhost:5173`
- 타입·프로덕션 빌드: `npm run build`
- 프론트엔드 테스트: `npm test`

`VITE_API_BASE_URL`을 지정하지 않으면 개발 API 주소는 `http://localhost:8001/api/v1`이다. Google 로그인에는 `VITE_GOOGLE_CLIENT_ID`가 필요하다.

### 백엔드

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

## 문서 안내

- 처음 보는 사람을 위한 기술·제품 사례: [포트폴리오 사례 연구](./docs/00-portfolio-case-study.md)
- 화면 동작과 상태 전이: [UI·흐름 명세](./docs/01-ui-and-flow-spec.md)
- API와 데이터 모델: [데이터·API 명세](./docs/02-data-and-api-spec.md)
- AI 생성 운영 구조: [AI 생성 아키텍처](./docs/03-ai-operations-and-react-plan.md)
- 검증·배포: [QA 체크리스트](./docs/04-acceptance-checklist.md), [운영 배포 가이드](./docs/06-production-deployment.md)
