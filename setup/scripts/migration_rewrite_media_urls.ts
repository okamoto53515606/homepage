/**
 * ============================================================================
 * DynamoDB 記事内メディア URL 書き換えスクリプト
 * ============================================================================
 *
 * 【概要】
 * DynamoDB homepage-articles テーブル内の GCS URL を
 * CloudFront (または独自ドメイン) の /media/ URL に書き換える。
 *
 * 設計書: docs/s3-migration_v2.md
 *
 * 【書き換えルール】
 * - content（マークダウン本文）内の GCS URL を新 URL に置換
 * - imageAssets[].url の GCS URL を新 URL に置換
 * - URL 末尾のクエリパラメータ（?v20250303 等）は除去する
 * - /media/ プレフィックスを付与して CloudFront の Behavior に合わせる
 *
 * 【実行方法】
 * プロジェクトルートで実行する（依存は homepage ルートの package.json を利用）。
 *
 * ■ 初回実行（GCS URL → CloudFront URL に書き換え）
 *   $ npx tsx setup/scripts/migration_rewrite_media_urls.ts https://xxx.cloudfront.net
 *
 * ■ ドメイン変更時（旧 CloudFront URL → 新 CloudFront / 独自ドメインに書き換え）
 *   setup2b の独自ドメイン切替時にも使用する。
 *   $ npx tsx setup/scripts/migration_rewrite_media_urls.ts https://example.com --old-base https://xxx.cloudfront.net
 *
 * ■ ドライラン（書き換え内容の確認のみ、DynamoDB への書き込みなし）
 *   $ npx tsx setup/scripts/migration_rewrite_media_urls.ts https://xxx.cloudfront.net --dry-run
 *
 * 【引数】
 * - 第1引数（必須）: 新しい BASE_URL（例: https://xxx.cloudfront.net）
 * - --old-base <URL>: 置換対象の旧 BASE_URL（省略時は GCS URL をターゲット）
 * - --dry-run: 書き換え内容を表示するのみ、DynamoDB に書き込まない
 *
 * 【前提条件】
 * - AWS: aws cli が管理権限で利用可能（~/.aws/credentials 設定済み）
 * - DynamoDB: homepage-articles テーブルにデータが存在すること
 * - S3: migration_gcs_to_s3.ts によるファイルコピーが完了済みであること
 *
 * 【冪等性】
 * - 旧 URL が存在しない記事はスキップする
 * - 再実行しても二重置換は発生しない（旧 URL がマッチしなくなるため）
 *
 * ============================================================================
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// ============================================================================
// 定数
// ============================================================================

const AWS_REGION = 'ap-northeast-1';

/** DynamoDB テーブル名 */
const TABLE_NAME = 'homepage-articles';

/**
 * GCS の公開 URL プレフィックス（初回実行時のデフォルト置換対象）
 * articles/ 以下のパス部分を抽出して /media/ 付きの新 URL に書き換える
 */
const GCS_URL_PREFIX =
  'https://storage.googleapis.com/studio-4200137858-cfe20.firebasestorage.app/';

// ============================================================================
// 引数パース
// ============================================================================

interface CliArgs {
  /** 新しい BASE_URL（末尾スラッシュなし） */
  newBase: string;
  /** 置換対象の旧 BASE_URL（省略時は GCS URL） */
  oldBase: string | null;
  /** ドライランモード */
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  // --dry-run フラグの抽出
  const dryRun = args.includes('--dry-run');
  const filteredArgs = args.filter((a) => a !== '--dry-run');

  // --old-base の抽出
  let oldBase: string | null = null;
  const oldBaseIdx = filteredArgs.indexOf('--old-base');
  if (oldBaseIdx !== -1) {
    oldBase = filteredArgs[oldBaseIdx + 1];
    if (!oldBase) {
      console.error('エラー: --old-base に URL を指定してください');
      process.exit(1);
    }
    // --old-base とその値を除去
    filteredArgs.splice(oldBaseIdx, 2);
  }

