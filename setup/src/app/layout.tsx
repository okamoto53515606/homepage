import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import packageJson from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "homepage v2 セットアップ",
  description: "AWS インフラの初期構築と管理者ユーザー作成",
};

/**
 * セットアップ対象（homepage 本体）のバージョン。
 *
 * why: 受け取り側が「このイメージで入るのはどのバージョンか」を画面で確認できる
 *      ようにする。値は next.config.ts がリポジトリ直下の package.json から
 *      ビルド時に焼き込んだもの（NEXT_PUBLIC_APP_VERSION）を使う。
 *      setup 自身の package.json の version は表示に使わない（二重管理による
 *      食い違いを避けるため）。取得できなかった場合のみ setup 側の値に逃げる。
 */
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b px-6 py-4">
          <h1 className="text-xl font-bold text-gray-800">
            homepage v2 セットアップ
            <span
              className="text-xs font-normal text-gray-400 ml-2"
              title="これからセットアップする homepage 本体のバージョン"
            >
              v{appVersion}
            </span>
          </h1>
        </header>
        <div className="flex">
          <Sidebar />
          <main className="flex-1 max-w-2xl py-8 px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
