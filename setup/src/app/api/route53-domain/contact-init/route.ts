import { NextResponse } from "next/server";
import {
  AccountClient,
  GetContactInformationCommand,
} from "@aws-sdk/client-account";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";

/**
 * setup2b Phase C: AWS アカウント連絡先を Registrant 初期値として返す
 *
 * why:
 *   セットアップ対象者は通常まだ Route 53 にドメインを持っていない（初回利用）。
 *   そこで AWS Account Management の GetContactInformation を使って、
 *   AWS アカウント開設時に登録した本人連絡先（氏名・住所・電話・会社名）を
 *   そのまま Registrant 初期値として流用する。
 *
 *   制約:
 *   - GetContactInformation は **email を返さない**（ルートアカウントの
 *     メールは API では取得不可）。email は手入力にする。
 *   - FullName を firstName / lastName に機械分割するのは順序が登録時依存
 *     のため不確実。英語順 ("First Last") を仮定して末尾スペースで分割し、
 *     利用者に確認・修正してもらう前提とする。
 *   - グローバル API のためエンドポイントは us-east-1 固定。
 */
export async function GET() {
  try {
    const creds = getAwsCreds("us-east-1");
    assertAwsCreds(creds);
    const client = new AccountClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });

    const res = await client.send(new GetContactInformationCommand({}));
    const c = res.ContactInformation;
    if (!c) {
      return NextResponse.json({ contact: null, hint: "no-account-contact" });
    }

    // FullName を姓名に近似分割
    //   why: AWS Account Management の FullName は単一文字列で保存されており、
    //        姓名の順序は登録時のフォーム入力に依存する。実機で確認した結果、
    //        英語順（"First Last" / 先頭=名 / 末尾=姓）で格納されていたため、
    //        スペース区切りで先頭=firstName、残り=lastName に割り当てる。
    //        万一逆順 ("姓 名") で保存されている場合は UI 側で利用者が
    //        手動で入れ替える前提（赤字の注意書きで案内）。
    const fullName = (c.FullName ?? "").trim();
    const lastSpace = fullName.lastIndexOf(" ");
    const firstName =
      lastSpace > 0 ? fullName.slice(0, lastSpace) : fullName;
    const lastName = lastSpace > 0 ? fullName.slice(lastSpace + 1) : "";

    return NextResponse.json({
      source: "aws-account-contact",
      contact: {
        firstName,
        lastName,
        contactType: c.CompanyName ? "COMPANY" : "PERSON",
        organizationName: c.CompanyName ?? "",
        addressLine1: c.AddressLine1 ?? "",
        addressLine2: c.AddressLine2 ?? "",
        city: c.City ?? "",
        state: c.StateOrRegion ?? "",
        countryCode: c.CountryCode ?? "JP",
        zipCode: c.PostalCode ?? "",
        phoneNumber: c.PhoneNumber ?? "",
        email: "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
