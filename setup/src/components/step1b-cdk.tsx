"use client";

import { useState } from "react";

interface DeployResult {
  cloudfrontDomain: string;
  wafMode: string;
  wafAclArn: string;
  envUpdates: Record<string, string>;
}

interface Props {
  completed?: boolean;
}

export function Step1bCdk({ completed }: Props) {
  const [wafMode, setWafMode] = useState<"ip" | "captcha">("captcha");
  const [allowedIPs, setAllowedIPs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<DeployResult | null>(null);

  const handleAutoDetectIP = async () => {
    try {
      const res = await fetch("https://checkip.amazonaws.com/");
      const ip = (await res.text()).trim();
      setAllowedIPs((prev) => {
        const existing = prev
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const cidr = ip.includes("/") ? ip : `${ip}/32`;
        if (existing.includes(cidr)) return prev;
        return [...existing, cidr].join("\n");
      });
    } catch {
      setError("IP アドレスの自動取得に失敗しました。手動で入力してください");
    }
  };

  const handleDeploy = async () => {
    setLoading(true);
    setError("");
    setDetails("");

    const parsedIPs = allowedIPs
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/cdk-deploy-1b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wafMode, allowedIPs: parsedIPs }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "デプロイに失敗しました");
        if (data.details) setDetails(data.details);
        return;
      }

      setResult(data);
    } catch {
      setError("リクエストに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          Step 1b — サイト公開（CDK デプロイ）
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          AWS リソースを作成し、サイトを CloudFront ドメインで公開します。
          Docker ビルドを含むため 30〜60 分かかる場合があります。
        </p>
      </div>

      {completed && !result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          ✓ setup1b デプロイ済み
        </div>
      )}

      {/* 作成されるリソース */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-gray-700">作成されるリソース:</p>
        <ul className="mt-2 list-disc list-inside space-y-1 text-gray-600">
          <li>DynamoDB テーブル群（articles, users, comments, payments, jobs, settings, article-tags）</li>
          <li>S3 バケット（メディアファイル用）</li>
          <li>Lambda（Next.js アプリ、Docker コンテナ）</li>
          <li>CloudFront ディストリビューション（サイト公開 + S3 メディア配信）</li>
          <li>Secrets Manager（Google OAuth / Stripe 設定用プレースホルダー）</li>
          <li>WAF Web ACL（管理画面保護）</li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          ⚠️ Docker が起動していることを確認してください（Lambda イメージのビルドに必要）
        </p>
      </div>

      {/* WAF 設定 */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <p className="text-sm font-medium text-gray-700">
          管理画面（/admin）の保護方式を選択:
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="wafMode"
              value="captcha"
              checked={wafMode === "captcha"}
              onChange={() => setWafMode("captcha")}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                CAPTCHA チャレンジ（推奨）
              </p>
              <p className="text-xs text-gray-500">
                管理画面アクセス時に CAPTCHA を表示。IP アドレスが変わっても対応可。
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="wafMode"
              value="ip"
              checked={wafMode === "ip"}
              onChange={() => setWafMode("ip")}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                IP アドレス制限
              </p>
              <p className="text-xs text-gray-500">
                許可した IP のみ管理画面にアクセス可能。固定 IP 環境に最適。
                後から変更できます（便利メニュー参照）。
              </p>
            </div>
          </label>
        </div>

        {wafMode === "ip" && (
          <div className="ml-6 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-700">
                許可 IP アドレス（CIDR 形式）:
              </p>
              <button
                type="button"
                onClick={handleAutoDetectIP}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                現在の IP を自動入力
              </button>
            </div>
            <textarea
              value={allowedIPs}
              onChange={(e) => setAllowedIPs(e.target.value)}
              placeholder={"1.2.3.4/32\n5.6.7.8/32"}
              rows={4}
              className="w-full text-sm font-mono border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500">
              1 行に 1 つ入力。/32 で単一 IP、/24 でサブネット指定。
            </p>
          </div>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          <p className="font-medium">{error}</p>
          {details && (
            <pre className="mt-2 text-xs whitespace-pre-wrap overflow-auto max-h-64 bg-red-100 p-2 rounded">
              {details}
            </pre>
          )}
        </div>
      )}

      {/* 成功表示 */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 space-y-3">
          <p className="font-medium">✓ デプロイ完了！</p>
          <div>
            <p className="font-medium">サイト URL（CloudFront）:</p>
            <a
              href={`https://${result.cloudfrontDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline break-all"
            >
              https://{result.cloudfrontDomain}
            </a>
          </div>
          <div>
            <p className="font-medium">WAF モード:</p>
            <p>{result.wafMode === "ip" ? "IP アドレス制限" : "CAPTCHA チャレンジ"}</p>
          </div>
          <div>
            <p className="font-medium">.env に書き込まれた値:</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs font-mono">
              {Object.entries(result.envUpdates).map(([key, value]) => (
                <li key={key}>
                  {key}={" "}
                  <span className="bg-green-100 px-1 rounded">
                    {value.length > 60 ? `${value.slice(0, 60)}...` : value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-green-100 rounded p-2 text-xs">
            <p className="font-medium">次のステップ:</p>
            <p>
              Cognito コールバック URL に CloudFront ドメインが自動追加されました。
              次は Step 1c で Google OAuth を設定します。
            </p>
          </div>
        </div>
      )}

      {/* デプロイボタン */}
      {!result && (
        <button
          onClick={handleDeploy}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? "CDK デプロイ実行中（Docker ビルドを含むため長時間かかります）..."
            : "CDK デプロイを実行（サイト公開）"}
        </button>
      )}

      {loading && (
        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>⏳ Docker イメージのビルド + AWS リソース作成中...</p>
          <p>ブラウザのタブを閉じずにお待ちください。</p>
        </div>
      )}
    </div>
  );
}
