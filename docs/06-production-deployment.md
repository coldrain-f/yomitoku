# 本番バックエンドのデプロイガイド

## 構成

GitHub Pagesのフロントエンドと、Linuxサーバー上のAPIを分離します。本番用Composeは、PostgreSQL、Alembic migration、FastAPI、生成ワーカーを実行します。

- 基本構成: Docker Caddyが80／443を公開し、APIをプロキシします。
- 既存ホストのCaddy構成: `deploy/docker-compose.host-caddy.yml`を追加し、APIだけを`127.0.0.1:${API_HOST_PORT}`にバインドします。
- DBポートとコンテナ内部のAPIポートは外部に公開しません。

## デプロイ前の準備

1. APIドメインのDNS AレコードをサーバーIPへ向けます。
2. ファイアウォールでは、SSHとHTTPS用の80／443だけを許可します。
3. Git、Docker Engine、Docker Compose pluginをインストールします。
4. Google Cloud Consoleで、GitHub PagesのオリジンをAuthorized JavaScript originとして登録します。
5. GitHub Actions Variablesに`VITE_API_BASE_URL`、`VITE_GOOGLE_CLIENT_ID`を設定します。

サーバーのリポジトリ内で環境ファイルを作成し、権限を制限します。

```sh
cp deploy/production.env.example .env.production
chmod 600 .env.production
```

`.env.production`には、DBパスワード、JWTシークレット、Google Client ID、管理者メールアドレス、CORSオリジン、APIドメインを実際の値で設定します。既存ホストのCaddyを使う場合は、未使用のlocalhostポートとして`API_HOST_PORT`も設定します。

`API_HOST_PORT`を含むすべてのCompose変数は`.env.production`から読み込むため、以下の**すべて**の本番Composeコマンドには`--env-file .env.production`を付けます。

## 初回起動

### Docker Caddyを使用する場合

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml up -d --build
```

### 既存ホストのCaddyを使用する場合

ホストのCaddyfileには、`.env.production`の`API_HOST_PORT`と同じ値を設定します。`reverse_proxy`はシェルコマンドではなく、Caddyfileのディレクティブです。

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

`8003`は例です。Caddyfile、`.env.production`、`docker compose ... ps`のポートはすべて一致させる必要があります。

## 起動確認

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml ps
```

ホストCaddy構成では、`ps`出力のlocalhostポートを使って内部ヘルスチェックを実行します。

```sh
curl --fail http://127.0.0.1:8003/api/v1/health
```

コンテナCaddy構成では、公開ドメインを使って確認します。

```sh
./deploy/healthcheck.sh api.example.com
```

APIコンテナが`health: starting`のときは、少し待ってから再確認します。healthレスポンスは`{"status":"ok","database":"ok"}`です。

## 通常の更新

Composeファイルを直接変更してポート・シークレットを管理しません。サーバー固有の値は`.env.production`に置きます。`git pull`の前にローカル変更の有無を確認します。

```sh
git status --short
git pull --ff-only
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml up -d --build
curl --fail http://127.0.0.1:8003/api/v1/health
```

ホストCaddyを使わない場合は`-f deploy/docker-compose.host-caddy.yml`を外し、最後のヘルスチェックはAPIドメインへ変更します。`migrate`コンテナはAPI・ワーカーより先にAlembic migrationを実行します。migrationが失敗した場合、APIを強制的に起動せず、ログとバックアップを確認します。

`git pull`がComposeファイルのローカル変更によって止まる場合は、まず変更がサーバー固有の設定かどうかを確認します。サーバー固有の値は`.env.production`へ移した後に、commitまたはstashの要否を判断します。設定ファイルを無条件に上書きしません。

## ログ・バックアップ・復旧

```sh
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml logs --tail=200 migrate api worker
```

バックアップはサーバー外の暗号化されたストレージにもコピーし、定期的に別環境で復元できることを確認します。運用中は、health endpoint、Googleログイン、通常の解答提出、管理者保存をデプロイ後にスモークテストします。

Compose変数、ポート、health check、Caddy、migration、GitHub Pagesの問題は[運用トラブルシューティング](./07-troubleshooting.md)に従います。
