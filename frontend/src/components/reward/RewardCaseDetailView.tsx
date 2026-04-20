import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Package, ShoppingCart, ChevronRight, ChevronsRight, Zap } from 'lucide-react';
import { api } from '../../services/api';
import { formatDecimal, formatShortfallUp } from '../../utils/number';
import { CaseRoulette, SPIN_DURATION_MS } from '../CaseRoulette';
import { ItemCard } from '../ItemCard';
import { AdminActionButton } from '../ui/AdminActionButton';
import { Case, Item, Rarity } from '../../types';
import {
  RewardCaseSummary,
  RewardOpenResult,
  RewardDropSummary,
  currencyLabel,
  dropKindLabel,
  isNftDrop,
  isTestCurrency,
} from '../../types/reward';

interface Props {
  caseId: string;
  onBack: () => void;
  balance: number;
  onOpenTopUp: (prefillUsdt?: number) => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin?: boolean;
  isTelegramMiniApp?: boolean;
  onOpened?: () => void;
}

type OpenMode = 'normal' | 'fast' | 'instant';
const OPEN_MODE_SPEEDS: Record<OpenMode, number> = { normal: 1, fast: 3, instant: 0 };

const toRarityEnum = (raw: string | null | undefined): Rarity => {
  const r = String(raw || '').toUpperCase();
  if (r === 'UNCOMMON') return Rarity.UNCOMMON;
  if (r === 'RARE') return Rarity.RARE;
  if (r === 'LEGENDARY') return Rarity.LEGENDARY;
  if (r === 'MYTHIC') return Rarity.MYTHIC;
  return Rarity.COMMON;
};

const dropToItem = (d: RewardDropSummary): Item => ({
  id: d.id,
  name: d.name,
  value: Number(d.amount) || 0,
  currency: dropKindLabel(d.kind),
  rarity: toRarityEnum(d.rarity),
  image: d.image || (isNftDrop(d.kind) ? '🖼️' : '🪙'),
  color: d.color || '#9CA3AF',
});

