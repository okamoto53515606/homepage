"use client";

/**
 * setup2b: 独自ドメイン設定（5 フェーズ）
 *
 * 目的 (why):
 *   CloudFront のデフォルトドメインから独自ドメインへの切替は失敗した時の
 *   影響範囲が広い（ログイン全停止 / 記事画像 404 / Stripe Webhook 不通）。
 *   ステップ毎に永続化しながら段階的に進められる UI を用意し、
 *   いつでもブラウザを閉じて再開できるようにする。
 *
 * フェーズ:
 *   A: モード選択（Route 53 取得 / 外部レジストラ）。確定後はロックして変更不可。
 *      why: 後から切替を許可するとリソース二重化と料金事故の温床になるため。
 *   B: (route53 のみ) ドメイン検索 + 価格表示
 *   C: (route53 のみ) 登録者情報入力 + RegisterDomain
 *   D: ACM 証明書発行 + CloudFront alias 紐付け
 *   E: .env / Lambda env / Cognito / siteSettings / 記事 URL の一括書き換え
 *
 * 状態は setup-state.json の phases.setup2b.checks に永続化:
 *   mode, modeLocked, externalDomain, route53Domain, operationId,
 *   registrationCompleted, certificateArn, certIssued, aliasAttached,
 *   rewriteCompleted
 */

import { useEffect, useState } from "react";

type DomainMode = "external" | "route53";

interface PersistedChecks {
  mode?: DomainMode;
  modeLocked?: boolean;
  externalDomain?: string;
  route53Domain?: string;
  operationId?: string;
  registrationCompleted?: boolean;
  certificateArn?: string;
  certIssued?: boolean;
  aliasAttached?: boolean;
  rewriteCompleted?: boolean;
}

interface ContactDetail {
  firstName: string;
  lastName: string;
  contactType: string;
  organizationName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  countryCode: string;
  zipCode: string;
  phoneNumber: string;
  email: string;
}

const EMPTY_CONTACT: ContactDetail = {
  firstName: "",
  lastName: "",
  contactType: "PERSON",
  organizationName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  countryCode: "JP",
  zipCode: "",
  phoneNumber: "",
  email: "",
};

