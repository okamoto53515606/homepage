/**
 * 記事修正（@google/generative-ai 直利用）
 *
 * why: genkit を廃止し直接 Gemini API を呼ぶ（docs/genkit-vs-direct-gemini.md 参照）。
 * genkit の definePrompt / defineFlow / Handlebars テンプレートを、プレーンな
 * テンプレートリテラル + Zod バリデーションに置き換え。
 */

import type { GenerativeModel } from '@google/generative-ai';
import { z } from 'zod';
import { logger } from '@/lib/env';

// ---------------------------------------------------------------------------
// スキーマ定義
// ---------------------------------------------------------------------------

export const ReviseArticleInputSchema = z.object({
  currentTitle: z.string(),
  currentContent: z.string(),
  revisionRequest: z.string(),
  imageUrls: z.array(z.string().url()).optional(),
  existingTags: z.array(z.string()).optional(),
});
export type ReviseArticleInput = z.infer<typeof ReviseArticleInputSchema>;

export const ReviseArticleOutputSchema = z.object({
  revisedTitle: z.string(),
  revisedContent: z.string(),
  revisedExcerpt: z.string(),
  revisedTags: z.array(z.string()),
});
export type ReviseArticleOutput = z.infer<typeof ReviseArticleOutputSchema>;

// ---------------------------------------------------------------------------
// プロンプト構築
// ---------------------------------------------------------------------------

function buildPrompt(input: ReviseArticleInput): string {
  const parts: string[] = [
    `あなたはプロの編集者です。
与えられた既存の記事（現在のタイトルと本文）を、ユーザーからの「修正依頼」に沿って修正してください。
出力は指定されたスキーマ（revisedTitle, revisedContentなど）に厳密に従ってください。

# 既存の記事

## 現在のタイトル:
${input.currentTitle}

## 現在の本文 (Markdown):
${input.currentContent}


# ユーザーからの修正依頼
${input.revisionRequest}`,
  ];

  if (input.imageUrls && input.imageUrls.length > 0) {
    parts.push(`
# 利用可能な画像
以下の画像のみを、記事の文脈に合わせて使用または再配置してください。このリストにないURLは絶対に使用しないでください。

【最重要】Markdown内の画像URLは、下記の「正確なURL」欄に記載されたものを一字一句そのままコピーして使用してください。URLを変換したり、別の形式にしたり、推測したりすることは絶対に禁止です。

${input.imageUrls.map((url, i) => `### 画像${i + 1}
- 正確なURL: ${url}`).join('\n\n')}`);
  }

  if (input.existingTags && input.existingTags.length > 0) {
    parts.push(`
## 参考タグリスト:
タグを修正・生成する際は、以下の既存タグリストを参考にしてください。表記揺れ（大文字小文字の違いなど）を防ぐため、可能な限りこのリスト内の表記に合わせてください。リストにない新しいタグを生成しても構いません。
- ${input.existingTags.join(', ')}`);
  }

  parts.push(`

# 出力形式
- revisedTitle: 修正後の、読者の興味を引き、SEOにも配慮した魅力的なタイトル。
- revisedContent: 修正後の、構造化された読みやすいMarkdown形式の本文。画像を埋め込む際は、必ず「利用可能な画像URLリスト」内のURLを使用してください。
- revisedExcerpt: 修正後の、記事全体を1文で要約した短い文章。
- revisedTags: 修正後の、記事に関連する5〜7個のキーワードの配列。`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------------------

/**
 * AI で記事を修正する。
 *
 * @param model - createGemini() で生成した GenerativeModel インスタンス
 * @param input - 修正パラメータ
 * @returns 修正後の記事
 */
export async function reviseArticleDraft(
  model: GenerativeModel,
  input: ReviseArticleInput,
): Promise<ReviseArticleOutput> {
  const prompt = buildPrompt(input);

  logger.info('[AI] 記事修正を開始...');

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...(input.imageUrls ?? []).map((url) => ({
            fileData: {
              fileUri: url,
              mimeType: 'image/jpeg' as const,
            },
          })),
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();

  try {
    const parsed = JSON.parse(text);
    return ReviseArticleOutputSchema.parse(parsed);
  } catch (error) {
    logger.error('[AI] Gemini 出力のパースに失敗:', error);
    logger.error('[AI] 生出力（先頭500文字）:', text.slice(0, 500));
    throw new Error('AI が不正な形式の JSON を返しました。再試行してください。');
  }
}
