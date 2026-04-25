/**
 * ============================================================================
 * CloudFront キャッシュ挙動の自動チェックスクリプト
 * ============================================================================
 *
 * 【目的 / Why】
 * - キャッシュ禁止ページ（/api/*, /admin/*, 認証が絡むページ等）が誤って
 *   CloudFront にキャッシュされると、他ユーザーのセッションや非公開情報が
 *   漏れる重大事故になる。逆にトップや無料記事が都度 origin 叩きだと
 *   Lambda コストとレイテンシが無駄に増える。
 * - このスクリプトはデプロイ後に「本来キャッシュされるべき URL は HIT、
 *   されてはいけない URL は MISS/キャッシュ不可」を自動検証するための
 *   回帰テスト用ツール。
 *
 * 【手法】
 * - 各 URL を 2 回連続で GET し、2 回目のレスポンスヘッダーを確認する。
 *   - `x-cache: Hit from cloudfront` または `age > 0` ならキャッシュ済
 *   - `x-cache: Miss from cloudfront` かつ `cache-control` に
 *     no-store/private/max-age=0 を含むならキャッシュ不可（期待通り）
 * - リダイレクト (3xx) はそのまま評価対象とする（/admin 等は 302 でログインへ飛ぶ想定）。
 *
 * 【実行方法】
 *   npx tsx setup/scripts/test-cdn-cache.ts https://d26dic5zq9f9xh.cloudfront.net
 *   # 第2引数以降に追加 URL を並べると任意パスを差し込み可能:
 *   npx tsx setup/scripts/test-cdn-cache.ts https://d26dic5zq9f9xh.cloudfront.net /articles/foo
 *
 * 【注意】
 * - スクリプトは未ログイン状態で叩く。ログイン限定ページは 302 redirect
 *   が返る想定で、redirect 自体がキャッシュされていないかも確認する。
 * - ゼロ件キャッシュ直後はどちらの URL も 1 回目 MISS になるため、
 *   2 回目の状態で判定する（リトライ 1 回でリカバリ）。
 */

type Expectation = 'cacheable' | 'no-cache';

interface TargetUrl {
  path: string;
  expect: Expectation;
  note?: string;
}

// why: 代表的な公開/非公開パスを最低限カバー。プロジェクト固有の追加 URL は
//      CLI 引数で追加できる（重複パスは最後の定義が勝つ）。
const DEFAULT_TARGETS: TargetUrl[] = [
  // --- キャッシュされて欲しいもの ---
  { path: '/', expect: 'cacheable', note: 'トップページ' },
  { path: '/legal/privacy', expect: 'cacheable', note: '静的 Legal ページ' },
  { path: '/legal/terms', expect: 'cacheable', note: '静的 Legal ページ' },
  { path: '/legal/commerce', expect: 'cacheable', note: '静的 Legal ページ' },

  // --- キャッシュされてはいけないもの ---
  { path: '/api/auth/me', expect: 'no-cache', note: 'セッション判定 API' },
  { path: '/admin', expect: 'no-cache', note: '管理画面（未ログインは 307）' },
  { path: '/admin/login', expect: 'no-cache', note: '管理者ログインページ' },
  { path: '/withdraw', expect: 'no-cache', note: '退会ページ' },
];

interface CheckResult {
  url: string;
  expect: Expectation;
  status1: number;
  status2: number;
  xCache2: string;
  age2: string;
  cacheControl: string;
  verdict: 'OK' | 'NG' | 'WARN';
  reason: string;
}

async function fetchOnce(url: string): Promise<Response> {
  // why: Next.js/CloudFront が viewer によって挙動を変えることがあるため
  //      ブラウザ相当の Accept ヘッダーを付与して HTML を確実に取得する。
  //      redirect: 'manual' で 302 を素通しにしてキャッシュ状況を見る。
  return fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'user-agent': 'cdn-cache-test/1.0 (+homepage)',
      'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    },
  });
}

