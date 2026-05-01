/**
 * テスト共通セットアップ
 *
 * why:
 * - Route Handler は process.env / next/headers / DynamoDB クライアントに依存する。
 *   テスト時はこれらを安全な値・モックで埋め、副作用を出さない。
 * - 各テストは vi.mock で個別にモック差し替えできるよう、ここでは最小限の env だけ用意する。
 */
import { beforeAll } from 'vitest';

beforeAll(() => {
  // why: jose / Cognito 検証で参照されるため、フォーマット上正しい値を入れておく
  process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'ap-northeast-1_TESTPOOL';
  process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || 'test-client-id';
  process.env.COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || 'test.auth.ap-northeast-1.amazoncognito.com';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(64);
  process.env.DAILY_HASH_SALT = process.env.DAILY_HASH_SALT || 'test-salt';
  process.env.DYNAMODB_TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'test_';
  process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});
