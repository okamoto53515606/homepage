import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, Tables } from './dynamodb';
import { getSessionDurationHours, logger } from './env';
import { getGoogleOAuthConfig } from './google-oauth';

const SESSION_COOKIE_NAME = 'session';
const SESSION_EXPIRY_HOURS = getSessionDurationHours();
const SESSION_EXPIRY_SECONDS = SESSION_EXPIRY_HOURS * 60 * 60;

export interface GoogleUserClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

export async function verifyGoogleIdToken(idToken: string, expectedNonce?: string): Promise<GoogleUserClaims> {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { clientId } = await getGoogleOAuthConfig();

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });

  if (!payload.sub) {
    throw new Error('Google id_token に sub クレームがありません');
  }

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new Error('Google id_token の nonce が一致しません');
  }

  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  };
}

async function ensureUserDocument(user: {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<void> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const result = await docClient.send(new GetCommand({
    TableName: Tables.users,
    Key: { userId: user.userId },
  }));

  if (!result.Item) {
    await docClient.send(new PutCommand({
      TableName: Tables.users,
      Item: {
        userId: user.userId,
        email: user.email || null,
        displayName: user.name || null,
        photoURL: user.picture || null,
        created_at: now,
        updated_at: now,
      },
    }));
    logger.info(`[Session] 新規ユーザードキュメント作成: ${user.userId}`);
    return;
  }

  await docClient.send(new UpdateCommand({
    TableName: Tables.users,
    Key: { userId: user.userId },
    UpdateExpression: 'SET email = :email, displayName = :name, photoURL = :photo, updated_at = :now',
    ExpressionAttributeValues: {
      ':email': user.email || null,
      ':name': user.name || null,
      ':photo': user.picture || null,
      ':now': now,
    },
  }));
  logger.info(`[Session] ユーザードキュメント更新: ${user.userId}`);
}

export async function createGoogleSession(googleUser: GoogleUserClaims): Promise<void> {
  await ensureUserDocument({
    userId: googleUser.sub,
    email: googleUser.email,
    name: googleUser.name,
    picture: googleUser.picture,
  });

  const jwt = await new SignJWT({
    email: googleUser.email,
    name: googleUser.name,
    picture: googleUser.picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(googleUser.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_HOURS}h`)
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_SECONDS,
    path: '/',
  });

  logger.info(`[Session] セッション作成: userId=${googleUser.sub}`);
}
