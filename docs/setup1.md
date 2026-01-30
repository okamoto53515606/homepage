# 個人向けメディアシステム「homepage」セットアップ手順書Part1

> **はじめに**
> 
> この手順書では、個人向けメディアシステム「homepage」のセットアップ方法を、非エンジニアの方でも迷わず進められるよう丁寧に解説しています。
> 
> 手順が多く感じるかもしれませんが、一つひとつはシンプルな作業です。**焦らず、ゆっくり進めてください。** 途中でつまずいても大丈夫。この手順書を最初から見直せば、きっと解決できます。
> 
> 完成した時の達成感は格別ですよ！💪

---

## 📋 目次

1. [独自ドメインを取得する](#手順1-独自ドメインを取得する)
2. [GCPコンソールにログイン](#手順2-gcpコンソールにログイン)
3. [Gemini API Key を取得する](#手順3-gemini-api-key-を取得する)
4. [Firebase Studio でサイトを公開する](#手順4-firebase-studio-でサイトを公開する)
5. [Firebase で Googleログインを有効化する](#手順5-firebase-で-googleログインを有効化する)
6. [独自ドメインを設定する](#手順6-独自ドメインを設定する)
7. [Firestore Database を設定する](#手順7-firestore-database-を設定する)
8. [Storage を設定する](#手順8-storage-を設定する)
9. [OAuth 2.0 クライアントIDに独自ドメインを設定する](#手順9-oauth-20-クライアントidに独自ドメインを設定する)
10. [Firebase Studio でターミナルを開く](#手順10-firebase-studio-でターミナルを開く)
11. [Firebase Studio を再起動する](#手順11-firebase-studio-を再起動する)
12. [.env ファイルを編集する](#手順12-env-ファイルを編集する)
13. [サイト基本設定を登録する](#手順13-サイト基本設定を登録する)
14. [本番サイトに反映する](#手順14-本番サイトに反映する)
15. [管理者アカウントを作成する](#手順15-管理者アカウントを作成する)
16. [サイト基本情報を設定する](#手順16-サイト基本情報を設定する)
17. [記事を追加する](#手順17-記事を追加する)

---

## 📝 事前準備：メモ用のテキストファイルを用意してください

セットアップ中に、いくつかの**APIキー**や**設定値**をメモしておく必要があります。  
お手元にテキストエディタ（メモ帳など）を開いておくと便利です。

### メモする項目一覧

| 項目名 | メモするタイミング |
|--------|-------------------|
| Gemini API Key | 手順3 |
| Storageバケット名（gs://〜） | 手順8 |
| プロジェクトID（studio-〜） | 手順9 |
| OAuth クライアントID | 手順9 |
| Firebase Config 情報 | 手順12 |

---

> **💡 この手順書で使用するドメイン名について**
> 
> 以降の説明では、あなたのサイトのドメインが `test.okamomedia.tokyo` だと仮定して説明を進めます。  
> 実際の作業では、**ご自身で取得したドメイン名に置き換えて**ください。

---

## 手順1: 独自ドメインを取得する

あなたのサイト専用のドメイン（インターネット上の住所）を取得します。

### 参考リンク

ムームードメインでの取得例：  
👉 [ドメインのお申し込み手順（ムームードメイン）](https://support.muumuu-domain.com/hc/ja/articles/360046369653-%E3%83%89%E3%83%A1%E3%82%A4%E3%83%B3%E3%81%AE%E3%81%8A%E7%94%B3%E3%81%97%E8%BE%BC%E3%81%BF%E6%89%8B%E9%A0%86%E3%82%92%E6%95%99%E3%81%88%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84)

> **📌 ポイント**
> - ドメイン名は一度決めると変更が難しいので、慎重に選びましょう
> - `.com` や `.jp` など、信頼性の高いドメインがおすすめです

---

## 手順2: GCPコンソールにログイン

Google Cloud Platform（GCP）は、Googleが提供するクラウドサービスです。  
このシステムの基盤となります。

### 手順

1. Googleアカウントを持っていない場合は、先に作成してください
2. 以下のURLにアクセスしてログインします

👉 https://console.cloud.google.com/

![GCPコンソール](screenshot/gcp.png)

> **🎉 ここまでお疲れさまでした！**  
> GCPへのログインが完了しました。次はAI機能のためのAPIキーを取得します。

---

## 手順3: Gemini API Key を取得する

記事作成をAIがサポートするための「Gemini API Key」を取得します。

### 手順

1. 以下のURLにアクセスします

👉 https://aistudio.google.com/api-keys

2. 「APIキーを作成」ボタンをクリック

![APIキーを作成](screenshot/google_ai_studio_get_api_key.png)

3. APIキーが作成されたら、「コピー」ボタンをクリック

![APIキーをコピー](screenshot/google_ai_studio_get_api_key2.png)

4. **コピーしたAPIキーをメモ帳などに保存しておいてください**

> **⚠️ 重要**  
> このAPIキーは後で使用します。必ずメモしておいてください！

---

## 手順4: Firebase Studio でサイトを公開する

Firebase Studio を使って、まずは「Hello World」と表示されるだけのシンプルなサイトを公開します。  
これが、あなたのサイトの土台になります。

### 手順

1. 以下のURLにアクセスします

👉 https://studio.firebase.google.com/?hl=ja

2. 以下の文章を**そのままコピー＆ペースト**して、エンターキーを押します

```
App Name: MyHomepage
Core Features:
hello worldを表示するだけのアプリ。
CSSファイルなし: CSSファイル一切なし。
スタイル/デザイン不要: cssやstyle不要。デザイン不要。
Tailwind CSS不使用: Tailwind CSSは絶対に使わない事。
Tailwind削除:
package.jsonからtailwindcssおよびtailwind関連のパッケージを削除する事
未使用モジュール削除: 未利用のnpmモジュールを削除。
最速・最軽量化:
npmモジュールやソースコードを極力減らすことにより最速・最軽量に。
blueprint日本語: blueprintは日本語で作成して下さい。
Style Guidelines:
スタイルやデザインは不要。
```

![Firebase Studio 初期画面](screenshot/FirebaseStudio1.png)

3. 「Customize」ボタンをクリック

![Customizeボタン](screenshot/FirebaseStudio2.png)

4. 依頼文が英語になっている場合は、日本語の依頼文に書き換えて「Save」ボタンをクリック

![依頼文を日本語に](screenshot/FirebaseStudio3.png)

5. 「Prototype this App」ボタンをクリック

6. **数分待った後**、右上の「Publish」ボタンをクリック

![Publishボタン](screenshot/FirebaseStudio4.png)

> **⏰ 補足**  
> 処理には数分かかることがあります。画面が動いていれば、そのままお待ちください。

7. 「Create a Cloud Billing account」のリンクが表示されたら、クリックしてクレジットカード情報などを登録

![Billing設定](screenshot/FirebaseStudio5.png)

> **💳 課金について**  
> クレジットカードを登録しますが、このセットアップ手順で大きな費用は発生しません。  
> 無料枠の範囲内で十分に試すことができます。

8. 「Link Google Cloud Billing account」ボタンをクリック

![Billingリンク](screenshot/FirebaseStudio6.png)

9. 「Set up services」ボタンをクリック

![Set up services](screenshot/FirebaseStudio7.png)

10. 「Publish now」ボタンをクリック

![Publish now](screenshot/FirebaseStudio8.png)

11. 処理が終わったら、「Visit your app」の下のURLをクリック

![Visit your app](screenshot/FirebaseStudio9.png)

12. 「hello world」と表示されれば成功です！🎉

![Hello World](screenshot/HelloWorld.png)

> **🎉 素晴らしい！**  
> あなたのサイトが初めてインターネット上に公開されました！  
> まだシンプルな画面ですが、これから本格的なメディアサイトに変身させていきます。

---

## 手順5: Firebase で Googleログインを有効化する

サイトに「Googleでログイン」機能を追加するための設定を行います。

### 手順

1. 以下のURLにアクセスし、先ほど作成した「MyHomepage」プロジェクトを選択

👉 https://console.firebase.google.com/

![Firebaseプロジェクト選択](screenshot/Firebase1.png)

2. 左下の「>」マークをクリックしてメニューを展開

![メニュー展開](screenshot/Firebase2.png)

3. 「構築」→「Authentication」をクリック

![Authentication](screenshot/Firebase3.png)

4. 「始める」をクリック

![始める](screenshot/Firebase4.png)

5. 「追加のプロバイダ」エリアの「Google」をクリック

![Googleプロバイダ](screenshot/Firebase5.png)

6. 以下を設定して「保存」ボタンをクリック
   - 「有効にする」をオン
   - 「プロジェクトの公開名」に好きな名前を英字で入力
   - 「プロジェクトのサポートメール」を選択

![Google有効化](screenshot/Firebase6.png)

7. 「設定」タブをクリックし、「承認済ドメイン」をクリック

![承認済ドメイン](screenshot/Firebase7.png)

8. 「ドメインの追加」ボタンをクリックし、あなたのドメイン（例：`test.okamomedia.tokyo`）を入力して「追加」をクリック

![ドメイン追加](screenshot/Firebase8.png)

---

## 手順6: 独自ドメインを設定する

取得した独自ドメインを、Firebaseのサイトに紐づけます。

### 手順

1. Firebaseコンソールで「構築」→「App Hosting」をクリック

![App Hosting](screenshot/Domain1.png)

2. 「表示」をクリック

![表示](screenshot/Domain2.png)

3. 「設定」タブをクリックし、「カスタムドメインを追加」をクリック  
   あなたのドメイン（例：`test.okamomedia.tokyo`）を入力し、「設定を続行」をクリック

![カスタムドメイン追加](screenshot/Domain3.png)

4. 表示された3つのDNSレコードを、ドメイン管理サービス（ムームードメインなど）で設定

![DNSレコード](screenshot/Domain4.png)

> **📌 ムームードメインでの設定例**
> 
> 👉 [ムームードメイン - DNSレコード設定方法](https://support.muumuu-domain.com/hc/ja/articles/360045802434-DNS%E3%83%AC%E3%82%B3%E3%83%BC%E3%83%89%E3%82%92%E8%A8%AD%E5%AE%9A%E3%81%99%E3%82%8B%E3%81%93%E3%81%A8%E3%81%AF%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%99%E3%81%8B)

![ムームードメイン設定例](screenshot/muumuu-domain.png)

5. 3レコードを追加後、「レコードを確認」ボタンをクリック

![レコード確認](screenshot/Domain5.png)

> **⏰ DNSの反映には時間がかかります**  
> うまくいかない場合は、**1〜2時間程度待ってから**再度「レコードを確認」ボタンをクリックしてください。  
> これはDNSの仕組み上、正常な動作です。焦らずお待ちください。

6. 「接続されています」と表示されれば設定完了！

![接続完了](screenshot/Domain6.png)

7. 別タブで本番サイト（あなたのドメイン：例 `https://test.okamomedia.tokyo`）にアクセスし、「hello world」と表示されれば成功です！🎉

---

## 手順7: Firestore Database を設定する

記事やユーザー情報を保存するためのデータベースを作成します。

### 手順

1. Firebaseコンソールで「構築」→「Firestore Database」をクリック

![Firestore Database](screenshot/Database1.png)

2. 「データベースの作成」をクリック

![データベース作成](screenshot/Database2.png)

3. 「Standard エディション」を選択したまま、「次へ」をクリック

4. ロケーションは「**asia-northeast1 (Tokyo)**」を選択し、「次へ」をクリック

> **📌 ポイント**  
> ロケーションは日本（Tokyo）を選ぶと、サイトの表示速度が速くなります。

5. 「本番環境モードで開始する」を選択したまま、「作成」をクリック

---

## 手順8: Storage を設定する

画像ファイルなどを保存するためのストレージを設定します。

### 手順

1. Firebaseコンソールで「構築」→「Storage」をクリック

![Storage](screenshot/Storage1.png)

2. 「使ってみる」をクリック

![使ってみる](screenshot/Storage2.png)

3. 「すべてのロケーション」を選択し、ロケーションは「**ASIA-NORTHEAST1**」を選択して「続行」をクリック

![ロケーション選択](screenshot/Storage3.png)

4. 「本番環境モードで開始する」を選択したまま、「作成」をクリック

5. 「ルール」タブをクリックし、以下の内容を**そのままコピー＆ペースト**して「公開」ボタンをクリック

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /articles/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

![Storageルール](screenshot/Storage4.png)

6. 「ファイル」タブをクリックし、「**gs://studio-xxx.firebasestorage.app**」の部分をコピーしてメモ帳に保存

![Storageバケット名](screenshot/Storage5.png)

> **⚠️ 重要**  
> この「gs://〜」で始まる文字列は、後の手順で使用します。必ずメモしておいてください！

---

## 手順9: OAuth 2.0 クライアントIDに独自ドメインを設定する

Googleログインが正しく動作するよう、あなたのドメインを登録します。

### 手順

1. GCPコンソールにログインし、以下のURLに移動

👉 https://console.cloud.google.com/apis/credentials

2. 左上のロゴ右をクリックし、「**プロジェクトID（studio-xxx）**」の部分をコピーしてメモ帳に保存  
   その後、対象のFirebaseプロジェクトをクリック

![プロジェクトID](screenshot/Gcp2.png)

> **⚠️ 重要**  
> プロジェクトIDは後の手順で使用します。必ずメモしておいてください！

3. 「OAuth 2.0 クライアント ID」エリアにある「**クライアントID**」をコピーしてメモ帳に保存  
   その後、「Web client (auto created by Google Service)」をクリック

![クライアントID](screenshot/Gcp3.png)

> **⚠️ 重要**  
> クライアントIDも後で使用します。必ずメモしておいてください！

4. 「承認済みの JavaScript 生成元」の「＋URIを追加」ボタンをクリックし、あなたのサイトURL（例：`https://test.okamomedia.tokyo`）を追加

![JavaScript生成元](screenshot/Gcp4.png)

5. 「承認済みのリダイレクト URI」の「＋URIを追加」ボタンをクリックし、コールバックURL（例：`https://test.okamomedia.tokyo/auth/callback`）を追加

![リダイレクトURI](screenshot/Gcp5.png)

6. 「保存」ボタンをクリック

> **🎉 ここまでよく頑張りました！**  
> 設定作業の山場を越えました。残りの手順では、実際にプログラムを動かしていきます。

---

## 手順10: Firebase Studio でターミナルを開く

ここからは、Firebase Studio のターミナル（コマンド入力画面）を使って設定を行います。

> **💡 ターミナルとは？**  
> 黒い画面に文字を入力してコンピュータに命令を出す画面です。  
> 難しそうに見えますが、**コピー＆ペーストするだけ**なので安心してください！

### 手順

1. Firebase Studio で右上の「</>」をクリック

![コード画面へ](screenshot/Terminal1.png)

2. App overview の右の「×」ボタンをクリックして閉じる  
   次に、GEMINI の下の「＋」ボタンをクリック → 「New Chat」を選択

![New Chat](screenshot/Terminal2.png)

> **📌 ポイント**  
> 「New Chat」で普通のGeminiに切り替えます。経験上、こちらの方がトラブルが少ないです。

3. 左上のハンバーガーメニュー（三本線マーク）から「Terminal」→「New Terminal」を選択

![新規ターミナル](screenshot/Terminal3.png)

4. ターミナルが表示されます

![ターミナル画面](screenshot/Terminal4.png)

5. 以下のコマンドをコピー＆ペーストしてエンターキーを押す  
   **※注意：`XXXXXX` の部分を、メモしたプロジェクトIDに書き換えてください**

```bash
gcloud config set project XXXXXX
```

![gcloudコマンド](screenshot/Terminal5.png)

6. ポップアップ画面が出たら、チェック欄にチェックを入れて「Grant Access」ボタンをクリック

![Grant Access](screenshot/Terminal6.png)

7. 以下のコマンドをコピー＆ペーストしてエンターキーを押す  
   **※注意：`test.okamomedia.tokyo` の部分を、あなたのドメイン名に書き換えてください**

```bash
cat <<EOF > cors.json
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  },
  {
    "origin": [
      "https://test.okamomedia.tokyo"
    ],
    "method": [
      "GET", "POST", "PUT", "DELETE", "OPTIONS"
    ],
    "responseHeader": [
      "Content-Type", "Authorization"
    ],
    "maxAgeSeconds": 3600
  }
]
EOF
```

![CORSファイル作成](screenshot/Terminal7.png)

8. 以下のコマンドをコピー＆ペーストしてエンターキーを押す  
   **※注意：`YYYYYY` の部分を、メモした `gs://〜` に書き換えてください**

```bash
gsutil cors set cors.json YYYYYY
```

![gsutilコマンド](screenshot/Terminal8.png)

9. ポップアップ画面が出たら、チェック欄にチェックを入れて「Grant Access」ボタンをクリック

![Grant Access](screenshot/Terminal6.png)

10. 以下のコマンドをコピー＆ペーストしてエンターキーを押す  
    **※注意：`YYYYYY` の部分を、メモした `gs://〜` に書き換えてください**

```bash
gcloud storage buckets add-iam-policy-binding YYYYYY --member=allUsers --role=roles/storage.objectViewer
```

![ストレージ公開設定](screenshot/Terminal9.png)

11. 以下のコマンドをコピー＆ペーストしてエンターキーを押す

```bash
curl -fsSL https://raw.githubusercontent.com/okamoto53515606/homepage/main/cli/setup1.sh | bash
```

![セットアップスクリプト](screenshot/Terminal10.png)

> **⏰ 処理には数分かかります**  
> 「🎉 セットアップが完了しました！」と表示されるまでお待ちください。  
> 途中で止まっているように見えても、処理は進んでいます。

---

## 手順11: Firebase Studio を再起動する

セットアップスクリプトの変更を反映するため、Firebase Studio を再起動します。

### 手順

1. 左上の Firebase Studio ロゴをクリック

2. 「MyHomepage」の横メニューから「Restart」をクリック

![Restart](screenshot/Restart.png)

3. 再起動後、「MyHomepage」をクリック

4. 右上の「</>」をクリック

![コード画面へ](screenshot/Terminal1.png)

5. GEMINI の下の「＋」ボタンをクリック → 「New Chat」を選択

![New Chat](screenshot/Terminal2.png)

> **📌 ポイント**  
> 再起動後も「New Chat」で普通のGeminiに切り替えることをおすすめします。

---

## 手順12: .env ファイルを編集する

サイトの設定情報を記載した環境変数ファイルを編集します。

### 手順

1. 左側のエクスプローラーで「.env」ファイルをクリック

![envファイル](screenshot/env1.png)

2. 以下の項目にメモした値をペースト
   - `GEMINI_API_KEY` ← メモした Gemini API Key
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` ← メモした OAuth クライアントID

![env編集1](screenshot/env2.png)

> **📌 ポイント**  
> 値は**ダブルクォーテーション（""）の中に**ペーストしてください。

3. 別タブでFirebase画面を開き、左上の歯車マーク → 「全般」をクリック

![プロジェクト設定](screenshot/firebase_project_setting_menu.png)

4. 画面をスクロールして「firebaseConfig」の記述を探し、内容をコピーしてメモ帳に保存

![firebaseConfig](screenshot/firebase_sdk_config.gif)

5. .env ファイルで以下の項目にそれぞれの値をペースト

| 環境変数名 | 対応する firebaseConfig の値 |
|-----------|---------------------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

![env編集2](screenshot/env3.png)

> **📌 ポイント**  
> すべての値は**ダブルクォーテーション（""）の中に**ペーストしてください。

---

## 手順13: サイト基本設定を登録する

データベースに初期設定を登録し、検索用のインデックスを作成します。

### 手順

1. 左上のハンバーガーメニュー（三本線マーク）から「Terminal」→「New Terminal」を選択

![新規ターミナル](screenshot/Terminal3.png)

2. ターミナルが表示されます

![ターミナル画面](screenshot/Terminal4.png)

3. 以下のコマンドをコピー＆ペーストしてエンターキーを押す

```bash
npm run init-settings
```

![init-settings](screenshot/Terminal11.png)

4. ポップアップ画面が出たら、チェック欄にチェックを入れて「Grant Access」ボタンをクリック

![Grant Access](screenshot/Terminal6.png)

5. 以下のコマンドをコピー＆ペーストしてエンターキーを押す
   **※注意：`XXXXXX` の部分を、メモしたプロジェクトIDに書き換えてください**

```bash
firebase deploy --only firestore:indexes --project XXXXXX
```

![firebase deploy](screenshot/Terminal15.png)

6. ポップアップ画面が出たら、チェック欄にチェックを入れて「Grant Access」ボタンをクリック

![Grant Access](screenshot/Terminal6.png)

---

## 手順14: 本番サイトに反映する

ここまでの設定を本番サイトに反映（デプロイ）します。

### 手順

1. 右上の「Publish」ボタンをクリック

![Publishボタン](screenshot/FirebaseStudio4.png)

2. 「Publish」ボタンをクリック

![Publish確認](screenshot/FirebaseStudio8.png)

> **⏰ デプロイには数分かかります**  
> 完了するまでお待ちください。

---

## 手順15: 管理者アカウントを作成する

あなた自身を管理者として登録します。

### 手順

1. ブラウザの別タブで本番サイト（あなたのドメイン）を開く

2. 右上の「ログイン」ボタンをクリックし、あなたのGoogleアカウントでログイン

![ログイン](screenshot/Front1.png)

3. Firebase Studio に戻り、左上のハンバーガーメニューから「Terminal」→「New Terminal」を選択

![新規ターミナル](screenshot/Terminal3.png)

4. ターミナルが表示されます

![ターミナル画面](screenshot/Terminal4.png)

5. 以下のコマンドをコピー＆ペーストしてエンターキーを押す  
   **※注意：`user@example.com` の部分を、先ほどログインしたメールアドレスに書き換えてください**

```bash
npm run set-admin -- user@example.com
```

![set-admin](screenshot/Terminal16.png)

---

## 手順16: サイト基本情報を設定する

管理画面からサイトの基本情報を設定します。

### 手順

1. ブラウザの別タブで本番サイト（あなたのドメイン）を開く

2. 右上の「ログイン」ボタンをクリックし、あなたのGoogleアカウントでログイン  
   **※すでにログイン済みの場合は、一度ログアウトしてから再度ログインしてください**

![ログイン](screenshot/Front1.png)

> **📌 ポイント**  
> 管理者権限を反映するため、再ログインが必要です。

3. 右上のアイコンをクリック → 「管理画面」をクリック

![管理画面へ](screenshot/Front2.png)

4. 左側メニューの「サイト設定」をクリック

5. 各項目を入力し、「設定を保存」ボタンをクリック

![サイト設定](screenshot/Admin1.png)

---

## 手順17: 記事を追加する

いよいよ最後の手順です！AIを使って記事を作成してみましょう。

### 手順

1. 左側メニューの「記事管理」をクリック

2. 右上の「新規作成」ボタンをクリック

![記事管理](screenshot/Admin2.png)

3. 以下を入力して「生成して下書き保存」ボタンをクリック
   - **画像アセット**：記事で使いたい画像をドラッグ＆ドロップ（省略可）
   - **コンテンツの目標**：どんな記事を書きたいか
   - **コンテキスト**：記事の背景情報や追加の指示

![記事作成](screenshot/Admin3.png)

> **🤖 AIがあなたの代わりに記事を書いてくれます！**  
> 目標とコンテキストを入力すれば、Geminiが下書きを作成します。

4. 記事内容を確認し、修正が必要であれば「AIへの修正依頼」欄に指示を入力して「AIで修正を実行」ボタンをクリック

![記事修正](screenshot/Admin4.png)

5. 記事内容に問題がなければ、「公開」にチェックを入れて「公開ステータスを更新」ボタンをクリック

![記事公開](screenshot/Admin5.png)

6. 左下の「サイトを表示」ボタンをクリックして、利用者サイトを確認

![サイト表示](screenshot/Front3.png)

> **📌 ポイント**  
> 左上のハンバーガーメニューには、記事のタグが自動的にメニュー表示されます。

---

## 🎉 セットアップ完了！おめでとうございます！

長い手順を最後までお疲れさまでした！  
これであなただけのメディアサイトが完成しました。

### これからできること

- ✍️ AIの力を借りて、どんどん記事を追加しましょう
- 🎨 Firebase Studio のGeminiに「デザインを変えて」と依頼すれば、見た目もカスタマイズできます
- 📊 管理画面からコメントの管理やサイト設定の変更ができます

---

## 📝 次のステップ

有料記事の販売機能を追加したい場合は、続きの手順書をご覧ください。

👉 **[個人向けメディアシステム「homepage」セットアップ手順書Part2](setup2.md)**（Stripe連携・サンドボックス環境編）

課金機能を有効にすると、クレジットカード決済で有料記事を販売できるようになります！

---

## ❓ トラブルシューティング

### よくある問題と対処法

| 症状 | 原因 | 対処法 |
|-----|------|-------|
| ログインできない | 承認済みドメインに登録されていない | 手順5の「承認済ドメイン」設定を確認 |
| 画像がアップロードできない | Storage のルール設定が不正 | 手順8のルール設定を再確認 |
| 「redirect_uri_mismatch」エラー | リダイレクトURIの設定ミス | 手順9のリダイレクトURI設定を確認（設定後、反映に5〜15分かかることがあります） |
| DNS設定が反映されない | DNSの伝播に時間がかかっている | 1〜2時間待ってから再確認 |

何か問題があれば、この手順書を最初から見直してみてください。  
多くの場合、設定の入力ミスや手順の飛ばしが原因です。

---

**頑張ったあなたに拍手！👏**  
素敵なメディアサイトを運営してくださいね！
