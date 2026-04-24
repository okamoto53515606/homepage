import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { randomBytes } from "crypto";
import { readEnv, writeEnvValues } from "@/lib/env";
import {
  startPhase,
  completePhase,
  addPhaseError,
  clearPhaseErrors,
  updatePhaseComment,
} from "@/lib/setup-state";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { WAFV2Client, ListWebACLsCommand } from "@aws-sdk/client-wafv2";
import {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

/**
 * setup1b: InfraStack デプロイ
 *
 * 処理の流れ:
 *   1. HomepageWafStack をデプロイ (us-east-1)
 *   2. cdk-outputs.json から WAF ACL ARN を取得
 *   3. HomepageDynamoDbStack をデプロイ (InfraStack, ap-northeast-1)
 *   4. cdk-outputs.json からリソース情報を取得 → .env に書き込み
 *   5. Cognito コールバック URL に CloudFront ドメインを追加
 *   6. setup-state.json を更新
 *
 * リクエストボディ:
 *   { wafMode: 'ip' | 'captcha', allowedIPs: string[] }
 *
 * 注意: Docker ビルドを含むため 30〜60 分かかる場合があります。
 */
export async function POST(req: NextRequest) {
  const env = readEnv();

  if (!env.get("AWS_ACCESS_KEY_ID") || !env.get("AWS_SECRET_ACCESS_KEY")) {
    return NextResponse.json(
      { error: "AWS キーが設定されていません。Step 0 を完了してください" },
      { status: 400 },
    );
  }

  const cognitoUserPoolId = env.get("COGNITO_USER_POOL_ID") ?? "";
  const cognitoClientId = env.get("COGNITO_CLIENT_ID") ?? "";
  const cognitoDomain = env.get("COGNITO_DOMAIN") ?? "";
  let jwtSecret = env.get("JWT_SECRET") ?? "";

  if (!cognitoUserPoolId || !cognitoClientId) {
    return NextResponse.json(
      { error: "Cognito 情報が見つかりません。Step 1a を完了してください" },
      { status: 400 },
    );
  }

  if (!jwtSecret) {
    jwtSecret = randomBytes(48).toString("hex");
    writeEnvValues({ JWT_SECRET: jwtSecret });
  }

  const body = await req.json().catch(() => ({}));
  const wafMode: string = body.wafMode ?? "captcha";
  const allowedIPs: string[] = Array.isArray(body.allowedIPs)
    ? body.allowedIPs.filter((ip: string) => ip.trim())
    : [];

  if (wafMode === "ip" && allowedIPs.length === 0) {
    return NextResponse.json(
      { error: "IP 制限モードでは許可 IP アドレスを 1 つ以上入力してください" },
      { status: 400 },
    );
  }

  const projectRoot = resolve(process.cwd(), "..");
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: env.get("AWS_ACCESS_KEY_ID")!,
    AWS_SECRET_ACCESS_KEY: env.get("AWS_SECRET_ACCESS_KEY")!,
    AWS_REGION: env.get("AWS_REGION") ?? "ap-northeast-1",
  };
  const execOpts = {
    cwd: projectRoot,
    env: awsEnv,
    stdio: "pipe" as const,
  };
  const wafExecOpts = {
    ...execOpts,
    env: { ...awsEnv, AWS_REGION: "us-east-1" },
  };

  startPhase("setup1b", "WAF スタックのデプロイ開始");
  clearPhaseErrors("setup1b");

  try {
    if (!env.get("JWT_SECRET")) {
      updatePhaseComment("setup1b", "JWT_SECRET を自動生成して .env に保存しました");
    }

    // =========================================================
    // Step 0: CDK Bootstrap (us-east-1 + ap-northeast-1)
    // =========================================================
    updatePhaseComment("setup1b", "CDK bootstrap を実行中 (us-east-1)...");
    execSync(
      `npx cdk bootstrap --region us-east-1`,
      { ...wafExecOpts, timeout: 300_000 },
    );

    const awsRegion = awsEnv.AWS_REGION ?? "ap-northeast-1";
    if (awsRegion !== "us-east-1") {
      updatePhaseComment("setup1b", `CDK bootstrap を実行中 (${awsRegion})...`);
      execSync(
        `npx cdk bootstrap --region ${awsRegion}`,
        { ...execOpts, timeout: 300_000 },
      );
    }

    // =========================================================
    // Step 1: HomepageWafStack デプロイ (us-east-1)
    // =========================================================
    updatePhaseComment("setup1b", "HomepageWafStack をデプロイ中...");

    const wafContextArgs = [
      `--context wafMode=${wafMode}`,
      wafMode === "ip" ? `--context allowedIPs=${allowedIPs.join(",")}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    execSync(
      `npx cdk deploy HomepageWafStack --require-approval never --outputs-file cdk-outputs.json ${wafContextArgs}`,
      { ...wafExecOpts, timeout: 300_000 }, // 5分
    );

    // WAF ACL ARN 取得（outputs-file -> WAF API の順でフォールバック）
    const wafAclArn = await resolveWafAclArn(projectRoot, wafExecOpts, {
      accessKeyId: env.get("AWS_ACCESS_KEY_ID")!,
      secretAccessKey: env.get("AWS_SECRET_ACCESS_KEY")!,
    });

    if (!wafAclArn) {
      throw new Error(
        "WAF ACL ARN が cdk-outputs.json から取得できませんでした",
      );
    }

    // =========================================================
    // Step 2: HomepageDynamoDbStack (InfraStack) デプロイ
    //
    // Docker ビルドを含むため 30〜60 分かかる場合があります。
    // =========================================================
    updatePhaseComment(
      "setup1b",
      "InfraStack をデプロイ中（Docker ビルドを含むため時間がかかります）...",
    );

    const infraContextArgs = [
      `--context wafAclArn=${wafAclArn}`,
      `--context cognitoUserPoolId=${cognitoUserPoolId}`,
      `--context cognitoClientId=${cognitoClientId}`,
      `--context cognitoDomain=${cognitoDomain}`,
      `--context jwtSecret=${jwtSecret}`,
    ]
      .filter(Boolean)
      .join(" ");

    execSync(
      `npx cdk deploy HomepageDynamoDbStack --require-approval never --outputs-file cdk-outputs.json ${infraContextArgs}`,
      { ...execOpts, timeout: 3_600_000 }, // 60分（Docker ビルド込み）
    );

    // =========================================================
    // Step 3: .env にリソース情報を書き込む
    //
    // why: `cdk deploy ... --outputs-file` は同一ファイルを 2 回指定すると
    //      2 回目の内容で上書きされる仕様（過去バージョンとの互換で挙動も揺れる）。
    //      また CDK が差分なしと判定した際にファイルを書き換えないケースが観測されたため、
    //      cdk-outputs.json から値が取れなかった場合は CloudFormation DescribeStacks
    //      で直接取得する確実なフォールバックを入れる。
    // =========================================================
    let infraOutputs: Record<string, string> = {};
    try {
      const outputs2 = JSON.parse(
        readFileSync(resolve(projectRoot, "cdk-outputs.json"), "utf-8"),
      );
      infraOutputs = outputs2?.HomepageDynamoDbStack ?? {};
    } catch {
      infraOutputs = {};
    }

    if (!infraOutputs["AppDistributionDomain"]) {
      updatePhaseComment(
        "setup1b",
        "cdk-outputs.json から取得できなかったため CloudFormation から直接取得中...",
      );
      infraOutputs = await fetchInfraStackOutputs({
        region: awsEnv.AWS_REGION,
        accessKeyId: env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: env.get("AWS_SECRET_ACCESS_KEY")!,
      });
    }

    const envUpdates: Record<string, string> = {};

    const keyMap: Record<string, string> = {
      MediaBucketName: "S3_BUCKET_NAME",
      AppDistributionId: "CLOUDFRONT_DISTRIBUTION_ID",
      AppDistributionDomain: "CLOUDFRONT_DOMAIN",
      StripeWebhookProxyUrl: "STRIPE_WEBHOOK_PROXY_URL",
    };

    for (const [cdkKey, envKey] of Object.entries(keyMap)) {
      if (infraOutputs[cdkKey]) {
        envUpdates[envKey] = infraOutputs[cdkKey];
      }
    }

    // TABLE_PREFIX は固定値
    envUpdates["TABLE_PREFIX"] = "homepage-";

    writeEnvValues(envUpdates);

    // =========================================================
    // Step 3.5: Lambda 環境変数に CLOUDFRONT_DOMAIN / CLOUDFRONT_DISTRIBUTION_ID を注入
    //
    // 理由:
    //   CDK 内で appLambda.addEnvironment(distribution.distributionDomainName) すると
    //   Lambda↔Distribution 間で CloudFormation の循環依存が発生するため、
    //   デプロイ完了後に SDK で後付けして循環を回避する。
    //   再デプロイ毎に CDK が env を巧き戻すが、この Step で必ず再設定されるので整合性は保てる。
    const lambdaFunctionName = "homepage-app"; // cdk/lib/infra-stack.ts と同じ固定名
    const cfDomain = infraOutputs["AppDistributionDomain"];
    const cfDistId = infraOutputs["AppDistributionId"];
    if (cfDomain && cfDistId) {
      await upsertLambdaEnv({
        region: env.get("AWS_REGION") ?? "ap-northeast-1",
        accessKeyId: env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: env.get("AWS_SECRET_ACCESS_KEY")!,
        functionName: lambdaFunctionName,
        upsert: {
          CLOUDFRONT_DOMAIN: cfDomain,
          CLOUDFRONT_DISTRIBUTION_ID: cfDistId,
        },
      });
    }

    // =========================================================
    // Step 4: Cognito コールバック URL に CloudFront ドメインを追加
    // =========================================================
    const cloudfrontDomain = infraOutputs["AppDistributionDomain"] ?? "";
    if (cloudfrontDomain) {
      await addCognitoCallbackUrl({
        region: env.get("AWS_REGION") ?? "ap-northeast-1",
        accessKeyId: env.get("AWS_ACCESS_KEY_ID")!,
        secretAccessKey: env.get("AWS_SECRET_ACCESS_KEY")!,
        userPoolId: cognitoUserPoolId,
        clientId: cognitoClientId,
        cloudfrontDomain,
      });
    }

    completePhase(
      "setup1b",
      `InfraStack デプロイ完了。CloudFront: ${cloudfrontDomain}`,
    );

    return NextResponse.json({
      success: true,
      message: "setup1b のデプロイが完了しました",
      cloudfrontDomain,
      envUpdates,
      wafMode,
      wafAclArn,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "CDK デプロイに失敗しました";
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).slice(-3000)
        : "";
    addPhaseError("setup1b", "cdk-deploy-1b", `${message}\n${stderr}`.trim());
    return NextResponse.json(
      { error: message, details: stderr },
      { status: 500 },
    );
  }
}

async function resolveWafAclArn(projectRoot: string, execOpts: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: "pipe";
}, awsCredentials: {
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const outputsPath = resolve(projectRoot, "cdk-outputs.json");

  if (existsSync(outputsPath)) {
    const outputs = JSON.parse(readFileSync(outputsPath, "utf-8"));
    const fromFile = findStackOutput(outputs, "HomepageWafStack", "WebAclArn");
    if (fromFile) return fromFile;
  }

  try {
    const waf = new WAFV2Client({
      region: "us-east-1",
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
      },
    });
    const listed = await waf.send(
      new ListWebACLsCommand({
        Scope: "CLOUDFRONT",
        Limit: 100,
      }),
    );
    // WAF 名は cdk/lib/waf-stack.ts の固定値
    const matched = listed.WebACLs?.find((acl) => acl.Name === "homepage-app-waf");
    if (matched?.ARN) return matched.ARN;
  } catch {
    // no-op: 最終的に呼び出し元でエラーにする
  }

  return "";
}

/**
 * why: cdk-outputs.json が無い / 古い場合でも正しい値を返すため、
 *      CloudFormation API から InfraStack(HomepageDynamoDbStack) の Outputs を
 *      直接取得する。--outputs-file の挙動はスタックが差分なしのときや
 *      複数回呼び出しで不安定になることがあり、ここがサイト URL 空欄の根本原因。
 */
async function fetchInfraStackOutputs(opts: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<Record<string, string>> {
  const cfn = new CloudFormationClient({
    region: opts.region,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });
  const res = await cfn.send(
    new DescribeStacksCommand({ StackName: "HomepageDynamoDbStack" }),
  );
  const stack = res.Stacks?.[0];
  const result: Record<string, string> = {};
  for (const o of stack?.Outputs ?? []) {
    if (o.OutputKey && o.OutputValue) result[o.OutputKey] = o.OutputValue;
  }
  return result;
}

function findStackOutput(
  outputs: Record<string, Record<string, string>>,
  stackName: string,
  key: string,
) {
  if (outputs?.[stackName]?.[key]) {
    return outputs[stackName][key];
  }

  for (const [name, values] of Object.entries(outputs ?? {})) {
    if (!name.includes(stackName)) continue;
    if (values?.[key]) return values[key];
  }

  return "";
}

/**
 * Cognito App Client のコールバック URL に CloudFront ドメインを追加する
 */
async function addCognitoCallbackUrl(opts: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  userPoolId: string;
  clientId: string;
  cloudfrontDomain: string;
}) {
  const client = new CognitoIdentityProviderClient({
    region: opts.region,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });

  // 既存の設定を取得
  const described = await client.send(
    new DescribeUserPoolClientCommand({
      UserPoolId: opts.userPoolId,
      ClientId: opts.clientId,
    }),
  );

  const existingCallbacks = described.UserPoolClient?.CallbackURLs ?? [];
  const existingLogouts = described.UserPoolClient?.LogoutURLs ?? [];

  const newCallback = `https://${opts.cloudfrontDomain}/api/admin/auth/callback`;
  const newLogout = `https://${opts.cloudfrontDomain}/admin/login`;

  const updatedCallbacks = existingCallbacks.includes(newCallback)
    ? existingCallbacks
    : [...existingCallbacks, newCallback];

  const updatedLogouts = existingLogouts.includes(newLogout)
    ? existingLogouts
    : [...existingLogouts, newLogout];

  await client.send(
    new UpdateUserPoolClientCommand({
      UserPoolId: opts.userPoolId,
      ClientId: opts.clientId,
      CallbackURLs: updatedCallbacks,
      LogoutURLs: updatedLogouts,
      // 既存設定を維持
      SupportedIdentityProviders:
        described.UserPoolClient?.SupportedIdentityProviders,
      AllowedOAuthFlows: described.UserPoolClient?.AllowedOAuthFlows,
      AllowedOAuthScopes: described.UserPoolClient?.AllowedOAuthScopes,
      AllowedOAuthFlowsUserPoolClient:
        described.UserPoolClient?.AllowedOAuthFlowsUserPoolClient,
    }),
  );
}

/**
 * Lambda 関数の環境変数に指定キーを upsert する（既存 env は保持）。
 *
 * 目的:
 *   CDK スタック内で distribution.distributionDomainName を Lambda env に直接
 *   入れると CloudFormation 循環依存が発生するため、デプロイ完了後にここで注入する。
 *   既存の env を取得してマージ更新することで、CDK が設定した他の env を壊さない。
 */
async function upsertLambdaEnv(opts: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  functionName: string;
  upsert: Record<string, string>;
}) {
  const client = new LambdaClient({
    region: opts.region,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });

  const current = await client.send(
    new GetFunctionConfigurationCommand({ FunctionName: opts.functionName }),
  );

  const merged = {
    ...(current.Environment?.Variables ?? {}),
    ...opts.upsert,
  };

  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: opts.functionName,
      Environment: { Variables: merged },
    }),
  );
}
