/**
 * データ取得モジュール
 * 
 * Firestore のデータを取得・管理します。
 * 主にサーバーコンポーネントやAPIルートから使用されます。
 */

import { getAdminDb } from './firebase-admin';
import { logger } from './env';
import type { Timestamp, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';

// --- 型定義 ---

export interface Comment {
  id: string;
  articleId: string;
  userId: string;
  content: string;
  countryCode: string;
  region: string;
  dailyHashId: string;
  createdAt: Timestamp;
}

export interface AdminComment extends Comment {
  articleTitle: string;
  articleSlug: string;
  ipAddress: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  access: 'free' | 'paid';
  status: 'published' | 'draft';
  tags: string[];
  imageAssets?: { url: string; fileName: string; }[];
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

interface PaginatedResponse<T> {
  items: T[];
  hasMore?: boolean; // admin用
  totalCount?: number; // client用
}

// --- 定数 ---

const ARTICLES_PAGE_SIZE = 30;
const ADMIN_PAGE_SIZE = 100;

// --- 利用者サイト向け関数 ---

/**
 * 公開済みの記事をページネーション付きで取得する
 * @param options - ページ、リミット、タグ
 * @returns 記事の配列と総記事数
 */
export async function getArticles(options: { page?: number; limit?: number; tag?: string }): Promise<{ articles: Article[]; totalCount: number }> {
  const { page = 1, limit = ARTICLES_PAGE_SIZE, tag } = options;
  
  try {
    const db = getAdminDb();
    let query = db.collection('articles').where('status', '==', 'published');
    
    if (tag) {
      query = query.where('tags', 'array-contains', tag);
    }
    
    // まず総件数を取得
    const countSnapshot = await query.count().get();
    const totalCount = countSnapshot.data().count;

    // 指定されたページのデータを取得
    const articlesSnapshot = await query
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .get();
      
    if (articlesSnapshot.empty) {
      return { articles: [], totalCount: 0 };
    }

    const articles = articlesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Article));

    return { articles, totalCount };

  } catch (error) {
    logger.error('[data.ts] getArticles failed:', error);
    return { articles: [], totalCount: 0 };
  }
}


/**
 * スラッグを指定して公開済みの記事を1件取得する
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
    
    return {
      id: doc.id,
      ...data,
    } as Article;
  } catch (error) {
    logger.error(`[data.ts] getArticleBySlug failed for slug "${slug}":`, error);
    return undefined;
  }
}


/**
 * 記事IDに紐づくコメントを取得する
 * @param articleId - 記事のドキュメントID
 * @param limit - 取得する最大件数
 * @returns コメントの配列
 */
export async function getCommentsForArticle(articleId: string, limit: number = 100): Promise<Comment[]> {
  try {
    const db = getAdminDb();
    const commentsSnapshot = await db.collection('comments')
      .where('articleId', '==', articleId)
      .orderBy('createdAt', 'desc') // 最新のものから取得
      .limit(limit)
      .get();

    if (commentsSnapshot.empty) {
      return [];
    }

    const comments = commentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Comment));

    // 昇順（古い順）に並び替えて返す
    return comments.reverse();

  } catch (error) {
    logger.error(`[data.ts] getCommentsForArticle failed for articleId "${articleId}":`, error);
    return [];
  }
}

/**
 * 全てのタグと記事数を取得する
 */
export async function getTags(limit: number = 30): Promise<TagInfo[]> {
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
    logger.error('[data.ts] getTags failed:', error);
    return [];
  }
}

// --- 管理画面向け関数 ---

/**
 * すべての記事（下書き含む）を管理画面用に取得する
 */
export async function getAdminArticles(page: number = 1): Promise<PaginatedResponse<AdminArticleSummary>> {
  try {
    const db = getAdminDb();
    let query = db.collection('articles').orderBy('updatedAt', 'desc');
    const limit = ADMIN_PAGE_SIZE;

    if (page > 1) {
      const offset = (page - 1) * limit;
      const previousDocs = await query.limit(offset).get();
      if (!previousDocs.empty) {
        const lastVisible = previousDocs.docs[previousDocs.docs.length - 1];
        query = query.startAfter(lastVisible);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
      
    if (snapshot.empty) {
      return { items: [], hasMore: false };
    }

    const hasMore = snapshot.docs.length > limit;
    const items = snapshot.docs.slice(0, limit).map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        status: data.status,
        access: data.access,
        updatedAt: data.updatedAt,
      };
    });

    return { items, hasMore };

  } catch (error) {
    logger.error('[data.ts] getAdminArticles failed:', error);
    return { items: [], hasMore: false };
  }
}


/**
 * すべてのコメントを管理画面用に取得する
 */
export async function getAdminComments(page: number = 1): Promise<PaginatedResponse<AdminComment>> {
  try {
    const db = getAdminDb();
    let query = db.collection('comments').orderBy('createdAt', 'desc');
    const limit = ADMIN_PAGE_SIZE;

    if (page > 1) {
      const offset = (page - 1) * limit;
      const previousDocs = await query.limit(offset).get();
      if (!previousDocs.empty) {
        const lastVisible = previousDocs.docs[previousDocs.docs.length - 1];
        query = query.startAfter(lastVisible);
      }
    }

    const commentsSnapshot = await query.limit(limit + 1).get();
    if (commentsSnapshot.empty) {
      return { items: [], hasMore: false };
    }

    const hasMore = commentsSnapshot.docs.length > limit;
    const commentsData = commentsSnapshot.docs.slice(0, limit).map(doc => ({ id: doc.id, ...doc.data() } as (Comment & {ipAddress: string})));
    
    const articleIds = [...new Set(commentsData.map(c => c.articleId))];
    let articlesMap = new Map();
    if (articleIds.length > 0) {
      const articlesSnapshot = await db.collection('articles').where('__name__', 'in', articleIds).get();
      articlesMap = new Map(articlesSnapshot.docs.map(doc => [doc.id, {title: doc.data().title, slug: doc.data().slug}]));
    }
    
    const items = commentsData.map(comment => {
      const articleInfo = articlesMap.get(comment.articleId);
      return {
        ...comment,
        articleTitle: articleInfo?.title || '不明な記事',
        articleSlug: articleInfo?.slug || '',
      } as AdminComment;
    });

    return { items, hasMore };

  } catch (error) {
    logger.error('[data.ts] getAdminComments failed:', error);
    return { items: [], hasMore: false };
  }
}