  // 第1引数 = 新 BASE_URL
  const newBase = filteredArgs[0];
  if (!newBase) {
    console.error('使用方法:');
    console.error(
      '  npx tsx cli/migration_rewrite_media_urls.ts <新BASE_URL> [--old-base <旧BASE_URL>] [--dry-run]'
    );
    console.error('');
    console.error('例:');
    console.error(
      '  npx tsx cli/migration_rewrite_media_urls.ts https://d1234abcdef.cloudfront.net'
    );
    console.error(
      '  npx tsx cli/migration_rewrite_media_urls.ts https://example.com --old-base https://d1234abcdef.cloudfront.net'
    );
    process.exit(1);
  }

  // 末尾スラッシュを除去
  return {
    newBase: newBase.replace(/\/+$/, ''),
    oldBase: oldBase ? oldBase.replace(/\/+$/, '') : null,
    dryRun,
  };
}

// ============================================================================
// DynamoDB クライアント初期化
// ============================================================================

function initDynamoDB(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({ region: AWS_REGION });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
}

// ============================================================================
// URL 書き換えロジック
// ============================================================================

/**
 * GCS URL を新 URL に書き換える
 *
 * 変換例（初回実行時）:
 *   旧: https://storage.googleapis.com/studio-xxx.firebasestorage.app/articles/uid/file.png?v20250303
 *   新: https://xxx.cloudfront.net/media/articles/uid/file.png
 *
 * 変換例（ドメイン変更時）:
 *   旧: https://xxx.cloudfront.net/media/articles/uid/file.png
 *   新: https://example.com/media/articles/uid/file.png
 */
function buildReplacer(
  oldBase: string | null,
  newBase: string
): (text: string) => { text: string; count: number } {
  if (oldBase) {
    // ドメイン変更モード: oldBase → newBase の単純置換
    // /media/ プレフィックスは既についているのでそのまま
    return (text: string) => {
      let count = 0;
      const result = text.replace(
        new RegExp(escapeRegExp(oldBase), 'g'),
        () => {
          count++;
          return newBase;
        }
      );
      return { text: result, count };
    };
  }

  // 初回実行モード: GCS URL → 新 URL + /media/ プレフィックス
  // GCS URL パターン: https://storage.googleapis.com/{bucket}/articles/...(?query)?
  const pattern = new RegExp(
    escapeRegExp(GCS_URL_PREFIX) + '([^\\s\\)\\]\\"\\\']+)',
    'g'
  );

  return (text: string) => {
    let count = 0;
    const result = text.replace(pattern, (_match, pathWithQuery: string) => {
      count++;
      // クエリパラメータを除去（?v20250303 等）
      const cleanPath = pathWithQuery.split('?')[0];
      return `${newBase}/media/${cleanPath}`;
    });
    return { text: result, count };
  };
}

/** 正規表現の特殊文字をエスケープする */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// メイン処理
// ============================================================================

interface RewriteResult {
  /** 書き換えが発生した記事数 */
  articlesUpdated: number;
  /** スキップした記事数（対象 URL なし） */
  articlesSkipped: number;
  /** content 内で書き換えた URL 数 */
  contentUrlCount: number;
  /** imageAssets 内で書き換えた URL 数 */
  assetUrlCount: number;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const docClient = initDynamoDB();
  const replacer = buildReplacer(args.oldBase, args.newBase);

  console.log('='.repeat(60));
  console.log('DynamoDB 記事内メディア URL 書き換え');
  console.log('='.repeat(60));
  console.log(`  テーブル: ${TABLE_NAME}`);
  console.log(`  旧 URL ベース: ${args.oldBase || GCS_URL_PREFIX}`);
  console.log(`  新 URL ベース: ${args.newBase}`);
  console.log(`  モード: ${args.dryRun ? 'ドライラン（書き込みなし）' : '本番実行'}`);
  console.log('');

