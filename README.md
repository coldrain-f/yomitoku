# 読み解く

> AIとの協働で実装したフルスタック読解学習サービス

日本語・韓国語の読解学習において、問題の検索、解答、フィードバック、復習、コンテンツ運用を一つの流れにつなぐWebサービスです。受講者はGoogleログイン後に読解問題を解き、結果・ブックマーク・ハイライトを学習記録として残します。管理者は問題を直接登録するか、AI生成タスクをレビューして公開します。

## 課題と解決方法

読解学習では、問題を探すこと、長い本文を読みながら根拠を確認すること、誤答理由を復習することが分断されがちです。読み解くでは、以下を一つの学習フローとして設計しました。

```text
条件に合う問題を探す
  → 試行ごとに並び替えられた選択肢で解答する
  → 設問ごとの正答数と解説を確認する
  → 同じ条件の次の未回答問題、または復習記録へ進む
```

運用面では、AIが生成した問題を自動公開しません。生成、スキーマ検証、正答・品質検証、管理者レビューを経たものだけを受講者に公開します。

## 主な実装

- 紹介ランディング、Googleログイン、受講者・管理者のサーバー側権限分離
- 日本語・韓国語のUI切替、言語別の問題一覧、フィルター、並び替え、ページネーション
- 検索語の300msデバウンス、古い一覧リクエストのキャンセル、15秒タイムアウト、画面単位のコード分割
- 試行ごとにシャッフルされる選択肢、複数設問の提出、サーバー採点、結果・統計、同一タブの再読み込み時の試行・結果復元
- ブックマークの即時保存と取り消し、本文ハイライト、ハイライト一覧・検索・削除、翻訳表示
- モバイル画面右下のタイマー・ハイライト操作UI
- 管理者向け問題一覧、手動登録、編集、状態変更、削除、AIによるタイトル・トピック・解説の提案、読みやすい目安時間の選択
- LangGraphワーカーによるAI問題生成、検証、再試行、利用量の記録

## 設計・協働・検証

AIエージェントはコード・テスト・文書の下書きを支援し、プロダクトの範囲と受け入れ基準、変更レビュー、最終検証はプロジェクト所有者が担いました。実装判断の根拠と責任範囲は[プロジェクト概要と設計判断](./docs/00-project-overview.md)にまとめています。

- 2026-09-20時点で、`npm test`（16ファイル・24テスト）と`npm run build`が成功しています。
- PRではバックエンド（Ruff・pytest・Compose）とフロントエンド（テスト・ビルド）を検査し、`main`へのデプロイではフロントエンドをビルドします。
- 実際のGoogleログイン、運用API、モバイルブラウザのエンドツーエンド検証は[QAチェックリスト](./docs/04-acceptance-checklist.md)で管理します。

## リポジトリ構成

```text
src/
  features/auth/        # ランディング、ログイン、認証状態
  features/readings/    # 一覧、解答、結果、ハイライト
  features/statistics/  # 個人学習統計
  features/admin/       # 管理者一覧、編集、生成、生成履歴
  components/           # 共通ヘッダー、ダイアログ、UI要素
  hooks/                # ダイアログ、フィルター、トースト、翻訳
  lib/                  # APIクライアント、多言語、ポリシー、表示ユーティリティ

backend/
  app/api/routes/       # HTTPルートと権限境界
  app/services/         # 読み書き、生成、解答、統計のドメインサービス
  app/worker/           # 生成タスクワーカー
  tests/                # 非同期DBを使うバックエンド回帰テスト
```

## ローカル実行

### フロントエンド

```powershell
npm install
npm run dev
```

- 開発サーバー: `http://localhost:5173`
- 型検査・プロダクションビルド: `npm run build`
- フロントエンドテスト: `npm test`

`VITE_API_BASE_URL`を指定しない場合、開発用APIのURLは`http://localhost:8001/api/v1`です。Googleログインには`VITE_GOOGLE_CLIENT_ID`が必要です。

### バックエンド

リポジトリのルートで実行します。

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- APIドキュメント: `http://localhost:8001/docs`
- ヘルスチェック: `http://localhost:8001/api/v1/health`
- PostgreSQL: `localhost:5433`

デフォルトの`GENERATION_PROVIDER=stub`では、外部AIの費用を発生させずに生成フロー全体を検証できます。実際にClaudeを呼び出す場合は、サーバーの`.env`に`GENERATION_PROVIDER=anthropic`、モデルID、`ANTHROPIC_API_KEY`を設定してから有効化します。

バックエンド全体のテストは、Docker Desktopが起動した状態で次のコマンドを実行します。

```powershell
docker compose run --rm --no-deps api sh -c "pip install '.[dev]' && pytest -q"
```

## ドキュメント

- 初めて読む方のための技術・プロダクト概要: [プロジェクト概要と設計判断](./docs/00-project-overview.md)
- 画面動作と状態遷移: [UI・フロー仕様](./docs/01-ui-and-flow-spec.md)
- APIとデータモデル: [データ・API仕様](./docs/02-data-and-api-spec.md)
- AI生成の運用構造: [AI生成アーキテクチャ](./docs/03-ai-generation-architecture.md)
- 検証・デプロイ: [QAチェックリスト](./docs/04-acceptance-checklist.md)、[本番デプロイガイド](./docs/06-production-deployment.md)
