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
  // 画像URLのリストを受け取るように変更
  imageUrls: z.array(z.string().url()).describe('A list of URLs for images to be analyzed and included in the article.').optional(),
});
export type GenerateArticleDraftInput = z.infer<typeof GenerateArticleDraftInputSchema>;

// フローの出力スキーマ
const GenerateArticleDraftOutputSchema = z.object({
  title: z.string().describe('A compelling and SEO-friendly title for the article.'),
  markdownContent: z.string().describe('The main content of the article in Markdown format. The content should be generated based on the provided text and images.'),
  excerpt: z.string().describe('A short, one-sentence summary of the article for list views.'),
  teaserContent: z.string().describe('An engaging introductory paragraph to hook readers, used for paywalls.'),
  tags: z.array(z.string()).describe('An array of 2-3 relevant keywords (tags) for the article.'),
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
  prompt: `You are an expert content creator and editor. Your task is to generate a draft for a new article based on the provided goal, context, and images. Structure your response according to the output schema.
{{#if isPaidContent}}
This is a paid article. Please generate high-value, in-depth content that is worth paying for. The teaserContent should be particularly persuasive to encourage users to purchase access.
{{/if}}

Content Goal: {{{contentGoal}}}
Context: {{{context}}}

{{#if imageUrls}}
Use the following images to understand the context and embed them in the markdownContent where you see fit. Describe what is in the images as part of the article.
{{#each imageUrls}}
Image to use: {{media url=this}}
{{/each}}
{{/if}}

Please generate the following components for the article:
- title: A compelling and SEO-friendly title.
- markdownContent: Well-structured, engaging, and informative content in Markdown format. Use headings, lists, and code blocks where appropriate. IMPORTANT: When embedding an image, use its full URL.
- excerpt: A concise, one-sentence summary.
- teaserContent: An engaging introductory paragraph designed to make the reader want to continue. This will be shown to users who have not yet paid.
- tags: An array of 2-3 relevant keywords.
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
