# 認証アーキテクチャの選択肢と見解（Claude分析）

作成日: 2025-01-04
更新日: 2026-01-04

## 概要

本ドキュメントでは、Firebase + Next.js環境における認証方式の3つの選択肢を比較し、現在の実装を選択した理由を記録します。

### 結論（先に結論）

現在の実装は **サーバーCookie認証 + クライアントFirebase認証** のハイブリッド方式です。

| 認証方式 | 採用理由 |
|---------|--------|
| サーバーCookie認証 | サードパーティCookie問題の回避 + SSR対応 |
| クライアントFirebase認証 | Firebase Storage/Firestoreアクセス + セキュリティ監視 |

どちらか一方では要件を満たせないため、両方を併用しています。

サードパーティCookie問題への対応として、Firebase公式ドキュメントの **オプション5（プロバイダのログインを独自に処理）** を採用しています。

---

## セッションタイムアウトについて

### サーバーセッション（Cookie）

| 項目 | 値 |
|-----|---|
| 有効期限 | 5日間（固定） |
| 延長 | なし（ログイン時点から5日後で失効） |
| 保存場所 | HttpOnly Cookie |

### クライアントFirebase Auth

| 項目 | 値 |
|-----|---|
| ID Token | 1時間（自動更新） |
| Refresh Token | 無期限（IndexedDBに保存） |
| セッション永続性 | ブラウザを閉じても維持 |

### 期限の関係

```
Firebase Auth（クライアント）: 無期限（Refresh Tokenが有効な限り）
サーバーセッション: 5日間固定
```

**サーバーセッションの方が先に切れます。**

Firebase Authは以下の場合のみ無効化されます：
- パスワード変更
- アカウント削除/無効化
- Firebase Consoleで「すべてのセッションを無効化」
- 6ヶ月間アクセスなし（Google側の制限）

### セッションハイジャック対策

| 対策 | 実装 | 効果 |
|-----|-----|-----|
| HttpOnly | ✅ あり | XSSでCookie窃取不可 |
| Secure | ✅ 本番のみ | HTTPS必須（中間者攻撃防止） |
| SameSite=Lax | ✅ あり | CSRF攻撃防止 |
| 署名検証 | ✅ Firebase側 | 改ざん検知 |

5日間固定で延長なしの設計は、個人メディアサイトでは妥当なバランスです。

---

## Firebase公式のsignInWithRedirect対応オプション

