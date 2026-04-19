/**
 * DynamoDB クライアント
 *
 * シングルトンの DynamoDB Document Client を提供する。
 * テーブル名定数もここで管理する。
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const TABLE_PREFIX = process.env.TABLE_PREFIX || 'homepage-';

/** テーブル名 */
export const Tables = {
  settings: `${TABLE_PREFIX}settings`,
  articles: `${TABLE_PREFIX}articles`,
  articleTags: `${TABLE_PREFIX}article-tags`,
  users: `${TABLE_PREFIX}users`,
  comments: `${TABLE_PREFIX}comments`,
  payments: `${TABLE_PREFIX}payments`,
} as const;

/** GSI 名 */
export const Indexes = {
  articlesByStatusCreatedAt: 'articles-by-status-createdAt',
  articlesBySlug: 'articles-by-slug',
  commentsByCreatedAt: 'comments-by-createdAt',
  commentsByUserId: 'comments-by-userId',
} as const;

let docClient: DynamoDBDocumentClient | undefined;

/**
 * DynamoDB Document Client を取得する（シングルトン）
 */
export function getDocClient(): DynamoDBDocumentClient {
  if (docClient) return docClient;

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
  });

  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return docClient;
}
