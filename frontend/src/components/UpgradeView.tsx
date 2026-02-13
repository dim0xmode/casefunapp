import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Item } from '../types';
import { TrendingUp, Package, Sparkles, Settings2 } from 'lucide-react';
import { ItemCard } from './ItemCard';
import { EmptyState } from './ui/EmptyState';
import { ItemGrid } from './ui/ItemGrid';
import { AdminActionButton } from './ui/AdminActionButton';
import { Pagination } from './ui/Pagination';
import { SearchInput } from './ui/SearchInput';
import { playDullClick, playSoftLose, playSoftWin } from '../utils/audio';

interface UpgradeViewProps {
  inventory: Item[];
  onUpgrade: (originalItems: Item[], multiplier: number) => Promise<{ success: boolean; targetValue: number }>;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
}

export const UpgradeView: React.FC<UpgradeViewProps> = ({ inventory, onUpgrade, isAuthenticated, onOpenWalletConnect, isAdmin }) => {
  const UPGRADE_DIVISIONS = 24;
  const PRESET_STORAGE_KEY = 'casefun:upgradePresets:v1';
  const MIN_CHANCE_PERCENT = 0.1;
  const MAX_CHANCE_PERCENT = 75;
  const MIN_X_PRESET_INPUT = 1.33;
  const MIN_MULTIPLIER_FROM_MAX_CHANCE = 100 / MAX_CHANCE_PERCENT;
  const DEFAULT_X_PRESETS = [1.5, 2, 3];
  const DEFAULT_PERCENT_PRESETS = [65, 50, 33];
  const roundToTwo = (value: number) => Number(value.toFixed(2));
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [displayItem, setDisplayItem] = useState<Item | null>(null);
  const [lastResult, setLastResult] = useState<{ item: Item; value: number; success: boolean } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [multiplier, setMultiplier] = useState<number>(2.0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [upgradeResult, setUpgradeResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [searchFilter, setSearchFilter] = useState('');
  const [xPresets, setXPresets] = useState<number[]>(DEFAULT_X_PRESETS);
  const [percentPresets, setPercentPresets] = useState<number[]>(DEFAULT_PERCENT_PRESETS);
  const [isPresetSettingsOpen, setIsPresetSettingsOpen] = useState(false);
  const [xDraft, setXDraft] = useState<string[]>(DEFAULT_X_PRESETS.map((value) => value.toString()));
  const [percentDraft, setPercentDraft] = useState<string[]>(DEFAULT_PERCENT_PRESETS.map((value) => value.toString()));
  const [fastUpgrade, setFastUpgrade] = useState(false);
  const [frozenInventory, setFrozenInventory] = useState<Item[] | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [inventoryPage, setInventoryPage] = useState(0);
  const pointerRef = useRef<HTMLDivElement | null>(null);
  const spinDurationMs = fastUpgrade ? 420 : 5600;
  const spinEasing = fastUpgrade
    ? 'cubic-bezier(0.35, 0.08, 0.22, 1)'
    : 'cubic-bezier(0.1, 0.86, 0.18, 1)';

  // Calculations
  const selectedTotalValue = selectedItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const targetValue = selectedItems.length ? roundToTwo(selectedTotalValue * multiplier) : 0;
  const displayTargetValue = displayItem ? roundToTwo(selectedTotalValue * multiplier) : 0;
  const rawChance = useMemo(() => {
    return (1 / multiplier) * 100;
  }, [multiplier]);

  const winChance = useMemo(() => {
    return Math.min(MAX_CHANCE_PERCENT, Math.max(MIN_CHANCE_PERCENT, rawChance));
  }, [rawChance]);
  const effectiveChance = useMemo(() => {
    return Math.min(MAX_CHANCE_PERCENT, Math.max(MIN_CHANCE_PERCENT, rawChance));
  }, [rawChance]);

  const isUpgradeBlocked = rawChance > MAX_CHANCE_PERCENT + 1e-9;
  const setChancePercent = (nextPercent: number) => {
    const clamped = Math.max(MIN_CHANCE_PERCENT, Math.min(MAX_CHANCE_PERCENT, nextPercent));
    setMultiplier(100 / clamped);
  };
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const storedX = Array.isArray(parsed?.x) ? parsed.x.map(Number) : null;
      const storedP = Array.isArray(parsed?.percent) ? parsed.percent.map(Number) : null;
      const validX = storedX && storedX.length === 3 && storedX.every((value: number) => Number.isFinite(value) && value >= MIN_X_PRESET_INPUT && value <= 1000);
      const validP = storedP && storedP.length === 3 && storedP.every((value: number) => Number.isFinite(value) && value >= MIN_CHANCE_PERCENT && value <= MAX_CHANCE_PERCENT);
      if (validX && validP) {
        setXPresets(storedX.map((value: number) => roundToTwo(value)));
        setPercentPresets(storedP.map((value: number) => roundToTwo(value)));
      }
    } catch {
      // ignore malformed preset storage
    }
  }, []);

  const openPresetSettings = () => {
    setXDraft(xPresets.map((value) => value.toString()));
    setPercentDraft(percentPresets.map((value) => value.toString()));
    setIsPresetSettingsOpen(true);
  };

  const savePresetSettings = () => {
    const parsedX = xDraft.map((entry) => Number(String(entry).replace(',', '.')));
    const parsedP = percentDraft.map((entry) => Number(String(entry).replace(',', '.')));
    const validX = parsedX.length === 3 && parsedX.every((value) => Number.isFinite(value) && value >= MIN_X_PRESET_INPUT && value <= 1000);
    const validP = parsedP.length === 3 && parsedP.every((value) => Number.isFinite(value) && value >= MIN_CHANCE_PERCENT && value <= MAX_CHANCE_PERCENT);
    if (!validX || !validP) return;
    const nextX = parsedX.map((value) => roundToTwo(value));
    const nextP = parsedP.map((value) => roundToTwo(value));
    setXPresets(nextX);
    setPercentPresets(nextP);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ x: nextX, percent: nextP }));
    } catch {
      // ignore localStorage errors
    }
    setIsPresetSettingsOpen(false);
  };
  const presetDraftsAreValid = (() => {
    const parsedX = xDraft.map((entry) => Number(String(entry).replace(',', '.')));
    const parsedP = percentDraft.map((entry) => Number(String(entry).replace(',', '.')));
    const validX = parsedX.length === 3 && parsedX.every((value) => Number.isFinite(value) && value >= MIN_X_PRESET_INPUT && value <= 1000);
    const validP = parsedP.length === 3 && parsedP.every((value) => Number.isFinite(value) && value >= MIN_CHANCE_PERCENT && value <= MAX_CHANCE_PERCENT);
    return validX && validP;
  })();

  const sanitizeSearchInput = (value: string) => {
    // Allow token search, plain text, and decimal numeric input.
    let next = value.replace(/[^a-zA-Z0-9$., ]/g, '');
    // Keep only one "$" at the beginning.
    if (next.includes('$')) {
      const withoutAll = next.replace(/\$/g, '');
      next = `$${withoutAll}`;
    }
    // If input is numeric-like, keep at most two decimal digits.
    const compact = next.trim();
    if (/^\d+[.,]?\d*$/.test(compact)) {
      const normalized = compact.replace(',', '.');
      const [intPart, decPart = ''] = normalized.split('.');
      return decPart.length > 2 ? `${intPart}.${decPart.slice(0, 2)}` : normalized;
    }
    return next;
  };

  const handleSearchChange = (value: string) => {
    setSearchFilter(sanitizeSearchInput(value));
    setInventoryPage(0);
  };

  // Inventory base ordering
  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  }, [inventory]);

  const selectedBase = selectedItems[0] || null;
  const isFilterLocked = Boolean(selectedBase);
  const matchesSelectedBase = (item: Item) => {
    if (!selectedBase) return true;
    return item.currency === selectedBase.currency && item.caseId === selectedBase.caseId;
  };

  const listSource = (isSpinning || upgradeResult !== 'idle' ? (frozenInventory || sortedInventory) : sortedInventory);
  const visibleInventory = useMemo(() => {
    const searchTrimmed = searchFilter.trim();
    const searchLower = searchTrimmed.toLowerCase();
    const normalizedNumeric = searchTrimmed.replace(',', '.');
    const priceQuery = Number(normalizedNumeric);
    const hasPriceFilter =
      Number.isFinite(priceQuery) &&
      priceQuery > 0 &&
      /^\d+([.,]\d{0,2})?$/.test(searchTrimmed);
    const hasTokenFilter = searchTrimmed.startsWith('$') && searchTrimmed.length > 1;
    const tokenSearch = hasTokenFilter ? searchTrimmed.slice(1).toLowerCase() : '';
    const hasNameFilter = searchLower.length > 0 && !hasPriceFilter && !hasTokenFilter;

    let base = listSource.filter(matchesSelectedBase);
    if (hasPriceFilter) {
      base = base.filter((item) => Number(item.value || 0) <= priceQuery);
    } else if (hasTokenFilter) {
      base = base.filter((item) => (item.currency || '').toLowerCase().includes(tokenSearch));
    } else if (hasNameFilter) {
      base = base.filter((item) =>
        (item.name || '').toLowerCase().includes(searchLower) ||
        (item.currency || '').toLowerCase().includes(searchLower)
      );
    }
    return base;
  }, [listSource, selectedBase, searchFilter]);
  const INVENTORY_ITEMS_PER_PAGE = 30;
  const inventoryTotalPages = Math.max(1, Math.ceil(visibleInventory.length / INVENTORY_ITEMS_PER_PAGE));
  const pagedVisibleInventory = useMemo(() => {
    const start = inventoryPage * INVENTORY_ITEMS_PER_PAGE;
    return visibleInventory.slice(start, start + INVENTORY_ITEMS_PER_PAGE);
  }, [visibleInventory, inventoryPage]);

  useEffect(() => {
    if (inventoryPage > inventoryTotalPages - 1) {
      setInventoryPage(Math.max(0, inventoryTotalPages - 1));
    }
  }, [inventoryPage, inventoryTotalPages]);

  const upgradeValidationMessage = useMemo(() => {
    if (!isAuthenticated) return 'Connect wallet to upgrade.';
    if (!selectedItems.length) return 'Select at least one item to start upgrade.';
    if (isUpgradeBlocked) return 'Multiplier is too low chance. Keep win chance at 75% or less.';
    return null;
  }, [isAuthenticated, selectedItems.length, isUpgradeBlocked]);

  // SVG Geometry
  const RADIUS = 120;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE - (winChance / 100) * CIRCUMFERENCE;

  const handleRoll = async () => {
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    if (!selectedItems.length || isSpinning || isUpgradeBlocked) return;
    const spinItems = [...selectedItems];
    const spinPrimary = spinItems[0];
    const spinTotal = spinItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (!spinPrimary) return;

    setFrozenInventory([...inventory]);
    setIsSpinning(true);

    let isSuccess = false;
    let finalTargetValue = targetValue;

    try {
      const result = await onUpgrade(spinItems, multiplier);
      isSuccess = result.success;
      finalTargetValue = result.targetValue || targetValue;
    } catch (error) {
      setIsSpinning(false);
      setFrozenInventory(null);
      return;
    }

    // Calculate Landing Angle
    const degreesSpan = (winChance / 100) * 360;
    const startAngle = 0;
    const endAngle = degreesSpan;

    let targetAngle = 0;
    const useBaitLanding = Math.random() < 0.5;
    const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;
    const insideEdgeWindow = Math.max(0.03, Math.min(6, degreesSpan * 0.35));
    const outsideEdgeWindow = Math.max(0.8, Math.min(8, (360 - degreesSpan) * 0.05));

    if (isSuccess) {
      if (useBaitLanding) {
        // Land very close to the win/fail border, but still in the win zone.
        const offset = Math.random() * insideEdgeWindow;
        targetAngle = Math.max(startAngle + 0.01, endAngle - offset);
      } else {
        targetAngle = startAngle + (Math.random() * degreesSpan);
      }
    } else if (useBaitLanding) {
      // Bait failure: either slight overshoot, or just "not reaching" the start boundary.
      const nearOvershoot = Math.random() < 0.5;
      if (nearOvershoot) {
        const offset = Math.random() * outsideEdgeWindow;
        targetAngle = endAngle + offset;
      } else {
        const offset = Math.random() * outsideEdgeWindow;
        targetAngle = 360 - offset;
      }
    } else {
      const remainingSpan = 360 - degreesSpan;
      targetAngle = endAngle + (Math.random() * remainingSpan);
    }
    targetAngle = normalizeAngle(targetAngle);

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
    const resultDelay = spinDurationMs;
    const resultRevealPauseMs = 300;
    const resetDelay = fastUpgrade ? 1000 : 1500;

    setTimeout(() => {
      setUpgradeResult(isSuccess ? 'success' : 'fail');
      setIsSpinning(false);
      if (isSuccess) {
        playSoftWin();
      } else {
        playSoftLose();
      }
      
      setTimeout(() => {
        setLastResult({
          item: spinPrimary,
          value: isSuccess ? finalTargetValue : spinTotal,
          success: isSuccess,
        });
        setSelectedItems([]);
        setSelectedKeys([]);
        setDisplayItem(null);
        setFrozenInventory(null);
      }, resetDelay);
    }, resultDelay + resultRevealPauseMs);
  };

  useEffect(() => {
    if (!isSpinning) return;
    const node = pointerRef.current;
    if (!node) return;

    let frameId = 0;
    let lastRawAngle: number | null = null;
    let totalAnglePassed = 0;
    let lastTickIndex = 0;
    const sectionSizeDeg = 360 / UPGRADE_DIVISIONS;
    const phaseLagDeg = sectionSizeDeg * 0.15;
    const clickVolume = fastUpgrade ? 0.08 : 0.12;

    const readRotationDeg = () => {
      const transform = window.getComputedStyle(node).transform;
      if (!transform || transform === 'none') return 0;
      try {
        const matrix = new DOMMatrixReadOnly(transform);
        const angle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
        return Number.isFinite(angle) ? angle : 0;
      } catch {
        const match = transform.match(/matrix\(([^)]+)\)/);
        if (!match) return 0;
        const parts = match[1].split(',').map((entry) => Number(entry.trim()));
        const a = Number(parts[0] || 1);
        const b = Number(parts[1] || 0);
        const angle = Math.atan2(b, a) * (180 / Math.PI);
        return Number.isFinite(angle) ? angle : 0;
      }
    };

    const tick = () => {
      const raw = readRotationDeg();
      if (lastRawAngle === null) {
        lastRawAngle = raw;
      } else {
        let delta = raw - lastRawAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        lastRawAngle = raw;

        totalAnglePassed += Math.abs(delta);
        const effectiveAngle = Math.max(0, totalAnglePassed - phaseLagDeg);
        const tickIndex = Math.floor(effectiveAngle / sectionSizeDeg);
        // Emit at most one click per frame to prevent burst loudness.
        if (tickIndex > lastTickIndex) {
          playDullClick(clickVolume);
          lastTickIndex = tickIndex;
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [isSpinning, fastUpgrade, UPGRADE_DIVISIONS, spinDurationMs]);

  const handleSelectItem = (item: Item, key: string) => {
    if (isSpinning) return;
    setSelectionError(null);
    const isAlreadySelected = selectedKeys.includes(key);
    if (isAlreadySelected) {
      const nextKeys = selectedKeys.filter((entry) => entry !== key);
      const nextItems = selectedItems.filter((entry) => entry.id !== item.id);
      setSelectedKeys(nextKeys);
      setSelectedItems(nextItems);
      setDisplayItem(nextItems[0] || null);
      setUpgradeResult('idle');
      setRotation(0);
      if (!nextItems.length) {
        setLastResult(null);
      }
      return;
    }
    if (selectedItems.length >= 9) {
      setSelectionError('Maximum 9 cards per upgrade.');
      return;
    }
    if (selectedItems.length > 0) {
      const base = selectedItems[0];
      const sameToken = base.currency === item.currency && base.caseId === item.caseId;
      if (!sameToken) {
        setSelectionError('Select cards of the same token/case only.');
        return;
      }
    }
    setSelectedKeys((prev) => [...prev, key]);
    setSelectedItems((prev) => [...prev, item]);
    setDisplayItem((prev) => prev || item);
    setLastResult(null);
    setUpgradeResult('idle');
    setRotation(0);
  };

  const removeSelectedItem = (itemId: string) => {
    if (isSpinning) return;
    setSelectionError(null);
    const index = selectedItems.findIndex((entry) => entry.id === itemId);
    if (index === -1) return;
    const nextItems = selectedItems.filter((_, idx) => idx !== index);
    const nextKeys = selectedKeys.filter((_, idx) => idx !== index);
    setSelectedItems(nextItems);
    setSelectedKeys(nextKeys);
    setDisplayItem(nextItems[0] || null);
    setUpgradeResult('idle');
    setRotation(0);
    if (!nextItems.length) {
      setLastResult(null);
    }
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
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-10 lg:gap-16 z-10 w-full max-w-6xl px-8">
          
          {/* Left: Selected Item */}
          <div className="flex flex-col gap-6 w-full max-w-sm flex-1">
            <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl h-[420px] flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b border-white/[0.06] pb-2">
                <span className="text-gray-400 font-bold uppercase text-xs tracking-wider">
                  Selected Item
                </span>
                <span className="text-[10px] uppercase tracking-widest text-gray-500">
                  {selectedItems.length}/9 • {selectedTotalValue.toFixed(2)}
                </span>
              </div>
              
              <div className="flex flex-col gap-3 flex-1 justify-start pt-1">
                <div className="w-full grid grid-cols-3 gap-2">
                  {Array.from({ length: 9 }).map((_, index) => {
                    const selected = selectedItems[index];
                    if (selected) {
                      return (
                        <ItemCard
                          key={`${selected.id}-selected-${index}`}
                          item={selected}
                          size="sm"
                          className="w-full h-[107px]"
                          currencyPrefix="$"
                          onClick={() => removeSelectedItem(selected.id)}
                        />
                      );
                    }
                    return (
                      <div
                        key={`empty-slot-${index}`}
                        className="relative h-[107px] rounded-xl border-2 border-white/[0.06] bg-web3-card/50 backdrop-blur-sm p-2 flex flex-col items-center justify-center"
                      >
                        <div className="w-12 h-12 aspect-square shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-web3-purple/20 to-web3-accent/20 border-2 border-dashed border-white/[0.12] flex items-center justify-center">
                          <span className="text-[10px] uppercase tracking-widest text-gray-500">Item</span>
                        </div>
                        <div className="mt-2 text-center">
                          <div className="text-sm font-bold text-gray-500">-</div>
                          <div className="text-[10px] text-gray-600">$TOKEN</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectionError ? (
                  <div className="text-[10px] uppercase tracking-widest text-red-400">{selectionError}</div>
                ) : null}
              </div>
            </div>
            {!selectionError && (
              <div className="px-1 mt-1 space-y-2">
                {selectedItems.length === 0 && (
                  <div className="text-[10px] uppercase tracking-widest text-gray-600 flex items-center gap-1">
                    <TrendingUp size={12} className="opacity-70" />
                    Select items to start upgrade
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-widest text-gray-500">
                  Only one token type allowed
                </div>
              </div>
            )}
          </div>

          {/* Center: The Circle + Action */}
          <div className="flex flex-col items-center justify-center gap-6 flex-shrink-0">
            <div className="relative w-[220px] h-[220px] lg:w-[280px] lg:h-[280px] flex items-center justify-center mt-6 rounded-full overflow-hidden">
              <div className="absolute inset-6 rounded-full bg-gradient-to-br from-web3-accent/10 to-web3-purple/10 blur-xl opacity-80 pointer-events-none"></div>
              
              {/* SVG Rings */}
              <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 260 260">
                {/* Background Track */}
                <circle 
                  cx="130" cy="130" r={RADIUS} 
                  fill="transparent" 
                  stroke="#1F2833" 
                  strokeWidth="12" 
                />
                {/* Win Zone (Success) - placed below divisions */}
                {displayItem && (
                <>
                <circle 
                  cx="130" cy="130" r={RADIUS} 
                  fill="transparent" 
                  stroke="rgba(16,185,129,0.22)" 
                  strokeWidth="14"
                    strokeLinecap="butt"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500 ease-out"
                />
                <circle 
                  cx="130" cy="130" r={RADIUS} 
                  fill="transparent" 
                  stroke="rgba(52,211,153,0.72)" 
                  strokeWidth="8"
                    strokeLinecap="butt"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500 ease-out"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(52,211,153,0.5))' }}
                />
                </>
                )}
                {/* Clock-like divisions */}
                {Array.from({ length: UPGRADE_DIVISIONS }).map((_, idx) => {
                  const isLong = idx % 2 === 0;
                  const isHalfMark = idx === 0 || idx === UPGRADE_DIVISIONS / 2;
                  const y1 = isLong ? 4 : 8;
                  const y2 = isLong ? 18 : 14;
                  return (
                    <line
                      key={`upgrade-tick-${idx}`}
                      x1="130"
                      y1={y1}
                      x2="130"
                      y2={y2}
                      stroke={isHalfMark ? '#93C5FD' : 'rgba(255,255,255,0.34)'}
                      strokeWidth={isHalfMark ? 1.8 : 1.1}
                      strokeLinecap="round"
                      transform={`rotate(${(360 / UPGRADE_DIVISIONS) * idx} 130 130)`}
                    />
                  );
                })}
              </svg>
              
              <div className="absolute inset-0 rounded-full border border-white/[0.08]"></div>

              {/* The Pointer */}
              <div 
                ref={pointerRef}
                className="absolute inset-0 pointer-events-none z-20"
                style={{ 
                  transform: `rotate(${rotation}deg)`,
                  transition: isSpinning 
                    ? `transform ${spinDurationMs}ms ${spinEasing}` 
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
                          <div className="relative w-44 h-24 flex flex-col items-center justify-center">
                            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
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
                            <div className="text-2xl font-black uppercase tracking-[0.15em] text-web3-danger drop-shadow-[0_0_6px_rgba(239,68,68,0.35)]">
                              Try again
                            </div>
                            <div className="text-xs uppercase tracking-[0.25em] text-gray-300">
                              Upgrade failed
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full max-w-xs text-center">
              <AdminActionButton
                isAuthenticated={isAuthenticated}
                isAdmin={isAdmin}
                balance={0}
                cost={0}
                onConnect={onOpenWalletConnect}
                onTopUp={(_shortfall) => {}}
                onAction={handleRoll}
                readyLabel="UPGRADE"
                labelOverride={isSpinning ? 'ROLLING...' : undefined}
                forceLabel={Boolean(isSpinning)}
                disabled={isSpinning || isUpgradeBlocked || (!selectedItems.length && isAuthenticated)}
                className={`w-full py-3 text-lg tracking-widest font-black rounded-xl shadow-[0_0_20px_rgba(102,252,241,0.18)] ${isSpinning ? 'opacity-50' : 'animate-pulse-fast'}`}
              />
              {upgradeValidationMessage && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500">
                  {upgradeValidationMessage}
                </div>
              )}

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
            <div className="bg-black/20 border border-white/[0.12] p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl min-h-[420px] flex flex-col">
              <div className="text-xs text-gray-400 uppercase tracking-widest mb-3">Result</div>
              {lastResult ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <ItemCard
                    item={{
                      ...lastResult.item,
                      value: lastResult.value,
                    }}
                    size="lg"
                    className="w-full h-full max-h-[230px]"
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
                    className="w-full h-full max-h-[230px] opacity-80"
                    currencyPrefix="$"
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600">Select item to preview</div>
              )}

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="flex justify-between items-center mb-3"></div>

                <div className="mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-gray-400 text-xs">Presets</div>
                    <button
                      onClick={openPresetSettings}
                      disabled={isSpinning}
                      className="w-8 h-8 rounded-md border border-white/[0.12] bg-black/30 text-gray-400 hover:text-white hover:border-web3-accent/40 transition flex items-center justify-center"
                      title="Customize presets"
                    >
                      <Settings2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {percentPresets.map((preset, idx) => (
                        <button
                          key={`p-preset-${idx}`}
                          onClick={() => {
                            if (isSpinning) return;
                            setChancePercent(Number(preset));
                          }}
                          className="text-xs bg-white/[0.03] hover:bg-white/[0.08] px-2 py-1 rounded text-gray-300 transition border border-white/[0.06]"
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {xPresets.map((preset, idx) => (
                        <button
                          key={`x-preset-${idx}`}
                          onClick={() => {
                            if (isSpinning) return;
                            setMultiplier(Math.max(MIN_MULTIPLIER_FROM_MAX_CHANCE, Number(preset)));
                          }}
                          className="text-xs bg-white/[0.03] hover:bg-white/[0.08] px-2 py-1 rounded text-gray-300 transition border border-white/[0.06]"
                        >
                          {preset}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-gray-400 text-xs">Chance</div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">
                      Multiplier: {multiplier.toFixed(2)}x
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-black/30 p-1 rounded-lg border border-white/[0.12] backdrop-blur-xl">
                    <button onClick={() => setChancePercent(effectiveChance - 1)} disabled={isSpinning} className="w-8 h-8 hover:bg-gray-700 rounded-md transition font-bold text-gray-400">-</button>
                    <div className="flex-1 text-center font-mono text-lg font-bold text-white">
                      {effectiveChance.toFixed(2)}%
                    </div>
                    <button onClick={() => setChancePercent(effectiveChance + 1)} disabled={isSpinning} className="w-8 h-8 hover:bg-gray-700 rounded-md transition font-bold text-gray-400">+</button>
                  </div>
                </div>
              </div>
              </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Inventory Grid */}
      <div className="h-[440px] lg:h-[520px] flex flex-col flex-shrink-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.35)] bg-black/20 backdrop-blur-2xl border-t border-white/[0.12]">
        <div className="px-6 py-3 border-b border-white/[0.12] flex justify-between items-center bg-black/20 backdrop-blur-2xl">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm uppercase tracking-wider text-gray-300">Your Inventory</span>
            <span className="bg-gray-700 text-xs px-2 py-0.5 rounded text-white ml-2">
              {visibleInventory.length}
              {isFilterLocked ? ` / ${inventory.length}` : ''}
            </span>
            {isFilterLocked && (
              <span className="text-[10px] uppercase tracking-widest text-web3-accent">
                Showing ${selectedBase?.currency || 'TOKEN'} only
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <SearchInput
              value={searchFilter}
              onChange={handleSearchChange}
              placeholder="Search by name, token ($DOGE) or max price (500)"
              className="w-[320px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {visibleInventory.length === 0 ? (
            <EmptyState
              icon={<Package size={48} />}
              message={isFilterLocked ? 'No more cards for selected token/case.' : 'Your inventory is empty. Open some cases!'}
            />
          ) : (
            <ItemGrid>
              {pagedVisibleInventory.map((item) => {
                if (!item || !item.id) return null;
                const key = String(item.id);
                return (
                  <ItemCard
                    key={key}
                    item={item}
                    size="sm"
                    selected={selectedKeys.includes(key)}
                    disabled={isSpinning}
                    onClick={() => handleSelectItem(item, key)}
                    showSelectedBadge
                    currencyPrefix="$"
                  />
                );
              })}
            </ItemGrid>
          )}
          {inventoryTotalPages > 1 && (
            <Pagination
              currentPage={inventoryPage}
              totalPages={inventoryTotalPages}
              onPageChange={setInventoryPage}
              className="mt-4"
            />
          )}
          {isFilterLocked && !isSpinning && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => {
                  setSelectedItems([]);
                  setSelectedKeys([]);
                  setDisplayItem(null);
                  setUpgradeResult('idle');
                  setRotation(0);
                  setSelectionError(null);
                }}
                className="px-4 py-2 rounded-lg border border-white/[0.14] text-[10px] uppercase tracking-widest text-gray-300 hover:text-white hover:border-web3-accent/40 transition"
              >
                Clear token filter
              </button>
            </div>
          )}
        </div>
      </div>

      {isPresetSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl border border-white/[0.14] bg-[#0F1014] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm uppercase tracking-widest text-gray-300">Preset Settings</div>
              <button
                onClick={() => setIsPresetSettingsOpen(false)}
                className="w-8 h-8 rounded-md border border-white/[0.12] text-gray-400 hover:text-white hover:border-white/[0.28] transition"
              >
                x
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {xDraft.map((value, idx) => (
                <input
                  key={`x-draft-${idx}`}
                  value={value}
                  onChange={(event) => {
                    const next = [...xDraft];
                    next[idx] = event.target.value.replace(/[^0-9.,]/g, '');
                    setXDraft(next);
                  }}
                  placeholder={`x${idx + 1}`}
                  className="h-10 rounded-md border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none focus:border-web3-accent/60"
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {percentDraft.map((value, idx) => (
                <input
                  key={`p-draft-${idx}`}
                  value={value}
                  onChange={(event) => {
                    const next = [...percentDraft];
                    next[idx] = event.target.value.replace(/[^0-9.,]/g, '');
                    setPercentDraft(next);
                  }}
                  placeholder={`%${idx + 1}`}
                  className="h-10 rounded-md border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none focus:border-web3-accent/60"
                />
              ))}
            </div>

            <div className="text-[10px] text-gray-500 mb-4">
              X range: 1.33-1000, % range: 0.1-75
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsPresetSettingsOpen(false)}
                className="px-3 py-1.5 rounded-md text-xs border border-white/[0.12] text-gray-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setXDraft(DEFAULT_X_PRESETS.map((value) => value.toString()));
                  setPercentDraft(DEFAULT_PERCENT_PRESETS.map((value) => value.toString()));
                }}
                className="px-3 py-1.5 rounded-md text-xs border border-white/[0.12] text-gray-300 hover:text-white transition"
              >
                Reset
              </button>
              <button
                onClick={savePresetSettings}
                disabled={!presetDraftsAreValid}
                className={`px-3 py-1.5 rounded-md text-xs border transition ${
                  presetDraftsAreValid
                    ? 'border-web3-accent/40 text-web3-accent hover:bg-web3-accent/10'
                    : 'border-white/[0.08] text-gray-500 cursor-not-allowed'
                }`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
