"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** setup1c: Google OAuth・Gemini API キー設定（homepage 管理画面で実施） */
export default function Setup1cPage() {
  const router = useRouter();
  const [cloudFrontDomain, setCloudFrontDomain] = useState("xxx.cloudfront.net");
  const redirectUri = `https://${cloudFrontDomain}/api/auth/callback/google`;
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCloudFrontDomain() {
      try {
        const res = await fetch("/api/cloudfront-domain", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { domain?: string };
        if (data.domain) setCloudFrontDomain(data.domain);
      } catch {
        // フォールバック値を使う
      }
    }
    // why: チェック状態を setup-state.json から復元（リロードしても保持）
    async function loadPersistedChecks() {
      try {
        const res = await fetch("/api/phase-check?phaseId=setup1c", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { checks?: Record<string, boolean> };
        if (data.checks?.completed) setChecked(true);
      } catch {
        // ignore
      }
    }
    void loadCloudFrontDomain();
    void loadPersistedChecks();
  }, []);

  async function persistChecked(value: boolean) {
    setChecked(value);
    try {
      await fetch("/api/phase-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: "setup1c", key: "completed", value }),
      });
    } catch {
      // 永続化失敗は致命的でないので握りつぶす
    }
  }

  async function handleComplete() {
    if (!checked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/complete-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: "setup1c" }),
      });
      if (!res.ok) throw new Error("完了処理に失敗しました");
      router.push("/setup1c-iam");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          1c. Google OAuth・Gemini API キー設定
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Google OAuth と Gemini API キーの設定は、homepage の管理画面から行います。
          設定完了後、Google ログイン・コメント投稿・AI 記事生成が利用可能になります。
        </p>
      </div>

      {/* ── Google OAuth ─────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2">
          <p className="font-semibold text-gray-800 text-sm">① Google OAuth クライアントの取得</p>
        </div>
        <div className="p-4 space-y-3 text-sm text-gray-700">
          <ol className="list-decimal list-inside space-y-2">
            <li>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Google Cloud Console（認証情報）
              </a>{" "}
              にアクセスし、Googleアカウントでログインします。
            </li>
            <li>「+ 認証情報を作成」→「OAuth クライアント ID」をクリックします。</li>
            <li>アプリケーションの種類を「ウェブ アプリケーション」に設定します。</li>
            <li>
              承認済みのリダイレクト URI に以下を追加します:
              <code className="block mt-1 bg-gray-100 px-2 py-1 rounded text-xs">
                {redirectUri}
              </code>
            </li>
            <li>作成後、<strong>クライアント ID</strong> と <strong>クライアントシークレット</strong> をコピーします。</li>
          </ol>
        </div>
        <div className="bg-blue-50 border-t border-blue-200 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">homepage 管理画面 &gt; サイト設定 で登録してください</p>
          <p className="mt-1">
            管理画面 (
            <a
              href={`https://${cloudFrontDomain}/admin/settings`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 underline"
            >
              <code className="bg-blue-100 px-1 rounded">/admin/settings</code>
            </a>
            ) にログインして以下を入力・保存してください:
          </p>
          <ul className="mt-1 list-disc list-inside space-y-1">
            <li>Google OAuth クライアント ID</li>
            <li>Google OAuth クライアントシークレット</li>
          </ul>
          <p className="mt-2 text-xs text-blue-600">
            設定値は AWS Secrets Manager（homepage/google-oauth-config）に保存されます。
          </p>
        </div>
      </div>

      {/* ── Gemini API キー ───────────────────────────── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2">
          <p className="font-semibold text-gray-800 text-sm">② Gemini API キーの取得</p>
        </div>
        <div className="p-4 space-y-3 text-sm text-gray-700">
          <ol className="list-decimal list-inside space-y-2">
            <li>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Google AI Studio
              </a>{" "}
              にアクセスし、Google アカウント（Gmail）でログインします。
            </li>
            <li>画面左側のメニューにある「Get API key」をクリックします。</li>
            <li>
              「Create API key in new project」をクリックして新しいプロジェクトで API キーを作成します。
              <span className="text-gray-500">（既存の GCP プロジェクトがある場合はそれを選択することも可能）</span>
            </li>
            <li>生成された <strong>API キー</strong> をコピーします。</li>
          </ol>
        </div>
        <div className="bg-blue-50 border-t border-blue-200 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">homepage 管理画面 &gt; サイト設定 で登録してください</p>
          <p className="mt-1">
            管理画面 (
            <a
              href={`https://${cloudFrontDomain}/admin/settings`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 underline"
            >
              <code className="bg-blue-100 px-1 rounded">/admin/settings</code>
            </a>
            ) にログインして以下を入力・保存してください:
          </p>
          <ul className="mt-1 list-disc list-inside space-y-1">
            <li>Gemini API キー</li>
          </ul>
          <p className="mt-2 text-xs text-blue-600">
            設定値は AWS Secrets Manager（homepage/gemini-config）に保存されます。
          </p>
        </div>
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
            登録完了しました（Google OAuth クライアント・Gemini API キーを管理画面で保存しました）
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
          🎉 おつかれさまでした！これで（決済機能と独自ドメインを除いて）システムが利用可能になりました。
        </div>

        <button
          onClick={handleComplete}
          disabled={!checked || loading}
          className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors
            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
            enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
        >
          {loading ? "処理中..." : "次のステップへ進む"}
        </button>
      </div>
    </div>
  );
}
