import React, { useMemo, useState } from 'react';
import { Case, Item, Rarity } from '../types';
import { Plus, Trash2, Sparkles, ChevronDown, Smile } from 'lucide-react';
import { ItemCard } from './ItemCard';
import { api } from '../services/api';

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
  onOpenTopUp: () => void;
  onBalanceUpdate?: (balance: number) => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
}

export const CreateCaseView: React.FC<CreateCaseViewProps> = ({ onCreate, creatorName, balance, onOpenTopUp, onBalanceUpdate, isAuthenticated, onOpenWalletConnect }) => {
  const [name, setName] = useState('');
  const [tokenTicker, setTokenTicker] = useState('');
  const [price, setPrice] = useState('');
  const [rtu, setRtu] = useState('');
  const [tokenPrice, setTokenPrice] = useState('');
  const [openDurationHours, setOpenDurationHours] = useState(24);
  const [image, setImage] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sanitizeEnglishUpper = (value: string, allowSpaces = false) => {
    const normalized = value.toUpperCase();
    const pattern = allowSpaces ? /[^A-Z\s]/g : /[^A-Z]/g;
    return normalized.replace(pattern, '');
  };
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
        image: image || '',
        color: RARITY_COLORS[rarity],
      };
    }) as Item[];
  }, [drops, tokenTicker, image]);

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

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!name.trim()) return setSubmitError('Enter a case name.');
    const nameTrimmed = name.trim();
    if (/^\d+$/.test(nameTrimmed)) {
      return setSubmitError('Case name cannot consist only of numbers.');
    }
    if (!tokenTicker.trim()) return setSubmitError('Enter a token ticker.');
    const priceValue = Number(price);
    const rtuValue = Number(rtu);
    const tokenPriceValue = Number(tokenPrice);

    if (!Number.isFinite(priceValue) || priceValue <= 0) return setSubmitError('Enter a valid open price.');
    if (!Number.isFinite(rtuValue) || rtuValue <= 0 || rtuValue > 100) return setSubmitError('Enter a valid RTU.');
    if (!Number.isFinite(tokenPriceValue) || tokenPriceValue <= 0) return setSubmitError('Enter a valid token price.');
    if (drops.length === 0) return setSubmitError('Add at least one drop.');
    if (drops.some((drop) => !drop.value || Number(drop.value) <= 0)) {
      return setSubmitError('Fill in a positive value for each drop.');
    }
    const valueSet = new Set(drops.map((drop) => Number(drop.value)));
    if (valueSet.size !== drops.length) {
      return setSubmitError('Drop values must be unique.');
    }
    if (!image.trim()) {
      setSubmitError('Add a logo (emoji or image URL).');
      return;
    }
    const imageTrimmed = image.trim();
    const isUrl = imageTrimmed.startsWith('http://') || imageTrimmed.startsWith('https://');
    // Check for emoji: Unicode ranges for emojis and common symbols
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/u;
    const isEmoji = !isUrl && emojiRegex.test(imageTrimmed);
    if (!isUrl && !isEmoji) {
      setSubmitError('Logo must be an emoji or a valid image URL.');
      return;
    }
    if (balance < CREATE_CASE_FEE) {
      setSubmitError(`Need ${(CREATE_CASE_FEE - balance).toFixed(1)} ₮ more. Top up to create.`);
      return;
    }

    const probability = Math.floor(100 / normalizedDrops.length);

    try {
      const response = await api.createCase({
        name: name.trim(),
        currency: tokenTicker.trim().toUpperCase(),
        tokenTicker: tokenTicker.trim().toUpperCase(),
        price: priceValue,
        rtu: rtuValue,
        tokenPrice: tokenPriceValue,
        openDurationHours,
        imageUrl: image,
        drops: normalizedDrops.map((drop) => ({
          name: drop.name,
          value: drop.value,
          currency: drop.currency,
          rarity: drop.rarity,
          color: drop.color,
          image: drop.image,
          probability,
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
        image: caseData.imageUrl || image,
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
          image: drop.image || image,
          color: drop.color,
        })),
      };

      if (typeof response.data?.balance === 'number' && onBalanceUpdate) {
        onBalanceUpdate(response.data.balance);
      }

      onCreate(mappedCase);
    } catch (error) {
      setSubmitError('Failed to create case. Try again.');
    }
  };

  const emojiOptions = [
    '🚀', '💎', '🔥', '✨', '🌙', '🐕', '🐸', '🪙', '🎯', '⚡️', '👑', '🧊',
    '🧠', '🦊', '🐧', '🐳', '🦈', '🦄', '🐼', '🐯', '🦁', '🐙', '🐲', '🦂',
    '⭐️', '🌟', '☀️', '🌈', '🌊', '🌋', '❄️', '🍀', '🌵', '🍄', '🎲', '🧩',
    '⚔️', '🛡️', '🏆', '🎮', '🎯', '🧪', '🧬', '💫', '🪐', '📈', '💰', '🧿',
    '💥', '🔮', '🎁', '🧨', '🔱', '🗿', '🪙', '🧧', '🔔', '🪄', '🛸', '🚨',
  ];

  return (
    <div className="w-full min-h-screen text-white px-6 py-12 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-500">Create</div>
            <h1 className="text-4xl font-black tracking-tight">Your Custom Case</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl lg:col-span-2 overflow-visible relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Case Name</div>
                <input
                  value={name}
                  onChange={(e) => setName(sanitizeEnglishUpper(e.target.value, true))}
                  placeholder="MY LEGENDARY CASE"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Token Ticker ($)</div>
                <input
                  value={tokenTicker}
                  onChange={(e) => setTokenTicker(sanitizeEnglishUpper(e.target.value))}
                  placeholder="E.G. TOKEN"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
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
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">RTU %</div>
                <input
                  type="number"
                  value={rtu}
                  onChange={(e) => setRtu(e.target.value)}
                  min={1}
                  max={100}
                  placeholder="e.g. 95"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                />
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
              </label>
              <label className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Case Duration</div>
                <div className="relative">
                  <select
                    value={openDurationHours}
                    onChange={(e) => setOpenDurationHours(Number(e.target.value))}
                    className="w-full px-4 py-3 pr-10 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl appearance-none"
                  >
                    {[2, 6, 12, 24, 72].map((hours) => (
                      <option key={hours} value={hours} className="bg-[#0B0C10] text-white">
                        {hours}h
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </label>
              <label className="space-y-2 md:col-span-2">
                <div className="text-xs uppercase tracking-widest text-gray-500">Token Logo (URL or emoji)</div>
                <div className="relative">
                  <input
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://... or 🚀"
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-black/30 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 backdrop-blur-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setIsEmojiOpen((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                    aria-label="Pick emoji"
                  >
                    <Smile size={18} />
                  </button>
                  {isEmojiOpen && (
                    <div className="absolute right-0 mt-2 w-72 max-h-64 p-3 rounded-xl bg-black/70 border border-white/[0.12] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl z-[60] overflow-y-auto">
                      <div className="grid grid-cols-7 gap-2 text-white text-lg">
                        {emojiOptions.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setImage(emoji);
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
                </div>
              </label>
            </div>
          </div>

          <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Preview</div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full border border-white/[0.12] bg-black/30 flex items-center justify-center backdrop-blur-xl">
                {image ? (
                  image.startsWith('http') ? (
                    <img src={image} alt="token logo" className="w-12 h-12 object-contain" />
                  ) : (
                    <span className="text-3xl">{image}</span>
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
              <div className="px-3 py-1 rounded-full text-xs bg-web3-accent/10 border border-web3-accent/30">
                {price || '—'} ₮ • RTU {rtu || '—'}%
              </div>
              <div className="text-xs text-gray-500">Duration {openDurationHours}h • 1 ${tokenTicker || 'TOKEN'} = {tokenPrice || '—'}</div>
            </div>
          </div>
        </div>

        <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl relative z-0">
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

          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Drops Preview</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {normalizedDrops.map((drop) => (
                <ItemCard key={drop.id} item={drop} size="md" currencyPrefix="$" />
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2">
            {submitError && (
              <div className="text-[11px] uppercase tracking-widest text-red-400">{submitError}</div>
            )}
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-web3-accent/25 to-web3-purple/25 text-xs font-black text-web3-accent border border-web3-accent/50 shadow-[0_0_14px_rgba(102,252,241,0.3)]">
                {CREATE_CASE_FEE} ₮
              </div>
              <button
                onClick={!isAuthenticated ? onOpenWalletConnect : balance < CREATE_CASE_FEE ? onOpenTopUp : handleSubmit}
                className={`group relative px-8 py-3 text-sm font-black rounded-xl overflow-hidden transform transition-all duration-300 ${
                  !isAuthenticated || balance >= CREATE_CASE_FEE
                    ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105 hover:shadow-[0_0_40px_rgba(102,252,241,0.6)]'
                    : 'bg-gray-700/80 text-gray-400 border border-red-500/40 hover:border-red-500/60'
                }`}
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                <span className="relative flex items-center gap-2 uppercase tracking-wide">
                  {!isAuthenticated ? (
                    <>Connect Wallet</>
                  ) : balance < CREATE_CASE_FEE ? (
                    <>Need {(CREATE_CASE_FEE - balance).toFixed(1)} ₮ more • Top up</>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create Case
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
