import { randomBytes } from 'crypto';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

interface TelegramLinkSession {
  userId: string;
  issuedAt: number;
  expiresAt: number;
  state: 'PENDING' | 'LINKED' | 'FAILED';
  failureCode?: 'ALREADY_LINKED' | 'TARGET_USER_MISSING' | 'INTERNAL_ERROR';
  failureMessage?: string;
  consumedAt?: number;
}

interface TelegramBotUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: {
      id?: number;
      type?: string;
    };
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
    };
  };
}

interface TelegramBotApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

const TELEGRAM_LINK_PREFIX = 'link_';
const TELEGRAM_WEBLOGIN_PREFIX = 'wl_';
const TELEGRAM_LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_POLL_INTERVAL_MS = 2500;
const TELEGRAM_BOT_USERNAME_CACHE_MS = 5 * 60 * 1000;
const TELEGRAM_LINK_TOKEN_BYTES = 24;
const TELEGRAM_MINI_APP_MENU_TEXT = 'Open Casefun';

interface TelegramWebLoginSession {
  token: string;
  issuedAt: number;
  expiresAt: number;
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  userId?: string;
  referralCode?: string;
  failureMessage?: string;
  consumedAt?: number;
}

let botUsernameCache: string | null = null;
let botUsernameCacheAt = 0;
let lastUpdateId = 0;
let pollingStarted = false;
let pollingLocked = false;
let pollingDisabled = false;
let pollTimer: NodeJS.Timeout | null = null;
const telegramLinkSessions = new Map<string, TelegramLinkSession>();
const telegramWebLoginSessions = new Map<string, TelegramWebLoginSession>();

