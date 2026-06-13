/**
 * Genkit AI初期化
 *
 * Google AI (Gemini)を使用した記事生成AIの初期化を行います。
 */

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  // why: gemini-3.5-flash（GA）を採用。
  // 旧モデル（gemini-2.5-flash 等）と比較して、エージェント・コーディング系タスクで
  // 最先端のパフォーマンスを維持しながら、デフォルト思考労力が high → medium に変更され
  // 速度とコストが改善された。100 万トークンのコンテキストウィンドウ・最大 65,000 出力
  // トークンを持ち、本番環境での安定稼働（GA リリース）も確認済み。
  // 記事生成・修正フローの応答速度改善が主な目的。
  // 参照: https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5
  model: 'googleai/gemini-3.5-flash',
});
