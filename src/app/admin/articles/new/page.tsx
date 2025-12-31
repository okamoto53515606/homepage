/**
 * 新規記事作成ページ（管理画面）
 * 
 * @description
 * AI記事生成機能を含む、新しい記事を作成するためのページ。
 * 以前の /admin/generate-article の機能を統合・拡張します。
 */

import ArticleGeneratorForm from '@/components/article-generator-form';
import { Wand2 } from 'lucide-react';

export default function NewArticlePage() {
  return (
    <>
      <header className="admin-page-header">
        <h1>新規記事作成</h1>
        <p>AIを使用して記事の下書きを生成します。</p>
      </header>

      <div className="admin-card">
        {/* article-generator-form は 'use client' なので、
            このページ自体はサーバーコンポーネントとして維持できる */}
        <ArticleGeneratorForm />
      </div>
    </>
  );
}