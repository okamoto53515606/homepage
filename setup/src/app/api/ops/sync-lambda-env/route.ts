import { NextResponse } from "next/server";
import { loadCreds, syncSafeEnvToLambdas } from "@/lib/cdk-ops";

/**
 * 運用メニュー: .env の安全キーを Lambda 両方に同期
 *
 * why:
 *   `.env` を手で書き換えた・別端末で更新したなどの理由で Lambda 環境変数と
 *   ドリフトすることがある。CDK 再デプロイを伴わずに distribution id・
 *   S3 バケット名等を即時 push したいケース向け。
 *   独自ドメイン (`CLOUDFRONT_DOMAIN`) は意図的にスコープ外。
 */
export async function POST() {
  try {
    const creds = loadCreds();
    const results = await syncSafeEnvToLambdas(creds);
    return NextResponse.json({
      success: true,
      message: "Lambda 環境変数を .env に同期しました",
      results,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Lambda env 同期に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
