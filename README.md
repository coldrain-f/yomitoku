# 読み解く React + TypeScript 앱

정적 프로토타입을 React와 TypeScript로 옮기고 FastAPI 백엔드까지 연결한 MVP다. 기존 `../index.html`, `../styles.css`, `../app.js`는 시각적 기준 시안으로 유지한다.

## 구조

```text
src/
  App.tsx                  # 라우트 가드, 화면 상태, API 흐름 조립
  types.ts                 # 문항, 시도, 필터, 다이얼로그 도메인 타입
  components/              # 헤더, 다이얼로그와 재사용 UI
  features/readings/       # 목록, 풀이, 결과
  features/statistics/     # 학습 통계
  features/admin/          # 관리 목록, 편집, 생성, 미리보기
  lib/api.ts               # FastAPI 클라이언트와 API 응답 변환
  lib/reading.ts           # 표시·정렬에 쓰는 순수 함수와 상수
```

화면의 CSS 클래스와 사용자 흐름은 정적 시안과 동일하게 유지한다. 서버 데이터와 화면 상태는 분리해, 목록·통계·관리 데이터는 API에서 받고 다이얼로그·선택지·타이머만 React 상태로 관리한다.

## 실행

```powershell
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`에서 실행된다. 포트가 이미 사용 중이면 Vite가 다음 포트를 선택하며, Docker 기본 CORS 설정은 `5173`과 `5174`를 모두 허용한다.

## 검증

```powershell
npm run build
```

타입만 확인할 때는 다음 명령을 사용한다.

```powershell
npm run typecheck
```

## 현재 범위

- API 기반 목록, 검색, 필터, 페이지네이션
- Google Identity Services 로그인과 서버 토큰 기반 권한 경계
- 서버 채점 기반 선택지 셔플, 제출, 해설, 결과, 통계
- 관리자 목록, 편집, 생성 작업 폴링, 미리보기, 보류, 게시, 삭제
- React Router 기반 화면 전환과 목록 필터 URL 쿼리
- TypeScript strict 모드 기반 도메인·컴포넌트·라우트 상태 검사
- Lucide React 아이콘과 기존 CSS 재사용

현재 목록, 문항, 시도, 통계, 관리자 문항은 FastAPI와 PostgreSQL을 사용한다. 풀이 중 선택과 타이머, 제출 직후 결과 화면은 브라우저 상태이며 결과 URL을 새로고침해 복원하는 API는 아직 없다. Google 로그인은 Identity Services ID 토큰을 서버에서 검증하고, 서버가 발급한 짧은 수명의 Bearer 토큰을 브라우저 세션에 보관한다. 운영 설정 방법은 [05-delivery-roadmap.md](./docs/05-delivery-roadmap.md)에 정리했다.

## 백엔드 시작

`backend/`에는 FastAPI API, PostgreSQL 스키마, LangGraph 생성·검증 워커가 있다. 저장소 루트에서 다음을 실행하면 `db`, `migrate`, `api`, `worker` 컨테이너가 함께 실행된다.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- API 문서: `http://localhost:8001/docs`
- 상태 확인: `http://localhost:8001/api/v1/health`

기본 생성 제공자는 외부 API를 호출하지 않는 `stub`이다. 실제 Claude 사용 전에는 `.env`의 `GENERATION_PROVIDER`, 모델 ID, `ANTHROPIC_API_KEY`를 설정해야 한다. 자세한 구성은 [backend/README.md](./backend/README.md)에 정리했다.
