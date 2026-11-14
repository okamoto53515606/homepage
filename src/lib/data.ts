/**
 * データ取得モジュール
 *
 * DynamoDB のデータを取得・管理する。
 * 主にサーバーコンポーネントやAPIルートから使用される。
 */

import { QueryCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, Tables, Indexes } from './dynamodb';
import { logger } from './env';

// --- 型定義 ---

export interface Comment {
  id: string;
  articleId: string;
  userId: string;
  content: string;
  countryCode: string;
  region: string;
  dailyHashId: string;
  createdAt: string;
}

export interface AdminComment extends Comment {
  articleTitle: string;
  articleSlug: string;
  ipAddress: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  access: 'free' | 'paid';
  status: 'published' | 'draft';
  tags: string[];
  imageAssets?: { url: string; fileName: string; }[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminArticleSummary {
  id: string;
  title: string;
  status: 'published' | 'draft';
  access: 'free' | 'paid';
  updatedAt: string;
}

export interface TagInfo {
  name: string;
  count: number;
}

interface PaginatedResponse<T> {
  items: T[];
  hasMore?: boolean;
  totalCount?: number;
  nextCursor?: string;
}

// --- 定数 ---

const ARTICLES_PAGE_SIZE = 30;
const ADMIN_PAGE_SIZE = 100;

// --- 利用者サイト向け関数 ---

/**
 * 公開済みの記事をカーソルベースページネーション付きで取得する
 */
export async function getArticles(options: { cursor?: string; limit?: number; tag?: string }): Promise<{ articles: Article[]; nextCursor?: string }> {
  const { cursor, limit = ARTICLES_PAGE_SIZE, tag } = options;

  try {
    if (tag) {
      // タグ指定: article_tags テーブルから記事IDを取得 → BatchGetItem
      return getArticlesByTag(tag, cursor, limit);
    } else {
      // タグなし: GSI で公開記事を createdAt 降順に取得
      return getPublishedArticles(cursor, limit);
    }
  } catch (error) {
    logger.error('[data.ts] getArticles failed:', error);
    return { articles: [] };
  }
}

/**
 * GSI で公開記事を createdAt 降順に取得する（カーソルベース）
 */
async function getPublishedArticles(cursor?: string, limit: number = ARTICLES_PAGE_SIZE): Promise<{ articles: Article[]; nextCursor?: string }> {
  const client = getDocClient();

  // カーソルをデコード
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    } catch {
      // カーソルが不正な場合は先頭から
    }
  }

