import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { ImageWithMeta } from '../ui/ImageWithMeta';
import { formatDecimal } from '../../utils/number';
import {
  RewardCaseSummary,
  currencyLabel,
  isTestCurrency,
} from '../../types/reward';

interface Props {
  onSelect: (id: string) => void;
  isTelegramMiniApp?: boolean;
}

const statusAccent = (status: RewardCaseSummary['status']) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'SCHEDULED':
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    case 'PAUSED':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'COMPLETED':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
  }
};

const countdownTo = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export const RewardCasesGrid: React.FC<Props> = ({ onSelect, isTelegramMiniApp = false }) => {
  const [cases, setCases] = useState<RewardCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res: any = await api.getRewardCases();
        if (!mounted) return;
        const list: RewardCaseSummary[] = Array.isArray(res?.data) ? res.data : [];
        setCases(list);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load reward cases');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="text-xs text-gray-500 text-center py-8">Loading reward cases…</div>;
  }
  if (error) {
    return <div className="text-xs text-red-400 text-center py-8">{error}</div>;
  }
  if (cases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-gray-500">
        No reward cases available yet.
      </div>
    );
  }

  return (
    <div
      className={
        isTelegramMiniApp
          ? 'grid grid-cols-2 gap-2'
          : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
      }
    >
      {cases.map((c) => {
        const preCountdown = c.status === 'SCHEDULED' ? countdownTo(c.startAt) : null;
        const endCountdown = c.status === 'ACTIVE' ? countdownTo(c.endAt) : null;
        const userPre = c.userPrePurchase?.remaining || 0;
        const isTest = isTestCurrency(c.openCurrency);
        const effectivePrice =
          c.status === 'SCHEDULED' && c.prePrice != null ? c.prePrice : c.openPrice;
        const hasDiscount =
          c.status === 'SCHEDULED' && c.prePrice != null && c.prePrice < c.openPrice;

        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-web3-card/40 transition-all duration-200 active:scale-[0.97] hover:border-web3-accent/40 text-left"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] to-web3-accent/[0.04] group-hover:from-amber-500/10 group-hover:to-web3-accent/10 transition-all duration-200" />
            <div
              className={`absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border ${statusAccent(
                c.status
              )}`}
            >
              {c.status === 'ACTIVE' ? 'OPEN' : c.status}
            </div>
            {userPre > 0 && (
              <div className="absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {userPre} prepaid
              </div>
            )}
            {isTest && (
              <div className="absolute bottom-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                TEST
              </div>
            )}

            <div className="relative z-10 flex flex-col items-center p-2.5 gap-1.5">
              <div className="text-[8px] uppercase tracking-wider text-gray-500 leading-none h-[10px]">
                {preCountdown
                  ? `starts in ${preCountdown}`
                  : endCountdown
                    ? `ends in ${endCountdown}`
                    : '\u00A0'}
              </div>

              <div className="w-14 h-14 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/25 to-web3-accent/25 flex items-center justify-center overflow-hidden shadow-[0_0_16px_rgba(251,191,36,0.08)]">
                {c.imageUrl ? (
                  <ImageWithMeta
                    src={c.imageUrl}
                    className="w-full h-full"
                    imgClassName="w-full h-full"
                  />
                ) : (
                  <span className="text-[9px] uppercase tracking-widest text-gray-500">
                    Reward
                  </span>
                )}
              </div>

              <div className="text-[11px] font-black text-white text-center leading-tight truncate w-full">
                {c.name}
              </div>

              <div className="flex items-center justify-center gap-1 text-[10px] leading-none">
                {hasDiscount && (
                  <span className="line-through text-gray-600 text-[9px]">
                    {formatDecimal(Number(c.openPrice))}
                  </span>
                )}
                <span className="font-bold text-amber-300">
                  {formatDecimal(Number(effectivePrice))}
                </span>
                <span className="text-[9px] uppercase text-gray-500">
                  {currencyLabel(c.openCurrency)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
