'use client';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Article } from '@/lib/data';

interface ArticleDisplayProps {
  article: Article & { imageUrl?: string; imageHint?: string };
}

export default function ArticleDisplay({ article }: ArticleDisplayProps) {
  return (
    <article>
      <header className="mb-8">
        <h1 className="mb-4 font-headline text-4xl font-bold leading-tight md:text-5xl">
          {article.title}
        </h1>
        {article.imageUrl && (
          <div className="relative mt-8 h-80 w-full overflow-hidden rounded-lg">
            <Image
              src={article.imageUrl}
              alt={article.title}
              fill
              className="object-cover"
              data-ai-hint={article.imageHint}
              priority
            />
          </div>
        )}
      </header>
      <div
        className="prose prose-lg max-w-none font-body 
                   prose-headings:font-headline 
                   prose-p:leading-relaxed
                   dark:prose-invert
                   prose-code:font-code prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-1 prose-code:text-foreground
                   prose-pre:font-code prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
