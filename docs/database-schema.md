# データベース設計書

このドキュメントは、`homepage` プロジェクトの Firestore データベース設計を定義します。

---

## コレクション一覧

- **settings**: サイト全体のグローバル設定
- **articles**: 記事データ
- **users**: ユーザー情報
- **comments**: コメントデータ
- **payments**: 決済履歴

---

## 1. settings コレクション

サイト全体の設定を管理します。このコレクションには `site_config` という単一のドキュメントのみが存在します。

- **コレクションパス**: `/settings`
- **ドキュメントID**: `site_config`

### フィールド

| フィールド名              | データ型 | 説明                                                  |
| ------------------------- | -------- | ----------------------------------------------------- |
| `siteName`                | `string` | サイト名                                              |
| `paymentAmount`           | `number` | 決済金額（円）                                        |
| `accessDurationDays`      | `number` | 課金後のアクセス有効日数                              |
| `metaTitle`               | `string` | トップページの `<title>` タグ                         |
| `metaDescription`         | `string` | トップページの `<meta name="description">`        |
| `legalCommerceContent`    | `string` | 特定商取引法に基づく表記ページのコンテンツ (Markdown) |
| `privacyPolicyContent`    | `string` | プライバシーポリシーページのコンテンツ (Markdown)     |
| `termsOfServiceContent`   | `string` | 利用規約ページのコンテンツ (Markdown)                 |
| `copyright`               | `string` | フッターに表示するコピーライト表記                  |
| `updatedAt`               | `timestamp`| 最終更新日時                                          |

---

## 2. articles コレクション

全ての記事データを格納します。各ドキュメントが1つの記事に対応します。

- **コレクションパス**: `/articles`
- **ドキュメントID**: 自動生成ID

### フィールド

| フィールド名              | データ型         | 説明                                                           |
| ------------------------- | ---------------- | -------------------------------------------------------------- |
| `generationPrompt`        | `map`            | AIへの記事生成指示                                             |
| `generationPrompt.goal`   | `string`         | コンテンツの目標                                               |
| `generationPrompt.context`| `string`         | 記事の背景情報や追加指示                                       |
| `imageAssets`             | `array` of `map` | 記事に使用する画像アセットのリスト                             |
| `imageAssets[n].url`      | `string`         | 画像の公開URL                                                  |
| `imageAssets[n].fileName` | `string`         | 元のファイル名                                                 |
| `imageAssets[n].uploadedAt`| `timestamp`      | 画像のアップロード日時                                         |
| `title`                   | `string`         | 記事タイトル                                                   |
| `content`                 | `string`         | 記事本文 (Markdown)                                            |
| `excerpt`                 | `string`         | 記事一覧で表示する短い要約                                     |
| `teaserContent`           | `string`         | 有料記事の未購入者向け導入文                                   |
| `tags`                    | `array` of `string` | 記事に関連するタグの配列                                     |
| `slug`                    | `string`         | URLに使用する識別子                                            |
| `status`                  | `string`         | 公開状態 (`published` or `draft`)                              |
| `access`                  | `string`         | アクセスレベル (`free` or `paid`)                              |
| `authorId`                | `string`         | 記事を作成した管理者のUID                                      |
| `createdAt`               | `timestamp`      | 初回作成日時                                                   |
| `updatedAt`               | `timestamp`      | 最終更新日時                                                   |

---

## 3. users コレクション

Googleログインしたユーザーの情報を格納します。

- **コレクションパス**: `/users`
- **ドキュメントID**: Firebase Auth の `uid`

### フィールド

| フィールド名        | データ型    | 説明                                      |
| ------------------- | ----------- | ----------------------------------------- |
| `uid`               | `string`    | Firebase Auth の `uid`                    |
| `email`             | `string`    | メールアドレス                              |
| `displayName`       | `string`    | 表示名                                    |
| `photoURL`          | `string`    | プロフィール画像のURL                     |
| `access_expiry`     | `timestamp` | 有料記事へのアクセス有効期限              |
| `created_at`        | `timestamp` | アカウント作成日時                        |
| `updated_at`        | `timestamp` | 最終更新日時                              |

