import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { awardReferralKickback } from '../utils/referralRewards.js';

const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const OFFICIAL_TWITTER_USERNAME = 'casefunnet';
const OFFICIAL_TELEGRAM_CHANNEL = '@CaseFun_Chat';

const refreshTwitterToken = async (refreshToken: string) => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.twitterClientId,
  });
  const basicAuth = Buffer.from(
    `${config.twitterClientId}:${config.twitterClientSecret}`
  ).toString('base64');
  const res = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  const payload: any = await res.json().catch(() => null);
  if (!res.ok || !payload?.access_token) return null;
  return {
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token
      ? String(payload.refresh_token)
      : refreshToken,
  };
};

const getValidTwitterToken = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twitterAccessToken: true,
      twitterRefreshToken: true,
      twitterId: true,
    },
  });
  if (!user?.twitterAccessToken || !user.twitterId) return null;

  const check = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${user.twitterAccessToken}` },
  });
  if (check.ok) {
    return { token: user.twitterAccessToken, twitterId: user.twitterId };
  }

  if (!user.twitterRefreshToken) return null;
  const refreshed = await refreshTwitterToken(user.twitterRefreshToken);
  if (!refreshed) return null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      twitterAccessToken: refreshed.accessToken,
      twitterRefreshToken: refreshed.refreshToken,
    },
  });
  return { token: refreshed.accessToken, twitterId: user.twitterId };
};

const extractTweetId = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const m = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return m ? m[1] : null;
};

const getAppBearerToken = async (): Promise<string | null> => {
  if (config.twitterBearerToken) return config.twitterBearerToken;
  if (!config.twitterClientId || !config.twitterClientSecret) return null;
  try {
    const basicAuth = Buffer.from(
      `${config.twitterClientId}:${config.twitterClientSecret}`
    ).toString('base64');
    const res = await fetch('https://api.twitter.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: 'grant_type=client_credentials',
    });
    const data: any = await res.json().catch(() => null);
    return data?.access_token ? String(data.access_token) : null;
  } catch {
    return null;
  }
};

const verifyTwitterFollow = async (
  userToken: string,
  userId: string
): Promise<boolean> => {
  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/by/username/${OFFICIAL_TWITTER_USERNAME}`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const data: any = await res.json().catch(() => null);
    const targetId = data?.data?.id;
    if (!targetId) return false;

    const followRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/following?max_results=1000`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const followData: any = await followRes.json().catch(() => null);
    const following = Array.isArray(followData?.data) ? followData.data : [];
    return following.some((u: any) => u.id === targetId);
  } catch {
    return false;
  }
};

const verifyTwitterFollowByAppToken = async (
  twitterId: string
): Promise<boolean> => {
  try {
    const bearer = await getAppBearerToken();
    if (!bearer) return false;

    const res = await fetch(
      `https://api.twitter.com/2/users/by/username/${OFFICIAL_TWITTER_USERNAME}`,
      { headers: { Authorization: `Bearer ${bearer}` } }
    );
    const data: any = await res.json().catch(() => null);
    const targetId = data?.data?.id;
    if (!targetId) return false;

    const followersRes = await fetch(
      `https://api.twitter.com/2/users/${targetId}/followers?max_results=1000&user.fields=id`,
      { headers: { Authorization: `Bearer ${bearer}` } }
    );
    const fData: any = await followersRes.json().catch(() => null);
    const followers = Array.isArray(fData?.data) ? fData.data : [];
    return followers.some((u: any) => u.id === twitterId);
  } catch {
    return false;
  }
};

type VerifyResult = { verified: boolean; tierLimited: boolean; serverError: boolean };

const verifyTweetAction = async (
  userToken: string,
  userId: string,
  tweetId: string,
  action: 'like' | 'retweet'
): Promise<VerifyResult> => {
  try {
    if (action === 'like') {
      const url = `https://api.twitter.com/2/users/${userId}/liked_tweets?max_results=100&tweet.fields=id`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok) {
        console.error('[rewards] liked_tweets API error:', res.status, JSON.stringify(data));
        if (res.status === 402 || res.status === 403) return { verified: false, tierLimited: true, serverError: false };
        return { verified: false, tierLimited: false, serverError: true };
      }
      const tweets = Array.isArray(data?.data) ? data.data : [];
      return { verified: tweets.some((t: any) => t.id === tweetId), tierLimited: false, serverError: false };
    }
    const url = `https://api.twitter.com/2/users/${userId}/timelines/reverse_chronological?max_results=100&tweet.fields=referenced_tweets`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[rewards] timeline API error:', res.status, JSON.stringify(data));
      if (res.status === 402 || res.status === 403) return { verified: false, tierLimited: true, serverError: false };
      return { verified: false, tierLimited: false, serverError: true };
    }
    const tweets = Array.isArray(data?.data) ? data.data : [];
    const found = tweets.some((t: any) =>
      Array.isArray(t.referenced_tweets) &&
      t.referenced_tweets.some(
        (ref: any) => ref.type === 'retweeted' && ref.id === tweetId
      )
    );
    return { verified: found, tierLimited: false, serverError: false };
  } catch (err) {
    console.error('[rewards] verifyTweetAction error:', err);
    return { verified: false, tierLimited: false, serverError: true };
  }
};

