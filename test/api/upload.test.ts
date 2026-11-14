/**
 * 管理画面メディアアップロード API のセキュリティテスト
 *
 * why:
 *   `/api/admin/upload` は S3 に書き込む唯一の経路で、Content-Type とボディが
 *   そのまま配信物になる。攻撃観点で以下を固定する（コードレビューで
 *   「if 文を消した」「許可リストを緩めた」変更を検出するのが目的）。
 *   - 未認証 → 403（S3 に書き込まない）
 *   - 型不正（contentType が数値など）→ 500 ではなく 400
 *   - SVG（実行可能な画像）→ 400 / 実データが SVG でも 400
 *   - 申告 Content-Type と実データの不一致 → 400
 *   - 正常な PNG → 200、ContentType は申告値ではなく検出値、拡張子も検出値
 *   - ファイル名の `../` でキーを脱出できない
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.S3_BUCKET_NAME = 'test-media-bucket';

const { s3Send } = vi.hoisted(() => ({ s3Send: vi.fn(async () => ({ ETag: '"x"' })) }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = s3Send;
  },
  PutObjectCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  getAdminUser: vi.fn(async () => ({ isAuthenticated: false })),
}));

vi.mock('@/lib/env', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG シグネチャ
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
]);
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const SVG_BYTES = new TextEncoder().encode(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

function uploadRequest(payload: unknown): NextRequest {
  return new NextRequest('https://example.com/api/admin/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** 管理者として認証済みの状態にする */
async function signInAsAdmin() {
  const auth = await import('@/lib/admin-auth');
  vi.mocked(auth.getAdminUser).mockResolvedValue({
    isAuthenticated: true,
    email: 'admin@example.com',
    sub: 'sub-1',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/upload — 認証ゲート', () => {
  it('未認証 → 403（S3 へは書き込まない）', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({ filename: 'a.png', contentType: 'image/png', dataBase64: toBase64(PNG_BYTES) })
    );
    expect(res.status).toBe(403);
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/upload — 入力の型検証（500 にしない）', () => {
  beforeEach(signInAsAdmin);

  it('contentType が数値 → 400', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(uploadRequest({ filename: 'a.png', contentType: 123, dataBase64: 'AAAA' }));
    expect(res.status).toBe(400);
  });

  it('filename がオブジェクト → 400', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({ filename: { a: 1 }, contentType: 'image/png', dataBase64: 'AAAA' })
    );
    expect(res.status).toBe(400);
  });

  it('dataBase64 が空 → 400', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(uploadRequest({ filename: 'a.png', contentType: 'image/png', dataBase64: '' }));
    expect(res.status).toBe(400);
  });

  it('JSON でないボディ → 400', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const req = new NextRequest('https://example.com/api/admin/upload', {
      method: 'POST',
      body: '{not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/upload — SVG（Stored XSS）対策', () => {
  beforeEach(signInAsAdmin);

  it('image/svg+xml を申告 → 400（許可リストで拒否）', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
        dataBase64: toBase64(SVG_BYTES),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('SVG');
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('SVG の中身を image/png と偽装 → 400（マジックバイト不一致）', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({
        filename: 'logo.png',
        contentType: 'image/png',
        dataBase64: toBase64(SVG_BYTES),
      })
    );
    expect(res.status).toBe(400);
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('HTML の中身を image/png と偽装 → 400', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const html = new TextEncoder().encode('<html><body><script>alert(1)</script></body></html>');
    const res = await POST(
      uploadRequest({ filename: 'x.png', contentType: 'image/png', dataBase64: toBase64(html) })
    );
    expect(res.status).toBe(400);
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/upload — Content-Type と実データの一致', () => {
  beforeEach(signInAsAdmin);

  it('JPEG の中身を image/png と申告 → 400', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({ filename: 'a.png', contentType: 'image/png', dataBase64: toBase64(JPEG_BYTES) })
    );
    expect(res.status).toBe(400);
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/upload — 正常系', () => {
  beforeEach(signInAsAdmin);

  it('PNG → 200、ContentType と拡張子は検出値を使う', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({ filename: 'photo.png', contentType: 'image/png', dataBase64: toBase64(PNG_BYTES) })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.key).toMatch(/^media\/articles\/sub-1\/\d+-[0-9a-f]{8}-photo\.png$/);
    expect(json.publicUrl).toBe(`/${json.key}`);

    expect(s3Send).toHaveBeenCalledTimes(1);
    const command = s3Send.mock.calls[0][0] as unknown as { input: Record<string, unknown> };
    expect(command.input.Bucket).toBe('test-media-bucket');
    expect(command.input.ContentType).toBe('image/png');
    expect(command.input.CacheControl).toBe('public, max-age=31536000, immutable');
    expect((command.input.Body as Buffer).length).toBe(PNG_BYTES.length);
  });

  it('filename に ../ を入れてもキーが media/articles/<sub>/ の外に出ない', async () => {
    const { POST } = await import('@/app/api/admin/upload/route');
    const res = await POST(
      uploadRequest({
        filename: '../../etc/passwd.png',
        contentType: 'image/png',
        dataBase64: toBase64(PNG_BYTES),
      })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    // media / articles / sub-1 / <filename> の 4 セグメントから増えない
    expect(json.key.split('/')).toHaveLength(4);
    expect(json.key.startsWith('media/articles/sub-1/')).toBe(true);
    expect(json.key).not.toContain('..');
  });
});
