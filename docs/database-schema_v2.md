# DynamoDB データベース設計書（v2）

本ドキュメントは、v1（Firestore）から v2（DynamoDB）への移行に伴うデータベース設計を定義する。
v1 の設計書は `docs/database-schema.md` を参照。

---

## テーブル一覧

| テーブル名 | 説明 | v1対応 |
|-----------|------|--------|
| `settings` | サイト全体のグローバル設定 | settings コレクション |
| `articles` | 記事データ | articles コレクション |
| `article_tags` | タグ→記事のマッピング（タグ検索用） | 新規（v1は Firestore の ARRAY_CONTAINS で代替） |
| `users` | ユーザー情報 | users コレクション |
| `comments` | コメントデータ | comments コレクション |
| `payments` | 決済履歴 | payments コレクション |
| `jobs` | 非同期ジョブ状態（AI 記事生成/修正） | 新規（v2 で追加） |

**Stripe 連携パラメータ**: AWS Secrets Manager に格納（`docs/secrets-and-env_v2.md` 参照）

---

## リージョン

**ap-northeast-1（東京）**

---

## 1. settings テーブル

サイト全体の設定を管理する。v1 と同様、`site_config` という単一レコードのみ存在する。

- **テーブル名**: `homepage-settings`
- **キー設計**: Single Item

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `config_id` | `S` | `"site_config"` （固定値） |

### 属性

| 属性名 | 型 | 説明 | v1対応 |
|--------|-----|------|--------|
| `config_id` | `S` | PK（固定値 `site_config`） | ドキュメントID |
| `siteName` | `S` | サイト名 | 同一 |
| `paymentAmount` | `N` | 決済金額（円） | 同一 |
| `accessDurationDays` | `N` | 課金後のアクセス有効日数 | 同一 |
| `metaTitle` | `S` | トップページの `<title>` | 同一 |
| `metaDescription` | `S` | トップページの `<meta description>` | 同一 |
| `legalCommerceContent` | `S` | 特定商取引法に基づく表記（Markdown） | 同一 |
| `privacyPolicyContent` | `S` | プライバシーポリシー（Markdown） | 同一 |
| `termsOfServiceContent` | `S` | 利用規約（Markdown） | 同一 |
| `copyright` | `S` | フッターのコピーライト表記 | 同一 |
| `gtmId` | `S` | Google Tag Manager ID | 同一 |
| `updatedAt` | `S` | 最終更新日時（ISO 8601） | timestamp → ISO 8601 |

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 |
|---|------|-------------|------|
| 1 | GetItem | PK=`site_config` | サイト設定の読み取り |
| 2 | PutItem | PK=`site_config` | 管理画面からの設定更新 |

---

## 2. articles テーブル

全ての記事データを格納する。

- **テーブル名**: `homepage-articles`
- **キー設計**: PK のみ（Single Table Key）

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `id` | `S` | 記事ID（Firestore のドキュメントIDをそのまま移行） |

### 属性

| 属性名 | 型 | 説明 | v1対応 |
|--------|-----|------|--------|
| `id` | `S` | PK。記事ID | ドキュメントID |
| `slug` | `S` | URLに使用する識別子 | 同一 |
| `title` | `S` | 記事タイトル | 同一 |
| `content` | `S` | 記事本文（Markdown） | 同一 |
| `excerpt` | `S` | 記事の要約（一覧表示用 + 有料記事導入文を兼ねる） | excerpt + teaserContent を統合 |
| `tags` | `L` | タグの配列（`["AWS", "Next.js"]`） | 同一 |
| `imageAssets` | `L` | 画像アセット配列 | 同一 |
| `access` | `S` | アクセスレベル（`free` \| `paid`） | 同一 |
| `status` | `S` | 公開状態（`published` \| `draft`） | 同一 |
| `authorId` | `S` | 記事作成者のID | 同一 |
| `createdAt` | `S` | 作成日時（ISO 8601） | timestamp → ISO 8601 |
| `updatedAt` | `S` | 最終更新日時（ISO 8601） | timestamp → ISO 8601 |

### v1 から削除した属性

| 属性名 | 削除理由 |
|--------|---------|
| `generationPrompt` | 未使用 |
| `generationPrompt.goal` | 未使用 |
| `generationPrompt.context` | 未使用 |
| `teaserContent` | `excerpt` に統合 |

### GSI（グローバルセカンダリインデックス）

#### GSI1: `articles-by-status-createdAt`

公開済み記事を作成日順に取得する（トップページ、記事一覧）。

