"use client";

import { useEffect, useState } from "react";

/** setup2a: Stripe サンドボックス設定（homepage 管理画面で実施） */
export default function Setup2aPage() {
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // why: setup1b の CDK デプロイで作成された Stripe Webhook Proxy Lambda の
    //      Function URL を .env から取得して表示する。Stripe は OAC 経由 POST に
    //      x-amz-content-sha256 を付与できないため CloudFront 直ではなくこの
    //      Proxy URL を Stripe Dashboard に登録する必要がある（blueprint §3.6）。
    fetch("/api/stripe-webhook-url")
      .then((r) => r.json())
      .then((j) => setWebhookUrl(j.url ?? ""))
      .catch(() => setWebhookUrl(""));
  }, []);

  const handleCopy = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          2a. Stripe サンドボックス設定
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Stripe サンドボックスの設定は、
          homepage の管理画面から行います。
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium">homepage 管理画面で設定してください</p>
        <p className="mt-2">
          管理画面 (<code className="bg-blue-100 px-1 rounded">/admin</code>) にログインして
          以下を設定してください:
        </p>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>Stripe テスト用 API キー・Webhook Signing Secret</li>
        </ul>
        <p className="mt-3 text-xs text-blue-600">
          設定値は AWS Secrets Manager に保存されます。
          ローカル開発用には .env に同じ変数を設定することで、
          Secrets Manager を参照せずサンドボックス環境を使えます。
        </p>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-emerald-900">
          Stripe Dashboard に登録する Webhook URL
        </p>
        <p className="mt-2 text-xs text-emerald-800">
          Stripe は CloudFront OAC 経由 POST に署名ヘッダを付けられないため、専用の
          Proxy Lambda Function URL を Webhook 先として Stripe Dashboard に登録してください。
          Stripe 署名検証は Next.js 側で行うため、Proxy は素通しで安全です。
        </p>
        {webhookUrl ? (
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 bg-white border border-emerald-200 rounded px-2 py-1 text-xs font-mono break-all">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs px-3 py-1 border border-emerald-300 rounded hover:bg-emerald-100"
            >
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-emerald-700">
            まだ URL が取得できていません。setup1b の CDK デプロイを完了させてから
            このページを再読み込みしてください。
          </p>
        )}
        <p className="mt-3 text-xs text-emerald-700">
          Stripe Dashboard &gt; Developers &gt; Webhooks &gt; エンドポイントを追加
          <br />
          監視するイベント: <code>checkout.session.completed</code> 等（アプリ側の実装に合わせて選択）
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">手動で必要な作業:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>上記 Webhook URL を Stripe Dashboard に登録</li>
          <li>サンドボックス環境でテスト決済を確認</li>
        </ul>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        このフェーズは setup1c 完了後に利用可能になります。
      </div>
    </div>
  );
}
