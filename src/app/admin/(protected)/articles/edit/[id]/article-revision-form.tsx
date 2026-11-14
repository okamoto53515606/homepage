/**
 * AI記事修正フォーム（クライアントコンポーネント）
 * 
 * @description
 * AIに記事の修正を依頼するためのフォーム。
 * API Route を呼び出し、修正依頼を送信します。
 */
'use client';

import { useEffect, useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2, RefreshCw, Wand2 } from 'lucide-react';
import ProcessingModal from '@/components/admin/processing-modal';
// why: 画像アップロード UI は記事生成フォームと共通化する。以前はドロップ領域の
//      スタイルが記事生成フォームの <style jsx> にしか無く、この画面では枠も
//      背景も無い小さな領域になり「ドラッグ＆ドロップしづらい」状態だった。
import ImageUploader from '@/components/admin/image-uploader';
// why: 「504 後も Lambda は処理を続ける」前提の待ち時間・ポーリング処理は
//      記事生成フォームと共通。値が片方だけずれないよう共通モジュールに集約する。
import { pollForCompletion } from '@/lib/ai-processing';

interface ArticleRevisionFormProps {
  article: {
    id: string;
    [key: string]: unknown;
  };
}

// why: CloudFront は origin response timeout（60 秒）で 504 を返すが、Lambda 側の
//      AI 処理はそのまま継続する。クライアントはレスポンスで完了を知れないため
//      「DB の updatedAt が変わったか」をポーリングして完了を判定する。
//      待ち時間・間隔の定義は @/lib/ai-processing に集約している。

/**
 * 送信ボタン
 */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <>
      {pending && <ProcessingModal />}
      <button type="submit" disabled={pending} className="admin-btn admin-btn--primary admin-btn--full">
        {pending ? (
          <>
            <Loader2 size={16} className="loading-spin" />
            <span>AIで修正中...</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            <span>AIで修正を実行</span>
          </>
        )}
      </button>
    </>
  );
}

/**
 * 「最新の状態に更新」ボタン（常設）
 *
 * why: AI 修正が CloudFront の 60 秒タイムアウトに掛かると、ユーザーには「保存されたのか
 *      分からない」状態が残る。いつでも押せる更新ボタンを送信ボタンの隣に常設しておけば、
 *      「自動検知できなかった場合はこのボタン」と案内できる。
 *      window.location.reload() ではなく router.refresh() を使うのは、サーバーコンポーネント
 *      だけを取り直すため、入力途中の値やスクロール位置を捨てずにプレビュー・タイトルだけを
 *      最新化できるから（/admin/* は CloudFront で CACHING_DISABLED なので必ず最新が返る）。
 */
function ReloadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="admin-btn admin-btn--secondary"
      disabled={disabled || isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {isPending ? (
        <>
          <Loader2 size={16} className="loading-spin" />
          <span>更新中...</span>
        </>
      ) : (
        <>
          <RefreshCw size={16} />
          <span>最新の状態に更新</span>
        </>
      )}
    </button>
  );
}

