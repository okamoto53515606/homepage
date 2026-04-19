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
import { Loader2, Wand2, UploadCloud, X, Image as ImageIcon } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import ProcessingModal from '@/components/admin/processing-modal';
import { useRouter } from 'next/navigation';

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
  
  // 画像アップロード関連のState
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // removed: useEffect for state (now handled in handleSubmit)
  
  /**
   * 画像リサイズと最適化
   */
  async function optimizeImage(file: File): Promise<File> {
    const options = {
      maxSizeMB: 1,          // 最大ファイルサイズ 1MB
      maxWidthOrHeight: 1024, // 最大幅・高さ 1024px
      useWebWorker: true,    // パフォーマンス向上のためWeb Workerを使用
    };
    try {
      const compressedFile = await imageCompression(file, options);
      console.log(`Image optimized: ${file.name} -> ${compressedFile.size / 1024} KB`);
      return compressedFile;
    } catch (error) {
      console.error('Image optimization error:', error);
      return file; // 最適化に失敗した場合は元のファイルを返す
    }
  }

  /**
   * ファイルアップロード処理
   */
  const handleFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setNotification(null);

    const uploadPromises = Array.from(files).map(async (file) => {
      try {
        const optimizedFile = await optimizeImage(file);

        // S3 presigned URL を取得
        const res = await fetchWithSigning('/api/admin/upload', {
          method: 'POST',
          body: JSON.stringify({
            fileName: optimizedFile.name,
            contentType: optimizedFile.type || 'image/jpeg',
          }),
        });

        const data = await res.json();
        if (data.status === 'error') {
          console.error('Upload URL generation failed:', data.message);
          return null;
        }

        // Presigned URL に直接アップロード
        await fetch(data.presignedUrl, {
          method: 'PUT',
          body: optimizedFile,
          headers: {
            'Content-Type': optimizedFile.type || 'image/jpeg',
          },
        });

        console.log(`[Upload] Uploaded: ${data.publicUrl}`);
        return data.publicUrl as string;
      } catch (error) {
        console.error('Upload failed for', file.name, error);
        return null;
      }
    });

    const urls = (await Promise.all(uploadPromises)).filter((url): url is string => url !== null);
    setUploadedImageUrls(prev => [...prev, ...urls]);
    setIsUploading(false);
  };
  
  const removeImage = (urlToRemove: string) => {
    setUploadedImageUrls(prev => prev.filter(url => url !== urlToRemove));
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isOver: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(isOver);
  };
  
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
          }
        } catch {
          setNotification({ type: 'error', message: '記事の生成または保存中にサーバーエラーが発生しました。' });
        } finally {
          setPending(false);
        }
      }}>
        {/* 画像アップロードエリア */}
        <div className="admin-form-group">
          <label>画像アセット (AIが記事作成時に参照します)</label>
          <div
            className={`admin-image-dropzone ${isDragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => handleDragEvents(e, true)}
            onDragLeave={(e) => handleDragEvents(e, false)}
            onDrop={(e) => {
              handleDragEvents(e, false);
              handleFilesUpload(e.dataTransfer.files);
            }}
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
                <Loader2 size={16} className="loading-spin"/>
                <span>アップロード中...</span>
              </div>
            )}
          </div>

          {/* アップロード済み画像プレビュー */}
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
      <style jsx>{`
        .admin-image-dropzone {
          border: 2px dashed #ced4da;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          color: #6c757d;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .admin-image-dropzone.drag-over,
        .admin-image-dropzone:hover {
          background-color: #f1f3f5;
          border-color: #007bff;
        }
        .admin-image-dropzone__uploading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .admin-image-preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }
        .admin-image-preview {
          position: relative;
          aspect-ratio: 1 / 1;
        }
        .admin-image-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 6px;
        }
        .admin-image-preview__remove {
          position: absolute;
          top: 4px;
          right: 4px;
          background: rgba(0,0,0,0.6);
          color: white;
          border: none;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .admin-image-preview:hover .admin-image-preview__remove {
          opacity: 1;
        }
      `}</style>
    </>
  );
}
