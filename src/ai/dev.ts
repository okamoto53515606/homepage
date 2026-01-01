/**
 * Genkit開発用エントリポイント
 * 
 * 開発時にGenkitのフローを読み込むためのファイルです。
 * genkit start コマンドで使用されます。
 */

import { config } from 'dotenv';
config();

import '@/ai/flows/generate-article-draft.ts';
import '@/ai/flows/revise-article-draft.ts'; // 新しいフローを追加
