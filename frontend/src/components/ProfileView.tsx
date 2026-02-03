import React, { useState, useMemo } from 'react';
import { User, Item } from '../types';
import { Copy, ArrowUp, ArrowDown, Swords, Package, Coins, User as UserIcon, Settings } from 'lucide-react';
import { ItemCard } from './ItemCard';

const formatWalletAddress = (address: string): string => {
  if (!address) return '';
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

interface BattleRecord {
  id: string;
  opponent: string;
  result: 'WIN' | 'LOSS';
  cost: number;
  wonValue: number;
  wonItems: Item[];
}

interface ProfileViewProps {
  user: User;
  inventory: Item[];
  burntItems: Item[];
  battleHistory: BattleRecord[];
  balance: number;
  isEditable?: boolean;
  onUpdateUsername?: (username: string) => Promise<void> | void;
  onUploadAvatar?: (file: File) => Promise<string | void> | string | void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  inventory,
  burntItems,
  battleHistory,
  balance,
  isEditable = false,
  onUpdateUsername,
  onUploadAvatar,
}) => {
  const [tab, setTab] = useState<'inventory' | 'burnt' | 'battles'>('inventory');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [portfolioSort, setPortfolioSort] = useState<'name' | 'amount'>('name');
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [inventoryPage, setInventoryPage] = useState(0);
  const [burntPage, setBurntPage] = useState(0);
  const [battlePage, setBattlePage] = useState(0);
  const [editName, setEditName] = useState(user?.username || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const ITEMS_PER_PAGE = 36;
  const BATTLES_PER_PAGE = 10;

  const sortedInventory = useMemo(() => {
    try {
      if (!inventory || !Array.isArray(inventory)) return [];
      return [...inventory].sort((a, b) => {
        const aValue = Number(a?.value) || 0;
        const bValue = Number(b?.value) || 0;
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      });
    } catch (error) {
      console.error('Error sorting inventory:', error);
      return [];
    }
  }, [inventory, sortOrder]);

  const inventoryTotalPages = useMemo(() => {
    try {
      const length = Array.isArray(sortedInventory) ? sortedInventory.length : 0;
      return Math.max(1, Math.ceil(length / ITEMS_PER_PAGE));
    } catch (error) {
      console.error('Error calculating inventory pages:', error);
      return 1;
    }
  }, [sortedInventory]);

  const burntTotalPages = useMemo(() => {
    try {
      const length = Array.isArray(burntItems) ? burntItems.length : 0;
      return Math.max(1, Math.ceil(length / ITEMS_PER_PAGE));
    } catch (error) {
      console.error('Error calculating burnt pages:', error);
      return 1;
    }
  }, [burntItems]);

  const battleTotalPages = useMemo(() => {
    try {
      const length = Array.isArray(battleHistory) ? battleHistory.length : 0;
      return Math.max(1, Math.ceil(length / BATTLES_PER_PAGE));
    } catch (error) {
      console.error('Error calculating battle pages:', error);
      return 1;
    }
  }, [battleHistory]);

  const pagedInventory = useMemo(() => {
    try {
      if (!sortedInventory || !Array.isArray(sortedInventory)) return [];
      const start = inventoryPage * ITEMS_PER_PAGE;
      return sortedInventory.slice(start, start + ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error paginating inventory:', error);
      return [];
    }
  }, [sortedInventory, inventoryPage]);

  const pagedBurnt = useMemo(() => {
    try {
      if (!burntItems || !Array.isArray(burntItems)) return [];
      const start = burntPage * ITEMS_PER_PAGE;
      return burntItems.slice(start, start + ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error paginating burnt items:', error);
      return [];
    }
  }, [burntItems, burntPage]);

  const pagedBattleHistory = useMemo(() => {
    try {
      if (!battleHistory || !Array.isArray(battleHistory)) return [];
      const start = battlePage * BATTLES_PER_PAGE;
      return battleHistory.slice(start, start + BATTLES_PER_PAGE);
    } catch (error) {
      console.error('Error paginating battle history:', error);
      return [];
    }
  }, [battleHistory, battlePage]);

  React.useEffect(() => {
    if (inventoryPage > inventoryTotalPages - 1) {
      setInventoryPage(Math.max(0, inventoryTotalPages - 1));
    }
  }, [inventoryTotalPages, inventoryPage]);

  React.useEffect(() => {
    if (burntPage > burntTotalPages - 1) {
      setBurntPage(Math.max(0, burntTotalPages - 1));
    }
  }, [burntTotalPages, burntPage]);

  React.useEffect(() => {
    if (battlePage > battleTotalPages - 1) {
      setBattlePage(Math.max(0, battleTotalPages - 1));
    }
  }, [battleTotalPages, battlePage]);

  React.useEffect(() => {
    setEditName(user?.username || '');
  }, [user?.username]);

  React.useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  React.useEffect(() => {
    if (user?.avatar) {
      setAvatarPreview(null);
      setAvatarError(null);
    }
  }, [user?.avatar]);

  const handleSaveName = async () => {
    if (!onUpdateUsername) return;
    const nextName = (editName || '').trim().toUpperCase();
    if (!nextName) {
      setNameError('Enter a username.');
      return;
    }
    if (!/^[A-Z0-9 ]{3,20}$/.test(nextName)) {
      setNameError('Use 3-20 chars (A-Z, 0-9, spaces).');
      return;
    }
    if (/^\d+$/.test(nextName)) {
      setNameError('Username cannot be only numbers.');
      return;
    }
    setNameError(null);
    setIsSavingName(true);
    try {
      await onUpdateUsername(nextName);
    } catch (error) {
      setNameError('Failed to update username.');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAvatarChange = async (file?: File | null) => {
    if (!file || !onUploadAvatar) return;
    setAvatarError(null);
    if (file.size > 1024 * 1024) {
      setAvatarError('Avatar too large (max 1MB).');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setIsUploadingAvatar(true);
    try {
      const nextUrl = await onUploadAvatar(file);
      if (typeof nextUrl === 'string' && nextUrl) {
        setAvatarPreview(nextUrl);
      }
    } catch (error) {
      setAvatarError('Failed to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const successRate = useMemo(() => {
    try {
      if (!user?.stats) return '0.0';
      const attempted = Number(user.stats.upgradesAttempted) || 0;
      const success = Number(user.stats.upgradeSuccessCount) || 0;
      return attempted > 0 ? ((success / attempted) * 100).toFixed(1) : '0.0';
    } catch (error) {
      console.error('Error calculating success rate:', error);
      return '0.0';
    }
  }, [user]);

  const userHoldings = useMemo(() => {
    return inventory.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item.value;
      return acc;
    }, {} as Record<string, number>);
  }, [inventory]);

  const platformCurrencies = useMemo(() => {
    try {
      if (!inventory || !Array.isArray(inventory)) return [];
      const currencies = new Set<string>();
      inventory.forEach(i => {
        if (i && i.currency) currencies.add(i.currency);
      });
      return Array.from(currencies);
    } catch (error) {
      console.error('Error getting currencies:', error);
      return [];
    }
  }, [inventory]);

  const portfolioEntries = useMemo(() => {
    try {
      if (!platformCurrencies || !Array.isArray(platformCurrencies)) return [];
      const entries = platformCurrencies.map((currency) => ({
        currency: String(currency || ''),
        total: Number(userHoldings[currency]) || 0,
      }));
      const search = (portfolioSearch || '').trim().toLowerCase();
      const filtered = search
        ? entries.filter(entry => entry.currency.toLowerCase().includes(search))
        : entries;
      const sorted = [...filtered].sort((a, b) => {
        if (portfolioSort === 'name') {
          return a.currency.localeCompare(b.currency);
        }
        return b.total - a.total;
      });
      return sorted;
    } catch (error) {
      console.error('Error processing portfolio entries:', error);
      return [];
    }
  }, [platformCurrencies, userHoldings, portfolioSort, portfolioSearch]);

  if (!user) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-screen">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        
        {/* Left: Profile Card */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-black/20 border border-white/[0.12] p-8 rounded-2xl flex flex-col items-center text-center relative overflow-hidden backdrop-blur-2xl">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-web3-accent to-web3-purple"></div>
            {isEditable && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/5 border border-white/[0.12] flex items-center justify-center text-gray-300 hover:text-white hover:border-web3-accent/40 transition"
                aria-label="Open settings"
              >
                <Settings size={16} />
              </button>
            )}
            
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-web3-accent/20 blur-xl rounded-full"></div>
              <div className="w-32 h-32 rounded-full bg-gray-800 border-4 border-web3-accent flex items-center justify-center relative z-10 overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={64} className="text-web3-accent" />
                )}
              </div>
            </div>
            
            <h1 className="text-3xl font-black text-white mb-2">{user?.username || 'User'}</h1>
            
            {/* Balance */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/30 border border-white/[0.12] backdrop-blur-xl mb-2">
              <span className="font-mono text-sm font-bold text-white tabular-nums">{balance.toLocaleString('en-US')}₮</span>
            </div>
            
            {/* Wallet */}
            {user?.walletAddress && (
              <div 
                className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-gray-700 mt-1 mb-4 hover:border-web3-accent/50 transition-colors cursor-pointer group/wallet"
                onClick={() => navigator.clipboard.writeText(user.walletAddress)}
                title={`Click to copy: ${user.walletAddress}`}
              >
                <div className="w-2 h-2 rounded-full bg-web3-success shadow-[0_0_5px_#10B981] animate-pulse"></div>
                <span className="font-mono text-web3-accent text-sm font-bold tracking-wide">{formatWalletAddress(user.walletAddress)}</span>
                <Copy size={12} className="text-gray-500 group-hover/wallet:text-web3-accent transition-colors ml-1" />
              </div>
            )}

            <div className="w-full h-[1px] bg-white/5 my-6"></div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="bg-black/25 backdrop-blur-xl p-4 rounded-xl border border-white/[0.12]">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Cases Opened</div>
                <div className="text-2xl font-black text-white">{user?.stats?.casesOpened || 0}</div>
              </div>
              <div className="bg-black/25 backdrop-blur-xl p-4 rounded-xl border border-white/[0.12]">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Win Rate</div>
                <div className={`text-2xl font-black ${parseFloat(successRate) > 50 ? 'text-web3-success' : 'text-gray-400'}`}>{successRate}%</div>
              </div>
            </div>
          </div>

          {/* Portfolio */}
          <div className="bg-black/20 border border-white/[0.12] p-6 rounded-2xl flex flex-col h-[356px] backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">
                Asset Portfolio
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPortfolioSort('name')}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    portfolioSort === 'name'
                      ? 'bg-web3-accent/20 text-web3-accent border-web3-accent/30'
                      : 'text-gray-500 border-white/10 hover:text-white'
                  }`}
                >
                  Name
                </button>
                <button
                  onClick={() => setPortfolioSort('amount')}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    portfolioSort === 'amount'
                      ? 'bg-web3-accent/20 text-web3-accent border-web3-accent/30'
                      : 'text-gray-500 border-white/10 hover:text-white'
                  }`}
                >
                  Amount
                </button>
              </div>
            </div>

            <div className="mb-3">
              <input
                value={portfolioSearch}
                onChange={(e) => setPortfolioSearch(e.target.value)}
                placeholder="Search token"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-sm"
              />
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
              {portfolioEntries.length === 0 && (
                <div className="text-gray-600 text-sm italic py-4 text-center">No tokens found.</div>
              )}
              {portfolioEntries.map(({ currency, total }) => (
                <div key={currency} className="bg-black/25 backdrop-blur-xl px-4 py-3 rounded-lg border border-white/[0.12] flex items-center justify-between group hover:border-web3-accent/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${total > 0 ? 'bg-web3-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-700'}`}></div>
                    <span className="font-bold text-gray-300 text-sm">${currency}</span>
                  </div>
                  <span className="font-mono text-white font-bold">{total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-8 flex flex-col self-stretch">
          <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-1">
            {[
              { id: 'inventory', label: 'Items' },
              { id: 'burnt', label: 'Burnt' },
              { id: 'battles', label: 'Battles' },
            ].map(t => (
              <button 
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] rounded-t-lg border-t border-x ${
                  tab === t.id
                    ? 'bg-web3-card text-white border-gray-700'
                    : 'text-gray-400 hover:text-gray-200 border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
            
            {tab === 'inventory' && (
              <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="ml-auto flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition">
                Price {sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
              </button>
            )}
          </div>

          <div className="bg-black/20 border border-white/[0.12] rounded-2xl p-6 flex flex-col h-[810px] backdrop-blur-2xl">
            {/* Inventory Tab */}
            {tab === 'inventory' && (
              <div className="flex flex-col h-full min-h-0">
                {(!sortedInventory || sortedInventory.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[810px] text-gray-600 rounded-xl">
                    <Package size={48} className="mb-4 opacity-20"/>
                    <p className="text-sm font-mono uppercase">Inventory is empty</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 auto-rows-max">
                      {pagedInventory.map((item, index) => {
                        if (!item || !item.id) return null;
                        return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" />;
                      })}
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-2.5 pb-2.5 flex-shrink-0">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500">
                        Page {inventoryPage + 1} / {inventoryTotalPages}
                      </span>
                      <button
                        onClick={() => setInventoryPage((prev) => Math.max(0, prev - 1))}
                        disabled={inventoryPage === 0}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setInventoryPage((prev) => Math.min(inventoryTotalPages - 1, prev + 1))}
                        disabled={inventoryPage >= inventoryTotalPages - 1}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Burnt Items Tab */}
            {tab === 'burnt' && (
              <div className="flex flex-col h-full min-h-0">
                {(!burntItems || burntItems.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[810px] text-gray-600 rounded-xl">
                    <Package size={48} className="mb-4 opacity-20"/>
                    <p className="text-sm font-mono uppercase">No burnt items</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 auto-rows-max">
                      {pagedBurnt.map((item, index) => {
                        if (!item || !item.id) return null;
                        return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" status="burnt" />;
                      })}
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-2.5 pb-2.5 flex-shrink-0">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500">
                        Page {burntPage + 1} / {burntTotalPages}
                      </span>
                      <button
                        onClick={() => setBurntPage((prev) => Math.max(0, prev - 1))}
                        disabled={burntPage === 0}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setBurntPage((prev) => Math.min(burntTotalPages - 1, prev + 1))}
                        disabled={burntPage >= burntTotalPages - 1}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Battle History Tab */}
            {tab === 'battles' && (
              <div className="flex flex-col h-full min-h-0">
                {(!battleHistory || battleHistory.length === 0) ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[810px] text-gray-600 rounded-xl">
                    <Swords size={48} className="mb-4 opacity-20"/>
                    <p className="text-sm font-mono uppercase">No combat history</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                      {pagedBattleHistory.map((battle) => {
                        if (!battle || !battle.id) return null;
                        try {
                          const winningsByCategory = (battle.wonItems || []).reduce((acc, item) => {
                            if (!item || !item.currency) return acc;
                            const value = Number(item.value) || 0;
                            acc[item.currency] = (acc[item.currency] || 0) + value;
                            return acc;
                          }, {} as Record<string, number>);
                          
                          const hasWinnings = Object.keys(winningsByCategory).length > 0;

                          return (
                            <div key={battle.id} className="bg-web3-card/80 backdrop-blur-sm p-4 rounded-xl border border-gray-700 flex items-center justify-between hover:border-web3-accent/30 transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm border-2 ${battle.result === 'WIN' ? 'text-web3-success bg-green-900/20 border-green-900/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'text-red-500 bg-red-900/20 border-red-900/40 shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`}>
                                {battle.result === 'WIN' ? 'W' : 'L'}
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">VS {battle.opponent || 'Unknown'}</div>
                                <div className="font-mono font-bold text-white text-sm">Cost: {Number(battle.cost) || 0} ₮</div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end gap-2">
                              {hasWinnings ? (
                                <div className="flex flex-wrap justify-end gap-2 max-w-[250px]">
                                  {Object.entries(winningsByCategory).map(([currency, amount]) => (
                                    <div key={currency} className="flex items-center gap-1.5 bg-web3-card/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-gray-700/50 group-hover:border-web3-accent/30 transition-colors">
                                      <span className="text-xs font-mono font-bold text-white">{Number(amount) || 0}</span>
                                      <span className="text-[10px] font-bold text-web3-accent">${currency}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="font-mono font-bold text-sm text-gray-500">
                                  -{Number(battle.cost) || 0} ₮
                                </div>
                              )}
                            </div>
                          </div>
                        );
                        } catch (error) {
                          console.error('Error rendering battle:', error, battle);
                          return null;
                        }
                      })}
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-2.5 pb-2.5 flex-shrink-0">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500">
                        Page {battlePage + 1} / {battleTotalPages}
                      </span>
                      <button
                        onClick={() => setBattlePage((prev) => Math.max(0, prev - 1))}
                        disabled={battlePage === 0}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setBattlePage((prev) => Math.min(battleTotalPages - 1, prev + 1))}
                        disabled={battlePage >= battleTotalPages - 1}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditable && isSettingsOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[92%] max-w-md bg-black/40 border border-white/[0.12] rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="text-xs uppercase tracking-widest text-gray-500">Profile Settings</div>
            <div className="text-2xl font-black text-white mt-1">Edit Profile</div>

            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Avatar</div>
              <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/[0.12] cursor-pointer hover:border-web3-accent/50 transition">
                <div className="w-10 h-10 rounded-full bg-gray-800 border border-white/[0.12] overflow-hidden flex items-center justify-center">
                  {avatarPreview || user?.avatar ? (
                    <img src={avatarPreview || user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={18} className="text-web3-accent" />
                  )}
                </div>
                <span className="text-xs uppercase tracking-widest text-gray-300">
                  {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleAvatarChange(e.target.files?.[0])}
                  disabled={isUploadingAvatar}
                />
              </label>
              <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-600">
                PNG/JPG/WebP/GIF • up to 1MB • max 1024px
              </div>
              {avatarError && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-red-400">{avatarError}</div>
              )}
            </div>

            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Display Name</div>
              <div className="flex items-center gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value.toUpperCase())}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 text-xs uppercase tracking-widest"
                  placeholder="USERNAME"
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="px-3 py-2 rounded-lg bg-web3-accent/20 border border-web3-accent/40 text-[10px] uppercase tracking-widest text-web3-accent hover:border-web3-accent/70 disabled:opacity-60"
                >
                  {isSavingName ? 'Saving' : 'Save'}
                </button>
              </div>
              {nameError && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-red-400">{nameError}</div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/[0.12] text-[10px] uppercase tracking-widest text-gray-300 hover:text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
