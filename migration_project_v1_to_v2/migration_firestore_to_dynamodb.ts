/**
 * ============================================================================
 * Firestore → DynamoDB データ移行スクリプト
 * ============================================================================
 *
 * 【概要】
 * Firebase Firestore のデータを AWS DynamoDB に移行する。
 * 移行先の DynamoDB テーブルは CDK で事前に作成済みであること。
 * 設計書: docs/database-schema_v2.md
 *
 * 【実行方法】
 * $ npm run migrate:firestore-to-dynamodb
 *
 * 【前提条件】
 * - Firestore: サービスアカウント鍵ファイルのパスを環境変数
 *   GOOGLE_APPLICATION_CREDENTIALS に設定、またはスクリプト内の定数を修正
 * - AWS: aws cli が管理権限で利用可能（~/.aws/credentials 設定済み）
 * - DynamoDB: CDK で以下のテーブルが東京リージョン(ap-northeast-1)に作成済み
 *   - homepage-settings
 *   - homepage-articles
 *   - homepage-article-tags
 *   - homepage-users
 *   - homepage-comments
 *   - homepage-payments
 * - Secrets Manager: homepage/stripe-config シークレットが作成済み
 *
 * 【移行方針】
 *
 * ■ 全般
 * - Firestore の timestamp 型は ISO 8601 文字列に変換する
 * - Firestore のドキュメントIDはそのまま DynamoDB のキーとして使用する
 * - 移行はべき等（再実行可能）。既存データは上書きされる
 * - エラーが発生した場合、そのコレクションの移行を中断しエラーを出力する
 *
 * ■ settings コレクション
 * - site_config ドキュメントをそのまま移行
 * - PK: config_id = "site_config"
 *
 * ■ articles コレクション
 * - 全記事（published + draft）を移行する
 * - 以下のフィールドは移行しない（v2で削除）:
 *   - generationPrompt（未使用）
 *   - teaserContent（excerpt に統合済み。移行時にデータコピーは行わない。
 *     v1 で既に excerpt に適切な値が入っているため）
 * - ソート順の変更: v1 は updatedAt 順 → v2 は createdAt 順
 *   （DynamoDB の GSI で status=PK, createdAt=SK として実現）
 * - 移行時に article_tags テーブルも同時に構築する
 *
 * ■ article_tags テーブル（新規）
 * - articles の tags 配列から展開して構築する
 * - PK: tag, SK: {createdAt}#{articleId}
 * - articles 移行時に同時に書き込む
 *
 * ■ users コレクション
 * - Firebase Auth の uid をキーとしていたものを google_uid (Google OAuth sub) に変更
 * - 全ユーザーに google_uid が存在する前提（存在しない場合はエラーで停止）
 * - v1 の uid フィールドは移行しない
 * - PK: google_uid
 * - uid → google_uid のマッピングを構築し、comments / payments の移行で使用する
 *
 * ■ comments コレクション
 * - userId を Firebase Auth uid から google_uid に変換する
 *   （users 移行時に構築した uid → google_uid マッピングを使用）
 * - userId が null のコメント（退会済みユーザー）はそのまま null で移行
 * - マッピングに存在しない userId は null に変換（ログ出力あり）
 * - PK: articleId, SK: commentId（Firestore ドキュメントID）
 * - 管理画面用 GSI のために gsi1pk = "ALL" を追加
 *
 * ■ payments コレクション
 * - user_id を Firebase Auth uid から google_uid に変換する
 *   （users 移行時に構築した uid → google_uid マッピングを使用）
 * - マッピングに存在しない user_id はエラーで停止（決済データは欠損させない）
 * - PK: user_id (google_uid), SK: created_at (ISO 8601)
 * - payment_id として Firestore ドキュメントIDを保持
 *
 * ■ Stripe 連携パラメータ
 * - .env ファイル（sandbox 環境）から以下の値を読み取り、
 *   Secrets Manager の homepage/stripe-config に格納する:
 *   - STRIPE_SECRET_KEY
 *   - STRIPE_WEBHOOK_SECRET
 *   - STRIPE_TAX_RATES
 *
 * 【データ型変換ルール】
 * - Firestore timestamp → ISO 8601 文字列 (例: "2026-01-15T10:30:00.000Z")
 * - Firestore string → DynamoDB S
 * - Firestore number → DynamoDB N
 * - Firestore array → DynamoDB L
 * - Firestore map → DynamoDB M (ただし generationPrompt は除外)
 * - Firestore null → DynamoDB NULL
 *
 * ============================================================================
 */

