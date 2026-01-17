
import { Loader2 } from 'lucide-react';

export default function ProcessingModal() {
  return (
    // 画面全体を覆う背景（オーバーレイ）
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.6)', // 半透明の黒
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000, // 他の要素より手前に表示
    }}>
      {/* メッセージボックス */}
      <div style={{
        backgroundColor: 'white',
        color: '#333',
        padding: '2rem 3rem',
        borderRadius: '8px',
        textAlign: 'center',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Loader2 size={24} className="loading-spin" />
          <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>AIが記事を処理しています...</p>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
          AIによる処理には1分程度かかる場合があります。<br />
          完了するまで、このままお待ちください。
        </p>
      </div>
    </div>
  );
}
