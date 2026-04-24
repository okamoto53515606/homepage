"use client";

import { useEffect, useState } from "react";

interface DeployResult {
  cloudfrontDomain: string;
  wafMode: string;
  wafAclArn: string;
  envUpdates: Record<string, string>;
  // why: wafMode='none' で過去デプロイ済みの HomepageWafStack を自動破棄したか
  //      をユーザーに通知するためのフラグ（API から返る）。
  wafDestroyed?: boolean;
}

interface Props {
  completed?: boolean;
}

export function Step1bCdk({ completed }: Props) {
  // why: WAF 運用は管理者自身を 403 でロックアウトする事故が起きやすいため、
  //      デフォルトは "none"（WAF なし）。必要に応じて captcha/ip を選択する。
  const [wafMode, setWafMode] = useState<"none" | "ip" | "captcha">("none");
  const [allowedIPs, setAllowedIPs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<DeployResult | null>(null);
  // why: CDN に古い JS chunk や HTML が残るとアプリ更新が反映しないため、
  //      デプロイ直後に /* を invalidate できる UI を提供する。
  const [invalidating, setInvalidating] = useState(false);
  const [invalidateMessage, setInvalidateMessage] = useState("");
  const [invalidateError, setInvalidateError] = useState("");

  // why: InfraStack デプロイ直後の DynamoDB は空のため、/legal/* やログインモーダル
  //      のインライン利用規約が空表示になる。1 クリックで v1 互換のサンプルデータ
  //      を投入できるようにし、初期セットアップ直後の動作確認をスムーズにする。
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedError, setSeedError] = useState("");

  // why: 「過去にデプロイ済み (completed=true) だが今回の表示では result
  //      が未セット」のときも /admin/settings への絶対リンクを出したいため、
  //      .env に保存済みの CLOUDFRONT_DOMAIN を API 経由で取得する。
  const [cloudFrontDomain, setCloudFrontDomain] = useState<string>("");
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/cloudfront-domain", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { domain?: string };
        if (data.domain) setCloudFrontDomain(data.domain);
      } catch {
        // フォールバックは result?.cloudfrontDomain または空文字。
      }
    })();
  }, []);
  const adminSettingsHost = result?.cloudfrontDomain || cloudFrontDomain;
  const adminSettingsUrl = adminSettingsHost
    ? `https://${adminSettingsHost}/admin/settings`
    : "";

  const handleSeedSampleSettings = async () => {
    setSeeding(true);
    setSeedMessage("");
    setSeedError("");
    try {
      const res = await fetch("/api/seed-site-settings", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSeedError(data.error ?? "サンプル投入に失敗しました");
        return;
      }
      setSeedMessage(data.message ?? "サンプル設定を投入しました");
    } catch {
      setSeedError("リクエストに失敗しました");
    } finally {
      setSeeding(false);
    }
  };

  const handleInvalidateCache = async () => {
    setInvalidating(true);
    setInvalidateMessage("");
    setInvalidateError("");
    try {
      const res = await fetch("/api/cloudfront-invalidate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setInvalidateError(data.error ?? "invalidation に失敗しました");
        return;
      }
      setInvalidateMessage(
        `リクエスト済 (ID: ${data.invalidationId})。エッジ伝搬に数分かかります。`,
      );
    } catch {
      setInvalidateError("リクエストに失敗しました");
    } finally {
      setInvalidating(false);
    }
  };

  /**
   * why: WAF IP 制限は IPv4 のみで管理する（CloudFront 側で IPv6 を無効化済み）。
   *      ブラウザの IPv6 優先接続による「自分を 403 する事故」を避けるため、
   *      旧仕様の IPv6 自動取得は削除し IPv4 のみに統一した。
   *
   * endpoint: ipv4.icanhazip.com は A レコードのみ返すため強制的に v4 を得られる。
   */
  const addCidrToField = (ip: string) => {
    setAllowedIPs((prev) => {
      const existing = prev
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      // すでに CIDR 表記でなければ /32 を付与
      const cidr = ip.includes("/") ? ip : `${ip}/32`;
      if (existing.includes(cidr)) return prev;
      return [...existing, cidr].join("\n");
    });
  };

  const handleAutoDetectIPv4 = async () => {
    try {
      const res = await fetch("https://ipv4.icanhazip.com/");
      const ip = (await res.text()).trim();
      if (!ip || ip.includes(":")) throw new Error("IPv4 が取得できませんでした");
      addCidrToField(ip);
    } catch {
      setError("IPv4 アドレスの自動取得に失敗しました。手動で入力してください");
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
          <li>WAF Web ACL（管理画面保護 / WAF なし選択時はスキップ）</li>
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
              value="none"
              checked={wafMode === "none"}
              onChange={() => setWafMode("none")}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                WAF なし（デフォルト）
              </p>
              <p className="text-xs text-gray-500">
                WAF を関連付けません。Cognito 認証のみで管理画面を保護します。
                個人運用や検証環境向け。後から WAF を追加できます。
              </p>
            </div>
          </label>

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
                CAPTCHA チャレンジ
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
                IP アドレス制限（IPv4 のみ）
              </p>
              <p className="text-xs text-gray-500">
                許可した IPv4 のみ管理画面にアクセス可能。固定 IP 環境に最適。
              </p>
            </div>
          </label>
        </div>

        {wafMode === "ip" && (
          <div className="ml-6 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm font-medium text-gray-700">
                許可 IPv4 アドレス（CIDR 形式）:
              </p>
              <button
                type="button"
                onClick={handleAutoDetectIPv4}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                IPv4 を自動入力
              </button>
            </div>
            <textarea
              value={allowedIPs}
              onChange={(e) => setAllowedIPs(e.target.value)}
              placeholder={"1.2.3.4/32"}
              rows={4}
              className="w-full text-sm font-mono border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500">
              1 行に 1 つ入力。単一 IP は /32 を付与。CloudFront を IPv4 限定運用に
              しているため IPv6 アドレスは登録不要（入力されても無視されます）。
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
            <p>
              {result.wafMode === "ip"
                ? "IP アドレス制限（IPv4）"
                : result.wafMode === "captcha"
                  ? "CAPTCHA チャレンジ"
                  : "WAF なし"}
            </p>
            {result.wafDestroyed && (
              <p className="mt-1 text-xs text-green-700">
                ✓ 既存の HomepageWafStack を自動削除しました（料金発生を防止）
              </p>
            )}
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

      {/* why: 初回セットアップで /legal/* やログインモーダルの利用規約が空表示になる
              問題を 1 クリックで解消するためのダミー投入。CDN キャッシュ削除より
              先に実施した方が手戻りが少ないため、こちらを上に配置する。 */}
      {(result || completed) && (
        <div className="border border-sky-200 bg-sky-50 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-medium text-sky-900">サンプルサイト設定の投入</p>
          <p className="text-xs text-sky-800">
            初回セットアップでは <code>homepage-settings</code> テーブルが空のため、
            <code>/legal/*</code> ページやログインモーダル内の利用規約がうまく表示されません。
            このボタンで v1 互換のダミー設定（サイト名・特商法表記・プライバシーポリシー・利用規約）を投入します。
            既にレコードがある場合は何もせず、管理画面{" "}
            {adminSettingsUrl ? (
              <a
                href={adminSettingsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 underline"
              >
                <code>/admin/settings</code>
              </a>
            ) : (
              <code>/admin/settings</code>
            )}{" "}
            での編集を促します。
          </p>
          <button
            type="button"
            onClick={handleSeedSampleSettings}
            disabled={seeding}
            className="bg-sky-600 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-sky-700 disabled:opacity-50"
          >
            {seeding ? "投入中..." : "サンプルサイト設定を追加"}
          </button>
          {seedMessage && (
            <p className="text-xs text-green-700">{seedMessage}</p>
          )}
          {seedError && <p className="text-xs text-red-700">{seedError}</p>}
        </div>
      )}

      {/* why: デプロイ済みサイトの管理画面 (/admin) を別タブで開きたいケースが多いため、
              サンプル投入とキャッシュ削除の間に明示的な導線を置く。CloudFront ドメイン
              未取得の場合（.env 未保存等）はボタンを非活性にして誤動作を避ける。 */}
      {(result || completed) && (
        <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-medium text-indigo-900">管理画面を開く</p>
          <p className="text-xs text-indigo-800">
            サイト設定・記事管理・タグ管理などはデプロイ済みサイトの
            <code> /admin</code> で行います。別タブで開きます。
          </p>
          {adminSettingsHost ? (
            <a
              href={`https://${adminSettingsHost}/admin`}
              target="_blank"
              rel="noreferrer"
              className="inline-block bg-indigo-600 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-indigo-700"
            >
              管理画面を開く（/admin）
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="bg-indigo-600 text-white py-1.5 px-3 rounded text-xs font-medium opacity-50 cursor-not-allowed"
            >
              CloudFront ドメイン取得中...
            </button>
          )}
        </div>
      )}

      {/* why: CDN キャッシュ削除は再デプロイ後の反映用なので、初期投入系の操作より
              後（一番下）に配置する。 */}
      {(result || completed) && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-medium text-amber-900">CDN キャッシュ削除</p>
          <p className="text-xs text-amber-800">
            アプリを修正し再デプロイした後、CloudFront のキャッシュにより更新が反映されないことがあります。
            このボタンで <code>/*</code> を invalidate します（エッジ伝搬に数分）。
          </p>
          <button
            type="button"
            onClick={handleInvalidateCache}
            disabled={invalidating}
            className="bg-amber-600 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {invalidating ? "invalidation リクエスト中..." : "CDN キャッシュを削除 (/*)"}
          </button>
          {invalidateMessage && (
            <p className="text-xs text-green-700">{invalidateMessage}</p>
          )}
          {invalidateError && (
            <p className="text-xs text-red-700">{invalidateError}</p>
          )}
        </div>
      )}
    </div>
  );
}