import * as admin from 'firebase-admin';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  BatchWriteCommand,
  type BatchWriteCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  SecretsManagerClient,
  PutSecretValueCommand,
  CreateSecretCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// ============================================================================
// 定数
// ============================================================================

const AWS_REGION = 'ap-northeast-1';

/** Firestore サービスアカウント鍵ファイルのパス */
const FIRESTORE_SERVICE_ACCOUNT_KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  '/home/ubuntu/studio-4200137858-cfe20-firebase-adminsdk-fbsvc-714c9ad487.json';

/** Firestore プロジェクトID */
const FIRESTORE_PROJECT_ID = 'studio-4200137858-cfe20';

/** DynamoDB テーブル名 */
const TABLE_NAMES = {
  settings: 'homepage-settings',
  articles: 'homepage-articles',
  articleTags: 'homepage-article-tags',
  users: 'homepage-users',
  comments: 'homepage-comments',
  payments: 'homepage-payments',
} as const;

/** Secrets Manager シークレット名 */
const STRIPE_SECRET_NAME = 'homepage/stripe-config';

// ============================================================================
// クライアント初期化
// ============================================================================

function initFirestore(): admin.firestore.Firestore {
  const serviceAccount = JSON.parse(
    fs.readFileSync(FIRESTORE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8')
  );

  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      projectId: FIRESTORE_PROJECT_ID,
    },
    'migration' // 名前付きアプリ（既存アプリとの衝突防止）
  );

  return admin.firestore(app);
}

function initDynamoDB(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({ region: AWS_REGION });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
}

function initSecretsManager(): SecretsManagerClient {
  return new SecretsManagerClient({ region: AWS_REGION });
}

// ============================================================================
// ユーティリティ
// ============================================================================

/**
 * Firestore の Timestamp を ISO 8601 文字列に変換する
 */
function toISOString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value; // 既に文字列の場合
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    // Firestore の Timestamp 型（シリアライズ済み）
    const ts = value as { _seconds: number; _nanoseconds: number };
    return new Date(ts._seconds * 1000 + ts._nanoseconds / 1e6).toISOString();
  }
  return null;
}

/**
 * Firestore のデータを DynamoDB 互換の plain object に再帰変換する
 * - Timestamp → ISO 8601 文字列
 * - クラスインスタンス → plain object
 */
function sanitizeForDynamoDB(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Timestamp 変換
  const iso = toISOString(value);
  if (iso !== null && typeof value !== 'string') return iso;

  // 配列
  if (Array.isArray(value)) {
    return value.map(sanitizeForDynamoDB);
  }

  // オブジェクト（plain or class instance）
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeForDynamoDB(v);
    }
    return result;
  }

  return value;
}

/**
 * DynamoDB の BatchWriteItem は最大 25 件なので、チャンク分割する
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * BatchWrite を指数バックオフ付きリトライで実行する
 */
