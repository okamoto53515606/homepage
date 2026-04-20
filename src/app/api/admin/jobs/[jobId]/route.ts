/**
 * ジョブ状態取得 API（管理者用）
 *
 * GET /api/admin/jobs/[jobId]
 *
 * AI 記事生成/修正の非同期ジョブの状態をポーリングで確認するためのエンドポイント。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { getJob } from '@/lib/jobs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const adminUser = await getAdminUser();
  if (!adminUser.isAuthenticated) {
    return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
  }

  const { jobId } = await params;

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.jobId,
    type: job.type,
    status: job.status,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