const verifyTweetComment = async (
  userToken: string,
  userId: string,
  tweetId: string
): Promise<VerifyResult> => {
  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/${userId}/timelines/reverse_chronological?max_results=100&tweet.fields=referenced_tweets`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[rewards] timeline/comment API error:', res.status, JSON.stringify(data));
      if (res.status === 402 || res.status === 403) return { verified: false, tierLimited: true, serverError: false };
      return { verified: false, tierLimited: false, serverError: true };
    }
    const tweets = Array.isArray(data?.data) ? data.data : [];
    const found = tweets.some((t: any) =>
      Array.isArray(t.referenced_tweets) &&
      t.referenced_tweets.some(
        (ref: any) => ref.type === 'replied_to' && ref.id === tweetId
      )
    );
    return { verified: found, tierLimited: false, serverError: false };
  } catch (err) {
    console.error('[rewards] verifyTweetComment error:', err);
    return { verified: false, tierLimited: false, serverError: true };
  }
};

// Parses a Telegram URL or handle and returns the chat_id expected by
// Bot API getChatMember (e.g. "@casefun_chat"). Returns null for private
// invite links (t.me/+...) or unrecognised formats.
const extractTelegramChatRef = (input?: string | null): string | null => {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (raw.startsWith('@')) {
    const handle = raw.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
    return handle ? `@${handle}` : null;
  }
  // Match t.me/xxx or telegram.me/xxx or https://t.me/xxx
  const m = raw.match(/^(?:https?:\/\/)?(?:t|telegram)\.me\/(?:s\/)?([^/?#]+)/i);
  if (!m) return null;
  const segment = m[1];
  // Private invite links (+abcd...) cannot be verified via Bot API.
  if (segment.startsWith('+')) return null;
  const handle = segment.replace(/[^a-zA-Z0-9_]/g, '');
  return handle ? `@${handle}` : null;
};

type TelegramSubscriptionResult = {
  verified: boolean;
  // `unverifiable` means the bot has no access to the target chat (not admin
  // there / invite link / etc.) — callers fall back to trust-based claim.
  unverifiable: boolean;
};

const verifyTelegramSubscription = async (
  telegramId: string,
  chatRefOverride?: string | null
): Promise<TelegramSubscriptionResult> => {
  if (!config.telegramBotToken) return { verified: false, unverifiable: true };
  const chatRef = extractTelegramChatRef(chatRefOverride) || OFFICIAL_TELEGRAM_CHANNEL;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/getChatMember?chat_id=${encodeURIComponent(chatRef)}&user_id=${telegramId}`
    );
    const data: any = await res.json().catch(() => null);
    if (!data?.ok) {
      // Classic reasons: bot isn't an admin of the chat, private chat,
      // chat not found, etc. Treat as unverifiable so the UX doesn't break
      // for admin-created channels where the bot can't introspect membership.
      return { verified: false, unverifiable: true };
    }
    const status = data.result?.status;
    return {
      verified: ['member', 'administrator', 'creator'].includes(status),
      unverifiable: false,
    };
  } catch {
    return { verified: false, unverifiable: true };
  }
};

// Deposit task types — progress is measured against either a count of
// confirmed deposits (DEPOSIT_COUNT_*) or an aggregated USDT amount
// (DEPOSIT_AMOUNT_*). Both share the same code path and are tracked on
// the existing RewardTask + RewardClaim infrastructure.
const DEPOSIT_TYPES = new Set([
  'DEPOSIT_AMOUNT_EVM', 'DEPOSIT_AMOUNT_TON',
  'DEPOSIT_COUNT_ANY', 'DEPOSIT_COUNT_EVM', 'DEPOSIT_COUNT_TON',
]);

const DEPOSIT_AMOUNT_TYPES = new Set(['DEPOSIT_AMOUNT_EVM', 'DEPOSIT_AMOUNT_TON']);

const CASEFUN_ACTION_TYPES = new Set([
  'OPEN_CASES', 'OPEN_SPECIFIC_CASE', 'DO_UPGRADES',
  'CREATE_BATTLES', 'JOIN_BATTLES', 'CLAIM_TOKENS', 'CREATE_CASES',
]);

// ──────── Daily streak helpers ────────
// Streak day is determined by UTC calendar date — simpler than rolling 24h
// windows and matches user expectations ("come back tomorrow"). The whole
// world rolls over at the same instant (00:00 UTC).
const STREAK_LENGTH = 7;

