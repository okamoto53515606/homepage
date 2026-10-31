/**
 * 画像アップロード ヘルパーの単体テスト
 *
 * why:
 *   「ドラッグ＆ドロップしても何も起きない」系の不具合は、UI の見た目ではなく
 *   「渡されたファイルを正しく選別・抽出できているか」で決まる。ここでは DOM を
 *   使わずに、ブラウザ差異で壊れやすい 3 点だけを固定する。
 *   - file.type が空でも画像を弾かない（拡張子フォールバック）
 *   - 上限サイズ超過・非画像は「理由付きで却下」され、黙って捨てられない
 *   - dataTransfer.files が空でも items から File を拾える
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_COUNT,
  extractFilesFromDataTransfer,
  fileToBase64,
  isImageFile,
  selectUploadableImages,
} from '@/lib/image-upload';

/** 実ファイルを作らずに File 相当のオブジェクトを作る（サイズ上限テスト用） */
function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as unknown as File;
}

describe('isImageFile', () => {
  it('image/* の MIME タイプは画像と判定する', () => {
    expect(isImageFile(fakeFile('a.png', 'image/png', 10))).toBe(true);
  });

  it('type が空でも画像拡張子なら画像と判定する（他タブからのドラッグ対策）', () => {
    expect(isImageFile(fakeFile('写真.JPG', '', 10))).toBe(true);
    expect(isImageFile(fakeFile('anim.webp', '', 10))).toBe(true);
  });

  it('画像でも画像拡張子でもないファイルは除外する', () => {
    expect(isImageFile(fakeFile('doc.pdf', 'application/pdf', 10))).toBe(false);
    expect(isImageFile(fakeFile('script.js', '', 10))).toBe(false);
  });
});

describe('selectUploadableImages', () => {
  it('画像は accepted に入る', () => {
    const { accepted, rejected } = selectUploadableImages([
      fakeFile('a.png', 'image/png', 1024),
      fakeFile('b.jpg', '', 2048),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['a.png', 'b.jpg']);
    expect(rejected).toHaveLength(0);
  });

  it('非画像は理由付きで rejected になり、無言で捨てられない', () => {
    const { accepted, rejected } = selectUploadableImages([
      fakeFile('ok.png', 'image/png', 1024),
      fakeFile('ng.pdf', 'application/pdf', 1024),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['ok.png']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe('ng.pdf');
    expect(rejected[0].reason).toContain('画像ファイルではありません');
  });

  it('上限サイズを超えるファイルは rejected になる（サーバーの 10MB 上限と一致）', () => {
    const { accepted, rejected } = selectUploadableImages([
      fakeFile('huge.png', 'image/png', MAX_IMAGE_BYTES + 1),
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toContain('10MB');
  });

  it('サイズ 0 のファイルは rejected になる', () => {
    const { accepted, rejected } = selectUploadableImages([fakeFile('empty.png', 'image/png', 0)]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toContain('空');
  });

  it('1 回の上限枚数を超えた分は rejected になる', () => {
    const files = Array.from({ length: MAX_IMAGE_COUNT + 2 }, (_, i) =>
      fakeFile(`img-${i}.png`, 'image/png', 1024)
    );
    const { accepted, rejected } = selectUploadableImages(files);
    expect(accepted).toHaveLength(MAX_IMAGE_COUNT);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toContain(`${MAX_IMAGE_COUNT} 枚まで`);
  });
});

describe('extractFilesFromDataTransfer', () => {
  it('dataTransfer.files があればそれを使う', () => {
    const file = fakeFile('a.png', 'image/png', 10);
    const result = extractFilesFromDataTransfer({ files: [file] });
    expect(result).toEqual([file]);
  });

  it('files が空でも items から File を拾う（ブラウザ差異のフォールバック）', () => {
    const file = fakeFile('b.png', 'image/png', 10);
    const result = extractFilesFromDataTransfer({
      files: [],
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => file },
        { kind: 'file', getAsFile: () => null },
      ],
    });
    expect(result).toEqual([file]);
  });

  it('null / undefined では空配列を返す', () => {
    expect(extractFilesFromDataTransfer(null)).toEqual([]);
    expect(extractFilesFromDataTransfer(undefined)).toEqual([]);
  });
});

describe('fileToBase64', () => {
  it('バイト列を Base64 文字列に変換する（JSON で送るための署名可能な形式）', async () => {
    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]);
    expect(await fileToBase64(file)).toBe('iVBORw==');
  });

  it('String.fromCharCode の引数上限を超える大きさでも変換できる', async () => {
    // why: 0x8000 バイトずつに分割しているため、単一呼び出しの上限に当たらないことを確認する
    const bytes = new Uint8Array(0x8000 * 2 + 1).fill(0x41);
    const base64 = await fileToBase64(new Blob([bytes]));
    expect(base64.length).toBeGreaterThan(0);
    expect(atob(base64).length).toBe(bytes.length);
  });
});
