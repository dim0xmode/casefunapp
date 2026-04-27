import React, { useEffect, useState } from 'react';
import { Flame, Lock, Check } from 'lucide-react';
import { RewardTask } from '../types';

interface DailyStreakCardProps {
  task: RewardTask;
  isEditable: boolean;
  isClaiming: boolean;
  onClaim: (taskId: string) => void;
  onConnectSocials?: () => void;
}

const formatCountdown = (ms: number): string => {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const DailyStreakCard: React.FC<DailyStreakCardProps> = ({
  task,
  isEditable,
  isClaiming,
  onClaim,
  onConnectSocials,
}) => {
  const streak = task.streak;
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!streak?.claimedToday) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [streak?.claimedToday]);

  if (!streak) return null;

  const isLocked = Boolean(task.locked);
  const length = streak.length || 7;
  const lastDay = streak.lastDay || 0;
  const nextDay = streak.nextDay || 1;
  const claimedToday = streak.claimedToday;

  // Visual state per cell:
  // - "claimed" = day is part of the user's currently-running streak (1..lastDay)
  // - "today"   = the cell that the user can claim right now (or has just claimed today)
  // - "future"  = dim, not yet reached
  const cellState = (dayIdx: number): 'claimed' | 'today' | 'future' => {
    if (dayIdx < lastDay) return 'claimed';
    if (claimedToday) {
      return dayIdx === lastDay ? 'claimed' : 'future';
    }
    return dayIdx === nextDay ? 'today' : 'future';
  };

  let countdown = '';
  if (claimedToday && streak.cooldownEndsAt) {
    countdown = formatCountdown(new Date(streak.cooldownEndsAt).getTime() - now);
  }

  return (
    <div
      className={`px-3 py-3 rounded-xl border bg-gradient-to-br from-amber-500/[0.04] to-orange-500/[0.03] ${
        isLocked ? 'border-white/[0.04] opacity-60' : 'border-amber-400/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isLocked ? (
            <Lock size={12} className="text-gray-500 shrink-0" />
          ) : (
            <Flame size={13} className="text-amber-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] text-white font-bold">
              {task.title || 'Daily Login Streak'}
            </div>
            <div className="text-[10px] text-gray-500 leading-snug">
              {isLocked ? (
                <span className="text-amber-300/80">Link Twitter & Telegram first</span>
              ) : claimedToday ? (
                <>
                  Come back in <span className="text-amber-300">{countdown}</span>
                </>
              ) : lastDay > 0 ? (
                <>
                  Streak day <span className="text-amber-300">{nextDay}</span> · skip a day to reset
                </>
              ) : (
                'Visit daily — reward grows each day, resets on miss'
              )}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-mono text-amber-300 shrink-0">
          +{nextDay} CFP
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-2.5">
        {streak.schedule.map((day) => {
          const state = cellState(day);
          const base =
            'aspect-square rounded-lg border flex flex-col items-center justify-center text-[9px] font-bold leading-none gap-0.5';
          const tone =
            state === 'claimed'
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
              : state === 'today'
              ? 'border-amber-300 bg-gradient-to-br from-amber-400/30 to-orange-500/25 text-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.35)]'
              : 'border-white/[0.06] bg-black/20 text-gray-600';
          return (
            <div key={day} className={`${base} ${tone}`}>
              {state === 'claimed' ? (
                <Check size={11} className="text-amber-200" />
              ) : (
                <span className="text-[8px] uppercase tracking-wide opacity-70">
                  D{day}
                </span>
              )}
              <span className="text-[10px] font-mono">+{day}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-500">
          {claimedToday ? (
            <span className="text-emerald-400">Claimed today · day {lastDay}</span>
          ) : lastDay > 0 ? (
            <span>
              {lastDay} / {length} days · keep the streak alive
            </span>
          ) : (
            <span>Day 1 of {length}</span>
          )}
        </div>
        {!claimedToday && isEditable && !isLocked && (
          <button
            type="button"
            disabled={isClaiming}
            onClick={() => onClaim(task.id)}
            className="text-[10px] font-bold px-3 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-black disabled:opacity-50 active:scale-[0.97] transition"
          >
            {isClaiming ? '…' : `Claim +${nextDay}`}
          </button>
        )}
        {!claimedToday && isEditable && isLocked && onConnectSocials && (
          <button
            type="button"
            onClick={onConnectSocials}
            className="text-[10px] font-bold px-3 py-1 rounded-lg border border-amber-400/40 text-amber-300 hover:bg-amber-500/10 active:scale-[0.97] transition"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
};
