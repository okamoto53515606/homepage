import { getArticles, type Article } from '@/lib/data';
import ArticleCard from '@/components/article-card';

export default async function Home() {
  const articles = await getArticles();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-4xl font-bold font-headline text-center">
        Featured Articles
      </h1>
      {articles.length > 0 ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article: Article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">
          No articles available at the moment.
        </p>
      )}
    </div>
  );
}
