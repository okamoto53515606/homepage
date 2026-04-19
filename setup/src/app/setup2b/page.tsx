"use client";

/** setup2b: 独自ドメインの設定 — 未実装 */
export default function Setup2bPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          2b. 独自ドメイン設定
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          ACM 証明書の発行、CloudFront の Alternate Domain 設定、
          Route 53 のレコード作成を行います。
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">作成されるリソース:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>ACM 証明書（SSL/TLS）</li>
          <li>Route 53 DNS レコード</li>
          <li>CloudFront Alternate Domain 設定</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        このフェーズは今後実装されます。
      </div>
    </div>
  );
}
