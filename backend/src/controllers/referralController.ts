import { Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { generateUniqueReferralCode } from '../utils/referral.js';

export const getReferralCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = String(req.userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, referralConfirmedCount: true, role: true, twitterId: true, telegramId: true },
    });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const role = String(user.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      if (!user.twitterId || !user.telegramId) {
        return next(
          new AppError('Link both Twitter and Telegram to unlock your referral link.', 403)
        );
      }
    }

    if (!user.referralCode) {
      const code = await generateUniqueReferralCode(prisma);
      user = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true, referralConfirmedCount: true, role: true, twitterId: true, telegramId: true },
      });
    }

    res.json({
      status: 'success',
      data: {
        code: user.referralCode,
        invitedCount: user.referralConfirmedCount ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
