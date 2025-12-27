import Link from 'next/link';
import Image from 'next/image';
import type { Article } from '@/lib/data';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight } from 'lucide-react';

interface ArticleCardProps {
  article: Article & { imageUrl?: string, imageHint?: string };
}

export default function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link href={`/articles/${article.slug}`} className="group block">
      <Card className="flex h-full flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
        <CardHeader className="p-0">
          {article.imageUrl && (
            <div className="relative h-48 w-full overflow-hidden">
              <Image
                src={article.imageUrl}
                alt={article.title}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                data-ai-hint={article.imageHint}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-6">
          <CardTitle className="mb-2 font-headline text-xl leading-tight">
            {article.title}
          </CardTitle>
          <p className="flex-1 text-muted-foreground">{article.excerpt}</p>
        </CardContent>
        <CardFooter className="flex justify-between p-6 pt-0">
          <Badge variant={article.access === 'paid' ? 'destructive' : 'secondary'} className="capitalize">
            {article.access}
          </Badge>
          <div className="flex items-center text-sm text-primary">
            Read more
            <ArrowUpRight className="ml-1 h-4 w-4 transform transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
