# 배포 전 개발 로드맵

## 목적

이 문서는 `読み解く` MVP를 실제 개인 서비스로 전환할 때의 작업 순서와 각 단계의 완료 기준을 고정한다. 기능을 한 번에 넓히지 않고, 이 문서의 단계를 하나씩 완료·검증한 뒤 다음 단계로 진행한다.

## 현재 상태

2026-08-31 기준으로 React 화면, FastAPI API, PostgreSQL, 관리자 문항 관리, LangGraph 기반 생성·검증 워커는 로컬 Docker 환경에서 연결돼 있다. 프론트엔드는 GitHub Pages에 배포돼 있고, Google 로그인 구현과 운영 배포용 Compose 구성이 준비돼 있다. 실제 서버에 환경 변수와 도메인을 설정해 배포하는 작업이 남아 있다.

## 작업 순서

| 단계 | 목표 | 핵심 결과 | 완료 기준 |
| --- | --- | --- | --- |
| 1 | Google 로그인 | 실제 사용자 식별과 관리자 권한 분리 | Google 로그인, 로그아웃, learner/admin 접근 제어가 동작한다. |
| 2 | 운영 백엔드 배포 | 공개 API와 DB를 안전하게 운영 | HTTPS, PostgreSQL, 마이그레이션, CORS, 백업, 헬스체크가 구성된다. |
| 3 | AI 생성 실연동 | 비용을 통제하는 실제 생성·검증 | 모델 키, 프롬프트 버전, 한도, 재시도, 비용·오류 기록이 동작한다. |
| 4 | 서버 상태 보강 | 새로고침과 많은 데이터에서도 일관된 UX | 결과 복원, 서버 페이지네이션, 캐시·로딩·오류 상태가 완성된다. |
| 5 | 품질과 운영 자동화 | 변경을 안전하게 배포 | 테스트, CI, 로그·모니터링, 배포 절차가 자동화된다. |

## 1. Google 로그인

### 구현 범위

- Google Identity Services 버튼으로 ID 토큰을 받는다.
- FastAPI가 Google 공개키와 OAuth Client ID로 ID 토큰을 검증한다.
- 검증된 Google `sub`를 사용자 식별자로 사용하고, 이메일은 표시·관리 용도로만 저장한다.
- 서버가 서명한 짧은 수명의 Bearer 액세스 토큰을 발급한다. 프론트는 이 토큰을 브라우저 세션에만 보관한다.
- `ADMIN_GOOGLE_EMAILS` allowlist에 있는 계정만 `admin` 역할을 받는다. 모든 관리자 API는 서버에서 다시 역할을 검사한다.
- 로그아웃 시 브라우저 토큰을 지우고 보호 화면에서 목록으로 돌아간다.

### 운영자가 준비할 값

Google Cloud Console에서 웹 애플리케이션 OAuth Client ID를 만들고 다음 JavaScript 원본을 등록한다.

- `https://coldrain-f.github.io`
- 로컬 개발용 `http://localhost:5173`, `http://localhost:5174`

백엔드 환경 변수에는 아래 값을 설정한다. Client ID는 공개돼도 되는 식별자지만, `AUTH_JWT_SECRET`과 AI API 키는 서버의 비밀 관리 기능에만 저장한다.

```text
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
AUTH_JWT_SECRET=32자-이상의-무작위-서버-비밀값
ADMIN_GOOGLE_EMAILS=admin@example.com
```

프론트 빌드 환경에는 같은 Client ID와 배포될 API URL을 설정한다.

```text
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_API_BASE_URL=https://api.example.com/api/v1
```

GitHub Pages 배포는 저장소의 **Settings → Secrets and variables → Actions → Variables**에서 `VITE_GOOGLE_CLIENT_ID`와 `VITE_API_BASE_URL`을 읽는다. 두 값은 공개 클라이언트 설정이므로 Actions Variable에 두고, `AUTH_JWT_SECRET`은 백엔드 서버의 비밀 관리 기능에만 둔다.

### 완료 기준

- 비로그인 사용자는 공개 목록만 본다.
- Google 계정으로 로그인하면 새 사용자가 `users`에 저장되고, 풀이·통계를 이용할 수 있다.
- allowlist 밖 계정은 관리자 URL과 API에서 거절된다.
- allowlist 계정은 관리자 화면과 API를 이용할 수 있다.
- 잘못된 Google ID 토큰, 만료된 액세스 토큰, 조작된 역할은 보호 API에서 거절된다.
- 로그아웃 뒤 보호 라우트로 직접 들어가도 목록으로 이동한다.

## 2. 운영 백엔드 배포

- API 전용 도메인과 HTTPS를 구성한다.
- Docker Compose 또는 서버의 컨테이너 플랫폼에서 `db`, `migrate`, `api`, `worker`를 운영한다.
- 운영 PostgreSQL의 비밀번호, 자동 백업, 복구 절차를 준비한다.
- `APP_ENV=production`, GitHub Pages 원본만 포함한 `CORS_ALLOWED_ORIGINS`, 실제 API URL을 설정한다.
- `/api/v1/health`를 로드밸런서 또는 모니터링 대상에 등록한다.

자세한 서버 작업은 [06-production-deployment.md](./06-production-deployment.md)를 따른다. 완료 기준은 GitHub Pages에서 로그인, 풀이, 통계, 관리자 문항 관리까지 실제 HTTPS API로 동작하는 것이다.

## 3. AI 생성 실연동

- 실제 생성·검증 모델의 키와 모델 ID를 서버에만 설정한다.
- 생성, 정답 검증, 품질 검증 프롬프트를 버전으로 관리한다.
- 작업별 입력·출력 토큰, 비용 추정·실측, 오류 코드, 재시도 횟수를 기록한다.
- 관리자별 생성 한도와 쿨다운을 서버에서 적용한다.
- 검증 실패와 모델 장애를 `held` 또는 `failed`로 명확히 종료하고 관리자 화면에서 원인을 확인한다.

완료 기준은 실제 모델 호출이 관리자 검토 전까지 자동 게시하지 않고, 오류나 한도 초과가 사용자 데이터 손상 없이 처리되는 것이다.

## 4. 서버 상태 보강

- 제출 결과를 다시 조회할 수 있는 API와 React 라우트를 추가한다.
- 목록·관리 목록을 서버 페이지네이션, 검색, 정렬 조건과 연결한다.
- TanStack Query 등으로 서버 데이터 캐시, 무효화, 로딩·재시도 상태를 일관되게 관리한다.
- API 장애, 빈 목록, 권한 부족을 화면별로 명확히 표시한다.

완료 기준은 새로고침, 뒤로 가기, 직접 URL 접근, 데이터가 늘어난 목록에서도 화면과 서버 상태가 일치하는 것이다.

## 5. 품질과 운영 자동화

- FastAPI 권한·제출·상태 전환 테스트와 React 핵심 흐름 테스트를 추가한다.
- GitHub Actions에서 프론트 빌드, 백엔드 정적 검사·테스트를 실행한다.
- 서버 로그, 오류 추적, 응답 시간·생성 실패·비용 경보를 구성한다.
- 배포·롤백·DB 마이그레이션·비밀키 교체 절차를 운영 문서로 고정한다.

완료 기준은 변경이 자동 검증되고, 장애 원인과 복구 절차를 운영자가 재현 가능하게 확인할 수 있는 것이다.
