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
// why: CommonMark の規則では閉じ ** の直前が「」（）などの CJK 約物で、
//      直後が空白・約物以外の文字（ひらがな等）の場合に強調として認識されない。
//      日本語コンテンツでは **「太字」**のように が頻出するため、
//      remark-cjk-friendly で CJK 約物を区切り文字として扱うよう補正する。
//      非 CJK テキストには一切影響しない（CommonMark 0.31.2 全テストケース互換保証）。
import remarkCjkFriendly from 'remark-cjk-friendly';
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
    // why: remarkGfm の後に配置することでプラグインの順序依存を回避する
    .use(remarkCjkFriendly)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}
