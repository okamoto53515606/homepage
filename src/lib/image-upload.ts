/**
 * 画像アップロードの共通ヘルパー（ブラウザ専用・DOM 非依存の純粋関数のみ）
 *
 * why:
 *   記事生成フォームと記事修正フォームで「画像を選ぶ → 圧縮する → Base64 で
 *   `/api/admin/upload` に送る」処理が二重実装されていた。片方だけサイズ上限
 *   チェックが無い・片方だけドロップ時のファイル取得が弱い、といった挙動差が
 *   バグの温床になるため 1 箇所に寄せる。
 *
 *   ここには UI を持たない純粋関数だけを置く。`browser-image-compression` の
 *   ように `window` を参照するライブラリは import しないので、jsdom を使わない
 *   node 環境の Vitest からそのまま単体テストできる。
 */

/**
 * アップロード 1 ファイルあたりの上限（Base64 エンコード前の実バイト数）。
 * why: サーバー側 (`/api/admin/upload`) の MAX_FILE_SIZE と揃えないと、
 *      クライアントで通ったファイルが本番で 400 になり「なぜか上がらない」に化ける。
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 1 回のドロップ / 選択で受け付けるファイル数の上限（誤操作で大量送信しないため） */
export const MAX_IMAGE_COUNT = 20;

/** 画像として受け付ける拡張子（`file.type` が空の環境向けのフォールバック） */
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg)$/i;

/** 却下されたファイルと、その理由（ユーザーに表示する日本語文言） */
export interface RejectedImageFile {
  name: string;
  reason: string;
}

export interface ImageSelection {
  accepted: File[];
  rejected: RejectedImageFile[];
}

/**
 * 画像ファイルかどうかを判定する。
 *
 * why: 他のタブやデスクトップから画像をドラッグすると `file.type` が空文字の
 *      ことがある（特に拡張子だけのファイルや一部 OS のドラッグ）。type だけで
 *      弾くと「画像なのに弾かれる」ため拡張子でも救済する。
 */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSION_PATTERN.test(file.name);
}

/**
 * 選択されたファイルを「アップロードする / しない」に振り分ける。
 *
 * why: 黙って捨てると「ドラッグしても何も起きない」＝不具合に見える。
 *      却下理由を返して UI 側で必ず表示できるようにする。
 */
export function selectUploadableImages(files: readonly File[]): ImageSelection {
  const accepted: File[] = [];
  const rejected: RejectedImageFile[] = [];

  for (const file of files) {
    if (!isImageFile(file)) {
      rejected.push({ name: file.name, reason: '画像ファイルではありません' });
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push({
        name: file.name,
        reason: `サイズが上限（${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB）を超えています`,
      });
      continue;
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'ファイルが空です' });
      continue;
    }
    if (accepted.length >= MAX_IMAGE_COUNT) {
      rejected.push({ name: file.name, reason: `1 回に ${MAX_IMAGE_COUNT} 枚までです` });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejected };
}

/**
 * ドラッグ中に渡された `DataTransfer` から File を取り出す。
 *
 * why: `dataTransfer.files` が空でも `dataTransfer.items` に file が入っている
 *      ケースがある（ブラウザ差異）。files だけ見て `return` すると
 *      「ドロップしても無反応」になるため items もフォールバックで走査する。
 *      DOM 型に依存しすぎないよう受け取る型は最小限の構造的部分型にしている。
 */
export interface DataTransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile: () => File | null }> | null;
}

export function extractFilesFromDataTransfer(dataTransfer: DataTransferLike | null | undefined): File[] {
  if (!dataTransfer) return [];

  const direct = Array.from(dataTransfer.files ?? []);
  if (direct.length > 0) return direct;

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/**
 * File/Blob を Base64 文字列に変換する。
 *
 * why: CloudFront OAC + Lambda Function URL では body の SHA256 を
 *      `x-amz-content-sha256` に載せる必要があり、FormData（boundary が
 *      ブラウザ内部生成）では署名が破綻する。JSON + Base64 なら送信バイト列が
 *      確定するため署名検証が通る（サーバー側 route.ts のコメント参照）。
 *      大きい画像でも `String.fromCharCode(...)` の引数上限を超えないよう
 *      チャンク分割して連結する。
 */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
