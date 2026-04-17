/**
 * 署名付きfetchユーティリティ
 * 
 * CloudFront OAC（Origin Access Control）では、POST/PUTリクエスト時に
 * リクエストボディのSHA256ハッシュを x-amz-content-sha256 ヘッダーに含める必要がある。
 * このユーティリティはすべてのmutationリクエストで使用する。
 * 
 * Firebase環境ではこのヘッダーは無視されるため、先行実装しても問題ない。
 */

/**
 * SHA256ハッシュを計算する
 */
async function computeSha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * x-amz-content-sha256 ヘッダー付きのfetchを実行する
 * 
 * @param url - リクエストURL
 * @param init - fetch オプション（method, body, headers 等）
 * @returns Response
 */
export async function fetchWithSigning(url: string, init: RequestInit = {}): Promise<Response> {
  const body = typeof init.body === 'string' ? init.body : '';
  const hashHex = await computeSha256(body);

  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
      'x-amz-content-sha256': hashHex,
    },
  });
}
