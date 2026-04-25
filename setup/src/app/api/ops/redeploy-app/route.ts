import { NextResponse } from "next/server";
import { LambdaClient, GetFunctionCommand } from "@aws-sdk/client-lambda";

import {
  buildAndPushAppImage,
  loadCreds,
  updateLambdaImage,
} from "@/lib/cdk-ops";

/**
 * 運用メニュー: アプリコード更新（CDK を介さない高速デプロイ）
 *
 * why:
 *   旧実装は CDK で InfraStack を再 deploy していたが、その過程で
 *   独自ドメイン (Aliases / ViewerCertificate) が消える事故が発生した。
 *   また 1 回 30〜60 分かかり、コードを直すだけなのに重すぎた。
 *
 *   コード修正の反映は CloudFront / DynamoDB / IAM を一切触る必要がないため、
 *   ここでは Docker build → ECR push → `UpdateFunctionCode` だけを行う。
 *
 *   - 所要時間: 数分（Docker キャッシュが効けば 1〜2 分）
 *   - サービス影響: Lambda 更新は AWS 側で atomic なのでゼロダウンタイム
 *   - CloudFront 設定（alias / WAF）は完全に不変
 *   - DynamoDB / IAM / Function URL も不変
 *
 *   CDK との整合性: 次回 CDK deploy 時はソース最新を再ビルドするので、
 *   ops で押した image は CDK 側の最新 image で上書きされる（または同等品）。
 *   CFN はドリフトを自動矯正しないため、CDK deploy をしない限り ops で
 *   push した image がそのまま動き続ける。
 *
 *   スキーマ変更（DynamoDB GSI 追加・新 Lambda・IAM 変更）は CDK 経由が必須。
 *   そのケースでは別途 setup1b を再実行するか、手動で `cdk deploy` する。
 *
 *   stripe-webhook-proxy は inline コード Lambda なのでこのフローでは扱わない。
 */
export async function POST() {
  const log: string[] = [];
  const out = (line: string) => {
    log.push(line);
  };

  try {
    const creds = loadCreds();

    // 1. Docker build → ECR push（CDK asset と同じ ECR を間借り）
    const { imageUri, tag } = await buildAndPushAppImage(creds, out);

    // 2. Lambda の image を差し替え
    out(`[ops] update-function-code: homepage-app -> ${imageUri}`);
    await updateLambdaImage({
      creds,
      functionName: "homepage-app",
      imageUri,
    });

    // 3. 反映確認: GetFunction で LastUpdateStatus を簡易チェック
    const client = new LambdaClient({
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });
    let lastStatus = "";
    for (let i = 0; i < 30; i++) {
      // why: Lambda 内部で image pull → init テストが完了するまで数十秒待つ。
      //      失敗時はコンソール側で Failed が見えるため early return しない。
      const res = await client.send(
        new GetFunctionCommand({ FunctionName: "homepage-app" }),
      );
      lastStatus = res.Configuration?.LastUpdateStatus ?? "";
      if (lastStatus !== "InProgress") break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    out(`[ops] homepage-app LastUpdateStatus=${lastStatus}`);

    return NextResponse.json({
      success: true,
      message:
        lastStatus === "Successful"
          ? "アプリコード更新が完了しました（CloudFront 設定は不変）"
          : `更新リクエスト送信済（最終ステータス: ${lastStatus}）。AWS コンソールで確認してください。`,
      imageUri,
      tag,
      lastStatus,
      log: log.join("\n"),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "アプリコード更新に失敗しました";
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).slice(-3000)
        : "";
    return NextResponse.json(
      { error: message, details: stderr || log.join("\n").slice(-3000) },
      { status: 500 },
    );
  }
}
