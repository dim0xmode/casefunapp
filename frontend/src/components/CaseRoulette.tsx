import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Item, Case, Rarity } from '../types';
import { Sparkles } from 'lucide-react';
import { ItemCard } from './ItemCard';
import { ImageWithMeta } from './ui/ImageWithMeta';
import { playDullClick, playSoftWin } from '../utils/audio';

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
  initiallyRevealed?: boolean;
  spinToken?: number;
  soundEnabled?: boolean;
  clickSoundEnabled?: boolean;
  resultSoundEnabled?: boolean;
  clickVolume?: number;
}

export const CaseRoulette: React.FC<CaseRouletteProps> = ({
  caseData,
  winner,
  openMode,
  index,
  skipReveal,
  initiallyRevealed = false,
  spinToken = 0,
  soundEnabled = true,
  clickSoundEnabled,
  resultSoundEnabled,
  clickVolume = 0.16,
}) => {
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

  const [strip, setStrip] = useState<Item[]>(() => buildStrip(INITIAL_STRIP_LENGTH));
  const [offset, setOffset] = useState(START_OFFSET);
  const [transitionStyle, setTransitionStyle] = useState('none');
  const [showResult, setShowResult] = useState(false);
  const [isRevealed, setIsRevealed] = useState(skipReveal ? true : initiallyRevealed);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const spinAudioActiveRef = useRef(false);
  const spinAudioStartedAtRef = useRef(0);
  const spinAudioDurationMsRef = useRef(0);

  const canPlayClickSound = soundEnabled && (clickSoundEnabled ?? soundEnabled);
  const canPlayResultSound = soundEnabled && (resultSoundEnabled ?? soundEnabled);

  const renderTokenLogo = (item: Item | null, size: 'sm' | 'lg' = 'sm') => {
    const value = item?.image || '';
    if (!value) return <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>;
    const isImage = value.startsWith('http') || value.startsWith('/') || value.startsWith('data:');
    if (isImage) {
      const dims = size === 'lg' ? 'w-16 h-16' : 'w-10 h-10';
      return (
        <ImageWithMeta
          src={value}
          meta={item?.imageMeta || caseData.imageMeta}
          className={`${dims} rounded-full`}
          imgClassName="w-full h-full"
        />
      );
    }
    return <span className={size === 'lg' ? 'text-5xl' : 'text-3xl'}>{value}</span>;
  };

  // Reveal animation
  useEffect(() => {
    if (!skipReveal && !initiallyRevealed) {
      const timeoutId = setTimeout(() => {
        setIsRevealed(true);
      }, 100 + index * 100);
      return () => clearTimeout(timeoutId);
    }
    if (initiallyRevealed) {
      setIsRevealed(true);
    }
    return undefined;
  }, [skipReveal, index, initiallyRevealed]);

  useEffect(() => {
    if (!winner) {
      setStrip((prev) => (prev.length ? prev : buildStrip(INITIAL_STRIP_LENGTH)));
      setOffset(START_OFFSET);
      setShowResult(false);
      setTransitionStyle('none');
      return;
    }

    if (openMode === 'instant') {
      const fastStrip = buildStrip(7, winner);
      const centerOffset = -((3 * TOTAL_CARD_SPACE) + MARGIN_X_PX + (CARD_WIDTH / 2));
      setStrip(fastStrip);
      setOffset(centerOffset);
      setTransitionStyle('none');
      if (canPlayResultSound && !skipReveal) {
        const delay = Math.min(140, index * 35);
        window.setTimeout(() => playSoftWin(), delay);
      }
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
    const timeoutIds: number[] = [];

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
        if (canPlayClickSound) {
          spinAudioActiveRef.current = true;
          spinAudioStartedAtRef.current = Date.now();
          spinAudioDurationMsRef.current = duration + 720 + 220 + 420;
        }

        // Stage 2: slowdown near card edge (ambiguity) without reverse movement
        const stage2Timeout = window.setTimeout(() => {
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
          const stage3Timeout = window.setTimeout(() => {
            setTransitionStyle('transform 420ms cubic-bezier(0.25, 0.85, 0.25, 1)');
            setOffset(finalOffset);
          }, 220);
          timeoutIds.push(stage3Timeout);
        }, duration);
        timeoutIds.push(stage2Timeout);

        const resultTimeout = window.setTimeout(() => {
          if (canPlayResultSound && !skipReveal) {
            const delay = Math.min(140, index * 35);
            window.setTimeout(() => playSoftWin(), delay);
          }
          setShowResult(true);
        }, duration + 720 + 220 + 200);
        timeoutIds.push(resultTimeout);
      });
    });

    return () => {
      spinAudioActiveRef.current = false;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      if (rafId) cancelAnimationFrame(rafId);
      if (rafId2) cancelAnimationFrame(rafId2);
    };
  }, [winner, START_OFFSET, canPlayClickSound, canPlayResultSound, skipReveal, index, spinToken]);

  useEffect(() => {
    if (!canPlayClickSound) return;
    let frameId = 0;
    let lastSlot = Number.NaN;
    let lastClickAt = 0;

    const readTranslateX = () => {
      const node = stripRef.current;
      if (!node) return null;
      const transform = window.getComputedStyle(node).transform;
      if (!transform || transform === 'none') return 0;
      try {
        const matrix = new DOMMatrixReadOnly(transform);
        return matrix.m41;
      } catch {
        const match = transform.match(/matrix\(([^)]+)\)/);
        if (!match) return 0;
        const parts = match[1].split(',');
        const tx = Number(parts[4] || 0);
        return Number.isFinite(tx) ? tx : 0;
      }
    };

    const tick = () => {
      if (spinAudioActiveRef.current) {
        const tx = readTranslateX();
        if (tx !== null) {
          const slot = Math.floor((-tx) / TOTAL_CARD_SPACE);
          const now = performance.now();
          if (slot !== lastSlot && now - lastClickAt > 26) {
            playDullClick(clickVolume * 0.9);
            lastSlot = slot;
            lastClickAt = now;
          }
        }
        const elapsed = Date.now() - spinAudioStartedAtRef.current;
        if (elapsed >= spinAudioDurationMsRef.current) {
          spinAudioActiveRef.current = false;
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [canPlayClickSound, clickVolume]);

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
            ref={stripRef}
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
                className="flex-shrink-0 h-[140px]"
                style={{
                  width: `${CARD_WIDTH}px`,
                  marginLeft: `${MARGIN_X_PX}px`,
                  marginRight: `${MARGIN_X_PX}px`,
                }}
              >
                <ItemCard
                  item={item}
                  size="sm"
                  className="w-full h-full"
                  currencyPrefix="$"
                />
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
                {renderTokenLogo(winner, 'lg')}
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
