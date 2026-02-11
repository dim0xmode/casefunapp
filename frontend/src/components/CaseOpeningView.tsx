import React, { useState, useRef } from 'react';
import { Case, Item } from '../types';
import { ArrowLeft, Package, ChevronRight, ChevronsRight, Zap } from 'lucide-react';
import { CaseRoulette, SPIN_DURATION_MS } from './CaseRoulette';
import { ItemCard } from './ItemCard';
import { AdminActionButton } from './ui/AdminActionButton';
import { formatShortfallUp } from '../utils/number';

// Open Modes
type OpenMode = 'normal' | 'fast' | 'instant';
const OPEN_MODE_SPEEDS = {
  normal: 1,
  fast: 3,
  instant: 0
};

interface CaseOpeningViewProps {
  caseData: Case;
  onBack: () => void;
  onOpenCase: (caseId: string, count: number) => Promise<Item[]>;
  balance: number;
  onOpenTopUp: (prefillUsdt?: number) => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
  viewMode?: 'open' | 'stats';
}

export const CaseOpeningView: React.FC<CaseOpeningViewProps> = ({ caseData, onBack, onOpenCase, balance, onOpenTopUp, isAuthenticated, onOpenWalletConnect, isAdmin, viewMode = 'open' }) => {
  const formatAddress = (address?: string | null) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopyTokenAddress = async () => {
    const address = caseData.tokenAddress;
    if (!address) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      }
    } catch {
      // ignore clipboard errors
    }
  };

  const getRemainingTime = () => {
    if (!caseData.openDurationHours || !caseData.createdAt) return null;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    const msLeft = endAt - Date.now();
    if (msLeft <= 0) return 'Expired';
    const hours = Math.floor(msLeft / (60 * 60 * 1000));
    const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  const remainingTime = getRemainingTime();
  const isExpired = remainingTime === 'Expired';
  const isStatsView = viewMode === 'stats';

  const [isSpinning, setIsSpinning] = useState(false);
  const [openMode, setOpenMode] = useState<OpenMode>('normal');
  const [hasOpened, setHasOpened] = useState(false);
  const [multiOpen, setMultiOpen] = useState<number>(1);
  const [multiResults, setMultiResults] = useState<Item[]>([]);
  const [openingKey, setOpeningKey] = useState(0);
  const [currentRevealFrom, setCurrentRevealFrom] = useState(1);
  const prevOpenCountRef = useRef(1);

  const cost = caseData.price * multiOpen;
  const canAfford = balance >= cost;

  const handleSpin = async () => {
    if (isSpinning || isExpired || !canAfford || isStatsView) return;

    const prevCount = prevOpenCountRef.current;
    setCurrentRevealFrom(prevCount);

    setIsSpinning(true);
    setHasOpened(true);
    setOpeningKey(prev => prev + 1);

    try {
      const winners = await onOpenCase(caseData.id, multiOpen);
      setMultiResults(winners);
      prevOpenCountRef.current = multiOpen;

      const speedMultiplier = OPEN_MODE_SPEEDS[openMode] || 1;
      const totalDuration = openMode === 'instant' ? 200 : (SPIN_DURATION_MS / speedMultiplier) + 1200 + 200;
      
      setTimeout(() => {
        setIsSpinning(false);
      }, totalDuration);
    } catch (error) {
      setIsSpinning(false);
    }
  };

  return (
    <div className="w-full text-white px-6 py-12 relative">
      {/* Back Button */}
      <div className="max-w-7xl mx-auto mb-8">
        <button
          onClick={onBack}
          disabled={isSpinning}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-web3-card/50 border border-gray-800 hover:border-web3-accent/50 transition-all duration-300 text-gray-400 hover:text-white ${isSpinning ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <ArrowLeft size={20} />
          <span className="font-bold">Back to Cases</span>
        </button>
      </div>

      {/* Case Info Header */}
      <div className="max-w-7xl mx-auto mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-web3-accent/10 to-web3-purple/10 border border-web3-accent/30 text-web3-accent text-xs font-bold uppercase tracking-widest backdrop-blur-sm animate-fade-in">
          <Package size={14} />
          {caseData.name}
        </div>
        {caseData.openDurationHours && caseData.createdAt && (
          <div className="mt-3 text-xs uppercase tracking-widest text-gray-500">
            {isExpired ? 'Case closed' : `Ends in ${remainingTime}`}
          </div>
        )}
      </div>

      {isStatsView && (
        <div className="max-w-5xl mx-auto mb-8">
          <div className="bg-web3-card/50 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-xl">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">Case Statistics</div>
            {caseData.stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Opened</div>
                  <div className="text-lg font-black">{caseData.stats.totalOpenings}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Spent</div>
                  <div className="text-lg font-black">{caseData.stats.totalSpentUsdt.toFixed(2)} ₮</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Tokens From Opens</div>
                  <div className="text-lg font-black">{caseData.stats.totalTokenFromOpens.toFixed(2)}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Tokens From Upgrades</div>
                  <div className="text-lg font-black">{caseData.stats.totalTokenFromUpgrades.toFixed(2)}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Tokens From Battles</div>
                  <div className="text-lg font-black">{caseData.stats.totalTokenFromBattles.toFixed(2)}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Total Tokens</div>
                  <div className="text-lg font-black">{caseData.stats.totalTokenIssued.toFixed(2)}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Upgrades Used</div>
                  <div className="text-lg font-black">{caseData.stats.upgradesUsed}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Battles Used</div>
                  <div className="text-lg font-black">{caseData.stats.battlesUsed}</div>
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Actual RTU</div>
                  <div className="text-lg font-black">
                    {caseData.stats.actualRtu != null ? `${caseData.stats.actualRtu.toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs uppercase tracking-widest text-gray-500">No statistics yet</div>
            )}
            {isExpired && caseData.tokenAddress && (
              <div className="mt-6 bg-black/30 border border-white/[0.08] rounded-xl p-4 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Token Address</div>
                  <div className="text-sm font-bold text-white">{formatAddress(caseData.tokenAddress)}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyTokenAddress}
                  className="px-3 py-2 rounded-lg border border-white/[0.12] text-gray-300 hover:text-white hover:border-web3-accent/40 transition"
                >
                  Copy
                </button>
              </div>
            )}
            {caseData.stats?.topHolders && caseData.stats.topHolders.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Top 3 Holders</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {caseData.stats.topHolders.map((holder) => (
                    <div key={holder.userId} className="bg-black/30 border border-white/[0.08] rounded-xl p-3 flex items-center justify-between text-xs">
                      <span className="truncate">{holder.username}</span>
                      <span className="text-gray-200">{holder.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!isStatsView && (
      <div className="max-w-5xl mx-auto mb-8">
        {multiResults.length > 0 ? (
          multiResults.map((result, idx) => (
              <CaseRoulette
              key={`${openingKey}-${idx}`}
              caseData={caseData}
              winner={result}
              openMode={openMode}
              index={idx}
              skipReveal={idx < currentRevealFrom}
            />
          ))
        ) : (
            <CaseRoulette
            key="placeholder"
            caseData={caseData}
              winner={null}
            openMode={openMode}
            index={0}
            skipReveal={false}
          />
        )}
      </div>
      )}

      {!isStatsView && (
      <div className="max-w-7xl mx-auto">
        {/* Multi-Open Selector - по центру рулетки */}
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-1 bg-web3-card/50 p-1 rounded-lg border border-gray-700/50 backdrop-blur-sm h-[42px]">
            {[1, 2, 3, 4, 5].map((count) => (
              <button
                key={count}
                onClick={() => !isSpinning && setMultiOpen(count)}
                disabled={isSpinning}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
                  multiOpen === count
                    ? 'bg-web3-accent/20 border border-web3-accent text-web3-accent shadow-[0_0_8px_rgba(102,252,241,0.3)]'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                } ${isSpinning ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                x{count}
              </button>
            ))}
          </div>
        </div>

        {/* Open Button and Side Controls */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 max-w-6xl mx-auto">
          {/* Left Side: Price and RTU */}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-web3-card/50 border border-gray-700/50 backdrop-blur-sm h-[42px]">
              <span className="text-xs font-bold text-gray-300">{cost} ₮</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-web3-card/50 border border-gray-700/50 backdrop-blur-sm h-[42px]">
              <span className="text-xs font-bold text-gray-400">RTU</span>
              <span className="text-xs font-bold text-gray-300">{caseData.rtu}%</span>
            </div>
          </div>

          {/* Center: Open Button */}
          <AdminActionButton
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            balance={balance}
            cost={cost}
            onConnect={onOpenWalletConnect}
            onTopUp={onOpenTopUp}
            onAction={handleSpin}
            readyLabel={
              hasOpened ? 'Open Again' : 'Open'
            }
            topUpLabel={(shortfallValue) => `Need ${formatShortfallUp(shortfallValue)} ₮ more • Top up`}
            labelOverride={isExpired ? 'Closed' : isSpinning ? 'Opening...' : undefined}
            forceLabel={Boolean(isExpired || isSpinning)}
            disabled={isSpinning || isExpired}
            showPing={!isSpinning && canAfford && !isExpired}
            className="group px-8 py-3 text-base font-black rounded-xl overflow-hidden transform transition-all duration-300"
          />

          {/* Right Side: Open Mode Toggle */}
          <div className="flex items-center justify-start gap-1">
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
                  ? 'bg-web3-accent/20 border border-web3-accent text-web3-accent shadow-[0_0_12px_rgba(102,252,241,0.3)]'
                  : 'bg-web3-card/30 border border-gray-800 text-gray-600 hover:text-web3-accent/70 hover:border-web3-accent/30'
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
        </div>
      )}

      {/* Possible Items List */}
      <div className="max-w-5xl mx-auto mt-10">
        <div className="flex items-center justify-center gap-4 mb-6 text-gray-400 text-xs uppercase tracking-widest">
          <div className="h-px w-12 bg-gray-700"></div>
          <span>Possible Items</span>
          <div className="h-px w-12 bg-gray-700"></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {caseData.possibleDrops.map((item, idx) => (
            <ItemCard key={`${item.id}-${idx}`} item={item} size="md" currencyPrefix="$" />
          ))}
        </div>
      </div>
    </div>
  );
};
