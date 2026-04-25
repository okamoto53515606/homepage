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
| アクセス | CloudFront OAC 経由のみ（パブリックアクセス無効） |

### S3 キー設計（media/ プレフィックス方式）

GCS のパスに `media/` プレフィックスを付与して S3 に格納する。
URL パスと S3 キーが 1:1 で対応するため、CloudFront Function 不要。

```
GCS: articles/{uid}/{timestamp}-{filename}
S3:  media/articles/{uid}/{timestamp}-{filename}
URL: {BASE_URL}/media/articles/{uid}/{timestamp}-{filename}
```

**理由:**
- URL パスと S3 キーが一致し、CloudFront Function が不要（シンプル＆低レイテンシ）
- uid はアプリコードからは参照されない（ファイルパスの一部として残るだけ）
- 不可逆な変更を避けられる

### CloudFront Behavior 設計

| パスパターン | オリジン | 用途 |
|-------------|---------|------|
| `/media/*` | S3 バケット | メディアファイル配信（S3 キーが URL パスと一致） |

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


