import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Case, Item, Rarity, ImageMeta } from '../types';
import { Plus, Trash2, Sparkles, ChevronDown, UploadCloud, Smile, Rocket } from 'lucide-react';
import { ItemCard } from './ItemCard';
import { AdminActionButton } from './ui/AdminActionButton';
import { ImageAdjustModal } from './ui/ImageAdjustModal';
import { ImageWithMeta } from './ui/ImageWithMeta';
import { api, resolveAssetUrl } from '../services/api';
import { formatShortfallUp } from '../utils/number';

const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#10B981',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

interface DropDraft {
  id: string;
  value: string;
}

const CREATE_CASE_FEE = 1.5;

interface CreateCaseViewProps {
  onCreate: (caseData: Case) => void;
  creatorName: string;
  balance: number;
  onOpenTopUp: (prefillUsdt?: number) => void;
  onBalanceUpdate?: (balance: number) => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
  cases: Case[];
  isTelegramMiniApp?: boolean;
}

export const CreateCaseView: React.FC<CreateCaseViewProps> = ({
  onCreate,
  creatorName,
  balance,
  onOpenTopUp,
  onBalanceUpdate,
  isAuthenticated,
  onOpenWalletConnect,
  isAdmin,
  cases,
  isTelegramMiniApp = false,
}) => {
  const [name, setName] = useState('');
  const [tokenTicker, setTokenTicker] = useState('');
  const [price, setPrice] = useState('');
  const [rtu, setRtu] = useState('');
  const [tokenPrice, setTokenPrice] = useState('');
  const [openDurationHours, setOpenDurationHours] = useState(24);
  const durationOptions = [
    { label: '2h', value: 2 },
    { label: '6h', value: 6 },
    { label: '12h', value: 12 },
    { label: '24h', value: 24 },
    { label: '72h', value: 72 },
  ];

  const formatDuration = (hoursValue: number) => {
    if (!Number.isFinite(hoursValue) || hoursValue <= 0) return '—';
    if (hoursValue < 1) {
      return `${Math.round(hoursValue * 60)}m`;
    }
    return `${hoursValue}h`;
  };
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadAbortRef = useRef<(() => void) | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [rtuError, setRtuError] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<ImageMeta>({
    fit: 'contain',
    scale: 1,
    x: 0,
    y: 0,
  });
  const [isLogoAdjustOpen, setIsLogoAdjustOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const [creationStage, setCreationStage] = useState('');
  const creationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const CREATION_STAGES = [
    { at: 0, text: 'Validating parameters...' },
    { at: 8, text: 'Reserving case slot...' },
    { at: 18, text: 'Setting up token economics...' },
    { at: 30, text: 'Configuring drop rates...' },
    { at: 45, text: 'Deploying token contract...' },
    { at: 60, text: 'Waiting for confirmation...' },
    { at: 75, text: 'Registering on-chain...' },
    { at: 88, text: 'Finalizing...' },
  ];

  const startCreationProgress = useCallback(() => {
    setCreationProgress(0);
    setCreationStage(CREATION_STAGES[0].text);
    creationTimers.current.forEach(t => clearTimeout(t));
    creationTimers.current = [];

    let current = 0;
    const tick = () => {
      current += 0.5 + Math.random() * 1.5;
      if (current > 95) current = 95;
      setCreationProgress(Math.round(current));

      const stage = [...CREATION_STAGES].reverse().find(s => current >= s.at);
      if (stage) setCreationStage(stage.text);

      if (current < 95) {
        const delay = current < 30 ? 200 + Math.random() * 300
          : current < 70 ? 400 + Math.random() * 600
          : 800 + Math.random() * 1200;
        creationTimers.current.push(setTimeout(tick, delay));
      }
    };
    creationTimers.current.push(setTimeout(tick, 300));
  }, []);

  const finishCreationProgress = useCallback(() => {
    creationTimers.current.forEach(t => clearTimeout(t));
    creationTimers.current = [];
    setCreationProgress(100);
    setCreationStage('Case created!');
  }, []);

  useEffect(() => {
    return () => { creationTimers.current.forEach(t => clearTimeout(t)); };
  }, []);

  const sanitizeCaseName = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/^\s+/, '');
  const sanitizeToken = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [drops, setDrops] = useState<DropDraft[]>([
    { id: 'drop-1', value: '' },
    { id: 'drop-2', value: '' },
    { id: 'drop-3', value: '' },
    { id: 'drop-4', value: '' },
  ]);

  const getRarityByValue = (value: number): Rarity => {
    if (value < 5) return Rarity.COMMON;
    if (value < 20) return Rarity.UNCOMMON;
    if (value < 50) return Rarity.RARE;
    if (value < 100) return Rarity.LEGENDARY;
    return Rarity.MYTHIC;
  };

  const normalizedDrops = useMemo(() => {
    return drops.map((drop) => {
      const value = Number(drop.value);
      const safeValue = Number.isFinite(value) ? value : 0;
      const rarity = getRarityByValue(safeValue);
      return {
        id: drop.id,
        name: `Reward`,
        value: safeValue,
        rarity,
        currency: tokenTicker || 'TOKEN',
        image: imageUrl || '',
        imageMeta,
        color: RARITY_COLORS[rarity],
      };
    }) as Item[];
  }, [drops, tokenTicker, imageUrl, imageMeta]);

  const existingCaseNames = useMemo(() => {
    return new Set((cases || []).map((caseData) => caseData.name.trim().toUpperCase()));
  }, [cases]);

  const existingTickers = useMemo(() => {
    return new Set(
      (cases || []).map((caseData) => (caseData.tokenTicker || caseData.currency || '').trim().toUpperCase())
    );
  }, [cases]);

  const validateCaseName = (value: string, currentTicker?: string) => {
    if (!value) return null;
    if (!/^[A-Z][A-Z0-9 ]*$/.test(value)) {
      return 'Case name must start with a letter and contain only letters/numbers.';
    }
    if (existingCaseNames.has(value)) {
      return 'Case name already exists.';
    }
    if (existingTickers.has(value)) {
      return 'Case name matches existing token ticker.';
    }
    if (currentTicker && value === currentTicker) {
      return 'Case name and token ticker must be different.';
    }
    return null;
  };

  const validateTicker = (value: string, currentName?: string) => {
    if (!value) return null;
    if (!/^[A-Z][A-Z0-9]*$/.test(value)) {
      return 'Token ticker must start with a letter and contain only letters/numbers.';
    }
    if (currentName && value === currentName) {
      return 'Token ticker and case name must be different.';
    }
    return null;
  };

  const validateRtu = (value: string) => {
    if (!value) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'RTU must be a number.';
    if (numeric <= 0) return 'RTU must be greater than 0.';
    if (numeric > 98) return 'RTU must be 98% or lower.';
    return null;
  };



  const addDrop = () => {
    setDrops((prev) => {
      if (prev.length >= 10) return prev;
      return [
        ...prev,
        {
          id: `drop-${Date.now()}`,
          value: '',
        },
      ];
    });
  };

  const removeDrop = (id: string) => {
    setDrops((prev) => prev.filter((drop) => drop.id !== id));
  };

  const updateDrop = (id: string, patch: Partial<DropDraft>) => {
    setDrops((prev) => prev.map((drop) => (drop.id === id ? { ...drop, ...patch } : drop)));
  };

  const handleImageUpload = useCallback((file?: File | null) => {
    if (!file) return;
    setImageError(null);
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image too large (max 5 MB).');
      return;
    }
    setIsImageUploading(true);
    setUploadProgress(0);

    const { promise, abort } = api.uploadCaseImageWithProgress(file, (pct) => setUploadProgress(pct));
    uploadAbortRef.current = abort;

    promise
      .then((response) => {
        const url = response.data?.imageUrl;
        if (!url) { setImageError('Upload failed. Try another image.'); return; }
        setImageUrl(url);
        setImageMeta({ fit: 'contain', scale: 1, x: 0, y: 0 });
        setIsLogoAdjustOpen(true);
      })
      .catch((err) => {
        if (err?.message !== 'Upload cancelled') setImageError('Upload failed. Try another image.');
      })
      .finally(() => {
        setIsImageUploading(false);
        setUploadProgress(0);
        uploadAbortRef.current = null;
      });
  }, []);

  const cancelImageUpload = useCallback(() => {
    uploadAbortRef.current?.();
    setIsImageUploading(false);
    setUploadProgress(0);
    uploadAbortRef.current = null;
  }, []);

  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/u;
  const isEmoji = (value: string) => emojiRegex.test(value);
  const isImageUrl = (value: string) => value.startsWith('http') || value.startsWith('/');

  const normalizedName = name.trim().toUpperCase();
  const normalizedTicker = tokenTicker.trim().toUpperCase();
  const imageTrimmed = imageUrl.trim();
  const priceValueNumber = Number(price);
  const rtuValueNumber = Number(rtu);
  const tokenPriceValueNumber = Number(tokenPrice);
  const dropsAreValid =
    drops.length > 0 &&
    drops.every((drop) => Number(drop.value) > 0) &&
    new Set(drops.map((drop) => Number(drop.value))).size === drops.length;
  const imageIsValid = Boolean(imageTrimmed) && (isImageUrl(imageTrimmed) || isEmoji(imageTrimmed));
  const priceError = !price
    ? 'Open price is required.'
    : !Number.isFinite(priceValueNumber) || priceValueNumber <= 0
      ? 'Open price must be greater than 0.'
      : null;
  const tokenPriceError = !tokenPrice
    ? 'Token price is required.'
    : !Number.isFinite(tokenPriceValueNumber) || tokenPriceValueNumber <= 0
      ? 'Token price must be greater than 0.'
      : null;
  const dropRangeHint = useMemo(() => {
    if (!Number.isFinite(priceValueNumber) || priceValueNumber <= 0) return null;
    if (!Number.isFinite(rtuValueNumber) || rtuValueNumber <= 0) return null;
    if (!Number.isFinite(tokenPriceValueNumber) || tokenPriceValueNumber <= 0) return null;

    const minAllowedToken = priceValueNumber * 0.5;
    const maxAllowedToken = priceValueNumber * 15;
    const validDropValues = normalizedDrops
      .map((drop) => Number(drop.value))
      .filter((value) => Number.isFinite(value) && value > 0);

    const hasCompleteValidDrops =
      normalizedDrops.length > 0 && validDropValues.length === normalizedDrops.length;
    const minToken = validDropValues.length ? Math.min(...validDropValues) : null;
    const maxToken = validDropValues.length ? Math.max(...validDropValues) : null;
    const feasible = hasCompleteValidDrops
      ? (minToken !== null && maxToken !== null && minToken <= minAllowedToken && maxToken >= maxAllowedToken)
      : false;

    return {
      minAllowedToken,
      maxAllowedToken,
      hasCompleteValidDrops,
      feasible,
    };
  }, [priceValueNumber, rtuValueNumber, tokenPriceValueNumber, normalizedDrops]);

  const dropsError = drops.length === 0
    ? 'Add at least one drop.'
    : drops.some((drop) => !drop.value || Number(drop.value) <= 0)
      ? (dropRangeHint ? null : 'Each drop must have a positive value.')
      : new Set(drops.map((drop) => Number(drop.value))).size !== drops.length
        ? 'Drop values must be unique.'
        : null;
  const imageValidationError = !imageTrimmed
    ? 'Upload a case logo or choose an emoji.'
    : !imageIsValid
      ? 'Logo must be an emoji or an uploaded image.'
      : null;
  const liveNameError = validateCaseName(normalizedName, normalizedTicker);
  const liveTickerError = validateTicker(normalizedTicker, normalizedName);
  const liveRtuError = validateRtu(rtu);
  const validationMessages = [
    normalizedName ? liveNameError : 'Case name is required.',
    normalizedTicker ? liveTickerError : 'Token ticker is required.',
    liveRtuError || (!rtu ? 'RTU is required.' : null),
    priceError,
    tokenPriceError,
    imageValidationError,
    isImageUploading ? 'Wait for image upload to finish.' : null,
  ].filter((message): message is string => Boolean(message));
  const isCreateDisabled =
    !normalizedName ||
    !normalizedTicker ||
    !price ||
    !rtu ||
    !tokenPrice ||
    Boolean(liveNameError) ||
    Boolean(liveTickerError) ||
    Boolean(liveRtuError) ||
    !dropsAreValid ||
    !imageIsValid ||
    isImageUploading ||
    isCreating;

  const priceValue = Number(price);
  const rtuValue = Number(rtu);
  const tokenPriceValue = Number(tokenPrice);

  const rtuHelper = useMemo(() => {
    if (!dropRangeHint) return null;
    return {
      minAllowedToken: dropRangeHint.minAllowedToken,
      maxAllowedToken: dropRangeHint.maxAllowedToken,
      feasible: dropRangeHint.feasible,
      hint: dropRangeHint.hasCompleteValidDrops
        ? (dropRangeHint.feasible ? 'Drop limits are valid.' : 'Drop limits are out of range.')
        : 'Set drop values to match required min/max range.',
    };
  }, [dropRangeHint]);

  const handleSubmit = async () => {
    if (isCreating) return;
    setSubmitError(null);
    if (isImageUploading) {
      setSubmitError('Wait for image upload to finish.');
      return;
    }
    if (!name.trim()) return setSubmitError('Enter a case name.');
    const nameTrimmed = name.trim();
    const normalizedName = nameTrimmed.toUpperCase();
    const normalizedTicker = tokenTicker.trim().toUpperCase();
    const nameValidation = validateCaseName(normalizedName, normalizedTicker);
    if (nameValidation) {
      setSubmitError(nameValidation);
      setNameError(nameValidation);
      return;
    }
    if (!tokenTicker.trim()) return setSubmitError('Enter a token ticker.');
    const tickerValidation = validateTicker(normalizedTicker, normalizedName);
    if (tickerValidation) {
      setSubmitError(tickerValidation);
      setTickerError(tickerValidation);
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) return setSubmitError('Enter a valid open price.');
    const rtuValidation = validateRtu(rtu);
    if (rtuValidation) {
      setSubmitError(rtuValidation);
      setRtuError(rtuValidation);
      return;
    }
    if (!Number.isFinite(rtuValue) || rtuValue <= 0 || rtuValue > 98) return setSubmitError('Enter a valid RTU (>0 and <=98).');
    if (!Number.isFinite(tokenPriceValue) || tokenPriceValue <= 0) return setSubmitError('Enter a valid token price.');
    if (drops.length === 0) return setSubmitError('Add at least one drop.');
    if (drops.some((drop) => !drop.value || Number(drop.value) <= 0)) {
      return setSubmitError('Fill in a positive value for each drop.');
    }
    const valueSet = new Set(drops.map((drop) => Number(drop.value)));
    if (valueSet.size !== drops.length) {
      return setSubmitError('Drop values must be unique.');
    }
    const imageTrimmed = imageUrl.trim();
    if (!imageTrimmed) {
      setSubmitError('Upload a case logo or choose an emoji.');
      return;
    }
    if (!isImageUrl(imageTrimmed) && !isEmoji(imageTrimmed)) {
      setSubmitError('Logo must be an emoji or an uploaded image.');
      return;
    }
    if (balance < CREATE_CASE_FEE) {
      setSubmitError(`Need ${formatShortfallUp(CREATE_CASE_FEE - balance)} ₮ more. Top up to create.`);
      return;
    }

    try {
      setIsCreating(true);
      startCreationProgress();
      const response = await api.createCase({
        name: normalizedName,
        currency: normalizedTicker,
        tokenTicker: normalizedTicker,
        price: priceValue,
        rtu: rtuValue,
        tokenPrice: tokenPriceValue,
        openDurationHours,
        imageUrl: imageTrimmed,
        imageMeta,
        drops: normalizedDrops.map((drop) => ({
          name: drop.name,
          value: drop.value,
          currency: drop.currency,
          rarity: drop.rarity,
          color: drop.color,
          image: drop.image,
        })),
      });

      const caseData = response.data?.case;
      if (!caseData) return;

      const mappedCase: Case = {
        id: caseData.id,
        name: caseData.name,
        currency: caseData.currency,
        tokenTicker: caseData.tokenTicker || caseData.currency,
        tokenPrice: caseData.tokenPrice,
        price: caseData.price,
        image: resolveAssetUrl(caseData.imageUrl || imageTrimmed),
        imageMeta: caseData.imageMeta || imageMeta,
        rtu: caseData.rtu,
        openDurationHours: caseData.openDurationHours,
        createdAt: caseData.createdAt ? new Date(caseData.createdAt).getTime() : Date.now(),
        creatorName: caseData.createdBy?.username || creatorName,
        possibleDrops: (caseData.drops || []).map((drop: any) => ({
          id: drop.id,
          name: drop.name,
          value: drop.value,
          currency: drop.currency,
          rarity: drop.rarity,
          image: resolveAssetUrl(drop.image || imageTrimmed),
          imageMeta: caseData.imageMeta || imageMeta,
          color: drop.color,
        })),
      };

      const nextBalance = (response.data as { balance?: number } | undefined)?.balance;
      if (typeof nextBalance === 'number' && onBalanceUpdate) {
        onBalanceUpdate(nextBalance);
      }

      finishCreationProgress();
      await new Promise(r => setTimeout(r, 800));
      onCreate(mappedCase);
    } catch (error: any) {
      creationTimers.current.forEach(t => clearTimeout(t));
      creationTimers.current = [];
      setSubmitError(error?.message || 'Failed to create case. Try again.');
    } finally {
      setIsCreating(false);
      setCreationProgress(0);
    }
  };

  return (
    <div className={`w-full text-white relative ${isTelegramMiniApp ? 'min-h-0 px-2 py-3' : 'min-h-screen px-6 py-12'}`}>
      <div className={`max-w-6xl mx-auto ${isTelegramMiniApp ? 'space-y-4' : 'space-y-8'}`}>
        <div className="flex items-center justify-between">
          <div>
            {isTelegramMiniApp ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Case Creator</div>
                <h1 className="text-xl font-black tracking-tight text-white mt-1">Create Case</h1>
              </>
            ) : (
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                MY
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">
                  CUSTOMCASE
                </span>
              </h1>
            )}
          </div>
        </div>

        <div className={`grid ${isTelegramMiniApp ? 'grid-cols-1 gap-3' : 'grid-cols-1 lg:grid-cols-3 gap-6'}`}>
          <div
            className={`bg-black/20 border border-white/[0.12] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl overflow-visible relative z-10 ${
              isTelegramMiniApp ? 'p-4' : 'p-6 lg:col-span-2'
            }`}
          >
            <div className={`grid grid-cols-1 ${isTelegramMiniApp ? 'gap-3' : 'md:grid-cols-2 gap-4'}`}>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Case Name</div>
                <input
                  value={name}
                  onChange={(e) => {
                    const next = sanitizeCaseName(e.target.value);
                    setName(next);
                    const nextTicker = sanitizeToken(tokenTicker).trim();
                    setNameError(validateCaseName(next.trim(), nextTicker));
                    setTickerError(validateTicker(nextTicker, next.trim()));
                  }}
                  placeholder="MY LEGENDARY CASE"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
                {nameError && (
                  <div className="text-[10px] uppercase tracking-widest text-red-400">{nameError}</div>
                )}
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Token Ticker ($)</div>
                <input
                  value={tokenTicker}
                  onChange={(e) => {
                    const next = sanitizeToken(e.target.value);
                    setTokenTicker(next);
                    const nextName = sanitizeCaseName(name).trim();
                    setTickerError(validateTicker(next.trim(), nextName));
                    setNameError(validateCaseName(nextName, next.trim()));
                  }}
                  placeholder="E.G. TOKEN"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
                {tickerError && (
                  <div className="text-[10px] uppercase tracking-widest text-red-400">{tickerError}</div>
                )}
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Open Price (₮)</div>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min={1}
                  placeholder="e.g. 10"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
                {priceError && (
                  <div className="text-[10px] uppercase tracking-widest text-red-400">{priceError}</div>
                )}
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">RTU %</div>
                <input
                  type="number"
                  value={rtu}
                  onChange={(e) => {
                    setRtu(e.target.value);
                    setRtuError(validateRtu(e.target.value));
                  }}
                  min={1}
                  step={0.01}
                  max={98}
                  placeholder="e.g. 95"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
                {rtuError && (
                  <div className="text-[10px] uppercase tracking-widest text-red-400">{rtuError}</div>
                )}
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Token Price</div>
                <input
                  type="number"
                  value={tokenPrice}
                  onChange={(e) => setTokenPrice(e.target.value)}
                  min={0.0001}
                  placeholder="e.g. 0.25"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
                {tokenPriceError && (
                  <div className="text-[10px] uppercase tracking-widest text-red-400">{tokenPriceError}</div>
                )}
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Case Duration</div>
                <div className="relative">
                  <select
                    value={openDurationHours}
                    onChange={(e) => setOpenDurationHours(Number(e.target.value))}
                    className="w-full px-4 py-3 pr-10 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl appearance-none"
                  >
                    {durationOptions.map((option) => (
                      <option key={option.label} value={option.value} className="bg-[#0B0C10] text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </label>
              <div className="space-y-2 md:col-span-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Token Logo (Upload or Emoji)</div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <div
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] cursor-pointer hover:border-web3-accent/50 transition pointer-events-none"
                    >
                      <UploadCloud size={16} className="text-web3-accent" />
                      <span className="text-xs uppercase tracking-widest text-gray-300">
                        {isImageUploading ? 'Uploading...' : 'Choose Image'}
                      </span>
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => { handleImageUpload(e.target.files?.[0]); e.target.value = ''; }}
                      disabled={isImageUploading}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEmojiOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] text-xs uppercase tracking-widest text-gray-300 hover:border-web3-accent/50 transition"
                  >
                    <Smile size={16} className="text-web3-accent" />
                    Choose Emoji
                  </button>
                  {imageUrl && isImageUrl(imageUrl) && (
                    <button
                      type="button"
                      onClick={() => setIsLogoAdjustOpen(true)}
                      className="text-[10px] uppercase tracking-widest text-web3-accent hover:text-white transition"
                    >
                      Adjust
                    </button>
                  )}
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {isEmojiOpen && (
                  <div className="mt-3 w-80 max-h-64 p-3 rounded-xl bg-black/70 border border-white/[0.12] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl z-[60] overflow-y-auto">
                    <div className="grid grid-cols-8 gap-2 text-white text-lg">
                      {[
                        '🚀','💎','🔥','✨','🌙','🐕','🐸','🪙','🎯','⚡️','👑','🧊',
                        '🧠','🦊','🐧','🐳','🦈','🦄','🐼','🐯','🦁','🐙','🐲','🦂',
                        '⭐️','🌟','☀️','🌈','🌊','🌋','❄️','🍀','🌵','🍄','🎲','🧩',
                        '⚔️','🛡️','🏆','🎮','🧪','🧬','💫','🪐','📈','💰','🧿',
                        '💥','🔮','🎁','🧨','🔱','🗿','🧧','🔔','🪄','🛸','🚨',
                      ].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setImageUrl(emoji);
                            setImageMeta({ fit: 'contain', scale: 1, x: 0, y: 0 });
                            setIsEmojiOpen(false);
                          }}
                          className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition flex items-center justify-center"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(imageError || imageValidationError) && (
                  <div className="text-[11px] uppercase tracking-widest text-red-400">
                    {imageError || imageValidationError}
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-widest text-gray-600">
                  PNG/JPG/WebP/GIF • up to 5 MB • max 1024px
                </div>
              </div>
            </div>
          </div>

          <div
            className={`bg-black/20 border border-white/[0.12] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${
              isTelegramMiniApp ? 'p-4' : 'p-6'
            }`}
          >
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Preview</div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full border border-white/[0.12] bg-black/30 flex items-center justify-center backdrop-blur-xl overflow-hidden">
                {imageUrl ? (
                  isImageUrl(imageUrl) ? (
                    <ImageWithMeta
                      src={imageUrl}
                      meta={imageMeta}
                      className="w-full h-full rounded-full"
                      imgClassName="w-full h-full"
                    />
                  ) : (
                    <span className="text-4xl">{imageUrl}</span>
                  )
                ) : (
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>
                )}
              </div>
              <div className="text-lg font-bold text-center">
                {name || 'Untitled Case'}
                {tokenTicker && (
                  <div className="text-xs uppercase tracking-widest text-gray-400 mt-1">
                    ${tokenTicker}
                  </div>
                )}
              </div>
              <div className="px-4 py-2 rounded-xl text-xs bg-web3-card/50 border border-gray-700/50 backdrop-blur-sm">
                <span className="font-bold text-gray-200">{price || '—'} ₮</span>
                <span className="text-gray-500"> • RTU {rtu || '—'}%</span>
              </div>
              <div className="text-xs text-gray-500">Duration {formatDuration(openDurationHours)} • 1 ${tokenTicker || 'TOKEN'} = {tokenPrice || '—'}</div>
            </div>
          </div>
        </div>

        <ImageAdjustModal
          open={isLogoAdjustOpen && Boolean(imageUrl && isImageUrl(imageUrl))}
          src={imageUrl}
          initialMeta={imageMeta}
          defaultMeta={{ fit: 'contain', scale: 1, x: 0, y: 0 }}
          shape="square"
          title="Logo Display"
          onClose={() => setIsLogoAdjustOpen(false)}
          onSave={(nextMeta) => {
            setImageMeta(nextMeta);
            setIsLogoAdjustOpen(false);
          }}
        />

        <div
          className={`bg-black/20 border border-white/[0.12] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl relative z-0 ${
            isTelegramMiniApp ? 'p-4' : 'p-6'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-gray-500">Drops ({drops.length}/10)</div>
            <button
              onClick={addDrop}
              disabled={drops.length >= 10}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-wider hover:text-white"
            >
              <Plus size={14} />
              Add Drop
            </button>
          </div>

          {isTelegramMiniApp ? (
            <div className="space-y-2">
              {drops.map((drop, index) => (
                <div key={drop.id} className="rounded-xl border border-white/[0.12] bg-black/25 p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg border border-white/[0.12] bg-black/35 text-[10px] uppercase tracking-widest text-gray-400 flex items-center justify-center">
                      {index + 1}
                    </div>
                    <input
                      type="number"
                      value={drop.value}
                      onChange={(e) => updateDrop(drop.id, { value: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-lg bg-black/35 border border-white/[0.12] text-sm"
                      placeholder="Drop value (token amount)"
                    />
                    <button
                      type="button"
                      onClick={() => removeDrop(drop.id)}
                      className="w-9 h-9 rounded-lg border border-white/[0.12] text-gray-400 hover:text-web3-danger transition flex items-center justify-center"
                      aria-label="Remove drop"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 justify-items-start">
              {drops.map((drop) => (
                <div key={drop.id} className="bg-black/25 border border-white/[0.12] backdrop-blur-xl p-3 rounded-xl w-full max-w-[180px]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500">Drop</div>
                    <button onClick={() => removeDrop(drop.id)} className="text-gray-500 hover:text-web3-danger">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <input
                      type="number"
                      value={drop.value}
                      onChange={(e) => updateDrop(drop.id, { value: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-black/30 border border-white/[0.12] backdrop-blur-xl"
                      placeholder="e.g. 100"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isTelegramMiniApp ? (
            <div className="mt-4">
              {rtuHelper && (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-[11px] uppercase tracking-widest ${
                  rtuHelper.feasible
                    ? 'bg-web3-success/10 border-web3-success/30 text-web3-success'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  <div>{rtuHelper.hint}</div>
                  <div className="mt-1 text-[10px] tracking-wide text-gray-300">
                    Minimum drop (required): {'<='} {rtuHelper.minAllowedToken.toFixed(4)} tokens
                  </div>
                  <div className="mt-1 text-[10px] tracking-wide text-gray-300">
                    Maximum drop (required): {'>='} {rtuHelper.maxAllowedToken.toFixed(4)} tokens
                  </div>
                </div>
              )}
              {dropsError && (
                <div className="mt-3 text-[11px] uppercase tracking-widest text-red-400">{dropsError}</div>
              )}
            </div>
          ) : (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Drops Preview</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {normalizedDrops.map((drop) => (
                  <ItemCard key={drop.id} item={drop} size="md" currencyPrefix="$" />
                ))}
              </div>
              {rtuHelper && (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-[11px] uppercase tracking-widest ${
                  rtuHelper.feasible
                    ? 'bg-web3-success/10 border-web3-success/30 text-web3-success'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  <div>{rtuHelper.hint}</div>
                  <div className="mt-1 text-[10px] tracking-wide text-gray-300">
                    Minimum drop (required): {'<='} {rtuHelper.minAllowedToken.toFixed(4)} tokens
                  </div>
                  <div className="mt-1 text-[10px] tracking-wide text-gray-300">
                    Maximum drop (required): {'>='} {rtuHelper.maxAllowedToken.toFixed(4)} tokens
                  </div>
                </div>
              )}
              {dropsError && (
                <div className="mt-3 text-[11px] uppercase tracking-widest text-red-400">{dropsError}</div>
              )}
            </div>
          )}

          <div className={`mt-6 flex flex-col items-center gap-3 ${isTelegramMiniApp ? 'sticky bottom-0 z-20 bg-[#0B1018]/95 backdrop-blur-xl rounded-xl p-3 border border-white/[0.08]' : ''}`}>
            {submitError && (
              <div className="text-[11px] uppercase tracking-widest text-red-400">{submitError}</div>
            )}
            {!submitError && validationMessages.length > 0 && (
              <div className="text-[11px] uppercase tracking-widest text-red-400 text-center">
                {validationMessages[0]}
              </div>
            )}
            <div className="flex items-center justify-center w-full">
              <AdminActionButton
                isAuthenticated={isAuthenticated}
                isAdmin={isAdmin}
                balance={balance}
                cost={CREATE_CASE_FEE}
                onConnect={onOpenWalletConnect}
                onTopUp={onOpenTopUp}
                onAction={handleSubmit}
                readyLabel={
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Case · {CREATE_CASE_FEE} ₮
                  </>
                }
                labelOverride={isCreating ? 'Creating...' : undefined}
                forceLabel={isCreating}
                disabled={isCreateDisabled}
                className={`w-full max-w-md font-black rounded-2xl uppercase tracking-wide flex items-center justify-center gap-2 ${isTelegramMiniApp ? 'h-10 px-6 text-xs' : 'h-[52px] px-10 text-sm'}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Case creation progress overlay */}
      {isCreating && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[320px] rounded-2xl border border-white/[0.08] bg-[#0B1018] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-web3-accent/10 border border-web3-accent/20 flex items-center justify-center">
                <Rocket size={20} className="text-web3-accent animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Creating Case</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Please wait</div>
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-white/[0.06] overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${creationProgress}%`,
                  background: creationProgress === 100
                    ? 'linear-gradient(90deg, #10B981, #66FCF1)'
                    : 'linear-gradient(90deg, #66FCF1, #8B5CF6)',
                }}
              />
            </div>

            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 truncate">{creationStage}</span>
              <span className="text-xs font-mono text-web3-accent tabular-nums ml-2">{creationProgress}%</span>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-web3-accent animate-pulse" />
                <span className="text-[10px] text-gray-500">This may take up to a minute</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {isImageUploading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[280px] rounded-2xl border border-white/[0.08] bg-[#0B1018] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <UploadCloud size={20} className="text-web3-accent animate-pulse" />
              <span className="text-sm font-bold text-white">Uploading Image</span>
            </div>

            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-web3-accent to-web3-success transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="text-xs tabular-nums text-gray-400 text-right mb-5">
              {uploadProgress}%
            </div>

            <button
              type="button"
              onClick={cancelImageUpload}
              className="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-semibold text-red-400 active:scale-[0.97] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
