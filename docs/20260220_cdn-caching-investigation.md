# CDN対応調査レポート

**日付**: 2026年2月20日  
**結論**: 現時点ではCDN対応を見送り、従来のサーバーサイドレンダリング方式を維持

---

## 背景

Firebase App Hosting（Cloud CDN統合）を活用して、無料記事ページのCDNキャッシュを有効にしたかった。有料記事の本文がキャッシュされる事故は絶対に防ぎたい。

## 試行した方式：ハイブリッド方式

### 概要

- **無料記事**: サーバーサイドでレンダリング → CDNキャッシュ可能 & SEO良好
- **有料記事**: 本文はクライアントからAPIでfetch → キャッシュ事故防止

### 実装内容

1. `/api/articles/[articleId]/content` - 有料記事本文取得API（アクセス権チェック付き）
2. `PaidArticleClient` コンポーネント - クライアントで本文をfetch
3. 記事ページの条件分岐（free/paid）
4. ミドルウェアでCache-Controlヘッダー設定

## 発見した問題

### 1. Firebase App Hostingの仕様

> **"Routes affected by Next.js middleware are not cached."**
> 
> — [Firebase App Hosting公式ドキュメント](https://firebase.google.com/docs/app-hosting/optimize-cache)

ミドルウェアを通るルートはCloud CDNでキャッシュされない。
IP制限などでミドルウェアを使用している限り、CDNキャッシュの恩恵を受けられない。

### 2. Next.js App Routerの動的レンダリング判定

以下を使用すると、Next.jsは自動的にページを「動的」と判定し、`Cache-Control: no-store`を設定する：

- `cookies()` 関数
- `searchParams`（ページネーション等）
- Firestore直接アクセス（外部データソース依存）

これを回避するには：

- `generateStaticParams` で全記事slugを事前取得
- `revalidate` 設定でISR（Incremental Static Regeneration）

### 3. ISR実装の現実的な障壁

| 要件 | 難易度 | 理由 |
|------|--------|------|
| `generateStaticParams`実装 | 高 | 全記事slugをビルド時に取得する処理が必要 |
| On-demand revalidation | 高 | 記事追加/編集時に再検証APIを呼ぶ仕組みが必要 |
| 記事数増加対応 | 中 | ビルド時間の増加、Firestore読み取り数の増加 |

**これらは現時点では過剰な実装コストがかかる。**

## 修正前 vs 修正後の比較

| 項目 | 修正前（従来方式） | 修正後（ハイブリッド） |
|------|-------------------|----------------------|
| リクエスト数 | 1回 | 2〜4回（ページ + /me + content + comments） |
| 有料記事保護 | ✅ サーバーで判定 | ✅ APIで判定 |
| CDNキャッシュ | ❌ 不可 | ❌ 不可（ミドルウェア経由で無効化） |
| 実装複雑度 | シンプル | 複雑化 |
| SEO | ✅ 全ページ良好 | ⚠️ 有料記事は本文なし |

**CDNキャッシュが効かないなら、リクエスト増加は純粋なデメリット。**

## CDNでキャッシュできない箇所

ページをCDNキャッシュするには、ユーザー固有の情報をサーバーサイドでレンダリングしないことが必要。現在のサイトでキャッシュできない箇所は以下の3つ：

| # | 箇所 | 理由 |
|---|------|------|
| ① | ヘッダー（中央・右部分・メニュー） | ログイン状態で表示が変わる |
| ② | コメントエリア | ログイン状態でフォーム表示が変わる |
| ③ | 有料記事・課金関連画面 | アクセス権で表示内容が変わる |

### 対策案（将来CDN対応する場合）

**前提条件：**
- フッターの退会リンク（ログイン時のみ表示）を、ヘッダー右上のプロフィールアイコンのドロップダウンメニューに移動する必要がある
- これにより、フッターからログイン状態依存の要素がなくなり、フッターを静的にできる

**①②については：**
- サーバーでレンダリングせず、表示に必要なデータをブラウザからfetchで取得
- fetch完了までは該当エリアを非表示（またはスケルトン表示）
- 例：`/api/auth/me` でユーザー情報取得、`/api/articles/[id]/comments` でコメント取得

**③については：**
- 有料記事本文をHTMLに含めず、クライアントからAPIでfetch
- 記事メタ情報のみサーバーレンダリング（SEO対策）

**ただし、これらを実装してもミドルウェア経由のルートはCloud CDNでキャッシュされないため、現時点では効果がない。**

## 結論

1. **現時点ではCDN対応を見送る**
2. **従来のサーバーサイドレンダリング方式を維持**
3. **将来、App Hostingの成熟やNext.jsの改善があれば再検討**

## 今後の可能性

- Firebase App Hostingのミドルウェア対応改善
- Next.js の `use cache` ディレクティブの安定化
- 記事数が大幅に増えた場合のパフォーマンス最適化が必要になったタイミング

---

## 参考リンク

- [Firebase App Hosting - Cache app content](https://firebase.google.com/docs/app-hosting/optimize-cache)
- [Firebase App Hosting - About App Hosting](https://firebase.google.com/docs/app-hosting/about-app-hosting)
- [Next.js - Incremental Static Regeneration](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
