/**
 * 画像実体判定（マジックバイト）の単体テスト
 *
 * why:
 *   `/api/admin/upload` の許可判定はこのモジュールに依存している。
 *   「SVG を通してしまう」「JPEG を PNG と誤判定する」といった変更が入ると
 *   Stored XSS（同一オリジンで script 実行）に直結するため、
 *   形式ごとの判定結果と、判定不能時の null を固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  ALLOWED_IMAGE_TYPES,
  detectImageType,
  imageTypeToExtension,
  normalizeImageContentType,
} from '@/lib/image-signature';

const latin1 = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));

/** 実ファイルを使わず、シグネチャ + ダミー本体で最小のバイト列を作る */
function bytes(...parts: (number[] | string)[]): Uint8Array {
  const flat = parts.flatMap((part) => (typeof part === 'string' ? latin1(part) : part));
  return new Uint8Array(flat);
}

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('detectImageType', () => {
  it('PNG を判定する', () => {
    expect(detectImageType(bytes(PNG_HEADER, [0, 0, 0, 13], 'IHDR'))).toBe('image/png');
  });

  it('JPEG を判定する', () => {
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0], new Array(12).fill(0)))).toBe('image/jpeg');
  });

  it('GIF87a / GIF89a を判定する', () => {
    expect(detectImageType(bytes('GIF87a', new Array(8).fill(0)))).toBe('image/gif');
    expect(detectImageType(bytes('GIF89a', new Array(8).fill(0)))).toBe('image/gif');
  });

  it('WebP を判定する（RIFF コンテナ）', () => {
    expect(detectImageType(bytes('RIFF', [0x24, 0x00, 0x00, 0x00], 'WEBPVP8 '))).toBe('image/webp');
  });

  it('AVIF を判定する（major brand = avif）', () => {
    expect(detectImageType(bytes([0x00, 0x00, 0x00, 0x20], 'ftypavif', 'mif1'))).toBe('image/avif');
  });

  it('AVIF を判定する（compatible brands にのみ avif）', () => {
    expect(detectImageType(bytes([0x00, 0x00, 0x00, 0x20], 'ftypmif1', 'miaf', 'avif'))).toBe('image/avif');
  });

  it('SVG は判定しない（実行可能な画像のため意図的に拒否）', () => {
    const svg = bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(detectImageType(svg)).toBeNull();
  });

  it('HTML / テキストは判定しない', () => {
    expect(detectImageType(bytes('<html><body>hi</body></html>'))).toBeNull();
    expect(detectImageType(bytes('hello world, not an image at all'))).toBeNull();
  });

  it('短すぎるデータは判定しない', () => {
    expect(detectImageType(new Uint8Array([]))).toBeNull();
    expect(detectImageType(bytes(PNG_HEADER))).toBeNull(); // 8 バイト < 12
  });

  it('HEIC / BMP は許可しない（シグネチャが弱い / ブラウザ表示が不安定）', () => {
    expect(detectImageType(bytes([0x00, 0x00, 0x00, 0x20], 'ftypheic', 'mif1'))).toBeNull();
    expect(detectImageType(bytes('BM', new Array(20).fill(0)))).toBeNull();
  });
});

describe('normalizeImageContentType', () => {
  it('許可形式を受け付ける', () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(normalizeImageContentType(type)).toBe(type);
    }
  });

  it('大文字・パラメータ付き・image/jpg を吸収する', () => {
    expect(normalizeImageContentType('IMAGE/PNG')).toBe('image/png');
    expect(normalizeImageContentType('image/jpeg; charset=binary')).toBe('image/jpeg');
    expect(normalizeImageContentType('image/jpg')).toBe('image/jpeg');
  });

  it('SVG を拒否する（最重要）', () => {
    expect(normalizeImageContentType('image/svg+xml')).toBeNull();
    expect(normalizeImageContentType('image/svg+xml; charset=utf-8')).toBeNull();
    expect(normalizeImageContentType('image/svg')).toBeNull();
  });

  it('画像以外の MIME を拒否する', () => {
    expect(normalizeImageContentType('text/html')).toBeNull();
    expect(normalizeImageContentType('application/javascript')).toBeNull();
    expect(normalizeImageContentType('')).toBeNull();
  });
});

describe('imageTypeToExtension', () => {
  it('形式ごとの保存拡張子を返す（クライアントの filename は使わない）', () => {
    expect(imageTypeToExtension('image/png')).toBe('png');
    expect(imageTypeToExtension('image/jpeg')).toBe('jpg');
    expect(imageTypeToExtension('image/webp')).toBe('webp');
    expect(imageTypeToExtension('image/gif')).toBe('gif');
    expect(imageTypeToExtension('image/avif')).toBe('avif');
  });
});
