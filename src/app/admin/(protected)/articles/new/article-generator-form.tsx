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
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  
  // 画像アップロード関連のState（アップロード処理自体は ImageUploader が持つ）
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);

  // removed: useEffect for state (now handled in handleSubmit)

  return (
    <>
      {notification && (
        <div className={`admin-notice admin-notice--${notification.type}`} style={{marginBottom: '1rem'}}>
          <p style={{whiteSpace: 'pre-wrap'}}>{notification.message}</p>
        </div>
      )}

      <form onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setNotification(null);

        const formData = new FormData(e.currentTarget);
        const body = {
          contentGoal: formData.get('contentGoal'),
          context: formData.get('context'),
          access: formData.get('access'),
          imageUrls: uploadedImageUrls.join(','),
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
            type: 'error',
            message: 'AI処理に時間がかかっています。\n\n記事の保存は完了している可能性が高いため、しばらくしてから「記事一覧」を確認してください。',
          });
        } finally {
          setPending(false);
        }
      }}>
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

        <SubmitButton pending={pending} />
      </form>
    </>
  );
}
