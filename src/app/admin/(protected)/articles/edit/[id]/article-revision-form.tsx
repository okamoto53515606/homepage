/**
 * AI記事修正フォーム（クライアントコンポーネント）
 * 
 * @description
 * AIに記事の修正を依頼するためのフォーム。
 * API Route を呼び出し、修正依頼を送信します。
 */
'use client';

import { useEffect, useState, useRef } from 'react';
import { fetchWithSigning } from '@/lib/fetch';
import { Loader2, Wand2, UploadCloud, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import ProcessingModal from '@/components/admin/processing-modal';

interface ArticleRevisionFormProps {
  article: {
    id: string;
    [key: string]: unknown;
  };
}

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

export default function ArticleRevisionForm({ article }: ArticleRevisionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 画像アップロード関連 State
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  /**
   * 画像リサイズ・最適化（generate-article-draft と同じ設定）
   */
  async function optimizeImage(file: File): Promise<File> {
    try {
      return await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true });
    } catch {
      return file;
    }
  }

  /**
   * ファイルを S3 にアップロードして publicUrl を取得する。
   * why: CloudFront OAC + SigV4 の制約でバイナリ FormData を署名できないため
   * JSON(Base64) 形式で送信する（generate-article-draft と同一の回避策）。
   */
  const handleFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setNotification(null);

    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        const optimized = await optimizeImage(file);
        const bytes = new Uint8Array(await optimized.arrayBuffer());
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const res = await fetchWithSigning('/api/admin/upload', {
          method: 'POST',
          body: JSON.stringify({ filename: optimized.name, contentType: optimized.type || 'image/jpeg', dataBase64: btoa(binary) }),
        });
        const data = await res.json();
        return data.status === 'error' ? null : (data.publicUrl as string);
      } catch {
        return null;
      }
    });

    const urls = (await Promise.all(uploadPromises)).filter((u): u is string => u !== null);
    setUploadedImageUrls(prev => [...prev, ...urls]);
    setIsUploading(false);
  };

  const removeImage = (url: string) => setUploadedImageUrls(prev => prev.filter(u => u !== url));

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isOver: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(isOver);
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setNotification(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      revisionRequest: formData.get('revisionRequest'),
      // 追加アップロード画像を generate と同じカンマ区切り形式で送信
      imageUrls: uploadedImageUrls.join(','),
    };

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
        window.location.reload();
        return;
      }
    } catch {
      // CloudFront の 504 タイムアウトを含むネットワークエラー。
      // Lambda は動き続けているため修正は正常に保存される。
      setNotification({
        type: 'error',
        message: 'AI処理に時間がかかっています。\n\n修正の保存は完了している可能性が高いため、しばらくしてからページを更新して確認してください。',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      {notification && (
        <div 
          className={`admin-notice admin-notice--${notification.type}`}
          style={{ marginBottom: '1rem' }}
        >
          <p style={{ whiteSpace: 'pre-wrap' }}>{notification.message}</p>
        </div>
      )}

      {/* 追加画像アップロードエリア */}
      <div className="admin-form-group">
        <label>追加画像（任意・AIが修正時に参照します）</label>
        <div
          className={`admin-image-dropzone ${isDragOver ? 'drag-over' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => handleDragEvents(e, true)}
          onDragLeave={(e) => handleDragEvents(e, false)}
          onDrop={(e) => { handleDragEvents(e, false); handleFilesUpload(e.dataTransfer.files); }}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => handleFilesUpload(e.target.files)}
          />
          <UploadCloud size={32} />
          <p>画像をドラッグ＆ドロップ、またはクリックして選択</p>
          {isUploading && (
            <div className="admin-image-dropzone__uploading">
              <Loader2 size={16} className="loading-spin" />
              <span>アップロード中...</span>
            </div>
          )}
        </div>
        {uploadedImageUrls.length > 0 && (
          <div className="admin-image-preview-grid">
            {uploadedImageUrls.map((url, index) => (
              <div key={index} className="admin-image-preview">
                <img src={url} alt={`Uploaded ${index + 1}`} />
                <button type="button" onClick={() => removeImage(url)} className="admin-image-preview__remove">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
      
      <SubmitButton pending={pending} />
    </form>
  );
}
