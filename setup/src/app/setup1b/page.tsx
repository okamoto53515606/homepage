"use client";

/** setup1b: サイト公開（CloudFront + Lambda + DynamoDB） — 未実装 */
export default function Setup1bPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          1b. サイト公開
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          CloudFront + Lambda + DynamoDB + S3 でサイトを公開します。
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">作成されるリソース:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>CloudFront ディストリビューション</li>
          <li>Lambda (Next.js + Web Adapter)</li>
          <li>ECR リポジトリ</li>
          <li>S3 バケット（メディア + 静的ファイル）</li>
          <li>DynamoDB テーブル群</li>
          <li>WAF Web ACL（IP 制限）</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        このフェーズは今後実装されます。
      </div>
    </div>
  );
}
