/**
 * AI非同期ジョブ管理
 *
 * CloudFront の 60 秒タイムアウト対策として、
 * AI 記事生成/修正を非同期ジョブとして管理する。
 *
 * 【フロー】
 * 1. クライアントが POST → ジョブ作成 → jobId を即座に返却
 * 2. サーバーがバックグラウンドで AI 処理を実行
 * 3. クライアントが GET /api/admin/jobs/{jobId} でポーリング
 * 4. 完了時にジョブの result を返却
 *
 * 【TTL】
 * ジョブレコードは 24 時間後に自動削除（DynamoDB TTL）
 */

import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, Tables } from './dynamodb';
import { randomUUID } from 'crypto';

export type JobStatus = 'processing' | 'completed' | 'failed';

export interface Job {
  jobId: string;
  type: string;
  status: JobStatus;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

const TTL_SECONDS = 24 * 60 * 60; // 24時間

/**
 * 新規ジョブを作成する
 */
export async function createJob(type: string): Promise<string> {
  const docClient = getDocClient();
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;

  await docClient.send(new PutCommand({
    TableName: Tables.jobs,
    Item: {
      jobId,
      type,
      status: 'processing' as JobStatus,
      createdAt: now,
      updatedAt: now,
      ttl,
    },
  }));

  return jobId;
}

/**
 * ジョブを取得する
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const docClient = getDocClient();
  const result = await docClient.send(new GetCommand({
    TableName: Tables.jobs,
    Key: { jobId },
  }));

  return (result.Item as Job) || null;
}

/**
 * ジョブを完了状態に更新する
 */
export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  const docClient = getDocClient();
  await docClient.send(new UpdateCommand({
    TableName: Tables.jobs,
    Key: { jobId },
    UpdateExpression: 'SET #status = :status, #result = :result, updatedAt = :now',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#result': 'result',
    },
    ExpressionAttributeValues: {
      ':status': 'completed' as JobStatus,
      ':result': result,
      ':now': new Date().toISOString(),
    },
  }));
}

/**
 * ジョブを失敗状態に更新する
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  const docClient = getDocClient();
  await docClient.send(new UpdateCommand({
    TableName: Tables.jobs,
    Key: { jobId },
    UpdateExpression: 'SET #status = :status, #error = :error, updatedAt = :now',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#error': 'error',
    },
    ExpressionAttributeValues: {
      ':status': 'failed' as JobStatus,
      ':error': error,
      ':now': new Date().toISOString(),
    },
  }));
}