const utcDayKey = (d: Date): number => Math.floor(d.getTime() / 86_400_000);

const nextUtcMidnight = (d: Date): Date => {
  const ms = d.getTime();
  const dayMs = 86_400_000;
  return new Date(Math.ceil((ms + 1) / dayMs) * dayMs);
};

interface StreakState {
  nextDay: number;          // 1..STREAK_LENGTH — what gets claimed next
  lastDay: number;          // 0..STREAK_LENGTH — what was claimed last time
  claimedToday: boolean;
  cooldownEndsAt: Date | null;
}

const computeStreakState = (
  lastClaim: { claimedAt: Date; metadata: any } | null,
): StreakState => {
  const now = new Date();
  const todayKey = utcDayKey(now);

  if (!lastClaim) {
    return { nextDay: 1, lastDay: 0, claimedToday: false, cooldownEndsAt: null };
  }

  const lastKey = utcDayKey(lastClaim.claimedAt);
  const lastDay = Number((lastClaim.metadata as any)?.streakDay ?? 0) || 0;

  if (lastKey === todayKey) {
    // Already claimed today. The "next" day shown to the UI is what would
    // be claimed at next reset — either lastDay+1, or back to 1 after a
    // full cycle. Spec: after claiming day 7 the cycle restarts at 1.
    const nextDay = lastDay >= STREAK_LENGTH ? 1 : lastDay + 1;
    return { nextDay, lastDay, claimedToday: true, cooldownEndsAt: nextUtcMidnight(now) };
  }

  if (lastKey === todayKey - 1) {
    // Consecutive day — progress, with cycle restart after 7.
    const nextDay = lastDay >= STREAK_LENGTH ? 1 : lastDay + 1;
    return { nextDay, lastDay, claimedToday: false, cooldownEndsAt: null };
  }

  // Missed at least one day — streak resets.
  return { nextDay: 1, lastDay: 0, claimedToday: false, cooldownEndsAt: null };
};

// Any non-social, action-tracked task — including deposits — uses the
// same progress / cooldown machinery as legacy CaseFun tasks.
const CASEFUN_TYPES = new Set<string>([
  ...CASEFUN_ACTION_TYPES,
  ...DEPOSIT_TYPES,
]);

const isDepositAmountType = (type: string) => DEPOSIT_AMOUNT_TYPES.has(type);
const isDepositCountType = (type: string) => DEPOSIT_TYPES.has(type) && !DEPOSIT_AMOUNT_TYPES.has(type);

const getTaskTarget = (task: { type: string; targetCount: number | null; targetAmount: number | null }): number => {
  if (isDepositAmountType(task.type)) {
    return Number(task.targetAmount || 0) || 0;
  }
  return Number(task.targetCount || 0) || 1;
};

const getTaskUnit = (type: string): 'count' | 'usdt' => (isDepositAmountType(type) ? 'usdt' : 'count');

const countUserActions = async (
  userId: string,
  type: string,
  since: Date,
  targetCaseId?: string | null,
): Promise<number> => {
  switch (type) {
    case 'OPEN_CASES':
      return prisma.caseOpening.count({ where: { userId, timestamp: { gte: since } } });
    case 'OPEN_SPECIFIC_CASE':
      return prisma.caseOpening.count({ where: { userId, caseId: targetCaseId || '', timestamp: { gte: since } } });
    case 'DO_UPGRADES':
      return prisma.transaction.count({ where: { userId, type: 'UPGRADE', status: 'completed', timestamp: { gte: since } } });
    case 'CREATE_BATTLES':
      return prisma.battleLobby.count({ where: { hostUserId: userId, createdAt: { gte: since } } });
    case 'JOIN_BATTLES':
      return prisma.battle.count({ where: { userId, timestamp: { gte: since } } });
    case 'CLAIM_TOKENS':
      return prisma.claim.count({ where: { userId, status: 'completed', createdAt: { gte: since } } });
    case 'CREATE_CASES':
      return prisma.case.count({ where: { createdById: userId, createdAt: { gte: since } } });

    case 'DEPOSIT_COUNT_ANY':
      return prisma.deposit.count({
        where: { userId, status: 'confirmed', createdAt: { gte: since } },
      });
    case 'DEPOSIT_COUNT_EVM':
      return prisma.deposit.count({
        where: { userId, status: 'confirmed', chainType: 'EVM', createdAt: { gte: since } },
      });
    case 'DEPOSIT_COUNT_TON':
      return prisma.deposit.count({
        where: { userId, status: 'confirmed', chainType: 'TON', createdAt: { gte: since } },
      });
    case 'DEPOSIT_AMOUNT_EVM': {
      const agg = await prisma.deposit.aggregate({
        _sum: { amountUsdt: true },
        where: { userId, status: 'confirmed', chainType: 'EVM', createdAt: { gte: since } },
      });
      return Number(agg._sum.amountUsdt || 0);
    }
    case 'DEPOSIT_AMOUNT_TON': {
      const agg = await prisma.deposit.aggregate({
        _sum: { amountUsdt: true },
        where: { userId, status: 'confirmed', chainType: 'TON', createdAt: { gte: since } },
      });
      return Number(agg._sum.amountUsdt || 0);
    }

    default:
      return 0;
  }
};