const resultDropToItem = (
  drop: RewardOpenResult['drops'][number],
  fallback: Map<string, RewardDropSummary>
): Item => {
  const matched = fallback.get(drop.dropId);
  return {
    id: drop.dropId,
    name: drop.name,
    value: Number(drop.amount) || 0,
    currency: dropKindLabel(drop.kind),
    rarity: toRarityEnum(drop.rarity || matched?.rarity),
    image: drop.image || matched?.image || (isNftDrop(drop.kind) ? '🖼️' : '🪙'),
    color: drop.color || matched?.color || '#9CA3AF',
  };
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
  isAdmin = false,
  isTelegramMiniApp = false,
  onOpened,
}) => {
  const [data, setData] = useState<RewardCaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSpinning, setIsSpinning] = useState(false);
  const [openMode, setOpenMode] = useState<OpenMode>('normal');
  const [hasOpened, setHasOpened] = useState(false);
  const [multiOpen, setMultiOpen] = useState<number>(1);
  const [activeOpenCount, setActiveOpenCount] = useState<number>(1);
  const [revealedPrefixCount, setRevealedPrefixCount] = useState(0);
  const [multiResults, setMultiResults] = useState<Item[]>([]);
  const [currentRevealFrom, setCurrentRevealFrom] = useState(0);
  const [spinToken, setSpinToken] = useState(0);

  const [busyBuy, setBusyBuy] = useState(false);
  const [buyCount, setBuyCount] = useState(1);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<RewardOpenResult | null>(null);

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
  const prePurchased = data?.userPrePurchase?.remaining || 0;
  const openPrice = data ? Number(data.openPrice) : 0;
  const prePrice = data && data.prePrice != null ? Number(data.prePrice) : null;

  // Build a Case-shaped adapter to feed CaseRoulette. Dependencies are
  // intentionally narrow so that patches to volatile fields like
  // limitRemaining / totalOpens do not remount the roulette mid-spin.
  const caseAdapter: Case | null = useMemo(() => {
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      currency: currencyLabel(data.openCurrency),
      price: openPrice,
      image: data.imageUrl || '🎁',
      rtu: 0,
      possibleDrops: data.drops.map(dropToItem),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, data?.imageUrl, data?.openCurrency, data?.drops, openPrice]);

  const dropMap = useMemo(() => {
    const m = new Map<string, RewardDropSummary>();
    if (data) data.drops.forEach((d) => m.set(d.id, d));
    return m;
  }, [data]);

  const freeUnits = data?.status === 'ACTIVE' ? Math.min(prePurchased, multiOpen) : 0;
  const paidUnits = Math.max(0, multiOpen - freeUnits);
  const payNow = isTestCase ? 0 : paidUnits * openPrice;
  const canAfford = isTestCase || balance >= payNow;

  const buyPayNow = useMemo(() => {
    if (!data || data.status !== 'SCHEDULED') return 0;
    if (isTestCase) return 0;
    const unit = prePrice != null ? prePrice : openPrice;
    return unit * buyCount;
  }, [data, isTestCase, prePrice, openPrice, buyCount]);

  const handleSpin = async () => {
    if (!data || data.status !== 'ACTIVE' || isSpinning) return;
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }

    const prevActiveOpenCount = activeOpenCount;
    const prevRevealedPrefixCount = revealedPrefixCount;
    setRevealedPrefixCount(hasOpened ? activeOpenCount : 0);
    setActiveOpenCount(multiOpen);
    setMultiResults([]);
    setCurrentRevealFrom(0);
    setSpinToken((p) => p + 1);
    setIsSpinning(true);
    setHasOpened(true);
    setFlashMsg(null);

    try {
      const res: any = await api.openRewardCase(data.id, multiOpen);
      const payload: RewardOpenResult = res?.data;
      if (!payload || !Array.isArray(payload.drops) || payload.drops.length === 0) {
        throw new Error('Empty response');
      }
      const items = payload.drops.map((d) => resultDropToItem(d, dropMap));
      setMultiResults(items);
      setResultSummary(payload);

      // Patch local case state without a full reload so the roulette/UI
      // does not blink or remount during the animation.
      setData((prev) => {
        if (!prev) return prev;
        const remaining = Math.max(
          0,
          (prev.userPrePurchase?.remaining || 0) - (payload.usedPrePurchase || 0)
        );
        return {
          ...prev,
          totalOpens: (prev.totalOpens || 0) + multiOpen,
          limitRemaining:
            prev.limitRemaining != null
              ? Math.max(0, Number(prev.limitRemaining) - multiOpen)
              : prev.limitRemaining ?? null,
          userPrePurchase: prev.userPrePurchase
            ? { ...prev.userPrePurchase, remaining }
            : remaining > 0
              ? { remaining, totalBought: remaining }
              : undefined,
        };
      });

      const speed = OPEN_MODE_SPEEDS[openMode] || 1;
      const totalDuration =
        openMode === 'instant' ? 200 : SPIN_DURATION_MS / speed + 1200 + 200;
      setTimeout(() => setIsSpinning(false), totalDuration);
      onOpened?.();
    } catch (err: any) {
      setActiveOpenCount(prevActiveOpenCount);
      setRevealedPrefixCount(prevRevealedPrefixCount);
      setIsSpinning(false);
      setFlashMsg(err?.message || 'Failed to open case');
    }
  };

  const handleBuyPre = async () => {
    if (!data || data.status !== 'SCHEDULED') return;
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    setBusyBuy(true);
    setFlashMsg(null);
    try {
      await api.prePurchaseRewardCase(data.id, buyCount);
      setFlashMsg(`Pre-purchased ${buyCount} open${buyCount === 1 ? '' : 's'}.`);
      await load();
      onOpened?.();
    } catch (err: any) {
      setFlashMsg(err?.message || 'Failed to pre-purchase');
    } finally {
      setBusyBuy(false);
    }
  };

  if (loading) {
    return <div className="w-full text-white p-6 text-center text-xs text-gray-500">Loading…</div>;
  }
  if (error || !data || !caseAdapter) {
    return (
      <div className="w-full text-white p-6">
        <button onClick={onBack} className="text-xs text-gray-400 flex items-center gap-1 mb-4">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="text-xs text-red-400">{error || 'Case not found'}</div>
      </div>
    );
  }

  const pre = countdown(data.startAt);
  const end = countdown(data.endAt);
  const rouletteCount = Math.max(1, activeOpenCount);
  const isSchedPhase = data.status === 'SCHEDULED';
  const isActivePhase = data.status === 'ACTIVE';
  const isTerminal = data.status === 'PAUSED' || data.status === 'COMPLETED';
  const statusText =
    data.status === 'ACTIVE'
      ? 'OPEN'
      : data.status === 'SCHEDULED'
        ? 'PRE-SALE'
        : data.status === 'PAUSED'
          ? 'PAUSED'
          : 'ENDED';

  return (
    <div className={`w-full text-white relative ${isTelegramMiniApp ? 'px-2 py-3' : 'px-6 py-12'}`}>
      <div className={`max-w-7xl mx-auto ${isTelegramMiniApp ? 'mb-4' : 'mb-6'}`}>
        <button
          onClick={onBack}
          disabled={isSpinning}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-web3-card/50 border border-gray-800 hover:border-amber-400/50 transition-all duration-300 text-gray-400 hover:text-white ${
            isSpinning ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <ArrowLeft size={20} />
          <span className="font-bold">{isTelegramMiniApp ? 'Back' : 'Back to Cases'}</span>
        </button>
      </div>

      {/* Header pill, like CaseOpeningView */}
      <div className={`max-w-7xl mx-auto text-center ${isTelegramMiniApp ? 'mb-4' : 'mb-6'}`}>
        <div
          className={`inline-flex items-center gap-2 rounded-full border font-bold uppercase backdrop-blur-sm animate-fade-in ${
            isTelegramMiniApp
              ? 'px-3 py-1.5 text-[10px] tracking-[0.16em] bg-amber-400/10 border-amber-400/35 text-amber-300'
              : 'px-5 py-2.5 text-xs tracking-widest bg-gradient-to-r from-amber-400/10 to-web3-accent/10 border-amber-400/35 text-amber-300'
          }`}
        >
          <Package size={14} />
          {data.name}
          <span
            className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase border ${
              isActivePhase
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : isSchedPhase
                  ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                  : 'bg-gray-500/20 border-gray-400/40 text-gray-300'
            }`}
          >
            {statusText}
          </span>
          {isTestCase && (
            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase border bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-300">
              TEST
            </span>
          )}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-widest text-gray-500">
          {isSchedPhase && pre && <>Starts in {pre}</>}
          {isActivePhase && end && <>Ends in {end}</>}
          {data.status === 'PAUSED' && <>Temporarily paused</>}
          {data.status === 'COMPLETED' && <>Ended</>}
          {!pre && !end && isActivePhase && <>Open — unlimited time</>}
          {!pre && isSchedPhase && <>Pre-sale is live</>}
        </div>
        {data.description && (
          <div className={`mx-auto mt-2 text-[11px] md:text-xs text-gray-400 leading-snug max-w-2xl`}>
            {data.description}
          </div>
        )}
      </div>

      {/* Roulette area for ACTIVE. In PRE-SALE/PAUSED/COMPLETED we show only
          a short contextual banner (duplicate info has been removed — the
          header pill already carries the case identity and status). */}
      {isActivePhase ? (
        <div className={`max-w-5xl mx-auto ${isTelegramMiniApp ? 'mb-4' : 'mb-6'}`}>
          {Array.from({ length: rouletteCount }).map((_, idx) => (
            <CaseRoulette
              key={`reward-roulette-${idx}`}
              caseData={caseAdapter}
              winner={multiResults[idx] || null}
              openMode={openMode}
              index={idx}
              skipReveal={idx < currentRevealFrom}
              initiallyRevealed={idx < revealedPrefixCount}
              spinToken={spinToken}
              soundEnabled={true}
              clickSoundEnabled={true}
              resultSoundEnabled={true}
              clickVolume={idx === 0 ? 0.15 : 0.08}
              compactContent={isTelegramMiniApp}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-xl mx-auto mb-4 text-center text-sm text-gray-300">
          {isSchedPhase && (
            <>Reserve opens now — each pre-purchase becomes a free open the moment this case goes live.</>
          )}
          {data.status === 'PAUSED' && (
            <>Opening is paused. Pre-purchased opens stay reserved and can be used when the case resumes.</>
          )}
          {data.status === 'COMPLETED' && <>This case is closed.</>}
        </div>
      )}

      {/* Main action strip — mirrors CaseOpeningView for ACTIVE. */}
      {isActivePhase && (
        <div className="max-w-7xl mx-auto">
          <div className={`flex justify-center ${isTelegramMiniApp ? 'mb-3' : 'mb-4'}`}>
            <div className="flex items-center gap-1 bg-web3-card/50 p-1 rounded-lg border border-gray-700/50 backdrop-blur-sm h-[42px]">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  onClick={() => !isSpinning && setMultiOpen(count)}
                  disabled={isSpinning}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
                    multiOpen === count
                      ? 'bg-amber-400/20 border border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                  } ${isSpinning ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  x{count}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`${
              isTelegramMiniApp
                ? 'grid grid-cols-1 gap-3'
                : 'grid grid-cols-[1fr_auto_1fr] items-center gap-2'
            } max-w-6xl mx-auto`}
          >
            <div className={`flex items-center gap-2 flex-wrap ${isTelegramMiniApp ? 'justify-center' : 'justify-end'}`}>
              <div className="flex flex-col px-3 py-1.5 rounded-lg bg-web3-card/50 border border-gray-700/50 backdrop-blur-sm h-[42px] justify-center">
                <span className="text-[9px] uppercase tracking-widest text-gray-500 leading-none">
                  Total · x{multiOpen}
                </span>
                <span className="text-sm font-black text-amber-300 leading-none mt-0.5">
                  {isTestCase ? '0' : formatDecimal(payNow)}{' '}
                  <span className="text-[10px] text-gray-400 font-bold">
                    {currencyLabel(data.openCurrency)}
                  </span>
                </span>
              </div>
              {prePurchased > 0 && (
                <div className="flex flex-col px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-sm h-[42px] justify-center">
                  <span className="text-[9px] uppercase tracking-widest text-emerald-400 leading-none">
                    Prepaid free
                  </span>
                  <span className="text-sm font-black text-emerald-300 leading-none mt-0.5">
                    {freeUnits} / {multiOpen}
                  </span>
                </div>
              )}
            </div>

            <AdminActionButton
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              balance={balance}
              cost={payNow}
              onConnect={onOpenWalletConnect}
              onTopUp={onOpenTopUp}
              onAction={handleSpin}
              readyLabel={
                payNow === 0
                  ? hasOpened
                    ? 'Open Again'
                    : prePurchased > 0
                      ? 'Open (free)'
                      : 'Open'
                  : hasOpened
                    ? `Open Again · ${formatDecimal(payNow)} ${currencyLabel(data.openCurrency)}`
                    : `Open · ${formatDecimal(payNow)} ${currencyLabel(data.openCurrency)}`
              }
              topUpLabel={(shortfall) =>
                `Need ${formatShortfallUp(shortfall)} ${currencyLabel(data.openCurrency)} more • Top up`
              }
              labelOverride={isSpinning ? 'Opening...' : undefined}
              forceLabel={Boolean(isSpinning)}
              disabled={isSpinning || !canAfford || isTerminal}
              showPing={!isSpinning && canAfford}
              className={`group ${isTelegramMiniApp ? 'px-6' : 'px-8'} py-3 text-base font-black rounded-xl overflow-hidden transform transition-all duration-300`}
            />

            <div className={`flex items-center gap-1 ${isTelegramMiniApp ? 'justify-center' : 'justify-start'}`}>
              <button
                onClick={() => !isSpinning && setOpenMode('normal')}
                disabled={isSpinning}
                className={`flex items-center justify-center h-[42px] w-[42px] rounded-md transition-all duration-200 ${
                  openMode === 'normal'
                    ? 'bg-gray-700/50 border border-gray-500 text-gray-300 shadow-[0_0_8px_rgba(156,163,175,0.3)]'
                    : 'bg-web3-card/30 border border-gray-800 text-gray-600 hover:text-gray-400 hover:border-gray-700'
                } ${isSpinning ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => !isSpinning && setOpenMode('fast')}
                disabled={isSpinning}
                className={`flex items-center justify-center h-[42px] w-[42px] rounded-md transition-all duration-200 ${
                  openMode === 'fast'
                    ? 'bg-amber-400/20 border border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                    : 'bg-web3-card/30 border border-gray-800 text-gray-600 hover:text-amber-300/70 hover:border-amber-400/30'
                } ${isSpinning ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <ChevronsRight size={18} />
              </button>
              <button
                onClick={() => !isSpinning && setOpenMode('instant')}
                disabled={isSpinning}
                className={`flex items-center justify-center h-[42px] w-[42px] rounded-md transition-all duration-200 ${
                  openMode === 'instant'
                    ? 'bg-web3-purple/20 border border-web3-purple text-web3-purple shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                    : 'bg-web3-card/30 border border-gray-800 text-gray-600 hover:text-web3-purple/70 hover:border-web3-purple/30'
                } ${isSpinning ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <Zap size={18} />
              </button>
            </div>
          </div>

          {flashMsg && (
            <div className="mt-3 text-[11px] text-center text-gray-300">{flashMsg}</div>
          )}
        </div>
      )}

      {/* PRE-SALE purchase panel */}
      {isSchedPhase && (
        <div className="max-w-lg mx-auto mb-6">
          <div className="rounded-2xl border border-cyan-400/25 bg-black/30 p-4 backdrop-blur-xl">
            <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">
              Pre-sale price
            </div>
            <div className="text-2xl font-black text-cyan-300">
              {formatDecimal(prePrice != null ? prePrice : openPrice)}{' '}
              <span className="text-sm text-gray-400">{currencyLabel(data.openCurrency)}</span>
            </div>
            {prePrice != null && prePrice < openPrice && (
              <div className="text-[11px] text-gray-500 mt-0.5">
                Regular price on launch:{' '}
                <span className="line-through">{formatDecimal(openPrice)}</span>{' '}
                {currencyLabel(data.openCurrency)}
              </div>
            )}

            <div className="my-3 h-px bg-white/[0.06]" />

            <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">
              Units to pre-purchase
            </div>
            <div className="flex items-center gap-1 flex-wrap mb-3">
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setBuyCount(n)}
                  className={`min-w-[44px] px-3 py-1.5 rounded-md text-xs font-bold border transition ${
                    buyCount === n
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-white/[0.03] text-gray-400 border-white/[0.06]'
                  }`}
                >
                  ×{n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={100}
                value={buyCount}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                  setBuyCount(n);
                }}
                className="w-16 px-2 py-1.5 rounded-md text-xs font-bold bg-white/[0.03] border border-white/[0.06] text-white text-center"
              />
            </div>

            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-gray-500">You pay</span>
              <span className="font-black text-cyan-300">
                {isTestCase ? 0 : formatDecimal(buyPayNow)} {currencyLabel(data.openCurrency)}
              </span>
            </div>

            {flashMsg && (
              <div className="mb-3 text-[11px] text-center rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 text-gray-300">
                {flashMsg}
              </div>
            )}

            <button
              onClick={handleBuyPre}
              disabled={busyBuy || (!isTestCase && buyPayNow > balance)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-black disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart size={16} />
              {busyBuy ? 'Buying…' : 'Pre-purchase'}
            </button>
            {!isTestCase && buyPayNow > balance && (
              <button
                onClick={() => onOpenTopUp(buyPayNow)}
                className="w-full mt-2 text-[10px] text-gray-400 hover:text-white"
              >
                Insufficient balance · Top up
              </button>
            )}
            {prePurchased > 0 && (
              <div className="mt-3 text-[11px] text-gray-400 text-center">
                You already have{' '}
                <span className="font-bold text-emerald-300">{prePurchased}</span> reserved open
                {prePurchased === 1 ? '' : 's'}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Possible drops grid — same shape as regular opening */}
      <div className={`max-w-5xl mx-auto ${isTelegramMiniApp ? 'mt-4' : 'mt-10'}`}>
        <div
          className={`flex items-center justify-center ${
            isTelegramMiniApp ? 'gap-2 mb-3 text-[10px]' : 'gap-4 mb-6 text-xs'
          } text-gray-400 uppercase tracking-widest`}
        >
          <div className="h-px w-12 bg-gray-700" />
          <span>Possible drops</span>
          <div className="h-px w-12 bg-gray-700" />
        </div>
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
            isTelegramMiniApp ? 'gap-2' : 'gap-4'
          }`}
        >
          {data.drops.map((d, idx) => (
            <ItemCard
              key={`${d.id}-${idx}`}
              item={dropToItem(d)}
              size="md"
              currencyPrefix=""
              compactContent={isTelegramMiniApp}
            />
          ))}
        </div>
      </div>

      {/* Minimal contextual footer: only non-obvious info. */}
      {(data.limitMode !== 'NONE' && data.limitRemaining != null) && (
        <div className="max-w-3xl mx-auto mt-4 text-center text-[11px] text-gray-400">
          {data.limitMode === 'BY_OPENS' ? 'Opens left: ' : 'Budget left: '}
          <span className="text-white font-bold">
            {formatDecimal(Number(data.limitRemaining))}
          </span>
        </div>
      )}

      {resultSummary && !isSpinning && (
        <div className="max-w-3xl mx-auto mt-4 text-[10px] text-center text-gray-500">
          Last open: {resultSummary.usedPrePurchase} free · paid{' '}
          {formatDecimal(resultSummary.pricePaid)}{' '}
          {currencyLabel(resultSummary.currency)}. Drops stacked to your{' '}
          <span className="text-white font-bold">Rewards</span> tab.
        </div>
      )}
    </div>
  );
};