const encodeBase64Url = (value: Buffer | string) => {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return raw
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const ensureTelegramBotConfigured = () => {
  const token = String(config.telegramBotToken || '').trim();
  if (!token) {
    throw new AppError('Telegram integration is not configured', 503);
  }
  return token;
};

const cleanupExpiredLinkSessions = () => {
  const now = Date.now();
  for (const [token, session] of telegramLinkSessions.entries()) {
    if (session.expiresAt <= now) {
      telegramLinkSessions.delete(token);
      continue;
    }
    if (session.consumedAt && now - session.consumedAt > TELEGRAM_LINK_TOKEN_TTL_MS) {
      telegramLinkSessions.delete(token);
    }
  }
};

const getLinkSession = (token: string, allowConsumed = false) => {
  cleanupExpiredLinkSessions();
  const session = telegramLinkSessions.get(token);
  if (!session) return null;
  if (!allowConsumed && session.consumedAt) return null;
  return session;
};

const buildBotApiUrl = (method: string, query?: URLSearchParams) => {
  const token = ensureTelegramBotConfigured();
  const base = `https://api.telegram.org/bot${token}/${method}`;
  const search = query?.toString();
  return search ? `${base}?${search}` : base;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const buildTelegramMiniAppUrl = () => `${trimTrailingSlash(config.frontendUrl)}/tg`;

const sendBotMessage = async (chatId: number, text: string) => {
  const query = new URLSearchParams({
    chat_id: String(chatId),
    text,
    disable_web_page_preview: 'true',
  });
  const response = await fetch(buildBotApiUrl('sendMessage', query));
  const payload = (await response.json().catch(() => null)) as TelegramBotApiResponse<any> | null;
  if (!response.ok || !payload?.ok) {
    const reason = payload?.description || `HTTP ${response.status}`;
    throw new Error(`sendMessage failed: ${reason}`);
  }
};

const getBotUsername = async () => {
  const now = Date.now();
  if (botUsernameCache && now - botUsernameCacheAt < TELEGRAM_BOT_USERNAME_CACHE_MS) {
    return botUsernameCache;
  }
  const response = await fetch(buildBotApiUrl('getMe'));
  const payload = (await response.json().catch(() => null)) as
    | TelegramBotApiResponse<{ username?: string }>
    | null;
  if (!response.ok || !payload?.ok) {
    const reason = payload?.description || `HTTP ${response.status}`;
    throw new AppError(`Failed to contact Telegram bot: ${reason}`, 503);
  }
  const username = String(payload.result?.username || '').trim();
  if (!username) {
    throw new AppError('Telegram bot username is unavailable', 503);
  }
  botUsernameCache = username;
  botUsernameCacheAt = now;
  return username;
};

export const getTelegramBotPublicInfo = async () => {
  ensureTelegramBotConfigured();
  const botUsername = await getBotUsername();
  return {
    botUsername,
    botUrl: `https://t.me/${botUsername}`,
  };
};

export const syncTelegramMiniAppMenuButton = async () => {
  ensureTelegramBotConfigured();
  const menuButton = {
    type: 'web_app',
    text: TELEGRAM_MINI_APP_MENU_TEXT,
    web_app: {
      url: buildTelegramMiniAppUrl(),
    },
  };
  const query = new URLSearchParams({
    menu_button: JSON.stringify(menuButton),
  });
  const response = await fetch(buildBotApiUrl('setChatMenuButton', query));
  const payload = (await response.json().catch(() => null)) as TelegramBotApiResponse<boolean> | null;
  if (!response.ok || !payload?.ok) {
    const reason = payload?.description || `HTTP ${response.status}`;
    throw new Error(`setChatMenuButton failed: ${reason}`);
  }
};

const parseStartPayload = (text: string): { type: 'link' | 'weblogin' | 'none'; token: string } => {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('/start')) return { type: 'none', token: '' };
  const [, rawArg = ''] = normalized.split(/\s+/, 2);
  if (rawArg.startsWith(TELEGRAM_LINK_PREFIX)) {
    return { type: 'link', token: rawArg.slice(TELEGRAM_LINK_PREFIX.length).trim() };
  }
  if (rawArg.startsWith(TELEGRAM_WEBLOGIN_PREFIX)) {
    return { type: 'weblogin', token: rawArg.slice(TELEGRAM_WEBLOGIN_PREFIX.length).trim() };
  }
  return { type: 'none', token: '' };
};

const normalizeNullable = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const markSessionFailed = (
  token: string,
  session: TelegramLinkSession,
  failureCode: 'ALREADY_LINKED' | 'TARGET_USER_MISSING' | 'INTERNAL_ERROR',
  failureMessage: string
) => {
  session.state = 'FAILED';
  session.failureCode = failureCode;
  session.failureMessage = failureMessage;
  session.consumedAt = Date.now();
  telegramLinkSessions.set(token, session);
};

const markSessionLinked = (token: string, session: TelegramLinkSession) => {
  session.state = 'LINKED';
  session.failureCode = undefined;
  session.failureMessage = undefined;
  session.consumedAt = Date.now();
  telegramLinkSessions.set(token, session);
};

const handleStartLinkMessage = async (update: TelegramBotUpdate) => {
  const message = update.message;
  if (!message?.text || !message?.chat?.id || !message?.from?.id) return;
  const rawText = String(message.text || '').trim();
  const isStartCommand = rawText.toLowerCase().startsWith('/start');
  const { type: payloadType, token: payloadToken } = parseStartPayload(message.text);

  if (payloadType === 'weblogin' && payloadToken) {
    await handleWebLoginStart(update, payloadToken);
    return;
  }

  const linkToken = payloadToken;
  if (payloadType !== 'link' || !linkToken) {
    if (isStartCommand) {
      await sendBotMessage(
        Number(message.chat.id),
        `Welcome to CaseFun!\n\nCaseFun: Transforming Token Launches into a High-Engagement GameFi & SocialFi Ecosystem\n\nOfficial X: https://x.com/casefunnet\nOfficial TG Group: https://t.me/CaseFun_Chat\n\nTap the "Open Casefun" button below to open the app!`
      ).catch(() => {});
    }
    return;
  }

  const chatId = Number(message.chat.id);
  const session = getLinkSession(linkToken);
  if (!session) {
    await sendBotMessage(
      chatId,
      'This link request is invalid or expired. Please return to the website and press Connect Telegram again.'
    ).catch(() => {});
    return;
  }

  const telegramId = String(message.from.id);
  const telegramUsername = normalizeNullable(message.from.username);
  const telegramFirstName = normalizeNullable(message.from.first_name);
  const telegramLastName = normalizeNullable(message.from.last_name);
  const telegramPhotoUrl = normalizeNullable(message.from.photo_url);

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    });
    if (!targetUser) {
      const failureMessage = 'The website account was not found. Please log in and try again.';
      markSessionFailed(linkToken, session, 'TARGET_USER_MISSING', failureMessage);
      await sendBotMessage(chatId, failureMessage);
      return;
    }

    const existing = await prisma.user.findFirst({
      where: {
        telegramId,
        NOT: { id: session.userId },
      },
      select: { id: true },
    });
    if (existing) {
      const failureMessage =
        'This Telegram account is already linked to another casefun account. Unlink it there first or use a different Telegram account.';
      markSessionFailed(linkToken, session, 'ALREADY_LINKED', failureMessage);
      await sendBotMessage(chatId, failureMessage);
      return;
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        telegramId,
        telegramUsername,
        telegramFirstName,
        telegramLastName,
        telegramPhotoUrl,
        telegramLinkedAt: new Date(),
      },
    });
    markSessionLinked(linkToken, session);

    await sendBotMessage(chatId, 'Telegram linked successfully. Return to casefun and open Mini App.');
  } catch {
    const failureMessage = 'Linking failed. Please try again in a few seconds.';
    markSessionFailed(linkToken, session, 'INTERNAL_ERROR', failureMessage);
    await sendBotMessage(chatId, failureMessage).catch(() => {});
  }
};

