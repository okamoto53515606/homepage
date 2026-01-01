
# Firebase & GCP 設定チートシート

このドキュメントは、`homepage`プロジェクトを新規環境でセットアップするためのFirebaseおよびGoogle Cloud Platform (GCP) の設定手順をまとめたものです。

---

## 1. Firebase プロジェクトの基本設定

### 1-1. Firebaseプロジェクトの作成とWebアプリの登録

1.  [Firebaseコンソール](https://console.firebase.google.com/)にアクセスし、`homepage-95581` のようなプロジェクトを作成します。
2.  プロジェクト概要ページで、ウェブアイコン (`</>`) をクリックし、新しいウェブアプリを登録します。
3.  「Firebase SDK を追加」画面で「npm を使用」を選択し、`firebaseConfig` オブジェクトの内容をコピーします。

### 1-2. 環境変数ファイル `.env` の設定

プロジェクトのルートディレクトリに `.env` ファイルを作成し、コピーした`firebaseConfig`の値を貼り付けます。
**重要:** 各変数名の先頭には `NEXT_PUBLIC_` プレフィックスを必ず付けてください。

```env
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="homepage-95581.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="homepage-95581"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="homepage-95581.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="1:..."
```

---

## 2. Firebase Authentication の設定

1.  Firebaseコンソールで **Authentication** > **Sign-in method** タブに移動します。
2.  プロバイダの一覧から「**Google**」を選択し、有効にします。
3.  **Settings** > **承認済みドメイン** に移動し、以下のドメインを追加します。
    *   `localhost` (ローカル開発用)
    *   Firebase Studio の開発用ドメイン (例: `9000-....cloudworkstations.dev`)
    *   本番環境のドメイン (例: `www.okamomedia.tokyo`)

---

## 3. Firebase Firestore の設定

1.  Firebaseコンソールで **Firestore Database** に移動します。
2.  「**データベースの作成**」をクリックします。
3.  「**テストモードで開始**」を選択します。（セキュリティルールは後から適用します）
4.  ロケーション（例: `asia-northeast1 (Tokyo)`）を選択し、「有効にする」をクリックします。
5.  プロジェクトのルートにある `firestore.rules` の内容をコピーし、Firestoreの「**ルール**」タブに貼り付けて公開します。

---

## 4. Firebase Storage の設定と公開設定

### 4-1. Storageの有効化とルール設定

1.  Firebaseコンソールで **Storage** に移動し、「始める」をクリックして有効化します。
2.  プロジェクトのルートにある `storage.rules` の内容をコピーし、Storageの「**ルール**」タブに貼り付けて公開します。

### 4-2. CORS設定 (画像のアップロード許可)

**Cloud Shell** を使用して、Firebase StorageバケットのCORSポリシーを設定します。

1.  [Google Cloud コンソール](https://console.cloud.google.com/)を開き、右上の `>_` アイコンから **Cloud Shell** を起動します。
2.  正しいプロジェクトが選択されていることを確認します。
    ```bash
    gcloud config set project homepage-95581
    ```
3.  `cors.json` という設定ファイルを作成します。
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
          "http://localhost:9002",
          "https://9000-firebase-studio-1766822837262.cluster-fkltigo73ncaixtmokrzxhwsfc.cloudworkstations.dev",
          "https://www.okamomedia.tokyo"
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
4.  作成したCORS設定をバケットに適用します。
    ```bash
    gsutil cors set cors.json gs://homepage-95581.firebasestorage.app
    ```
    (gs:// の後の部分は自分のバケット名に合わせてください)

### 4-3. IAM権限設定 (画像の一般公開)

CORS設定だけでは画像は公開されません。バケット内のオブジェクトを一般公開するためのIAM権限を設定します。

1.  **Cloud Shell** で以下のコマンドを実行します。
    ```bash
    gcloud storage buckets add-iam-policy-binding gs://homepage-95581.firebasestorage.app --member=allUsers --role=roles/storage.objectViewer
    ```
2.  このコマンドにより、バケット内のオブジェクトが公開URLで閲覧可能になります。

---

## 5. サービスアカウントキーの設定 (Admin SDK用)

サーバーサイド（Admin SDK）からFirebaseを操作するためにサービスアカウントキーが必要です。

1.  GCPコンソールの **IAMと管理** > **サービスアカウント** に移動します。
2.  `Firebase Admin SDK` という名前が含まれるサービスアカウント（例: `firebase-adminsdk-...@...`) を選択します。
3.  **キー** > **鍵を追加** > **新しい鍵を作成** をクリックします。
4.  キーのタイプで「**JSON**」を選択して作成すると、キーファイルがダウンロードされます。
5.  ダウンロードしたJSONファイルの内容を**すべてコピー**します。
6.  プロジェクトの `.env` ファイルに、`FIREBASE_SERVICE_ACCOUNT_KEY` という名前で貼り付けます。
    **重要:** JSONの内容は1行にする必要があります。改行は `\n` にエスケープしてください。
    ```env
    FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "...", ... "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n", ...}'
    ```

---

## 6. CLIコマンドの利用

管理者権限の付与やサイト設定の初期化は、以下のnpmスクリプトで行います。

*   **管理者権限の付与:**
    `npm run set-admin -- user@example.com`
*   **管理者権限の削除:**
    `npm run remove-admin -- user@example.com`
*   **サイト設定の初期化:**
    `npm run init-settings`

これらのコマンドは、本番環境では実行できないように保護されています。
