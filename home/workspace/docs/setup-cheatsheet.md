# Firebase & GCP 設定チートシート (簡潔版)

このドキュメントは、`homepage`プロジェクトを新規環境でセットアップするためのFirebaseおよびGoogle Cloud Platform (GCP) の設定手順の要約です。

---

## 1. Firebase プロジェクトの基本設定

### 1-1. Firebaseプロジェクトの作成とWebアプリの登録

1. [Firebaseコンソール](https://console.firebase.google.com/)でプロジェクトを作成します (`homepage-95581`など)。
2. プロジェクト概要ページで、ウェブアイコン (`</>`) をクリックし、Webアプリを登録します。
3. 「Firebase SDK を追加」画面で「npm を使用」を選択し、`firebaseConfig` オブジェクトの内容をコピーします。

### 1-2. 環境変数ファイル `.env` の設定

プロジェクトのルートに `.env` ファイルを作成し、`firebaseConfig`の値を貼り付けます。
**重要:** 各変数名の先頭には `NEXT_PUBLIC_` プレフィックスを必ず付けてください。

**【マッピング】**
| Firebaseコンソール (`firebaseConfig`) | `.env` ファイル                     |
|-------------------------------------|-----------------------------------|
| `apiKey`                            | `NEXT_PUBLIC_FIREBASE_API_KEY`      |
| `authDomain`                        | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`  |
| `projectId`                         | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`   |
| `storageBucket`                     | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`|
| `messagingSenderId`                 | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId`                             | `NEXT_PUBLIC_FIREBASE_APP_ID`       |

```env
# .env ファイルの例
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="homepage-95581.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="homepage-95581"
# ...以下同様
```

---

## 2. Firebase Authentication の設定

1. Firebaseコンソールで **Authentication** > **Sign-in method** に移動します。
2. プロバイダの一覧から「**Google**」を有効にします。
3. **Settings** > **承認済みドメイン** に、以下のドメインを追加します。
    - `localhost`
    - Firebase Studio の開発用ドメイン (例: `9000-....cloudworkstations.dev`)
    - 本番ドメイン (例: `www.okamomedia.tokyo`)

---

## 3. Firebase Firestore の設定

1. Firebaseコンソールで **Firestore Database** に移動し、「データベースの作成」をクリックします。
2. 「**テストモードで開始**」を選択し、ロケーション（例: `asia-northeast1`）を指定して有効化します。
3. プロジェクトルートの `firestore.rules` の内容をFirestoreの「**ルール**」タブに貼り付けて公開します。

---

## 4. Firebase Storage の設定 (画像アップロード用)

### 4-1. Storageの有効化とルール設定

1. Firebaseコンソールで **Storage** に移動し、有効化します。
2. プロジェクトルートの `storage.rules` の内容をStorageの「**ルール**」タブに貼り付けて公開します。

### 4-2. CORS設定 (アップロード許可)

**Cloud Shell** を起動し、以下のコマンドを実行します。

1. **プロジェクト設定:**
   `gcloud config set project homepage-95581`

2. **CORS設定ファイル作成:**
   ```bash
   cat <<EOF > storage-cors.json
   [
     {
       "origin": ["*"], "method": ["GET"], "maxAgeSeconds": 3600
     },
     {
       "origin": [
         "http://localhost:9002",
         "https://9000-....cloudworkstations.dev",
         "https://www.okamomedia.tokyo"
       ],
       "method": ["GET", "POST", "PUT", "OPTIONS"],
       "responseHeader": ["Content-Type", "Authorization"],
       "maxAgeSeconds": 3600
     }
   ]
   EOF
   ```
   (※ `9000-...` の部分は自分の環境に合わせてください)

3. **CORS設定適用:**
   `gsutil cors set storage-cors.json gs://homepage-95581.appspot.com`
   (※ `gs://...` の部分は自分のバケット名に合わせてください)

### 4-3. IAM権限設定 (画像公開)

**Cloud Shell** で以下のコマンドを実行して、アップロードした画像を一般公開します。
`gcloud storage buckets add-iam-policy-binding gs://homepage-95581.appspot.com --member=allUsers --role=roles/storage.objectViewer`

---

## 5. サービスアカウントキーの設定 (Admin SDK用)

1. GCPコンソールの **IAMと管理** > **サービスアカウント** に移動します。
2. `Firebase Admin SDK` が含まれるサービスアカウントを選択し、**キー** > **新しい鍵を作成** > **JSON** を選択してキーファイルをダウンロードします。
3. ダウンロードしたJSONファイルの内容を**すべてコピー**します。
4. `.env` ファイルに `FIREBASE_SERVICE_ACCOUNT_KEY` という名前で、コピーした内容を**1行で**貼り付けます。
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", ...}'
   ```

---

## 6. CLIコマンドの利用

- **管理者権限の付与:** `npm run set-admin -- user@example.com`
- **サイト設定の初期化:** `npm run init-settings`

