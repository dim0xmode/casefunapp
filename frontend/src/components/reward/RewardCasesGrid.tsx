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

const statusLabel = (status: RewardCaseSummary['status']) => {
  if (status === 'ACTIVE') return 'OPEN';
  if (status === 'SCHEDULED') return 'PRE-SALE';
  return status;
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

  const renderOverlays = (c: RewardCaseSummary) => {
    const isTest = isTestCurrency(c.openCurrency);
    const userPre = c.userPrePurchase?.remaining || 0;
    return (
      <>
        <span
          className={`absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider border ${statusAccent(
            c.status
          )}`}
        >
          {statusLabel(c.status)}
        </span>
        {userPre > 0 && (
          <span className="absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            {userPre} prepaid
          </span>
        )}
        {isTest && (
          <span className="absolute bottom-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
            TEST
          </span>
        )}
      </>
    );
  };

  const renderCard = (c: RewardCaseSummary) => {
    const preCountdown = c.status === 'SCHEDULED' ? countdownTo(c.startAt) : null;
    const endCountdown = c.status === 'ACTIVE' ? countdownTo(c.endAt) : null;
    const effectivePrice =
      c.status === 'SCHEDULED' && c.prePrice != null ? c.prePrice : c.openPrice;
    const hasDiscount =
      c.status === 'SCHEDULED' && c.prePrice != null && c.prePrice < c.openPrice;
    const tailingLabel = preCountdown
      ? `starts in ${preCountdown}`
      : endCountdown
        ? `ends in ${endCountdown}`
        : c.status === 'SCHEDULED'
          ? 'pre-sale'
          : c.status === 'ACTIVE'
            ? 'open'
            : c.status.toLowerCase();

    if (isTelegramMiniApp) {
      return (
        <div
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-web3-card/40 transition-all duration-200 active:scale-[0.97] hover:border-amber-400/40 cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] to-web3-accent/[0.05] group-hover:from-amber-500/10 group-hover:to-web3-accent/10 transition-all duration-200" />
          {renderOverlays(c)}
          <div className="relative z-10 flex flex-col items-center p-2.5 gap-1.5">
            <div className="text-[8px] uppercase tracking-wider text-gray-500 leading-none">
              {tailingLabel}
            </div>

            <div className="w-14 h-14 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/25 to-web3-accent/25 flex items-center justify-center overflow-hidden shadow-[0_0_16px_rgba(251,191,36,0.1)]">
              {c.imageUrl ? (
                <ImageWithMeta
                  src={c.imageUrl}
                  className="w-full h-full"
                  imgClassName="w-full h-full"
                />
              ) : (
                <span className="text-[8px] uppercase tracking-widest text-gray-500">Reward</span>
              )}
            </div>

            <div className="text-[11px] font-black text-white text-center leading-tight truncate w-full">
              {c.name}
            </div>

            <div className="flex items-center justify-center gap-1 w-full text-[10px] leading-none px-0.5">
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
        </div>
      );
    }

    return (
      <div
        key={c.id}
        onClick={() => onSelect(c.id)}
        className="group relative bg-web3-card/50 backdrop-blur-xl rounded-2xl border border-white/[0.05] hover:border-amber-400/50 transition-all duration-300 overflow-hidden cursor-pointer hover:-translate-y-1 aspect-square flex flex-col p-4 min-h-[220px]"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] to-web3-accent/[0.04] group-hover:from-amber-500/10 group-hover:to-web3-accent/10 transition-all duration-300" />
        {renderOverlays(c)}

        <div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto] gap-1 px-2 py-2">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 text-center leading-none">
            {tailingLabel}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 text-center">
            Reward drop
          </div>
          <div className="flex items-center justify-center min-h-0">
            <div className="w-[42%] max-w-[88px] min-w-[44px] aspect-square bg-gradient-to-br from-amber-500/30 to-web3-accent/30 rounded-xl border-2 border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.2)] backdrop-blur-sm flex items-center justify-center overflow-hidden">
              {c.imageUrl ? (
                <ImageWithMeta
                  src={c.imageUrl}
                  className="w-full h-full"
                  imgClassName="w-full h-full"
                />
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-gray-500">Reward</span>
              )}
            </div>
          </div>

          <div className="w-full text-center space-y-1">
            <h3 className="text-xs font-black truncate">{c.name}</h3>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              {currencyLabel(c.openCurrency)}
            </div>
            <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-400/20 to-web3-accent/20 border border-amber-400/30 flex items-center justify-center gap-1">
              {hasDiscount && (
                <span className="line-through text-gray-500 text-[10px]">
                  {formatDecimal(Number(c.openPrice))}
                </span>
              )}
              <span className="font-black text-xs text-white">
                {formatDecimal(Number(effectivePrice))} {currencyLabel(c.openCurrency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={
        isTelegramMiniApp
          ? 'grid grid-cols-3 gap-2'
          : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
      }
    >
      {cases.map(renderCard)}
    </div>
  );
};