async function batchWriteWithRetry(
  dynamo: DynamoDBDocumentClient,
  tableName: string,
  items: Record<string, unknown>[],
  maxRetries = 3
): Promise<void> {
  const chunks25 = chunk(items, 25);

  for (const batch of chunks25) {
    let unprocessed: Record<string, unknown>[] | undefined = batch;
    let retries = 0;

    while (unprocessed && unprocessed.length > 0 && retries <= maxRetries) {
      if (retries > 0) {
        const delay = Math.pow(2, retries) * 100;
        console.log(`  ⏳ Retry ${retries}/${maxRetries} after ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }

      const batchResult: BatchWriteCommandOutput = await dynamo.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: unprocessed.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        })
      );

      const unprocessedItems =
        batchResult.UnprocessedItems?.[tableName];
      if (unprocessedItems && unprocessedItems.length > 0) {
        unprocessed = unprocessedItems.map(
          (req: { PutRequest?: { Item?: Record<string, unknown> } }) => req.PutRequest!.Item as Record<string, unknown>
        );
        retries++;
      } else {
        unprocessed = undefined;
      }
    }

    if (unprocessed && unprocessed.length > 0) {
      throw new Error(
        `BatchWrite failed after ${maxRetries} retries. ${unprocessed.length} items unprocessed.`
      );
    }
  }
}

// ============================================================================
// 移行処理: settings
// ============================================================================

async function migrateSettings(
  firestore: admin.firestore.Firestore,
  dynamo: DynamoDBDocumentClient
): Promise<void> {
  console.log('\n📦 [1/7] settings コレクションの移行...');

  const doc = await firestore.collection('settings').doc('site_config').get();

  if (!doc.exists) {
    console.log('  ⚠️ site_config ドキュメントが存在しません。スキップします。');
    return;
  }

  const data = doc.data()!;

  const item: Record<string, unknown> = {
    config_id: 'site_config',
    siteName: data.siteName || null,
    paymentAmount: data.paymentAmount ?? null,
    accessDurationDays: data.accessDurationDays ?? null,
    metaTitle: data.metaTitle || null,
    metaDescription: data.metaDescription || null,
    legalCommerceContent: data.legalCommerceContent || null,
    privacyPolicyContent: data.privacyPolicyContent || null,
    termsOfServiceContent: data.termsOfServiceContent || null,
    copyright: data.copyright || null,
    gtmId: data.gtmId || null,
    updatedAt: toISOString(data.updatedAt) || new Date().toISOString(),
  };

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAMES.settings,
      Item: item,
    })
  );

  console.log('  ✅ settings 移行完了（1件）');
}

// ============================================================================
// 移行処理: articles + article_tags
// ============================================================================

async function migrateArticles(
  firestore: admin.firestore.Firestore,
  dynamo: DynamoDBDocumentClient
): Promise<void> {
  console.log('\n📦 [2/7] articles コレクションの移行...');

  const snapshot = await firestore.collection('articles').get();

  if (snapshot.empty) {
    console.log('  ⚠️ articles が空です。スキップします。');
    return;
  }

  const articleItems: Record<string, unknown>[] = [];
  const tagItems: Record<string, unknown>[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const createdAt = toISOString(data.createdAt) || new Date().toISOString();
    const articleId = doc.id;

    // 記事データ（generationPrompt, teaserContent を除外）
    const item: Record<string, unknown> = {
      id: articleId,
      slug: data.slug || null,
      title: data.title || null,
      content: data.content || null,
      excerpt: data.excerpt || null,
      tags: sanitizeForDynamoDB(data.tags || []),
      imageAssets: sanitizeForDynamoDB(data.imageAssets || []),
      access: data.access || 'free',
      status: data.status || 'draft',
      authorId: data.authorId || null,
      createdAt,
      updatedAt: toISOString(data.updatedAt) || createdAt,
    };

    articleItems.push(item);

    // タグマッピングの構築
    const tags: string[] = data.tags || [];
    for (const tag of tags) {
      tagItems.push({
        tag,
        'createdAt#articleId': `${createdAt}#${articleId}`,
        articleId,
        status: data.status || 'draft',
      });
    }
  }

  // articles テーブルへの書き込み
  console.log(`  📝 articles: ${articleItems.length} 件を書き込み中...`);
  await batchWriteWithRetry(dynamo, TABLE_NAMES.articles, articleItems);
  console.log(`  ✅ articles 移行完了（${articleItems.length} 件）`);

  // article_tags テーブルへの書き込み
  console.log(`\n📦 [3/7] article_tags テーブルの構築...`);
  console.log(`  📝 article_tags: ${tagItems.length} 件を書き込み中...`);
  if (tagItems.length > 0) {
    await batchWriteWithRetry(dynamo, TABLE_NAMES.articleTags, tagItems);
  }
  console.log(`  ✅ article_tags 構築完了（${tagItems.length} 件）`);
}

// ============================================================================
// 移行処理: users（+ uid → google_uid マッピング構築）
// ============================================================================

interface UidMapping {
  [firebaseUid: string]: string; // firebase uid → google_uid
}

