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

    // why: setup1b \u3092\u518d\u5b9f\u884c\u3057\u305f\u3068\u304d\u306b CDK \u304c\u72ec\u81ea\u30c9\u30e1\u30a4\u30f3 / \u8a3c\u660e\u66f8\u3092\u4fdd\u6301\u3067\u304d\u308b\u3088\u3046\n    //   .env \u306b CUSTOM_DOMAIN / CUSTOM_DOMAIN_CERT_ARN \u3092\u6c38\u7d9a\u5316\u3059\u308b\u3002cdk-deploy-1b \u304c\n    //   \u3053\u308c\u3092 --context \u3067 InfraStack \u306b\u6e21\u3059\u3068\u3001Distribution.domainNames /\n    //   ViewerCertificate \u304c\u4ed8\u3044\u305f\u72b6\u614b\u3067\u30c7\u30d7\u30ed\u30a4\u3055\u308c\u308b\uff08default \u306b\u5dfb\u304d\u623b\u3055\u306a\u3044\uff09\u3002\n    try {\n      writeEnvValues({\n        CUSTOM_DOMAIN: domainName,\n        CUSTOM_DOMAIN_CERT_ARN: certificateArn,\n      });\n    } catch {\n      // .env \u66f8\u304d\u8fbc\u307f\u5931\u6557\u306f setup \u5168\u4f53\u306e\u30d5\u30a9\u30eb\u30c8\u3068\u3057\u306f\u8a78\u547d\u7684\u3067\u306f\u306a\u3044\u305f\u3081\u7121\u8996\n      // \uff08UI \u306f attach \u6210\u529f\u3068\u3057\u3066\u9032\u3081\u308b\u3002\u30c7\u30b0\u308b\u3068\u3057\u3066\u3082 \"\u518d\u7d10\u4ed8\u3051\" \u30dc\u30bf\u30f3\u3067\u5fa9\u65e7\u53ef\u80fd\uff09\n    }\n\n    return NextResponse.json({\n      success: true,\n      route53AliasApplied,\n      aliases: merged,\n    });
  } catch (err) {    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
