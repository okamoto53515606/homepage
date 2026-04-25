import { NextRequest, NextResponse } from "next/server";
import {
  Route53DomainsClient,
  RegisterDomainCommand,
  GetOperationDetailCommand,
  ContactType,
  CountryCode,
} from "@aws-sdk/client-route-53-domains";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";

/**
 * setup2b Phase C: ドメイン登録（RegisterDomain）と登録進捗確認
 *
 * why:
 *   Route 53 Domains の RegisterDomain は非同期 API で、戻り値は OperationId のみ。
 *   登録完了まで通常 5〜15 分かかるため、UI 側で OperationId をポーリングする
 *   GET エンドポイントが必要。POST で登録、GET で進捗を取る素朴な作り。
 *
 *   Registrant / Admin / Tech の 3 ContactInfo は同一にできる。フロント側で
 *   「Admin/Tech は Registrant と同じ」チェックを ON のときは sameAsRegistrant=true で送り、
 *   ここで複製する。
 *
 *   ICANN ルール上、Registrant の Email アドレスには AWS から確認メールが届き、
 *   15 日以内にクリックして verify しないとドメインが suspend される。
 *   このルールはユーザーが見落とすとサイトがオフラインになる致命傷なので、
 *   レスポンスに警告フラグを必ず含めて UI 側で大きく表示する。
 *
 * Body:
 *   {
 *     domainName: "example.com",
 *     durationYears: 1,
 *     autoRenew: true,
 *     privacyProtect: true,
 *     registrant: ContactDetail,
 *     admin?: ContactDetail | null  // null なら registrant を流用
 *     tech?: ContactDetail | null
 *   }
 */

interface ContactDetail {
  firstName: string;
  lastName: string;
  contactType: string; // "PERSON" | "COMPANY" | ...
  organizationName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  countryCode: string; // ISO3166 alpha-2
  zipCode: string;
  phoneNumber: string; // +81.3xxxxxxxx
  email: string;
}

function toAwsContact(c: ContactDetail) {
  return {
    FirstName: c.firstName,
    LastName: c.lastName,
    ContactType: c.contactType as ContactType,
    OrganizationName: c.organizationName,
    AddressLine1: c.addressLine1,
    AddressLine2: c.addressLine2,
    City: c.city,
    State: c.state,
    CountryCode: c.countryCode as CountryCode,
    ZipCode: c.zipCode,
    PhoneNumber: c.phoneNumber,
    Email: c.email,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const domainName = (body.domainName ?? "").trim().toLowerCase();
    const durationYears = Math.max(1, Math.min(10, Number(body.durationYears) || 1));
    const autoRenew = body.autoRenew !== false;
    const privacyProtect = body.privacyProtect !== false;
    const registrant: ContactDetail = body.registrant;
    const admin: ContactDetail = body.admin ?? body.registrant;
    const tech: ContactDetail = body.tech ?? body.registrant;

    if (!domainName || !registrant?.email || !registrant?.firstName) {
      return NextResponse.json(
        { error: "必須項目（domainName / registrant.email / firstName）が未入力です" },
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

    const resp = await client.send(
      new RegisterDomainCommand({
        DomainName: domainName,
        DurationInYears: durationYears,
        AutoRenew: autoRenew,
        AdminContact: toAwsContact(admin),
        RegistrantContact: toAwsContact(registrant),
        TechContact: toAwsContact(tech),
        PrivacyProtectAdminContact: privacyProtect,
        PrivacyProtectRegistrantContact: privacyProtect,
        PrivacyProtectTechContact: privacyProtect,
      }),
    );

    return NextResponse.json({
      operationId: resp.OperationId,
      // why: ICANN ルールで Registrant Email の verify が 15 日以内に必要。
      //      レスポンスに含めて UI で必ず明示する（見落としで suspend される）。
      icannEmailVerificationRequired: true,
      registrantEmail: registrant.email,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET ?operationId=xxx で進捗確認 */
export async function GET(req: NextRequest) {
  try {
    const operationId = req.nextUrl.searchParams.get("operationId") ?? "";
    if (!operationId) {
      return NextResponse.json(
        { error: "operationId が必要です" },
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
    const resp = await client.send(
      new GetOperationDetailCommand({ OperationId: operationId }),
    );
    return NextResponse.json({
      status: resp.Status,
      message: resp.Message,
      type: resp.Type,
      domainName: resp.DomainName,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
