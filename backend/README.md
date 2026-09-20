# Yomitoku バックエンド

FastAPI API、PostgreSQL、Alembic、LangGraph生成ワーカーで構成されるバックエンドです。Reactアプリはリポジトリのルートにあります。

## ローカル実行

リポジトリのルート（`react-app`）で実行します。

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- OpenAPI: `http://localhost:8001/docs`
- Health: `http://localhost:8001/api/v1/health`
- PostgreSQL: `localhost:5433`

`GENERATION_PROVIDER=stub`がデフォルトであり、外部モデルを呼び出しません。Claudeを使用する場合は、サーバー環境変数に`GENERATION_PROVIDER=anthropic`、`ANTHROPIC_API_KEY`、許可モデルIDを設定します。APIキーとJWTシークレットをReactに公開してはいけません。

## サービス境界

- `reading_catalog`, `attempt_progress`, `attempt_views`, `attempts`: 学習一覧、永続スコア、解答レスポンスの組み立て、試行状態の変更
- `reading_engagement`, `reading_feedback`, `learning_statistics`: ブックマーク・ハイライト、評価・報告、個人統計
- `admin_item_queries`, `admin_reading_items`, `admin_generation`: 管理者取得、問題変更、AI生成タスク
- `generation_prompts`, `generation_provider`, `anthropic_generation_provider`: プロンプト、共通プロバイダー契約、Anthropicアダプター

ルートはHTTP・権限処理だけを担い、DB更新と取得ルールはサービスに置きます。

## 認証と権限

`POST /api/v1/auth/google`はGoogle Identity ServicesのIDトークンを検証し、短い有効期限のYomitoku Bearerトークンを発行します。管理者ロールは、サーバーの`ADMIN_GOOGLE_EMAILS` allowlistだけで判定します。

`APP_ENV=development`と`test`では、`X-Dev-Role`、`X-Dev-User-Id`の開発用ヘッダーを使用できます。本番環境では拒否されます。

## 生成タスク

管理者の生成リクエストは、`POST /api/v1/admin/generation-jobs`でタスクのみを作成して`202 Accepted`を返します。別ワーカーが生成、ルール検証、正答・品質検証、再試行を実行し、フロントエンドはタスク状態を取得します。`Idempotency-Key`とユーザーごとの実行中タスク再利用で、重複生成を防ぎます。

## 検証

```powershell
docker compose run --rm --no-deps api sh -c "pip install '.[dev]' && ruff check app tests && pytest -q"
```

本番Compose、バックアップ、既存ホストCaddyとの接続は[本番デプロイガイド](../docs/06-production-deployment.md)に従います。
