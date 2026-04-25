import { NextRequest, NextResponse } from "next/server";
import {
  Route53DomainsClient,
  CheckDomainAvailabilityCommand,
  ListPricesCommand,
} from "@aws-sdk/client-route-53-domains";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";

/**
 * setup2b Phase B: 独自ドメイン取得可否 + 価格表示
 *
 * why:
 *   ユーザーが取得したいドメイン名を入力した瞬間に「取れるのか」「年額いくらか」
 *   が分からないと申込み判断ができない。Route 53 Domains の
 *   CheckDomainAvailability + ListPrices(Tld) を 1 リクエストにまとめて返すことで
 *   フロント側のコール数を減らす。
 *
 * Route 53 Domains は global サービスで API endpoint が us-east-1 固定。
 *
 * Body: { domainName: "example.com" }
 * Response: {
 *   availability: "AVAILABLE" | "UNAVAILABLE" | "RESERVED" | ...,
 *   tld: "com",
 *   price: { registrationUsd: number; renewalUsd: number } | null
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { domainName?: string };
    const domainName = (body.domainName ?? "").trim().toLowerCase();
    if (!domainName || !domainName.includes(".")) {
      return NextResponse.json(
        { error: "ドメイン名が不正です（例: example.com）" },
        { status: 400 },
      );
    }

    const creds = getAwsCreds("us-east-1");
    assertAwsCreds(creds);

    const client = new Route53DomainsClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });

    // 取得可否
    const availResp = await client.send(
      new CheckDomainAvailabilityCommand({ DomainName: domainName }),
    );

    // TLD 価格（ListPrices(Tld=...) は USD で年額返す）
    const tld = domainName.split(".").slice(-1)[0];
    let price: { registrationUsd: number; renewalUsd: number } | null = null;
    try {
      const priceResp = await client.send(new ListPricesCommand({ Tld: tld }));
      const tldPrice = priceResp.Prices?.[0];
      if (tldPrice) {
        price = {
          registrationUsd: tldPrice.RegistrationPrice?.Price ?? 0,
          renewalUsd: tldPrice.RenewalPrice?.Price ?? 0,
        };
      }
    } catch {
      // 一部 TLD は ListPrices が未対応。価格不明として続行する
      price = null;
    }

    return NextResponse.json({
      availability: availResp.Availability,
      tld,
      price,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