// ──────── User endpoints ────────

export const listRewardTasks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const now = new Date();

    const [tasks, claims, user] = await Promise.all([
      prisma.rewardTask.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      userId
        ? prisma.rewardClaim.findMany({
            where: { userId },
            select: { taskId: true, reward: true, claimedAt: true },
            orderBy: { claimedAt: 'desc' },
          })
        : Promise.resolve([]),
      userId
        ? prisma.user.findUnique({
            where: { id: userId },
            select: {
              rewardPoints: true,
              twitterId: true,
              telegramId: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const claimsByTask = new Map<string, { claimedAt: Date; count: number }>();
    for (const c of claims) {
      const existing = claimsByTask.get(c.taskId);
      if (!existing) {
        claimsByTask.set(c.taskId, { claimedAt: c.claimedAt, count: 1 });
      } else {
        existing.count++;
      }
    }

    // Global anti-multiaccount gate: to claim ANY task the user must have
    // both Twitter and Telegram linked. Exceptions are the LINK_* tasks
    // themselves. This covers CaseFun tasks (OPEN_CASE, CREATE_CASES, …)
    // which were being farmed across throwaway accounts.
    const socialsMissing = Boolean(user) && (!user?.twitterId || !user?.telegramId);

    const taskList = await Promise.all(tasks.map(async (task) => {
      if (task.activeUntil && task.activeUntil < now) return null;

      const isCaseFun = CASEFUN_TYPES.has(task.type);
      const claimInfo = claimsByTask.get(task.id);
      const exemptFromSocialGate = task.type === 'LINK_TWITTER' || task.type === 'LINK_TELEGRAM';
      const socialGateLocked = socialsMissing && !exemptFromSocialGate;

      if (task.type === 'DAILY_STREAK') {
        // Streak status — needs the full last claim record (metadata.streakDay
        // determines the next reward), so we re-fetch instead of using the
        // claimsByTask aggregate which only stores claimedAt.
        let lastClaim: { claimedAt: Date; metadata: any } | null = null;
        if (userId) {
          lastClaim = await prisma.rewardClaim.findFirst({
            where: { userId, taskId: task.id },
            orderBy: { claimedAt: 'desc' },
            select: { claimedAt: true, metadata: true },
          });
        }
        const state = computeStreakState(lastClaim);
        return {
          id: task.id, type: task.type, title: task.title,
          description: task.description,
          reward: state.nextDay,
          category: task.category || 'DAILY',
          completed: !state.claimedToday,
          claimed: state.claimedToday,
          locked: socialGateLocked,
          activeUntil: task.activeUntil,
          streak: {
            length: STREAK_LENGTH,
            nextDay: state.nextDay,
            lastDay: state.lastDay,
            claimedToday: state.claimedToday,
            cooldownEndsAt: state.cooldownEndsAt,
            schedule: Array.from({ length: STREAK_LENGTH }, (_, i) => i + 1),
          },
        };
      }

      if (isCaseFun) {
        const isRepeatable = task.repeatIntervalHours != null && task.repeatIntervalHours >= 0;
        const isInstantRepeat = task.repeatIntervalHours === 0;
        const lastClaimAt = claimInfo?.claimedAt;
        const unit = getTaskUnit(task.type);
        const target = getTaskTarget(task);

        let onCooldown = false;
        let cooldownEndsAt: Date | null = null;
        if (isRepeatable && !isInstantRepeat && lastClaimAt) {
          cooldownEndsAt = new Date(lastClaimAt.getTime() + task.repeatIntervalHours! * 3600_000);
          onCooldown = cooldownEndsAt > now;
        }

        const claimedOnce = Boolean(claimInfo);
        if (!isRepeatable && claimedOnce) {
          return {
            id: task.id, type: task.type, title: task.title,
            description: task.description, reward: task.reward,
            category: task.category,
            targetCount: target,
            targetAmount: task.targetAmount,
            unit,
            progress: target,
            claimed: true, completed: true, locked: socialGateLocked,
            onCooldown: false, cooldownEndsAt: null,
            activeUntil: task.activeUntil,
            targetCaseId: task.targetCaseId,
          };
        }

        // BUG FIX: while on cooldown, the next-cycle progress bar must NOT
        // count actions performed during cooldown. We freeze progress at 0
        // until cooldown ends, then start counting from cooldownEndsAt
        // forward. Without this, daily/weekly tasks would silently fill up
        // again while still locked, which the user reported as a bug.
        let progress = 0;
        if (userId && !onCooldown) {
          const countSince = isRepeatable && lastClaimAt
            // After cooldown end (or instant repeat), count from last claim;
            // for instant repeat that's effectively the previous claim moment.
            ? (cooldownEndsAt && cooldownEndsAt < now ? cooldownEndsAt : lastClaimAt)
            : task.createdAt;
          progress = await countUserActions(userId, task.type, countSince, task.targetCaseId);
        }

        return {
          id: task.id, type: task.type, title: task.title,
          description: task.description, reward: task.reward,
          category: task.category,
          targetCount: target,
          targetAmount: task.targetAmount,
          unit,
          progress: Math.min(progress, target),
          claimed: false, completed: progress >= target && !onCooldown,
          locked: socialGateLocked,
          onCooldown,
          cooldownEndsAt,
          activeUntil: task.activeUntil,
          targetCaseId: task.targetCaseId,
        };
      }

      // Social tasks
      const claimed = Boolean(claimInfo);
      let completed = false;
      if (user) {
        switch (task.type) {
          case 'LINK_TWITTER': completed = Boolean(user.twitterId); break;
          case 'LINK_TELEGRAM': completed = Boolean(user.telegramId); break;
          default: completed = claimed || Boolean(user.twitterId && user.telegramId); break;
        }
      }
      const locked = socialGateLocked;

      return {
        id: task.id, type: task.type, title: task.title,
        description: task.description, targetUrl: task.targetUrl,
        reward: task.reward, isDefault: task.isDefault,
        category: task.category || 'SOCIAL',
        completed, claimed, locked,
      };
    }));

    res.json({
      status: 'success',
      data: {
        tasks: taskList.filter(Boolean),
        totalPoints: user?.rewardPoints ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const claimReward = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const taskId = String(req.params.taskId || '').trim();
    if (!userId) return next(new AppError('Authentication required', 401));
    if (!taskId) return next(new AppError('Task id is required', 400));

    const [task, existingClaims, user] = await Promise.all([
      prisma.rewardTask.findUnique({ where: { id: taskId } }),
      prisma.rewardClaim.findMany({
        where: { userId, taskId },
        orderBy: { claimedAt: 'desc' },
        take: 1,
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          twitterId: true,
          telegramId: true,
          twitterAccessToken: true,
          twitterRefreshToken: true,
        },
      }),
    ]);

    if (!task || !task.isActive) {
      return next(new AppError('Task not found or inactive', 404));
    }
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const now = new Date();
    if (task.activeUntil && task.activeUntil < now) {
      return next(new AppError('Task has expired', 400));
    }

    const isCaseFun = CASEFUN_TYPES.has(task.type);
    const lastClaim = existingClaims[0] || null;

    // Global anti-multiaccount gate — both Twitter and Telegram must be
    // linked to claim anything other than the two LINK_* tasks themselves.
    const exemptFromSocialGate = task.type === 'LINK_TWITTER' || task.type === 'LINK_TELEGRAM';
    if (!exemptFromSocialGate && (!user.twitterId || !user.telegramId)) {
      return next(new AppError('Link both Twitter and Telegram first to unlock this task', 403));
    }

    if (task.type === 'DAILY_STREAK') {
      const state = computeStreakState(lastClaim);
      if (state.claimedToday) {
        return next(new AppError('Already claimed today — come back after 00:00 UTC', 400));
      }
      const reward = state.nextDay;

      const result = await prisma.$transaction(async (tx) => {
        const claim = await tx.rewardClaim.create({
          data: {
            userId,
            taskId,
            reward,
            metadata: { streakDay: reward, length: STREAK_LENGTH },
          },
        });
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { rewardPoints: { increment: reward } },
          select: { rewardPoints: true },
        });
        return { claim, totalPoints: updatedUser.rewardPoints };
      });

      void awardReferralKickback(prisma, userId, reward, task.title).catch(() => {});

      return res.json({
        status: 'success',
        data: {
          claimId: result.claim.id,
          reward: result.claim.reward,
          totalPoints: result.totalPoints,
          streakDay: reward,
          streakLength: STREAK_LENGTH,
        },
      });
    }

    if (isCaseFun) {
      const isRepeatable = task.repeatIntervalHours != null && task.repeatIntervalHours >= 0;
      const isInstantRepeat = task.repeatIntervalHours === 0;

      if (!isRepeatable && lastClaim) {
        return next(new AppError('Reward already claimed', 409));
      }

      let cooldownEnd: Date | null = null;
      if (isRepeatable && !isInstantRepeat && lastClaim) {
        cooldownEnd = new Date(lastClaim.claimedAt.getTime() + task.repeatIntervalHours! * 3600_000);
        if (cooldownEnd > now) {
          return next(new AppError('Task is on cooldown', 400));
        }
      }

      // Mirror listRewardTasks: count progress only after cooldown ended,
      // not during, so the next-cycle progress reflects post-cooldown actions.
      const since = isRepeatable && lastClaim
        ? (cooldownEnd && cooldownEnd > lastClaim.claimedAt ? cooldownEnd : lastClaim.claimedAt)
        : task.createdAt;
      const progress = await countUserActions(userId, task.type, since, task.targetCaseId);
      const target = getTaskTarget(task);
      const unit = getTaskUnit(task.type);

      if (progress < target) {
        const formatProgress = (value: number) =>
          unit === 'usdt' ? `${value.toFixed(2)} USDT` : String(Math.floor(value));
        return next(new AppError(`Progress: ${formatProgress(progress)}/${formatProgress(target)} — keep going!`, 400));
      }
    } else {
      // Social tasks — one-time only
      if (lastClaim) {
        return next(new AppError('Reward already claimed', 409));
      }

      let verified = false;
      switch (task.type) {
        case 'LINK_TWITTER':
          verified = Boolean(user.twitterId); break;
        case 'LINK_TELEGRAM':
          verified = Boolean(user.telegramId); break;
        case 'FOLLOW_TWITTER': {
          if (!user.twitterId) return next(new AppError('Link Twitter first', 400));
          try {
            const tw = await getValidTwitterToken(userId);
            if (tw) { verified = await verifyTwitterFollow(tw.token, tw.twitterId); }
            else { verified = await verifyTwitterFollowByAppToken(user.twitterId); }
          } catch {
            verified = true;
          }
          if (!verified) verified = true;
          break;
        }
        case 'SUBSCRIBE_TELEGRAM': {
          if (!user.telegramId) return next(new AppError('Link Telegram first', 400));
          const r = await verifyTelegramSubscription(user.telegramId, task.targetUrl);
          // If the bot has no introspection access (not admin of the chat /
          // invite link / etc.) we trust the user — same pattern as tier-
          // limited Twitter checks. This keeps admin-authored TG tasks usable
          // without forcing the bot into every channel/chat.
          verified = r.verified || r.unverifiable;
          break;
        }
        case 'LIKE_TWEET': {
          const tweetId = extractTweetId(task.targetUrl);
          if (!tweetId) return next(new AppError('Invalid tweet URL', 400));
          const tw = await getValidTwitterToken(userId);
          if (!tw) return next(new AppError('Disconnect and reconnect Twitter in your profile to refresh credentials.', 400));
          const r = await verifyTweetAction(tw.token, tw.twitterId, tweetId, 'like');
          if (r.serverError) return next(new AppError('Twitter API temporarily unavailable — try again later', 503));
          verified = r.verified || r.tierLimited;
          break;
        }
        case 'REPOST_TWEET': {
          const tweetId = extractTweetId(task.targetUrl);
          if (!tweetId) return next(new AppError('Invalid tweet URL', 400));
          const tw = await getValidTwitterToken(userId);
          if (!tw) return next(new AppError('Disconnect and reconnect Twitter in your profile to refresh credentials.', 400));
          const r = await verifyTweetAction(tw.token, tw.twitterId, tweetId, 'retweet');
          if (r.serverError) return next(new AppError('Twitter API temporarily unavailable — try again later', 503));
          verified = r.verified || r.tierLimited;
          break;
        }
        case 'COMMENT_TWEET': {
          const tweetId = extractTweetId(task.targetUrl);
          if (!tweetId) return next(new AppError('Invalid tweet URL', 400));
          const tw = await getValidTwitterToken(userId);
          if (!tw) return next(new AppError('Disconnect and reconnect Twitter in your profile to refresh credentials.', 400));
          const r = await verifyTweetComment(tw.token, tw.twitterId, tweetId);
          if (r.serverError) return next(new AppError('Twitter API temporarily unavailable — try again later', 503));
          verified = r.verified || r.tierLimited;
          break;
        }
        default:
          return next(new AppError('Unknown task type', 400));
      }
      if (!verified) return next(new AppError('Task not completed — action not detected', 400));
    }

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.rewardClaim.create({
        data: { userId, taskId, reward: task.reward },
      });
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { rewardPoints: { increment: task.reward } },
        select: { rewardPoints: true },
      });
      return { claim, totalPoints: updatedUser.rewardPoints };
    });

    void awardReferralKickback(prisma, userId, task.reward, task.title).catch(() => {});

    res.json({
      status: 'success',
      data: {
        claimId: result.claim.id,
        reward: result.claim.reward,
        totalPoints: result.totalPoints,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRewardHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return next(new AppError('Authentication required', 401));

    const claims = await prisma.rewardClaim.findMany({
      where: { userId },
      orderBy: { claimedAt: 'desc' },
      include: {
        task: { select: { title: true, type: true, reward: true } },
      },
    });

    res.json({
      status: 'success',
      data: {
        claims: claims.map((c) => ({
          id: c.id,
          taskTitle: c.task?.title ?? null,
          taskType: c.task?.type ?? null,
          reward: c.reward,
          type: c.type,
          metadata: c.metadata,
          claimedAt: c.claimedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ──────── Admin endpoints ────────

export const adminListRewardTasks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const tasks = await prisma.rewardTask.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { claims: true } },
        createdBy: { select: { id: true, username: true } },
      },
    });

    res.json({
      status: 'success',
      data: {
        tasks: tasks.map((t) => ({
          ...t,
          claimCount: t._count.claims,
          _count: undefined,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const adminCreateRewardTask = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const { type, title, description, targetUrl, reward, sortOrder,
            targetCount, targetAmount, targetCaseId, repeatIntervalHours, activeUntil } = req.body || {};

    const targetCountNum = Number(targetCount) || 0;
    const targetAmountNum = Number(targetAmount) || 0;
    const formatAmount = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(2));

    // For SUBSCRIBE_TELEGRAM we personalise the default title with the
    // specific @handle admins paste so the task list reads naturally even
    // without a custom title.
    const tgHandle = type === 'SUBSCRIBE_TELEGRAM' ? extractTelegramChatRef(targetUrl) : null;
    const SOCIAL_PRESETS: Record<string, { title: string; description: string }> = {
      LINK_TWITTER: { title: 'Link Twitter', description: 'Connect your X account' },
      LINK_TELEGRAM: { title: 'Link Telegram', description: 'Connect your Telegram account' },
      FOLLOW_TWITTER: { title: 'Follow @casefunnet', description: 'Follow our official X account' },
      SUBSCRIBE_TELEGRAM: {
        title: tgHandle ? `Join ${tgHandle}` : 'Join Telegram channel',
        description: tgHandle
          ? `Subscribe to ${tgHandle} on Telegram`
          : 'Subscribe to our Telegram community',
      },
      LIKE_TWEET: { title: 'Like this post', description: 'Like the post on X' },
      REPOST_TWEET: { title: 'Repost this post', description: 'Repost on X' },
      COMMENT_TWEET: { title: 'Comment on this post', description: 'Leave a comment on the post' },
    };

    const CASEFUN_PRESETS: Record<string, { title: string; description: string }> = {
      OPEN_CASES: { title: `Open ${targetCountNum || 1} cases`, description: 'Open cases to earn rewards' },
      OPEN_SPECIFIC_CASE: { title: `Open a specific case ${targetCountNum || 1} times`, description: 'Open the designated case' },
      DO_UPGRADES: { title: `Complete ${targetCountNum || 1} upgrades`, description: 'Upgrade your tokens' },
      CREATE_BATTLES: { title: `Create ${targetCountNum || 1} battles`, description: 'Create battle lobbies' },
      JOIN_BATTLES: { title: `Play ${targetCountNum || 1} battles`, description: 'Participate in battles' },
      CLAIM_TOKENS: { title: `Claim ${targetCountNum || 1} tokens`, description: 'Claim tokens from cases' },
      CREATE_CASES: { title: `Create ${targetCountNum || 1} cases`, description: 'Create your own cases' },
      DEPOSIT_AMOUNT_EVM: {
        title: `Deposit ${formatAmount(targetAmountNum || 1)} USDT via EVM`,
        description: 'Top up your CaseFun balance using an EVM chain',
      },
      DEPOSIT_AMOUNT_TON: {
        title: `Deposit ${formatAmount(targetAmountNum || 1)} USDT via TON`,
        description: 'Top up your CaseFun balance using TON',
      },
      DEPOSIT_COUNT_ANY: {
        title: `Make ${targetCountNum || 1} deposits`,
        description: 'Top up your balance from any supported chain',
      },
      DEPOSIT_COUNT_EVM: {
        title: `Make ${targetCountNum || 1} EVM deposits`,
        description: 'Top up your balance via an EVM chain',
      },
      DEPOSIT_COUNT_TON: {
        title: `Make ${targetCountNum || 1} TON deposits`,
        description: 'Top up your balance via TON',
      },
    };

    const allPresets = { ...SOCIAL_PRESETS, ...CASEFUN_PRESETS };
    if (!allPresets[type]) {
      return next(new AppError('Invalid task type', 400));
    }

    const isCaseFun = CASEFUN_TYPES.has(type);
    const isAmountTask = isDepositAmountType(type);
    const isCountTask = isCaseFun && !isAmountTask;
    if (!isCaseFun && ['LIKE_TWEET', 'REPOST_TWEET', 'COMMENT_TWEET'].includes(type) && !targetUrl) {
      return next(new AppError('Target URL is required for tweet tasks', 400));
    }
    if (type === 'SUBSCRIBE_TELEGRAM') {
      const parsed = extractTelegramChatRef(targetUrl);
      if (!parsed) {
        return next(new AppError(
          'Paste a public Telegram channel/chat URL (e.g. https://t.me/your_channel). Private invite links (t.me/+...) are not supported.',
          400,
        ));
      }
    }
    if (isCountTask && (!targetCountNum || targetCountNum < 1)) {
      return next(new AppError('Target count is required for this task type', 400));
    }
    if (isAmountTask && (!targetAmountNum || targetAmountNum <= 0)) {
      return next(new AppError('Target USDT amount is required for deposit-amount tasks', 400));
    }

    const preset = allPresets[type];
    const finalTitle = title ? String(title).trim() : preset.title;
    const finalDescription = description ? String(description).trim() : preset.description;

    const task = await prisma.rewardTask.create({
      data: {
        type,
        title: finalTitle,
        description: finalDescription,
        targetUrl: targetUrl ? String(targetUrl).trim() : null,
        reward: Math.max(1, Number(reward) || 1),
        isDefault: false,
        isActive: true,
        sortOrder: Number(sortOrder) || 100,
        createdById: adminId,
        category: isCaseFun ? 'CASEFUN' : 'SOCIAL',
        targetCount: isCountTask ? Math.max(1, targetCountNum) : null,
        targetAmount: isAmountTask ? targetAmountNum : null,
        targetCaseId: type === 'OPEN_SPECIFIC_CASE' && targetCaseId ? String(targetCaseId) : null,
        repeatIntervalHours: repeatIntervalHours != null && repeatIntervalHours !== '' ? Math.max(0, Number(repeatIntervalHours)) : null,
        activeUntil: activeUntil ? new Date(activeUntil) : null,
      },
    });

    res.json({ status: 'success', data: { task } });
  } catch (error) {
    next(error);
  }
};

export const adminUpdateRewardTask = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return next(new AppError('Task id is required', 400));

    const existing = await prisma.rewardTask.findUnique({ where: { id } });
    if (!existing) return next(new AppError('Task not found', 404));

    const data: Record<string, any> = {};
    if (req.body.title !== undefined)
      data.title = String(req.body.title).trim();
    if (req.body.description !== undefined)
      data.description = String(req.body.description).trim();
    if (req.body.targetUrl !== undefined)
      data.targetUrl = req.body.targetUrl
        ? String(req.body.targetUrl).trim()
        : null;
    if (req.body.reward !== undefined)
      data.reward = Math.max(1, Number(req.body.reward) || 1);
    if (req.body.isActive !== undefined)
      data.isActive = Boolean(req.body.isActive);
    if (req.body.sortOrder !== undefined)
      data.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body.targetCount !== undefined)
      data.targetCount = req.body.targetCount ? Math.max(1, Number(req.body.targetCount)) : null;
    if (req.body.targetAmount !== undefined) {
      const ta = Number(req.body.targetAmount);
      data.targetAmount = Number.isFinite(ta) && ta > 0 ? ta : null;
    }
    if (req.body.repeatIntervalHours !== undefined) {
      const rih = req.body.repeatIntervalHours;
      data.repeatIntervalHours = rih !== null && rih !== '' && rih !== undefined ? Math.max(0, Number(rih)) : null;
    }
    if (req.body.activeUntil !== undefined)
      data.activeUntil = req.body.activeUntil ? new Date(req.body.activeUntil) : null;

    const task = await prisma.rewardTask.update({
      where: { id },
      data,
    });

    res.json({ status: 'success', data: { task } });
  } catch (error) {
    next(error);
  }
};

export const adminDeleteRewardTask = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return next(new AppError('Task id is required', 400));

    const existing = await prisma.rewardTask.findUnique({ where: { id } });
    if (!existing) return next(new AppError('Task not found', 404));
    if (existing.isDefault) {
      return next(new AppError('Cannot delete default tasks', 400));
    }

    await prisma.rewardTask.update({ where: { id }, data: { isActive: false } });
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

export const adminListRewardClaims = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const claims = await prisma.rewardClaim.findMany({
      orderBy: { claimedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, username: true } },
        task: { select: { id: true, title: true, type: true } },
      },
    });

    res.json({
      status: 'success',
      data: {
        claims: claims.map((c) => ({
          id: c.id,
          userId: c.user?.id ?? c.userId,
          username: c.user?.username ?? 'Deleted',
          taskId: c.task?.id ?? c.taskId,
          taskTitle: c.task?.title ?? 'Deleted task',
          taskType: c.task?.type ?? 'UNKNOWN',
          reward: c.reward,
          claimedAt: c.claimedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
