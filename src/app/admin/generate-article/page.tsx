/**
 * [廃止予定] 記事生成ページ
 * 
 * このページは /admin/articles/new に統合されます。
 * ここでは下書き作成のロジックのみを保持し、UIは新しいページで管理します。
 */

import { redirect } from 'next/navigation';

export default function OldGenerateArticlePage() {
  // 恒久的に /admin/articles/new へリダイレクト
  redirect('/admin/articles/new');
}