import { NextRequest, NextResponse } from "next/server";
import { readEnv, writeEnvValues } from "@/lib/env";
import {
  deployMonitoringStacks,
  loadCreds,
  EMAIL_PATTERN,
} from "@/lib/cdk-ops";

/**
 * GET  /api/alarm-email — 現在のアラート通知先（.env の ALARM_EMAIL）を返す
 * POST /api/alarm-email — 通知先を保存し、監視スタックだけを再デプロイする
 *
 * why:
 *   - 監視スタック（HomepageMonitoringStack / HomepageMonitoringEdgeStack）は
 *     アプリ用スタックと独立している。宛先メールを変えるためだけに setup1b
 *     （Docker ビルド込みで 30〜60 分）を流し直すのは過剰なので、軽い専用経路を持つ。
 *   - 空文字は「通知しない」を意味する。その場合も CDK 側は購読を作らないだけで
 *     デプロイは成功する（アラーム自体は残る）。
 *   - 反映に失敗したときは .env を更新しない。先に .env だけ新しい値にすると
 *     「設定したつもり」の状態が残り、実際の通知先とズレるため。
 */
export async function GET() {
  const env = readEnv();
  return NextResponse.json({ alarmEmail: env.get("ALARM_EMAIL") ?? "" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw: unknown = body?.alarmEmail;

  if (typeof raw !== "string") {
    return NextResponse.json(
      { error: "alarmEmail を文字列で指定してください" },
      { status: 400 },
    );
  }

  // why: 空は許可（＝通知しない）。値がある場合だけ形式を検証する。
  const alarmEmail = raw.trim();
  if (alarmEmail && !EMAIL_PATTERN.test(alarmEmail)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が不正です" },
      { status: 400 },
    );
  }

  const env = readEnv();
  if (!env.get("AWS_ACCESS_KEY_ID") || !env.get("AWS_SECRET_ACCESS_KEY")) {
    return NextResponse.json(
      { error: "AWS キーが設定されていません。Step 0 を完了してください" },
      { status: 400 },
    );
  }

  try {
    const creds = loadCreds();
    deployMonitoringStacks({
      creds,
      alarmEmail,
      // ディストリビューション ID は .env に保存済みのものを使う。
      // 未設定なら CDK 側が cdk-outputs.json → 既定値の順で解決する。
      distributionId: env.get("CLOUDFRONT_DISTRIBUTION_ID") || undefined,
    });
    writeEnvValues({ ALARM_EMAIL: alarmEmail });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: Buffer }).stderr?.toString?.() ?? "";
    return NextResponse.json(
      {
        error: "監視スタックのデプロイに失敗しました",
        details: [message, stderr].filter(Boolean).join("\n").slice(0, 4000),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    alarmEmail,
    message: alarmEmail
      ? `アラート通知先を ${alarmEmail} に設定しました。宛先を追加・変更した場合は、届いた確認メールの「Confirm subscription」をクリックするまで通知は届きません`
      : "アラート通知先を空にしました。メール通知は送られません（アラーム自体は有効です）",
  });
}
