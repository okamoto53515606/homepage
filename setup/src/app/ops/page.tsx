"use client";

/**
 * 運用メニュー（便利メニュー）
 *
 * why:
 *   setup1b は「初回セットアップ用」に動作確定済み。運用フェーズで再実行すると
 *   独自ドメイン (CLOUDFRONT_DOMAIN) や Cognito Callback URL が default
 *   CloudFront ドメインで巻き戻る副作用がある。本ページは独自ドメイン関連には
 *   一切触れずに、よく使う運用操作だけを提供する。
 *
 *   - アプリ再デプロイ: コード/CDK 変更を反映する
 *   - WAF 構成変更: 自分を 403 で締め出した・許可 IP を増やしたい
 *   - Lambda env 同期: .env を手書きしたあとのドリフト解消
 *
 *   ドメイン切替は setup2b の「ドメイン書換 (domain-rewrite-all)」で行う。
 */

import { useState } from "react";

interface JsonResult {
  success?: boolean;
  message?: string;
  error?: string;
  details?: string;
  [k: string]: unknown;
}

function ResultBlock({ result }: { result: JsonResult | null }) {
  if (!result) return null;
  const ok = !!result.success;
  return (
    <div
      className={`mt-3 rounded-md border p-3 text-sm ${
        ok
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-800"
      }`}
    >
      <p className="font-medium">{ok ? "成功" : result.error ?? "失敗"}</p>
      {result.message && <p className="mt-1">{result.message}</p>}
      {result.details && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-xs">
          {result.details}
        </pre>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs opacity-70">
          詳細 (JSON)
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function OpsPage() {
  const [redeployLoading, setRedeployLoading] = useState(false);
  const [redeployResult, setRedeployResult] = useState<JsonResult | null>(null);

  const [wafMode, setWafMode] = useState<"none" | "ip" | "captcha">("none");
  const [allowedIPs, setAllowedIPs] = useState("");
  const [wafLoading, setWafLoading] = useState(false);
  const [wafResult, setWafResult] = useState<JsonResult | null>(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<JsonResult | null>(null);

  const [invalidateLoading, setInvalidateLoading] = useState(false);
  const [invalidateResult, setInvalidateResult] = useState<JsonResult | null>(
    null,
  );

  const handleRedeploy = async () => {
    if (!confirm("アプリコードを更新します（数分、ゼロダウンタイム）。続行しますか？")) return;
    setRedeployLoading(true);
    setRedeployResult(null);
    try {
      const res = await fetch("/api/ops/redeploy-app", { method: "POST" });
      setRedeployResult(await res.json());
    } catch {
      setRedeployResult({ error: "リクエストに失敗しました" });
    } finally {
      setRedeployLoading(false);
    }
  };

  const handleUpdateWaf = async () => {
    const parsed = allowedIPs
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (wafMode === "ip" && parsed.length === 0) {
      alert("IP 制限モードでは許可 IPv4 を 1 つ以上入力してください");
      return;
    }
    if (
      !confirm(
        `WAF 構成を ${wafMode} に変更します（3〜10 分）。続行しますか？`,
      )
    ) {
      return;
    }
    setWafLoading(true);
    setWafResult(null);
    try {
      const res = await fetch("/api/ops/update-waf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wafMode, allowedIPs: parsed }),
      });
      setWafResult(await res.json());
    } catch {
      setWafResult({ error: "リクエストに失敗しました" });
    } finally {
      setWafLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/ops/sync-lambda-env", { method: "POST" });
      setSyncResult(await res.json());
    } catch {
      setSyncResult({ error: "リクエストに失敗しました" });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleInvalidate = async () => {
    if (!confirm("CloudFront の /* を invalidate します。続行しますか？")) return;
    setInvalidateLoading(true);
    setInvalidateResult(null);
    try {
      const res = await fetch("/api/cloudfront-invalidate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setInvalidateResult({
          error: data.error ?? "invalidation に失敗しました",
          ...data,
        });
      } else {
        setInvalidateResult({
          success: true,
          message: `リクエスト済 (ID: ${data.invalidationId})。エッジ伝搬に数分かかります。`,
          ...data,
        });
      }
    } catch {
      setInvalidateResult({ error: "リクエストに失敗しました" });
    } finally {
      setInvalidateLoading(false);
    }
  };

  const handleAutoDetectIPv4 = async () => {
    try {
      const res = await fetch("https://ipv4.icanhazip.com/");
      const ip = (await res.text()).trim();
      if (!ip || ip.includes(":")) throw new Error();
      setAllowedIPs((prev) => {
        const list = prev
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const cidr = ip.includes("/") ? ip : `${ip}/32`;
        if (list.includes(cidr)) return prev;
        return [...list, cidr].join("\n");
      });
    } catch {
      alert("IPv4 の自動取得に失敗しました");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">運用メニュー</h2>
        <p className="mt-1 text-sm text-gray-600">
          独自ドメイン関連 (CLOUDFRONT_DOMAIN / Cognito Callback URL) には触れない、
          安全な運用操作だけを提供します。ドメイン切替は{" "}
          <a className="text-blue-600 underline" href="/setup2b">
            setup2b
          </a>{" "}
          で行ってください。
        </p>
      </div>

      {/* アプリコード更新 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="font-medium text-gray-800">アプリコード更新（高速）</h3>
        <p className="text-xs text-gray-600">
          Docker build → ECR push → <code>UpdateFunctionCode</code> だけを実行します。
          CloudFront / DynamoDB / IAM / Function URL は一切触らず、独自ドメインと WAF は保護されます。
          所要時間は数分、Lambda 更新は atomic なのでサービス影響はありません。
          <br />
          ※ スキーマ変更（DynamoDB GSI 追加・新 Lambda・IAM 変更）は CDK 経由が必要。
        </p>
        <button
          onClick={handleRedeploy}
          disabled={redeployLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {redeployLoading ? "実行中..." : "アプリコードを更新"}
        </button>
        <ResultBlock result={redeployResult} />
      </section>

      {/* WAF 変更 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="font-medium text-gray-800">WAF 構成変更</h3>
        <p className="text-xs text-gray-600">
          CloudFront の <code>WebACLId</code> だけを差し替える SDK 直叩き方式。
          alias / ViewerCertificate は一切触りません。IPSet/WebACL の中身は
          HomepageWafStack で管理します。
        </p>

        <div className="space-y-2">
          {(
            [
              ["none", "WAF なし", "WebACL を関連付けない（料金抑止のため Stack も削除）"],
              ["captcha", "CAPTCHA", "管理画面アクセス時に CAPTCHA を表示"],
              ["ip", "IP 制限", "指定 IPv4 のみ管理画面にアクセス可能"],
            ] as const
          ).map(([mode, label, desc]) => (
            <label
              key={mode}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="opsWafMode"
                value={mode}
                checked={wafMode === mode}
                onChange={() => setWafMode(mode)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </label>
          ))}
        </div>

        {wafMode === "ip" && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                許可 IPv4 (CIDR):
              </span>
              <button
                type="button"
                onClick={handleAutoDetectIPv4}
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                IPv4 を自動入力
              </button>
            </div>
            <textarea
              value={allowedIPs}
              onChange={(e) => setAllowedIPs(e.target.value)}
              placeholder="1.2.3.4/32"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            />
          </div>
        )}

        <button
          onClick={handleUpdateWaf}
          disabled={wafLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {wafLoading ? "実行中..." : "WAF 構成を更新"}
        </button>
        <ResultBlock result={wafResult} />
      </section>

      {/* Lambda env 同期 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="font-medium text-gray-800">Lambda env 同期</h3>
        <p className="text-xs text-gray-600">
          .env の安全キー（CLOUDFRONT_DEFAULT_DOMAIN / CLOUDFRONT_DISTRIBUTION_ID /
          S3_BUCKET_NAME / STRIPE_WEBHOOK_PROXY_URL）を homepage-app と
          homepage-stripe-webhook-proxy に push します。
          <br />
          ※ CLOUDFRONT_DOMAIN（独自ドメイン）は対象外です。
        </p>
        <button
          onClick={handleSync}
          disabled={syncLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {syncLoading ? "実行中..." : "同期実行"}
        </button>
        <ResultBlock result={syncResult} />
      </section>

      {/* CDN キャッシュ削除 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="font-medium text-gray-800">CDN キャッシュ削除</h3>
        <p className="text-xs text-gray-600">
          CloudFront の <code>/*</code> を invalidate します。アプリを再デプロイしたあと
          古い JS chunk や HTML が CDN に残って反映されないときに使います（エッジ伝搬に数分）。
        </p>
        <button
          onClick={handleInvalidate}
          disabled={invalidateLoading}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {invalidateLoading ? "リクエスト中..." : "CDN キャッシュを削除 (/*)"}
        </button>
        <ResultBlock result={invalidateResult} />
      </section>
    </div>
  );
}
