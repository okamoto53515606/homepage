/**
 * Genkit AI初期化
 * 
 * Google AI (Gemini)を使用した記事生成AIの初期化を行います。
 */

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  // 最新の画像認識能力が高いモデルに変更
  model: 'googleai/gemini-3-pro-preview',
});
