# 운영 백엔드 배포 가이드

## 범위

이 가이드는 GitHub Pages 프론트엔드와 별도의 Linux 서버에 Yomitoku API를 배포하는 기준이다. 운영 서버는 Caddy가 HTTPS를 종료하고 FastAPI, LangGraph 워커, PostgreSQL은 Docker 내부 네트워크에만 둔다. PostgreSQL `5432`와 API `8000`은 외부에 공개하지 않는다.

기본 Compose는 Caddy까지 Docker로 실행한다. 서버가 이미 Caddy를 운영 중이면 `docker-compose.host-caddy.yml`을 추가해 API만 `127.0.0.1:8002`으로 열고, 기존 Caddy가 이를 프록시한다.

## 배포 전 준비

1. API에 쓸 도메인 또는 서브도메인(예: `api.example.com`)의 DNS `A` 레코드를 서버 공인 IP로 연결한다.
2. 서버 방화벽은 SSH 관리 포트와 HTTPS용 `80`, `443`만 연다.
3. 서버에 Git, Docker Engine, Docker Compose plugin을 설치한다.
4. Google Cloud Console의 OAuth Web Client에 `https://coldrain-f.github.io`를 Authorized JavaScript origin으로 등록한다.
5. GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에 다음 값을 둔다.
   - `VITE_API_BASE_URL=https://api.example.com/api/v1`
   - `VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com`

Google Client ID는 공개 클라이언트 값이지만, DB 비밀번호, `AUTH_JWT_SECRET`, AI API 키는 GitHub Actions에 넣지 않는다. 서버의 `.env.production`에만 둔다.

## 서버 최초 배포

서버에서 저장소를 clone한 뒤 운영 환경 파일을 만든다.

```sh
cp deploy/production.env.example .env.production
chmod 600 .env.production
```

`.env.production`의 모든 예시 값을 실제 값으로 바꾼다. 특히 다음은 필수다.

```text
API_DOMAIN=api.example.com
API_HOST_PORT=8002
POSTGRES_PASSWORD=긴-무작위-비밀번호
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://coldrain-f.github.io
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
AUTH_JWT_SECRET=32자-이상의-무작위-서버-비밀값
ADMIN_GOOGLE_EMAILS=관리자@example.com
```

운영 설정에 누락된 Google Client ID, 관리자 이메일, 짧은 JWT 비밀값, HTTP CORS 원본이 있으면 FastAPI는 시작 단계에서 실패한다. 설정 오류를 공개 서비스 상태로 배포하지 않기 위한 의도된 동작이다.

### 기존 Caddy를 쓰는 서버

호스트 Caddy의 설정 파일에 API 도메인 블록을 추가한다. 실제 도메인으로 바꾸고, 이미 사용 중인 `8002`가 있으면 `.env.production`과 두 위치의 포트를 같은 값으로 함께 바꾼다.

```caddyfile
api.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8002
}
```

설정을 적용하기 전 검증하고 Caddy를 다시 읽힌다.

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

DNS 전파가 끝난 뒤 다음 명령으로 기동한다. 기존 Caddy를 쓰는 서버에서는 두 번째 Compose 파일도 함께 지정한다.

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml up -d --build
```

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml up -d --build
```

정상 기동을 확인한다.

```sh
./deploy/healthcheck.sh api.example.com
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml ps
```

기존 Caddy를 쓰는 경우에는 위 명령에도 `-f deploy/docker-compose.host-caddy.yml`을 추가한다. 먼저 내부 연결을 확인하려면 `curl --fail http://127.0.0.1:8002/api/v1/health`를 실행한다.

응답은 `{"status":"ok","database":"ok"}`이어야 한다. Caddy가 자동 HTTPS 인증서를 발급하려면 DNS와 80/443 포트가 외부에서 접근 가능해야 한다.

## 프론트 연결과 로그인 확인

1. GitHub Actions Variables에 운영 API URL과 Google Client ID를 저장한다.
2. `main`에 푸시하거나 GitHub Actions에서 Pages 배포를 다시 실행한다.
3. `https://coldrain-f.github.io/yomitoku/`에서 Google 로그인, 일반 학습, 관리자 계정의 문항 관리까지 확인한다.
4. 관리자가 아닌 계정으로 관리자 API 또는 `/admin/readings`에 접근해 거절되는지 확인한다.

## 백업과 갱신

스키마 변경이나 이미지 갱신 전에는 PostgreSQL 백업을 만든다.

```sh
./deploy/backup-postgres.sh
```

백업 파일은 기본적으로 서버 저장소의 `backups/`에 생성된다. 이 디렉터리는 서버 장애와 함께 사라질 수 있으므로, 생성 뒤 별도의 암호화된 저장소로 복사한다. 보관 기간과 삭제 정책은 그 외부 저장소에서 관리한다.

백업 스크립트는 DB 덤프가 성공한 뒤에만 압축 파일을 만들며, 실패하면 오류 코드로 종료한다. 생성된 파일의 크기와 외부 저장소 복사 결과를 정기적으로 확인한다.

일반 갱신은 다음 순서다.

```sh
git pull --ff-only
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml up -d --build
./deploy/healthcheck.sh api.example.com
```

`migrate` 컨테이너가 Alembic 마이그레이션을 먼저 실행하고 성공해야 API와 워커가 시작한다. 실패 시 API 컨테이너를 억지로 올리지 말고 로그와 백업을 확인한다.

워커 코드나 Alembic 마이그레이션이 포함된 갱신은 기존 이미지를 재사용하지 않도록 다음 순서로 실행한다. 이 경우 실행 중이던 생성 작업은 자동 재생성되지 않고 `실패`로 정리되므로, 생성 이력에서 상태와 사용량을 먼저 확인한다.

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml build --no-cache migrate api worker
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml run --rm migrate
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml up -d --force-recreate api worker
```

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml logs --tail=200 migrate api worker caddy
```

기존 Caddy를 쓰는 서버는 위의 Compose 명령마다 `-f deploy/docker-compose.host-caddy.yml`을 추가하고, 로그 명령에서는 `caddy`를 뺀다.

## 운영 점검

- 매 배포 뒤 health endpoint와 Google 로그인을 확인한다.
- 정기적으로 백업 파일을 다른 저장소에 복사하고 복원 절차를 별도 테스트한다.
- `docker compose ... logs`에서 API 5xx, 워커 실패, Caddy 인증서 오류를 확인한다.
- 운영 Compose는 컨테이너별 로그를 20MB씩 최대 3개만 보관한다. 급격히 반복되는 로그는 용량을 채우기 전에 원인을 해결한다.
- AI 모델 키를 넣기 전까지는 `GENERATION_PROVIDER=stub`을 유지한다.
- GitHub Actions의 `Backend checks`가 backend 변경마다 린트, 테스트, 운영 Compose 해석을 확인한다.
