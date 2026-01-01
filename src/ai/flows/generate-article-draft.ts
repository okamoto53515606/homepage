'use server';

/**
 * 記事下書き生成フロー
 * 
 * @description
 * コンテンツ目標、コンテキスト、そしてアップロードされた画像のURLに基づいて、
 * 記事の構成要素（タイトル、本文、要約など）をAIで生成します。
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// フローの入力スキーマ
const GenerateArticleDraftInputSchema = z.object({
  contentGoal: z.string().describe('The primary goal or objective of the article.'),
  context: z.string().describe('Additional context or background information for the article.'),
  isPaidContent: z.boolean().describe('Whether the article is intended as paid content. This should influence the depth and quality of the content.').optional(),
  imageUrls: z.array(z.string().url()).describe('A list of URLs for images to be analyzed and included in the article.').optional(),
  existingTags: z.array(z.string()).describe('A list of unique, existing tags to use for consistency.').optional(),
});
export type GenerateArticleDraftInput = z.infer<typeof GenerateArticleDraftInputSchema>;

// フローの出力スキーマ
const GenerateArticleDraftOutputSchema = z.object({
  title: z.string().describe('A compelling and SEO-friendly title for the article.'),
  markdownContent: z.string().describe('The main content of the article in Markdown format. The content should be generated based on the provided text and images.'),
  excerpt: z.string().describe('A short, one-sentence summary of the article for list views.'),
  teaserContent: z.string().describe('An engaging introductory paragraph to hook readers, used for paywalls.'),
  tags: z.array(z.string()).describe('An array of 5-7 relevant keywords (tags) for the article.'),
});
export type GenerateArticleDraftOutput = z.infer<typeof GenerateArticleDraftOutputSchema>;

// エクスポートされるメイン関数
export async function generateArticleDraft(input: GenerateArticleDraftInput): Promise<GenerateArticleDraftOutput> {
  return generateArticleDraftFlow(input);
}

// AIに渡すプロンプトの定義
const articleDraftPrompt = ai.definePrompt({
  name: 'articleDraftPrompt',
  input: {schema: GenerateArticleDraftInputSchema},
  output: {schema: GenerateArticleDraftOutputSchema},
  prompt: `あなたはプロの編集者であり、熟練のWebライターです。
与えられた「コンテンツの目標」「コンテキスト」「画像」を基に、新しい記事の下書きを生成してください。
出力は指定されたスキーマ（title, markdownContentなど）に厳密に従ってください。

{{#if isPaidContent}}
この記事は有料記事です。読者が対価を払う価値があると感じるような、専門的で質の高い、詳細なコンテンツを生成してください。
特に teaserContent は、読者が購入したくなるような、説得力のある魅力的な導入部にしてください。
{{/if}}

# 指示

## コンテンツの目標:
{{{contentGoal}}}

## コンテキスト:
{{{context}}}

{{#if imageUrls}}
## 参考画像:
以下の画像の内容を理解し、記事の文脈に合う適切な箇所に埋め込んでください。
画像の内容を描写する文章も記事に含めてください。
重要: Markdownに画像を埋め込む際は、必ず {{media url=...}} で渡されたURLをそのまま使用してください。URLを変換したり、別の形式にしたりしないでください。
{{#each imageUrls}}
- {{media url=this}}
{{/each}}
{{/if}}

{{#if existingTags}}
## 参考タグリスト:
タグを生成する際は、以下の既存タグリストを参考にしてください。表記揺れ（大文字小文字の違いなど）を防ぐため、可能な限りこのリスト内の表記に合わせてください。リストにない新しいタグを生成しても構いません。
- {{#each existingTags}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}


# 出力形式
- title: 読者の興味を引き、SEOにも配慮した魅力的なタイトル。
- markdownContent: 見出しやリスト、コードブロックなどを適切に使用した、構造化された読みやすいMarkdown形式の本文。重要: 画像を埋め込む際は、画像の完全なURLをそのまま使用してください。
- excerpt: 記事一覧ページで表示するための、記事全体を1文で要約した短い文章。
- teaserContent: 有料記事の未購入者に表示される、読者の興味を引きつけて続きを読むことを促すための導入文。
- tags: 記事に関連する**5〜7個**のキーワードの配列。
`,
});

// Genkitフローの定義
const generateArticleDraftFlow = ai.defineFlow(
  {
    name: 'generateArticleDraftFlow',
    inputSchema: GenerateArticleDraftInputSchema,
    outputSchema: GenerateArticleDraftOutputSchema,
  },
  async input => {
    // プロンプトを実行し、整形された出力を待つ
    const {output} = await articleDraftPrompt(input);
    return output!;
  }
);
