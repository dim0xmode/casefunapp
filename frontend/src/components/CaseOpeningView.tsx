import React, { useState, useRef } from 'react';
import { Case, Item } from '../types';
import { ArrowLeft, Package, Sparkles, ChevronRight, ChevronsRight, Zap } from 'lucide-react';
import { CaseRoulette, SPIN_DURATION_MS } from './CaseRoulette';
import { ItemCard } from './ItemCard';

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
  onOpenTopUp: () => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
}

export const CaseOpeningView: React.FC<CaseOpeningViewProps> = ({ caseData, onBack, onOpenCase, balance, onOpenTopUp, isAuthenticated, onOpenWalletConnect, isAdmin }) => {
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
  const shortfall = Math.max(0, cost - balance);

  const handleSpin = async () => {
    if (isSpinning || isExpired || !canAfford || !isAdmin) return;

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

      {/* Roulettes Container */}
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
          // Показываем рулетку сразу, даже без winner
          <CaseRoulette
            key="placeholder"
            caseData={caseData}
            winner={null} // Нет winner, просто показываем заполненную рулетку
            openMode={openMode}
            index={0}
            skipReveal={false}
          />
        )}
      </div>

      {/* Controls */}
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
          <button
            onClick={
              !isAuthenticated
                ? onOpenWalletConnect
                : !isAdmin
                  ? undefined
                  : canAfford
                    ? handleSpin
                    : onOpenTopUp
            }
            disabled={isSpinning || isExpired || (isAuthenticated && !isAdmin)}
            className={`group relative px-8 py-3 text-base font-black rounded-xl overflow-hidden transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
              !isAuthenticated
                ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105 hover:shadow-[0_0_40px_rgba(102,252,241,0.6)]'
                : isAdmin && canAfford
                  ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105 hover:shadow-[0_0_40px_rgba(102,252,241,0.6)]'
                  : 'bg-gray-700/80 text-gray-400 border border-red-500/40 hover:border-red-500/60'
            }`}
          >
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
            <span className="relative flex items-center gap-2 uppercase tracking-wide">
              {isExpired ? (
                'Closed'
              ) : isSpinning ? (
                'Opening...'
              ) : !isAuthenticated ? (
                <>Connect Wallet</>
              ) : !isAdmin ? (
                <>Admins only</>
              ) : !canAfford ? (
                <>
                  Need {shortfall} ₮ more • Top up
                </>
              ) : hasOpened ? (
                <>Open Again</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Open
                </>
              )}
            </span>
            {!isSpinning && canAfford && (
              <span className="absolute -inset-2 rounded-xl bg-web3-accent/30 animate-ping opacity-75"></span>
            )}
          </button>
          {isAuthenticated && !isAdmin && (
            <div className="col-span-3 mt-2 text-center text-[10px] uppercase tracking-widest text-gray-500">
              Only admins can open cases
            </div>
          )}

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
