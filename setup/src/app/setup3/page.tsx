"use client";

/**
 * setup3: Stripe 本番化
 *
 * why:
 *   Stripe 本番（live）キーへの切替は単に管理画面でキーを差し替えるだけでなく、
 *   Stripe 側の「アカウント有効化（審査）」を通す必要がある。審査では特商法/
 *   プライバシーポリシー/利用規約ページの整備、事業用住所/電話番号、本人確認、
 *   銀行口座などが確認される。setup2 系と異なり「外部での作業 → 結果待ち」が
 *   多いため、TODO リスト型 UI で抜け漏れを防ぐ。
 *
 *   特商法等の編集 UI は setup1b 完了時点で /admin > サイト設定 から既に利用可能。
 *   このページではどの項目を埋めるべきかを一覧化し、最後に最終チェックを 1 個だけ
 *   置く（setup2a と同じパターン）。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Setup3Page() {
  const router = useRouter();
  const [cloudFrontDomain, setCloudFrontDomain] = useState<string>("");
  const [webhookProxyUrl, setWebhookProxyUrl] = useState<string>("");
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [checked, setChecked] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cloudfront-domain", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { domain?: string } | null) => {
        if (j?.domain) setCloudFrontDomain(j.domain);
      })
      .catch(() => {});

    // why: 本番 Stripe Webhook は CloudFront OAC を通せないため (POST に
    //      x-amz-content-sha256 を付けられず 403)、setup1b で作成済みの
    //      Proxy Lambda Function URL (.env: STRIPE_WEBHOOK_PROXY_URL) を
    //      Stripe Dashboard に設定させる。setup2a と同じ API を使用。
    fetch("/api/stripe-webhook-url", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { url?: string } | null) => {
        if (j?.url) setWebhookProxyUrl(j.url);
      })
      .catch(() => {});

    fetch("/api/phase-check?phaseId=setup3", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { checks?: Record<string, boolean> } | null) => {
        if (data?.checks?.completed) setChecked(true);
      })
      .catch(() => {});
  }, []);

  async function persistChecked(value: boolean) {
    setChecked(value);
    try {
      await fetch("/api/phase-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: "setup3", key: "completed", value }),
      });
    } catch {
      /* 永続化失敗は致命的でないので握りつぶす */
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
        body: JSON.stringify({ phaseId: "setup3" }),
      });
      if (!res.ok) throw new Error("完了処理に失敗しました");
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setCompleting(false);
    }
  }

  const adminUrl = cloudFrontDomain
    ? `https://${cloudFrontDomain}/admin`
    : "/admin";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          3. Stripe 本番化
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Stripe を本番（live）キーに切り替えて実際の課金を受け付ける状態にします。
          Stripe 側の<strong>アカウント有効化（審査）</strong>が必要なため、
          審査で確認される事業者情報・法的ページ・本人確認の準備から進めます。
        </p>
      </div>

      {/* 全体の流れ */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
        <p className="font-semibold">📋 全体の流れ（TODO）</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>事業用の電話番号・住所・銀行口座を準備する</li>
          <li>管理画面のサイト設定で特商法 / プライバシー / 利用規約を整備</li>
          <li>Google OAuth 同意画面（ブランディング）を本番用に登録 + 確認</li>
          <li>Stripe Dashboard でアカウント有効化を申請</li>
          <li>Stripe 審査結果を待つ（標準 1〜3 営業日）</li>
          <li>本番環境で Webhook / 税率 / 3DS / 領収書メールを設定</li>
          <li>本番キー（sk_live_ / whsec_ / txr_）を管理画面に登録</li>
          <li>Web ブラウザから実カードで動作確認</li>
        </ol>
      </div>

      {/* §1 事業者情報の準備 */}
      <Section num="①" title="事業用の電話番号・住所・銀行口座を準備する">
        <p>
          特定商取引法（特商法）により、事業者の氏名・住所・電話番号の表示が義務付けられています。
          自宅情報を公開したくない場合は以下のような代替サービスが利用できます。
        </p>
        <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
          <li>
            事業用電話番号: IP 電話サービス（例: My 050 ／
            <a
              href="https://www.brastel.com/my050/jpn/"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline ml-1"
            >
              brastel.com/my050
            </a>
            ）
          </li>
          <li>
            事業用住所: バーチャルオフィス（例: DMM バーチャルオフィス ／
            <a
              href="https://virtualoffice.dmm.com/"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline ml-1"
            >
              virtualoffice.dmm.com
            </a>
            ）
          </li>
          <li>本人確認書類（マイナンバーカード等）と振込先銀行口座情報を手元に用意</li>
        </ul>
        <p className="text-xs text-amber-700">
          ※ 本人確認は数日〜1 週間かかることがあるので、Stripe 申請前に余裕をもって準備してください。
        </p>
      </Section>

      {/* §2 法的ページ */}
      <Section num="②" title="法的ページを管理画面で整備する">
        <p>
          管理画面（
          <a
            href={adminUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            <code className="bg-gray-100 px-1 rounded">{adminUrl}</code>
          </a>
          ）の<strong>「サイト設定」</strong>で以下 3 ページを完成させます。
          <span className="text-amber-700">
            ※ 不備があると Stripe 審査で否認・遅延の原因になります。
          </span>
        </p>
        <div className="text-xs text-gray-700">
          <p className="font-semibold mt-2">特定商取引法に基づく表記</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>販売業者: 氏名または屋号</li>
            <li>所在地: 事業用住所（バーチャルオフィス可）</li>
            <li>電話番号: 事業用電話番号（IP 電話可）</li>
            <li>メールアドレス: 連絡可能なアドレス</li>
            <li>支払方法: クレジットカード ／ 支払時期: 購入時即時決済</li>
            <li>商品引渡時期: 購入完了後即時閲覧可</li>
            <li>返品・交換: デジタルコンテンツのため返品不可</li>
          </ul>
          <p className="font-semibold mt-2">プライバシーポリシー / ご利用規約</p>
          <p>デフォルト文面を確認し、サイト固有の内容に調整して保存。</p>
        </div>
      </Section>

      {/* §3 Google OAuth Branding */}
      <Section num="③" title="Google OAuth 同意画面（ブランディング）を本番用に登録">
        <p>
          GCP コンソール（
          <a
            href="https://console.cloud.google.com/apis/credentials/consent"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            APIs &amp; Services → OAuth 同意画面 / ブランディング
          </a>
          ）で、本番ドメイン情報に更新します。
        </p>
        <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
          <li>アプリ名 / ユーザーサポートメール / アプリのロゴ（任意）</li>
          <li>アプリのホームページ URL = 本番サイト URL</li>
          <li>プライバシーポリシー URL / 利用規約 URL = 上記 ② で公開した URL</li>
        </ul>
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          ⚠ 「保存」だけでは審査開始されません。画面右上の
          <strong>「ブランディングの確認」</strong>
          ボタンを必ず押してください（押し忘れによる審査遅延が頻発するポイント）。
        </div>
      </Section>

      {/* §4 Stripe 本番申請 */}
      <Section num="④" title="Stripe Dashboard でアカウント有効化を申請">
        <p>
          <a
            href="https://dashboard.stripe.com/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            Stripe Dashboard
          </a>{" "}
          にログイン →「本番環境の有効化」を開始。
          詳細は{" "}
          <a
            href="https://docs.stripe.com/get-started/account/activate?locale=ja-JP"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            公式: アカウント有効化
          </a>
          。
        </p>
        <div className="text-xs text-gray-700 space-y-1">
          <p className="font-semibold">入力項目</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>ビジネスの種類: 個人 / 個人事業主</li>
            <li>業種・ビジネス Web サイト URL（本番ドメイン）</li>
            <li>
              <strong>本人情報（非公開）</strong>: 本人確認書類と一致する氏名・生年月日・自宅住所
            </li>
            <li>
              <strong>ビジネスの公開情報</strong>: 顧客に見せる事業所住所・電話番号（バーチャルオフィス / IP 電話可）
            </li>
            <li>本人確認書類の画像アップロード</li>
            <li>銀行口座（金融機関名 / 支店 / 口座種別 / 番号 / カナ名義）</li>
          </ul>
          <p className="text-amber-700">
            ※ 本人情報は提出書類と完全一致させてください。一致しないと審査に通りません。
          </p>
        </div>
      </Section>

      {/* §5 審査待ち */}
      <Section num="⑤" title="Stripe 審査結果を待つ">
        <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
          <li>標準: 1〜3 営業日 ／ 追加確認あり: 1〜2 週間</li>
          <li>結果はメール通知。否認時は理由を確認し修正のうえ再申請</li>
          <li>審査中もサンドボックス決済は引き続き利用可能</li>
        </ul>
      </Section>

      {/* §6 本番環境のStripe側設定 */}
      <Section num="⑥" title="本番環境で Webhook / 税率 / 3DS / 領収書メールを設定">
        <p>
          審査通過後、Stripe Dashboard 上部のセレクタを
          <strong>「本番環境」</strong>に切替えてから設定します（サンドボックスと混同しないよう注意）。
        </p>
        <div className="text-xs text-gray-700 space-y-1">
          <p className="font-semibold">Webhook エンドポイント追加</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              送信先 URL: 下記の Proxy Lambda Function URL をそのまま貼り付け
              <span className="text-amber-700 ml-1">
                ※ CloudFront ドメインではなく Proxy Lambda 直 URL。OAC 署名エラー回避のため。
              </span>
            </li>
            <li>イベント: <code>checkout.session.completed</code></li>
            <li>作成後の<strong>署名シークレット</strong>（whsec_…）をメモ</li>
          </ul>
          {webhookProxyUrl ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs font-mono break-all">
                {webhookProxyUrl}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(webhookProxyUrl);
                  setWebhookCopied(true);
                  setTimeout(() => setWebhookCopied(false), 2000);
                }}
                className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 whitespace-nowrap"
              >
                {webhookCopied ? "コピー済み" : "コピー"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-700">
              STRIPE_WEBHOOK_PROXY_URL が未設定です。setup1b の CDK デプロイを完了させてこのページを再読込してください。
            </p>
          )}
          <p className="font-semibold mt-2">税率 / 3DS / 領収書メール</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>商品カタログ → 税率を作成（消費税 10% 内税）。txr_… をメモ</li>
            <li>
              設定 → Billing → サブスクリプションとメール通知 →
              「Radar のルールに一致する Billing 支払いに 3D セキュアをリクエスト」を ON
            </li>
            <li>
              設定 → ビジネス → 送信メール → 「決済成功時」の領収書送信を ON
            </li>
            <li>
              設定 → Billing → 請求書 → デフォルトの項目価格「税込み」/ 登録番号があれば登録
            </li>
          </ul>
          <p className="font-semibold mt-2">本番 API キーをメモ</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>シークレットキー: <code>sk_live_…</code></li>
          </ul>
          <p className="text-amber-700 text-[11px]">
            ※ 公開可能キー（pk_live_…）は homepage では使用しません。
          </p>
          <p className="text-red-700">
            ⚠ 必ず <code>_live_</code> プレフィクスのキーを使ってください
            （<code>_test_</code> はサンドボックス用）。
          </p>
        </div>
      </Section>

      {/* §7 管理画面へキー登録 */}
      <Section num="⑦" title="本番キーを管理画面に登録する">
        <p>
          管理画面（
          <a
            href={adminUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            <code className="bg-gray-100 px-1 rounded">{adminUrl}</code>
          </a>
          ）の Stripe 設定欄に以下 3 項目を本番値で上書き保存します。
          値は AWS Secrets Manager に保存され、Lambda 起動時に読み込まれます。
        </p>
        <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
          <li>Stripe Secret Key（sk_live_…）</li>
          <li>Stripe Webhook Signing Secret（whsec_…）</li>
          <li>Stripe Tax Rate ID（txr_…）</li>
        </ul>
      </Section>

      {/* §8 動作確認 */}
      <Section num="⑧" title="本番環境で動作確認">
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          ⚠ 本番環境では実際の課金が発生します。テストには自分の本物のクレジットカードを使い、
          動作確認後は Stripe Dashboard から返金してください。
        </div>
        <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5 mt-2">
          <li>Web ブラウザでサイトを開き、Google アカウントでログイン</li>
          <li>有料記事 →「購入する」→ 決済完了画面 →「領収書を表示」</li>
          <li>登録メールに領収書メールが届くことを確認</li>
        </ul>
      </Section>

      {/* 最終チェック */}
      <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-4 space-y-4">
        <div>
          <p className="font-semibold text-emerald-900 text-sm">
            🎉 おつかれさまでした！
          </p>
          <p className="text-xs text-emerald-800 mt-1">
            これで Stripe 本番決済（実カードでの課金 / 領収書送付）が可能になりました。
            以降のサイト設定は管理画面から行えます。
          </p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => void persistChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          />
          <span className="text-sm text-gray-800 font-medium">
            ①〜⑧ をすべて実施し、本番環境で実カード決済 + 領収書受信まで確認しました
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
          {completing ? "処理中..." : "セットアップを完了する"}
        </button>
      </div>
    </div>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-gray-200 rounded-lg overflow-hidden">
      <header className="bg-gray-100 px-4 py-2">
        <p className="font-semibold text-gray-800 text-sm">
          {num} {title}
        </p>
      </header>
      <div className="p-4 text-sm text-gray-700 space-y-2">{children}</div>
    </section>
  );
}

