import React, { useEffect, useMemo, useState } from 'react';
import { Item, Case, Rarity } from '../types';
import { Sparkles } from 'lucide-react';

// Rarity colors mapping
const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#10B981',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

// Roulette Constants
const CARD_WIDTH = 120;
const MARGIN_X_PX = 2;
const TOTAL_CARD_SPACE = CARD_WIDTH + (MARGIN_X_PX * 2);
const WINNER_INDEX = 60;
export const SPIN_DURATION_MS = 7000;

type OpenMode = 'normal' | 'fast' | 'instant';
const OPEN_MODE_SPEEDS = {
  normal: 1,
  fast: 3,
  instant: 0
};

interface CaseRouletteProps {
  caseData: Case;
  winner: Item | null;
  openMode: OpenMode;
  index: number;
  skipReveal?: boolean;
}

export const CaseRoulette: React.FC<CaseRouletteProps> = ({ caseData, winner, openMode, index, skipReveal }) => {
  const BASE_STRIP_LENGTH = 80;
  const INITIAL_STRIP_LENGTH = 20;
  const START_OFFSET = -((TOTAL_CARD_SPACE * 4) + MARGIN_X_PX + (CARD_WIDTH / 2));

  const placeholderItem: Item = useMemo(() => ({
    id: `placeholder-${caseData.id}`,
    name: 'Mystery',
    value: 0,
    currency: caseData.currency,
    rarity: Rarity.COMMON,
    image: '❔',
    color: RARITY_COLORS[Rarity.COMMON],
  }), [caseData]);

  const [strip, setStrip] = useState<Item[]>([]);
  const [offset, setOffset] = useState(START_OFFSET);
  const [transitionStyle, setTransitionStyle] = useState('none');
  const [showResult, setShowResult] = useState(false);
  const [isRevealed, setIsRevealed] = useState(skipReveal ? true : false);

  const getSourceItems = () => {
    const drops = caseData?.possibleDrops ?? [];
    return drops.length > 0 ? drops : [placeholderItem];
  };

  const buildStrip = (length: number, winningItem?: Item | null) => {
    const source = getSourceItems();
    const nextStrip: Item[] = [];
    for (let i = 0; i < length; i++) {
      if (winningItem && i === WINNER_INDEX) {
        nextStrip.push(winningItem);
      } else {
        nextStrip.push(source[Math.floor(Math.random() * source.length)]);
      }
    }
    return nextStrip;
  };

  const renderTokenLogo = (value: string, size: 'sm' | 'lg' = 'sm') => {
    if (!value) return <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>;
    if (value.startsWith('http')) {
      const dims = size === 'lg' ? 'w-16 h-16' : 'w-10 h-10';
      return <img src={value} alt="token logo" className={`${dims} object-contain`} />;
    }
    return <span className={size === 'lg' ? 'text-5xl' : 'text-3xl'}>{value}</span>;
  };

  // Reveal animation
  useEffect(() => {
    if (!skipReveal) {
      const timeoutId = setTimeout(() => {
        setIsRevealed(true);
      }, 100 + index * 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [skipReveal, index]);

  useEffect(() => {
    if (!winner) {
      if (strip.length === 0) {
        setStrip(buildStrip(INITIAL_STRIP_LENGTH));
        setOffset(START_OFFSET);
      }
      setShowResult(false);
      setTransitionStyle('none');
      return;
    }

    if (showResult) return;

    if (openMode === 'instant') {
      const fastStrip = buildStrip(7, winner);
      const centerOffset = -((3 * TOTAL_CARD_SPACE) + MARGIN_X_PX + (CARD_WIDTH / 2));
      setStrip(fastStrip);
      setOffset(centerOffset);
      setTransitionStyle('none');
      setShowResult(true);
      return;
    }

    const newStrip = buildStrip(BASE_STRIP_LENGTH, winner);
    setOffset(START_OFFSET);
    setTransitionStyle('none');
    setShowResult(false);

    const speedMultiplier = OPEN_MODE_SPEEDS[openMode] || 1;
    const duration = SPIN_DURATION_MS / speedMultiplier;

    let rafId = 0;
    let rafId2 = 0;

    rafId = requestAnimationFrame(() => {
      setStrip(newStrip);

      rafId2 = requestAnimationFrame(() => {
        const centerPositionInStrip = (WINNER_INDEX * TOTAL_CARD_SPACE) + MARGIN_X_PX + (CARD_WIDTH / 2);
        const finalOffset = -centerPositionInStrip;

        const driftDirection = Math.random() > 0.5 ? 1 : -1;
        const driftAmount = Math.random() * 40 + 20;
        const driftOffset = finalOffset + (driftDirection * driftAmount);

        setTransitionStyle(`transform ${duration}ms cubic-bezier(0.1, 1.05, 0.2, 1)`);
        setOffset(driftOffset);

        // Stage 2: slowdown near card edge (ambiguity) without reverse movement
        setTimeout(() => {
          const winnerCardStart = WINNER_INDEX * TOTAL_CARD_SPACE;
          const winnerCardEnd = winnerCardStart + TOTAL_CARD_SPACE;
          const edgeOffsetStart = -(winnerCardStart + MARGIN_X_PX);
          const edgeOffsetEnd = -(winnerCardEnd - MARGIN_X_PX);
          const directionToFinal = Math.sign(finalOffset - driftOffset) || 1;

          const minBound = Math.min(driftOffset, finalOffset) + 1;
          const maxBound = Math.max(driftOffset, finalOffset) - 1;
          const isBetween = (value: number) => value > minBound && value < maxBound;

          // Choose a seam position that lies between drift and final (no reverse)
          let baseEdge = isBetween(edgeOffsetStart)
            ? edgeOffsetStart
            : isBetween(edgeOffsetEnd)
              ? edgeOffsetEnd
              : finalOffset - (directionToFinal * 2);

          // Small overrun keeps "almost" rolling feeling
          const maxOverrun = (TOTAL_CARD_SPACE / 2) - 3;
          const deepOverrun = Math.min(TOTAL_CARD_SPACE * (0.18 + Math.random() * 0.04), maxOverrun);
          const smallOverrun = 1 + Math.random() * 1.5; // 1-2.5px
          const overrun = Math.random() < 0.05 ? deepOverrun : smallOverrun;

          let edgeOffset = baseEdge + (directionToFinal * overrun);
          edgeOffset = Math.min(Math.max(edgeOffset, minBound), maxBound);

          // Keep edge stop just before center
          if (directionToFinal > 0 && edgeOffset >= finalOffset) {
            edgeOffset = finalOffset - 1;
          }
          if (directionToFinal < 0 && edgeOffset <= finalOffset) {
            edgeOffset = finalOffset + 1;
          }

          setTransitionStyle('transform 720ms cubic-bezier(0.2, 0.9, 0.2, 1)');
          setOffset(edgeOffset);

          // Stage 3: brief pause, then gentle magnet to center
          setTimeout(() => {
            setTransitionStyle('transform 420ms cubic-bezier(0.25, 0.85, 0.25, 1)');
            setOffset(finalOffset);
          }, 220);
        }, duration);

        setTimeout(() => {
          setShowResult(true);
        }, duration + 720 + 220 + 200);
      });
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (rafId2) cancelAnimationFrame(rafId2);
    };
  }, [winner, openMode, showResult, strip.length, START_OFFSET]);

  return (
    <div className="relative w-full h-[200px] mb-4 flex justify-center">
      <div 
        className="relative h-[200px] bg-gradient-to-br from-web3-card/30 to-web3-card/10 rounded-2xl border border-gray-800/50 overflow-hidden backdrop-blur-sm transition-all duration-500 ease-out"
        style={{
          width: isRevealed ? '100%' : `${CARD_WIDTH + 32}px`,
          maxWidth: '1024px'
        }}
      >
        <div 
          className="absolute inset-0 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)'
          }}
        >
          <div 
            className="flex items-center absolute left-0 h-full pl-[50%]"
            style={{
              transform: `translateX(${offset}px)`,
              transition: transitionStyle,
              willChange: 'transform'
            }}
          >
            {strip.map((item, stripIndex) => (
              <div
                key={`${item.id}-${stripIndex}`}
                className="flex-shrink-0 flex flex-col items-center justify-center h-[140px] rounded-xl border-2"
                style={{
                  width: `${CARD_WIDTH}px`,
                  marginLeft: `${MARGIN_X_PX}px`,
                  marginRight: `${MARGIN_X_PX}px`,
                  borderColor: RARITY_COLORS[item.rarity],
                  backgroundColor: 'rgba(17, 24, 39, 0.8)'
                }}
              >
                <div className="mb-2">{renderTokenLogo(item.image)}</div>
                <div className="text-sm font-black text-white">{item.value}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-400">${item.currency}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Pointer */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 pointer-events-none z-20">
          <div className="absolute top-2 left-1/2 -translate-x-1/2" style={{ filter: 'drop-shadow(0 0 8px rgba(102, 252, 241, 0.8))' }}>
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] border-t-web3-accent"></div>
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2" style={{ filter: 'drop-shadow(0 0 8px rgba(102, 252, 241, 0.8))' }}>
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-web3-accent"></div>
          </div>
        </div>

        {/* Center Highlight Line */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-web3-accent/30 shadow-[0_0_12px_rgba(102,252,241,0.5)] pointer-events-none z-10"></div>

        {/* Result Overlay */}
        {showResult && winner && (
          <div className={`absolute inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm ${openMode !== 'instant' ? 'animate-fade-in' : ''}`}>
            <div className={`relative text-center p-4 bg-gradient-to-br from-web3-card/95 to-black/95 rounded-xl border-2 border-web3-accent shadow-[0_0_40px_rgba(102,252,241,0.6)] backdrop-blur-md overflow-visible ${openMode !== 'instant' ? 'animate-scale-in' : ''}`}>
              <div className="absolute -top-2 -right-2 text-web3-accent animate-ping">
                <Sparkles size={16} />
              </div>
              <div className="absolute -bottom-2 -left-2 text-web3-success animate-ping" style={{ animationDelay: '0.5s' }}>
                <Sparkles size={16} />
              </div>
              
              <div className={`mb-2 flex items-center justify-center ${openMode !== 'instant' ? 'animate-bounce-in' : ''}`}>
                {renderTokenLogo(winner.image, 'lg')}
              </div>
              <div className={`flex items-center justify-center gap-2 bg-gradient-to-r from-web3-accent/30 to-web3-success/30 px-4 py-1.5 rounded-lg border border-web3-accent/40 ${openMode !== 'instant' ? 'animate-fade-in' : ''}`} style={openMode !== 'instant' ? { animationDelay: '0.2s', animationFillMode: 'both' } : {}}>
                <span className="text-lg font-black text-white">{winner.value} ${winner.currency}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