| キー | 属性名 | 型 | 説明 |
|------|--------|-----|------|
| GSI1-PK | `status` | `S` | `published` \| `draft` |
| GSI1-SK | `createdAt` | `S` | ISO 8601（ソートキー） |

**v1 からの変更点**: ソート順を `updatedAt desc` → `createdAt desc` に変更。記事の修正で時系列が変わらないようにする。

#### GSI2: `articles-by-slug`

スラッグで記事を一意に取得する（記事詳細ページ）。

| キー | 属性名 | 型 | 説明 |
|------|--------|-----|------|
| GSI2-PK | `slug` | `S` | URLスラッグ |

**投影**: ALL（全属性を射影）

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 | v1対応クエリ |
|---|------|-------------|------|-------------|
| 1 | Query (GSI1) | PK=`published`, SK desc, Limit+ExclusiveStartKey | 公開記事一覧（作成日降順） | `status=='published' orderBy updatedAt desc` |
| 2 | Query (GSI2) | PK=`{slug}` | スラッグで記事取得 | `slug=={slug} AND status=='published'` |
| 3 | GetItem | PK=`{id}` | 記事IDで取得（管理画面、AI修正） | `.doc(articleId).get()` |
| 4 | Query (GSI1) | PK=`published` OR `draft`, SK desc | 管理者用記事一覧（全ステータス） | `orderBy updatedAt desc` |
| 5 | PutItem | PK=`{id}` | 記事作成・更新 | `.add()` / `.update()` |
| 6 | DeleteItem | PK=`{id}` | 記事削除 | `.doc(articleId).delete()` |
| 7 | BatchGetItem | PK=`{id}` × N | 複数記事の一括取得 | `__name__ in [ids]` |
| 8 | Scan (フィルタ: status=published) | select `tags` のみ | タグ集計（全公開記事のタグを取得） | `status=='published' select('tags')` |

**ページネーション方式の変更**:
- v1（公開側）: offset-based → v2: cursor-based（`ExclusiveStartKey`）に統一
- v1（管理側）: cursor-based → v2: cursor-based（変更なし）

---

## 3. article_tags テーブル（新規）

タグから記事を高速に検索するためのマッピングテーブル。
記事の作成・更新・削除時にアプリケーション側で同期する。

- **テーブル名**: `homepage-article-tags`
- **キー設計**: 複合キー

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `tag` | `S` | タグ名（例: `"AWS"`） |
| SK | `createdAt#articleId` | `S` | `{createdAt}#{articleId}`（例: `"2026-01-15T10:30:00Z#abc123"`） |

SK に `createdAt` を含めることで、タグ検索結果を作成日順でソートできる。`articleId` を末尾に付けることで一意性を保証する。

### 属性

| 属性名 | 型 | 説明 |
|--------|-----|------|
| `tag` | `S` | PK。タグ名 |
| `createdAt#articleId` | `S` | SK。作成日時#記事ID |
| `articleId` | `S` | 記事ID（articles テーブルとの結合用） |
| `status` | `S` | 記事の公開状態（`published` \| `draft`） |

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 |
|---|------|-------------|------|
| 1 | Query | PK=`{tag}`, Filter: `status='published'`, SK desc | タグ別記事一覧（作成日降順） |
| 2 | Query | PK=`{tag}` | タグに紐づく全記事ID取得 |
| 3 | PutItem | PK=`{tag}`, SK=`{createdAt}#{articleId}` | 記事作成・タグ追加時 |
| 4 | DeleteItem | PK=`{tag}`, SK=`{createdAt}#{articleId}` | 記事削除・タグ削除時 |

### 全タグ一覧の取得

全タグとその記事数を取得するには、`article_tags` テーブルを Scan し、`tag` ごとに `status='published'` のアイテム数を集計する。
記事数が増えた場合はキャッシュ（アプリ内メモリまたは settings テーブルにキャッシュ値を保存）で対応する。

### 記事更新時の同期ロジック

記事のタグが変更された場合：
1. 旧タグのエントリを DeleteItem
2. 新タグのエントリを PutItem
3. トランザクション（`TransactWriteItems`）で articles テーブルの更新と合わせて実行

---

## 4. users テーブル

Google OAuth でログインしたユーザーの情報を格納する。

- **テーブル名**: `homepage-users`
- **キー設計**: PK のみ

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `google_uid` | `S` | Google OAuth の `sub`（Google固有ユーザーID） |

### 属性

