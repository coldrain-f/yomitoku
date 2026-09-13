# 운영 백엔드 배포 가이드

## 구성

GitHub Pages 프론트엔드와 Linux 서버의 API를 분리한다. 운영 Compose는 PostgreSQL, Alembic migration, FastAPI, 생성 워커를 실행한다.

- 기본 구성: Docker Caddy가 80/443을 열고 API를 프록시한다.
- 기존 호스트 Caddy 구성: `deploy/docker-compose.host-caddy.yml`을 추가해 API만 `127.0.0.1:${API_HOST_PORT}`에 바인딩한다.
- DB 포트와 컨테이너 내부 API 포트는 외부에 공개하지 않는다.

## 배포 전 준비

1. API 도메인의 DNS A 레코드를 서버 IP에 연결한다.
2. 방화벽에서 SSH와 HTTPS용 80/443만 허용한다.
3. Git, Docker Engine, Docker Compose plugin을 설치한다.
4. Google Cloud Console에 GitHub Pages 원본을 Authorized JavaScript origin으로 등록한다.
5. GitHub Actions Variables에 `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`를 설정한다.

서버 저장소에서 환경 파일을 만들고 권한을 제한한다.

```sh
cp deploy/production.env.example .env.production
chmod 600 .env.production
```

`.env.production`에는 DB 비밀번호, JWT 비밀값, Google Client ID, 관리자 이메일, CORS 원본, API 도메인을 실제 값으로 넣는다. 기존 호스트 Caddy를 쓸 때는 사용하지 않는 localhost 포트로 `API_HOST_PORT`도 설정한다.

`API_HOST_PORT`를 포함한 모든 Compose 변수는 `.env.production`에서 읽으므로, 아래의 **모든** 운영 Compose 명령에 `--env-file .env.production`을 붙인다.

## 최초 기동

### Docker Caddy 사용

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml up -d --build
```

### 기존 호스트 Caddy 사용

호스트 Caddyfile에 `.env.production`의 `API_HOST_PORT`와 같은 값을 넣는다. `reverse_proxy`는 셸 명령이 아니라 Caddyfile 지시문이다.

```caddyfile
api.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8003
}
```

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy

docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml up -d --build
```

`8003`은 예시일 뿐이다. Caddyfile, `.env.production`, `docker compose ... ps`의 포트가 모두 같아야 한다.

## 기동 확인

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml ps
```

호스트 Caddy 구성이라면 `ps` 출력의 localhost 포트를 사용해 내부 health check를 실행한다.

```sh
curl --fail http://127.0.0.1:8003/api/v1/health
```

컨테이너 Caddy 구성은 공개 도메인으로 확인한다.

```sh
./deploy/healthcheck.sh api.example.com
```

API 컨테이너가 `health: starting` 상태일 때는 잠시 뒤 다시 확인한다. health 응답은 `{"status":"ok","database":"ok"}`이다.

## 일반 갱신

Compose 파일을 직접 수정해 포트·비밀값을 관리하지 않는다. 서버별 값은 `.env.production`에 둔다. `git pull` 전에는 로컬 수정 여부를 확인한다.

```sh
git status --short
git pull --ff-only
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml up -d --build
curl --fail http://127.0.0.1:8003/api/v1/health
```

호스트 Caddy를 쓰지 않으면 `-f deploy/docker-compose.host-caddy.yml`을 빼고, 마지막 health check는 API 도메인으로 바꾼다. `migrate` 컨테이너는 API·워커보다 먼저 Alembic migration을 실행한다. migration이 실패하면 API를 강제로 올리지 말고 로그와 백업을 확인한다.

`git pull`이 Compose 파일의 로컬 수정 때문에 막히면, 먼저 변경 내용이 서버 고유 설정인지 확인한다. 서버 고유 값은 `.env.production`으로 옮긴 뒤 commit 또는 stash 여부를 판단한다. 설정 파일을 무작정 덮어쓰지 않는다.

## 로그·백업·복구

```sh
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml logs --tail=200 migrate api worker
```

백업은 서버 외부의 암호화된 저장소에도 복사하고, 정기적으로 별도 환경에서 복원 가능 여부를 확인한다. 운영 중에는 health endpoint, Google 로그인, 일반 풀이 제출, 관리자 저장을 배포 후 smoke test 한다.
