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
import { useRouter } from "next/navigation";

type DomainMode = "external" | "route53";

interface PersistedChecks {
  mode?: DomainMode;
  modeLocked?: boolean;
  externalDomain?: string;
  route53Domain?: string;
  route53Subdomain?: string;
  operationId?: string;
  registrationCompleted?: boolean;
  certificateArn?: string;
  certIssued?: boolean;
  aliasAttached?: boolean;
  rewriteCompleted?: boolean;
  completed?: boolean;
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

/**
 * 日本の都道府県 (ISO 3166-2:JP)
 *   why: Route 53 Domains は JP の State に "JP-13" 等のコードしか受け付けない
 *        ("Tokyo" 等の文字列はバリデーションエラー)。セレクトで強制する。
 */
const JP_PREFECTURES: { code: string; label: string }[] = [
  { code: "JP-01", label: "JP-01 北海道 (Hokkaido)" },
  { code: "JP-02", label: "JP-02 青森県 (Aomori)" },
  { code: "JP-03", label: "JP-03 岩手県 (Iwate)" },
  { code: "JP-04", label: "JP-04 宮城県 (Miyagi)" },
  { code: "JP-05", label: "JP-05 秋田県 (Akita)" },
  { code: "JP-06", label: "JP-06 山形県 (Yamagata)" },
  { code: "JP-07", label: "JP-07 福島県 (Fukushima)" },
  { code: "JP-08", label: "JP-08 茨城県 (Ibaraki)" },
  { code: "JP-09", label: "JP-09 栃木県 (Tochigi)" },
  { code: "JP-10", label: "JP-10 群馬県 (Gunma)" },
  { code: "JP-11", label: "JP-11 埼玉県 (Saitama)" },
  { code: "JP-12", label: "JP-12 千葉県 (Chiba)" },
  { code: "JP-13", label: "JP-13 東京都 (Tokyo)" },
  { code: "JP-14", label: "JP-14 神奈川県 (Kanagawa)" },
  { code: "JP-15", label: "JP-15 新潟県 (Niigata)" },
  { code: "JP-16", label: "JP-16 富山県 (Toyama)" },
  { code: "JP-17", label: "JP-17 石川県 (Ishikawa)" },
  { code: "JP-18", label: "JP-18 福井県 (Fukui)" },
  { code: "JP-19", label: "JP-19 山梨県 (Yamanashi)" },
  { code: "JP-20", label: "JP-20 長野県 (Nagano)" },
  { code: "JP-21", label: "JP-21 岐阜県 (Gifu)" },
  { code: "JP-22", label: "JP-22 静岡県 (Shizuoka)" },
  { code: "JP-23", label: "JP-23 愛知県 (Aichi)" },
  { code: "JP-24", label: "JP-24 三重県 (Mie)" },
  { code: "JP-25", label: "JP-25 滋賀県 (Shiga)" },
  { code: "JP-26", label: "JP-26 京都府 (Kyoto)" },
  { code: "JP-27", label: "JP-27 大阪府 (Osaka)" },
  { code: "JP-28", label: "JP-28 兵庫県 (Hyogo)" },
  { code: "JP-29", label: "JP-29 奈良県 (Nara)" },
  { code: "JP-30", label: "JP-30 和歌山県 (Wakayama)" },
  { code: "JP-31", label: "JP-31 鳥取県 (Tottori)" },
  { code: "JP-32", label: "JP-32 島根県 (Shimane)" },
  { code: "JP-33", label: "JP-33 岡山県 (Okayama)" },
  { code: "JP-34", label: "JP-34 広島県 (Hiroshima)" },
  { code: "JP-35", label: "JP-35 山口県 (Yamaguchi)" },
  { code: "JP-36", label: "JP-36 徳島県 (Tokushima)" },
  { code: "JP-37", label: "JP-37 香川県 (Kagawa)" },
  { code: "JP-38", label: "JP-38 愛媛県 (Ehime)" },
  { code: "JP-39", label: "JP-39 高知県 (Kochi)" },
  { code: "JP-40", label: "JP-40 福岡県 (Fukuoka)" },
  { code: "JP-41", label: "JP-41 佐賀県 (Saga)" },
  { code: "JP-42", label: "JP-42 長崎県 (Nagasaki)" },
  { code: "JP-43", label: "JP-43 熊本県 (Kumamoto)" },
  { code: "JP-44", label: "JP-44 大分県 (Oita)" },
  { code: "JP-45", label: "JP-45 宮崎県 (Miyazaki)" },
  { code: "JP-46", label: "JP-46 鹿児島県 (Kagoshima)" },
  { code: "JP-47", label: "JP-47 沖縄県 (Okinawa)" },
];

/**
 * 電話番号を Route 53 形式 "+<国番号>.<番号>" に正規化する
 *   why: Route 53 Domains の Phone は "+81.3xxxxxxxx" のように
 *        国番号と番号をドットで区切る独自形式しか受け付けない。
 *        利用者が "070-4085-9324" や "+81 070..." 等で入力しがちなため、
 *        非数字を除去し、JP は先頭の 0 を除去して +81 を付与する。
 *
 *   ルール:
 *   - 既に "+xx.yyyy" 形式ならそのまま
 *   - "+xx yyyy" / "+xxyyyy" もドットを補って正規化
 *   - 国コードが入力にない場合は countryCode 引数で補う (JP→81)
 *   - JP の場合は番号先頭の 0 を 1 つ落とす (070→70)
 */
function normalizePhoneForRoute53(input: string, countryCode: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";

  // 既に "+CC.NUMBER" 形式（NUMBER 部に数字以外を含まない）ならそのまま
  const already = raw.match(/^\+(\d{1,3})\.(\d+)$/);
  if (already) return raw;

  // 先頭が + で始まる場合は国番号を抽出
  const plus = raw.match(/^\+\s*(\d{1,3})[\s.\-]?(.*)$/);
  if (plus) {
    const cc = plus[1];
    const rest = plus[2].replace(/\D/g, "");
    // JP の場合、+81 の後に 0 が残っていたら 1 つ落とす
    const normalized =
      cc === "81" ? rest.replace(/^0+/, "") : rest;
    return normalized ? `+${cc}.${normalized}` : "";
  }

  // + が無い → countryCode から国番号を補う
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  const cc = countryCode === "JP" ? "81" : ""; // 必要なら他国を追加
  if (!cc) {
    // 国コードを推定できない場合は既知形式で返さず、そのまま返却
    return raw;
  }
  // JP は先頭 0 を 1 つ落とす
  const normalized = countryCode === "JP" ? digits.replace(/^0+/, "") : digits;
  return normalized ? `+${cc}.${normalized}` : "";
}

/**
 * Route 53 Domains のエラーメッセージを日本語で補足する
 *   why: 利用者は初心者想定。英語のバリデーションエラーは混乱の元なので、
 *        頻出パターンに対して日本語の補足説明を付ける。
 */
function translateRoute53Error(msg: string): string {
  const hints: string[] = [];
  if (/PHONE does not resemble/i.test(msg)) {
    hints.push(
      "・電話番号は「+81.7040859324」のように 国番号(+81) と番号をドットで区切る形式が必要です（携帯/固定とも先頭の 0 は外す）。",
    );
  }
  if (/STATE not allowed/i.test(msg)) {
    hints.push(
      "・State（都道府県）は「JP-13 (東京)」のような ISO コードで指定する必要があります。プルダウンから選び直してください。",
    );
  }
  if (/ZIP|POSTAL/i.test(msg)) {
    hints.push(
      "・郵便番号は半角数字とハイフンのみ（例: 150-0002）で入力してください。",
    );
  }
  if (/EMAIL/i.test(msg)) {
    hints.push(
      "・Email は受信可能な正しいメールアドレスを入力してください（ICANN 確認メールが届きます）。",
    );
  }
  if (hints.length === 0) return msg;
  return `${msg}\n\n[補足]\n${hints.join("\n")}`;
}

export default function Setup2bPage() {
  const router = useRouter();
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalChecked, setFinalChecked] = useState(false);
  const [cloudFrontDomain, setCloudFrontDomain] = useState("");
  const [mode, setMode] = useState<DomainMode | null>(null);
  const [modeLocked, setModeLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [externalDomain, setExternalDomain] = useState("");

  const [route53Domain, setRoute53Domain] = useState("");
  // why: CloudFront に紐付けるホスト名は通常 サブドメイン付きが推奨。
  //   apex (example.com) 直付けは Route 53 ALIAS や ANAME が必要になり構成が複雑化、
  //   CNAME にも乗せられないため、初期値 "www" でサブドメインを入れさせる。
  //   空文字も許容するが警告を出して上級者向けにする。
  const [route53Subdomain, setRoute53Subdomain] = useState("www");
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
        if (typeof c.route53Subdomain === "string")
          setRoute53Subdomain(c.route53Subdomain);
        if (typeof c.operationId === "string") setOperationId(c.operationId);
        if (c.registrationCompleted === true) setRegistrationCompleted(true);
        if (typeof c.certificateArn === "string")
          setCertificateArn(c.certificateArn);
        if (c.certIssued === true) setCertIssued(true);
        if (c.aliasAttached === true) setAliasAttached(true);
        if (c.rewriteCompleted === true) setRewriteCompleted(true);
        if (c.completed === true) setFinalChecked(true);
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
      if (!r.ok) {
        alert(`初期値の読み込みに失敗しました: ${j.error ?? r.status}`);
        return;
      }
      if (j.contact) {
        // why: AWS アカウント連絡先の State は "Tokyo" 等の英字名で保存されるが、
        //   Route 53 は JP の場合 "JP-13" 等の ISO コードしか受け付けない。
        //   セレクトの初期値が空のままだと利用者が見落として送信エラーになるため、
        //   読み込み時点では state を空にしてプルダウンで明示的に選ばせる。
        const initial: ContactDetail = {
          ...j.contact,
          state:
            j.contact.countryCode === "JP" &&
            !/^JP-\d{2}$/.test(j.contact.state ?? "")
              ? ""
              : j.contact.state ?? "",
          phoneNumber: normalizePhoneForRoute53(
            j.contact.phoneNumber ?? "",
            j.contact.countryCode ?? "JP",
          ),
        };
        setRegistrant(initial);
        setAdmin(initial);
        setTech(initial);
        alert(
          "AWS アカウント連絡先を読み込みました。\n" +
            "・姓名の分割と Email は必要に応じて修正してください\n" +
            "・State (都道府県) は JP の場合 ISO コードで再選択が必要です",
        );
      } else {
        alert(
          "AWS アカウント連絡先を取得できませんでした。手入力してください。",
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function registerDomain() {
    if (!route53Domain) return;
    // why: Route 53 RegisterDomain は ContactDetail.Email が必須。
    //   AWS Account の GetContactInformation は email を返さないため、
    //   自動入力では空のまま残りやすい。サーバー往復前にここで弾く。
    const missingEmail: string[] = [];
    if (!registrant.email.trim()) missingEmail.push("Registrant");
    if (!adminSame && !admin.email.trim()) missingEmail.push("Admin");
    if (!techSame && !tech.email.trim()) missingEmail.push("Tech");
    if (missingEmail.length > 0) {
      alert(
        `${missingEmail.join(" / ")} の Email が未入力です。\n` +
          "ICANN 確認メールの受信に必須のため、必ず入力してください。",
      );
      return;
    }
    if (
      !window.confirm(
        `${route53Domain} を登録します。\n\n年額が即時請求されます。続行しますか？`,
      )
    )
      return;
    // why: Phone は onBlur で正規化しているが、コピペ直後など onBlur を経ない
    //   ケースが残る。送信直前にも一度正規化を通して "+CC.NUMBER" を保証する。
    const normalize = (c: ContactDetail): ContactDetail => ({
      ...c,
      phoneNumber: normalizePhoneForRoute53(c.phoneNumber, c.countryCode),
    });
    const reg = normalize(registrant);
    const adm = adminSame ? null : normalize(admin);
    const tch = techSame ? null : normalize(tech);
    setRegistrant(reg);
    if (adm) setAdmin(adm);
    if (tch) setTech(tch);
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
          registrant: reg,
          admin: adm,
          tech: tch,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "登録に失敗しました");
      setOperationId(j.operationId);
      void persist("operationId", j.operationId);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      alert(translateRoute53Error(raw));
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
    // why: CloudFront alias / ACM 証明発行は FQDN で設定する。
    //   route53 mode は apex (example.com) にサブドメインをプレフィクスして返す。
    //   サブドメインが空の場合は apex をそのまま返す (上級者設定)。
    if (mode === "route53") {
      const sub = route53Subdomain.trim().toLowerCase();
      if (!route53Domain) return "";
      return sub ? `${sub}.${route53Domain}` : route53Domain;
    }
    return externalDomain;
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
              {searchResult.availability !== "AVAILABLE" && (
                <p className="text-red-700">
                  このドメインは取得できません。別のドメインを入力してください。
                </p>
              )}
              <p>TLD: .{searchResult.tld}</p>
              {searchResult.price ? (
                <p>
                  参考価格: 登録 約 ${searchResult.price.registrationUsd} / 更新
                  約 ${searchResult.price.renewalUsd}{" "}
                  <span className="text-gray-500">
                    （AWS ListPrices ベースの目安。確定金額は申込時の請求で決まります）
                  </span>
                </p>
              ) : (
                <p className="text-gray-500">参考価格は取得できませんでした</p>
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
            <strong className="text-red-600">
              サブドメイン形式（例: <code>www.example.com</code>）が必須です。
            </strong>
            apex（<code>example.com</code> のようにドットが 1 つだけ）は CNAME に
            乗せられないため CloudFront では使用できません。
          </p>
          <input
            type="text"
            value={externalDomain}
            onChange={(e) =>
              setExternalDomain(e.target.value.trim().toLowerCase())
            }
            onBlur={(e) =>
              void persist(
                "externalDomain",
                e.target.value.trim().toLowerCase(),
              )
            }
            placeholder="www.example.com"
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
          />
          {externalDomain && externalDomain.split(".").length < 3 && (
            <p className="mt-1 text-xs text-red-600 font-semibold">
              ⚠️ サブドメインが含まれていません。<code>www.{externalDomain}</code>{" "}
              のように先頭にサブドメインを付けて入力してください。
            </p>
          )}
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

            <div className="mt-2 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700 font-semibold">
              ⚠️ 住所・氏名・会社名はすべて半角英数（ローマ字）で入力してください。
              <br />
              Route 53 / ICANN は ASCII のみ受け付けるため、日本語のままだと
              RegisterDomain が失敗します。AWS アカウント連絡先から読み込んだ
              内容が日本語の場合は、必ずローマ字に書き換えてください。
              <br />
              また FullName は「First Last」順を仮定して自動分割しています。
              FirstName / LastName が逆になっていないか必ず目視で確認してください。
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={loadContactInit}
                className="px-3 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50"
              >
AWS アカウント連絡先を初期値として読み込む
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
                <ul className="list-disc pl-5 text-[11px] text-gray-600 space-y-1">
                  <li>
                    <strong>「再確認」ボタン</strong>を押すと現在のステータスを取得します。
                    <code className="font-mono">IN_PROGRESS</code> = 処理中 /
                    <code className="font-mono"> SUCCESSFUL</code> = 完了 /
                    <code className="font-mono"> FAILED</code> /
                    <code className="font-mono"> ERROR</code> = エラー。
                    完了するまで自動更新はされないので、数分おきに押して確認してください。
                  </li>
                  <li className="text-red-600 font-semibold">
                    Registrant Email 宛に AWS / レジストラ (Gandi 等) から
                    <strong>確認メール</strong>が届きます。
                    <strong>15 日以内</strong>にメール内のリンクを必ずクリックしてください。
                    クリックを忘れるとドメインが <strong>suspend（公開停止）</strong>
                    されます（spam フォルダもご確認を）。
                  </li>
                  <li>
                    完了後は自動で次の Phase D（ACM 証明書発行）が表示されます。
                  </li>
                </ul>
              </div>
            )}
          </PhaseSection>
        )}

      {/* Phase D */}
      {modeLocked &&
        ((mode === "route53" && registrationCompleted) ||
          (mode === "external" &&
            externalDomain &&
            externalDomain.split(".").length >= 3)) && (
          <PhaseSection
            num="D"
            title="ACM 証明書発行 + CloudFront 紐付け"
            done={aliasAttached}
          >
            {mode === "route53" && !certificateArn && (
              <div className="rounded border border-gray-200 p-3 mb-3 space-y-2">
                <label className="block text-xs font-semibold text-gray-700">
                  サブドメイン <span className="text-red-600">(必須)</span>
                </label>
                <div className="flex items-center gap-1 text-sm font-mono">
                  <input
                    type="text"
                    value={route53Subdomain}
                    onChange={(e) =>
                      setRoute53Subdomain(
                        e.target.value
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      )
                    }
                    onBlur={() =>
                      void persist("route53Subdomain", route53Subdomain)
                    }
                    placeholder="www"
                    className="px-2 py-1 border border-gray-300 rounded w-32"
                  />
                  <span className="text-gray-700">.{route53Domain}</span>
                </div>
                <p className="text-[11px] text-gray-600">
                  CloudFront に紐付ける FQDN は{" "}
                  <code className="font-mono">
                    {effectiveDomain() || `(サブドメイン未入力).${route53Domain}`}
                  </code>{" "}
                  になります。
                </p>
                <p className="text-[11px] text-red-600 font-semibold">
                  ⚠️ apex (<code>{route53Domain}</code>) 直付けは Route 53 ALIAS や
                  別構成が必要で複雑なため、本セットアップでは
                  <strong>サブドメイン必須</strong>としています。
                  通常は <code>www</code> のままで OK です。
                </p>
              </div>
            )}

            <p className="text-xs text-gray-600">
              対象ドメイン: <code>{effectiveDomain() || "(未設定)"}</code>
            </p>

            {!certificateArn && (
              <button
                type="button"
                disabled={
                  acmBusy ||
                  !effectiveDomain() ||
                  (mode === "route53" && !route53Subdomain.trim())
                }
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

                <div className="space-y-1">
                  <p className="text-xs text-red-600 font-semibold">
                    ※ DNS 伝播と ACM 側の検証反映には時間がかかるため、
                    <strong>CNAME 投入から 10 分以上経過してから</strong>
                    再確認ボタンを押してください。早く押すと
                    <code className="mx-1 px-1 bg-red-50 border border-red-200 rounded">PENDING_VALIDATION</code>
                    のままになります（料金等への影響はありません）。
                  </p>
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
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-700">
                      ✓ CloudFront 紐付け完了。反映まで 5〜15 分。
                    </p>
                    {/*
                      why: setup1b（インフラ再デプロイ）を実行すると CDK が
                           CloudFront の Aliases / ViewerCertificate を空に
                           戻してしまう。スキーマ変更で 1b を再実行した後に
                           ここで再紐付けできるように、attach ボタンを常時
                           表示する。`acm-cf-bind/attach` は冪等なので
                           alias が残っていても安全に再実行できる。
                    */}
                    <button
                      type="button"
                      disabled={acmBusy}
                      onClick={attachAlias}
                      className="px-3 py-1.5 rounded border border-emerald-600 text-emerald-700 text-xs font-medium hover:bg-emerald-50 disabled:opacity-50"
                    >
                      再紐付け（setup1b 後の復旧用）
                    </button>
                  </div>
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

          <div className="mt-2 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700 space-y-1">
            <p className="font-bold">
              ⚠ 忘れがちな手動作業（書き換え前後どちらでも可）
            </p>
            <p>
              Google Cloud Console で OAuth クライアントの
              <strong>「承認済みリダイレクト URI」</strong>に{" "}
              <code className="px-1 bg-white border border-red-200 rounded">
                https://{effectiveDomain()}/api/auth/callback
              </code>{" "}
              を追加してください（<strong>旧 URL は残してロールバック性を確保</strong>）。
              これを忘れると Google ログインが <code>redirect_uri_mismatch</code> で失敗します。
            </p>
          </div>

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

      {/*
        setup2b 全体の完了処理
        why: 各 Phase は内部状態を setup-state.json に保存しているが、
          サイドバーの進捗 (status="completed") に反映するには /api/complete-phase を
          1 回呼ぶ必要がある。Phase E まで終わったらこのボタンで step3 へ遷移する。
      */}
      {modeLocked && rewriteCompleted && (
        <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-4 space-y-3">
          <p className="font-semibold text-emerald-900 text-sm">
            ✓ 独自ドメイン切替が完了しました
          </p>
          <p className="text-xs text-emerald-800">
            🎉 おつかれさまでした！独自ドメインで運用できる状態になりました。
            Google Cloud Console の OAuth 承認済みリダイレクト URI 追加が済んでいることを
            確認してから「次のステップへ進む」を押してください。
          </p>

          {/* 完了チェックボックス (setup2a と同じパターン) */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={finalChecked}
              onChange={(e) => {
                const v = e.target.checked;
                setFinalChecked(v);
                void persist("completed", v);
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
            />
            <span className="text-sm text-gray-800 font-medium">
              独自ドメイン切替と Google OAuth リダイレクト URI 追加を完了しました
            </span>
          </label>

          {finalizeError && (
            <p className="text-sm text-red-600">{finalizeError}</p>
          )}
          <button
            type="button"
            disabled={!finalChecked || finalizing}
            onClick={async () => {
              setFinalizing(true);
              setFinalizeError(null);
              try {
                const res = await fetch("/api/complete-phase", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phaseId: "setup2b" }),
                });
                if (!res.ok) throw new Error("完了処理に失敗しました");
                router.push("/setup3");
              } catch (e) {
                setFinalizeError(
                  e instanceof Error ? e.message : "エラーが発生しました",
                );
              } finally {
                setFinalizing(false);
              }
            }}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors
              disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
              enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
          >
            {finalizing ? "処理中..." : "次のステップへ進む"}
          </button>
        </div>
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
      <p className="text-[11px] text-red-600">
        ※ 左が「名 (First)」、右が「姓 (Last)」です。自動入力された場合は逆転していないか必ず確認してください。
      </p>
      <p className="text-[11px] text-red-600">
        ※ Phone は <code className="font-mono">+81.7040859324</code> 形式が必須（国番号 + ドット + 番号、ハイフン/空白不可）。
        <br />
        日本の番号は <strong>先頭の 0 を外す</strong> のがルールです（例: <code>070-4085-9324</code> → <code>+81.7040859324</code>）。
        フォーカスを外した時点で自動変換しますが、変換後の値が正しいかご確認ください。
      </p>
      <div className="grid grid-cols-2 gap-2">
        {field("firstName", "First name (名 / 例: Taro)")}
        {field("lastName", "Last name (姓 / 例: Yamada)")}
        {field("email", "Email (例: you@example.com)")}
        <input
          type="text"
          value={value.phoneNumber}
          onChange={(e) =>
            onChange({ ...value, phoneNumber: e.target.value })
          }
          onBlur={(e) =>
            onChange({
              ...value,
              phoneNumber: normalizePhoneForRoute53(
                e.target.value,
                value.countryCode,
              ),
            })
          }
          placeholder="Phone (例: +81.7040859324)"
          className="px-2 py-1 border border-gray-300 rounded text-xs"
        />
        {field("organizationName", "Organization (会社名 / 任意)")}
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
        {field("addressLine1", "Address line 1 (例: 1-2-3 Shibuya)")}
        {field("addressLine2", "Address line 2 (建物名 / 任意)")}
        {field("city", "City (市区町村 / 例: Shibuya-ku)")}
        {value.countryCode === "JP" ? (
          <select
            value={value.state ?? ""}
            onChange={(e) => onChange({ ...value, state: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded text-xs"
          >
            <option value="">State (都道府県を選択)</option>
            {JP_PREFECTURES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          field("state", "State (都道府県 / 例: Tokyo)")
        )}
        {field("zipCode", "Zip code (例: 150-0002)")}
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