| 属性名 | 型 | 説明 | v1対応 |
|--------|-----|------|--------|
| `google_uid` | `S` | PK。Google OAuth の `sub` | `google_uid`（v1ではドキュメントIDは Firebase Auth `uid`） |
| `email` | `S` | メールアドレス | 同一 |
| `displayName` | `S` | 表示名 | 同一 |
| `photoURL` | `S` | プロフィール画像URL | 同一 |
| `access_expiry` | `S` | 有料記事アクセス有効期限（ISO 8601） | timestamp → ISO 8601 |
| `created_at` | `S` | アカウント作成日時（ISO 8601） | timestamp → ISO 8601 |
| `updated_at` | `S` | 最終更新日時（ISO 8601） | timestamp → ISO 8601 |

### v1 から削除した属性

| 属性名 | 削除理由 |
|--------|---------|
| `uid` | Firebase Auth の uid。v2 では `google_uid` を PK として使用するため不要 |

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 |
|---|------|-------------|------|
| 1 | GetItem | PK=`{google_uid}` | ユーザー情報取得（ログイン時、アクセス権確認） |
| 2 | PutItem | PK=`{google_uid}` | ユーザー作成・更新 |
| 3 | DeleteItem | PK=`{google_uid}` | ユーザー退会 |

---

## 5. comments テーブル

記事に投稿されたコメントを格納する。

- **テーブル名**: `homepage-comments`
- **キー設計**: 複合キー

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `articleId` | `S` | 紐づく記事のID |
| SK | `commentId` | `S` | コメントID（Firestore のドキュメントIDをそのまま移行） |

### 属性

| 属性名 | 型 | 説明 | v1対応 |
|--------|-----|------|--------|
| `articleId` | `S` | PK。記事ID | 同一 |
| `commentId` | `S` | SK。コメントID | ドキュメントID |
| `content` | `S` | コメント本文 | 同一 |
| `userId` | `S` | 投稿者の `google_uid`（退会済みは `null`） | v1: Firebase Auth uid → v2: google_uid |
| `countryCode` | `S` | 国コード（例: `JP`） | 同一 |
| `region` | `S` | 地域名（例: `Tokyo`） | 同一 |
| `dailyHashId` | `S` | 日替わりハッシュID | 同一 |
| `ipAddress` | `S` | 投稿者のIPアドレス（ログ用） | 同一 |
| `userAgent` | `S` | 投稿者のUserAgent（ログ用） | 同一 |
| `createdAt` | `S` | 投稿日時（ISO 8601） | timestamp → ISO 8601 |

### GSI（グローバルセカンダリインデックス）

#### GSI1: `comments-by-createdAt`

全コメントを投稿日順に取得する（管理画面用）。

| キー | 属性名 | 型 | 説明 |
|------|--------|-----|------|
| GSI1-PK | `gsi1pk` | `S` | 固定値 `"ALL"`（全コメント横断用） |
| GSI1-SK | `createdAt` | `S` | ISO 8601（ソートキー） |

#### GSI2: `comments-by-userId`

ユーザーIDでコメントを検索する（退会時の一括更新用）。

| キー | 属性名 | 型 | 説明 |
|------|--------|-----|------|
| GSI2-PK | `userId` | `S` | 投稿者の `google_uid` |

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 |
|---|------|-------------|------|
| 1 | Query | PK=`{articleId}`, SK desc | 記事のコメント一覧（新しい順に取得→反転して表示） |
| 2 | Query (GSI1) | PK=`ALL`, SK desc | 管理画面のコメント一覧（全コメント） |
| 3 | Query (GSI2) | PK=`{userId}` | ユーザー退会時の一括 userId null 化 |
| 4 | PutItem | PK=`{articleId}`, SK=`{commentId}` | コメント投稿 |
| 5 | DeleteItem | PK=`{articleId}`, SK=`{commentId}` | コメント削除（管理画面） |
| 6 | UpdateItem | PK=`{articleId}`, SK=`{commentId}` | userId の null 化（退会処理） |

---

## 6. payments テーブル

Stripe による決済履歴を格納する。

- **テーブル名**: `homepage-payments`
- **キー設計**: 複合キー

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `user_id` | `S` | 購入者の `google_uid` |
| SK | `created_at` | `S` | 決済日時（ISO 8601） |

### 属性

