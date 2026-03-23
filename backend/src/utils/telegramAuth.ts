import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { AppError } from '../middleware/errorHandler.js';

interface VerifyTelegramInitDataParams {
  initData: string;
  botToken: string;
  maxAgeSeconds: number;
}

interface VerifyTelegramLoginPayloadParams {
  payload: Record<string, unknown>;
  botToken: string;
  maxAgeSeconds: number;
}

interface VerifyTelegramOidcIdTokenParams {
  idToken: string;
  clientId: string;
  maxAgeSeconds: number;
}

export interface TelegramIdentity {
  telegramId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramPhotoUrl: string | null;
  authDate: number;
}

const normalizeNullable = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
};

const safeHexEqual = (a: string, b: string) => {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    if (left.length !== right.length || left.length === 0) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const assertTelegramAuthDate = (authDateRaw: string, maxAgeSeconds: number) => {
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new AppError('Invalid Telegram auth date', 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (authDate > nowSec + 60 || nowSec - authDate > maxAgeSeconds) {
    throw new AppError('Telegram auth data expired', 401);
  }
  return authDate;
};

const splitTelegramName = (name: string | null) => {
  if (!name) return { firstName: null as string | null, lastName: null as string | null };
  const compact = name.trim().replace(/\s+/g, ' ');
  if (!compact) return { firstName: null as string | null, lastName: null as string | null };
  const parts = compact.split(' ');
  const firstName = parts[0] || null;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { firstName, lastName };
};

const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org';
const TELEGRAM_OIDC_JWKS = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'));

interface TelegramOidcPayload extends JWTPayload {
  id?: string | number;
  preferred_username?: string;
  name?: string;
  picture?: string;
}

export const verifyTelegramWebAppInitData = ({
  initData,
  botToken,
  maxAgeSeconds,
}: VerifyTelegramInitDataParams): TelegramIdentity => {
  const rawInitData = String(initData || '').trim();
  if (!rawInitData) {
    throw new AppError('Telegram initData is required', 400);
  }
  if (!botToken) {
    throw new AppError('Telegram integration is not configured', 503);
  }

  const params = new URLSearchParams(rawInitData);
  const receivedHash = String(params.get('hash') || '').trim().toLowerCase();
  if (!receivedHash) {
    throw new AppError('Telegram hash is missing', 400);
  }

  const authDateRaw = String(params.get('auth_date') || '').trim();
  const authDate = assertTelegramAuthDate(authDateRaw, maxAgeSeconds);

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeHexEqual(receivedHash, expectedHash)) {
    throw new AppError('Invalid Telegram auth signature', 401);
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new AppError('Telegram user payload is missing', 400);
  }

  let parsedUser: any = null;
  try {
    parsedUser = JSON.parse(userRaw);
  } catch {
    throw new AppError('Invalid Telegram user payload', 400);
  }

  const telegramId = parsedUser?.id !== undefined ? String(parsedUser.id) : '';
  if (!telegramId) {
    throw new AppError('Telegram user id is missing', 400);
  }

  return {
    telegramId,
    telegramUsername: normalizeNullable(parsedUser?.username),
    telegramFirstName: normalizeNullable(parsedUser?.first_name),
    telegramLastName: normalizeNullable(parsedUser?.last_name),
    telegramPhotoUrl: normalizeNullable(parsedUser?.photo_url),
    authDate,
  };
};

export const verifyTelegramLoginPayload = ({
  payload,
  botToken,
  maxAgeSeconds,
}: VerifyTelegramLoginPayloadParams): TelegramIdentity => {
  if (!botToken) {
    throw new AppError('Telegram integration is not configured', 503);
  }

  const hash = normalizeNullable(payload.hash)?.toLowerCase() || '';
  const authDateRaw = normalizeNullable(payload.auth_date) || '';
  const telegramId = normalizeNullable(payload.id) || '';
  if (!hash) {
    throw new AppError('Telegram hash is missing', 400);
  }
  if (!telegramId) {
    throw new AppError('Telegram user id is missing', 400);
  }
  const authDate = assertTelegramAuthDate(authDateRaw, maxAgeSeconds);

  const normalizedPayload: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    const text = String(value);
    if (!text) continue;
    normalizedPayload[key] = text;
  }

  delete normalizedPayload.hash;
  const dataCheckString = Object.entries(normalizedPayload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeHexEqual(hash, expectedHash)) {
    throw new AppError('Invalid Telegram auth signature', 401);
  }

  return {
    telegramId,
    telegramUsername: normalizeNullable(payload.username),
    telegramFirstName: normalizeNullable(payload.first_name),
    telegramLastName: normalizeNullable(payload.last_name),
    telegramPhotoUrl: normalizeNullable(payload.photo_url),
    authDate,
  };
};

export const verifyTelegramOidcIdToken = async ({
  idToken,
  clientId,
  maxAgeSeconds,
}: VerifyTelegramOidcIdTokenParams): Promise<TelegramIdentity> => {
  const rawIdToken = String(idToken || '').trim();
  if (!rawIdToken) {
    throw new AppError('Telegram id_token is required', 400);
  }
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) {
    throw new AppError('Telegram web login is not configured', 503);
  }

  let payload: TelegramOidcPayload;
  try {
    const verified = await jwtVerify(rawIdToken, TELEGRAM_OIDC_JWKS, {
      issuer: TELEGRAM_OIDC_ISSUER,
      audience: normalizedClientId,
      maxTokenAge: `${Math.max(maxAgeSeconds, 60)}s`,
      clockTolerance: '60s',
    });
    payload = verified.payload as TelegramOidcPayload;
  } catch {
    throw new AppError('Invalid Telegram id_token', 401);
  }

  const telegramId = normalizeNullable(payload.id ?? payload.sub) || '';
  if (!telegramId) {
    throw new AppError('Telegram user id is missing', 400);
  }

  const authDateRaw = normalizeNullable(payload.iat) || '';
  const authDate = assertTelegramAuthDate(authDateRaw, maxAgeSeconds);
  const fullName = normalizeNullable(payload.name);
  const nameParts = splitTelegramName(fullName);

  return {
    telegramId,
    telegramUsername: normalizeNullable(payload.preferred_username),
    telegramFirstName: nameParts.firstName,
    telegramLastName: nameParts.lastName,
    telegramPhotoUrl: normalizeNullable(payload.picture),
    authDate,
  };
};
