/**
 * AI 処理（記事生成 / 記事修正）の「応答は切れたが処理は続いている」状態の共通定義
 *
 * why:
 *   CloudFront の origin response timeout は 60 秒で、超えると 504 が返る。
 *   一方 Lambda（cdk/lib/infra-stack.ts の AppLambda）は timeout=300 秒なので、
 *   クライアントが応答を受け取れなくてもサーバー側は処理を続け、記事の保存まで
 *   完了する。この「応答は切れたが処理は続いている」状態をクライアントが扱うため、
 *   記事生成フォームと記事修正フォームで **同じ待ち時間・同じ間隔** を使う必要がある。
 *   片方だけ値を変えると「生成は諦めるのが早い／修正は遅い」といった不整合が
 *   生まれるため、ここを単一の情報源にする。
 */

/**
 * AppLambda のタイムアウトと同じ値（秒）。
 * CDK 側（cdk/lib/infra-stack.ts の `timeout: cdk.Duration.seconds(300)`）を
 * 変更したらここも必ず合わせる。ここより長く待っても Lambda は既に強制終了
 * されているため、ポーリングを続けても意味がない。
 */
export const LAMBDA_TIMEOUT_MS = 300 * 1000;

/** ポーリングを諦めるまでの時間（Lambda 強制終了時刻 + 余裕 60 秒） */
export const AI_PROCESSING_DEADLINE_MS = LAMBDA_TIMEOUT_MS + 60 * 1000;

/**
 * ポーリング間隔。
 * 叩くのは DynamoDB の GetItem 1 回分だけ（本文は返さない）なので、
 * 10 秒間隔でも負荷・転送量は無視できる。
 */
export const AI_POLL_INTERVAL_MS = 10 * 1000;

/** ポーリングの結末 */
export type PollOutcome =
  /** 完了を検知した */
  | 'done'
  /** 期限までに完了を検知できなかった（Lambda も強制終了済みの想定） */
  | 'timeout'
  /** 画面離脱や再送信で中断された */
  | 'cancelled';

/**
 * 「完了したか」を一定間隔で確認する。
 *
 * why: 生成と修正でループの形は同じなのに、以前は片方（修正）にしか無かった。
 *      両方から使えるように抜き出し、世代番号（isActive）で中断できるようにする。
 *      中断は「画面離脱」だけでなく「同じ画面で再度送信した」場合にも必要で、
 *      古いループが新しいループの状態を上書きしないようにしている。
 *
 * @param isDone   完了していれば true を返す（ポーリング本体）
 * @param isActive まだ有効なループか（false になったら即座に中断）
 */
export async function pollForCompletion(
  isDone: () => Promise<boolean>,
  isActive: () => boolean,
  options: { intervalMs?: number; deadlineMs?: number } = {},
): Promise<PollOutcome> {
  const intervalMs = options.intervalMs ?? AI_POLL_INTERVAL_MS;
  const deadlineMs = options.deadlineMs ?? AI_PROCESSING_DEADLINE_MS;
  const startedAt = Date.now();

  while (isActive() && Date.now() - startedAt < deadlineMs) {
    // 最初の確認を「送信直後」にしないのは、処理に必ず数十秒かかるため
    // 無駄なリクエストを増やさないため。
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!isActive()) return 'cancelled';
    if (await isDone()) return 'done';
  }

  return isActive() ? 'timeout' : 'cancelled';
}