async function migrateUsers(
  firestore: admin.firestore.Firestore,
  dynamo: DynamoDBDocumentClient
): Promise<UidMapping> {
  console.log('\n📦 [4/7] users コレクションの移行...');

  const snapshot = await firestore.collection('users').get();

  if (snapshot.empty) {
    console.log('  ⚠️ users が空です。スキップします。');
    return {};
  }

  const userItems: Record<string, unknown>[] = [];
  const uidMapping: UidMapping = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const firebaseUid = doc.id; // Firestore ドキュメントID = Firebase Auth uid

    // google_uid の存在チェック（必須）
    if (!data.google_uid) {
      throw new Error(
        `❌ ユーザー ${firebaseUid} (${data.email}) に google_uid がありません。` +
        `全ユーザーに google_uid が存在する前提のため、移行を中断します。`
      );
    }

    const googleUid = data.google_uid as string;
    uidMapping[firebaseUid] = googleUid;

    const item: Record<string, unknown> = {
      google_uid: googleUid,
      email: data.email || null,
      displayName: data.displayName || null,
      photoURL: data.photoURL || null,
      access_expiry: toISOString(data.access_expiry),
      created_at: toISOString(data.created_at) || new Date().toISOString(),
      updated_at: toISOString(data.updated_at) || new Date().toISOString(),
    };

    userItems.push(item);
  }

  console.log(`  📝 users: ${userItems.length} 件を書き込み中...`);
  await batchWriteWithRetry(dynamo, TABLE_NAMES.users, userItems);
  console.log(`  ✅ users 移行完了（${userItems.length} 件）`);
  console.log(`  📋 uid → google_uid マッピング: ${Object.keys(uidMapping).length} 件構築`);

  return uidMapping;
}

// ============================================================================
// 移行処理: comments
// ============================================================================

async function migrateComments(
  firestore: admin.firestore.Firestore,
  dynamo: DynamoDBDocumentClient,
  uidMapping: UidMapping
): Promise<void> {
  console.log('\n📦 [5/7] comments コレクションの移行...');

  const snapshot = await firestore.collection('comments').get();

  if (snapshot.empty) {
    console.log('  ⚠️ comments が空です。スキップします。');
    return;
  }

  const commentItems: Record<string, unknown>[] = [];
  let nullifiedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const commentId = doc.id;
    const createdAt = toISOString(data.createdAt) || new Date().toISOString();

    // userId の変換
    let userId: string | null = null;
    if (data.userId) {
      const mapped = uidMapping[data.userId];
      if (mapped) {
        userId = mapped;
      } else {
        // マッピングに存在しない場合は null に変換（退会済みユーザーと同じ扱い）
        console.log(
          `  ⚠️ コメント ${commentId}: userId "${data.userId}" のマッピングが見つかりません。null に設定します。`
        );
        userId = null;
        nullifiedCount++;
      }
    }
    // data.userId が null/undefined の場合はそのまま null

    const item: Record<string, unknown> = {
      articleId: data.articleId,
      commentId,
      content: data.content || '',
      userId,
      countryCode: data.countryCode || null,
      region: data.region || null,
      dailyHashId: data.dailyHashId || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      createdAt,
      // 管理画面用 GSI
      gsi1pk: 'ALL',
    };

    commentItems.push(item);
  }

  console.log(`  📝 comments: ${commentItems.length} 件を書き込み中...`);
  await batchWriteWithRetry(dynamo, TABLE_NAMES.comments, commentItems);
  console.log(`  ✅ comments 移行完了（${commentItems.length} 件）`);
  if (nullifiedCount > 0) {
    console.log(`  ⚠️ ${nullifiedCount} 件の userId を null に変換しました`);
  }
}

// ============================================================================
// 移行処理: payments
// ============================================================================

async function migratePayments(
  firestore: admin.firestore.Firestore,
  dynamo: DynamoDBDocumentClient,
  uidMapping: UidMapping
): Promise<void> {
  console.log('\n📦 [6/7] payments コレクションの移行...');

  const snapshot = await firestore.collection('payments').get();

  if (snapshot.empty) {
    console.log('  ⚠️ payments が空です。スキップします。');
    return;
  }

  const paymentItems: Record<string, unknown>[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const paymentId = doc.id;
    const createdAt = toISOString(data.created_at) || new Date().toISOString();

    // user_id の変換（決済データは欠損させないためエラーで停止）
    if (!data.user_id) {
      throw new Error(
        `❌ 決済 ${paymentId}: user_id が null です。決済データの欠損は許容しないため、移行を中断します。`
      );
    }

    const googleUid = uidMapping[data.user_id];
    if (!googleUid) {
      throw new Error(
        `❌ 決済 ${paymentId}: user_id "${data.user_id}" の google_uid マッピングが見つかりません。` +
        `決済データの欠損は許容しないため、移行を中断します。`
      );
    }

    const item: Record<string, unknown> = {
      user_id: googleUid,
      created_at: createdAt,
      payment_id: paymentId,
      stripe_session_id: data.stripe_session_id || null,
      stripe_payment_intent_id: data.stripe_payment_intent_id || null,
      amount: data.amount ?? null,
      currency: data.currency || 'jpy',
      status: data.status || null,
      ip_address: data.ip_address || null,
    };

    paymentItems.push(item);
  }

  console.log(`  📝 payments: ${paymentItems.length} 件を書き込み中...`);
  await batchWriteWithRetry(dynamo, TABLE_NAMES.payments, paymentItems);
  console.log(`  ✅ payments 移行完了（${paymentItems.length} 件）`);
}

