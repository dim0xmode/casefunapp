import React, { useState, useEffect, useMemo } from 'react';
import { Case, Item } from '../types';
import { Swords, Bot, Trophy, XCircle, User as UserIcon, ChevronRight, Check, ArrowLeft, Sparkles, Trash2 } from 'lucide-react';
import { CaseRoulette, SPIN_DURATION_MS } from './CaseRoulette';
import { ItemCard } from './ItemCard';

const BOT_NAMES = ['Apex', 'SniperX', 'Valkyrie', 'Titan', 'Shadow', 'Nova', 'Orion', 'Helix'];

interface BattleViewProps {
  cases: Case[];
  userName: string;
  onBattleFinish: (wonItems: Item[], totalCost: number) => void;
  balance: number;
  onChargeBattle: (amount: number) => Promise<boolean>;
  onOpenTopUp: () => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
}

export const BattleView: React.FC<BattleViewProps> = ({ cases, userName, onBattleFinish, balance, onChargeBattle, onOpenTopUp, isAuthenticated, onOpenWalletConnect, isAdmin }) => {
  const [gameState, setGameState] = useState<'SETUP' | 'BATTLE' | 'RESULT'>('SETUP');
  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [opponent, setOpponent] = useState<{name: string, type: 'BOT' | null}>({name: 'Waiting...', type: null});
  const [hostName, setHostName] = useState<string>('');
  const [botName, setBotName] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [userDrops, setUserDrops] = useState<Item[]>([]);
  const [botDrops, setBotDrops] = useState<Item[]>([]);
  const [battleOutcomes, setBattleOutcomes] = useState<{userItem: Item, botItem: Item}[]>([]);
  const [availableBattles, setAvailableBattles] = useState<{ id: string; host: string; cases: Case[]; createdAt: number }[]>([]);
  const [startConfirm, setStartConfirm] = useState(false);
  const [battleStarted, setBattleStarted] = useState(false);
  const [createBattleOpen, setCreateBattleOpen] = useState(false);
  const [createSelectedCases, setCreateSelectedCases] = useState<Case[]>([]);
  const [createSearchFilter, setCreateSearchFilter] = useState('');
  const [createCasesPage, setCreateCasesPage] = useState(0);
  const [createConfirm, setCreateConfirm] = useState(false);
  const [isOwnBattle, setIsOwnBattle] = useState(false);
  const [currentBattleId, setCurrentBattleId] = useState<string | null>(null);
  const [currentBattleIsBot, setCurrentBattleIsBot] = useState(false);
  const [priceFilter, setPriceFilter] = useState('');

  const totalCost = selectedCases.reduce((sum, c) => sum + c.price, 0);
  const canAffordBattle = balance >= totalCost;
  const battleShortfall = Math.max(0, totalCost - balance);

  const filteredBattles = useMemo(() => {
    const query = Number(priceFilter);
    const hasFilter = Number.isFinite(query) && query > 0;
    const base = hasFilter
      ? availableBattles.filter(battle => battle.cases.reduce((sum, c) => sum + c.price, 0) <= query)
      : availableBattles;
    return base.sort((a, b) => {
      const totalA = a.cases.reduce((sum, c) => sum + c.price, 0);
      const totalB = b.cases.reduce((sum, c) => sum + c.price, 0);
      return totalB - totalA;
    });
  }, [availableBattles, priceFilter]);

  const ownBattles = filteredBattles.filter(battle => battle.host === userName);
  const otherBattles = filteredBattles.filter(battle => battle.host !== userName);

  const buildMockBattle = (seed = Date.now()) => {
    const pool = cases.length ? cases : [];
    if (!pool.length) return null;
    const count = Math.min(5, Math.max(2, Math.floor(Math.random() * 4) + 2));
    const battleCases = Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
    const hostNames = BOT_NAMES;
    return {
      id: `battle-${seed}-${Math.random().toString(36).slice(2, 8)}`,
      host: hostNames[Math.floor(Math.random() * hostNames.length)],
      cases: battleCases,
      createdAt: Date.now(),
    };
  };

  useEffect(() => {
    if (!cases.length) return;
    const initial = Array.from({ length: 8 }, (_, idx) => buildMockBattle(Date.now() + idx))
      .filter(Boolean) as { id: string; host: string; cases: Case[]; createdAt: number }[];
    setAvailableBattles(initial);
  }, [cases]);

  const joinBattle = (battle: { id: string; host: string; cases: Case[] }) => {
    setSelectedCases(battle.cases);
    setCurrentRound(0);
    setHostName(battle.host);
    const isHost = battle.host === userName;
    const nextBotName = isHost ? BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] : battle.host;
    setBotName(nextBotName);
    setOpponent({ name: nextBotName, type: 'BOT' });
    setGameState('BATTLE');
    setCountdown(null);
    setStartConfirm(false);
    setBattleStarted(false);
    setIsOwnBattle(battle.host === userName);
    setCurrentBattleId(battle.id);
    setCurrentBattleIsBot(battle.host !== userName);
  };

  const addCaseToCreate = (caseData: Case) => {
    if (createSelectedCases.length >= 25) return;
    setCreateSelectedCases(prev => [...prev, caseData]);
  };

  const removeCaseFromCreate = (index: number) => {
    setCreateSelectedCases(prev => prev.filter((_, idx) => idx !== index));
  };

  const sanitizeCreateSearch = (value: string) => value.replace(/[^a-zA-Z0-9$ ]/g, '');

  const filteredCreateCases = useMemo(() => {
    const searchTrimmed = createSearchFilter.trim();
    const searchLower = searchTrimmed.toLowerCase();
    const priceQuery = Number(createSearchFilter);
    const hasPriceFilter = Number.isFinite(priceQuery) && priceQuery > 0;
    const hasTokenFilter = searchTrimmed.startsWith('$') && searchTrimmed.length > 1;
    const tokenSearch = hasTokenFilter ? searchTrimmed.slice(1).toLowerCase() : '';
    const hasNameFilter = searchLower.length > 0 && !hasPriceFilter && !hasTokenFilter;

    let base = cases;

    if (hasPriceFilter) {
      base = base.filter(c => c.price <= priceQuery);
    } else if (hasTokenFilter) {
      base = base.filter(c => c.currency.toLowerCase().includes(tokenSearch) || c.tokenTicker?.toLowerCase().includes(tokenSearch));
    } else if (hasNameFilter) {
      base = base.filter(c => c.name.toLowerCase().includes(searchLower));
    }

    return base.sort((a, b) => b.price - a.price);
  }, [cases, createSearchFilter]);

  const CASES_PER_PAGE = 12;
  const createCasesTotalPages = Math.max(1, Math.ceil(filteredCreateCases.length / CASES_PER_PAGE));

  const pagedCreateCases = useMemo(() => {
    const start = createCasesPage * CASES_PER_PAGE;
    return filteredCreateCases.slice(start, start + CASES_PER_PAGE);
  }, [filteredCreateCases, createCasesPage]);

  const pagedOwnCreateCases = useMemo(
    () => pagedCreateCases.filter((caseData) => caseData.creatorName === userName),
    [pagedCreateCases, userName]
  );

  const pagedCommunityCreateCases = useMemo(
    () => pagedCreateCases.filter((caseData) => caseData.creatorName !== userName),
    [pagedCreateCases, userName]
  );

  useEffect(() => {
    if (createCasesPage > createCasesTotalPages - 1) {
      setCreateCasesPage(Math.max(0, createCasesTotalPages - 1));
    }
  }, [createCasesTotalPages, createCasesPage]);


  const createTotalCost = useMemo(
    () => createSelectedCases.reduce((sum, c) => sum + c.price, 0),
    [createSelectedCases]
  );

  const handleCreateBattle = async () => {
    if (createSelectedCases.length === 0) return;
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    if (!isAdmin) return;
    if (!createConfirm) {
      if (balance < createTotalCost) {
        onOpenTopUp();
        return;
      }
      setCreateConfirm(true);
      return;
    }
    if (balance < createTotalCost) {
      onOpenTopUp();
      return;
    }
    const charged = await onChargeBattle(createTotalCost);
    if (!charged) {
      setCreateConfirm(false);
      return;
    }
    const newBattle = {
      id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      host: userName,
      cases: createSelectedCases,
      createdAt: Date.now(),
    };
    setAvailableBattles(prev => [newBattle, ...prev]);
    setCreateSelectedCases([]);
    setCreateBattleOpen(false);
    setCreateConfirm(false);
    joinBattle(newBattle);
  };

  const handleStartBattle = async () => {
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    if (!isAdmin) return;
    if (!startConfirm) {
      if (!canAffordBattle) {
        onOpenTopUp();
        return;
      }
      setStartConfirm(true);
      return;
    }
    if (!canAffordBattle) {
      onOpenTopUp();
      return;
    }
    const charged = await onChargeBattle(totalCost);
    if (!charged) {
      setStartConfirm(false);
      return;
    }
    setStartConfirm(false);
    setBattleStarted(true);
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCountdown(null);
      initializeBattle();
    }
  }, [countdown]);

  const initializeBattle = () => {
    const outcomes = selectedCases.map(c => ({
      userItem: {
        ...c.possibleDrops[Math.floor(Math.random() * c.possibleDrops.length)],
        caseId: c.id,
      },
      botItem: {
        ...c.possibleDrops[Math.floor(Math.random() * c.possibleDrops.length)],
        caseId: c.id,
      },
    }));
    
    setBattleOutcomes(outcomes);
    setUserDrops([]);
    setBotDrops([]);
    setCurrentRound(0);
  };

  useEffect(() => {
    if (gameState !== 'BATTLE') return;
    if (battleOutcomes.length === 0) return;

    let mounted = true;

    const runRoundSequence = async () => {
      await new Promise(resolve => setTimeout(resolve, SPIN_DURATION_MS + 500));
      
      if (!mounted) return;

      
      
      const outcome = battleOutcomes[currentRound];
      if (outcome) {
        setUserDrops(prev => [outcome.userItem, ...prev]);
        setBotDrops(prev => [outcome.botItem, ...prev]);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!mounted) return;

      if (currentRound < selectedCases.length - 1) {
        setCurrentRound(prev => prev + 1);
      } else {
        finishGame();
      }
    };

    runRoundSequence();

    return () => { mounted = false; };
  }, [gameState, currentRound, battleOutcomes, selectedCases.length]);

  const finishGame = () => {
    setGameState('RESULT');
    
    const finalUserTotal = battleOutcomes.reduce((sum, r) => sum + r.userItem.value, 0);
    const finalBotTotal = battleOutcomes.reduce((sum, r) => sum + r.botItem.value, 0);

    let wonItems: Item[] = [];
    
    if (finalUserTotal >= finalBotTotal) {
      const allUserItems = battleOutcomes.map(o => o.userItem);
      const allBotItems = battleOutcomes.map(o => o.botItem);
      wonItems = [...allUserItems, ...allBotItems];
    }
    
    onBattleFinish(wonItems, totalCost);
    if (currentBattleId) {
      setAvailableBattles(prev => {
        const next = prev.filter(battle => battle.id !== currentBattleId);
        if (currentBattleIsBot) {
          const replacement = buildMockBattle(Date.now());
          return replacement ? [replacement, ...next] : next;
        }
        return next;
      });
    }
  };

  const playAgain = () => {
    setSelectedCases([]);
    setCurrentRound(0);
    setUserDrops([]);
    setBotDrops([]);
    setBattleOutcomes([]);
    setOpponent({name: 'Waiting...', type: null});
    setHostName('');
    setBotName('');
    setCountdown(null);
    setStartConfirm(false);
    setBattleStarted(false);
    setCurrentBattleId(null);
    setCurrentBattleIsBot(false);
    setGameState('SETUP');
  };

  const renderCaseIcon = (value: string) => {
    if (!value) return <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>;
    if (value.startsWith('http')) {
      return <img src={value} alt="token logo" className="w-8 h-8 object-contain" />;
    }
    return <span className="text-lg">{value}</span>;
  };

  const getRemainingTime = (caseData: Case) => {
    if (!caseData.openDurationHours || !caseData.createdAt) return null;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    const msLeft = endAt - Date.now();
    if (msLeft <= 0) return 'Expired';
    const hours = Math.floor(msLeft / (60 * 60 * 1000));
    const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  // SETUP Screen
  if (gameState === 'SETUP') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Swords className="text-web3-accent" /> Available Battles
          </h2>
            <button
              onClick={() => setCreateBattleOpen(true)}
              disabled={!isAdmin}
              className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs transition shadow-[0_0_18px_rgba(102,252,241,0.35)] ${
                isAdmin
                  ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                  : 'bg-white/5 border border-white/[0.12] text-gray-500 cursor-not-allowed'
              }`}
            >
              {isAdmin ? 'Create Battle' : 'Admins only'}
            </button>
          </div>
          {isAuthenticated && !isAdmin && (
            <div className="mb-4 text-[10px] uppercase tracking-widest text-gray-500">
              Only admins can create or join battles
            </div>
          )}

          <div className="mb-4">
            <input
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
              placeholder="Search by max price (e.g. 500)"
              className="w-full md:w-[320px] px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-sm"
            />
          </div>

          {ownBattles.length > 0 && (
            <div className="mb-6">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Your Battles</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ownBattles.map((battle) => {
                  const battleCost = battle.cases.reduce((sum, c) => sum + c.price, 0);
                  return (
                    <div key={battle.id} className="bg-black/20 border border-white/[0.08] rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
                          <UserIcon size={14} className="text-web3-accent" />
                          {battle.host}
                        </div>
                        <div className="text-xs font-bold text-web3-accent">{battle.cases.length} rounds</div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        {battle.cases.slice(0, 4).map((caseData, idx) => (
                          <div key={`${battle.id}-${caseData.id}-${idx}`} className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                            {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                          </div>
                        ))}
                        {battle.cases.length > 4 && (
                          <div className="text-xs text-gray-500">+{battle.cases.length - 4}</div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-gray-500">Total Cost</div>
                          <div className="text-lg font-black text-white">{battleCost} ₮</div>
                        </div>
                        <div className="text-xs text-gray-500">Rounds: {battle.cases.length}</div>
                      </div>

                      {(() => {
                        const canAfford = balance >= battleCost;
                        const shortfall = Math.max(0, battleCost - balance);
                        return (
                          <button
                            onClick={
                              !isAuthenticated
                                ? onOpenWalletConnect
                                : !isAdmin
                                  ? undefined
                                  : canAfford
                                    ? () => joinBattle(battle)
                                    : onOpenTopUp
                            }
                            disabled={isAuthenticated && !isAdmin}
                            className={`w-full py-2.5 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition ${
                              !isAuthenticated
                                ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                                : isAdmin && canAfford
                                  ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                                  : 'bg-gray-700/80 text-gray-400 border border-red-500/40 hover:border-red-500/60'
                            }`}
                          >
                            {!isAuthenticated ? (
                              <>Connect Wallet</>
                            ) : !isAdmin ? (
                              <>Admins only</>
                            ) : canAfford ? (
                              <>Join Battle <ChevronRight size={16} /></>
                            ) : (
                              <>Need {shortfall} ₮ more • Top up</>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">All Battles</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {otherBattles.map((battle) => {
              const battleCost = battle.cases.reduce((sum, c) => sum + c.price, 0);
              const canAfford = balance >= battleCost;
              const shortfall = Math.max(0, battleCost - balance);
              return (
                <div key={battle.id} className="bg-black/20 border border-white/[0.08] rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
                      <Bot size={14} className="text-web3-accent" />
                      {battle.host}
                    </div>
                    <div className="text-xs font-bold text-web3-accent">{battle.cases.length} rounds</div>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    {battle.cases.slice(0, 4).map((caseData, idx) => (
                      <div key={`${battle.id}-${caseData.id}-${idx}`} className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                        {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
              </div>
            ))}
                    {battle.cases.length > 4 && (
                      <div className="text-xs text-gray-500">+{battle.cases.length - 4}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gray-500">Total Cost</div>
                      <div className="text-lg font-black text-white">{battleCost} ₮</div>
                    </div>
                    <div className="text-xs text-gray-500">Rounds: {battle.cases.length}</div>
                  </div>

                  <button
                    onClick={
                      !isAuthenticated
                        ? onOpenWalletConnect
                        : !isAdmin
                          ? undefined
                          : canAfford
                            ? () => joinBattle(battle)
                            : onOpenTopUp
                    }
                    disabled={isAuthenticated && !isAdmin}
                    className={`w-full py-2.5 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition ${
                      !isAuthenticated
                        ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                        : isAdmin && canAfford
                          ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                          : 'bg-gray-700/80 text-gray-400 border border-red-500/40 hover:border-red-500/60'
                    }`}
                  >
                    {!isAuthenticated ? (
                      <>Connect Wallet</>
                    ) : !isAdmin ? (
                      <>Admins only</>
                    ) : canAfford ? (
                      <>Join Battle <ChevronRight size={16} /></>
                    ) : (
                      <>Need {shortfall} ₮ more • Top up</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {createBattleOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
            <div className="relative bg-black/70 border border-white/[0.12] rounded-2xl p-8 w-[94%] max-w-6xl h-[720px] shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm uppercase tracking-widest text-gray-400">Create Battle</div>
                <button
                  onClick={() => {
                    setCreateBattleOpen(false);
                    setCreateSelectedCases([]);
                    setCreateConfirm(false);
                  }}
                  className="text-xs uppercase tracking-widest text-gray-500 hover:text-white transition"
                >
                  Close
                </button>
              </div>
              {createConfirm && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 rounded-2xl">
                  <div className="w-[420px] px-12 py-10 rounded-3xl bg-black/70 border border-white/[0.12] shadow-[0_25px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm text-center">
                    <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Confirm</div>
                    <div className="text-lg font-black text-white mb-6">{createTotalCost} ₮</div>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => setCreateConfirm(false)}
                        className="px-5 py-2 rounded-2xl bg-white/5 border border-white/10 text-gray-400 hover:text-white text-xs uppercase tracking-widest"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateBattle}
                        className="px-7 py-2 rounded-2xl bg-gradient-to-r from-web3-accent to-web3-success text-black font-black uppercase tracking-widest text-xs hover:scale-105 transition"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                <div className="lg:col-span-2 flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500">Pick cases</div>
                    <input
                      value={createSearchFilter}
                      onChange={(e) => setCreateSearchFilter(sanitizeCreateSearch(e.target.value))}
                      placeholder="Search by name, token ($DOGE) or max price (500)"
                      className="w-full md:w-[320px] px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-sm"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {pagedOwnCreateCases.length > 0 && (
                      <div className="mb-4">
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
                          Your Cases
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
                          {pagedOwnCreateCases.map((caseData) => (
                            <div
                              key={caseData.id}
                              onClick={() => addCaseToCreate(caseData)}
                              className="bg-gradient-to-br from-web3-accent/25 to-web3-purple/25 border border-white/[0.2] rounded-xl p-3 cursor-pointer hover:border-web3-accent/70 hover:from-web3-accent/35 hover:to-web3-purple/35 transition h-[110px] flex flex-col items-center text-center shadow-[0_0_24px_rgba(102,252,241,0.2)]"
                            >
                              <div className="text-[10px] text-gray-300 font-bold">{caseData.price} ₮</div>
                              {caseData.openDurationHours && caseData.createdAt && (
                                <div className="text-[9px] uppercase tracking-wider text-gray-500">
                                  {getRemainingTime(caseData)}
                                </div>
                              )}
                              <div className="flex-1 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                                  {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                                </div>
                              </div>
                              <div className="text-[10px] text-gray-400 font-bold">
                                ${caseData.tokenTicker || caseData.currency}
                              </div>
                              <div className="text-xs font-bold text-white truncate">{caseData.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pagedCommunityCreateCases.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
                          Community Cases
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
                          {pagedCommunityCreateCases.map((caseData) => (
                            <div
                              key={caseData.id}
                              onClick={() => addCaseToCreate(caseData)}
                              className="bg-gradient-to-br from-web3-accent/25 to-web3-purple/25 border border-white/[0.2] rounded-xl p-3 cursor-pointer hover:border-web3-accent/70 hover:from-web3-accent/35 hover:to-web3-purple/35 transition h-[110px] flex flex-col items-center text-center shadow-[0_0_24px_rgba(102,252,241,0.2)]"
                            >
                              <div className="text-[10px] text-gray-300 font-bold">{caseData.price} ₮</div>
                              {caseData.openDurationHours && caseData.createdAt && (
                                <div className="text-[9px] uppercase tracking-wider text-gray-500">
                                  {getRemainingTime(caseData)}
                                </div>
                              )}
                              <div className="flex-1 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                                  {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                                </div>
                              </div>
                              <div className="text-[10px] text-gray-400 font-bold">
                                ${caseData.tokenTicker || caseData.currency}
                              </div>
                              <div className="text-xs font-bold text-white truncate">{caseData.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-auto pt-3">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500">
                      Page {createCasesPage + 1} / {createCasesTotalPages}
                    </span>
                    <button
                      onClick={() => setCreateCasesPage((prev) => Math.max(0, prev - 1))}
                      disabled={createCasesPage === 0}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setCreateCasesPage((prev) => Math.min(createCasesTotalPages - 1, prev + 1))}
                      disabled={createCasesPage >= createCasesTotalPages - 1}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="flex flex-col h-full min-h-0">
                  <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">
                    Selected ({createSelectedCases.length}/25)
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto custom-scrollbar pr-1 content-start">
                    {createSelectedCases.map((caseData, idx) => (
                      <div key={`${caseData.id}-${idx}`} className="bg-gradient-to-br from-web3-accent/25 to-web3-purple/25 border border-white/[0.2] rounded-lg px-1.5 py-2 relative h-[48px] flex items-center justify-center text-center shadow-[0_0_18px_rgba(102,252,241,0.2)]">
                        <button
                          onClick={() => removeCaseFromCreate(idx)}
                          className="absolute top-1 right-1 text-gray-500 hover:text-web3-danger transition"
                          aria-label="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                        <div className="flex items-center w-full">
                          <div className="w-10 h-10 rounded-md border border-white/[0.08] bg-black/40 flex items-center justify-center">
                            {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                          </div>
                          <div className="flex-1 flex flex-col items-center justify-center leading-none">
                            <div className="text-[9px] text-gray-400 font-bold">
                              ${caseData.tokenTicker || caseData.currency}
                            </div>
                            <div className="text-[10px] font-bold text-white truncate text-center">
                              {caseData.name}
                            </div>
                          </div>
                        </div>
              </div>
                    ))}
                    {createSelectedCases.length === 0 && (
                      <div className="text-xs text-gray-500 text-center py-6">No cases selected</div>
                    )}
                  </div>
                  <div className="mt-3 h-[18px]" />

                  <div className="mt-6">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">
                      Total Cost
          </div>
                    <div className="text-lg font-black text-white mb-4">
                      {createTotalCost} ₮
            </div>
                    <button
                      onClick={handleCreateBattle}
                      disabled={createSelectedCases.length === 0 || (isAuthenticated && !isAdmin)}
                      className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-xs transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        !isAuthenticated
                          ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                          : isAdmin
                            ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black hover:scale-105'
                            : 'bg-white/5 border border-white/[0.12] text-gray-500'
                      }`}
                    >
                      {!isAuthenticated ? 'Connect Wallet' : !isAdmin ? 'Admins only' : 'Create Battle'}
                    </button>
          </div>
        </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // BATTLE Screen
  const currentCase = selectedCases[currentRound];
  const userTotal = userDrops.reduce((acc, item) => acc + item.value, 0);
  const botTotal = botDrops.reduce((acc, item) => acc + item.value, 0);
  const isUserWinning = userTotal >= botTotal;
  const hasOpponent = opponent.type !== null;
  const leftIsUser = isOwnBattle;
  const leftName = leftIsUser ? userName : hostName || opponent.name;
  const rightName = leftIsUser ? botName || opponent.name : userName;

  if (gameState !== 'SETUP') {
    const isResult = gameState === 'RESULT';
    const finalUserTotal = battleOutcomes.reduce((sum, r) => sum + r.userItem.value, 0);
    const finalBotTotal = battleOutcomes.reduce((sum, r) => sum + r.botItem.value, 0);
    const userWon = finalUserTotal >= finalBotTotal;
    const wonItems = userWon
      ? [...battleOutcomes.map(o => o.userItem), ...battleOutcomes.map(o => o.botItem)]
      : [];
    const winningsByCurrency = wonItems.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item.value;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="min-h-screen flex flex-col relative">
        {/* Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="text-9xl font-black text-web3-accent animate-pulse">
              {countdown > 0 ? countdown : 'FIGHT!'}
            </div>
          </div>
        )}

        {/* Scoreboard */}
        <div className="h-20 bg-black/20 border-b border-white/[0.06] flex shadow-lg z-20 backdrop-blur-sm">
          <div className={`flex-1 flex items-center justify-center relative transition-colors duration-500 ${hasOpponent && isUserWinning ? 'bg-green-900/10' : ''}`}>
            <button
              onClick={playAgain}
              className="absolute left-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 border border-white/[0.12] hover:border-web3-accent/50 transition-all duration-300 text-gray-400 hover:text-white"
            >
              <ArrowLeft size={18} />
              <span className="font-bold">Back</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-800 rounded-full border border-web3-accent flex items-center justify-center">
                {leftIsUser ? <UserIcon className="text-web3-accent" size={20}/> : <Bot className="text-web3-accent" size={20}/>}
              </div>
              <div className="font-bold text-white">{leftName}</div>
            </div>
          </div>
          
          <div className="w-20 bg-gray-900 flex flex-col items-center justify-center border-x border-gray-700 z-30">
            <div className="text-[10px] text-gray-500 font-bold uppercase">Round</div>
            <div className="text-lg font-bold text-white">{currentRound + 1}<span className="text-gray-600">/</span>{selectedCases.length}</div>
          </div>

          <div className={`flex-1 flex items-center justify-center transition-colors duration-500 ${hasOpponent && !isUserWinning ? 'bg-red-900/10' : ''}`}>
            {!battleStarted && opponent.type ? (
              <div className="text-gray-500 font-bold uppercase tracking-wider animate-pulse">
                Waiting for you...
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-800 rounded-full border border-red-500 flex items-center justify-center">
                  {leftIsUser ? <Bot className="text-red-500" size={20}/> : <UserIcon className="text-red-500" size={20}/>}
                </div>
                <div className="font-bold text-white">{rightName}</div>
              </div>
            )}
          </div>
        </div>

        {/* Cases Strip */}
        <div className="px-6 py-4 border-b border-white/[0.06] bg-black/20 backdrop-blur-sm relative overflow-visible">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
            Total Cost <span className="text-web3-accent font-bold">{totalCost} ₮</span>
          </div>
          <div className="absolute inset-y-0 left-0 right-0 flex items-center pointer-events-none">
            <div
              className="flex items-center gap-2 transition-transform duration-700 ease-out"
              style={{ transform: `translateX(calc(-${currentRound * 48}px - 20px))`, left: '50%', position: 'relative' }}
            >
              {selectedCases.map((caseData, idx) => {
                const isActive = idx === currentRound;
                return (
                  <div
                    key={`${caseData.id}-${idx}-strip`}
                    className={`w-10 h-10 rounded-full border bg-black/30 flex items-center justify-center ${
                      isActive
                        ? 'border-web3-accent'
                        : 'border-white/[0.12]'
                    }`}
                  >
                    <span className={isActive ? 'drop-shadow-[0_0_10px_rgba(102,252,241,0.9)]' : ''}>
                      {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-[220px] bg-black/20"></div>
          </div>
        </div>

        {/* Split Screen */}
        <div className="flex-1 flex relative overflow-hidden">
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/[0.06] pointer-events-none"></div>
          {/* Pre-start layout when joining a battle */}
          {!battleStarted && opponent.type && (
            <>
          <div className="flex-1 border-r border-gray-800 relative flex flex-col items-center">
                <div className={`absolute top-0 inset-x-0 h-40 pointer-events-none bg-gradient-to-b ${leftIsUser ? 'from-web3-accent/5' : 'from-red-500/5'} to-transparent`}></div>
                <div className="mt-20 w-full max-w-lg px-6 z-10 flex flex-col items-center">
                  <div className={`w-32 h-32 rounded-full border-2 ${leftIsUser ? 'border-web3-accent/60' : 'border-web3-success/60'} bg-black/30 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.35)]`}>
                    <Check size={32} className="text-web3-success" />
                  </div>
                  <div className="mt-4 text-xs uppercase tracking-widest text-gray-400">{leftIsUser ? 'You ready' : 'Creator ready'}</div>
                </div>
            </div>

              <div className="flex-1 relative flex flex-col items-center">
                <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none"></div>
              <div className="relative mt-20 flex flex-col items-center animate-fade-in">
                <button
                  onClick={handleStartBattle}
                  disabled={isAuthenticated && !isAdmin}
                  className={`w-32 h-32 rounded-full border-2 flex items-center justify-center transition ${
                    !isAuthenticated
                      ? 'border-web3-accent/60 bg-black/30 shadow-[0_0_24px_rgba(102,252,241,0.35)] hover:scale-105'
                      : isAdmin && canAffordBattle
                        ? 'border-web3-accent/60 bg-black/30 shadow-[0_0_24px_rgba(102,252,241,0.35)] hover:scale-105'
                        : 'border-red-500/40 bg-gray-800/50'
                  } ${startConfirm ? 'opacity-40' : ''} ${isAuthenticated && !isAdmin ? 'cursor-not-allowed' : ''}`}
                  aria-label="Join Battle"
                >
                  <span className={`text-xs uppercase tracking-widest font-bold text-center px-2 ${
                    !isAuthenticated || (isAdmin && canAffordBattle) ? 'text-web3-accent' : 'text-gray-400'
                  }`}>
                    {!isAuthenticated
                      ? 'Connect'
                      : !isAdmin
                        ? 'Admins only'
                      : !canAffordBattle
                        ? `Need ${battleShortfall} ₮ more • Top up`
                        : isOwnBattle
                          ? 'Call Bot'
                          : 'Join'}
                  </span>
                </button>
                {startConfirm && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-[420px] px-12 py-10 rounded-3xl bg-black/30 border border-white/[0.12] shadow-[0_25px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl text-center">
                      <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Confirm</div>
                      <button
                        onClick={handleStartBattle}
                        className="px-7 py-2 rounded-2xl bg-gradient-to-r from-web3-accent to-web3-success text-black font-black uppercase tracking-widest text-xs hover:scale-105 transition"
                      >
                        {isOwnBattle ? 'Call Bot' : 'Start Battle'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </>
          )}

          {!(!battleStarted && opponent.type) && (
            <>
              {/* Left Side */}
              <div className="flex-1 border-r border-gray-800 relative flex flex-col items-center">
                <div className={`absolute top-0 inset-x-0 h-40 pointer-events-none bg-gradient-to-b ${leftIsUser ? 'from-web3-accent/5' : 'from-red-500/5'} to-transparent`}></div>
                
                <div className="mt-6 w-full max-w-xl px-4 z-10">
                  {currentCase && (
                      <CaseRoulette
                        key={`left-roulette-${currentRound}`}
                        caseData={currentCase}
                        winner={leftIsUser ? battleOutcomes[currentRound]?.userItem || null : battleOutcomes[currentRound]?.botItem || null}
                        openMode="normal"
                        index={0}
                        skipReveal
                      />
                  )}
                </div>

                <div className="flex-1 w-full max-w-lg mt-8 px-4 overflow-y-auto custom-scrollbar pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(leftIsUser ? userDrops : botDrops).map((item, i) => (
                      <ItemCard key={`${item.id}-${i}`} item={item} size="sm" currencyPrefix="$" />
              ))}
                  </div>
            </div>
          </div>

              {/* Right Side */}
          <div className="flex-1 relative flex flex-col items-center justify-center">
            {hasOpponent ? (
              <>
                    <div className={`absolute top-0 inset-x-0 h-40 pointer-events-none bg-gradient-to-b ${leftIsUser ? 'from-red-500/5' : 'from-web3-accent/5'} to-transparent`}></div>

                <div className="w-full h-full flex flex-col items-center justify-start">
                      <div className="mt-6 w-full max-w-xl px-4 z-10">
                        {currentCase && (
                          <CaseRoulette
                            key={`right-roulette-${currentRound}`}
                            caseData={currentCase}
                            winner={leftIsUser ? battleOutcomes[currentRound]?.botItem || null : battleOutcomes[currentRound]?.userItem || null}
                            openMode="normal"
                            index={0}
                            skipReveal
                          />
                        )}
                  </div>

                      <div className="flex-1 w-full max-w-lg mt-8 px-4 overflow-y-auto custom-scrollbar pb-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {(leftIsUser ? botDrops : userDrops).map((item, i) => (
                            <ItemCard key={`${item.id}-${i}`} item={item} size="sm" currencyPrefix="$" />
                          ))}
                        </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center animate-fade-in">
                <div className="w-32 h-32 rounded-full border-4 border-gray-700 border-dashed bg-transparent flex items-center justify-center mb-6 animate-pulse-fast">
                  <Package size={48} className="text-gray-600" />
                </div>
                <div className="text-xl font-bold text-gray-500 uppercase animate-pulse mb-8">Waiting for Player...</div>
                <button onClick={joinBot} className="gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-web3-accent/20 to-web3-purple/20 border border-web3-accent/50 text-white font-bold hover:scale-105 transition-all flex items-center">
                  <Bot size={18} /> Call Bot
                </button>
              </div>
            )}
          </div>
            </>
          )}
        </div>

        {isResult && (
          <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-black/30 border border-white/[0.12] rounded-2xl p-6 text-center max-w-lg w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          {userWon ? (
            <div className="flex flex-col items-center">
                  <div className="relative mb-3">
                    <div className="absolute inset-0 bg-web3-success/30 blur-2xl rounded-full animate-pulse"></div>
                    <Trophy size={56} className="text-yellow-400 drop-shadow-xl relative z-10 animate-bounce-in" />
                    <div className="absolute -top-4 -left-4 text-web3-accent animate-ping">
                      <Sparkles size={14} />
                    </div>
                    <div className="absolute -top-4 -right-4 text-web3-success animate-ping" style={{ animationDelay: '0.3s' }}>
                      <Sparkles size={14} />
                    </div>
                    <div className="absolute -bottom-4 -left-4 text-web3-purple animate-ping" style={{ animationDelay: '0.6s' }}>
                      <Sparkles size={14} />
                    </div>
              </div>
                  <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2 animate-fade-in">Victory</h1>
                  <div className="flex items-center gap-6 w-full justify-center mt-4">
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">You</div>
                      <div className="text-lg font-black text-green-400">{finalUserTotal}</div>
                </div>
                    <div className="text-xs font-bold text-gray-600">VS</div>
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">Bot</div>
                      <div className="text-lg font-black text-red-400">{finalBotTotal}</div>
                </div>
              </div>
                  <div className="bg-black/30 p-4 rounded-xl border border-white/[0.08] w-full mt-5 mb-5 animate-fade-in">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Winnings</div>
                    <div className="flex flex-wrap justify-center gap-3">
                  {Object.keys(winningsByCurrency).length === 0 ? (
                        <span className="text-gray-500 text-sm">No tokens won</span>
                  ) : (
                    Object.entries(winningsByCurrency).map(([currency, amount]) => (
                          <div key={currency} className="bg-black/40 px-3 py-1.5 rounded border border-white/[0.12] flex items-center gap-2">
                            <span className="text-white font-mono text-sm font-bold">{amount} ${currency}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
                  <div className="relative mb-3">
                    <div className="absolute inset-0 bg-web3-danger/30 blur-2xl rounded-full animate-pulse"></div>
                    <XCircle size={56} className="text-red-500 drop-shadow-xl relative z-10 animate-bounce-in" />
                  </div>
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <span
                        key={`battle-rain-${idx}`}
                        className="upgrade-rain"
                        style={{
                          left: `${8 + idx * 11}%`,
                          animationDelay: `${idx * 0.12}s`,
                          animationDuration: `${1.2 + (idx % 3) * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                  <h1 className="text-3xl font-black text-gray-200 uppercase tracking-tight mb-2 animate-fade-in">Defeat</h1>
                  <div className="flex items-center gap-6 w-full justify-center mt-4">
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">You</div>
                      <div className="text-lg font-black text-gray-400">{finalUserTotal}</div>
                </div>
                    <div className="text-xs font-bold text-gray-600">VS</div>
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">Bot</div>
                      <div className="text-lg font-black text-red-400">{finalBotTotal}</div>
                </div>
              </div>
                  <div className="bg-black/30 p-4 rounded-xl border border-white/[0.08] w-full mt-5 mb-5 animate-fade-in">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Cost</div>
                  <div className="text-2xl font-mono font-bold text-red-500">{totalCost} ₮</div>
              </div>
            </div>
          )}

              <button
                onClick={playAgain}
                className="w-full py-3 text-sm uppercase tracking-widest font-black shadow-xl hover:scale-105 transition-transform rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black"
              >
            Play Again
          </button>
        </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};
