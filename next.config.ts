import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  staticPageGenerationTimeout: 30,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    // CSP_REPORT_ONLY=true で検知のみモード、デフォルトはブロックモード
    const reportOnly = process.env.CSP_REPORT_ONLY === 'true';

    const cspDirectives = [
      // デフォルト: 自サイトのみ許可
      "default-src 'self'",
      // スクリプト: Next.js hydration + Stripe + Google + jsdelivr（画像圧縮ライブラリ）+ GTM/GA4
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://*.google.com https://cdn.jsdelivr.net https://*.googletagmanager.com https://*.google-analytics.com",
      // スタイル: インラインスタイル許可（Tailwind等）
      "style-src 'self' 'unsafe-inline'",
      // 画像: 各種外部画像ソース + CloudFront + GTM/GA4
      "img-src 'self' data: blob: https://*.cloudfront.net https://*.googleusercontent.com https://*.googletagmanager.com https://*.google-analytics.com",
      // フォント: ローカル + data URI
      "font-src 'self' data:",
      // API通信: Google, Stripe, S3 presigned URL, CloudFront, GTM/GA4
      "connect-src 'self' https://*.amazonaws.com https://*.cloudfront.net https://*.google.com https://*.stripe.com https://*.googletagmanager.com https://*.google-analytics.com",
      // iframe: Google OAuth, Stripe決済
      "frame-src 'self' https://*.google.com https://*.stripe.com",
      // Web Worker: 画像圧縮ライブラリ（browser-image-compression）用
      "worker-src 'self' blob:",
      // プラグイン禁止
      "object-src 'none'",
      // baseタグの悪用防止
      "base-uri 'self'",
      // フォーム送信先を自サイトに限定
      "form-action 'self'",
      // 他サイトへのiframe埋め込み禁止（クリックジャッキング対策）
      "frame-ancestors 'none'",
      // HTTPをHTTPSに自動アップグレード
      "upgrade-insecure-requests",
    ];

    const cspValue = cspDirectives.join('; ');

    // モードに応じてヘッダー名を切り替え
    const headerName = reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: headerName,
            value: cspValue,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
