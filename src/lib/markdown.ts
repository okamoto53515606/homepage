/**
 * Markdown → HTML 変換ユーティリティ（サーバーサイド専用）
 * 
 * react-markdown はクライアントコンポーネント（Turbopack）で動作しないため、
 * API Route でサーバーサイドで HTML に変換して返す用途で使用します。
 * 
 * rehype-sanitize で XSS 対策済み。
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

/**
 * Markdown 文字列を安全な HTML 文字列に変換する
 */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}
