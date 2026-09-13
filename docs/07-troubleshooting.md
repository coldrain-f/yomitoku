# 운영 트러블슈팅

이 문서는 Linux 운영 서버에서 Docker Compose와 기존 호스트 Caddy를 함께 사용할 때 자주 만나는 문제의 확인 순서를 정리한다. 모든 Compose 명령은 저장소 루트에서 실행하고, 운영 환경 파일을 명시한다.

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml <command>
```

호스트 Caddy를 사용하지 않는다면 두 번째 `-f` 옵션을 뺀다.

## `API_HOST_PORT`가 비어 있거나 Compose가 `api` 서비스를 해석하지 못할 때

증상 예시:

```text
The "API_HOST_PORT" variable is not set.
service "api" has neither an image nor a build context specified
```

대부분 `.env.production`을 읽지 않았거나 현재 위치가 저장소 루트가 아닌 경우다.

```sh
pwd
test -f .env.production && echo "environment file found"
grep '^API_HOST_PORT=' .env.production
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml config
```

- `.env.production`에는 `API_HOST_PORT=8003`처럼 값이 있어야 한다. 숫자는 서버에서 비어 있는 localhost 포트를 사용한다.
- 운영 명령에서 `--env-file .env.production`을 빼지 않는다.
- `docker-compose.host-caddy.yml`은 단독으로 실행하지 않고 production Compose 뒤에 override로 붙인다.

## 포트가 이미 사용 중일 때

증상 예시:

```text
Bind for 0.0.0.0:<port> failed: port is already allocated
```

먼저 어떤 프로세스가 포트를 쓰는지 확인한다.

```sh
ss -ltnp | grep ':8003'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

다른 서비스가 쓰는 포트라면 그 서비스를 임의로 중지하지 않는다. 사용하지 않는 포트로 `.env.production`의 `API_HOST_PORT`를 바꾸고, 호스트 Caddyfile의 `reverse_proxy 127.0.0.1:<port>`도 같은 값으로 바꾼 뒤 Caddy 설정을 검증·재적용한다.

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

## API가 `health: starting`이거나 health check가 실패할 때

기동 직후에는 migration과 API 초기화 때문에 잠시 `health: starting`일 수 있다. 15~30초 뒤 아래 순서로 확인한다.

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml ps

docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml logs --tail=200 migrate api worker
```

호스트 Caddy 구성에서는 `docker compose ... ps`에 보이는 localhost 포트로 직접 확인한다.

```sh
curl --fail http://127.0.0.1:8003/api/v1/health
```

- `Empty reply from server`는 API가 아직 초기화 중이거나 프로세스가 재시작 중일 수 있다. 로그에서 migration 실패, 환경 변수 검증 오류, DB 연결 오류를 먼저 확인한다.
- API 컨테이너가 healthy인데 연결이 안 되면 `ps`의 실제 포트와 Caddyfile의 포트가 같은지 확인한다.
- Docker Caddy 구성은 내부 포트 대신 공개 도메인으로 `./deploy/healthcheck.sh api.example.com`을 사용한다.

## 기존 호스트 Caddy의 프록시가 연결되지 않을 때

`reverse_proxy`는 Bash 명령이 아니라 `/etc/caddy/Caddyfile` 안의 지시문이다. 셸에 직접 입력하지 않는다.

```caddyfile
api.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8003
}
```

다음 세 값은 반드시 같아야 한다.

1. `.env.production`의 `API_HOST_PORT`
2. `docker compose ... ps`가 표시하는 API 포트
3. Caddyfile의 `reverse_proxy` 포트

변경 뒤에는 `caddy validate`를 통과한 경우에만 `systemctl reload caddy`를 실행한다.

## `git pull`이 Compose 파일의 로컬 수정 때문에 막힐 때

증상 예시:

```text
Your local changes to the following files would be overwritten by merge
deploy/docker-compose.host-caddy.yml
```

먼저 정확한 변경을 확인한다.

```sh
git status --short
git diff -- deploy/docker-compose.host-caddy.yml
```

포트·도메인·비밀값처럼 서버마다 다른 값은 Compose 파일이 아니라 `.env.production` 또는 호스트 Caddyfile에 둔다. 변경이 더 이상 필요 없다는 점을 확인한 뒤에만 commit 또는 stash 중 적절한 방법을 선택한다. 확인 없이 `git reset --hard`나 파일 덮어쓰기를 사용하지 않는다.

## migration 컨테이너가 실패할 때

API와 워커는 migration 성공 뒤에만 시작해야 한다. 실패한 migration을 건너뛰거나 API 컨테이너만 강제로 올리지 않는다.

```sh
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml logs --tail=300 migrate
```

오류 로그의 Alembic revision, DB 권한, 연결 문자열을 확인하고 수정한다. 데이터 변경이 포함된 문제라면 백업을 보존한 상태에서 별도 환경에서 재현한 뒤 복구·수정 절차를 결정한다.

## GitHub Pages 배포 상태가 오래 `updating_pages`에 머물 때

1. GitHub Actions 실행 로그에서 build 단계가 성공했는지 확인한다.
2. Pages 배포 상태가 갱신 중이면 잠시 기다린 뒤 Actions 또는 Pages 설정에서 최신 배포 상태를 다시 확인한다.
3. 반복해서 시간 초과하면 새 커밋을 연속으로 재배포하지 말고, 직전 성공 배포·Pages 설정·Actions 권한을 먼저 확인한다.
4. 프론트엔드 자체 문제인지 분리하려면 로컬에서 `npm run build`를 실행한다.

## 배포 후 최소 확인

- API health check
- GitHub Pages에서 Google 로그인
- 목록 조회와 문제 제출
- 관리자 계정의 문항 저장

문제가 재현되면 [QA 체크리스트](./04-acceptance-checklist.md)의 결함 기록 형식으로 환경, 절차, 기대 결과, 실제 결과를 남긴다.