// ============================================================================
// 移行処理: Stripe パラメータ → Secrets Manager
// ============================================================================

async function migrateStripeConfig(
  secretsManager: SecretsManagerClient
): Promise<void> {
  console.log('\n📦 [7/7] Stripe パラメータの Secrets Manager 格納...');

  // .env ファイル（sandbox）を読み取る
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`❌ .env ファイルが見つかりません: ${envPath}`);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));

  const requiredKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_TAX_RATES',
  ];

  const stripeConfig: Record<string, string> = {};
  for (const key of requiredKeys) {
    const value = envConfig[key];
    if (!value) {
      throw new Error(
        `❌ .env に ${key} が設定されていません。Stripe sandbox のパラメータを .env に設定してください。`
      );
    }
    stripeConfig[key] = value;
  }

  const secretString = JSON.stringify(stripeConfig);

  // シークレットの存在確認
  let secretExists = false;
  try {
    await secretsManager.send(
      new DescribeSecretCommand({ SecretId: STRIPE_SECRET_NAME })
    );
    secretExists = true;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ResourceNotFoundException') {
      secretExists = false;
    } else {
      throw err;
    }
  }

  if (secretExists) {
    // 既存シークレットの更新
    await secretsManager.send(
      new PutSecretValueCommand({
        SecretId: STRIPE_SECRET_NAME,
        SecretString: secretString,
      })
    );
    console.log('  ✅ Secrets Manager 更新完了（既存シークレットを上書き）');
  } else {
    // 新規シークレットの作成
    await secretsManager.send(
      new CreateSecretCommand({
        Name: STRIPE_SECRET_NAME,
        SecretString: secretString,
        Description: 'Homepage - Stripe API keys and webhook secret (sandbox)',
      })
    );
    console.log('  ✅ Secrets Manager 作成完了（新規シークレット）');
  }

  console.log('  📋 格納したキー:');
  for (const key of requiredKeys) {
    // キー名のみ表示（値はマスク）
    const value = stripeConfig[key];
    const masked = value.substring(0, 8) + '...' + value.substring(value.length - 4);
    console.log(`     ${key}: ${masked}`);
  }
}

// ============================================================================
// メイン処理
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log(' Firestore → DynamoDB 移行スクリプト');
  console.log('='.repeat(70));
  console.log(`\n移行元: Firestore (${FIRESTORE_PROJECT_ID})`);
  console.log(`移行先: DynamoDB (${AWS_REGION})`);
  console.log(`鍵ファイル: ${FIRESTORE_SERVICE_ACCOUNT_KEY_PATH}`);
  console.log('');

  // クライアント初期化
  const firestore = initFirestore();
  const dynamo = initDynamoDB();
  const secretsManager = initSecretsManager();

  const startTime = Date.now();

  try {
    // 1. settings
    await migrateSettings(firestore, dynamo);

    // 2-3. articles + article_tags
    await migrateArticles(firestore, dynamo);

    // 4. users（uid → google_uid マッピングを返す）
    const uidMapping = await migrateUsers(firestore, dynamo);

    // 5. comments（uid → google_uid 変換にマッピングを使用）
    await migrateComments(firestore, dynamo, uidMapping);

    // 6. payments（uid → google_uid 変換にマッピングを使用）
    await migratePayments(firestore, dynamo, uidMapping);

    // 7. Stripe パラメータ → Secrets Manager
    await migrateStripeConfig(secretsManager);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(70));
    console.log(` ✅ 全ての移行が完了しました（${elapsed}秒）`);
    console.log('='.repeat(70));
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error('\n' + '='.repeat(70));
    console.error(` ❌ 移行中にエラーが発生しました（${elapsed}秒）`);
    console.error('='.repeat(70));
    console.error(error);
    process.exit(1);
  }
}

main();
