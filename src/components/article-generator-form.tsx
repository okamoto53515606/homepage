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
          生成中...
        </>
      ) : (
        <>
          <Wand2 className="mr-2 h-4 w-4" />
          記事を生成
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
        title: '記事が生成されました！',
        description: '下書きが正常に作成されました。',
      });
    } else if (state.message === 'Validation Error') {
        toast({
            variant: 'destructive',
            title: '入力エラー',
            description: state.issues?.join('\n') || '入力内容を確認してください。',
        });
    } else if (state.message && state.message !== '') {
        toast({
            variant: 'destructive',
            title: 'エラーが発生しました',
            description: state.message,
        });
    }
  }, [state, toast]);

  const handleCopyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
        title: "クリップボードにコピーしました",
        description: "記事のマークダウンを貼り付ける準備ができました。",
    });
  }

  return (
    <>
      <form action={formAction}>
        <Card>
          <CardHeader>
            <CardTitle>コンテンツプロンプト</CardTitle>
            <CardDescription>
              生成したい記事の詳細を入力してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="contentGoal">コンテンツの目標</Label>
              <Textarea
                id="contentGoal"
                name="contentGoal"
                placeholder="例：サーバーサイドレンダリングがSEOに与える利点を説明する。"
                rows={3}
                required
                defaultValue={state.fields?.contentGoal}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="context">コンテキスト</Label>
              <Textarea
                id="context"
                name="context"
                placeholder="例：ターゲット読者はジュニアウェブ開発者。SSRを使用する人気フレームワークとしてNext.jsに言及する。"
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
                <CardTitle>生成された下書き</CardTitle>
                <CardDescription>AIが生成した内容を確認・編集してください。</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleCopyToClipboard(state.markdownContent || '')}>
                <Clipboard className="mr-2 h-4 w-4" />
                マークダウンをコピー
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {state.imageUrl && (
              <div className="mb-8 rounded-lg border p-4">
                  <h3 className="mb-2 text-lg font-semibold flex items-center"><ImageIcon className="mr-2 h-5 w-5"/> 推奨画像</h3>
                  <div className="relative aspect-video w-full overflow-hidden rounded-md">
                    <Image src={state.imageUrl} alt="生成された画像" fill className="object-cover" />
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
