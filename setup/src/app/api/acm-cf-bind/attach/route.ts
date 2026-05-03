import { NextRequest, NextResponse } from "next/server";
import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";
import { readEnv, writeEnvValues } from "@/lib/env";

/**
 * setup2b Phase D-2: CloudFront に独自ドメインを Alternate Domain として紐付ける
 *
 * why:
 *   ACM 証明書が ISSUED 済みになったら、CloudFront Distribution の Aliases に
 *   独自ドメインを追加し、ViewerCertificate を ACM cert ARN に切り替える必要がある。
 *
 *   CDK 再デプロイで対応する案もあったが、Docker ビルド込みで 30〜60 分かかり、
 *   万一失敗時のロールバックが重い。ここでは AWS SDK で直接 UpdateDistribution
 *   する。CDK 側の Source of Truth とはドリフトするが、CDK スタックは
 *   `customDomain` context を読まない実装のため、再 deploy 時に alias が剥がれる
 *   リスクは setup-state.json 経由で UI 側に再実行を促せば許容できる。
 *
 *   さらに mode=route53 のときはホストゾーンに A(ALIAS) レコードを自動投入して
 *   CloudFront に向ける。external のときはユーザー側 DNS 作業として案内する。
 *
 * Body: { domainName, certificateArn, distributionId, mode }
 */

// CloudFront 公式 HostedZoneId（A ALIAS レコード用、固定値）
const CLOUDFRONT_HOSTED_ZONE_ID = "Z2FDTNDATAQYW2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const domainName = (body.domainName ?? "").trim().toLowerCase();
    const certificateArn = body.certificateArn as string;
    const mode: "route53" | "external" = body.mode;
    const env = readEnv();
    const distributionId =
      (body.distributionId as string | undefined) ??
      env.get("CLOUDFRONT_DISTRIBUTION_ID") ??
      "";

    if (!domainName || !certificateArn || !distributionId) {
      return NextResponse.json(
        { error: "domainName / certificateArn / distributionId が必要です" },
        { status: 400 },
      );
    }

    const creds = getAwsCreds();
    assertAwsCreds(creds);
    const credentials = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    };

    const cf = new CloudFrontClient({ region: "us-east-1", credentials });

    // 既存 config を取り、Aliases / ViewerCertificate のみ差し替えて Update
    // why: UpdateDistribution は完全な DistributionConfig を要求するため、
    //      DescribeDistributionConfig の戻り値を流用する。
    const cur = await cf.send(
      new GetDistributionConfigCommand({ Id: distributionId }),
    );
    const config = cur.DistributionConfig;
    const ifMatch = cur.ETag;
    if (!config || !ifMatch) {
      return NextResponse.json(
        { error: "Distribution 取得に失敗" },
        { status: 500 },
      );
    }

    const existingAliases = config.Aliases?.Items ?? [];
    const merged = Array.from(new Set([...existingAliases, domainName]));

    config.Aliases = { Quantity: merged.length, Items: merged };
    config.ViewerCertificate = {
      ACMCertificateArn: certificateArn,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021",
      CertificateSource: "acm",
    };

    await cf.send(
      new UpdateDistributionCommand({
        Id: distributionId,
        IfMatch: ifMatch,
        DistributionConfig: config,
      }),
    );

    // mode=route53: ホストゾーンに A ALIAS を投入
    let route53AliasApplied = false;
    const cloudfrontDomain = env.get("CLOUDFRONT_DOMAIN") ?? "";
    if (mode === "route53" && cloudfrontDomain) {
      const r53 = new Route53Client({ region: "us-east-1", credentials });
      // ホストゾーン名は、申込んだルートドメイン名と一致する想定。
      // 入力が www.example.com の場合、ゾーンは example.com になる。
      const apex = domainName.split(".").slice(-2).join(".");
      const zoneList = await r53.send(
        new ListHostedZonesByNameCommand({ DNSName: apex }),
      );
      const zone = zoneList.HostedZones?.find(
        (z) => z.Name === `${apex}.` || z.Name === apex,
      );
      if (zone?.Id) {
        const zoneId = zone.Id.replace("/hostedzone/", "");
        await r53.send(
          new ChangeResourceRecordSetsCommand({
            HostedZoneId: zoneId,
            ChangeBatch: {
              Changes: [
                {
                  Action: "UPSERT",
                  ResourceRecordSet: {
                    Name: domainName,
                    Type: "A",
                    AliasTarget: {
                      HostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
                      DNSName: cloudfrontDomain,
                      EvaluateTargetHealth: false,
                    },
                  },
                },
              ],
            },
          }),
        );
        route53AliasApplied = true;
      }
    }

    // why: setup1b を再実行したときに CDK が独自ドメイン / 証明書を保持できるよう、
    //   .env に CUSTOM_DOMAIN / CUSTOM_DOMAIN_CERT_ARN を永続化する。cdk-deploy-1b が
    //   これを --context で InfraStack に渡すと、Distribution.domainNames /
    //   ViewerCertificate が付いた状態でデプロイされる（default に巻き戻さない）。
    try {
      writeEnvValues({
        CUSTOM_DOMAIN: domainName,
        CUSTOM_DOMAIN_CERT_ARN: certificateArn,
      });
    } catch {
      // .env 書き込み失敗は setup 全体のフォルトとしては致命的ではないため無視
      // （UI は attach 成功として進める。デグるとしても "再紐付け" ボタンで復旧可能）
    }

    return NextResponse.json({
      success: true,
      route53AliasApplied,
      aliases: merged,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
