import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * これからセットアップする homepage 本体のバージョンを取得する。
 *
 * why:
 *   セットアップ画面のヘッダーに「どのバージョンを入れるのか」を出したい。
 *   参照先は **リポジトリ直下の package.json を唯一の正** とする。
 *   setup/package.json は setup ツール自身のメタ情報なので、両方に同じ数字を
 *   書く運用にすると必ずズレて「画面のバージョンが実際と違う」という、表示が
 *   無いより悪い状態になる。そのため表示には setup 側の version を使わない。
 *
 *   読み込みはビルド時（配布イメージ作成時の `npm run build`）に行い、
 *   環境変数として焼き込む。setup は `~/homepage/setup` でビルド・起動される
 *   前提（docs/wsl.md）なので、`process.cwd()/..` がリポジトリ直下になる。
 */
function readAppVersion(): string | undefined {
  try {
    const rootPackageJsonPath = path.join(process.cwd(), '..', 'package.json');
    const parsed: unknown = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === 'string' && version.length > 0) return version;
    }
    return undefined;
  } catch {
    // why: package.json が無い配置（setup 単体を切り出して動かす等）でも
    //      ビルドを落とさない。表示側で setup 自身のバージョンにフォールバックする。
    return undefined;
  }
}

const appVersion = readAppVersion();

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // why: サーバー/クライアント双方から参照できるよう NEXT_PUBLIC_ を付け、
    //      ビルド時に文字列としてインライン化する。
    NEXT_PUBLIC_APP_VERSION: appVersion ?? '',
  },
};

export default nextConfig;
