/**
 * Gemini API クライアントファクトリ
 *
 * why: genkit を廃止し @google/generative-ai を直接使う（docs/genkit-vs-direct-gemini.md 参照）。
 * genkit は 3 つの直接依存 + Firebase Admin / google-gax / OpenTelemetry 一式の
 * transitive 依存を連れてきて脆弱性管理コストが高い。Genkit の抽象化
 * （defineFlow / definePrompt / Handlebars / プラグイン）は大規模マルチモデル構成では便利だが、
 * 個人メディア規模でモデルが Gemini Flash 固定なら、抽象化の benefit より依存脆弱性のコストが勝つ。
 *
 * このモジュールは API キーを引数で受け取るため、動的 import や process.env 汚染が不要。
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

/**
 * Gemini モデルインスタンスを生成する。
 * @param apiKey - Gemini API キー（Secrets Manager または環境変数から取得）
 * @returns GenerativeModel インスタンス
 */
export function createGemini(apiKey: string): GenerativeModel {
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    // why: 最新の高速モデルを使用。genkit 版では 'googleai/gemini-3.7-flash' だったが、
    // @google/generative-ai 直では Google AI のモデル名をそのまま指定する。
    model: 'gemini-3.7-flash',
  });
}
