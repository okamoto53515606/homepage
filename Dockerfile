# ===========================================================
# Stage 1: 依存関係インストール
# ===========================================================
FROM public.ecr.aws/docker/library/node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
# production 依存関係のみインストール
RUN npm ci --omit=dev

# ===========================================================
# Stage 2: Next.js ビルド
# ===========================================================
FROM public.ecr.aws/docker/library/node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
# ビルドには全依存関係が必要
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# why: Next.js 16 の Turbopack はネイティブバインディング（@next/swc-linux-x64-musl）を
#      必要とするが、node:20-alpine（musl libc）環境では npm ci が optional フラグを
#      見てホスト OS 判定を誤り musl バインディングをインストールしない。
#      その結果 WASM フォールバックのみになり Turbopack が起動を拒否してビルドが失敗する。
#      --webpack を明示することで Turbopack を使わず Webpack でビルドする。
#      alpine ベースのイメージを使い続ける限りこのフラグが必要。
# next.config.ts の output: 'standalone' により .next/standalone が生成される
RUN npm run build -- --webpack

# ===========================================================
# Stage 3: ランタイム（Lambda Web Adapter）
# ===========================================================
FROM public.ecr.aws/docker/library/node:20-alpine AS runner

WORKDIR /var/task

# Lambda Web Adapter をコピー
# AWS が提供する公式 Extension イメージからコピーする方式
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Lambda Web Adapter がリッスンするポート
ENV PORT=3000
ENV AWS_LWA_PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone ビルドをコピー
# why: --chown で root 所有を回避し、後続の USER node でも書込/読込可能に
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# why: 非 root 実行で defense-in-depth。Lambda の microVM 隔離に加え
# コンテナ内の権限昇格リスクを排除し、Semgrep の dockerfile.security.missing-user
# ルールも満たす。node:alpine に既存の node ユーザー (uid 1000) を利用。
USER node

# server.js: Next.js standalone の HTTP サーバーエントリポイント
CMD ["node", "server.js"]
