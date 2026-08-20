/**
 * 記事下書き生成（@google/genai 直利用）
 *
 * why: genkit を廃止し直接 Gemini API を呼ぶ（docs/genkit-vs-direct-gemini.md 参照）。
 * genkit の definePrompt / defineFlow / Handlebars テンプレートを、プレーンな
 * テンプレートリテラル + Zod バリデーションに置き換え。
 * Structured Output は responseMimeType: 'application/json' + Zod.parse() で実現。
 */

import type { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { logger } from '@/lib/env';
import { GEMINI_MODEL, fetchImageAsPart } from './client';

// ---------------------------------------------------------------------------
// スキーマ定義（genkit 版の z.object からそのまま移植、zod 標準に変更）
// ---------------------------------------------------------------------------

export const GenerateArticleInputSchema = z.object({
  contentGoal: z.string(),
  context: z.string(),
  isPaidContent: z.boolean().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  existingTags: z.array(z.string()).optional(),
});
export type GenerateArticleInput = z.infer<typeof GenerateArticleInputSchema>;

export const GenerateArticleOutputSchema = z.object({
  title: z.string(),
  slug: z.string(),
  markdownContent: z.string(),
  excerpt: z.string(),
  tags: z.array(z.string()),
});
export type GenerateArticleOutput = z.infer<typeof GenerateArticleOutputSchema>;

// ---------------------------------------------------------------------------
// プロンプト構築（genkit 版 Handlebars テンプレートをテンプレートリテラルに移植）
// ---------------------------------------------------------------------------

function buildPrompt(input: GenerateArticleInput): string {
  const parts: string[] = [
    `あなたはプロの編集者であり、熟練のWebライターです。
与えられた「コンテンツの目標」「コンテキスト」「画像」を基に、新しい記事の下書きを生成してください。
出力は指定されたスキーマ（title, markdownContentなど）に厳密に従ってください。`,
  ];

  if (input.isPaidContent) {
    parts.push(`この記事は有料記事です。読者が対価を払う価値があると感じるような、専門的で質の高い、詳細なコンテンツを生成してください。`);
  }

  parts.push(`
# 指示

## コンテンツの目標:
${input.contentGoal}

## コンテキスト:
${input.context}`);

  if (input.imageUrls && input.imageUrls.length > 0) {
    parts.push(`
## 参考画像:
以下の画像の内容を理解し、記事の文脈に合う適切な箇所に埋め込んでください。
画像の内容を描写する文章も記事に含めてください。

【最重要】Markdown内の画像URLは、下記の「正確なURL」欄に記載されたものを一字一句そのままコピーして使用してください。URLを変換したり、別の形式にしたり、推測したりすることは絶対に禁止です。

${input.imageUrls.map((url, i) => `### 画像${i + 1}
- 正確なURL: ${url}`).join('\n\n')}`);
  }

  if (input.existingTags && input.existingTags.length > 0) {
    parts.push(`
## 参考タグリスト:
タグを生成する際は、以下の既存タグリストを参考にしてください。表記揺れ（大文字小文字の違いなど）を防ぐため、可能な限りこのリスト内の表記に合わせてください。リストにない新しいタグを生成しても構いません。
- ${input.existingTags.join(', ')}`);
  }

  parts.push(`

# 出力形式
- title: 読者の興味を引き、SEOにも配慮した魅力的なタイトル。
- slug: タイトルの内容を英語で要約した、URL用の短いスラッグ。小文字の英数字とハイフンのみ使用。例: "nextjs-ssr-seo-benefits"
- markdownContent: 見出しやリスト、コードブロックなどを適切に使用した、構造化された読みやすいMarkdown形式の本文。重要：画像は必ず渡されたURLをそのまま使用してください。
- excerpt: 記事一覧ページで表示するための、記事全体を1文で要約した短い文章。
- tags: 記事に関連する**5〜7個**のキーワードの配列。`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------------------

/**
 * AI で記事下書きを生成する。
 *
 * @param ai - createGemini() で生成した GoogleGenAI インスタンス
 * @param input - 生成パラメータ
 * @returns 生成された記事下書き
 */
export async function generateArticleDraft(
  ai: GoogleGenAI,
  input: GenerateArticleInput,
): Promise<GenerateArticleOutput> {
  const prompt = buildPrompt(input);

  // why: Gemini のデフォルト maxOutputTokens は 8,192。長文記事では
  // JSON が途中切断されるためモデル最大値（65,536）を明示する。
  logger.info('[AI] 記事下書きの生成を開始...');

  // why: 画像は CloudFront 公開 URL。fetch して inlineData(base64) に変換して渡す。
  const imageParts = await Promise.all((input.imageUrls ?? []).map(fetchImageAsPart));

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...imageParts,
        ],
      },
    ],
    config: {
      maxOutputTokens: 65536,
      // why: Structured Output。JSON モードで出力させ、Zod でバリデーションする。
      responseMimeType: 'application/json',
    },
  });

  const text = result.text ?? '';

  try {
    const parsed = JSON.parse(text);
    return GenerateArticleOutputSchema.parse(parsed);
  } catch (error) {
    logger.error('[AI] Gemini 出力のパースに失敗:', error);
    logger.error('[AI] 生出力（先頭500文字）:', text.slice(0, 500));
    throw new Error('AI が不正な形式の JSON を返しました。再試行してください。');
  }
}
