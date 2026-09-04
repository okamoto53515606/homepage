# genkit vs 直接 @google/generative-ai の比較

> **背景:** 2026/07/29 に Dependabot 自動マージが 5 件滞留した原因は、genkit が連れてくる
> 大量の transitive 依存（Firebase Admin、google-gax、OpenTelemetry 等）に起因する
> `postcss` / `brace-expansion` の HIGH 脆弱性だった。postcss は override で修正できたが、
> brace-expansion は v5 が ESLint の minimatch と非互換のため override 不可。
> `better-npm-audit` + `.nsprc` で許容リスト化して CI を通したが、genkit を外せば
> この手の対応自体が不要になる。

---

## 現状: genkit 版

### 依存 (package.json)

```json
"@genkit-ai/google-genai": "1.40.1",
"@genkit-ai/next": "1.40.1",
"genkit": "1.40.1"
```

→ これらが連れてくる transitive 依存: Firebase Admin、google-gax、OpenTelemetry
（sdk-node / auto-instrumentations / propagator-jaeger / resources / sdk-metrics / sdk-trace-base ...）

### 初期化 (`src/ai/genkit.ts`)

```typescript
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-3.8-flash',
});
```

### プロンプト定義 (`src/ai/flows/generate-article-draft.ts`)

```typescript
import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const articleDraftPrompt = ai.definePrompt({
  name: 'articleDraftPrompt',
  input: {schema: GenerateArticleDraftInputSchema},
  output: {schema: GenerateArticleDraftOutputSchema},
  config: {maxOutputTokens: 65536},
  prompt: `あなたはプロのブロガーです。...{{#if isPaidContent}}...{{/if}}...`,
});

export const generateArticleDraftFlow = ai.defineFlow(
  {name: 'generateArticleDraftFlow', inputSchema, outputSchema},
  async (input) => {
    const {output} = await articleDraftPrompt(input);
    return output!;
  }
);
```

### 呼び出し側（動的 import 必須）

```typescript
// why: genkit はモジュール初期化時に process.env.GEMINI_API_KEY を読むため、
//      API キーを Secrets Manager から取得してセットしてから import する必要がある
const {apiKey} = await getGeminiConfig();
process.env.GEMINI_API_KEY = apiKey;
const {generateArticleDraft} = await import('@/ai/flows/generate-article-draft');
const draft = await generateArticleDraft(input);
```

### 依存脆弱性の状況

```
npm audit --omit=dev --audit-level=high
→ 18 moderate + 7 high = 25 vulnerabilities
→ genkit 経由の transitive がほぼ全て
→ better-npm-audit + .nsprc で既知のものを許容リスト化して運用
```

---

## 移行案: `@google/generative-ai` 直利用

### 依存 (package.json)

```json
"@google/generative-ai": "^0.22.0"
```

→ genkit 3 つ + Firebase Admin + google-gax + OpenTelemetry 一式が **全部消える**。
→ `npm audit --omit=dev --audit-level=high` が **exit 0** になる。

### 初期化 (`src/ai/client.ts`)

```typescript
import {GoogleGenerativeAI} from '@google/generative-ai';

export function createGemini(apiKey: string) {
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: 'gemini-3.8-flash',
  });
}
```

**ポイント:** 初期化時に API キーが不要。呼び出し時に渡せるので動的 import が不要になる。

### 記事生成 (`src/ai/generate-article.ts`)

```typescript
import {GoogleGenerativeAI, type GenerativeModel} from '@google/generative-ai';
import type {z} from 'zod';

// --- スキーマはそのまま（zod に移行）---
const OutputSchema = z.object({
  title: z.string(),
  slug: z.string(),
  markdownContent: z.string(),
  excerpt: z.string(),
  tags: z.array(z.string()),
});

// --- プロンプトはテンプレートリテラル ---
function buildPrompt(input: GenerateArticleInput): string {
  return `
あなたはプロのブロガーです。

=== 目的 ===
${input.contentGoal}

${input.isPaidContent ? 'これは有料会員向け記事です。深い分析を含めてください。' : ''}

=== 画像 ===
${input.imageUrls?.map((url, i) => `[画像${i + 1}]: ${url}`).join('\n') ?? ''}

以下の JSON 形式で出力してください:
{
  "title": "...",
  "slug": "...",
  "markdownContent": "...",
  "excerpt": "...",
  "tags": ["..."]
}
`.trim();
}

