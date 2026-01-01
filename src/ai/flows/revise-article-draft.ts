/**
 * 記事修正フロー
 * 
 * @description
 * 既存の記事内容と修正依頼を基に、記事をAIで修正します。
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// フローの入力スキーマ
const ReviseArticleInputSchema = z.object({
  currentTitle: z.string().describe('The current title of the article.'),
  currentContent: z.string().describe('The current Markdown content of the article.'),
  revisionRequest: z.string().describe('The user\'s specific request for how to revise the article.'),
  // 【追加】利用可能な画像URLのリスト
  imageUrls: z.array(z.string().url()).describe('A list of available image URLs that can be used in the revised content.').optional(),
});
export type ReviseArticleInput = z.infer<typeof ReviseArticleInputSchema>;

// フローの出力スキーマ
const ReviseArticleOutputSchema = z.object({
  revisedTitle: z.string().describe('The revised, compelling, and SEO-friendly title for the article.'),
  revisedContent: z.string().describe('The revised main content of the article in Markdown format.'),
  revisedExcerpt: z.string().describe('A revised, short, one-sentence summary of the article.'),
  revisedTeaserContent: z.string().describe('A revised, engaging introductory paragraph to hook readers.'),
  revisedTags: z.array(z.string()).describe('A revised array of 5-7 relevant keywords (tags) for the article.'),
});
export type ReviseArticleOutput = z.infer<typeof ReviseArticleOutputSchema>;

// エクスポートされるメイン関数
export async function reviseArticleDraft(input: ReviseArticleInput): Promise<ReviseArticleOutput> {
  return reviseArticleFlow(input);
}

// AIに渡すプロンプトの定義
const reviseArticlePrompt = ai.definePrompt({
  name: 'reviseArticlePrompt',
  input: { schema: ReviseArticleInputSchema },
  output: { schema: ReviseArticleOutputSchema },
  prompt: `あなたはプロの編集者です。
与えられた既存の記事（現在のタイトルと本文）を、ユーザーからの「修正依頼」に沿って修正してください。
出力は指定されたスキーマ（revisedTitle, revisedContentなど）に厳密に従ってください。

# 既存の記事

## 現在のタイトル:
{{{currentTitle}}}

## 現在の本文 (Markdown):
{{{currentContent}}}


# ユーザーからの修正依頼
{{{revisionRequest}}}


{{#if imageUrls}}
# 利用可能な画像URLリスト
以下のURLの画像のみを、記事の文脈に合わせて使用または再配置してください。このリストにないURLは絶対に使用しないでください。
{{#each imageUrls}}
- {{{this}}}
{{/each}}
{{/if}}


# 出力形式
- revisedTitle: 修正後の、読者の興味を引き、SEOにも配慮した魅力的なタイトル。
- revisedContent: 修正後の、構造化された読みやすいMarkdown形式の本文。画像を埋め込む際は、必ず「利用可能な画像URLリスト」内のURLを使用してください。
- revisedExcerpt: 修正後の、記事全体を1文で要約した短い文章。
- revisedTeaserContent: 修正後の、有料記事の未購入者に表示される導入文。
- revisedTags: 修正後の、記事に関連する5〜7個のキーワードの配列。
`,
});

// Genkitフローの定義
const reviseArticleFlow = ai.defineFlow(
  {
    name: 'reviseArticleFlow',
    inputSchema: ReviseArticleInputSchema,
    outputSchema: ReviseArticleOutputSchema,
  },
  async (input) => {
    const { output } = await reviseArticlePrompt(input);
    return output!;
  }
);
