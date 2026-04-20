import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ShoppingCart, PackageOpen, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { ImageWithMeta } from '../ui/ImageWithMeta';
import { formatDecimal } from '../../utils/number';
import {
  RewardCaseSummary,
  RewardOpenResult,
  currencyLabel,
  dropKindLabel,
  isNftDrop,
  isTestCurrency,
  isTestDrop,
} from '../../types/reward';

interface Props {
  caseId: string;
  onBack: () => void;
  balance: number;
  onOpenTopUp: (prefillUsdt?: number) => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isTelegramMiniApp?: boolean;
  onOpened?: () => void;
}

const statusBadge = (status: RewardCaseSummary['status']) => {
  switch (status) {
    case 'ACTIVE':
      return { label: 'OPEN', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    case 'SCHEDULED':
      return { label: 'PRE-SALE', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' };
    case 'PAUSED':
      return { label: 'PAUSED', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    case 'COMPLETED':
      return { label: 'ENDED', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
    default:
      return { label: status, cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' };
  }
};

const countdown = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const secs = Math.floor(diff / 1000);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

export const RewardCaseDetailView: React.FC<Props> = ({
  caseId,
  onBack,
  balance,
  onOpenTopUp,
  isAuthenticated,
  onOpenWalletConnect,
  isTelegramMiniApp = false,
  onOpened,
}) => {
  const [data, setData] = useState<RewardCaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'open' | 'buy' | null>(null);
  const [count, setCount] = useState(1);
  const [result, setResult] = useState<RewardOpenResult | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.getRewardCaseById(caseId);
      setData(res?.data || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load reward case');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const isTestCase = data ? isTestCurrency(data.openCurrency) : false;
  const unitPrice = useMemo(() => {
    if (!data) return 0;
    if (data.status === 'SCHEDULED' && data.prePrice != null) return Number(data.prePrice);
    return Number(data.openPrice);
  }, [data]);
  const prePurchased = data?.userPrePurchase?.remaining || 0;
  const freeUnits = data?.status === 'ACTIVE' ? Math.min(prePurchased, count) : 0;
  const paidUnits = Math.max(0, count - freeUnits);
  const needBalance = isTestCase ? 0 : paidUnits * unitPrice;

  const canBuy = data?.status === 'SCHEDULED' || data?.status === 'ACTIVE';
  const canOpen = data?.status === 'ACTIVE';

  const handleBuy = async () => {
    if (!data || !isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    setBusy('buy');
    setFlashMsg(null);
    try {
      await api.prePurchaseRewardCase(data.id, count);
      setFlashMsg(`Pre-purchased ${count} open${count === 1 ? '' : 's'}.`);
      await load();
      onOpened?.();
    } catch (err: any) {
      setFlashMsg(err?.message || 'Failed to pre-purchase');
    } finally {
      setBusy(null);
    }
  };

  const handleOpen = async () => {
    if (!data || !isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    setBusy('open');
    setFlashMsg(null);
    setResult(null);
    try {
      const res: any = await api.openRewardCase(data.id, count);
      setResult(res?.data || null);
      await load();
      onOpened?.();
    } catch (err: any) {
      setFlashMsg(err?.message || 'Failed to open case');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="w-full text-white p-4 text-center text-xs text-gray-500">Loading…</div>
    );
  }
  if (error || !data) {
    return (
      <div className="w-full text-white p-4">
        <button onClick={onBack} className="text-xs text-gray-400 flex items-center gap-1 mb-4">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="text-xs text-red-400">{error || 'Case not found'}</div>
      </div>
    );
  }

  const sb = statusBadge(data.status);
  const pre = countdown(data.startAt);
  const end = countdown(data.endAt);

  const pad = isTelegramMiniApp ? 'px-2 py-2' : 'px-6 py-8';
  return (
    <div className={`w-full text-white ${pad}`}>
      <button
        onClick={onBack}
        className="text-xs text-gray-400 flex items-center gap-1 mb-3 hover:text-white transition"
      >
        <ArrowLeft size={14} /> Cases
      </button>

      <div className="rounded-2xl border border-white/[0.08] bg-web3-card/40 p-3 md:p-5 mb-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] to-web3-accent/[0.05] pointer-events-none" />
        <div className="relative flex items-start gap-3 md:gap-4">
          <div className="shrink-0">
            <div className="w-20 h-20 md:w-28 md:h-28 rounded-xl border-2 border-amber-400/40 bg-gradient-to-br from-amber-500/30 to-web3-accent/30 overflow-hidden">
              {data.imageUrl ? (
                <ImageWithMeta
                  src={data.imageUrl}
                  className="w-full h-full"
                  imgClassName="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-gray-500">
                  Reward
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-black tracking-wider ${sb.cls}`}
              >
                {sb.label}
              </span>
              {isTestCase && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border uppercase font-black tracking-wider bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40">
                  TEST MODE
                </span>
              )}
              {prePurchased > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border uppercase font-black tracking-wider bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                  {prePurchased} prepaid
                </span>
              )}
            </div>
            <h2 className="text-lg md:text-2xl font-black leading-tight">{data.name}</h2>
            {data.description && (
              <p className="text-[11px] md:text-xs text-gray-400 leading-snug">
                {data.description}
              </p>
            )}
            <div className="text-[11px] text-gray-500 mt-1">
              {data.status === 'SCHEDULED' && pre && <span>Starts in {pre}</span>}
              {data.status === 'ACTIVE' && end && <span>Ends in {end}</span>}
              {data.status === 'PAUSED' && <span>Temporarily paused</span>}
              {data.status === 'COMPLETED' && <span>Finished</span>}
              {data.limitMode !== 'NONE' && data.limitRemaining != null && (
                <span className="ml-2">
                  · {data.limitMode === 'BY_OPENS' ? 'opens' : 'budget'} left:{' '}
                  {formatDecimal(Number(data.limitRemaining))}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drop table */}
      <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3 md:p-4 mb-4">
        <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">
          Possible drops
        </div>
        <div className="space-y-1.5">
          {data.drops.map((d) => {
            const testDrop = isTestDrop(d.kind);
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2"
              >
                <div
                  className="w-8 h-8 rounded-md border overflow-hidden shrink-0"
                  style={{ borderColor: (d.color || '#9CA3AF') + '60' }}
                >
                  {d.image ? (
                    <ImageWithMeta
                      src={d.image}
                      className="w-full h-full"
                      imgClassName="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500">
                      {isNftDrop(d.kind) ? 'NFT' : dropKindLabel(d.kind).slice(0, 3)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-white truncate">{d.name}</span>
                    {testDrop && (
                      <span className="text-[8px] font-black px-1 py-0.5 rounded border border-fuchsia-500/40 text-fuchsia-300">
                        TEST
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {isNftDrop(d.kind)
                      ? `1× ${dropKindLabel(d.kind)}`
                      : `${formatDecimal(d.amount)} ${dropKindLabel(d.kind)}`}
                  </div>
                </div>
                <div className="text-[10px] font-bold text-amber-300 shrink-0">
                  {d.probability.toFixed(d.probability < 1 ? 3 : 2)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action panel */}
      <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-3 md:p-4 backdrop-blur-xl">
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">Count</div>
          <div className="flex items-center gap-1 flex-wrap">
            {[1, 3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`min-w-[40px] px-2 py-1.5 rounded-md text-[11px] font-bold border transition ${
                  count === n
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-white/[0.03] text-gray-400 border-white/[0.06]'
                }`}
              >
                ×{n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={25}
              value={count}
              onChange={(e) => {
                const n = Math.max(1, Math.min(25, Number(e.target.value) || 1));
                setCount(n);
              }}
              className="w-14 px-2 py-1.5 rounded-md text-[11px] font-bold bg-white/[0.03] border border-white/[0.06] text-white text-center"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] mb-3">
          <span className="text-gray-500">Unit price</span>
          <span className="font-bold text-white">
            {formatDecimal(unitPrice)} {currencyLabel(data.openCurrency)}
            {data.status === 'SCHEDULED' && data.prePrice != null && data.prePrice < data.openPrice && (
              <span className="ml-1 text-[9px] text-emerald-400 uppercase">pre-sale</span>
            )}
          </span>
        </div>
        {data.status === 'ACTIVE' && prePurchased > 0 && (
          <div className="flex items-center justify-between text-[11px] mb-3">
            <span className="text-gray-500">Free from pre-purchase</span>
            <span className="font-bold text-emerald-400">
              {freeUnits} / {count}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs mb-4">
          <span className="text-gray-500">You pay</span>
          <span className="font-black text-amber-300">
            {isTestCase ? 0 : formatDecimal(paidUnits * unitPrice)} {currencyLabel(data.openCurrency)}
          </span>
        </div>

        {flashMsg && (
          <div className="mb-3 text-[11px] text-center rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 text-gray-300">
            {flashMsg}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleBuy}
            disabled={!canBuy || busy !== null || (!isTestCase && needBalance > balance && count * unitPrice > balance)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-black disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShoppingCart size={14} />
            {busy === 'buy' ? 'Buying…' : 'Pre-purchase'}
          </button>
          <button
            onClick={handleOpen}
            disabled={!canOpen || busy !== null}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 to-web3-accent text-black disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PackageOpen size={14} />
            {busy === 'open' ? 'Opening…' : 'Open'}
          </button>
        </div>
        {!isTestCase && data.status === 'ACTIVE' && paidUnits > 0 && paidUnits * unitPrice > balance && (
          <button
            onClick={() => onOpenTopUp(paidUnits * unitPrice)}
            className="w-full mt-2 text-[10px] text-gray-400 flex items-center justify-center gap-1 hover:text-white"
          >
            <AlertTriangle size={11} /> Insufficient balance — top up
          </button>
        )}
      </div>

      {result && <ResultOverlay result={result} onClose={() => setResult(null)} />}
    </div>
  );
};

const ResultOverlay: React.FC<{
  result: RewardOpenResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-web3-card p-4 space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-white uppercase tracking-widest">
            You got
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 px-2 py-1 rounded hover:bg-white/[0.05]"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {result.drops.map((d, idx) => (
            <div
              key={idx}
              className="rounded-lg border p-2 flex flex-col items-center gap-1 bg-black/30"
              style={{ borderColor: (d.color || '#9CA3AF') + '80' }}
            >
              <div
                className="w-full aspect-square rounded-md overflow-hidden border"
                style={{ borderColor: (d.color || '#9CA3AF') + '40' }}
              >
                {d.image ? (
                  <img src={d.image} alt={d.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] uppercase text-gray-500">
                    {dropKindLabel(d.kind)}
                  </div>
                )}
              </div>
              <div className="text-[10px] font-bold text-white text-center truncate w-full">
                {d.name}
              </div>
              <div className="text-[10px] text-amber-300 font-bold">
                {isNftDrop(d.kind) ? '×1' : `${formatDecimal(d.amount)}`} {dropKindLabel(d.kind)}
              </div>
              {d.isTest && (
                <div className="text-[8px] font-black text-fuchsia-300 uppercase">TEST</div>
              )}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 text-center">
          Check the <span className="font-bold text-white">Rewards</span> tab in your profile to
          manage these.
        </div>
      </div>
    </div>
  );
};
