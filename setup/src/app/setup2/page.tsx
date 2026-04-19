"use client";

/** setup2: Stripe + Google OAuth 設定（homepage 管理画面で実施） */
export default function Setup2Page() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          2. Stripe / Google OAuth 設定
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Stripe サンドボックスと Google OAuth の設定は、
          homepage の管理画面から行います。
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium">homepage 管理画面で設定してください</p>
        <p className="mt-2">
          サイトにデプロイ後、管理画面 (<code className="bg-blue-100 px-1 rounded">/admin</code>) にログインして
          以下を設定してください:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>Stripe テスト用 API キー・Webhook Signing Secret</li>
          <li>Google OAuth クライアント ID・クライアントシークレット</li>
        </ul>
        <p className="mt-3 text-xs text-blue-600">
          設定値は AWS Secrets Manager に保存されます。
          ローカル開発用には .env に同じ変数を設定することで、
          Secrets Manager を参照せずサンドボックス環境を使えます。
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">手動で必要な作業:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>Stripe Dashboard で Webhook URL を登録</li>
          <li>Google Cloud Console で OAuth 同意画面を設定</li>
          <li>サンドボックス環境でテスト決済を確認</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        このフェーズは setup1b 完了後に利用可能になります。
      </div>
    </div>
  );
}
