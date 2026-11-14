/**
 * [クライアントコンポーネント] AI記事生成フォーム
 * 
 * @description
 * API Route を呼び出して記事を生成し、下書き保存します。
 * 複数画像のアップロード機能を含みます。
 */
'use client';

import { useEffect, useState, useRef } from 'react';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2, Wand2 } from 'lucide-react';
import ProcessingModal from '@/components/admin/processing-modal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// why: 「504 後も Lambda は処理を続ける」前提の待ち時間・ポーリング処理は
//      記事修正フォームと共通。値が片方だけずれないよう共通モジュールに集約する。
import { pollForCompletion } from '@/lib/ai-processing';
// why: 画像アップロード UI は記事編集画面と共通化する（スタイルも admin.css へ移設）。
import ImageUploader from '@/components/admin/image-uploader';

/**
 * 送信ボタンコンポーネント
 */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <>
      {pending && <ProcessingModal />}
      <button type="submit" disabled={pending} className="admin-btn admin-btn--primary">
        {pending ? (
          <>
            <Loader2 size={16} className="loading-spin" />
            <span>生成して下書き保存...</span>
          </>
        ) : (
          <>
            <Wand2 size={16} />
            <span>生成して下書き保存</span>
          </>
        )}
      </button>
    </>
  );
}

export default function ArticleGeneratorForm() {
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  // 504 後にバックエンドの生成処理が終わるのを待っている（ポーリング中）か
  const [polling, setPolling] = useState(false);
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  // ポーリングの世代番号。再送信や画面離脱で古いループを確実に止めるために使う。
  const pollRunRef = useRef(0);
  
  // 画像アップロード関連のState（アップロード処理自体は ImageUploader が持つ）
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);

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

  /**
   * 504 後、バックエンドで生成された記事が DB に現れるまで待つ。
   *
   * why: 生成では記事 ID がレスポンスでしか得られないため、クライアント側で
   *      先に発行した draftId を送っている。その ID で GET を叩き、404→200 に
   *      変わった瞬間（= レコード作成完了）を完了シグナルとして扱う。
   *      修正（updatedAt の変化監視）と違い、比較する前の値が不要なので単純。
   */
  async function waitForArticle(draftId: string) {
    const runId = ++pollRunRef.current;

    setPolling(true);

    const outcome = await pollForCompletion(
      async () => {
        try {
          const res = await fetch(`/api/admin/articles/${draftId}`);
          // 404 = 生成中、200 = 作成済み（本文は見ない。存在確認だけで足りる）
          return res.ok;
        } catch {
          return false;
        }
      },
      () => pollRunRef.current === runId,
    );

    if (outcome === 'cancelled') return;

    setPolling(false);

    if (outcome === 'done') {
      setNotification({ type: 'success', message: '記事の生成が完了しました。編集画面を開きます。' });
      router.push(`/admin/articles/edit/${draftId}`);
      return;
    }

    setNotification({
      type: 'error',
      message: 'AI処理の完了を自動で確認できませんでした。\n\n時間をおいて「記事一覧」を開いて確認してください。生成に失敗した場合、記事は作成されていません。',
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
    // why: 記事 ID をクライアントで先に決めて送る。CloudFront の 60 秒タイムアウトで
    //      レスポンス（articleId）を受け取れなくても、この ID で記事の作成完了を
    //      検知でき、ユーザーが「一覧から探す」手間をなくせる。
    const draftId = crypto.randomUUID();
    const body = {
      contentGoal: formData.get('contentGoal'),
      context: formData.get('context'),
      access: formData.get('access'),
      imageUrls: uploadedImageUrls.join(','),
      draftId,
    };

    try {
      const res = await fetchWithSigning('/api/admin/articles/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'error') {
        const issuesMessage = data.issues ? `\n- ${data.issues.join('\n- ')}` : '';
        setNotification({ type: 'error', message: data.message + issuesMessage });
      } else if (data.articleId) {
        router.push(`/admin/articles/edit/${data.articleId}`);
        return;
      }
    } catch {
      // fetch 自体が失敗した場合（CloudFront の 504 タイムアウトを含む）。
      // Lambda は動き続けているため記事は正常に保存される。
      setNotification({
        type: 'info',
        message: 'AI処理に時間がかかっています。\n\nCloudFront の応答は60秒で切れますが、バックエンドでは生成が継続しており、最大5分ほどで完了します（応答が切れても記事は保存されます）。\n完了すると自動で編集画面に移動します。このままお待ちください。\n\n記事一覧から確認することもできます。',
      });
      void waitForArticle(draftId);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        {/* 画像アップロードエリア（記事編集画面と同じ共通 UI） */}
        <ImageUploader
          value={uploadedImageUrls}
          onChange={setUploadedImageUrls}
          label="画像アセット (AIが記事作成時に参照します)"
          hint="記事本文で使いたい画像を追加できます"
          disabled={pending}
        />

        {/* 画像URLリストはhttpリクエストbodyで送信するため隠しフィールド不要 */}

        <div className="admin-form-group">
          <label htmlFor="contentGoal">コンテンツの目標</label>
          <textarea
            id="contentGoal"
            name="contentGoal"
            placeholder="例：サーバーサイドレンダリングがSEOに与える利点を説明する。"
            rows={3}
            required
            className="admin-textarea"
          />
        </div>
        <div className="admin-form-group">
          <label htmlFor="context">コンテキスト</label>
          <textarea
            id="context"
            name="context"
            placeholder="例：ターゲット読者はジュニアウェブ開発者。SSRを使用する人気フレームワークとしてNext.jsに言及する。"
            rows={5}
            required
            className="admin-textarea"
          />
        </div>
        
        <div className="admin-form-group">
          <label>アクセスレベル</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="radio" 
                name="access" 
                value="free" 
                defaultChecked 
              />
              無料
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="radio" 
                name="access" 
                value="paid" 
                defaultChecked={false}
              />
              有料
            </label>
          </div>
        </div>

        {/*
          通知はボタンの直上に置く。
          why: 以前はフォーム先頭（画面上部）にあったため、下までスクロールして送信した
               ユーザーが失敗・タイムアウトの案内を見逃していた（記事修正フォームと同様）。
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
            <span>AIの完了を自動で待っています（最大5分）。完了すると自動で編集画面に移動します。</span>
          </p>
        )}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <SubmitButton pending={pending} />
          <Link href="/admin/articles" className="admin-btn admin-btn--secondary">
            記事一覧を見る
          </Link>
        </div>
      </form>
    </>
  );
}