Firebase公式ドキュメント「[signInWithRedirect フローのベスト プラクティス](https://firebase.google.com/docs/auth/web/redirect-best-practices?hl=ja)」では、サードパーティCookie問題への対応として5つのオプションを提示しています。

### オプション一覧

| オプション | 概要 | 採用 |
|-----------|-----|------|
| 1 | カスタムドメインをauthDomainとして使用 | ❌ |
| 2 | signInWithPopup()に切り替え | ❌ |
| 3 | firebaseapp.comへのプロキシ認証リクエスト | ❌ |
| 4 | ログインヘルパーコードを自社ドメインでホスト | ❌ |
| **5** | **プロバイダのログインを独自に処理** | **✅ 採用** |

### オプション1: カスタムドメインをauthDomainとして使用

Firebase Hostingでカスタムドメインを使用している場合、そのドメインを`authDomain`として設定する方式。

**見送り理由：**
- Firebase Hostingを使用していない（Firebase App Hostingを使用）
- App HostingとHostingは別サービス

### オプション2: signInWithPopup()に切り替え

`signInWithRedirect()`の代わりに`signInWithPopup()`を使用する方式。

**見送り理由：**
- ポップアップはモバイルでブロックされやすい
- UXがスムーズではない
- 一部ブラウザ設定でブロックされる

### オプション3: firebaseapp.comへのプロキシ認証リクエスト

自社サーバーにリバースプロキシを設定し、`/__/auth/`へのリクエストをfirebaseapp.comに転送する方式。

**見送り理由：**
- Next.js App Routerでのリバースプロキシ設定が複雑
- インフラ構成の複雑化

### オプション4: ログインヘルパーコードを自社ドメインでホスト

Firebaseのログインヘルパーファイルをダウンロードして自社サーバーでホストする方式。

**見送り理由：**
- ファイルを定期的にダウンロード・同期する必要がある
- メンテナンスコストが高い
- Apple ログインとSAMLでは機能しない

### オプション5: プロバイダのログインを独自に処理（採用）

`signInWithRedirect()`や`signInWithPopup()`を使わず、プロバイダ（Google）に直接ログインし、取得した認証情報で`signInWithCredential()`を呼び出す方式。

```typescript
// 現在の実装
const credential = GoogleAuthProvider.credential(idToken);
const result = await signInWithCredential(auth, credential);
```

**採用理由：**
- サードパーティCookie問題を完全に回避
- Firebase SDKのiframeを使用しない
- 自前でGoogle OAuth URLを構築するため、制御が明確
- 追加のインフラ設定不要

**デメリット：**
- 実装が複雑（OAuth URLを手動構築）
- Apple、SAMLなど他プロバイダ追加時に個別対応が必要

---

## 3つの選択肢

### 選択肢1: Firebase公式推奨（クライアントのみ）

Firebase AuthのクライアントSDKのみを使用し、`signInWithRedirect()`や`signInWithPopup()`で認証を行う方式。

```
ユーザー → Google → Firebase iframe → クライアント
```

| 項目 | 評価 |
|-----|-----|
| 実装の簡潔さ | ◎ Firebase SDKに任せるだけ |
| バンドルサイズ | △ firebase/auth が必要（約50KB） |
| SSR対応 | ✕ 初回レンダリング時に認証状態不明（ちらつき発生） |
| サードパーティCookie | ✕ **iframeがブロックされる（致命的）** |

#### サードパーティCookie問題

現代のブラウザはサードパーティCookieをブロックしています：

- **Firefox**: Dynamic State Partitioning / Total Cookie Protection
- **Safari**: ITP（Intelligent Tracking Prevention）
- **Chrome**: 段階的廃止予定

FirebaseのsignInWithRedirect()は内部でiframe（`firebaseapp.com/__/auth/handler`）を使用するため、ブラウザにブロックされて認証が失敗します。

**結論: 現代のブラウザでは動作しないため、採用不可**

---

### 選択肢2: サーバーセッションのみ

クライアント側のFirebase Authを完全に排除し、サーバーのセッションクッキーのみで認証を管理する方式。Firebase公式の「Manage Session Cookies」ドキュメントが推奨する方式。

```
ユーザー → Google → サーバー → セッションクッキー発行
         （クライアントのFirebase Authは使用しない）
```

| 項目 | 評価 |
|-----|-----|
| 実装の簡潔さ | ○ 状態管理がシンプル |
| バンドルサイズ | ◎ firebase/auth 不要（約50KB削減） |
| SSR対応 | ◎ サーバーで認証状態確定 |
| サードパーティCookie | ◎ 同一ドメインのクッキーのみ使用 |
| Firebase Storage | ✕ **クライアント認証が必要** |
| Firestore直接書き込み | ✕ **クライアント認証が必要** |

#### 問題点

Firebase公式ドキュメントでは以下を推奨しています：

```javascript
// クライアント側の状態は保持しない
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

// ログイン後はクライアント側をログアウト
return firebase.auth().signOut();
```

しかし、この方式では以下の機能が使えません：

1. **Firebase Storage（画像アップロード）**
   - Storage Security RulesはクライアントのFirebase Auth認証を確認
   - サーバーセッションは認識されない

2. **Firestoreへの直接書き込み**
   - コメント投稿など、クライアントから直接Firestoreに書き込む場合
   - Security RulesがFirebase Auth認証を要求

**結論: Firebase Storage/Firestoreのクライアント認証が必要なため、完全採用は困難**

---

### 選択肢3: ハイブリッド方式（現在の実装）

カスタムOAuthフローでサードパーティCookie問題を回避しつつ、クライアントとサーバーの両方で認証状態を管理する方式。

```
ユーザー → Google → 直接id_token取得 → signInWithCredential() → Firebase Auth（クライアント）
                          ↓
                    サーバー → セッションクッキー発行
```

| 項目 | 評価 |
|-----|-----|
| 実装の簡潔さ | △ 両方管理が必要 |
| バンドルサイズ | △ firebase/auth が必要（約50KB） |
| SSR対応 | ◎ サーバーセッションで対応 |
| サードパーティCookie | ◎ ログイン時iframeなし |
| Firebase Storage | ◎ クライアントAuthで対応 |
| Firestore直接書き込み | ◎ クライアントAuthで対応 |
| リアルタイム監視 | ◎ onAuthStateChanged()で検知 |

---

## 現在の実装詳細

### ログインフロー

1. ユーザーがログインボタンをクリック
2. 手動でGoogle OAuthのURLを構築（`response_type=id_token`）
3. Googleで認証後、`/auth/callback`にリダイレクト
4. URL hashから`id_token`を取得
5. `signInWithCredential()`でFirebase Auth認証（iframeなし）
6. Firebase ID Tokenをサーバーに送信
7. サーバーでセッションクッキー発行
8. 元のページにリダイレクト

### 認証状態の参照

| コンポーネント | 参照先 | 用途 |
|--------------|-------|-----|
| header.tsx | サーバー（getUser） | ログイン状態表示 |
| paywall.tsx | サーバー（getUser） | 有料記事アクセス制御 |
| admin/layout.tsx | サーバー（getUser） | 管理画面アクセス制御 |
| article-generator-form.tsx | クライアント（useAuth） | 画像アップロード認証 |

### ログアウトフロー

```typescript
const signOut = async () => {
  await firebaseSignOut(auth);  // Firebase Authからログアウト
  await fetch('/api/auth/session', { method: 'DELETE' });  // セッションクッキー削除
  window.location.href = '/';
};
```

両方のログアウトを実行し、状態の整合性を確保。

---

## 状態の整合性確保

### 懸念事項

Firebase側でトークンが無効化された場合、サーバーセッションが残る可能性がある。

### 対応方針

**クライアント側での自動監視は行わない。** サーバー側の検証で対応する。

| 層 | 対応 |
|---|---|
| サーバー側 | `verifySessionCookie(cookie, true)` の `checkRevoked=true` で、Firebase側で無効化されたユーザーを拒否 |
| クライアント側 | 明示的な `signOut()` のみでログアウト |

### 理由

`onAuthStateChanged()` による自動セッションクリアを試みたが、不具合が発生したため削除。

---

## onAuthStateChanged 自動クリアの試行と撤回

### 試行した実装

Firebase Authの認証状態変更を監視し、無効化時にサーバーセッションを自動クリアする機能を実装。

```typescript
// 試行した実装（現在は削除済み）
useEffect(() => {
  let wasLoggedIn = false;
  
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    if (wasLoggedIn && !firebaseUser) {
      await fetch('/api/auth/session', { method: 'DELETE' });
    }
    wasLoggedIn = !!firebaseUser;
    // ...
  });
  return () => unsubscribe();
}, []);
```

### 発生した不具合

**再現手順：**
1. トップページ（`/`）でログイン
2. 管理画面（`/admin/comments`）を開く → 正常に開ける
3. トップページをリロード
4. 管理画面をリロード → **ログアウトしてトップにリダイレクトされる**

**原因：**
1. ページリロード時、Firebase Auth SDK が IndexedDB から復元開始
2. 一瞬 `firebaseUser` が取得できる → `wasLoggedIn = true`
3. Firebase Auth API (`accounts:lookup`) を呼ぶ → **400 エラー**
4. Firebase SDK が user を `null` に更新
5. `onAuthStateChanged` が再度発火、`wasLoggedIn=true` && `user=null`
6. **DELETE リクエスト発火** → サーバーセッション削除
7. admin/layout.tsx の `getUser()` が guest を返す → リダイレクト

**ブラウザログ：**
```
POST https://identitytoolkit.googleapis.com/v1/accounts:lookup
[HTTP/3 400  240ms]

[Auth] Firebase auth invalidated, clearing server session
```

### 撤回の判断

| 観点 | 評価 |
|-----|-----|
| 問題の深刻さ | 高（意図せずログアウトされる） |
| サーバー側の保護 | 既に `verifySessionCookie(cookie, true)` で対応済み |
| クライアント監視の必要性 | 低（サーバー側で拒否できる） |

**結論：** クライアント側での自動監視は不要。サーバー側の検証で十分。

---

## 将来の拡張性

現在の実装で対応可能な機能：

| 機能 | 対応 |
|-----|-----|
| Firebase Storage（画像アップロード） | ✅ 対応済み |
| Firestore直接書き込み（コメント等） | ✅ 対応可能 |
| リアルタイムデータ同期 | ✅ 対応可能 |
| オフラインサポート | ✅ 対応可能 |

---

## 結論

| 選択肢 | 採用可否 | 理由 |
|-------|---------|-----|
| 1. Firebase公式（クライアントのみ） | ✕ | サードパーティCookie問題で動作しない |
| 2. サーバーセッションのみ | ✕ | Firebase Storage/Firestoreが使えない |
| **3. ハイブリッド方式** | **◎** | 両方の問題を解決、拡張性も確保 |

**現在のハイブリッド実装は妥協ではなく、必然的な選択です。**

### 各認証方式の役割

| 認証方式 | 主な役割 |
|---------|--------|
| サーバーCookie認証 | 不具合対応（サードパーティCookie問題回避）+ SSR対応 + 認証検証（checkRevoked） |
| クライアントFirebase認証 | 機能要件（Storage/Firestoreアクセス） |

どちらか一方では要件を満たせず、両方を併用することで初めて完全な認証システムが実現できます。

---

## 参考リンク

- [Firebase: Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [Firebase: Best practices for signInWithRedirect flows](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [prompt_history/20251229_claude_login.md](../prompt_history/20251229_claude_login.md) - 実装経緯の詳細
