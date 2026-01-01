/**
 * 記事データモジュール
 * 
 * Firestore の articles コレクションから記事データを取得・管理します。
 */

import { getAdminDb } from './firebase-admin';
import { PlaceHolderImages } from './placeholder-images';

export interface Comment {
  id: string;
  authorId: string;
  location: string;
  text: string;
  timestamp: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  imageId: string;
  imageUrl?: string;
  imageHint?: string;
  access: 'free' | 'paid';
  comments: Comment[];
  status: 'published' | 'draft';
  createdAt: any;
  updatedAt: any;
}

export interface AdminArticleSummary {
  id: string;
  title: string;
  status: 'published' | 'draft';
  access: 'free' | 'paid';
  updatedAt: any;
}

export interface TagInfo {
  name: string;
  count: number;
}


// --- Client-facing functions (for user site) ---

/**
 * 公開済みの記事をすべて取得する
 * @returns {Promise<Article[]>} 公開記事の配列
 */
export async function getArticles(): Promise<Article[]> {
  try {
    const db = getAdminDb();
    // orderByをcreatedAtからupdatedAtに変更してインデックスエラーを回避
    const articlesSnapshot = await db.collection('articles')
      .where('status', '==', 'published')
      .orderBy('updatedAt', 'desc') 
      .get();
      
    if (articlesSnapshot.empty) {
      return [];
    }

    const articles = articlesSnapshot.docs.map(doc => {
      const data = doc.data();
      const articleId = data.imageAssets?.[0]?.id || 'default';
      return {
        id: doc.id,
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        imageId: articleId,
        imageUrl: data.imageAssets?.[0]?.url || PlaceHolderImages[0].imageUrl,
        imageHint: PlaceHolderImages.find(img => img.id === articleId)?.imageHint || '',
        access: data.access,
        comments: data.comments || [],
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Article;
    });
    
    return articles;
  } catch (error) {
    console.error('[data.ts] getArticles failed:', error);
    return [];
  }
}

/**
 * スラッグを指定して公開済みの記事を1件取得する
 * @param slug - 記事のスラッグ
 * @returns {Promise<Article | undefined>} 記事オブジェクト、または undefined
 */
export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  try {
    const db = getAdminDb();
    const articlesSnapshot = await db.collection('articles')
      .where('slug', '==', slug)
      .where('status', '==', 'published')
      .limit(1)
      .get();
      
    if (articlesSnapshot.empty) {
      return undefined;
    }
    
    const doc = articlesSnapshot.docs[0];
    const data = doc.data();
    const articleId = data.imageAssets?.[0]?.id || 'default';

    return {
      id: doc.id,
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      content: data.content,
      imageId: articleId,
      imageUrl: data.imageAssets?.[0]?.url || PlaceHolderImages[0].imageUrl,
      imageHint: PlaceHolderImages.find(img => img.id === articleId)?.imageHint || '',
      access: data.access,
      comments: data.comments || [],
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as Article;
  } catch (error) {
    console.error(`[data.ts] getArticleBySlug failed for slug "${slug}":`, error);
    return undefined;
  }
}

/**
 * 全てのタグと記事数を取得する
 * @param limit - 取得するタグの最大数
 * @returns {Promise<TagInfo[]>} タグ情報の配列
 */
export async function getTags(limit: number = 20): Promise<TagInfo[]> {
  try {
    const db = getAdminDb();
    const articlesSnapshot = await db.collection('articles')
      .where('status', '==', 'published')
      .select('tags')
      .get();

    const tagCounts: { [key: string]: number } = {};
    articlesSnapshot.docs.forEach(doc => {
      const tags = doc.data().tags;
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const sortedTags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
      
    return sortedTags.slice(0, limit);
  } catch (error) {
    console.error('[data.ts] getTags failed:', error);
    return [];
  }
}

// --- Admin-facing functions ---

/**
 * すべての記事（下書き含む）を管理画面用に取得する
 * @returns {Promise<AdminArticleSummary[]>} 記事の要約情報の配列
 */
export async function getAdminArticles(): Promise<AdminArticleSummary[]> {
  try {
    const db = getAdminDb();
    const articlesSnapshot = await db.collection('articles')
      .orderBy('updatedAt', 'desc')
      .get();
      
    if (articlesSnapshot.empty) {
      return [];
    }
    
    return articlesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        status: data.status,
        access: data.access,
        updatedAt: data.updatedAt,
      };
    });
  } catch (error) {
    console.error('[data.ts] getAdminArticles failed:', error);
    return [];
  }
}
