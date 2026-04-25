import { NextRequest, NextResponse } from "next/server";
import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";

/**
 * setup2b Phase D-1: ACM 証明書をリクエスト + DNS 検証用 CNAME を返す
 *
 * why:
 *   CloudFront に独自ドメインを Alternate Domain として付けるには、
 *   us-east-1 の ACM で発行した証明書が必要（CloudFront は us-east-1 ACM 限定）。
 *   - mode=route53 のときは AWS が自動作成したホストゾーンに検証 CNAME を
 *     CDK 経由で書き込めば自動 verify される。
 *   - mode=external のときはユーザーが外部レジストラに CNAME を追加する。
 *     成功時に validation レコードを返してフロントで提示する。
 *
 *   RequestCertificate は idempotency 制御用に IdempotencyToken を受けるが、
 *   再実行時に重複した証明書を作らないよう「既存検索」は今回省略
 *   （Phase E 以降で setup-state.json に certArn を保存して再利用する想定）。
 *
 * Body: { domainName, mode: "route53" | "external" }
 * Response: {
 *   certificateArn,
 *   validation: [{ name, type, value }],
 *   route53AutoApplied: boolean
 * }
 *
 * Route 53 への CNAME 自動投入は、DescribeCertificate で
 * ResourceRecord が確定するまでポーリング（最大 10 秒）してから行う。
 * RequestCertificate 直後はまだ ResourceRecord が空のことがあるため。
 */

const ACM_REGION = "us-east-1";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const domainName = (body.domainName ?? "").trim().toLowerCase();
    const mode: "route53" | "external" = body.mode;
    if (!domainName) {
      return NextResponse.json({ error: "domainName が必要です" }, { status: 400 });
    }

    const credsRoot = getAwsCreds();
    assertAwsCreds(credsRoot);
    const credentials = {
      accessKeyId: credsRoot.accessKeyId,
      secretAccessKey: credsRoot.secretAccessKey,
    };

    const acm = new ACMClient({ region: ACM_REGION, credentials });

    // 証明書リクエスト（DNS 検証 / SAN にルートとワイルドカードを含めない素直な形）
    const reqResp = await acm.send(
      new RequestCertificateCommand({
        DomainName: domainName,
        ValidationMethod: "DNS",
        IdempotencyToken: domainName.replace(/[^a-z0-9]/gi, "").slice(0, 32),
      }),
    );
    const certificateArn = reqResp.CertificateArn!;

    // ResourceRecord が埋まるまで短時間ポーリング
    let validationRecords: { name: string; type: string; value: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const desc = await acm.send(
        new DescribeCertificateCommand({ CertificateArn: certificateArn }),
      );
      const opts = desc.Certificate?.DomainValidationOptions ?? [];
      const ready = opts.every((o) => o.ResourceRecord);
      if (ready && opts.length > 0) {
        validationRecords = opts.map((o) => ({
          name: o.ResourceRecord!.Name!,
          type: o.ResourceRecord!.Type!,
          value: o.ResourceRecord!.Value!,
        }));
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Route 53 モードならホストゾーンに CNAME 自動投入
    //
    // why: domainName が "www.example.com" のようにサブドメインを含む場合、
    //   Route 53 のホストゾーンは apex の "example.com" として存在する。
    //   完全一致だけ見ると親ゾーンを取り損ねるため、ラベルを 1 つずつ落として
    //   最長一致するゾーンを探す。
    let route53AutoApplied = false;
    if (mode === "route53" && validationRecords.length > 0) {
      const r53 = new Route53Client({ region: ACM_REGION, credentials });
      const labels = domainName.split(".");
      let matchedZoneId: string | undefined;
      for (let i = 0; i < labels.length - 1; i++) {
        const candidate = labels.slice(i).join(".");
        const zoneList = await r53.send(
          new ListHostedZonesByNameCommand({ DNSName: candidate }),
        );
        const zone = zoneList.HostedZones?.find(
          (z) => z.Name === `${candidate}.` || z.Name === candidate,
        );
        if (zone?.Id) {
          matchedZoneId = zone.Id.replace("/hostedzone/", "");
          break;
        }
      }
      if (matchedZoneId) {
        await r53.send(
          new ChangeResourceRecordSetsCommand({
            HostedZoneId: matchedZoneId,
            ChangeBatch: {
              Changes: validationRecords.map((rec) => ({
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: rec.name,
                  Type: "CNAME",
                  TTL: 300,
                  ResourceRecords: [{ Value: rec.value }],
                },
              })),
            },
          }),
        );
        route53AutoApplied = true;
      }
    }

    return NextResponse.json({
      certificateArn,
      validation: validationRecords,
      route53AutoApplied,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET ?certArn=... で検証ステータス確認 */
export async function GET(req: NextRequest) {
  try {
    const certArn = req.nextUrl.searchParams.get("certArn") ?? "";
    if (!certArn) {
      return NextResponse.json({ error: "certArn が必要です" }, { status: 400 });
    }
    const creds = getAwsCreds();
    assertAwsCreds(creds);
    const acm = new ACMClient({
      region: ACM_REGION,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });
    const desc = await acm.send(
      new DescribeCertificateCommand({ CertificateArn: certArn }),
    );
    const c = desc.Certificate;
    return NextResponse.json({
      status: c?.Status,
      domainName: c?.DomainName,
      validation: (c?.DomainValidationOptions ?? []).map((o) => ({
        domain: o.DomainName,
        status: o.ValidationStatus,
        resourceRecord: o.ResourceRecord
          ? {
              name: o.ResourceRecord.Name,
              type: o.ResourceRecord.Type,
              value: o.ResourceRecord.Value,
            }
          : null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
