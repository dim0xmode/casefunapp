import { Request, Response, NextFunction } from 'express';

type RateEntry = {
  windowStart: number;
  hits: number;
  lastSeen: number;
};

type GlobalRateEntry = {
  windowStart: number;
  hits: number;
};

const WINDOW_MS = 60_000;
const CLEANUP_EVERY_MS = 5 * 60_000;
const STALE_AFTER_MS = 30 * 60_000;
const MAX_TRACKED_KEYS = 20_000;

const store = new Map<string, RateEntry>();
const globalStore = new Map<Bucket, GlobalRateEntry>();

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_PREFIX = '/api/';

type Bucket =
  | 'health'
  | 'cases_public'
  | 'cases_stats'
  | 'auth_nonce'
  | 'auth'
  | 'wallet_price'
  | 'write'
  | 'default';

const resolveBucket = (req: Request): Bucket => {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || '');
  const includeStats = String(req.query?.includeStats || '') === '1';

  if (path === '/api/health') return 'health';
  if (path.startsWith('/api/cases') && method === 'GET') {
    return includeStats ? 'cases_stats' : 'cases_public';
  }
  if (path === '/api/auth/nonce') return 'auth_nonce';
  if (path.startsWith('/api/auth/')) return 'auth';
  if (path === '/api/wallet/price' && method === 'GET') return 'wallet_price';
  if (BODY_METHODS.has(method)) return 'write';
  return 'default';
};

const normalizeIp = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const getClientIp = (req: Request) => {
  const ip = normalizeIp(String(req.ip || req.socket.remoteAddress || ''));
  return ip || 'unknown';
};

const resolveLimit = (bucket: Bucket): number => {
  switch (bucket) {
    case 'health':
      return 180;
    case 'cases_public':
      return 180;
    case 'cases_stats':
      return 20;
    case 'auth_nonce':
      return 40;
    case 'auth':
      return 120;
    case 'wallet_price':
      return 60;
    case 'write':
      return 90;
    default:
      return 240;
  }
};

const resolveGlobalLimit = (bucket: Bucket): number => {
  switch (bucket) {
    case 'health':
      return 6_000;
    case 'cases_public':
      return 6_000;
    case 'cases_stats':
      return 600;
    case 'auth_nonce':
      return 1_200;
    case 'auth':
      return 2_400;
    case 'wallet_price':
      return 1_500;
    case 'write':
      return 3_000;
    default:
      return 8_000;
  }
};

const resolveOverflowKey = (bucket: Bucket) => `__overflow__:${bucket}`;

const tooManyHeaders = (req: Request) => {
  const headerCount = Math.floor((req.rawHeaders?.length || 0) / 2);
  return headerCount > 80;
};

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now - value.lastSeen > STALE_AFTER_MS) {
      store.delete(key);
    }
  }
  for (const [bucket, value] of globalStore.entries()) {
    if (now - value.windowStart >= WINDOW_MS) {
      globalStore.delete(bucket);
    }
  }
}, CLEANUP_EVERY_MS).unref();

export const apiRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const path = String(req.path || '');
  if (!path.startsWith(API_PREFIX)) return next();

  if (String(req.method || '').toUpperCase() === 'OPTIONS') return next();

  if (tooManyHeaders(req)) {
    return res.status(431).json({
      status: 'error',
      message: 'Too many headers',
    });
  }

  const now = Date.now();
  const ip = getClientIp(req);
  const bucket = resolveBucket(req);
  const limit = resolveLimit(bucket);
  const candidateKey = `${ip}:${bucket}`;

  const hasExistingKey = store.has(candidateKey);
  const key =
    hasExistingKey || store.size < MAX_TRACKED_KEYS
      ? candidateKey
      : resolveOverflowKey(bucket);

  const existing = store.get(key);
  let entry: RateEntry = existing ?? {
    windowStart: now,
    hits: 0,
    lastSeen: now,
  };

  if (now - entry.windowStart >= WINDOW_MS) {
    entry = {
      ...entry,
      windowStart: now,
      hits: 0,
      lastSeen: now,
    };
  }

  entry.hits += 1;
  entry.lastSeen = now;

  if (entry.hits > limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
    store.set(key, entry);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      status: 'error',
      message: 'Rate limit exceeded',
    });
  }

  store.set(key, entry);

  // Count only requests that pass per-IP limits.
  // This prevents one blocked client from tripping global limits for everyone.
  const globalLimit = resolveGlobalLimit(bucket);
  const globalExisting = globalStore.get(bucket);
  let globalEntry: GlobalRateEntry = globalExisting ?? {
    windowStart: now,
    hits: 0,
  };

  if (now - globalEntry.windowStart >= WINDOW_MS) {
    globalEntry = {
      windowStart: now,
      hits: 0,
    };
  }

  globalEntry.hits += 1;
  globalStore.set(bucket, globalEntry);

  if (globalEntry.hits > globalLimit) {
    const retryAfter = Math.max(1, Math.ceil((globalEntry.windowStart + WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      status: 'error',
      message: 'Service is busy. Try again shortly.',
    });
  }

  return next();
};
