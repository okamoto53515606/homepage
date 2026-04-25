import { NextResponse } from "next/server";
import {
  Route53DomainsClient,
  ListDomainsCommand,
  GetDomainDetailCommand,
} from "@aws-sdk/client-route-53-domains";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";

/**
 * setup2b Phase C: 既存登録ドメインの ContactDetail を初期値として返す
 *
 * why:
 *   ユーザーがアカウント上で既に Route 53 に登録済みのドメインを持っている場合、
 *   そこに記録された Registrant 情報を再入力させるのは UX 上ひどい。
 *   ListDomains → 1 件目を GetDomainDetail して RegistrantContact をそのまま返すことで、
 *   フォームの初期値として流用できる。何も無い場合は空オブジェクトを返す（壊さない）。
 */
export async function GET() {
  try {
    const creds = getAwsCreds("us-east-1");
    assertAwsCreds(creds);
    const client = new Route53DomainsClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });

    const list = await client.send(new ListDomainsCommand({}));
    const first = list.Domains?.[0]?.DomainName;
    if (!first) {
      return NextResponse.json({ contact: null, hint: "no-existing-domain" });
    }
    const detail = await client.send(
      new GetDomainDetailCommand({ DomainName: first }),
    );
    const c = detail.RegistrantContact;
    if (!c) return NextResponse.json({ contact: null, hint: "no-contact" });

    return NextResponse.json({
      sourceDomain: first,
      contact: {
        firstName: c.FirstName ?? "",
        lastName: c.LastName ?? "",
        contactType: c.ContactType ?? "PERSON",
        organizationName: c.OrganizationName ?? "",
        addressLine1: c.AddressLine1 ?? "",
        addressLine2: c.AddressLine2 ?? "",
        city: c.City ?? "",
        state: c.State ?? "",
        countryCode: c.CountryCode ?? "JP",
        zipCode: c.ZipCode ?? "",
        phoneNumber: c.PhoneNumber ?? "",
        email: c.Email ?? "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