const handleWebLoginStart = async (update: TelegramBotUpdate, token: string) => {
  const message = update.message;
  if (!message?.chat?.id || !message?.from?.id) return;
  const chatId = Number(message.chat.id);

  const session = telegramWebLoginSessions.get(token);
  if (!session || session.state !== 'PENDING' || session.expiresAt <= Date.now()) {
    await sendBotMessage(
      chatId,
      'This login link is expired or invalid. Please go back to the website and try again.'
    ).catch(() => {});
    return;
  }

  const telegramId = String(message.from.id);
  const telegramUsername = normalizeNullable(message.from.username);
  const telegramFirstName = normalizeNullable(message.from.first_name);
  const telegramLastName = normalizeNullable(message.from.last_name);
  const telegramPhotoUrl = normalizeNullable(message.from.photo_url);

  try {
    let user = await prisma.user.findFirst({ where: { telegramId } });
    if (!user) {
      const username =
        telegramUsername ||
        (telegramFirstName ? `${telegramFirstName}${telegramLastName ? ` ${telegramLastName}` : ''}` : `tg_${telegramId}`);
      user = await prisma.user.create({
        data: {
          username,
          walletAddress: `tg_${telegramId}`,
          telegramId,
          telegramUsername,
          telegramFirstName,
          telegramLastName,
          telegramPhotoUrl,
          telegramLinkedAt: new Date(),
          hasLinkedWallet: false,
          balance: 0,
          ...(session.referralCode
            ? await (async () => {
                const referrer = await prisma.user.findFirst({
                  where: { referralCode: session.referralCode },
                  select: { id: true },
                });
                return referrer ? { referredById: referrer.id } : {};
              })()
            : {}),
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramUsername: telegramUsername || user.telegramUsername,
          telegramFirstName: telegramFirstName || user.telegramFirstName,
          telegramLastName: telegramLastName || user.telegramLastName,
          telegramPhotoUrl: telegramPhotoUrl || user.telegramPhotoUrl,
        },
      });
    }

    session.state = 'COMPLETED';
    session.userId = user.id;
    session.consumedAt = Date.now();
    telegramWebLoginSessions.set(token, session);

    await sendBotMessage(
      chatId,
      'Login successful! You can close this window and return to the website.'
    ).catch(() => {});
  } catch (err) {
    session.state = 'FAILED';
    session.failureMessage = 'Login failed. Please try again.';
    session.consumedAt = Date.now();
    telegramWebLoginSessions.set(token, session);

    await sendBotMessage(chatId, 'Login failed. Please try again.').catch(() => {});
  }
};

