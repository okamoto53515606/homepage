'use server';

/**
 * @fileOverview Generates a draft article in Markdown format based on a content goal and context.
 *
 * - generateArticleDraft - A function that generates the article draft.
 * - GenerateArticleDraftInput - The input type for the generateArticleDraft function.
 * - GenerateArticleDraftOutput - The return type for the generateArticleDraft function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateArticleDraftInputSchema = z.object({
  contentGoal: z
    .string()
    .describe('The primary goal or objective of the article.'),
  context: z.string().describe('Additional context or background information for the article.'),
});
export type GenerateArticleDraftInput = z.infer<typeof GenerateArticleDraftInputSchema>;

const GenerateArticleDraftOutputSchema = z.object({
  markdownContent: z
    .string()
    .describe('The generated article content in Markdown format.'),
  imageUrl: z.string().optional().describe('Optional URL of an image to accompany the article.'),
});
export type GenerateArticleDraftOutput = z.infer<typeof GenerateArticleDraftOutputSchema>;

export async function generateArticleDraft(input: GenerateArticleDraftInput): Promise<GenerateArticleDraftOutput> {
  return generateArticleDraftFlow(input);
}

const articleDraftPrompt = ai.definePrompt({
  name: 'articleDraftPrompt',
  input: {schema: GenerateArticleDraftInputSchema},
  output: {schema: GenerateArticleDraftOutputSchema},
  prompt: `You are an experienced content creator. Your task is to generate a draft article in Markdown format based on the provided content goal and context. Ensure the article is well-structured, engaging, and informative.

Content Goal: {{{contentGoal}}}
Context: {{{context}}}

Output the article in Markdown format:
`,
});

const generateArticleDraftFlow = ai.defineFlow(
  {
    name: 'generateArticleDraftFlow',
    inputSchema: GenerateArticleDraftInputSchema,
    outputSchema: GenerateArticleDraftOutputSchema,
  },
  async input => {
    const {output} = await articleDraftPrompt(input);
    return output!;
  }
);
