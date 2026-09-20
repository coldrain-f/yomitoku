# データ・API仕様

## 共通ルール

- APIのプレフィックスは`/api/v1`で、JSONのフィールド名はcamelCaseです。
- DBの時刻はUTCで保存し、APIはISO 8601形式で返します。
- IDにはUUIDを使用します。保護されたリクエストのユーザーIDとロールは、Bearerトークンからのみ取得します。
- 受講者向け詳細APIは、提出前に`isCorrect`、正答ID、解説、誤答解説を返しません。
- 全レスポンス形式と必須フィールドの最終的な基準は、FastAPIのOpenAPIドキュメント（`/docs`）です。

## 主なデータモデル

| モデル | 役割 |
| --- | --- |
| `users` | Google subject、メールアドレス、`learner`／`admin`ロール |
| `reading_items` | タイトル、本文、言語、レベル、種類、テーマ、目安時間、出典、公開状態 |
| `reading_questions`, `reading_choices` | 問題ごとの設問と選択肢。選択肢は正答・誤答解説・管理者向けの基準順を持つ |
| `attempts`, `attempt_answers` | 試行ごとの選択肢シャッフル順、設問ごとの解答、採点結果、時間、中断状態 |
| `item_bookmarks`, `passage_highlights` | ユーザー別ブックマークとUTF-16オフセットに基づくハイライト |
| `item_feedback`, `item_reports` | 品質・体感難易度の評価と問題報告 |
| `generation_jobs`, `generation_usage_events`, `item_validations` | AI生成リクエスト、モデル利用量、検証記録 |

問題の状態は`review`、`held`、`published`です。削除はソフトデリートではなく、関連データも外部キーのcascadeによって削除されます。

## 認証

| メソッド | パス | 説明 |
| --- | --- | --- |
| `POST` | `/auth/google` | Google IDトークン検証後、Yomitoku Bearerトークンを発行 |
| `GET` | `/me` | 現在ログインしているユーザーとロールを返却 |
| `POST` | `/auth/logout` | クライアントトークンを破棄するための204レスポンス |

管理者ロールは、サーバーの`ADMIN_GOOGLE_EMAILS` allowlistだけで判定します。開発専用の`X-Dev-Role`、`X-Dev-User-Id`ヘッダーは、development／test環境でのみ許可します。

## 学習API

| メソッド | パス | 権限 | 説明 |
| --- | --- | --- | --- |
| `GET` | `/reading-items` | 任意 | 検索・フィルター・並び替え・ページネーション一覧。ログイン時は個人状態・ブックマークを含む |
| `GET` | `/reading-items/{itemId}` | ログイン | 解答用の詳細。正答は非公開 |
| `PUT`/`DELETE` | `/reading-items/{itemId}/bookmark` | ログイン | ブックマークの設定・解除 |
| `POST` | `/reading-items/{itemId}/translation` | ログイン | 本文・設問・選択肢の翻訳 |
| `GET`/`POST` | `/reading-items/{itemId}/highlights` | ログイン | 問題のハイライト取得・作成 |
| `DELETE` | `/reading-items/{itemId}/highlights/{highlightId}` | ログイン | ハイライトの削除 |
| `GET` | `/reading-items/highlights` | ログイン | ハイライト一覧・検索・ページネーション |
| `POST` | `/reading-items/{itemId}/attempts` | ログイン | 新しい試行とシャッフル済みの選択肢順を作成 |
| `GET` | `/reading-items/attempts/{attemptId}` | ログイン | 進行中または提出済みの試行状態を復元。同一ユーザーの再読み込み復元に使用 |
| `POST` | `/reading-items/attempts/{attemptId}/submit` | ログイン | 設問ごとの解答提出とサーバー採点 |
| `POST` | `/reading-items/attempts/{attemptId}/abandon` | ログイン | 試行の中断 |
| `PUT` | `/reading-items/{itemId}/feedback` | ログイン | 品質・体感難易度評価のupsert |
| `POST` | `/reading-items/{itemId}/reports` | ログイン | 問題報告 |
| `GET` | `/me/statistics` | ログイン | 個人学習統計 |

一覧は`q`、`language`、`level`、`length`、`status`、`time`、`bookmarked`、`sort`、`page`、`pageSize`をサポートします。`bookmarked=true`はログインユーザーに対してのみ意味を持ちます。

フロントエンドは、検索・フィルター変更によって不要になった一覧リクエストへ`AbortSignal`を渡してキャンセルします。これはサーバーAPIの失敗ではないため、画面エラーとして表示しません。通常のAPIリクエストには15秒のクライアント側タイムアウトを適用します。

## 管理者API

すべての`/admin/*`パスは、管理者のBearerトークンを必要とします。

| メソッド | パス | 説明 |
| --- | --- | --- |
| `GET`/`POST` | `/admin/reading-items` | 管理者一覧と手動問題登録 |
| `GET`/`PATCH`/`DELETE` | `/admin/reading-items/{itemId}` | 詳細取得・編集・完全削除 |
| `POST` | `/admin/reading-items/{itemId}/publish` | 公開 |
| `POST` | `/admin/reading-items/{itemId}/hold` | 保留 |
| `POST` | `/admin/reading-items/{itemId}/unhold` | 保留解除後にレビュー状態へ戻す |
| `POST` | `/admin/reading-items/title-suggestion` | AIによるタイトル提案 |
| `POST` | `/admin/reading-items/topic-suggestion` | AIによるテーマ提案 |
| `POST` | `/admin/reading-items/explanation-suggestion` | AIによる解説提案 |
| `GET` | `/admin/generation-model-options` | 生成画面のモデル選択肢 |
| `POST` | `/admin/generation-jobs` | 生成タスクを作成。新規は202、進行中／同一リクエストの再利用は200 |
| `GET` | `/admin/generation-jobs`, `/admin/generation-jobs/active`, `/admin/generation-jobs/{jobId}` | 履歴・実行中タスク・個別状態を取得 |

## スコア・集計ルール

- 試行結果はサーバー時刻で計算し、中断した試行は統計に含めません。
- 一覧の永続スコアは、初回提出が正答かつ目安時間以内なら100、初回提出が正答だが時間超過なら90、不正解後の再挑戦で正答なら80です。
- 問題の正答率には、ユーザーごとの最新提出1件を使用します。結果画面の挑戦者数は、提出したユニークユーザー数です。
- 体感難易度には、ユーザーごとの最新評価を使用し、最小有効投票数を満たす場合のみ通常の一覧に公開します。
