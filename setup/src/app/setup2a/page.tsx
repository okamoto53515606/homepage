"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** setup2a: Stripe サンドボックス設定（homepage 管理画面で実施） */
export default function Setup2aPage() {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  // why: チェック状態は setup-state.json に永続化（リロード後も保持）。
  const [checked, setChecked] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // why: setup1b の CDK デプロイで作成された Stripe Webhook Proxy Lambda の
    //      Function URL を .env から取得して表示する。Stripe は OAC 経由 POST に
    //      x-amz-content-sha256 を付与できないため CloudFront 直ではなくこの
    //      Proxy URL を Stripe Dashboard に登録する必要がある（blueprint §3.6）。
    fetch("/api/stripe-webhook-url")
      .then((r) => r.json())
      .then((j) => setWebhookUrl(j.url ?? ""))
      .catch(() => setWebhookUrl(""));

    // 永続化されたチェック状態を復元
    fetch("/api/phase-check?phaseId=setup2a", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { checks?: Record<string, boolean> } | null) => {
        if (data?.checks?.completed) setChecked(true);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const handleCopy = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function persistChecked(value: boolean) {
    setChecked(value);
    try {
      await fetch("/api/phase-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: "setup2a", key: "completed", value }),
      });
    } catch {
      // 永続化失敗は致命的でないので握りつぶす
    }
  }

  async function handleComplete() {
    if (!checked) return;
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch("/api/complete-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: "setup2a" }),
      });
      if (!res.ok) throw new Error("完了処理に失敗しました");
      router.push("/setup2b");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setCompleting(false);
    }
  }

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

      {/* ── 完了チェックボックス ──────────────────────── */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => void persistChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          />
          <span className="text-sm text-gray-800 font-medium">
            Stripe サンドボックスのキー登録と Webhook URL 登録を完了しました
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleComplete}
          disabled={!checked || completing}
          className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors
            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
            enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
        >
          {completing ? "処理中..." : "次のステップへ進む"}
        </button>
      </div>
    </div>
  );
}
