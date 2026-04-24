import { NextResponse } from "next/server";
import { getEnvValue } from "@/lib/env";

/**
 * setup2a UI 用: Stripe Dashboard に登録する Webhook URL を返す
 *
 * why: Stripe からの Webhook は CloudFront OAC 経由の POST では
 *      x-amz-content-sha256 が付与できず 403 になる（blueprint §3.6）。
 *      setup1b の CDK デプロイで Proxy Lambda Function URL を作成し
 *      .env に STRIPE_WEBHOOK_PROXY_URL として保存しているので、
 *      setup2a 画面で Stripe Dashboard に貼り付ける値を表示する。
 */
export async function GET() {
  const url = getEnvValue("STRIPE_WEBHOOK_PROXY_URL") ?? "";
  return NextResponse.json({ url });
}
