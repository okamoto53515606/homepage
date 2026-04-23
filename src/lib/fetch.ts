/**
 * mutation 系 fetch ユーティリティ
 *
 * 【なぜクライアントで SigV4 関連ヘッダを付けないか】
 * 2024/04 以降、CloudFront Origin Access Control (OAC) は Lambda Function URL への
 * リクエストを GET/POST/PUT/DELETE など全メソッドで自動署名するようになった。
 * これにより、かつて必要だったクライアント側の x-amz-content-sha256 ヘッダ付与は
 * 不要になった。むしろクライアント側で付与すると以下の問題を起こす:
 *   - FormData(multipart/form-data) を UNSIGNED-PAYLOAD として送ると、
 *     CloudFront OAC の再署名値と不整合になり "signature does not match" で拒否される
 *   - DELETE でブラウザが body を厳密に転送しないケースで同様に不整合を起こす
 *
 * 本ユーティリティは「JSON body の場合に Content-Type を自動設定する」という
 * 薄い便宜のみを残し、署名関連のヘッダは一切触らない。
 */

/**
 * mutation リクエスト用 fetch。JSON 時のみ Content-Type を補う。
 *
 * @param url - リクエストURL
 * @param init - fetch オプション（method, body, headers 等）
 * @returns Response
 */
export async function fetchWithSigning(url: string, init: RequestInit = {}): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  const headers: Record<string, string> = {
    // FormData はブラウザが boundary 付きの Content-Type を設定するため触らない。
    // JSON body を想定してそれ以外は application/json を既定にする（呼び出し側で上書き可）。
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string>),
  };

  return fetch(url, {
    ...init,
    headers,
  });
}
