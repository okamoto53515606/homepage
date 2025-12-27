'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect } from 'react';
import { handleGenerateArticle, type FormState } from '@/lib/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Wand2, Clipboard, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Wand2 className="mr-2 h-4 w-4" />
          Generate Article
        </>
      )}
    </Button>
  );
}

export default function ArticleGeneratorForm() {
  const initialState: FormState = { message: '' };
  const [state, formAction] = useFormState(handleGenerateArticle, initialState);
  const { toast } = useToast();

  useEffect(() => {
    if (state.message === 'Success!') {
      toast({
        title: 'Article Generated!',
        description: 'The draft has been successfully created below.',
      });
    } else if (state.message === 'Validation Error') {
        toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: state.issues?.join('\n') || 'Please check your input.',
        });
    } else if (state.message && state.message !== '') {
        toast({
            variant: 'destructive',
            title: 'An Error Occurred',
            description: state.message,
        });
    }
  }, [state, toast]);

  const handleCopyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
        title: "Copied to Clipboard",
        description: "The article markdown is ready to be pasted.",
    });
  }

  return (
    <>
      <form action={formAction}>
        <Card>
          <CardHeader>
            <CardTitle>Content Prompt</CardTitle>
            <CardDescription>
              Provide the details for the article you want to generate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="contentGoal">Content Goal</Label>
              <Textarea
                id="contentGoal"
                name="contentGoal"
                placeholder="e.g., Explain the benefits of server-side rendering for SEO."
                rows={3}
                required
                defaultValue={state.fields?.contentGoal}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="context">Context</Label>
              <Textarea
                id="context"
                name="context"
                placeholder="e.g., The target audience is junior web developers. Mention Next.js as a popular framework that uses SSR."
                rows={5}
                required
                defaultValue={state.fields?.context}
              />
            </div>
            <SubmitButton />
          </CardContent>
        </Card>
      </form>

      {state.markdownContent && (
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated Draft</CardTitle>
                <CardDescription>Review and edit the AI-generated content below.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleCopyToClipboard(state.markdownContent || '')}>
                <Clipboard className="mr-2 h-4 w-4" />
                Copy Markdown
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {state.imageUrl && (
              <div className="mb-8 rounded-lg border p-4">
                  <h3 className="mb-2 text-lg font-semibold flex items-center"><ImageIcon className="mr-2 h-5 w-5"/> Suggested Image</h3>
                  <div className="relative aspect-video w-full overflow-hidden rounded-md">
                    <Image src={state.imageUrl} alt="Generated image" fill className="object-cover" />
                  </div>
              </div>
            )}
            <div
              className="prose prose-lg max-w-none rounded-lg border p-4 font-body 
                        dark:prose-invert
                        prose-code:font-code prose-pre:font-code"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.markdownContent}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
