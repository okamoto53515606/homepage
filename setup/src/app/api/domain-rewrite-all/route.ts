import { NextRequest, NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { readEnv, writeEnvValues } from "@/lib/env";
import { getAwsCreds, assertAwsCreds } from "@/lib/aws-creds";

/**
 * setup2b Phase E: 独自ドメイン切替後の各種設定を一括書き換え
 *
 * why:
 *   独自ドメイン (https://example.com) に切り替わったあと、
 *   旧 CloudFront ドメイン (https://xxx.cloudfront.net) を参照している
 *   箇所が残っていると、ログインリダイレクト・記事内画像・Stripe Webhook 転送
 *   などが軒並み壊れる。点在する書き換え対象を 1 リクエストで安全に処理する。
 *
 *   書き換え対象（順序固定。前段が失敗したら後段は実行しない）:
 *   1. .env の CLOUDFRONT_DOMAIN を新ドメインに更新
 *      （CLOUDFRONT_DEFAULT_DOMAIN を新規キーで残し、ロールバック性を確保）
 *   2. Lambda 環境変数 (homepage-app / homepage-stripe-webhook-proxy)
 *      の CLOUDFRONT_DOMAIN を upsert（既存 env は維持）
 *   3. Cognito User Pool Client の CallbackURLs / LogoutURLs に新ドメインを追加
 *      （既存は残す。Hosted UI 側のロールバックを容易にするため）
 *   4. DynamoDB homepage-articles の content / imageAssets[].url を一括置換
 *
 *   3 はあえて旧 URL を消さない（Cognito Hosted UI のリダイレクト不一致時の
 *   復旧策として残す）。1 と 2 は実体を切り替えるため新値で上書き。
 *
 * Body: { newDomain: "example.com" }   ← スキーム抜き、ホスト名のみ
 * Response: ステップごとの success/error を含む JSON
 */

interface StepResult {
  step: string;
  success: boolean;
  message: string;
  detail?: unknown;
}

export async function POST(req: NextRequest) {
  const results: StepResult[] = [];
  try {
    const body = await req.json();
    const newDomain = (body.newDomain ?? "").trim().toLowerCase();
    if (!newDomain || newDomain.includes("/") || !newDomain.includes(".")) {
      return NextResponse.json(
        { error: "newDomain はホスト名のみで指定してください（例: www.example.com）" },
        { status: 400 },
      );
    }

    const env = readEnv();
    const oldDomain = env.get("CLOUDFRONT_DOMAIN") ?? "";
    if (!oldDomain) {
      return NextResponse.json(
        { error: ".env の CLOUDFRONT_DOMAIN が未設定です" },
        { status: 400 },
      );
    }
    const newUrl = `https://${newDomain}`;
    const oldUrl = `https://${oldDomain}`;

    const creds = getAwsCreds();
    assertAwsCreds(creds);
    const credentials = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    };
    const region = creds.region;

    // Step 1: .env 更新
    try {
      // why: SITE_URL は CLOUDFRONT_DOMAIN と完全に重複していたため廃止。
      //      公開 URL が必要な箇所は `https://${CLOUDFRONT_DOMAIN}` で組み立てる
      //      （src/lib/origin.ts 等を参照）。
      writeEnvValues({
        CLOUDFRONT_DOMAIN: newDomain,
        // ロールバック用に旧値を別キーで保存（既存 CLOUDFRONT_DEFAULT_DOMAIN があれば上書きしない）
        CLOUDFRONT_DEFAULT_DOMAIN:
          env.get("CLOUDFRONT_DEFAULT_DOMAIN") ?? oldDomain,
      });
      results.push({
        step: "env",
        success: true,
        message: `.env: CLOUDFRONT_DOMAIN を ${newDomain} に更新（旧値は CLOUDFRONT_DEFAULT_DOMAIN に退避）`,
      });
    } catch (e) {
      results.push({
        step: "env",
        success: false,
        message: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json({ results }, { status: 500 });
    }

    // Step 2: Lambda 環境変数 (両 Lambda)
    const lambda = new LambdaClient({ region, credentials });
    for (const fn of ["homepage-app", "homepage-stripe-webhook-proxy"]) {
      try {
        const cur = await lambda.send(
          new GetFunctionConfigurationCommand({ FunctionName: fn }),
        );
        const merged = {
          ...(cur.Environment?.Variables ?? {}),
          CLOUDFRONT_DOMAIN: newDomain,
        };
        await lambda.send(
          new UpdateFunctionConfigurationCommand({
            FunctionName: fn,
            Environment: { Variables: merged },
          }),
        );
        results.push({
          step: `lambda:${fn}`,
          success: true,
          message: `${fn} の CLOUDFRONT_DOMAIN を更新`,
        });
      } catch (e) {
        results.push({
          step: `lambda:${fn}`,
          success: false,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Step 3: Cognito CallbackURLs / LogoutURLs に追加
    const userPoolId = env.get("COGNITO_USER_POOL_ID") ?? "";
    const clientId = env.get("COGNITO_CLIENT_ID") ?? "";
    if (userPoolId && clientId) {
      try {
        const cog = new CognitoIdentityProviderClient({ region, credentials });
        const desc = await cog.send(
          new DescribeUserPoolClientCommand({
            UserPoolId: userPoolId,
            ClientId: clientId,
          }),
        );
        const newCallback = `${newUrl}/api/admin/auth/callback`;
        const newLogout = `${newUrl}/admin/login`;
        const callbacks = Array.from(
          new Set([...(desc.UserPoolClient?.CallbackURLs ?? []), newCallback]),
        );
        const logouts = Array.from(
          new Set([...(desc.UserPoolClient?.LogoutURLs ?? []), newLogout]),
        );
        await cog.send(
          new UpdateUserPoolClientCommand({
            UserPoolId: userPoolId,
            ClientId: clientId,
            CallbackURLs: callbacks,
            LogoutURLs: logouts,
            SupportedIdentityProviders:
              desc.UserPoolClient?.SupportedIdentityProviders,
            AllowedOAuthFlows: desc.UserPoolClient?.AllowedOAuthFlows,
            AllowedOAuthScopes: desc.UserPoolClient?.AllowedOAuthScopes,
            AllowedOAuthFlowsUserPoolClient:
              desc.UserPoolClient?.AllowedOAuthFlowsUserPoolClient,
          }),
        );
        results.push({
          step: "cognito",
          success: true,
          message: `Cognito CallbackURLs / LogoutURLs に ${newUrl} を追加（旧 URL は維持）`,
        });
      } catch (e) {
        results.push({
          step: "cognito",
          success: false,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      results.push({
        step: "cognito",
        success: false,
        message: "COGNITO_USER_POOL_ID / CLIENT_ID 未設定のためスキップ",
      });
    }

    // Step 4: DynamoDB homepage-articles の URL 一括置換
    // why: 記事本文 (content) と imageAssets[].url に旧 URL がそのまま埋まっているため、
    //      旧 → 新で文字列置換する。冪等（旧 URL が無ければ no-op）。
    const ddb = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region, credentials }),
    );
    const tablePrefix = env.get("TABLE_PREFIX") ?? "homepage-";
    try {
      const articlesTable = `${tablePrefix}articles`;
      let lastKey: Record<string, unknown> | undefined;
      let updated = 0;
      let scanned = 0;
      do {
        const res = await ddb.send(
          new ScanCommand({
            TableName: articlesTable,
            ExclusiveStartKey: lastKey,
          }),
        );
        for (const item of res.Items ?? []) {
          scanned++;
          let changed = false;
          let newContent: string | undefined = item.content as
            | string
            | undefined;
          if (newContent && newContent.includes(oldUrl)) {
            newContent = newContent.split(oldUrl).join(newUrl);
            changed = true;
          }
          let newAssets = item.imageAssets as
            | Array<{ url?: string; [k: string]: unknown }>
            | undefined;
          if (Array.isArray(newAssets)) {
            const next = newAssets.map((a) =>
              a?.url && a.url.includes(oldUrl)
                ? { ...a, url: a.url.split(oldUrl).join(newUrl) }
                : a,
            );
            if (JSON.stringify(next) !== JSON.stringify(newAssets)) {
              newAssets = next;
              changed = true;
            }
          }
          if (changed) {
            const exprNames: Record<string, string> = {};
            const exprValues: Record<string, unknown> = {};
            const sets: string[] = [];
            if (newContent !== undefined) {
              sets.push("#c = :c");
              exprNames["#c"] = "content";
              exprValues[":c"] = newContent;
            }
            if (newAssets !== undefined) {
              sets.push("#a = :a");
              exprNames["#a"] = "imageAssets";
              exprValues[":a"] = newAssets;
            }
            await ddb.send(
              new UpdateCommand({
                TableName: articlesTable,
                Key: { id: item.id },
                UpdateExpression: `SET ${sets.join(", ")}`,
                ExpressionAttributeNames: exprNames,
                ExpressionAttributeValues: exprValues,
              }),
            );
            updated++;
          }
        }
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
      results.push({
        step: "articles",
        success: true,
        message: `articles: ${scanned} 件中 ${updated} 件で URL を置換`,
      });
    } catch (e) {
      results.push({
        step: "articles",
        success: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    return NextResponse.json({ results, oldDomain, newDomain });
  } catch (err) {
    results.push({
      step: "fatal",
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ results }, { status: 500 });
  }
}
