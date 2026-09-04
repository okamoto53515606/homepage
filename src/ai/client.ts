/**
 * Gemini API クライアントファクトリ
 *
 * why: @google/generative-ai は2025年11月30日付けで非推奨・開発終了(Not actively
 * maintained)となり、後継の @google/genai への移行が公式に推奨されている
 * （https://ai.google.dev/gemini-api/docs/libraries）。新モデルへの追従や
 * 挙動の安定性の観点から @google/genai に移行する。
 */

import { GoogleGenAI } from '@google/genai';

/** why: 新SDKはモデル名をクライアント生成時でなく呼び出しごとに渡す方式のため、定数として一元管理する。 */
export const GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Gemini クライアントを生成する。
 * @param apiKey - Gemini API キー（Secrets Manager または環境変数から取得）
 * @returns GoogleGenAI インスタンス
 */
export function createGemini(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

/**
 * 画像 URL を取得し Gemini の inlineData（base64）形式に変換する。
 *
 * why: fileData.fileUri は本来 Gemini Files API でアップロード済みの URI を指すためのもので、
 * CloudFront 等の外部公開 URL を直接渡す動作は公式ドキュメントに見当たらない非公式な使い方だった。
 * inlineData なら画像バイト列を直接渡すため、モデルやAPI仕様変更に影響されず確実に動作する。
 */
export async function fetchImageAsPart(url: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`画像の取得に失敗しました: ${url} (${res.status})`);
  }
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = await res.arrayBuffer();
  const data = Buffer.from(buffer).toString('base64');
  return { inlineData: { mimeType, data } };
}

