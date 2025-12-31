/**
 * 新規記事作成ページ（管理画面）
 * 
 * @description
 * AI記事生成機能を含む、新しい記事を作成するためのページ。
 * フォームから送信された内容を基にAIが下書きを生成し、
 * Firestoreに下書きとして保存、その後編集ページへリダイレクトします。
 */
import ArticleGeneratorForm from './article-generator-form';

export default function NewArticlePage() {
  return (
    <>
      <header className="admin-page-header">
        <h1>新規記事作成</h1>
        <p>AIを使用して記事の下書きを生成します。生成後、記事一覧ページに移動します。</p>
      </header>

      <div className="admin-card">
        <ArticleGeneratorForm />
      </div>
    </>
  );
}
