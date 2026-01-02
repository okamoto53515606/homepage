/**
 * 記事詳細ページのサーバーアクション
 * 
 * @description
 * コメントの投稿処理を行います。
 */
'use server';

import { getUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { z } from 'zod';

const salt = process.env.DAILY_HASH_SALT || 'default-salt';

/**
 * IPアドレスと日付から日替わりハッシュIDを生成する
 */
function generateDailyHash(ip: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return createHash('sha256').update(ip + date + salt).digest('hex').substring(0, 8);
}

interface GeoInfo {
  countryCode: string;
  regionName: string;
}

/**
 * IPアドレスからGeo情報を取得する
 * @param ip IPアドレス
 * @returns 国コードと地域名
 */
async function getGeoInfoFromIp(ip: string): Promise<GeoInfo> {
  try {
    // NODE_ENVによる分岐を削除し、常にAPIを呼び出す
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,regionName,status,message`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        countryCode: data.countryCode || 'N/A',
        regionName: data.regionName || 'N/A',
      };
    } else {
      console.warn(`[GeoIP] API Error for IP ${ip}: ${data.message}`);
      return { countryCode: 'N/A', regionName: 'N/A' };
    }
  } catch (error) {
    console.error(`[GeoIP] Fetch Error for IP ${ip}:`, error);
    return { countryCode: 'N/A', regionName: 'N/A' };
  }
}


/**
 * ヘッダーからIPアドレスとUserAgentを取得する
 */
function getRequestInfo() {
  const headersList = headers();
  // App Hosting環境で付与される x-fah-client-ip を使用
  const ip = headersList.get('x-fah-client-ip') || '0.0.0.0';
  const userAgent = headersList.get('user-agent') || 'N/A';
  return { ip, userAgent };
}

// フォームのバリデーションスキーマ
const CommentSchema = z.object({
  content: z.string().min(1, 'コメントは1文字以上で入力してください。').max(1000, 'コメントは1000文字以内で入力してください。'),
  articleId: z.string(),
});

/**
 * コメントを投稿するサーバーアクション
 */
export async function handleAddComment(prevState: any, formData: FormData) {
  const user = await getUser();

  // ログインしていない場合はエラー
  if (!user.isLoggedIn || !user.uid || !user.name) {
    return { status: 'error', message: 'コメントするにはログインが必要です。' };
  }

  const validatedFields = CommentSchema.safeParse({
    content: formData.get('content'),
    articleId: formData.get('articleId'),
  });

  // バリデーション失敗
  if (!validatedFields.success) {
    return { status: 'error', message: validatedFields.error.issues[0].message };
  }
  
  const { content, articleId } = validatedFields.data;
  const { ip, userAgent } = getRequestInfo();
  const geoInfo = await getGeoInfoFromIp(ip);

  try {
    const db = getAdminDb();
    
    const newComment = {
      articleId,
      content,
      userId: user.uid,
      userDisplayName: user.name,
      countryCode: geoInfo.countryCode,
      region: geoInfo.regionName,
      dailyHashId: generateDailyHash(ip),
      ipAddress: ip,
      userAgent,
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection('comments').add(newComment);
    
    // 記事ページのキャッシュをクリアして再生成
    const articleDoc = await db.collection('articles').doc(articleId).get();
    const slug = articleDoc.data()?.slug;
    if (slug) {
      revalidatePath(`/articles/${slug}`);
    }

    return { status: 'success', message: 'コメントを投稿しました。' };
  } catch (error) {
    console.error('[Action] コメントの投稿に失敗:', error);
    return { status: 'error', message: 'コメントの投稿中にサーバーエラーが発生しました。' };
  }
}