---

## 4. comments コレクション

記事に投稿されたコメントを格納します。

- **コレクションパス**: `/comments`
- **ドキュメントID**: 自動生成ID

### フィールド

| フィールド名          | データ型    | 説明                               |
| --------------------- | ----------- | ---------------------------------- |
| `articleId`           | `string`    | 紐づく記事のドキュメントID         |
| `content`             | `string`    | コメント本文                       |
| `userId`              | `string`    | 投稿者のUID                        |
| `userDisplayName`     | `string`    | 投稿者の表示名                     |
| `countryCode`         | `string`    | 国コード (例: `JP`)                |
| `region`              | `string`    | 地域名 (例: `Tokyo`)               |
| `dailyHashId`         | `string`    | 日替わりのハッシュID               |
| `ipAddress`           | `string`    | 投稿者のIPアドレス（ログ用）       |
| `userAgent`           | `string`    | 投稿者のUserAgent（ログ用）        |
| `createdAt`           | `timestamp` | 投稿日時                           |

---

## 5. payments コレクション

Stripeによる決済履歴を格納します。

- **コレクションパス**: `/payments`
- **ドキュメントID**: 自動生成ID

### フィールド

| フィールド名                   | データ型    | 説明                               |
| ------------------------------ | ----------- | ---------------------------------- |
| `user_id`                      | `string`    | 購入者のUID                        |
| `stripe_session_id`            | `string`    | Stripe Checkout セッションID       |
| `stripe_payment_intent_id` | `string`    | Stripe PaymentIntent ID            |
| `amount`                       | `number`    | 金額                               |
| `currency`                     | `string`    | 通貨 (例: `jpy`)                   |
| `status`                       | `string`    | 決済ステータス (例: `succeeded`)   |
| `ip_address`                   | `string`    | 決済時のIPアドレス                 |
| `created_at`                   | `timestamp` | 決済日時                           |

---

## Firestoreインデックスの作成

本プロジェクトでは、特定のクエリを高速化するために複合インデックスが必要です。

### インデックス定義ファイル

プロジェクトのルートに `firestore.indexes.json` を配置しています。このファイルにインデックス定義が記述されています。

現在定義されているインデックス:

1.  **記事一覧（トップページ）用**
    - `articles` コレクション
    - `status` (昇順) と `updatedAt` (降順)

2.  **記事一覧（タグ別）用**
    - `articles` コレクション
    - `status` (昇順)、`tags` (ARRAY_CONTAINS)、`updatedAt` (降順)

3.  **コメント一覧（記事詳細ページ）用**
    - `comments` コレクション
    - `articleId` (昇順) と `createdAt` (降順)

### 手動での作成手順

エラーメッセージに表示されるURLをクリックするのが最も簡単です。

1.  アプリケーションを操作し、インデックス不足のエラーを発生させます。
2.  開発者コンソールのエラーメッセージに表示される `https://console.firebase.google.com/....` から始まるURLをコピーしてブラウザで開きます。
3.  Firestoreのインデックス作成画面が開かれ、必要な設定がすでに入力された状態になっています。
4.  内容を確認し、「作成」ボタンをクリックします。
5.  インデックスの作成には数分かかります。

### コマンドによるデプロイ手順

ローカル環境に **Firebase CLI** がセットアップされている場合、以下のコマンドで `firestore.indexes.json` の内容をデプロイできます。

```bash
# Firebaseプロジェクトにログイン（初回のみ）
firebase login

# 使用するFirebaseプロジェクトを選択
firebase use <YOUR_FIREBASE_PROJECT_ID>

# インデックス定義をデプロイ
firebase deploy --only firestore:indexes
```
