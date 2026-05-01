/**
 * Vitest 設定
 *
 * why: Route Handler を直接 import して攻撃観点で叩くため、
 *      jsdom ではなく node 環境で動かす（fetch / Request / Response は Node 22+ ネイティブ）。
 *      tsconfig の paths（"@/lib/..."）を解決するため tsconfigPaths プラグインを噛ませる。
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
  },
});