// --- 本体 ---
export async function generateArticle(
  model: GenerativeModel,
  input: GenerateArticleInput,
) {
  const prompt = buildPrompt(input);

  const result = await model.generateContent({
    contents: [{role: 'user', parts: [{text: prompt}]}],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      // Structured output は responseSchema でも指定可能:
      // responseSchema: OutputSchema,
    },
  });

  const text = result.response.text();
  return OutputSchema.parse(JSON.parse(text));
}
```

### 画像入力（公開 URL） (`@google/generative-ai` 直)

```typescript
import {GoogleGenerativeAI} from '@google/generative-ai';

// --- 画像 URL を含むリクエスト ---
export async function generateArticleWithImages(
  model: GenerativeModel,
  input: GenerateArticleInput,
) {
  const prompt = buildPrompt(input);

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        {text: prompt},
        // HTTP URL から直接画像を読める（genkit の {{media url=...}} と同等）
        // S3 → CloudFront の公開 URL をそのまま渡せる
        ...(input.imageUrls ?? []).map(url => ({
          fileData: {
            fileUri: url,           // https://... 形式の公開 URL
            mimeType: 'image/jpeg', // or image/png, image/webp
          },
        })),
      ],
    }],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();
  return OutputSchema.parse(JSON.parse(text));
}
```

**制約（本プロジェクトでは問題なし）:**
- URL は公開アクセス可能であること（CloudFront 経由 S3 は ✓）
- 1 リクエストあたり最大 10 画像
- Cloud Storage (`gs://`) も HTTP/HTTPS URL も両方 `fileUri` で指定可能
- 参考: https://ai.google.dev/gemini-api/docs/image-understanding

### 呼び出し側（動的 import 不要）

```typescript
import {createGemini} from '@/ai/client';
import {generateArticle} from '@/ai/generate-article';

// API キーは Secrets Manager から取得
const {apiKey} = await getGeminiConfig();

// 普通の関数呼び出し。動的 import 不要、process.env 汚染も不要
const model = createGemini(apiKey);
const draft = await generateArticle(model, input);
```

---

## 差分まとめ

| 観点 | genkit 版 | @google/generative-ai 直 |
|---|---|---|
| **依存パッケージ数** | genkit + @genkit-ai/google-genai + @genkit-ai/next とその transitive 数百 | `@google/generative-ai` 1 つ |
| **npm audit (production high)** | 常に 7〜10 件 HIGH（genkit 経由） | 0 |
| **API キー注入** | `process.env.GEMINI_API_KEY` 必須 → 動的 import 強制 | 関数引数で渡すだけ |
| **プロンプト定義** | `ai.definePrompt()` + Handlebars テンプレート | プレーンなテンプレートリテラル |
| **Structured Output** | `output: {schema}` で自動 | `responseMimeType: 'application/json'` + zod でバリデーション |
| **画像入力（マルチモーダル）** | `{{media url=...}}` Handlebars helper | `parts: [{inlineData: ...}]` or `fileData` で指定 |
| **ストリーミング** | genkit の streaming API | `model.generateContentStream()` で同等 |
| **モデル切替** | genkit プラグイン差し替え | `createGemini()` → `createOpenAI()` に関数差し替え（コード量同等） |
| **CI メンテナンスコスト** | Dependabot alert dismiss + .nsprc 管理が継続的に必要 | ほぼゼロ |

---

## 所感

genkit の抽象化（`defineFlow` / `definePrompt` / Handlebars / プラグイン）は大規模マルチモデル構成では便利だが、
個人メディア規模で「モデルは Gemini flash 固定」なら、抽象化の benefit より依存脆弱性のコストが勝つ。

`@google/generative-ai` 直でも 50 行程度で同等の機能が実装でき、依存脆弱性アラートから解放される。
GPT/Claude への切替も `createGemini()` → `createOpenAI()` の差し替えだけで対応可能。