  // limit + 1 件取得して hasMore を判定
  const result = await client.send(new QueryCommand({
    TableName: Tables.articles,
    IndexName: Indexes.articlesByStatusCreatedAt,
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': 'published' },
    ScanIndexForward: false,
    Limit: limit + 1,
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const items = (result.Items || []) as Article[];

  if (items.length > limit) {
    // 次ページあり: limit+1 番目のアイテムのキーをカーソルにする
    const lastItem = items[limit - 1];
    const nextKey = {
      id: lastItem.id,
      status: lastItem.status,
      createdAt: lastItem.createdAt,
    };
    const nextCursor = Buffer.from(JSON.stringify(nextKey)).toString('base64url');
    return { articles: items.slice(0, limit), nextCursor };
  }

  return { articles: items };
}

/**
 * タグ指定で公開記事を取得する（カーソルベース）
 *
 * article-tags テーブルは FilterExpression を使うため、
 * DynamoDB の LastEvaluatedKey では正確なページングが難しい。
 * そのため全件取得後にカーソル位置でスライスする。
 */
async function getArticlesByTag(tag: string, cursor?: string, limit: number = ARTICLES_PAGE_SIZE): Promise<{ articles: Article[]; nextCursor?: string }> {
  const client = getDocClient();

  // 1. article_tags テーブルから公開記事のIDを取得（createdAt 降順）
  const tagItems: Array<{ articleId: string }> = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(new QueryCommand({
      TableName: Tables.articleTags,
      KeyConditionExpression: 'tag = :tag',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':tag': tag, ':status': 'published' },
      ScanIndexForward: false,
      ExclusiveStartKey: lastKey,
    }));

    if (result.Items) {
      tagItems.push(...(result.Items as Array<{ articleId: string }>));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (tagItems.length === 0) return { articles: [] };

  // 2. BatchGetItem で記事本体を取得（25件ずつ）
  const articleIds = tagItems.map(item => item.articleId);
  const articles = await batchGetArticles(articleIds);

  // 3. article_tags の順序（createdAt 降順）を維持
  const articleMap = new Map(articles.map(a => [a.id, a]));
  const sorted = articleIds
    .map(id => articleMap.get(id))
    .filter((a): a is Article => a !== undefined);

  // 4. カーソル位置を探してスライス
  let startIndex = 0;
  if (cursor) {
    try {
      const cursorData = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      const idx = sorted.findIndex(a => a.id === cursorData.id);
      if (idx >= 0) startIndex = idx + 1;
    } catch {
      // カーソルが不正な場合は先頭から
    }
  }

  const paged = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;

  if (hasMore) {
    const lastItem = paged[paged.length - 1];
    const nextCursor = Buffer.from(JSON.stringify({ id: lastItem.id })).toString('base64url');
    return { articles: paged, nextCursor };
  }

  return { articles: paged };
}

/**
 * 記事IDの配列から BatchGetItem で記事を取得する
 */
async function batchGetArticles(ids: string[]): Promise<Article[]> {
  const client = getDocClient();
  const articles: Article[] = [];

  // DynamoDB BatchGetItem は最大25件ずつ
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const result = await client.send(new BatchGetCommand({
      RequestItems: {
        [Tables.articles]: {
          Keys: batch.map(id => ({ id })),
        },
      },
    }));

    const items = result.Responses?.[Tables.articles];
    if (items) {
      articles.push(...(items as Article[]));
    }
  }

  return articles;
}


/**
 * スラッグを指定して公開済みの記事を1件取得する
 */
export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  try {
    const client = getDocClient();
    const result = await client.send(new QueryCommand({
      TableName: Tables.articles,
      IndexName: Indexes.articlesBySlug,
      KeyConditionExpression: 'slug = :slug',
      ExpressionAttributeValues: { ':slug': slug },
      Limit: 1,
    }));

    const item = result.Items?.[0] as Article | undefined;
    if (!item || item.status !== 'published') return undefined;

    return item;
  } catch (error) {
    logger.error(`[data.ts] getArticleBySlug failed for slug "${slug}":`, error);
    return undefined;
  }
}


/**
 * 記事IDに紐づくコメントを取得する（古い順で返す）
 */
export async function getCommentsForArticle(articleId: string, limit: number = 100): Promise<Comment[]> {
  try {
    const client = getDocClient();
    const result = await client.send(new QueryCommand({
      TableName: Tables.comments,
      KeyConditionExpression: 'articleId = :articleId',
      ExpressionAttributeValues: { ':articleId': articleId },
      ScanIndexForward: false,
      Limit: limit,
    }));

    if (!result.Items || result.Items.length === 0) return [];

    const comments = (result.Items as Array<Record<string, unknown>>).map(item => ({
      ...item,
      id: item.commentId as string,
    })) as Comment[];

    // 昇順（古い順）に並び替えて返す
    return comments.reverse();
  } catch (error) {
    logger.error(`[data.ts] getCommentsForArticle failed for articleId "${articleId}":`, error);
    return [];
  }
}

/**
 * 全てのタグと記事数を取得する
 *
 * トップページのタグ一覧表示用に件数を絞る（既定 30 件）。
 * sitemap のように「取りこぼし不可」の用途は getAllTags() を使う。
 */
export async function getTags(limit: number = 30): Promise<TagInfo[]> {
  const tags = await scanTagCounts();
  return tags.slice(0, limit);
}

/**
 * 全タグと記事数を取得する（件数制限なし）
 *
 * why:
 *   sitemap.xml はタグページを漏れなく列挙する必要があるため、
 *   トップページ用の getTags(limit) の上限（30 件）を持ち込まない。
 */
export async function getAllTags(): Promise<TagInfo[]> {
  return scanTagCounts();
}

/**
 * article_tags テーブルを Scan してタグ別の記事数を集計する（内部共通処理）
 */
async function scanTagCounts(): Promise<TagInfo[]> {
  try {
    const client = getDocClient();
    const tagCounts: Record<string, number> = {};
    let lastKey: Record<string, unknown> | undefined;

    // article_tags テーブルを Scan し、公開記事のタグを集計
    do {
      const result = await client.send(new ScanCommand({
        TableName: Tables.articleTags,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'published' },
        ProjectionExpression: 'tag',
        ExclusiveStartKey: lastKey,
      }));

      if (result.Items) {
        for (const item of result.Items) {
          const tag = item.tag as string;
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    logger.error('[data.ts] getTags failed:', error);
    return [];
  }
}

/**
 * sitemap.xml 用に、公開記事の slug と更新日時を全件取得する
 *
 * why:
 *   - 画面表示用の getArticles() は 30 件で打ち切るため、sitemap に流用すると
 *     31 件目以降の記事が検索エンジンに認識されない。GSI を LastEvaluatedKey で
 *     全ページ走査する。
 *   - 本文（content）は数 KB〜数十 KB あり、sitemap では不要なので
 *     ProjectionExpression で slug / updatedAt / createdAt だけに絞る
 *     （GSI は ProjectionType.ALL なので射影可能）。
 *   - maxItems は暴走防止のフェイルセーフ（Google の 1 ファイル上限は 50,000 URL）。
 */
export async function getAllPublishedArticlesForSitemap(
  maxItems: number = 5000,
): Promise<Array<{ slug: string; updatedAt?: string; createdAt?: string }>> {
  const client = getDocClient();
  const results: Array<{ slug: string; updatedAt?: string; createdAt?: string }> = [];
  let lastKey: Record<string, unknown> | undefined;

  try {
    do {
      const result = await client.send(new QueryCommand({
        TableName: Tables.articles,
        IndexName: Indexes.articlesByStatusCreatedAt,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'published' },
        ProjectionExpression: 'slug, updatedAt, createdAt',
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }));

      for (const item of (result.Items || []) as Array<{ slug?: string; updatedAt?: string; createdAt?: string }>) {
        // why: slug は GSI2（articles-by-slug）のキーで空文字不可。
        //   欠損レコードが混ざっていても sitemap に壊れた URL を出さないよう除外する。
        if (!item.slug) continue;
        results.push({ slug: item.slug, updatedAt: item.updatedAt, createdAt: item.createdAt });
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey && results.length < maxItems);

    return results.slice(0, maxItems);
  } catch (error) {
    logger.error('[data.ts] getAllPublishedArticlesForSitemap failed:', error);
    // why: sitemap 生成の失敗でサイト全体を 500 にしない（部分的な sitemap を返す）
    return results.slice(0, maxItems);
  }
}

// --- 管理画面向け関数 ---

/**
 * すべての記事（下書き含む）を管理画面用に取得する
 */
export async function getAdminArticles(page: number = 1): Promise<PaginatedResponse<AdminArticleSummary>> {
  try {
    const client = getDocClient();
    const limit = ADMIN_PAGE_SIZE;

    // published と draft を GSI から取得し、マージ
    const [published, drafts] = await Promise.all([
      queryArticlesByStatus(client, 'published'),
      queryArticlesByStatus(client, 'draft'),
    ]);

    // createdAt 降順でマージソート
    const all = [...published, ...drafts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const offset = (page - 1) * limit;
    const paged = all.slice(offset, offset + limit);
    const hasMore = all.length > offset + limit;

    const items: AdminArticleSummary[] = paged.map(a => ({
      id: a.id,
      title: a.title,
      status: a.status,
      access: a.access,
      updatedAt: a.updatedAt,
    }));

    return { items, hasMore };
  } catch (error) {
    logger.error('[data.ts] getAdminArticles failed:', error);
    return { items: [], hasMore: false };
  }
}

/**
 * ステータス指定で GSI から記事を取得する
 */
async function queryArticlesByStatus(
  client: ReturnType<typeof getDocClient>,
  status: string,
): Promise<Article[]> {
  const items: Article[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(new QueryCommand({
      TableName: Tables.articles,
      IndexName: Indexes.articlesByStatusCreatedAt,
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
      ExclusiveStartKey: lastKey,
    }));

    if (result.Items) {
      items.push(...(result.Items as Article[]));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}


/**
 * すべてのコメントを管理画面用に取得する
 */
export async function getAdminComments(page: number = 1): Promise<PaginatedResponse<AdminComment>> {
  try {
    const client = getDocClient();
    const limit = ADMIN_PAGE_SIZE;

    // GSI comments-by-createdAt (PK=ALL) で全コメントを取得
    const allComments: Array<Record<string, unknown>> = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await client.send(new QueryCommand({
        TableName: Tables.comments,
        IndexName: Indexes.commentsByCreatedAt,
        KeyConditionExpression: 'gsi1pk = :all',
        ExpressionAttributeValues: { ':all': 'ALL' },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }));

      if (result.Items) {
        allComments.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    const offset = (page - 1) * limit;
    const paged = allComments.slice(offset, offset + limit);
    const hasMore = allComments.length > offset + limit;

    if (paged.length === 0) {
      return { items: [], hasMore: false };
    }

    // 紐づく記事のタイトル・スラッグを取得
    const articleIds = [...new Set(paged.map(c => c.articleId as string))];
    const articlesData = await batchGetArticles(articleIds);
    const articlesMap = new Map(articlesData.map(a => [a.id, { title: a.title, slug: a.slug }]));

    const items: AdminComment[] = paged.map(c => ({
      id: c.commentId as string,
      articleId: c.articleId as string,
      userId: c.userId as string,
      content: c.content as string,
      countryCode: c.countryCode as string,
      region: c.region as string,
      dailyHashId: c.dailyHashId as string,
      createdAt: c.createdAt as string,
      ipAddress: c.ipAddress as string,
      articleTitle: articlesMap.get(c.articleId as string)?.title || '不明な記事',
      articleSlug: articlesMap.get(c.articleId as string)?.slug || '',
    }));

    return { items, hasMore };
  } catch (error) {
    logger.error('[data.ts] getAdminComments failed:', error);
    return { items: [], hasMore: false };
  }
}
