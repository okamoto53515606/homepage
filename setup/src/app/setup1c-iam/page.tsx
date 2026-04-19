"use client";

/** setup1c-iam: IAM ユーザー作成 + root キー無効化案内 — 未実装 */
export default function Setup1cIamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          1c+. IAM ユーザー作成
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          IAM ユーザー <code className="bg-gray-100 px-1 rounded">homepage-deployer</code> を
          自動作成し、.env の AWS キーを差し替えます。
          その後、root アクセスキーの無効化を案内します。
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">このステップで行うこと:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>IAM ユーザー作成 + アクセスキー発行</li>
          <li>.env の AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY を差し替え</li>
          <li>root アクセスキーの無効化案内を表示</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        このフェーズは今後実装されます。
      </div>
    </div>
  );
}
