# 読み解く：開発・運用ドキュメント

このディレクトリでは、現在の実装と運用基準を説明します。過去の静的モックアップ移行計画ではなく、ログイン後の学習フロー、管理者運用、デプロイ、QAを基準に維持します。

| ドキュメント | 用途 |
| --- | --- |
| [00-project-overview.md](./00-project-overview.md) | プロダクト課題、設計判断、AIとの協働方法、検証根拠、制約を説明するプロジェクト概要 |
| [01-ui-and-flow-spec.md](./01-ui-and-flow-spec.md) | 受講者・管理者画面、多言語、モバイルUX、状態遷移 |
| [02-data-and-api-spec.md](./02-data-and-api-spec.md) | 現在のデータモデル、認証、主要API契約、集計ルール |
| [03-ai-generation-architecture.md](./03-ai-generation-architecture.md) | AI生成アーキテクチャ、ワーカー、検証、コスト記録、フロントエンド構成 |
| [04-acceptance-checklist.md](./04-acceptance-checklist.md) | 実機向けQAチェックリストと自動検証コマンド |
| [05-delivery-roadmap.md](./05-delivery-roadmap.md) | 現在の運用段階と今後の改善方針 |
| [06-production-deployment.md](./06-production-deployment.md) | Linux、Docker Compose、Caddyによる本番デプロイ・更新・復旧手順 |
| [07-troubleshooting.md](./07-troubleshooting.md) | Compose、ポート、health check、Caddy、GitHub Pagesの障害確認 |

## 維持方針

- APIまたはDB構造を変更した場合は、[02](./02-data-and-api-spec.md)と[04](./04-acceptance-checklist.md)をあわせて確認します。
- 画面動作、文言、アクセシビリティ、レスポンシブレイアウトを変更した場合は、[01](./01-ui-and-flow-spec.md)とQA項目をあわせて更新します。
- 一覧リクエストのポリシー、再読み込み復元、初期バンドル分割のような体感性能を変更した場合は、[01](./01-ui-and-flow-spec.md)と[04](./04-acceptance-checklist.md)をあわせて更新します。
- AIモデル、プロンプト、再試行ポリシーを変更した場合は、[03](./03-ai-generation-architecture.md)と運用環境変数の説明をあわせて更新します。
- 運用コマンドは実際の`deploy/` Composeファイルと`.env.production`に基づいて記述します。サーバー固有のポートやシークレットを文書に固定しません。
