# 本番運用のトラブルシューティング

この文書では、Linuxの本番サーバーでDocker Composeと既存ホストのCaddyを併用する際によくある問題と、その確認順序をまとめます。すべてのComposeコマンドはリポジトリのルートで実行し、本番環境ファイルを明示します。

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml <command>
```

ホストCaddyを使用しない場合は、2つ目の`-f`オプションを外します。

## `API_HOST_PORT`が空、またはComposeが`api`サービスを解釈できない場合

症状例:

```text
The "API_HOST_PORT" variable is not set.
service "api" has neither an image nor a build context specified
```

多くの場合、`.env.production`を読み込んでいないか、現在位置がリポジトリのルートではありません。

```sh
pwd
test -f .env.production && echo "environment file found"
grep '^API_HOST_PORT=' .env.production
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml config
```

- `.env.production`には、`API_HOST_PORT=8003`のように値が必要です。数値にはサーバー上で空いているlocalhostポートを使用します。
- 本番コマンドから`--env-file .env.production`を外しません。
- `docker-compose.host-caddy.yml`は単独で実行せず、production Composeの後ろにoverrideとして追加します。

## ポートがすでに使用されている場合

症状例:

```text
Bind for 0.0.0.0:<port> failed: port is already allocated
```

まず、どのプロセスがポートを使っているかを確認します。

```sh
ss -ltnp | grep ':8003'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

別のサービスが使っているポートなら、そのサービスを勝手に停止しません。未使用ポートに`.env.production`の`API_HOST_PORT`を変更し、ホストCaddyfileの`reverse_proxy 127.0.0.1:<port>`も同じ値に変更してから、Caddy設定を検証・再適用します。

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

## APIが`health: starting`、またはhealth checkに失敗する場合

起動直後はmigrationとAPI初期化のため、しばらく`health: starting`になることがあります。15〜30秒後に次の順序で確認します。

```sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml ps

docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml logs --tail=200 migrate api worker
```

ホストCaddy構成では、`docker compose ... ps`に表示されるlocalhostポートで直接確認します。

```sh
curl --fail http://127.0.0.1:8003/api/v1/health
```

- `Empty reply from server`は、APIがまだ初期化中か、プロセスが再起動中の可能性があります。ログでmigration失敗、環境変数の検証エラー、DB接続エラーを先に確認します。
- APIコンテナがhealthyなのに接続できない場合は、`ps`の実際のポートとCaddyfileのポートが一致するかを確認します。
- Docker Caddy構成では、内部ポートではなく公開ドメインに対して`./deploy/healthcheck.sh api.example.com`を使います。

## 既存ホストCaddyのプロキシに接続できない場合

`reverse_proxy`はBashコマンドではなく、`/etc/caddy/Caddyfile`内のディレクティブです。シェルに直接入力しません。

```caddyfile
api.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8003
}
```

次の3つの値は必ず一致させます。

1. `.env.production`の`API_HOST_PORT`
2. `docker compose ... ps`が表示するAPIポート
3. Caddyfileの`reverse_proxy`ポート

変更後は、`caddy validate`を通過した場合にのみ`systemctl reload caddy`を実行します。

## Composeファイルのローカル変更により`git pull`が停止する場合

症状例:

```text
Your local changes to the following files would be overwritten by merge
deploy/docker-compose.host-caddy.yml
```

まず、正確な変更を確認します。

```sh
git status --short
git diff -- deploy/docker-compose.host-caddy.yml
```

ポート、ドメイン、シークレットのようにサーバーごとに異なる値は、Composeファイルではなく`.env.production`またはホストCaddyfileに置きます。変更が不要であることを確認してから、commitまたはstashの適切な方法を選びます。確認なしに`git reset --hard`やファイルの上書きを実行しません。

## migrationコンテナが失敗する場合

APIとワーカーはmigrationが成功してからのみ起動すべきです。失敗したmigrationを飛ばしたり、APIコンテナだけを強制起動したりしません。

```sh
./deploy/backup-postgres.sh
docker compose --env-file .env.production \
  -f deploy/docker-compose.production.yml \
  -f deploy/docker-compose.host-caddy.yml logs --tail=300 migrate
```

エラーログのAlembic revision、DB権限、接続文字列を確認して修正します。データ変更を伴う問題なら、バックアップを保持したまま別環境で再現してから、復旧・修正手順を決めます。

## GitHub Pagesのデプロイ状態が長く`updating_pages`のままの場合

1. GitHub Actionsの実行ログで、buildステップが成功したかを確認します。
2. Pagesのデプロイ状態が更新中なら、少し待ってからActionsまたはPages設定で最新のデプロイ状態を再確認します。
3. 繰り返しタイムアウトする場合は、新しいコミットを連続で再デプロイせず、直近の成功デプロイ、Pages設定、Actions権限を先に確認します。
4. フロントエンド自体の問題かを切り分けるには、ローカルで`npm run build`を実行します。

## デプロイ後の最小確認

- API health check
- GitHub PagesでのGoogleログイン
- 一覧取得と問題提出
- 管理者アカウントでの問題保存

問題が再現した場合は、[QAチェックリスト](./04-acceptance-checklist.md)の不具合記録形式に従い、環境、手順、期待結果、実際の結果を残します。
