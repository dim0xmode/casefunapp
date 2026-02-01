import React, { useState, useEffect, useMemo } from 'react';
import { Item, Rarity } from '../types';
import { TrendingUp, ArrowUp, ArrowDown, Settings2, Package, Sparkles } from 'lucide-react';
import { ItemCard } from './ItemCard';

const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#10B981',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

interface UpgradeViewProps {
  inventory: Item[];
  onUpgrade: (originalItem: Item, multiplier: number) => Promise<{ success: boolean; targetValue: number }>;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
}

export const UpgradeView: React.FC<UpgradeViewProps> = ({ inventory, onUpgrade, isAuthenticated, onOpenWalletConnect }) => {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [displayItem, setDisplayItem] = useState<Item | null>(null);
  const [lastResult, setLastResult] = useState<{ item: Item; value: number; success: boolean } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<number>(2.0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [upgradeResult, setUpgradeResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sortBy, setSortBy] = useState<'price' | 'alpha'>('alpha');
  const [fastUpgrade, setFastUpgrade] = useState(false);

  // Calculations
  const targetValue = selectedItem ? Math.floor(selectedItem.value * multiplier) : 0;
  const displayTargetValue = displayItem ? Math.floor(displayItem.value * multiplier) : 0;
  const rawChance = useMemo(() => {
    return (1 / multiplier) * 100;
  }, [multiplier]);

  const winChance = useMemo(() => {
    return Math.min(75, Math.max(1, rawChance));
  }, [rawChance]);

  const isUpgradeBlocked = rawChance > 90;

  // Sort Inventory
  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => {
      if (sortBy === 'alpha') {
        const keyA = (a.currency || a.name || '').toLowerCase();
        const keyB = (b.currency || b.name || '').toLowerCase();
        const cmp = keyA.localeCompare(keyB, undefined, { sensitivity: 'base' });
        if (cmp !== 0) return sortOrder === 'asc' ? cmp : -cmp;
        // Always sort by value descending within same letter
        return b.value - a.value;
      }
      return sortOrder === 'asc' ? a.value - b.value : b.value - a.value;
    });
  }, [inventory, sortOrder, sortBy]);

  // SVG Geometry
  const RADIUS = 120;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE - (winChance / 100) * CIRCUMFERENCE;

  const handleRoll = async () => {
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    if (!selectedItem || isSpinning || isUpgradeBlocked) return;

    setIsSpinning(true);

    let isSuccess = false;
    let finalTargetValue = targetValue;

    try {
      const result = await onUpgrade(selectedItem, multiplier);
      isSuccess = result.success;
      finalTargetValue = result.targetValue || targetValue;
    } catch (error) {
      setIsSpinning(false);
      return;
    }

    // Calculate Landing Angle
    const degreesSpan = (winChance / 100) * 360;
    const startAngle = 0;
    const endAngle = degreesSpan;

    let targetAngle = 0;

    if (isSuccess) {
      targetAngle = startAngle + (Math.random() * degreesSpan);
    } else {
      const remainingSpan = 360 - degreesSpan;
      targetAngle = endAngle + (Math.random() * remainingSpan);
    }

    // Add Rotations
    const spinPadding = fastUpgrade ? 0 : 360 * 5;
    const currentVisual = rotation % 360;
    
    let distanceToTarget = targetAngle - currentVisual;
    if (distanceToTarget < 0) {
      distanceToTarget += 360;
    }
    
    const finalRotation = rotation + distanceToTarget + spinPadding;
    setRotation(finalRotation);

    // Animation End Handling
    const duration = fastUpgrade ? 300 : 5000;
    const resultDelay = fastUpgrade ? 350 : 5000;
    const resetDelay = fastUpgrade ? 1000 : 1500;

    setTimeout(() => {
      setUpgradeResult(isSuccess ? 'success' : 'fail');
      setIsSpinning(false);
      
      setTimeout(() => {
        setLastResult({
          item: selectedItem,
          value: isSuccess ? finalTargetValue : selectedItem.value,
          success: isSuccess,
        });
        setSelectedItem(null);
        setSelectedKey(null);
      }, resetDelay);
    }, resultDelay);
  };

  const handleSelectItem = (item: Item, key: string) => {
    if (isSpinning) return;
    if (selectedKey === key) {
      setSelectedItem(null);
      setDisplayItem(null);
      setUpgradeResult('idle');
      setRotation(0);
      setSelectedKey(null);
      return;
    }
    setSelectedItem(item);
    setDisplayItem(item);
    setLastResult(null);
    setUpgradeResult('idle');
    setRotation(0);
    setSelectedKey(key);
  };

  const CoinVisual = ({ item, size = 'md' }: { item: Item, size?: 'sm'|'md'|'lg' }) => {
    const dims = size === 'lg' ? 'w-24 h-24 text-4xl' : size === 'md' ? 'w-16 h-16 text-2xl' : 'w-12 h-12 text-xl';
    return (
      <div
        className={`${dims} rounded-full bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 border-2 flex items-center justify-center shadow-[0_0_18px_rgba(102,252,241,0.12)] relative z-10`}
        style={{ borderColor: item.color }}
      >
        <span>{item.image}</span>
      </div>
    );
  };

  const chanceLabel =
    winChance >= 60 ? 'High chance'
    : winChance >= 40 ? 'Medium chance'
    : winChance >= 20 ? 'Low chance'
    : 'Very low chance';

  return (
    <div className="flex flex-col min-h-screen text-white relative">

      {/* Top Section: The Upgrade Machine */}
      <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center relative py-12 bg-black/20 backdrop-blur-2xl border-b border-white/[0.12]">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16 z-10 w-full max-w-6xl px-8">
          
          {/* Left: Selected Item */}
          <div className="flex flex-col gap-6 w-full max-w-sm flex-1">
            <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl h-[420px] flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b border-white/[0.06] pb-2">
                <span className="text-gray-400 font-bold uppercase text-xs tracking-wider">
                  Selected Item
                </span>
              </div>

              {selectedItem ? (
                <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                  <ItemCard item={selectedItem} size="lg" className="w-full h-full max-h-[280px]" currencyPrefix="$" />
                </div>
              ) : (
                <div className="text-center text-gray-600 py-10 flex-1 flex flex-col items-center justify-center">
                  <TrendingUp size={36} className="mx-auto mb-3 opacity-50" />
                  <div className="text-xs font-bold uppercase tracking-wider">Select Item</div>
                </div>
              )}
            </div>
          </div>

          {/* Center: The Circle + Action */}
          <div className="flex flex-col items-center justify-center gap-6 flex-shrink-0">
            <div className="relative w-[220px] h-[220px] lg:w-[280px] lg:h-[280px] flex items-center justify-center mt-6">
              
              {/* SVG Rings */}
              <svg className="absolute inset-0 w-full h-full transform -rotate-90 drop-shadow-2xl" viewBox="0 0 260 260">
                {/* Background Track */}
                <circle 
                  cx="130" cy="130" r={RADIUS} 
                  fill="transparent" 
                  stroke="#1F2833" 
                  strokeWidth="12" 
                />
                {/* Win Zone (Success) - Green */}
                {displayItem && (
                  <circle 
                    cx="130" cy="130" r={RADIUS} 
                    fill="transparent" 
                    stroke="#10B981" 
                    strokeWidth="12"
                    strokeLinecap="butt"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500 ease-out"
                    style={{ filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.4))' }}
                  />
                )}
              </svg>
              
              <div className="absolute inset-0 rounded-full border border-white/[0.08]"></div>

              {/* The Pointer */}
              <div 
                className="absolute inset-0 pointer-events-none z-20"
                style={{ 
                  transform: `rotate(${rotation}deg)`,
                  transition: isSpinning 
                    ? `transform ${fastUpgrade ? '0.3s' : '5s'} cubic-bezier(0.55, 0.05, 0.25, 1)` 
                    : 'none'
                }}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 filter drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                  <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[24px] border-t-white"></div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-white/20 rounded-full blur-sm"></div>
                </div>
              </div>

              {/* Central Content */}
              <div
                className="absolute inset-8 rounded-full border border-white/[0.08] flex flex-col items-center justify-center z-10 overflow-hidden"
                style={{
                  backgroundColor: 'rgba(11, 12, 16, 0.28)',
                  WebkitBackdropFilter: 'blur(28px) saturate(180%) brightness(120%)',
                  backdropFilter: 'blur(28px) saturate(180%) brightness(120%)',
                }}
              >
                {displayItem && upgradeResult === 'idle' ? (
                  <div className="flex flex-col items-center transition-all duration-300">
                    <div className="text-3xl font-black tracking-tight text-white font-sans">
                      {winChance.toFixed(2)}%
                    </div>
                    <div className={`mt-2 text-xs font-bold uppercase tracking-[0.25em] ${winChance < 20 ? 'text-web3-danger' : 'text-web3-success'}`}>
                      {chanceLabel}
                    </div>
                  </div>
                ) : null}
                
                {/* Result Overlay */}
                {upgradeResult !== 'idle' && (
                  <div className={`absolute inset-0 flex items-center justify-center backdrop-blur-sm bg-black/40 z-30 animate-fade-in`}>
                    <div className="relative flex flex-col items-center gap-2">
                      {upgradeResult === 'success' ? (
                        <>
                          <div className="absolute -top-6 -left-6 text-web3-accent animate-ping">
                            <Sparkles size={16} />
                          </div>
                          <div className="absolute -top-6 -right-6 text-web3-success animate-ping" style={{ animationDelay: '0.3s' }}>
                            <Sparkles size={16} />
                          </div>
                          <div className="absolute -bottom-6 -left-6 text-web3-purple animate-ping" style={{ animationDelay: '0.6s' }}>
                            <Sparkles size={16} />
                          </div>
                          <div className={`text-2xl font-black uppercase tracking-[0.15em] text-web3-success drop-shadow-[0_0_16px_rgba(16,185,129,0.6)]`}>
                            Congrats!
                          </div>
                          <div className="text-xs uppercase tracking-[0.25em] text-gray-300">
                            Upgrade success
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-web3-danger/5 to-transparent opacity-60 animate-fade-in"></div>
                          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {Array.from({ length: 8 }).map((_, idx) => (
                              <span
                                key={`rain-${idx}`}
                                className="upgrade-rain"
                                style={{
                                  left: `${8 + idx * 11}%`,
                                  animationDelay: `${idx * 0.12}s`,
                                  animationDuration: `${1.2 + (idx % 3) * 0.2}s`,
                                }}
                              />
                            ))}
                          </div>
                          <div className={`text-2xl font-black uppercase tracking-[0.15em] text-web3-danger drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]`}>
                            Try again
                          </div>
                          <div className="text-xs uppercase tracking-[0.25em] text-gray-300">
                            Upgrade failed
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full max-w-xs text-center">
              <button 
                disabled={isSpinning || isUpgradeBlocked || (!selectedItem && isAuthenticated)} 
                onClick={handleRoll}
                className={`w-full py-3 text-lg tracking-widest uppercase shadow-[0_0_20px_rgba(102,252,241,0.18)] font-black rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(102,252,241,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${isSpinning ? 'opacity-50' : 'animate-pulse-fast'}`}
              >
                {isSpinning ? 'ROLLING...' : !isAuthenticated ? 'CONNECT WALLET' : 'UPGRADE'}
              </button>

              <button 
                onClick={() => !isSpinning && setFastUpgrade(!fastUpgrade)}
                disabled={isSpinning}
                className={`mt-3 w-full text-xs font-bold uppercase tracking-wider rounded-full px-4 py-2 border transition ${
                  fastUpgrade
                    ? 'bg-web3-accent/20 text-web3-accent border-web3-accent'
                    : 'bg-white/[0.03] text-gray-400 border-white/[0.08] hover:text-white'
                } ${isSpinning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {fastUpgrade ? 'Fast Mode On' : 'Fast Mode Off'}
              </button>
            </div>
          </div>

          {/* Right: Result + Settings */}
          <div className="w-full max-w-sm flex flex-col gap-6 flex-1">
            <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl h-[420px] flex flex-col">
              <div className="text-xs text-gray-400 uppercase tracking-widest mb-3">Result</div>
              {lastResult ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <ItemCard
                    item={{
                      ...lastResult.item,
                      value: lastResult.value,
                    }}
                    size="lg"
                    className="w-full h-full max-h-[280px]"
                    status={lastResult.success ? 'normal' : 'burnt'}
                    currencyPrefix="$"
                  />
                </div>
              ) : displayItem ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <ItemCard
                    item={{
                      ...displayItem,
                      value: displayTargetValue,
                    }}
                    size="lg"
                    className="w-full h-full max-h-[280px] opacity-80"
                    currencyPrefix="$"
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600">Select item to preview</div>
              )}

              <div className="mt-6 border-t border-white/[0.06] pt-4">
                <div className="flex justify-between items-center mb-3"></div>

                <div className="mb-2">
                  <div className="text-gray-400 text-xs mb-2">Multiplier</div>
                  <div className="flex items-center gap-2 bg-black/30 p-1 rounded-lg border border-white/[0.12] backdrop-blur-xl">
                    <button onClick={() => setMultiplier(m => Math.max(1.2, m - 0.1))} disabled={isSpinning} className="w-10 h-10 hover:bg-gray-700 rounded-md transition font-bold text-gray-400">-</button>
                    <div className="flex-1 text-center font-mono text-xl font-bold text-white">
                      {multiplier.toFixed(2)}x
                    </div>
                    <button onClick={() => setMultiplier(m => Math.min(20, m + 0.1))} disabled={isSpinning} className="w-10 h-10 hover:bg-gray-700 rounded-md transition font-bold text-gray-400">+</button>
                  </div>
                  <div className="flex justify-between mt-2 gap-2">
                    {[1.2, 1.5, 2, 5, 10].map(m => (
                      <button key={m} onClick={() => !isSpinning && setMultiplier(m)} className="text-xs bg-white/[0.03] hover:bg-white/[0.08] px-2 py-1 rounded text-gray-400 transition border border-white/[0.06]">
                        {m}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Inventory Grid */}
      <div className="h-[280px] flex flex-col flex-shrink-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.35)] bg-black/20 backdrop-blur-2xl border-t border-white/[0.12]">
        <div className="px-6 py-3 border-b border-white/[0.12] flex justify-between items-center bg-black/20 backdrop-blur-2xl">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm uppercase tracking-wider text-gray-300">Your Inventory</span>
            <span className="bg-gray-700 text-xs px-2 py-0.5 rounded text-white ml-2">{inventory.length}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/30 px-2 py-1.5 rounded border border-white/[0.12] backdrop-blur-xl">
              <button
                onClick={() => setSortBy('price')}
                disabled={isSpinning}
                className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition ${
                  sortBy === 'price'
                    ? 'bg-web3-accent/20 text-web3-accent'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Price
              </button>
              <button
                onClick={() => setSortBy('alpha')}
                disabled={isSpinning}
                className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition ${
                  sortBy === 'alpha'
                    ? 'bg-web3-accent/20 text-web3-accent'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                A-Z
              </button>
            </div>
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition uppercase tracking-wider bg-black/30 px-3 py-1.5 rounded border border-white/[0.12] hover:border-web3-accent/40"
              disabled={isSpinning}
            >
              <span className="text-gray-500 mr-1">{sortBy === 'alpha' ? 'Alpha:' : 'Price:'}</span>
              {sortBy === 'alpha'
                ? (sortOrder === 'asc' ? 'A-Z' : 'Z-A')
                : (sortOrder === 'asc' ? 'Asc' : 'Desc')}
              {sortOrder === 'asc' ? <ArrowUp size={14} className="text-web3-accent" /> : <ArrowDown size={14} className="text-web3-accent" />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {sortedInventory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600">
              <Package size={48} className="mb-4 opacity-20"/>
              <p>Your inventory is empty. Open some cases!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {sortedInventory.map((item, index) => {
                if (!item || !item.id) return null;
                const key = `${item.id}-${index}`;
                return (
                <ItemCard
                  key={key}
                  item={item}
                  size="sm"
                  selected={selectedKey === key}
                  disabled={isSpinning}
                  onClick={() => handleSelectItem(item, key)}
                  showSelectedBadge
                  currencyPrefix="$"
                />
              );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
