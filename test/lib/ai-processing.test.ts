/**
 * ポーリング共通処理のテスト
 *
 * why:
 *   記事生成／記事修正のどちらも「CloudFront 504 後も Lambda は処理を続ける」前提で
 *   完了をポーリングして検知する。ここが壊れると、ユーザーは「待ち続ける」か
 *   「早すぎる諦め」のどちらかになり、原因が画面から分からない。
 *   ロジックだけを切り出してあるので、タイマーを疑似進行させて
 *   完了検知・期限切れ・中断の3分岐を高速に検証する。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  pollForCompletion,
  AI_POLL_INTERVAL_MS,
  AI_PROCESSING_DEADLINE_MS,
  LAMBDA_TIMEOUT_MS,
} from '@/lib/ai-processing';

afterEach(() => {
  vi.useRealTimers();
});

describe('定数', () => {
  it('打ち切り時刻は Lambda タイムアウト（300秒）より後', () => {
    expect(LAMBDA_TIMEOUT_MS).toBe(300 * 1000);
    expect(AI_PROCESSING_DEADLINE_MS).toBeGreaterThan(LAMBDA_TIMEOUT_MS);
    expect(AI_POLL_INTERVAL_MS).toBeLessThan(AI_PROCESSING_DEADLINE_MS);
  });
});

describe('pollForCompletion', () => {
  it('完了を検知したら done を返す', async () => {
    vi.useFakeTimers();
    const isDone = vi.fn(async () => true);

    const promise = pollForCompletion(isDone, () => true, { intervalMs: 100, deadlineMs: 1000 });
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBe('done');
    expect(isDone).toHaveBeenCalledTimes(1);
  });

  it('完了するまで繰り返し確認する（3回目で完了）', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const isDone = vi.fn(async () => {
      calls += 1;
      return calls === 3;
    });

    const promise = pollForCompletion(isDone, () => true, { intervalMs: 100, deadlineMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe('done');
    expect(isDone).toHaveBeenCalledTimes(3);
  });

  it('期限を超えたら timeout を返す（無限に待たない）', async () => {
    vi.useFakeTimers();
    const isDone = vi.fn(async () => false);

    const promise = pollForCompletion(isDone, () => true, { intervalMs: 100, deadlineMs: 300 });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBe('timeout');
  });

  it('中断されたら cancelled を返し、以降は確認しない', async () => {
    vi.useFakeTimers();
    let active = true;
    const isDone = vi.fn(async () => false);

    const promise = pollForCompletion(isDone, () => active, { intervalMs: 100, deadlineMs: 1000 });
    await vi.advanceTimersByTimeAsync(100);
    active = false;
    const callsWhenCancelled = isDone.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBe('cancelled');
    expect(isDone.mock.calls.length).toBe(callsWhenCancelled);
  });
});
