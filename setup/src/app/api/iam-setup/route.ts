/**
 * setup1c-iam: IAM ユーザー homepage-deployer を作成し、.env の AWS キーを差し替える API
 *
 * 目的 (why):
 *   setup0 で投入した root アクセスキーは「AWS アカウント全権」を握るため、
 *   漏洩・事故時の被害が致命的。homepage 関連リソースだけ操作できる専用 IAM ユーザーに
 *   切り替え、root キーは後続手順で無効化する。セットアップを終えたユーザーが
 *   「セキュリティ対応を忘れる」ことを防ぐため、ボタン1つで自動化する。
 *
 * 動作:
 *   1. 現在の .env AWS キー (= root キー想定) で IAM クライアントを作る
 *   2. homepage-deployer ユーザーが既にあれば再利用、無ければ CreateUser
 *   3. インラインポリシー homepage-deployer-policy を PutUserPolicy で毎回上書き
 *      (ポリシーを更新した時にも再叩きで追従できる)
 *   4. 既存アクセスキーがあれば全て削除してから CreateAccessKey で新規発行
 *      (IAM ユーザーは最大2本までしかアクセスキーを持てないため)
 *   5. 新アクセスキーを .env に書き戻す
 *      → 以降のすべての setup API が自動的に新キーを使うようになる
 *   6. STS GetCallerIdentity で動作確認（IAM のキー反映には数秒ラグがあるため
 *      ここでリトライしながら検証する）
 *
 * 注意:
 *   - .env 書き換え後は setup プロセス再起動不要。readEnv() は毎回ファイルを読むため。
 *   - このエンドポイントは root キーで叩くこと。既に IAM キーに切り替え済みでも
 *     homepage-deployer は自分自身のアクセスキーを管理できるので再実行可能。
 */

import { NextResponse } from "next/server";
import {
  IAMClient,
  CreateUserCommand,
  GetUserCommand,
  PutUserPolicyCommand,
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  CreateAccessKeyCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { readEnv, writeEnvValues } from "@/lib/env";
import {
  HOMEPAGE_DEPLOYER_POLICY_DOCUMENT,
  HOMEPAGE_DEPLOYER_POLICY_NAME,
  HOMEPAGE_DEPLOYER_USER_NAME,
} from "@/lib/homepage-deployer-policy";
import { startPhase, addPhaseError, updatePhaseComment } from "@/lib/setup-state";

export async function POST() {
  const env = readEnv();
  const accessKeyId = env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = env.get("AWS_SECRET_ACCESS_KEY");
  const region = env.get("AWS_REGION") ?? "ap-northeast-1";

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: "AWS キーが設定されていません (.env 要確認)" },
      { status: 400 },
    );
  }

  startPhase("setup1c-iam", "IAM ユーザー homepage-deployer を作成中...");

  const iam = new IAMClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    // ---------------------------------------------------------------
    // 1. ユーザーの存在確認 / 作成
    //    why: CreateUser は既存だと EntityAlreadyExists を投げるので GetUser で先に見る。
    // ---------------------------------------------------------------
    let userCreated = false;
    try {
      await iam.send(new GetUserCommand({ UserName: HOMEPAGE_DEPLOYER_USER_NAME }));
      updatePhaseComment(
        "setup1c-iam",
        `既存の IAM ユーザー ${HOMEPAGE_DEPLOYER_USER_NAME} を使用します`,
      );
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "NoSuchEntityException" || name === "NoSuchEntity") {
        await iam.send(
          new CreateUserCommand({ UserName: HOMEPAGE_DEPLOYER_USER_NAME }),
        );
        userCreated = true;
        updatePhaseComment(
          "setup1c-iam",
          `IAM ユーザー ${HOMEPAGE_DEPLOYER_USER_NAME} を作成しました`,
        );
      } else {
        throw err;
      }
    }

    // ---------------------------------------------------------------
    // 2. インラインポリシーを貼り直す (常に最新ポリシーに追従させる)
    // ---------------------------------------------------------------
    await iam.send(
      new PutUserPolicyCommand({
        UserName: HOMEPAGE_DEPLOYER_USER_NAME,
        PolicyName: HOMEPAGE_DEPLOYER_POLICY_NAME,
        PolicyDocument: JSON.stringify(HOMEPAGE_DEPLOYER_POLICY_DOCUMENT),
      }),
    );
    updatePhaseComment("setup1c-iam", "インラインポリシーを付与しました");

    // ---------------------------------------------------------------
    // 3. 既存アクセスキーを全削除
    //    why: IAM は 1 ユーザー最大 2 キーまでなので再実行できるよう掃除する。
    // ---------------------------------------------------------------
    const listed = await iam.send(
      new ListAccessKeysCommand({ UserName: HOMEPAGE_DEPLOYER_USER_NAME }),
    );
    for (const key of listed.AccessKeyMetadata ?? []) {
      if (!key.AccessKeyId) continue;
      await iam.send(
        new DeleteAccessKeyCommand({
          UserName: HOMEPAGE_DEPLOYER_USER_NAME,
          AccessKeyId: key.AccessKeyId,
        }),
      );
    }

    // ---------------------------------------------------------------
    // 4. 新規アクセスキー発行
    // ---------------------------------------------------------------
    const created = await iam.send(
      new CreateAccessKeyCommand({ UserName: HOMEPAGE_DEPLOYER_USER_NAME }),
    );
    const newAccessKeyId = created.AccessKey?.AccessKeyId;
    const newSecretAccessKey = created.AccessKey?.SecretAccessKey;
    if (!newAccessKeyId || !newSecretAccessKey) {
      throw new Error("アクセスキーの発行に失敗しました");
    }

    // ---------------------------------------------------------------
    // 5. .env を差し替え
    //    why: 以降の setup API はこのキーで動作する。root キーは後続ステップで
    //         ユーザーが AWS コンソールから無効化する。
    // ---------------------------------------------------------------
    writeEnvValues({
      AWS_ACCESS_KEY_ID: newAccessKeyId,
      AWS_SECRET_ACCESS_KEY: newSecretAccessKey,
    });

    // ---------------------------------------------------------------
    // 6. STS で動作確認 (IAM の反映に数秒のラグがあるためリトライ)
    // ---------------------------------------------------------------
    let identityArn: string | undefined;
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const sts = new STSClient({
          region,
          credentials: {
            accessKeyId: newAccessKeyId,
            secretAccessKey: newSecretAccessKey,
          },
        });
        const res = await sts.send(new GetCallerIdentityCommand({}));
        identityArn = res.Arn;
        break;
      } catch {
        // IAM のキーは eventual consistency。2 秒待って再試行。
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!identityArn) {
      throw new Error(
        "新しい IAM アクセスキーでの認証確認に失敗しました（最大20秒待機）。AWS コンソールで homepage-deployer を確認してください。",
      );
    }

    updatePhaseComment(
      "setup1c-iam",
      `切り替え完了: ${identityArn}。次は root アクセスキーを無効化してください。`,
    );

    return NextResponse.json({
      success: true,
      userCreated,
      userName: HOMEPAGE_DEPLOYER_USER_NAME,
      newAccessKeyId,
      identityArn,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    addPhaseError("setup1c-iam", "create-iam-user", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
