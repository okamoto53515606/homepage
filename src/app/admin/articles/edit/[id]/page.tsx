/**
 * 記事編集ページ（管理画面）
 * 
 * @description
 * 既存の記事を編集するためのページ。
 */

interface ArticleEditPageProps {
  params: {
    id: string;
  };
}

export default function ArticleEditPage({ params }: ArticleEditPageProps) {
  // TODO: params.id を使用して Firestore から記事データを取得する

  return (
    <>
      <header className="admin-page-header">
        <h1>記事編集</h1>
        <p>記事ID: {params.id}</p>
      </header>
      
      <div className="admin-card">
        <p>ここに記事編集フォームが実装されます。</p>
        {/* 
          - タイトル
          - スラッグ
          - コンテンツ (Markdownエディタ)
          - ステータス (公開/下書き)
          - アクセス (無料/有料)
          - タグ
          - 画像アセット管理
          - AI再生成ボタン
        */}
      </div>
    </>
  );
}