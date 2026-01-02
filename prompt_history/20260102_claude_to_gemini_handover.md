# Claude から Gemini への引継ぎ資料

## 概要

本日（2026年1月2日）のセッションで実施した作業内容と、プロジェクトの現状を引き継ぎます。

---

## 本日実施した作業

### 1. Stripe Checkout に利用規約同意機能を追加

**ファイル**: `/src/app/api/stripe/checkout/route.ts`

- `consent_collection.terms_of_service: 'required'` を追加
- ただし、環境変数 `STRIPE_TERMS_OF_SERVICE_ENABLED=1` が設定されている場合のみ有効
- 理由: Stripeダッシュボードで利用規約URLを設定するまでは無効にしておく必要があるため

```typescript
// 環境変数で切り替え可能
...(process.env.STRIPE_TERMS_OF_SERVICE_ENABLED === '1' && {
  consent_collection: {
    terms_of_service: 'required' as const,
  },
}),
```

### 2. 購入ボタン付近に特商法リンクを追加

**ファイル**: `/src/components/paywall-client.tsx`

ログイン済みユーザーの購入ボタン上に以下のリンクを追加:
> 「特定商取引法に基づく表記をご確認の上、決済へお進みください。」

### 3. Next.js 15 互換性修正（4ファイル）

Next.js 15 では `params` と `searchParams` が Promise 型に変更されたため、以下のファイルを修正:

| ファイル | 修正内容 |
|---------|---------|
| `/src/app/tags/[tag]/page.tsx` | params, searchParams を Promise 型に変更、await 追加 |
| `/src/app/admin/articles/page.tsx` | searchParams を Promise 型に変更、await 追加 |
| `/src/app/admin/comments/page.tsx` | searchParams を Promise 型に変更、await 追加 |
| `/src/app/admin/articles/edit/[id]/page.tsx` | params を Promise 型に変更、await 追加 |

### 4. ダイエット（バンドルサイズ削減）

**ファイル**: `/src/components/pagination.tsx`

- `'use client'` を削除してサーバーコンポーネント化
- 未使用の `useSearchParams`, `useRouter` インポートを削除
- このコンポーネントは Link のみを使用するため、クライアントJSは不要

### 5. ソースコメント追記

以下のファイルにドキュメントコメントを追加・強化:

- `/src/app/layout.tsx` - メタデータがフォールバック値である旨を明記
- `/src/app/payment/success/page.tsx` - accessDays のフォールバック値について詳細コメント
- `/src/app/tags/[tag]/page.tsx` - サーバーコンポーネントである旨を追記
- `/src/app/admin/articles/page.tsx` - サーバーコンポーネントである旨を追記
- `/src/app/admin/comments/page.tsx` - サーバーコンポーネントである旨を追記
- `/src/components/pagination.tsx` - サーバーコンポーネントの説明を追記

### 6. ペイウォールのスマホ対応

**ファイル**: `/src/app/globals.css`, `/src/components/paywall-client.tsx`

スマホ（480px以下）で横方向の余白を減らし、文字表示領域を拡大:

```css
@media (max-width: 480px) {
  .paywall {
    padding: 24px 12px;
    max-width: 100%;
    margin: 0 8px;
  }
  .terms-box {
    padding: 0.5rem;
    font-size: 0.75rem;
  }
}
```

---

## プロジェクトの重要な設計原則

### 1. サーバーサイドレンダリング優先

利用者向けページは原則としてサーバーコンポーネントで実装する。
クライアントコンポーネント（'use client'）は、インタラクティブな要素（ボタン、フォーム）のみに限定。

**理由**: バンドルサイズ削減、初期表示速度向上、SEO対策

### 2. settings コレクションの活用

Firestore の `/settings/site_config` ドキュメントでサイト全体の設定を管理:

| フィールド | 説明 |
|-----------|------|
| siteName | サイト名 |
| paymentAmount | 決済金額（円） |
| accessDurationDays | 課金後のアクセス有効日数 |
| metaTitle | トップページの title タグ |
| metaDescription | トップページの meta description |
| legalCommerceContent | 特商法ページ（Markdown） |
| privacyPolicyContent | プライバシーポリシー（Markdown） |
| termsOfServiceContent | 利用規約（Markdown） |
| copyright | フッターのコピーライト |

**取得関数**: `getSiteSettings()` in `/src/lib/settings.ts`

### 3. 認証方式

- セッションクッキー認証（HttpOnly, Secure, SameSite=Lax）
- 有効期限: 5日間
- サーバーサイドで検証: `getUser()` in `/src/lib/auth.ts`

### 4. Next.js 15 の注意点

- `params` と `searchParams` は Promise 型
- 使用する際は必ず `await` が必要
- Turbopack使用時、react-markdownはクライアントコンポーネントで使用不可

---

## 未完了・今後の検討事項

1. **Stripe ダッシュボードでの利用規約URL設定**
   - IP電話・バーチャルオフィス取得後に設定
   - 設定後、環境変数 `STRIPE_TERMS_OF_SERVICE_ENABLED=1` を追加

2. **payment/success/page.tsx のサーバーコンポーネント化**
   - 現在はクライアントコンポーネント
   - session_id からの情報取得をサーバーサイドで行う設計も可能

---

## 開発環境の起動方法

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# Stripe Webhook ローカル転送（別ターミナル）
~/.local/bin/stripe listen --forward-to localhost:9002/api/stripe/webhook
```

---

## ファイル構成（主要部分）

```
src/
├── app/
│   ├── layout.tsx          # ルートレイアウト
│   ├── page.tsx            # トップページ（記事一覧）
│   ├── admin/              # 管理画面
│   │   ├── articles/       # 記事管理
│   │   ├── comments/       # コメント管理
│   │   └── settings/       # サイト設定
│   ├── articles/[slug]/    # 記事詳細
│   ├── tags/[tag]/         # タグ別一覧
│   ├── legal/              # 法務ページ（特商法、プライバシー、利用規約）
│   ├── payment/            # 決済完了ページ
│   └── api/
│       ├── auth/session/   # セッションクッキー発行
│       └── stripe/         # Stripe Checkout, Webhook
├── components/
│   ├── header.tsx          # ヘッダー（サーバー）
│   ├── header-client.tsx   # ヘッダー（クライアント部分）
│   ├── footer.tsx          # フッター
│   ├── paywall.tsx         # ペイウォール（サーバー）
│   ├── paywall-client.tsx  # ペイウォール（クライアント部分）
│   ├── pagination.tsx      # ページネーション（サーバー）
│   └── comment-section.tsx # コメントセクション
└── lib/
    ├── auth.ts             # 認証（サーバー）
    ├── data.ts             # Firestore データ取得
    ├── settings.ts         # サイト設定取得
    ├── stripe.ts           # Stripe SDK
    └── firebase-admin.ts   # Firebase Admin SDK
```

---

以上
