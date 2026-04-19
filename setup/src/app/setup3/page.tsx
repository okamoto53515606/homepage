"use client";

/** setup3: Stripe 本番化（homepage 管理画面で実施） */
export default function Setup3Page() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          3. Stripe 本番化
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Stripe の本番用 API キーに切り替えます。
          homepage の管理画面から設定します。
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium">homepage 管理画面で設定してください</p>
        <p className="mt-2">
          管理画面 (<code className="bg-blue-100 px-1 rounded">/admin</code>) にログインして
          以下を設定してください:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>Stripe 本番用 API キーに差し替え</li>
          <li>Stripe 本番用 Webhook Signing Secret に差し替え</li>
        </ul>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">手動で必要な作業:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>Stripe Dashboard で本番 Webhook URL を登録</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        このフェーズは setup2b 完了後に利用可能になります。
      </div>
    </div>
  );
}
