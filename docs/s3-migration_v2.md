# GCS → S3 メディア移行設計書（v2）

本ドキュメントは、Firebase Storage（GCS）から S3 へのメディアファイル移行と、
記事内 URL の書き換え方針を定義する。

---

## 1. 現状整理

### GCS バケット情報

| 項目 | 値 |
|------|-----|
| バケット名 | `studio-4200137858-cfe20.firebasestorage.app` |
| 公開 URL ベース | `https://storage.googleapis.com/studio-4200137858-cfe20.firebasestorage.app/` |
| ファイルパス形式 | `articles/{uid}/{timestamp}-{filename}` |
| 使用中の UID | `8L047bkoMROOvV9vrhTgTObqKdO2`, `6XPjXVBan4VrQEdkhJfUN2kYmW72` |

### ファイル数・参照数

| 項目 | 件数 |
|------|------|
| imageAssets に登録されたファイル | 131 |
| content（マークダウン）内の GCS URL | 147（一部クエリパラメータ `?v20250303` 付き） |
| ユニークファイルパス | 139 |
| 対象記事数 | 24 / 32 記事 |

### 旧 URL の例

```
https://storage.googleapis.com/studio-4200137858-cfe20.firebasestorage.app/articles/8L047bkoMROOvV9vrhTgTObqKdO2/1774353168022-hat_q.png
```

content 内には `?v20250303` 等のクエリパラメータ付きのものもある。

---

## 2. S3 設計

### S3 バケット

| 項目 | 値 |
|------|-----|
| バケット名 | `homepage-media-{account-id}`（CDK で作成） |
| リージョン | `ap-northeast-1` |
| アクセス | CloudFront OAI/OAC 経由のみ（パブリックアクセス無効） |

### S3 キー設計（パス維持方式）

GCS のパス構造をそのまま維持する。uid はそのまま残す。

```
GCS: articles/{uid}/{timestamp}-{filename}
S3:  articles/{uid}/{timestamp}-{filename}
```

**理由:**
- 移行がシンプル（ドメイン部分の書き換えだけで済む）
- 不可逆な変更を避けられる
- uid はアプリコードからは参照されない（ファイルパスの一部として残るだけ）

### CloudFront Behavior 設計

| パスパターン | オリジン | 用途 |
|-------------|---------|------|
| `/media/*` | S3 バケット | メディアファイル配信 |
| `/media/articles/*` に対して S3 キーは `articles/*` に変換 | — | Origin Path: なし、CloudFront Function で `/media/` プレフィックスを除去 |
| `/_next/static/*` | S3 バケット | Next.js 静的ファイル（将来） |
| `/*`（デフォルト） | Lambda Function URL | SSR / API |

### キャッシュ設定

| 対象 | Cache-Control |
|------|--------------|
| `/media/*` | `public, max-age=31536000, immutable` |

画像ファイルは timestamp 付きファイル名で一意なため、長期キャッシュが可能。

---

## 3. URL マッピングルール

### 新 URL 形式

```
旧: https://storage.googleapis.com/studio-4200137858-cfe20.firebasestorage.app/articles/{uid}/{file}
新: {BASE_URL}/media/articles/{uid}/{file}
```

`BASE_URL` は段階的に変化する:

| フェーズ | BASE_URL | タイミング |
|---------|----------|-----------|
| setup1b | `https://xxx.cloudfront.net` | 初回デプロイ時 |
| setup2b | `https://example.com`（独自ドメイン） | ドメイン設定後 |

### 書き換え対象

| 対象 | フィールド | 書き換え内容 |
|------|-----------|-------------|
| DynamoDB `homepage-articles` | `content`（マークダウン本文） | GCS URL → 新 URL |
| DynamoDB `homepage-articles` | `imageAssets[].url` | GCS URL → 新 URL |

### クエリパラメータの扱い

content 内の `?v20250303` 等のクエリパラメータは**除去**する。
- CloudFront キャッシュとの互換性のため
- ファイル名に timestamp が含まれており、バージョニングは不要

---

## 4. 移行スクリプト設計

2 つのスクリプトを作成する。

### 4.1. `cli/migration_gcs_to_s3.ts` — ファイルコピー

GCS バケットから全メディアファイルをダウンロードし、S3 にアップロードする。

```
処理フロー:
1. GCS バケットの articles/ 配下のファイル一覧を取得
2. 各ファイルをダウンロード
3. S3 に同じキーでアップロード（Content-Type 維持）
4. 件数・サイズのサマリを出力
```

**依存パッケージ:**
- `@google-cloud/storage`（GCS クライアント）
- `@aws-sdk/client-s3`（S3 クライアント）

**冪等性:** 同一キーへの再アップロードは上書きされるため、再実行可能。

### 4.2. `cli/migration_rewrite_media_urls.ts` — URL 書き換え

DynamoDB 内の記事データの GCS URL を新 URL に書き換える。

```
処理フロー:
1. homepage-articles テーブルの全件を取得
2. 各記事の content と imageAssets[].url を検索
3. GCS URL を BASE_URL + /media/ + path に置換
4. クエリパラメータを除去
5. DynamoDB に UpdateItem で書き戻し
6. 変更件数・URL数のサマリを出力
```

**引数:**
```bash
# setup1b 後（CloudFront ドメイン）
npx tsx cli/migration_rewrite_media_urls.ts https://xxx.cloudfront.net

# setup2b 後（独自ドメイン変更時）
npx tsx cli/migration_rewrite_media_urls.ts https://example.com --old-base https://xxx.cloudfront.net
```

- 第1引数: 新しい BASE_URL
- `--old-base`: 置換対象の旧 BASE_URL（省略時は GCS URL をターゲット）

**冪等性:** 旧 URL が存在しない場合はスキップするため、再実行可能。

### 実行順序

```
1. CDK で S3 バケット + CloudFront Behavior を作成
2. cli/migration_gcs_to_s3.ts を実行（ファイルコピー）
3. cli/migration_rewrite_media_urls.ts を実行（URL 書き換え）
4. ブラウザで記事の画像表示を確認
```

---

## 5. アプリケーション側の変更（v2 対応）

GCS → S3 移行に伴い、アプリケーションコードの修正が必要な箇所。

詳細は `docs/app-modifications_v2.md` の「S3 メディアアップロード」セクションを参照。

| 修正対象 | 内容 |
|---------|------|
| `src/app/admin/articles/new/article-generator-form.tsx` | GCS アップロード → S3 アップロードに変更 |
| `src/ai/flows/generate-article-draft.ts` | GCS URL 構築ロジックを `/media/` URL に変更 |
| `next.config.ts` `images.remotePatterns` | `storage.googleapis.com` → CloudFront ドメインに変更 |
| `next.config.ts` CSP `img-src` | `*.googleapis.com` → CloudFront ドメインに変更 |

---

## 6. CDK リソース（将来追加）

`cdk/lib/dynamodb-stack.ts` または別スタックに以下を追加する:

```
- S3 バケット（homepage-media-xxx）
  - パブリックアクセス: ブロック
  - バージョニング: 無効（ファイル名が一意）
  - ライフサイクル: なし
- CloudFront Behavior /media/* → S3 OAC
- CloudFront Function（/media/ プレフィックス除去）
```

これらは CDK の全体スタック構築フェーズで作成する。
メディア移行はスタック作成後に実行する。