export const createTelegramWebLogin = async (referralCode?: string) => {
  ensureTelegramBotConfigured();
  ensureTelegramBotLinkPolling();
  const botUsername = await getBotUsername();
  const issuedAt = Date.now();
  const token = encodeBase64Url(randomBytes(TELEGRAM_LINK_TOKEN_BYTES));
  const expiresAt = issuedAt + TELEGRAM_LINK_TOKEN_TTL_MS;
  telegramWebLoginSessions.set(token, {
    token,
    issuedAt,
    expiresAt,
    state: 'PENDING',
    referralCode: referralCode || undefined,
  });
  const startParam = `${TELEGRAM_WEBLOGIN_PREFIX}${token}`;
  const url = `https://t.me/${botUsername}?start=${encodeURIComponent(startParam)}`;
  return { token, url, botUsername, expiresAt: new Date(expiresAt).toISOString() };
};

export const getTelegramWebLoginStatus = (token: string) => {
  const session = telegramWebLoginSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now() && session.state === 'PENDING') {
    telegramWebLoginSessions.delete(token);
    return null;
  }
  return session;
};

export const consumeTelegramWebLogin = (token: string) => {
  const session = telegramWebLoginSessions.get(token);
  if (!session) return null;
  telegramWebLoginSessions.delete(token);
  return session;
};

const pollTelegramUpdatesOnce = async () => {
  const query = new URLSearchParams({
    offset: String(lastUpdateId + 1),
    timeout: '1',
    allowed_updates: JSON.stringify(['message']),
  });
  const response = await fetch(buildBotApiUrl('getUpdates', query));
  const payload = (await response.json().catch(() => null)) as TelegramBotApiResponse<TelegramBotUpdate[]> | null;

  if (!response.ok || !payload?.ok) {
    const reason = String(payload?.description || `HTTP ${response.status}`).toLowerCase();
    if (reason.includes('webhook') || reason.includes('terminated by other getupdates request')) {
      pollingDisabled = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      console.warn('Telegram bot link polling disabled due to webhook/getUpdates conflict.');
      return;
    }
    throw new Error(payload?.description || `Telegram getUpdates failed: ${response.status}`);
  }

  const updates = Array.isArray(payload.result) ? payload.result : [];
  for (const update of updates) {
    const updateId = Number(update.update_id || 0);
    if (updateId > lastUpdateId) {
      lastUpdateId = updateId;
    }
    await handleStartLinkMessage(update);
  }
};

const runPollCycle = async () => {
  if (pollingLocked || pollingDisabled) return;
  pollingLocked = true;
  try {
    await pollTelegramUpdatesOnce();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.warn(`Telegram bot polling error: ${text}`);
  } finally {
    pollingLocked = false;
  }
};

export const ensureTelegramBotLinkPolling = () => {
  if (pollingStarted || pollingDisabled) return;
  ensureTelegramBotConfigured();
  pollingStarted = true;
  void runPollCycle();
  pollTimer = setInterval(() => {
    void runPollCycle();
  }, TELEGRAM_POLL_INTERVAL_MS);
};

export const createTelegramBotLink = async (userId: string) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new AppError('Authentication required', 401);
  }
  ensureTelegramBotConfigured();
  ensureTelegramBotLinkPolling();
  const botUsername = await getBotUsername();
  const issuedAt = Date.now();
  const token = encodeBase64Url(randomBytes(TELEGRAM_LINK_TOKEN_BYTES));
  const expiresAt = issuedAt + TELEGRAM_LINK_TOKEN_TTL_MS;
  telegramLinkSessions.set(token, {
    userId: normalizedUserId,
    issuedAt,
    expiresAt,
    state: 'PENDING',
  });
  const startParam = `${TELEGRAM_LINK_PREFIX}${token}`;
  const url = `https://t.me/${botUsername}?start=${encodeURIComponent(startParam)}`;
  return {
    token,
    url,
    botUsername,
    expiresAt: new Date(expiresAt).toISOString(),
  };
};

export const getTelegramBotLinkTokenPayload = (token: string, userId: string) => {
  const session = getLinkSession(token, true);
  if (!session) {
    throw new AppError('Telegram link token is invalid or expired', 400);
  }
  if (session.userId !== userId) {
    throw new AppError('Telegram link token does not match current user', 403);
  }
  return session;
};

