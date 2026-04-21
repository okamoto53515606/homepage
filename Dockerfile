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

# next.config.ts の output: 'standalone' により .next/standalone が生成される
RUN npm run build

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
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# server.js: Next.js standalone の HTTP サーバーエントリポイント
CMD ["node", "server.js"]