  // 全記事を取得（Scan）
  console.log('記事データを取得中...');
  const articles = await scanAllArticles(docClient);
  console.log(`  取得件数: ${articles.length}`);
  console.log('');

  const result: RewriteResult = {
    articlesUpdated: 0,
    articlesSkipped: 0,
    contentUrlCount: 0,
    assetUrlCount: 0,
  };

  for (const article of articles) {
    const id = article.id as string;
    const title = (article.title as string) || '(タイトルなし)';
    let hasChanges = false;

    // --- content（マークダウン本文）の書き換え ---
    let newContent = article.content as string | undefined;
    let contentCount = 0;
    if (newContent) {
      const contentResult = replacer(newContent);
      if (contentResult.count > 0) {
        newContent = contentResult.text;
        contentCount = contentResult.count;
        hasChanges = true;
      }
    }

    // --- imageAssets[].url の書き換え ---
    let newImageAssets = article.imageAssets as
      | Array<{ url: string; uploadedAt?: string; fileName?: string }>
      | undefined;
    let assetCount = 0;
    if (newImageAssets && Array.isArray(newImageAssets)) {
      newImageAssets = newImageAssets.map((asset) => {
        if (asset.url) {
          const urlResult = replacer(asset.url);
          if (urlResult.count > 0) {
            assetCount += urlResult.count;
            return { ...asset, url: urlResult.text };
          }
        }
        return asset;
      });
      if (assetCount > 0) {
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      result.articlesSkipped++;
      continue;
    }

    // 書き換え内容のログ出力
    console.log(`  📝 ${title} (${id})`);
    if (contentCount > 0) {
      console.log(`     content: ${contentCount} 箇所`);
    }
    if (assetCount > 0) {
      console.log(`     imageAssets: ${assetCount} 箇所`);
    }

    result.articlesUpdated++;
    result.contentUrlCount += contentCount;
    result.assetUrlCount += assetCount;

    // DynamoDB に書き戻し（ドライランでなければ）
    if (!args.dryRun) {
      const updateExprParts: string[] = [];
      const exprAttrNames: Record<string, string> = {};
      const exprAttrValues: Record<string, unknown> = {};

      if (contentCount > 0) {
        updateExprParts.push('#content = :content');
        exprAttrNames['#content'] = 'content';
        exprAttrValues[':content'] = newContent;
      }
      if (assetCount > 0) {
        updateExprParts.push('#imageAssets = :imageAssets');
        exprAttrNames['#imageAssets'] = 'imageAssets';
        exprAttrValues[':imageAssets'] = newImageAssets;
      }

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression: `SET ${updateExprParts.join(', ')}`,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        })
      );
    }
  }

  // サマリ出力
  console.log('');
  console.log('='.repeat(60));
  console.log('書き換え結果サマリ');
  console.log('='.repeat(60));
  console.log(`  更新記事数: ${result.articlesUpdated} 件`);
  console.log(`  スキップ: ${result.articlesSkipped} 件`);
  console.log(`  content URL 書き換え: ${result.contentUrlCount} 箇所`);
  console.log(`  imageAssets URL 書き換え: ${result.assetUrlCount} 箇所`);
  if (args.dryRun) {
    console.log('');
    console.log('  ⚠️  ドライランのため DynamoDB への書き込みは行っていません');
    console.log('  本番実行するには --dry-run を外して再実行してください');
  }
  console.log('='.repeat(60));
}

// ============================================================================
// DynamoDB ヘルパー
// ============================================================================

/**
 * homepage-articles テーブルの全件を Scan で取得する。
 * ページネーション対応（LastEvaluatedKey がなくなるまでループ）
 */
async function scanAllArticles(
  docClient: DynamoDBDocumentClient
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastKey,
      })
    );
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

// ============================================================================
// 実行
// ============================================================================

main().catch((err) => {
  console.error('URL 書き換え中にエラーが発生しました:', err);
  process.exit(1);
});
