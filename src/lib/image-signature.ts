/**
 * 画像ファイルの実体（マジックバイト）判定
 *
 * 【なぜ必要か】
 *   `/api/admin/upload` は従来 Content-Type をクライアントの自己申告だけで受け取り、
 *   それをそのまま S3 オブジェクトのメタデータに書いていた。S3 → CloudFront は
 *   メタデータの Content-Type をそのまま配信するため、申告値を信じると
 *   「中身は任意、Content-Type だけ画像」というオブジェクトを作れてしまう。
 *
 *   とくに SVG は XML に `<script>` を埋め込める「実行可能な画像」で、
 *   `/media/*` は同一オリジン・CSP なし（CSP は Next.js が返す HTML にのみ付与）で
 *   配信されるため、直接開かせるとサイトのオリジンで JS が走る = Stored XSS になる。
 *   管理者セッション（`admin_session`, HttpOnly）は読めないが、同一オリジンなので
 *   `/api/admin/*` を本人権限で叩けてしまい、シークレット設定の持ち出しまで繋がる。
 *
 * 【方針】
 *   先頭バイトから実際の形式を判定し、申告された Content-Type と一致した場合のみ
 *   受け付ける（`detectImageType` + `normalizeImageContentType`）。
 *   許可するのは「ブラウザが画像として描画するだけでスクリプトを実行しない」形式のみ。
 *
 *   - SVG（XML テキスト）: 固定シグネチャが無く実行可能なので **意図的に拒否**
 *   - HEIC/HEIF: `ftyp` ボックスの brand 依存で判定が曖昧、かつブラウザ表示も不安定
 *   - BMP: シグネチャが 2 バイト（`BM`）だけで衝突しやすい
 *   → いずれも `null`（= 判定不能 → 拒否）に落とす。
 */

/** 受け付ける画像形式（サーバー・クライアント双方の許可リストの正） */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 形式 → 保存時の拡張子。クライアントの filename ではなくこの値を使う */
const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** PNG のシグネチャ（8 バイト） */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * `bytes` の `offset` 位置から ASCII 文字列が一致するか。
 * why: `TextDecoder` で全体を文字列化すると 10MB のバッファで無駄なメモリを使うため、
 *      必要な数バイトだけ直接比較する。
 */
function asciiAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * 申告された Content-Type を許可リストに正規化する。
 *
 * why: `image/jpeg; charset=binary` のようなパラメータ付きや `image/jpg`（非標準だが
 *      一部環境が返す）を弾くと「正しい画像なのに 400」になるため吸収する。
 *      許可リストに無いもの（`image/svg+xml` を含む）は `null` を返し、呼び出し側が拒否する。
 */
export function normalizeImageContentType(raw: string): AllowedImageType | null {
  const baseType = raw.split(';')[0].trim().toLowerCase();
  const normalized = baseType === 'image/jpg' || baseType === 'image/pjpeg' ? 'image/jpeg' : baseType;
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalized)
    ? (normalized as AllowedImageType)
    : null;
}

/** 判定した形式から保存用の拡張子を得る */
export function imageTypeToExtension(type: AllowedImageType): string {
  return EXTENSION_BY_TYPE[type];
}

/**
 * 実データの先頭バイトから画像形式を判定する。
 *
 * @returns 許可形式なら `AllowedImageType`、判定できない（SVG テキスト・HTML・壊れたデータ等）なら `null`
 *
 * why: 12 バイト未満はどの形式のシグネチャも満たせないため早期に `null`。
 *      AVIF は `ftyp` ボックスのブランドで判定するが、major brand が `mif1` 等で
 *      compatible brands にのみ `avif` が入るファイルもあるため、box 内を走査する。
 *      走査範囲は box サイズで打ち切る（10MB のバッファを無制限に舐めない）。
 */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length < 12) return null;

  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return 'image/png';

  // JPEG: SOI (FF D8) + 最初のマーカー (FF)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  if (asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a')) return 'image/gif';

  // WebP: RIFF コンテナ + 4 バイト長 + 'WEBP'
  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) return 'image/webp';

  if (asciiAt(bytes, 4, 'ftyp')) {
    // ftyp box のサイズ（先頭 4 バイト, big-endian）
    const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const boxEnd = Math.min(boxSize > 0 ? boxSize : 0, bytes.length);

    if (asciiAt(bytes, 8, 'avif') || asciiAt(bytes, 8, 'avis')) return 'image/avif';

    // compatible brands（16 バイト目以降を 4 バイト刻み）に avif が含まれるケース
    for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
      if (asciiAt(bytes, offset, 'avif')) return 'image/avif';
    }
  }

  return null;
}
