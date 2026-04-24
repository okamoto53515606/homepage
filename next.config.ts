import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  staticPageGenerationTimeout: 30,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    const reportOnly = process.env.CSP_REPORT_ONLY === 'true';

    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://*.google.com https://cdn.jsdelivr.net https://*.googletagmanager.com https://*.google-analytics.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.googleusercontent.com https://*.googletagmanager.com https://*.google-analytics.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.amazonaws.com https://*.google.com https://*.stripe.com https://*.googletagmanager.com https://*.google-analytics.com",
      "frame-src 'self' https://*.google.com https://*.stripe.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ];

    const cspValue = cspDirectives.join('; ');
    const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';

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