| 属性名 | 型 | 説明 | v1対応 |
|--------|-----|------|--------|
| `user_id` | `S` | PK。購入者の `google_uid` | v1: Firebase Auth uid → v2: google_uid |
| `created_at` | `S` | SK。決済日時（ISO 8601） | timestamp → ISO 8601 |
| `payment_id` | `S` | 決済ID（Firestore のドキュメントIDをそのまま移行） | ドキュメントID |
| `stripe_session_id` | `S` | Stripe Checkout セッションID | 同一 |
| `stripe_payment_intent_id` | `S` | Stripe PaymentIntent ID | 同一 |
| `amount` | `N` | 金額 | 同一 |
| `currency` | `S` | 通貨（例: `jpy`） | 同一 |
| `status` | `S` | 決済ステータス（例: `succeeded`） | 同一 |
| `ip_address` | `S` | 決済時のIPアドレス | 同一 |

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 |
|---|------|-------------|------|
| 1 | PutItem | PK=`{user_id}`, SK=`{created_at}` | 決済記録の書き込み |
| 2 | Query | PK=`{user_id}`, SK desc | ユーザーの決済履歴（将来の管理画面用） |

**備考**: v1 と同様、アプリからの読み取りは行わない（write-only）。退会時も `user_id` は保持する（経理・税務目的）。

---

## 7. jobs テーブル（新規）

AI 記事生成・修正の非同期ジョブ状態を管理する。
CloudFront の Origin Response Timeout（60 秒）を超える AI 処理をジョブ化し、クライアントからポーリングで完了確認する。

- **テーブル名**: `homepage-jobs`
- **キー設計**: PK のみ

| キー | 属性名 | 型 | 値 |
|------|--------|-----|-----|
| PK | `jobId` | `S` | ジョブID（UUID） |

### 属性

| 属性名 | 型 | 説明 |
|--------|-----|------|
| `jobId` | `S` | PK。UUID |
| `type` | `S` | ジョブ種別（`generate` \| `revise`） |
| `status` | `S` | 状態（`processing` \| `completed` \| `failed`） |
| `result` | `M` | 処理結果（完了時）。例: `{ "articleId": "abc123" }` |
| `error` | `S` | エラーメッセージ（失敗時） |
| `createdAt` | `S` | ジョブ作成日時（ISO 8601） |
| `updatedAt` | `S` | 最終更新日時（ISO 8601） |
| `ttl` | `N` | TTL（エポック秒）。完了/失敗後 24 時間で自動削除 |

### アクセスパターン

| # | 操作 | アクセス方法 | 用途 |
|---|------|-------------|------|
| 1 | PutItem | PK=`{jobId}` | ジョブ作成（status=processing） |
| 2 | GetItem | PK=`{jobId}` | ジョブ状態確認（ポーリング） |
| 3 | UpdateItem | PK=`{jobId}` | ジョブ完了/失敗時に status・result・error を更新 |

### TTL による自動削除

DynamoDB の TTL 機能を使い、完了・失敗したジョブを 24 時間後に自動削除する。
`ttl` 属性にエポック秒（`createdAt` + 86400）を設定する。

### 関連 API

| API | メソッド | 用途 |
|-----|---------|------|
| `/api/admin/articles/generate` | POST | ジョブ作成 → ジョブ ID を即座に返す |
| `/api/admin/articles/[id]/revise` | POST | ジョブ作成 → ジョブ ID を即座に返す |
| `/api/admin/jobs/[jobId]` | GET | ジョブ状態を返す（ポーリング用） |

---

## 8. Stripe 連携パラメータ

→ `docs/secrets-and-env_v2.md` を参照。

---

## テーブル容量モード

全テーブル **オンデマンドモード**（PAY_PER_REQUEST）を使用する。

理由：
- 個人メディア規模ではリクエスト数が少なく予測しづらい
- プロビジョニングモードのキャパシティ管理が不要
- コストは使った分だけ（アクセスがなければ 0 円）

---

## データ型の変換ルール（Firestore → DynamoDB）

| Firestore 型 | DynamoDB 型 | 変換ルール |
|--------------|-------------|-----------|
| `string` | `S` | そのまま |
| `number` | `N` | そのまま |
| `boolean` | `BOOL` | そのまま |
| `timestamp` | `S` | ISO 8601 文字列に変換（例: `2026-01-15T10:30:00.000Z`） |
| `array` | `L` | そのまま（DynamoDB の List 型） |
| `map` | `M` | そのまま（DynamoDB の Map 型） |
| `null` | `NULL` | DynamoDB の NULL 型 |

---

## DynamoDB テーブルのプレフィックス

全テーブル名に `homepage-` プレフィックスを付与する。
CDK で環境変数 `TABLE_PREFIX` を設定し、アプリケーション側でテーブル名を動的に構築する。

---

## CDK 定義時の注意事項

- 全テーブルに `removalPolicy: RETAIN` を設定（誤削除防止）
- ポイントインタイムリカバリ（PITR）を有効化
- テーブル名は CDK の Stack 出力（CfnOutput）でエクスポートし、Lambda の環境変数に渡す
- GSI の射影は原則 `ALL`（テーブルサイズが小さいため）
