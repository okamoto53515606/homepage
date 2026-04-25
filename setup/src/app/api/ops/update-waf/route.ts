import { NextRequest, NextResponse } from "next/server";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

import {
  buildExecOpts,
  loadCreds,
  runCdk,
  setCloudFrontWebAcl,
} from "@/lib/cdk-ops";
import { readEnv } from "@/lib/env";

/**
 * 運用メニュー: WAF 構成変更（SDK 直接書込み版）
 *
 * why:
 *   旧実装は InfraStack を CDK で再 deploy していたが、その過程で
 *   setup2b で SDK 直接書込みした独自ドメイン (Aliases / ViewerCertificate)
 *   が CDK 側の「期待状態（=空）」で上書きされる事故が起きた。
 *
 *   WAF 切替は CloudFront Distribution の `WebACLId` 1 フィールドだけで完結
 *   するため、CDK を介さず AWS SDK で `UpdateDistribution` する。
 *   IPSet / WebACL の中身管理だけは CDK (HomepageWafStack) に任せ、
 *   CloudFront への関連付けは SDK で行うハイブリッド構成。
 *
 *   フロー:
 *     - none: WebACLId を空に → WafStack destroy（料金抑止）
 *     - ip / captcha: WafStack deploy（CDK） → CFN から ARN 取得
 *                     → WebACLId を SDK で書込み
 *
 * リクエスト Body: { wafMode: 'none'|'ip'|'captcha', allowedIPs?: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const wafMode: string = body.wafMode ?? "none";
    const allowedIPs: string[] = Array.isArray(body.allowedIPs)
      ? body.allowedIPs
          // why: CloudFront を IPv4 限定運用にしているため IPv6 は登録しない
          .filter((ip: string) => ip.trim() && !ip.includes(":"))
      : [];

    if (!["none", "ip", "captcha"].includes(wafMode)) {
      return NextResponse.json(
        { error: "wafMode は none/ip/captcha のいずれか" },
        { status: 400 },
      );
    }
    if (wafMode === "ip" && allowedIPs.length === 0) {
      return NextResponse.json(
        { error: "IP 制限モードでは許可 IPv4 を 1 つ以上指定してください" },
        { status: 400 },
      );
    }

    const creds = loadCreds();
    const env = readEnv();
    const distributionId = env.get("CLOUDFRONT_DISTRIBUTION_ID") ?? "";
    if (!distributionId) {
      return NextResponse.json(
        { error: ".env に CLOUDFRONT_DISTRIBUTION_ID が見つかりません" },
        { status: 500 },
      );
    }

    let wafAclArn = "";
    let wafDestroyed = false;

    if (wafMode !== "none") {
      // 1. WafStack を deploy（IPSet / WebACL を CDK で管理）
      const wafExecOpts = buildExecOpts(creds, "us-east-1");
      const ctxArgs = [
        `--context wafMode=${wafMode}`,
        wafMode === "ip" ? `--context allowedIPs=${allowedIPs.join(",")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      runCdk(
        `deploy HomepageWafStack --require-approval never ${ctxArgs}`,
        wafExecOpts,
        600_000,
      );

      // 2. CFN から WebACL ARN を取得
      const cfn = new CloudFormationClient({
        region: "us-east-1",
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
        },
      });
      const desc = await cfn.send(
        new DescribeStacksCommand({ StackName: "HomepageWafStack" }),
      );
      wafAclArn =
        desc.Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === "WebAclArn")
          ?.OutputValue ?? "";
      if (!wafAclArn) {
        return NextResponse.json(
          { error: "WAF ACL ARN を取得できませんでした" },
          { status: 500 },
        );
      }

      // 3. CloudFront に WebACLId を SDK で書込み（alias は触らない）
      await setCloudFrontWebAcl({
        creds,
        distributionId,
        webAclArn: wafAclArn,
      });

      return NextResponse.json({
        success: true,
        message: "WAF を attach しました（CloudFront alias は不変）",
        wafMode,
        wafAclArn,
        distributionId,
      });
    }

    // wafMode === 'none': まず CloudFront から detach、その後 WafStack を destroy
    await setCloudFrontWebAcl({
      creds,
      distributionId,
      webAclArn: "",
    });

    try {
      const cfn = new CloudFormationClient({
        region: "us-east-1",
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
        },
      });
      let exists = false;
      try {
        await cfn.send(
          new DescribeStacksCommand({ StackName: "HomepageWafStack" }),
        );
        exists = true;
      } catch {
        exists = false;
      }
      if (exists) {
        const wafExecOpts = buildExecOpts(creds, "us-east-1");
        runCdk(`destroy HomepageWafStack --force`, wafExecOpts, 600_000);
        wafDestroyed = true;
      }
    } catch (destroyErr) {
      // why: detach 自体は成功しているので料金抑止のため手動削除を促す
      const msg =
        destroyErr instanceof Error ? destroyErr.message : String(destroyErr);
      return NextResponse.json({
        success: true,
        message:
          "CloudFront からの detach は成功しましたが、WafStack の自動削除に失敗しました。AWS コンソールから手動削除してください。",
        wafMode,
        distributionId,
        wafDestroyed: false,
        warning: msg,
      });
    }

    return NextResponse.json({
      success: true,
      message: "WAF を detach しました（CloudFront alias は不変）",
      wafMode,
      distributionId,
      wafDestroyed,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "WAF 更新に失敗しました";
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).slice(-3000)
        : "";
    return NextResponse.json(
      { error: message, details: stderr },
      { status: 500 },
    );
  }
}