export default function Setup2bPage() {
  const [cloudFrontDomain, setCloudFrontDomain] = useState("");
  const [mode, setMode] = useState<DomainMode | null>(null);
  const [modeLocked, setModeLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [externalDomain, setExternalDomain] = useState("");

  const [route53Domain, setRoute53Domain] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchResult, setSearchResult] = useState<{
    availability: string;
    tld: string;
    price: { registrationUsd: number; renewalUsd: number } | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const [registrant, setRegistrant] = useState<ContactDetail>(EMPTY_CONTACT);
  const [adminSame, setAdminSame] = useState(true);
  const [techSame, setTechSame] = useState(true);
  const [admin, setAdmin] = useState<ContactDetail>(EMPTY_CONTACT);
  const [tech, setTech] = useState<ContactDetail>(EMPTY_CONTACT);
  const [registering, setRegistering] = useState(false);
  const [operationId, setOperationId] = useState("");
  const [registrationCompleted, setRegistrationCompleted] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState("");

  const [certificateArn, setCertificateArn] = useState("");
  const [certValidation, setCertValidation] = useState<
    { name: string; type: string; value: string }[]
  >([]);
  const [route53AutoApplied, setRoute53AutoApplied] = useState(false);
  const [certIssued, setCertIssued] = useState(false);
  const [aliasAttached, setAliasAttached] = useState(false);
  const [acmBusy, setAcmBusy] = useState(false);
  const [acmStatusMsg, setAcmStatusMsg] = useState("");

  const [rewriteCompleted, setRewriteCompleted] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteResults, setRewriteResults] = useState<
    { step: string; success: boolean; message: string }[]
  >([]);

  useEffect(() => {
    fetch("/api/cloudfront-domain", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { domain?: string } | null) => {
        if (j?.domain) setCloudFrontDomain(j.domain);
      })
      .catch(() => {});

    fetch("/api/phase-check?phaseId=setup2b", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { checks?: PersistedChecks } | null) => {
        const c = data?.checks ?? {};
        if (c.mode === "external" || c.mode === "route53") setMode(c.mode);
        if (c.modeLocked === true) setModeLocked(true);
        if (typeof c.externalDomain === "string")
          setExternalDomain(c.externalDomain);
        if (typeof c.route53Domain === "string") {
          setRoute53Domain(c.route53Domain);
          setSearchInput(c.route53Domain);
        }
        if (typeof c.operationId === "string") setOperationId(c.operationId);
        if (c.registrationCompleted === true) setRegistrationCompleted(true);
        if (typeof c.certificateArn === "string")
          setCertificateArn(c.certificateArn);
        if (c.certIssued === true) setCertIssued(true);
        if (c.aliasAttached === true) setAliasAttached(true);
        if (c.rewriteCompleted === true) setRewriteCompleted(true);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function persist(key: keyof PersistedChecks, value: boolean | string) {
    try {
      await fetch("/api/phase-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId: "setup2b", key, value }),
      });
    } catch {
      // ignore
    }
  }

  function lockMode() {
    if (!mode) return;
    if (
      !window.confirm(
        `「${mode === "route53" ? "AWS で取得・管理する" : "外部レジストラのまま使う"}」で確定します。\n\nこの選択は後から変更できません。よろしいですか？`,
      )
    )
      return;
    setModeLocked(true);
    void persist("modeLocked", true);
    void persist("mode", mode);
  }

  async function checkDomain() {
    if (!searchInput) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const r = await fetch("/api/route53-domain/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainName: searchInput.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "検索に失敗しました");
      setSearchResult(j);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function chooseDomain() {
    if (!searchInput) return;
    const d = searchInput.trim().toLowerCase();
    setRoute53Domain(d);
    void persist("route53Domain", d);
  }

  async function loadContactInit() {
    try {
      const r = await fetch("/api/route53-domain/contact-init", {
        cache: "no-store",
      });
      const j = await r.json();
      if (j.contact) {
        setRegistrant(j.contact);
        setAdmin(j.contact);
        setTech(j.contact);
      }
    } catch {
      // 既存ドメインなしの場合は空フォーム
    }
  }

  async function registerDomain() {
    if (!route53Domain) return;
    if (
      !window.confirm(
        `${route53Domain} を登録します。\n\n年額が即時請求されます。続行しますか？`,
      )
    )
      return;
    setRegistering(true);
    try {
      const r = await fetch("/api/route53-domain/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainName: route53Domain,
          durationYears: 1,
          autoRenew: true,
          privacyProtect: true,
          registrant,
          admin: adminSame ? null : admin,
          tech: techSame ? null : tech,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "登録に失敗しました");
      setOperationId(j.operationId);
      void persist("operationId", j.operationId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function checkRegistrationStatus() {
    if (!operationId) return;
    try {
      const r = await fetch(
        `/api/route53-domain/register?operationId=${operationId}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      setRegistrationStatus(j.status ?? "");
      if (j.status === "SUCCESSFUL") {
        setRegistrationCompleted(true);
        void persist("registrationCompleted", true);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function effectiveDomain(): string {
    return mode === "route53" ? route53Domain : externalDomain;
  }

  async function requestCert() {
    const d = effectiveDomain();
    if (!d || !mode) return;
    setAcmBusy(true);
    setAcmStatusMsg("");
    try {
      const r = await fetch("/api/acm-cf-bind/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainName: d, mode }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "ACM リクエスト失敗");
      setCertificateArn(j.certificateArn);
      setCertValidation(j.validation ?? []);
      setRoute53AutoApplied(j.route53AutoApplied === true);
      void persist("certificateArn", j.certificateArn);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAcmBusy(false);
    }
  }

  async function checkCertStatus() {
    if (!certificateArn) return;
    setAcmBusy(true);
    try {
      const r = await fetch(
        `/api/acm-cf-bind/request?certArn=${encodeURIComponent(certificateArn)}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      setAcmStatusMsg(`現在のステータス: ${j.status}`);
      if (j.status === "ISSUED") {
        setCertIssued(true);
        void persist("certIssued", true);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAcmBusy(false);
    }
  }

  async function attachAlias() {
    if (!certificateArn || !mode) return;
    setAcmBusy(true);
    try {
      const r = await fetch("/api/acm-cf-bind/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainName: effectiveDomain(),
          certificateArn,
          mode,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "CloudFront 更新失敗");
      setAliasAttached(true);
      void persist("aliasAttached", true);
      alert(
        "CloudFront に独自ドメインを紐付けました。\n反映まで 5〜15 分かかります。",
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAcmBusy(false);
    }
  }

  async function rewriteAll() {
    if (!aliasAttached) return;
    if (
      !window.confirm(
        "各種設定の独自ドメイン書き換えを実行します。\n\n・.env / Lambda 環境変数 / Cognito Callback / 記事内 URL\nCognito の旧 URL は残します。続行しますか？",
      )
    )
      return;
    setRewriteBusy(true);
    setRewriteResults([]);
    try {
      const r = await fetch("/api/domain-rewrite-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDomain: effectiveDomain() }),
      });
      const j = await r.json();
      setRewriteResults(j.results ?? []);
      const allOk =
        Array.isArray(j.results) &&
        j.results.every((s: { success: boolean }) => s.success);
      if (allOk) {
        setRewriteCompleted(true);
        void persist("rewriteCompleted", true);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRewriteBusy(false);
    }
  }

  if (!loaded) return <p className="text-sm text-gray-600">読み込み中…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          2b. 独自ドメイン設定
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          現在は CloudFront のデフォルトドメイン
          {cloudFrontDomain && (
            <>
              {" "}
              (
              <code className="bg-gray-100 px-1 rounded">{cloudFrontDomain}</code>
              )
            </>
          )}
          で公開されています。独自ドメインへ切り替えます。
        </p>
      </div>

      {/* Phase A */}
      <PhaseSection num="A" title="ドメイン管理方法を選ぶ" done={modeLocked}>
        {!modeLocked && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            ⚠️ <span className="font-semibold">確定後は変更できません。</span>
            別モードに切替えるには AWS コンソールでドメイン/証明書/CloudFront を
            手動で整理し、setup-state.json の <code>mode</code> /{" "}
            <code>modeLocked</code> を削除する必要があります（上級者向け）。
            よく検討してから「この選択を確定する」を押してください。
          </div>
        )}

        <div className="border border-gray-200 rounded-lg overflow-hidden mt-3">
          <div className="divide-y divide-gray-200">
            <ModeOption
              checked={mode === "route53"}
              disabled={modeLocked}
              hidden={modeLocked && mode !== "route53"}
              onChange={() => setMode("route53")}
              title="① AWS でドメインを取得・管理する（Route 53 / おすすめ）"
              desc=".com / .net で年額 $14〜$15、.jp で年額 $80 程度。検索・申込・ACM 証明書発行・CloudFront 紐付け・URL 自動書き換えまで本ページから自動実行できます。"
            />
            <ModeOption
              checked={mode === "external"}
              disabled={modeLocked}
              hidden={modeLocked && mode !== "external"}
              onChange={() => setMode("external")}
              title="② AWS ではドメイン管理しない（お名前.com 等の外部レジストラ）"
              desc="既に持っているドメインを CloudFront に向けます。AWS 側のドメイン取得費用は発生しません。CNAME 設定はご自身で行う必要があります。"
            />
          </div>
        </div>

        {!modeLocked && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={!mode}
              onClick={lockMode}
              className="px-4 py-2 rounded-md text-sm font-medium disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
            >
              この選択を確定する
            </button>
          </div>
        )}
        {modeLocked && (
          <p className="mt-3 text-xs text-emerald-700">
            ✓ モード確定済み:{" "}
            {mode === "route53"
              ? "AWS Route 53 で取得・管理"
              : "外部レジストラのまま使う"}
          </p>
        )}
      </PhaseSection>

      {/* Phase B (route53) */}
      {modeLocked && mode === "route53" && (
        <PhaseSection
          num="B"
          title="使うドメイン名を決める（取得可否 + 価格）"
          done={!!route53Domain}
        >
          <p className="text-xs text-gray-600">
            希望ドメインを入力して取得可否と年額を確認します。
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="example.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm font-mono"
            />
            <button
              type="button"
              disabled={!searchInput || searching}
              onClick={checkDomain}
              className="px-4 py-2 rounded-md text-sm font-medium disabled:bg-gray-100 disabled:text-gray-400 enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
            >
              {searching ? "検索中…" : "取得可否を調べる"}
            </button>
          </div>

          {searchResult && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
              <p>
                可否:{" "}
                <span
                  className={
                    searchResult.availability === "AVAILABLE"
                      ? "text-emerald-700 font-semibold"
                      : "text-red-700 font-semibold"
                  }
                >
                  {searchResult.availability}
                </span>
              </p>
              <p>TLD: .{searchResult.tld}</p>
              {searchResult.price ? (
                <p>
                  価格: 登録 ${searchResult.price.registrationUsd} / 更新 $
                  {searchResult.price.renewalUsd}
                </p>
              ) : (
                <p className="text-gray-500">価格情報取得不可</p>
              )}
              {searchResult.availability === "AVAILABLE" && (
                <button
                  type="button"
                  onClick={chooseDomain}
                  className="mt-2 px-3 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                >
                  このドメインで申し込む
                </button>
              )}
            </div>
          )}

          {route53Domain && (
            <p className="mt-2 text-xs text-emerald-700">
              ✓ 選択中: <code>{route53Domain}</code>
            </p>
          )}
        </PhaseSection>
      )}

      {/* Phase B (external) */}
      {modeLocked && mode === "external" && (
        <PhaseSection
          num="B"
          title="使う独自ドメインを入力"
          done={!!externalDomain}
        >
          <p className="text-xs text-gray-600">
            外部レジストラで取得済みのドメインを入力してください。
            サブドメイン形式（例: <code>www.example.com</code>）を推奨します。
          </p>
          <input
            type="text"
            value={externalDomain}
            onChange={(e) => setExternalDomain(e.target.value.trim())}
            onBlur={(e) =>
              void persist("externalDomain", e.target.value.trim())
            }
            placeholder="www.example.com"
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
          />
          {externalDomain && cloudFrontDomain && (
            <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
              <p className="font-semibold text-blue-900">
                外部レジストラ側で次の CNAME を追加してください
              </p>
              <div className="mt-2 bg-white border border-blue-200 rounded p-2 font-mono">
                <div>
                  ホスト:{" "}
                  {externalDomain.split(".")[0] || "(サブドメイン部分)"}
                </div>
                <div>タイプ: CNAME</div>
                <div className="break-all">値: {cloudFrontDomain}</div>
                <div>TTL: 3600</div>
              </div>
            </div>
          )}
        </PhaseSection>
      )}

      {/* Phase C (route53) */}
      {modeLocked &&
        mode === "route53" &&
        route53Domain &&
        !registrationCompleted && (
          <PhaseSection num="C" title="登録者情報を入力して申込み">
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              ⚠️{" "}
              <span className="font-semibold">
                ICANN ルール: Registrant Email 宛に AWS から確認メールが届きます。
              </span>
              15 日以内にメール内リンクをクリックしないとドメインが
              suspend（公開停止）されます。受信できる正確なアドレスを必ず指定してください。
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={loadContactInit}
                className="px-3 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50"
              >
                既存ドメインの情報を初期値として読み込む
              </button>
            </div>

            <ContactForm
              label="登録者 (Registrant)"
              value={registrant}
              onChange={setRegistrant}
            />
            <SameAsRegistrant
              label="管理連絡先 (Admin)"
              same={adminSame}
              setSame={setAdminSame}
              value={admin}
              setValue={setAdmin}
            />
            <SameAsRegistrant
              label="技術連絡先 (Tech)"
              same={techSame}
              setSame={setTechSame}
              value={tech}
              setValue={setTech}
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={registering || !!operationId}
                onClick={registerDomain}
                className="px-4 py-2 rounded-md text-sm font-medium disabled:bg-gray-100 disabled:text-gray-400 enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
              >
                {registering ? "送信中…" : "ドメイン登録を申込む"}
              </button>
            </div>

            {operationId && (
              <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs space-y-2">
                <p>
                  申込済み Operation ID:{" "}
                  <code className="break-all">{operationId}</code>
                </p>
                <p>
                  状態: {registrationStatus || "(未取得)"}{" "}
                  <button
                    type="button"
                    onClick={checkRegistrationStatus}
                    className="ml-2 px-2 py-0.5 border border-gray-300 rounded hover:bg-white"
                  >
                    再確認
                  </button>
                </p>
                <p className="text-gray-500">
                  通常 5〜15 分で SUCCESSFUL になります。
                </p>
              </div>
            )}
          </PhaseSection>
        )}

      {/* Phase D */}
      {modeLocked &&
        ((mode === "route53" && registrationCompleted) ||
          (mode === "external" && externalDomain)) && (
          <PhaseSection
            num="D"
            title="ACM 証明書発行 + CloudFront 紐付け"
            done={aliasAttached}
          >
            <p className="text-xs text-gray-600">
              対象ドメイン: <code>{effectiveDomain()}</code>
            </p>

            {!certificateArn && (
              <button
                type="button"
                disabled={acmBusy}
                onClick={requestCert}
                className="mt-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400"
              >
                {acmBusy ? "リクエスト中…" : "ACM 証明書を発行する"}
              </button>
            )}

            {certificateArn && (
              <div className="mt-3 space-y-3">
                <p className="text-xs">
                  Certificate ARN:{" "}
                  <code className="break-all text-[10px]">{certificateArn}</code>
                </p>

                {certValidation.length > 0 && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs">
                    <p className="font-semibold text-blue-900">
                      DNS 検証用 CNAME
                      {route53AutoApplied
                        ? "（Route 53 ホストゾーンに自動投入済み）"
                        : "（外部レジストラに追加してください）"}
                    </p>
                    {certValidation.map((v, i) => (
                      <div
                        key={i}
                        className="mt-2 bg-white border border-blue-200 rounded p-2 font-mono break-all"
                      >
                        <div>名前: {v.name}</div>
                        <div>タイプ: {v.type}</div>
                        <div>値: {v.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    disabled={acmBusy}
                    onClick={checkCertStatus}
                    className="px-3 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    検証ステータスを再確認
                  </button>
                  {acmStatusMsg && (
                    <span className="text-xs text-gray-700">
                      {acmStatusMsg}
                    </span>
                  )}
                </div>

                {certIssued && !aliasAttached && (
                  <button
                    type="button"
                    disabled={acmBusy}
                    onClick={attachAlias}
                    className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    CloudFront に独自ドメインを紐付ける
                  </button>
                )}

                {aliasAttached && (
                  <p className="text-xs text-emerald-700">
                    ✓ CloudFront 紐付け完了。反映まで 5〜15 分。
                  </p>
                )}
              </div>
            )}
          </PhaseSection>
        )}

      {/* Phase E */}
      {modeLocked && aliasAttached && (
        <PhaseSection
          num="E"
          title="各種 URL を独自ドメインに書き換える"
          done={rewriteCompleted}
        >
          <p className="text-xs text-gray-600">
            <code>.env</code> / Lambda 環境変数 / Cognito Callback URL /
            DynamoDB <code>siteSettings.siteUrl</code> /
            記事本文と imageAssets の URL を <code>{effectiveDomain()}</code>{" "}
            に切り替えます。Cognito の旧 URL は残します（ロールバック用）。
          </p>
          <button
            type="button"
            disabled={rewriteBusy}
            onClick={rewriteAll}
            className="mt-2 px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {rewriteBusy ? "書き換え中…" : "全 URL を新ドメインに書き換える"}
          </button>

          {rewriteResults.length > 0 && (
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
              {rewriteResults.map((r, i) => (
                <div
                  key={i}
                  className={r.success ? "text-emerald-700" : "text-red-700"}
                >
                  {r.success ? "✓" : "✗"} [{r.step}] {r.message}
                </div>
              ))}
            </div>
          )}

          {rewriteCompleted && (
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">
                自動化できない手動作業が残っています:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Google Cloud Console で OAuth クライアントの「承認済みリダイレクト
                  URI」に{" "}
                  <code>https://{effectiveDomain()}/api/auth/callback</code>{" "}
                  を追加してください（旧 URL は残してロールバック性を確保）。
                </li>
                <li>
                  Stripe 側は変更不要です（Webhook は Proxy Lambda の Function
                  URL を直接受けるため）。
                </li>
                {mode === "route53" && (
                  <li>
                    AWS から Registrant Email 宛に届く確認メール（
                    <code>noreply@registrar.amazon.com</code>）を 15 日以内に
                    クリックして verify してください。
                  </li>
                )}
              </ul>
            </div>
          )}
        </PhaseSection>
      )}
    </div>
  );
}

function PhaseSection({
  num,
  title,
  done,
  children,
}: {
  num: string;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-gray-200 rounded-lg overflow-hidden">
      <header className="bg-gray-100 px-4 py-2 flex items-center justify-between">
        <p className="font-semibold text-gray-800 text-sm">
          フェーズ {num}: {title}
        </p>
        {done && (
          <span className="text-xs text-emerald-700 font-semibold">完了</span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ModeOption({
  checked,
  disabled,
  hidden,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  disabled: boolean;
  hidden: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  if (hidden) return null;
  return (
    <label
      className={`flex items-start gap-3 p-4 ${
        disabled ? "cursor-default" : "cursor-pointer hover:bg-gray-50"
      }`}
    >
      <input
        type="radio"
        name="domain-mode"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 h-4 w-4 text-blue-600"
      />
      <div className="text-sm text-gray-800 space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-gray-600">{desc}</p>
      </div>
    </label>
  );
}

function ContactForm({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ContactDetail;
  onChange: (c: ContactDetail) => void;
}) {
  function field<K extends keyof ContactDetail>(key: K, placeholder: string) {
    return (
      <input
        type="text"
        value={(value[key] ?? "") as string}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        placeholder={placeholder}
        className="px-2 py-1 border border-gray-300 rounded text-xs"
      />
    );
  }
  return (
    <div className="mt-4 border border-gray-200 rounded p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {field("firstName", "First name")}
        {field("lastName", "Last name")}
        {field("email", "Email")}
        {field("phoneNumber", "Phone (+81.3xxxxxxxx)")}
        {field("organizationName", "Organization (任意)")}
        <select
          value={value.contactType}
          onChange={(e) => onChange({ ...value, contactType: e.target.value })}
          className="px-2 py-1 border border-gray-300 rounded text-xs"
        >
          <option value="PERSON">PERSON</option>
          <option value="COMPANY">COMPANY</option>
          <option value="ASSOCIATION">ASSOCIATION</option>
          <option value="PUBLIC_BODY">PUBLIC_BODY</option>
          <option value="RESELLER">RESELLER</option>
        </select>
        {field("addressLine1", "Address line 1")}
        {field("addressLine2", "Address line 2 (任意)")}
        {field("city", "City")}
        {field("state", "State / 都道府県")}
        {field("zipCode", "Zip code")}
        <input
          type="text"
          value={value.countryCode}
          onChange={(e) =>
            onChange({ ...value, countryCode: e.target.value.toUpperCase() })
          }
          placeholder="Country (ISO2: JP)"
          maxLength={2}
          className="px-2 py-1 border border-gray-300 rounded text-xs uppercase"
        />
      </div>
    </div>
  );
}

function SameAsRegistrant({
  label,
  same,
  setSame,
  value,
  setValue,
}: {
  label: string;
  same: boolean;
  setSame: (b: boolean) => void;
  value: ContactDetail;
  setValue: (c: ContactDetail) => void;
}) {
  return (
    <div className="mt-3 border border-gray-200 rounded p-3">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={same}
          onChange={(e) => setSame(e.target.checked)}
          className="h-3 w-3"
        />
        <span className="font-semibold">
          {label} を Registrant と同じにする
        </span>
      </label>
      {!same && (
        <div className="mt-2">
          <ContactForm label={label} value={value} onChange={setValue} />
        </div>
      )}
    </div>
  );
}