export default function ArticleRevisionForm({ article }: ArticleRevisionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // AI 完了待ちのポーリング中かどうか（504 後のバックグラウンド処理を追跡している状態）
  const [polling, setPolling] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // ポーリングの世代番号。再送信や画面離脱で古いループを確実に止めるために使う。
  const pollRunRef = useRef(0);

  // 画像アップロード関連 State（アップロード処理自体は ImageUploader が持つ）
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);

  useEffect(() => {
    // why: 自動で消してよいのは成功通知だけ。タイムアウト案内は「あとで更新して確認する」
    //      ための情報なので、ユーザーが読む前に消えては困る。
    if (notification?.type === 'success') {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (notification) {
      // ボタン付近に出しても、ウィンドウが小さいと見切れることがあるため確実に可視化する。
      noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [notification]);

  // 画面離脱時にポーリングを止める（アンマウント後の setState と無駄なリクエストを防ぐ）
  useEffect(() => () => {
    pollRunRef.current += 1;
  }, []);

  /** 記事の updatedAt だけを取得する（ポーリング用の軽量リクエスト） */
  async function readUpdatedAt(): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/articles/${article.id}`);
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data.updatedAt === 'string' ? data.updatedAt : null;
    } catch {
      return null;
    }
  }

  /**
   * 504 後も動き続けるバックエンド処理の完了を、updatedAt の変化で検知する。
   * 検知できたら router.refresh() でプレビューを自動更新する（手動リロード不要）。
   */
  async function watchCompletion(baseline: string | null) {
    const runId = ++pollRunRef.current;
    let lastSeen = baseline;

    setPolling(true);

    const outcome = await pollForCompletion(
      async () => {
        const current = await readUpdatedAt();
        // baseline が取れなかった場合（初回 GET 失敗）は、次回以降の差分で判定する。
        const changed = Boolean(current && lastSeen && current !== lastSeen);
        if (current) lastSeen = current;
        return changed;
      },
      () => pollRunRef.current === runId,
    );

    if (outcome === 'cancelled') return;

    setPolling(false);

    if (outcome === 'done') {
      setNotification({
        type: 'success',
        message: 'AIによる修正が完了しました。プレビューを最新の内容に更新しました。',
      });
      router.refresh();
      return;
    }

    setNotification({
      type: 'error',
      message: 'AI処理の完了を自動で確認できませんでした。\n\n時間をおいて「最新の状態に更新」ボタンを押し、内容を確認してください。処理に失敗した場合、記事は変更されていません。',
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setNotification(null);
    // 古いポーリングが残っていれば止める。
    pollRunRef.current += 1;
    setPolling(false);

    const formData = new FormData(e.currentTarget);
    const body = {
      revisionRequest: formData.get('revisionRequest'),
      // 追加アップロード画像を generate と同じカンマ区切り形式で送信
      imageUrls: uploadedImageUrls.join(','),
    };

    // 修正前の updatedAt を控える。AI 処理は CloudFront のタイムアウト（60 秒）を超える
    // ことが多いため、レスポンスではなくこの値の変化で完了を判定する。
    const baseline = await readUpdatedAt();

    try {
      const res = await fetchWithSigning(`/api/admin/articles/${article.id}/revise`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'error') {
        setNotification({ type: 'error', message: data.message });
      } else {
        setNotification({ type: 'success', message: data.message || 'AIによる修正が完了しました。' });
        formRef.current?.reset();
        setUploadedImageUrls([]);
        // 旧来の window.location.reload() は入力を含めて画面を作り直していた。
        // router.refresh() ならサーバーコンポーネント（プレビュー・タイトル）だけを
        // 最新化でき、通知もそのまま表示できる。
        router.refresh();
        return;
      }
    } catch {
      // CloudFront の 504 タイムアウトを含むネットワークエラー。
      // Lambda は動き続けているため修正は正常に保存される。
      setNotification({
        type: 'info',
        message: 'AI処理に時間がかかっています。\n\nCloudFront の応答は 60 秒で切れますが、バックエンドでは処理が継続しており、最大5分ほどで完了します（応答が切れても修正内容は保存されます）。\n完了すると自動でプレビューが更新されます。このままお待ちください。\n\nすぐに確認したい場合は「最新の状態に更新」ボタンを押してください。',
      });
      void watchCompletion(baseline);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      {/* 追加画像アップロードエリア（記事生成フォームと同じ共通 UI） */}
      <ImageUploader
        value={uploadedImageUrls}
        onChange={setUploadedImageUrls}
        label="追加画像（任意・AIが修正時に参照します）"
        disabled={pending}
      />

      <div className="admin-form-group">
        <label htmlFor="revisionRequest">AIへの修正依頼</label>
        <textarea
          id="revisionRequest"
          name="revisionRequest"
          className="admin-textarea"
          rows={4}
          placeholder="例：もっと専門的な言葉を使って、読者のレベルを少し高く設定してください。"
          required
        />
        <small>現在の記事内容に対して、どのように修正してほしいか具体的に指示します。</small>
      </div>

      {/*
        通知はボタンの直上に置く。
        why: 以前はフォーム先頭（画面上部）にあったため、下までスクロールして送信ボタンを
             押したユーザーは通知に気づけず、失敗・タイムアウトを見逃していた。
      */}
      {notification && (
        <div
          ref={noticeRef}
          className={`admin-notice admin-notice--${notification.type}`}
          style={{ marginBottom: '1rem' }}
        >
          <p style={{ whiteSpace: 'pre-wrap' }}>{notification.message}</p>
        </div>
      )}

      {polling && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#0c5460' }}>
          <Loader2 size={16} className="loading-spin" />
          <span>AIの完了を自動で待っています（最大5分）。完了すると自動でプレビューが更新されます。</span>
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <SubmitButton pending={pending} />
        <ReloadButton disabled={pending} />
      </div>
    </form>
  );
}
