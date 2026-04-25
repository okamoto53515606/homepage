import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import { readEnv } from "@/lib/env";

/**
 * POST /api/cloudfront-invalidate
 *
 * why:
 *   アプリの再デプロイ後、Lambda イメージは差し替わっていても CloudFront
 *   キャッシュに古い HTML / _next/static/* が残っているため、ブラウザに
 *   反映されない（特に JS chunk 名がハッシュ固定なので同名が返り続ける）。
 *   setup UI から /* を即時 invalidate できる窓口を用意し、
 *   CDK 再デプロイ → ワンクリックで最新化 を可能にする。
 *
 * CloudFront は Invalidation 完了まで数分かかる（グローバルエッジ伝搬）。
 * ここでは CreateInvalidation を発行して Id を返すのみで完了は待たない。
 */
export async function POST() {
  const env = readEnv();
  const distId = env.get("CLOUDFRONT_DISTRIBUTION_ID");
  const accessKeyId = env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = env.get("AWS_SECRET_ACCESS_KEY");

  if (!distId) {
    return NextResponse.json(
      { error: "CLOUDFRONT_DISTRIBUTION_ID が .env にありません。setup1b を完了してください" },
      { status: 400 },
    );
  }
  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: "AWS キーが設定されていません" },
      { status: 400 },
    );
  }

  try {
    const client = new CloudFrontClient({
      // CloudFront API は us-east-1 固定（グローバルサービス）
      region: "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
    });

    const callerReference = `setup-ui-${Date.now()}-${randomBytes(4).toString("hex")}`;

    const res = await client.send(
      new CreateInvalidationCommand({
        DistributionId: distId,
        InvalidationBatch: {
          CallerReference: callerReference,
          Paths: { Quantity: 1, Items: ["/*"] },
        },
      }),
    );

    return NextResponse.json({
      success: true,
      invalidationId: res.Invalidation?.Id ?? "",
      status: res.Invalidation?.Status ?? "",
      distributionId: distId,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "CloudFront invalidation に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
