import { Request, Response, NextFunction } from 'express';

type RateEntry = {
  windowStart: number;
  hits: number;
  strikes: number;
  blockedUntil: number;
  lastSeen: number;
};

const WINDOW_MS = 60_000;
const BLOCK_MS = 10 * 60_000;
const MAX_STRIKES_BEFORE_BLOCK = 3;
const CLEANUP_EVERY_MS = 5 * 60_000;
const STALE_AFTER_MS = 30 * 60_000;

const store = new Map<string, RateEntry>();

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_PREFIX = '/api/';

const hasSessionCookie = (cookieHeader: string) =>
  /(?:^|;\s*)session=/.test(String(cookieHeader || ''));

const getClientIp = (req: Request) => {
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    ?.trim();
  return xff || req.ip || req.socket.remoteAddress || 'unknown';
};

const resolveLimit = (req: Request): number => {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || '');
  const includeStats = String(req.query?.includeStats || '') === '1';

  if (path === '/api/health') return 120;
  if (path.startsWith('/api/cases')) {
    if (includeStats) return 8;
    return 90;
  }
  if (BODY_METHODS.has(method) && !hasSessionCookie(String(req.headers.cookie || ''))) {
    return 20;
  }
  return 240;
};

const tooManyHeaders = (req: Request) => {
  const headerCount = Math.floor((req.rawHeaders?.length || 0) / 2);
  return headerCount > 80;
};

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.blockedUntil > now) continue;
    if (now - value.lastSeen > STALE_AFTER_MS) {
      store.delete(key);
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
  const limit = resolveLimit(req);

  const existing = store.get(ip);
  let entry: RateEntry = existing ?? {
    windowStart: now,
    hits: 0,
    strikes: 0,
    blockedUntil: 0,
    lastSeen: now,
  };

  if (entry.blockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests. Try again later.',
    });
  }

  if (now - entry.windowStart >= WINDOW_MS) {
    entry = {
      ...entry,
      windowStart: now,
      hits: 0,
      strikes: Math.max(0, entry.strikes - 1),
      lastSeen: now,
    };
  }

  entry.hits += 1;
  entry.lastSeen = now;

  if (entry.hits > limit) {
    entry.strikes += 1;
    const retryAfter = Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
    if (entry.strikes >= MAX_STRIKES_BEFORE_BLOCK) {
      entry.blockedUntil = now + BLOCK_MS;
      entry.strikes = 0;
    }
    store.set(ip, entry);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      status: 'error',
      message: 'Rate limit exceeded',
    });
  }

  store.set(ip, entry);
  return next();
};