function analyze(res: Response, expect: Expectation): { verdict: CheckResult['verdict']; reason: string } {
  const xCache = (res.headers.get('x-cache') || '').toLowerCase();
  const age = res.headers.get('age') || '0';
  const cc = (res.headers.get('cache-control') || '').toLowerCase();

  const isHit = xCache.includes('hit') || Number(age) > 0;
  const noStore = /no-store|private|max-age=0/.test(cc);

  if (expect === 'cacheable') {
    if (isHit) return { verdict: 'OK', reason: 'HIT 済 or age>0' };
    // cache-control が明示的に no-store なら設定ミス
    if (noStore) return { verdict: 'NG', reason: `期待=HIT だが cache-control=${cc}` };
    return { verdict: 'WARN', reason: `2 回目も MISS (x-cache=${xCache})。TTL 切れや vary の可能性` };
  }

  // expect === 'no-cache'
  if (isHit) return { verdict: 'NG', reason: `キャッシュ禁止のはずが HIT (x-cache=${xCache}, age=${age})` };
  if (noStore) return { verdict: 'OK', reason: `cache-control=${cc}` };
  return { verdict: 'WARN', reason: `MISS だが cache-control=${cc} に no-store 指示が無い` };
}

async function checkUrl(base: string, target: TargetUrl): Promise<CheckResult> {
  const url = new URL(target.path, base).toString();
  const r1 = await fetchOnce(url);
  // 連続リクエストの race を避けるため少しだけ待つ
  await new Promise((r) => setTimeout(r, 300));
  const r2 = await fetchOnce(url);

  const { verdict, reason } = analyze(r2, target.expect);

  return {
    url,
    expect: target.expect,
    status1: r1.status,
    status2: r2.status,
    xCache2: r2.headers.get('x-cache') || '-',
    age2: r2.headers.get('age') || '-',
    cacheControl: r2.headers.get('cache-control') || '-',
    verdict,
    reason,
  };
}

function parseArgs(argv: string[]): { base: string; extraPaths: string[] } {
  const [, , baseArg, ...rest] = argv;
  if (!baseArg) {
    console.error('Usage: npx tsx setup/scripts/test-cdn-cache.ts <base-url> [extra-path ...]');
    process.exit(1);
  }
  // 末尾スラッシュを外して URL 連結を安定させる
  const base = baseArg.replace(/\/$/, '');
  return { base, extraPaths: rest };
}

async function main() {
  const { base, extraPaths } = parseArgs(process.argv);
  const targets: TargetUrl[] = [...DEFAULT_TARGETS];
  // 追加引数はデフォルトで 'cacheable' として検査（必要なら個別に見ればよい）
  for (const p of extraPaths) targets.push({ path: p, expect: 'cacheable', note: 'CLI 指定' });

  console.log(`[cdn-cache-test] base = ${base}`);
  console.log(`[cdn-cache-test] ${targets.length} 件チェック\n`);

  const results: CheckResult[] = [];
  // why: 並列すると CloudFront の同一 URL コアレッシングで両方 MISS になりがち。
  //      直列 + 300ms ウェイトで 2 回目 HIT を期待する。
  for (const t of targets) {
    try {
      const r = await checkUrl(base, t);
      results.push(r);
      const tag = r.verdict === 'OK' ? '✅' : r.verdict === 'WARN' ? '⚠️ ' : '❌';
      console.log(`${tag} ${r.expect.padEnd(9)} ${r.url}`);
      console.log(`     status=${r.status1}/${r.status2}  x-cache=${r.xCache2}  age=${r.age2}  cache-control=${r.cacheControl}`);
      console.log(`     => ${r.reason}`);
    } catch (err) {
      console.log(`❌ ${t.expect.padEnd(9)} ${t.path}  => fetch error: ${(err as Error).message}`);
      results.push({
        url: new URL(t.path, base).toString(),
        expect: t.expect,
        status1: 0,
        status2: 0,
        xCache2: '-',
        age2: '-',
        cacheControl: '-',
        verdict: 'NG',
        reason: (err as Error).message,
      });
    }
  }

  const ng = results.filter((r) => r.verdict === 'NG').length;
  const warn = results.filter((r) => r.verdict === 'WARN').length;
  const ok = results.filter((r) => r.verdict === 'OK').length;

  console.log(`\nSummary: OK=${ok} WARN=${warn} NG=${ng}`);
  // NG があれば非 0 終了で CI に拾わせる
  process.exit(ng > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
