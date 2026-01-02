/**
 * 記事データモジュール
 * 
 * Firestore の articles コレクションから記事データを取得・管理します。
 */

import { getAdminDb } from './firebase-admin';
import type { Timestamp } from 'firebase-admin/firestore';


export interface Comment {
  id: string;
  articleId: string;
  userId: string;
  userDisplayName: string;
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
    // Firestoreでの複合クエリを避け、インデックス作成を不要にする
    // 1. まず公開済みの記事をすべて取得
    const articlesSnapshot = await db.collection('articles')
      .where('status', '==', 'published')
      .get();
      
    if (articlesSnapshot.empty) {
      return [];
    }

    // 2. 取得したデータをプログラム側で並び替え
    const articles = articlesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        access: data.access,
        status: data.status,
        tags: data.tags || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Article;
    });

    // updatedAt (Timestamp) で降順ソート
    articles.sort((a, b) => {
      const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(0);
      const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(0);
      return dateB.getTime() - dateA.getTime();
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
    
    return {
      id: doc.id,
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      content: data.content,
      access: data.access,
      status: data.status,
      tags: data.tags || [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as Article;
  } catch (error) {
    console.error(`[data.ts] getArticleBySlug failed for slug "${slug}":`, error);
    return undefined;
  }
}

/**
 * 記事IDに紐づくコメントを取得する
 * @param articleId 記事のドキュメントID
 * @returns {Promise<Comment[]>} コメントの配列
 */
export async function getCommentsForArticle(articleId: string): Promise<Comment[]> {
  try {
    const db = getAdminDb();
    const commentsSnapshot = await db.collection('comments')
      .where('articleId', '==', articleId)
      .get();

    if (commentsSnapshot.empty) {
      return [];
    }

    const comments = commentsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        articleId: data.articleId,
        content: data.content,
        countryCode: data.countryCode,
        region: data.region,
        dailyHashId: data.dailyHashId,
        createdAt: data.createdAt,
        userDisplayName: data.userDisplayName,
        userId: data.userId,
      } as Comment;
    });

    // 取得後にプログラム側でソートする
    comments.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return dateA - dateB; // 昇順（古い順）
    });

    return comments;

  } catch (error) {
    console.error(`[data.ts] getCommentsForArticle failed for articleId "${articleId}":`, error);
    return [];
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

/**
 * すべてのコメントを管理画面用に取得する
 * @returns {Promise<AdminComment[]>} コメント情報の配列
 */
export async function getAdminComments(): Promise<AdminComment[]> {
  try {
    const db = getAdminDb();
    const commentsSnapshot = await db.collection('comments').orderBy('createdAt', 'desc').get();
    if (commentsSnapshot.empty) {
      return [];
    }

    const commentsData = commentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as (Comment & {ipAddress: string})));
    
    const articleIds = [...new Set(commentsData.map(c => c.articleId))];
    if (articleIds.length === 0) {
      return [];
    }

    const articlesSnapshot = await db.collection('articles').where('__name__', 'in', articleIds).get();
    const articlesMap = new Map(articlesSnapshot.docs.map(doc => [doc.id, {title: doc.data().title, slug: doc.data().slug}]));
    
    return commentsData.map(comment => {
      const articleInfo = articlesMap.get(comment.articleId);
      return {
      ...comment,
      articleTitle: articleInfo?.title || '不明な記事',
      articleSlug: articleInfo?.slug || '',
    } as AdminComment});

  } catch (error) {
    console.error('[data.ts] getAdminComments failed:', error);
    return [];
  }
}
