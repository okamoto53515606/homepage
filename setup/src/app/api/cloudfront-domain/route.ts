import { NextResponse } from "next/server";

/** setup UI 用: CloudFront ドメインを返す */
export async function GET() {
  return NextResponse.json({
    domain: process.env.CLOUDFRONT_DOMAIN || "",
  });
}
