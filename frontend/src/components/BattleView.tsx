import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Case, Item, ImageMeta } from '../types';
import { Bot, XCircle, User as UserIcon, ChevronRight, Check, ArrowLeft, Trash2, Sparkles } from 'lucide-react';
import { CaseRoulette, SPIN_DURATION_MS } from './CaseRoulette';
import { ItemCard } from './ItemCard';
import { SearchInput } from './ui/SearchInput';
import { Pagination } from './ui/Pagination';
import { ConfirmModal } from './ui/ConfirmModal';
import { AdminActionButton } from './ui/AdminActionButton';
import { CaseIcon } from './CaseIcon';
import { ImageWithMeta } from './ui/ImageWithMeta';
import { formatShortfallUp } from '../utils/number';
import { api } from '../services/api';

const BOT_NAMES = ['Apex', 'SniperX', 'Valkyrie', 'Titan', 'Shadow', 'Nova', 'Orion', 'Helix'];

interface BattleViewProps {
  cases: Case[];
  userName: string;
  userAvatar?: string;
  userAvatarMeta?: ImageMeta;
  onBattleFinish: (
    wonItems: Item[],
    totalCost: number,
    options?: {
      reserveItems?: Item[];
      mode?: 'BOT' | 'PVP';
      lobbyId?: string | null;
      opponentName?: string;
      caseIds?: string[];
      battleProof?: string | null;
    }
  ) => void;
  balance: number;
  onChargeBattle: (caseIds: string[], battleProof?: string | null) => Promise<boolean>;
  onOpenTopUp: (prefillUsdt?: number) => void;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
  isTelegramMiniApp?: boolean;
}

export const BattleView: React.FC<BattleViewProps> = ({
  cases,
  userName,
  userAvatar,
  userAvatarMeta,
  onBattleFinish,
  balance,
  onChargeBattle,
  onOpenTopUp,
  isAuthenticated,
  onOpenWalletConnect,
  isAdmin,
  isTelegramMiniApp = false,
}) => {
  const format2 = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');
  const itemUsdt = (item: Item) => Number(item.valueUsdt || 0) || Number(item.value || 0) * Number(item.tokenPrice || 0);
  const sumUsdt = (items: Item[]) => items.reduce((s, i) => s + itemUsdt(i), 0);
  type BattleEntry = {
    id: string;
    host: string;
    hostUserId?: string;
    joinerName?: string | null;
    status?: 'OPEN' | 'IN_PROGRESS' | 'FINISHED';
    mode?: 'BOT' | 'PVP' | null;
    roundsJson?: any[] | null;
    winnerName?: string | null;
    battleProof?: string | null;
    tieWinner?: 'USER' | 'OPPONENT' | null;
    hostAvatar?: string | null;
    hostAvatarMeta?: ImageMeta | null;
    joinerAvatar?: string | null;
    joinerAvatarMeta?: ImageMeta | null;
    cases: Case[];
    createdAt: number;
    startedAt?: number | null;
    source?: 'LOBBY' | 'BOT';
  };

  const ROUND_TOTAL_MS = SPIN_DURATION_MS + 500 + 2000;
  const COUNTDOWN_MS = 3000;
  const [gameState, setGameState] = useState<'SETUP' | 'BATTLE' | 'RESULT'>('SETUP');
  const [battleStartedAt, setBattleStartedAt] = useState<number | null>(null);
  const lastRevealedRef = useRef(-1);
  const [selectedCases, setSelectedCases] = useState<Case[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [opponent, setOpponent] = useState<{name: string, type: 'BOT' | null}>({name: 'Waiting...', type: null});
  const [hostName, setHostName] = useState<string>('');
  const [botName, setBotName] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [userDrops, setUserDrops] = useState<Item[]>([]);
  const [botDrops, setBotDrops] = useState<Item[]>([]);
  const [battleOutcomes, setBattleOutcomes] = useState<{userItem: Item, botItem: Item}[]>([]);
  const [availableBattles, setAvailableBattles] = useState<BattleEntry[]>([]);
  const [botBattles, setBotBattles] = useState<BattleEntry[]>([]);
  const [startConfirm, setStartConfirm] = useState(false);
  const [battleStarted, setBattleStarted] = useState(false);
  const [createBattleOpen, setCreateBattleOpen] = useState(false);
  const [createSelectedCases, setCreateSelectedCases] = useState<Case[]>([]);
  const [createSearchFilter, setCreateSearchFilter] = useState('');
  const [createCasesPage, setCreateCasesPage] = useState(0);
  const [createConfirm, setCreateConfirm] = useState(false);
  const [isOwnBattle, setIsOwnBattle] = useState(false);
  const [currentBattleId, setCurrentBattleId] = useState<string | null>(null);
  const [currentBattleSource, setCurrentBattleSource] = useState<'LOBBY' | 'BOT' | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [forcedWinnerName, setForcedWinnerName] = useState<string | null>(null);
  const [prefetchedRounds, setPrefetchedRounds] = useState<any[] | null>(null);
  const [priceFilter, setPriceFilter] = useState('');
  const [hasRealOpponent, setHasRealOpponent] = useState(false);
  const [leftPlayerAvatar, setLeftPlayerAvatar] = useState<string | null>(null);
  const [leftPlayerAvatarMeta, setLeftPlayerAvatarMeta] = useState<ImageMeta | undefined>(undefined);
  const [rightPlayerAvatar, setRightPlayerAvatar] = useState<string | null>(null);
  const [rightPlayerAvatarMeta, setRightPlayerAvatarMeta] = useState<ImageMeta | undefined>(undefined);
  const [leftPlayerIsBot, setLeftPlayerIsBot] = useState(false);
  const [rightPlayerIsBot, setRightPlayerIsBot] = useState(false);
  const [isWaitingForOwner, setIsWaitingForOwner] = useState(false);
  const [ownerWaitSeconds, setOwnerWaitSeconds] = useState(5);
  const [battleProof, setBattleProof] = useState<string | null>(null);
  const [battleTieWinner, setBattleTieWinner] = useState<'USER' | 'OPPONENT' | null>(null);
  const [battleError, setBattleError] = useState<string | null>(null);
  const [battleLoading, setBattleLoading] = useState(false);
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tiebreakerRotation, setTiebreakerRotation] = useState(0);
  const [tiebreakerRevealed, setTiebreakerRevealed] = useState(false);
  const isServerBackedBattle = currentBattleSource === 'LOBBY' && Boolean(currentBattleId);

  useEffect(() => {
    if (gameState !== 'BATTLE') return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen');
        }
      } catch { /* device may not support Wake Lock */ }
    };
    acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !lock) acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release();
    };
  }, [gameState]);

  const isCaseExpired = (caseData: Case) => {
    if (!caseData.openDurationHours || !caseData.createdAt) return false;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    return endAt <= Date.now();
  };

  const totalCost = selectedCases.reduce((sum, c) => sum + c.price, 0);
  const canAffordBattle = balance >= totalCost;
  const battleShortfall = Math.max(0, totalCost - balance);

  const filteredBattles = useMemo(() => {
    const allBattles = [...availableBattles, ...botBattles];
    const query = Number(priceFilter);
    const hasFilter = Number.isFinite(query) && query > 0;
    const base = hasFilter
      ? allBattles.filter(battle => battle.cases.reduce((sum, c) => sum + c.price, 0) <= query)
      : allBattles;
    return base.sort((a, b) => {
      const totalA = a.cases.reduce((sum, c) => sum + c.price, 0);
      const totalB = b.cases.reduce((sum, c) => sum + c.price, 0);
      return totalB - totalA;
    });
  }, [availableBattles, botBattles, priceFilter]);

  const ownBattles = filteredBattles.filter(battle => battle.host === userName);
  const otherBattles = filteredBattles.filter(battle => battle.host !== userName);

  const pickHostWinsOnTie = () => {
    // Deterministic tie-break for PVP: both clients compute the same winner.
    if (!currentBattleId) return false;
    let hash = 0;
    for (let i = 0; i < currentBattleId.length; i += 1) {
      hash = (hash * 31 + currentBattleId.charCodeAt(i)) % 2147483647;
    }
    return hash % 2 === 0;
  };

  const tieWheelJitterDeg = () => {
    const s = currentBattleId || 'battle';
    let h = 7;
    for (let i = 0; i < s.length; i += 1) {
      h = (h * 31 + s.charCodeAt(i)) % 2147483647;
    }
    return 20 + (h % 46);
  };

  const resolveUserWon = (userTotal: number, opponentTotal: number) => {
    if (userTotal > opponentTotal) return true;
    if (userTotal < opponentTotal) return false;
    if (battleTieWinner) {
      return battleTieWinner === 'USER';
    }
    const hostWinsOnTie = pickHostWinsOnTie();
    return isOwnBattle ? hostWinsOnTie : !hostWinsOnTie;
  };

  const activeCases = useMemo(
    () => cases.filter((caseData) => !isCaseExpired(caseData)),
    [cases]
  );

  const toOutcomesFromRounds = (battle: BattleEntry | Record<string, any>, rounds: any[]) => {
    if (!Array.isArray(rounds)) return [] as { userItem: Item; botItem: Item }[];
    const hostDisplay = String((battle as any).host ?? (battle as any).hostName ?? '');
    const isHost = hostDisplay === userName;
    const isJoiner = Boolean(battle.joinerName) && battle.joinerName === userName;
    const isParticipant = isHost || isJoiner;
    return rounds.map((round: any) => {
      // Canonical format (preferred): hostDrop/joinerDrop
      if (round?.hostDrop || round?.joinerDrop) {
        const hostDrop = round.hostDrop || round.userDrop || null;
        const joinerDrop = round.joinerDrop || round.opponentDrop || null;
        let userDrop = hostDrop;
        let opponentDrop = joinerDrop;
        if (isParticipant) {
          userDrop = isHost ? hostDrop : joinerDrop;
          opponentDrop = isHost ? joinerDrop : hostDrop;
        }
        return {
          userItem: {
            ...(userDrop || {}),
            value: Number(userDrop?.value || 0),
          } as Item,
          botItem: {
            ...(opponentDrop || {}),
            value: Number(opponentDrop?.value || 0),
          } as Item,
        };
      }

      // Legacy fallback: userDrop/opponentDrop relative to starter.
      const left = isHost ? round.userDrop : round.opponentDrop;
      const right = isHost ? round.opponentDrop : round.userDrop;
      return {
        userItem: {
          ...left,
          value: Number(left?.value || 0),
        } as Item,
        botItem: {
          ...right,
          value: Number(right?.value || 0),
        } as Item,
      };
    });
  };

  const buildMockBattle = (seed = Date.now()): BattleEntry | null => {
    const pool = activeCases.length ? activeCases : [];
    if (!pool.length) return null;
    const count = Math.min(5, Math.max(2, Math.floor(Math.random() * 4) + 2));
    const battleCases = Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
    const hostNames = BOT_NAMES;
    return {
      id: `bot-battle-${seed}-${Math.random().toString(36).slice(2, 8)}`,
      host: hostNames[Math.floor(Math.random() * hostNames.length)],
      cases: battleCases,
      createdAt: Date.now(),
      source: 'BOT',
    };
  };

  const loadBattleLobbies = async () => {
    try {
      const response = await api.getBattleLobbies();
      const lobbies = Array.isArray(response.data?.lobbies) ? response.data.lobbies : [];
      const mapped: BattleEntry[] = lobbies
        .filter((lobby: any) => lobby?.status === 'OPEN' || lobby?.status === 'IN_PROGRESS')
        .map((lobby: any) => {
          const caseIds = Array.isArray(lobby.caseIds) ? lobby.caseIds : [];
          const lobbyCases = caseIds
            .map((id: string) => activeCases.find((entry) => entry.id === id))
            .filter(Boolean) as Case[];
          if (!lobbyCases.length) return null;
          return {
            id: String(lobby.id),
            host: String(lobby.hostName || 'Unknown'),
            hostUserId: String(lobby.hostUserId || ''),
            joinerName: lobby.joinerName || null,
            hostAvatar: lobby.hostAvatar || null,
            hostAvatarMeta: lobby.hostAvatarMeta || null,
            joinerAvatar: lobby.joinerAvatar || null,
            joinerAvatarMeta: lobby.joinerAvatarMeta || null,
            status: lobby.status,
            mode: lobby.mode || null,
            roundsJson: Array.isArray(lobby.roundsJson) ? lobby.roundsJson : null,
            winnerName: lobby.winnerName || null,
            battleProof: typeof lobby.battleProof === 'string' ? lobby.battleProof : null,
            tieWinner:
              lobby.tieWinner === 'USER' || lobby.tieWinner === 'OPPONENT'
                ? lobby.tieWinner
                : null,
            cases: lobbyCases,
            createdAt: new Date(lobby.createdAt || Date.now()).getTime(),
            startedAt: lobby.startedAt ? new Date(lobby.startedAt).getTime() : null,
            source: 'LOBBY',
          };
        })
        .filter(Boolean) as BattleEntry[];
      setAvailableBattles(mapped);
    } catch {
      setAvailableBattles([]);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setAvailableBattles([]);
      return;
    }
    loadBattleLobbies();
    const timer = setInterval(loadBattleLobbies, 10000);
    return () => clearInterval(timer);
  }, [isAuthenticated, isAdmin, activeCases.length]);

  useEffect(() => {
    if (!activeCases.length) {
      setBotBattles([]);
      return;
    }
    const next = Array.from({ length: 8 }, (_, idx) => buildMockBattle(Date.now() + idx)).filter(Boolean) as BattleEntry[];
    setBotBattles(next);
    const timer = setInterval(() => {
      const refreshed = Array.from({ length: 8 }, (_, idx) => buildMockBattle(Date.now() + idx)).filter(Boolean) as BattleEntry[];
      setBotBattles(refreshed);
    }, 45000);
    return () => clearInterval(timer);
  }, [activeCases.length]);

  // Must run before the auto-join effect below: on Back we go to SETUP while
  // activeBattleLobbyId still exists until this clears it — otherwise joinBattle re-fires.
  useEffect(() => {
    if (gameState !== 'SETUP' && currentBattleId) {
      sessionStorage.setItem('casefun:activeBattleLobbyId', currentBattleId);
      return;
    }
    sessionStorage.removeItem('casefun:activeBattleLobbyId');
  }, [gameState, currentBattleId]);

  useEffect(() => {
    if (gameState !== 'SETUP') return;
    const focusId = sessionStorage.getItem('casefun:focusBattleLobbyId')
                 || sessionStorage.getItem('casefun:activeBattleLobbyId');
    if (!focusId) return;
    const target = availableBattles.find((battle) => battle.id === focusId);
    if (!target) return;
    sessionStorage.removeItem('casefun:focusBattleLobbyId');
    joinBattle(target);
  }, [availableBattles, gameState]);

  useEffect(() => {
    if (
      gameState !== 'BATTLE' ||
      !isOwnBattle ||
      !currentBattleId ||
      battleStarted ||
      currentBattleSource !== 'LOBBY' ||
      !isAdmin
    )
      return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await api.getBattleLobbies();
        const lobbies = Array.isArray(res.data?.lobbies) ? res.data.lobbies : [];
        const lobby = lobbies.find((l: any) => l.id === currentBattleId);
        if (!lobby || cancelled) return;
        if (lobby.joinerName && !hasRealOpponent) {
          setHasRealOpponent(true);
          setBotName(lobby.joinerName);
          setOpponent({ name: lobby.joinerName, type: 'BOT' });
          setRightPlayerAvatar(lobby.joinerAvatar || null);
          setRightPlayerAvatarMeta(lobby.joinerAvatarMeta || undefined);
          setRightPlayerIsBot(false);
        }
        if (lobby.status === 'IN_PROGRESS' && Array.isArray(lobby.roundsJson) && lobby.roundsJson.length > 0) {
          const outcomes = toOutcomesFromRounds(lobby, lobby.roundsJson);
          setBattleOutcomes(outcomes);
          setPrefetchedRounds(lobby.roundsJson);
          if (typeof lobby.battleProof === 'string') setBattleProof(lobby.battleProof);
          if (lobby.tieWinner === 'USER' || lobby.tieWinner === 'OPPONENT') {
            setBattleTieWinner(lobby.tieWinner);
          }
          if (lobby.startedAt) setBattleStartedAt(new Date(lobby.startedAt).getTime());
          setBattleStarted(true);
          setCountdown(3);
        }
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [gameState, isOwnBattle, currentBattleId, battleStarted, currentBattleSource, hasRealOpponent, isAdmin]);

  useEffect(() => {
    return () => {
      sessionStorage.removeItem('casefun:activeBattleLobbyId');
    };
  }, []);

  const joinBattle = (battle: BattleEntry) => {
    setSelectedCases(battle.cases);
    setBattleProof(battle.battleProof || null);
    setBattleTieWinner(
      battle.tieWinner === 'USER' || battle.tieWinner === 'OPPONENT' ? battle.tieWinner : null
    );
    setCurrentRound(0);
    setHostName(battle.host);
    const isHost = battle.host === userName;
    const isLobby = battle.source === 'LOBBY';
    const nextHasRealOpponent = isLobby ? (isHost ? Boolean(battle.joinerName) : true) : false;
    setHasRealOpponent(nextHasRealOpponent);
    const nextBotName =
      battle.source === 'BOT'
        ? isHost
          ? BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
          : battle.host
        : isHost
        ? battle.joinerName || 'Opponent'
        : battle.host;
    setBotName(nextBotName);
    setOpponent({ name: nextBotName, type: 'BOT' });
    const isBotOpponent = Boolean(isHost && !battle.joinerName);
    if (isHost) {
      setLeftPlayerAvatar(userAvatar || null);
      setLeftPlayerAvatarMeta(userAvatarMeta);
      setLeftPlayerIsBot(false);
      setRightPlayerAvatar(isBotOpponent ? null : (battle.joinerAvatar || null));
      setRightPlayerAvatarMeta(isBotOpponent ? undefined : (battle.joinerAvatarMeta || undefined));
      setRightPlayerIsBot(isBotOpponent);
      } else {
      setLeftPlayerAvatar(battle.hostAvatar || null);
      setLeftPlayerAvatarMeta(battle.hostAvatarMeta || undefined);
      setLeftPlayerIsBot(false);
      setRightPlayerAvatar(userAvatar || null);
      setRightPlayerAvatarMeta(userAvatarMeta);
      setRightPlayerIsBot(false);
    }
    setGameState('BATTLE');
    setCountdown(null);
    setStartConfirm(false);
    setBattleStartedAt(battle.startedAt || null);
    lastRevealedRef.current = -1;
    const isLobbyViewer = battle.source === 'LOBBY' && !!battle.status && battle.status !== 'OPEN';
    const isParticipant = battle.host === userName || battle.joinerName === userName;
    setIsSpectator(isLobbyViewer && !isParticipant);
    setForcedWinnerName(battle.winnerName || null);
    if (isLobbyViewer && battle.roundsJson?.length) {
      const outcomes = toOutcomesFromRounds(battle, battle.roundsJson);
      setBattleOutcomes(outcomes);
      setBattleStarted(true);
      if (battle.status === 'FINISHED') {
        setUserDrops(outcomes.map((o) => o.userItem));
        setBotDrops(outcomes.map((o) => o.botItem));
        setGameState('RESULT');
      } else {
        setCurrentRound(0);
        setUserDrops([]);
        setBotDrops([]);
      }
    } else {
      setBattleStarted(false);
      setBattleOutcomes([]);
      setUserDrops([]);
      setBotDrops([]);
    }
    setIsOwnBattle(battle.host === userName);
    setCurrentBattleId(battle.id);
    setCurrentBattleSource(battle.source === 'LOBBY' ? 'LOBBY' : 'BOT');
    setPrefetchedRounds(Array.isArray(battle.roundsJson) ? battle.roundsJson : null);
  };

  const joinBot = () => {
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    setBotName(name);
    setOpponent({ name, type: 'BOT' });
    setRightPlayerAvatar(null);
    setRightPlayerAvatarMeta(undefined);
    setRightPlayerIsBot(true);
    setHasRealOpponent(false);
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

    let base = cases.filter((caseData) => !isCaseExpired(caseData));

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
    setBattleError(null);
    setBattleLoading(true);
    try {
      const lobbyResponse = await api.createBattleLobby(createSelectedCases.map((entry) => entry.id));
      const lobby = lobbyResponse.data?.lobby;
      if (!lobby?.id) {
        setBattleError('Failed to create lobby — server returned empty response');
        setCreateConfirm(false);
        return;
      }

      const chargeCaseIds = createSelectedCases.map((entry) => entry.id);
      try {
        await onChargeBattle(chargeCaseIds);
      } catch (chargeErr: any) {
        await api.finishBattleLobby(String(lobby.id)).catch(() => {});
        setBattleError(`Charge failed: ${chargeErr?.message || ' unknown'} [ids=${chargeCaseIds.length}:${chargeCaseIds.join(',')}]`);
        setCreateConfirm(false);
        return;
      }

      const newBattle: BattleEntry = {
        id: String(lobby.id),
        host: String(lobby.hostName || userName),
        hostUserId: String(lobby.hostUserId || ''),
        cases: createSelectedCases,
        createdAt: new Date(lobby.createdAt || Date.now()).getTime(),
        source: 'LOBBY',
        status: 'OPEN',
      };
      await loadBattleLobbies();
      setCreateSelectedCases([]);
      setCreateBattleOpen(false);
      setCreateConfirm(false);
      joinBattle(newBattle);
    } catch (err: any) {
      setBattleError(err?.message || 'Failed to create battle');
      setCreateConfirm(false);
    } finally {
      setBattleLoading(false);
    }
  };

  const handleStartBattle = async () => {
    setBattleError(null);
    if (!isAuthenticated) {
      onOpenWalletConnect();
      return;
    }
    const requiresCharge = !isOwnBattle && !isSpectator;
    if (!startConfirm) {
      if (requiresCharge && !canAffordBattle) {
        onOpenTopUp();
        return;
      }
      setStartConfirm(true);
      return;
    }
    if (requiresCharge && !canAffordBattle) {
      onOpenTopUp();
      return;
    }
    setBattleLoading(true);
    try {
      if (requiresCharge) {
        try {
          await onChargeBattle(selectedCases.map((entry) => entry.id), battleProof);
        } catch (chargeErr: any) {
          setBattleError(`Charge failed: ${chargeErr?.message || 'unknown error'}`);
          setStartConfirm(false);
          setBattleLoading(false);
          return;
        }
        if (isServerBackedBattle && currentBattleId) {
          try {
            await api.joinBattleLobby(currentBattleId);
          } catch {
            // if lobby join fails, we still allow local battle flow
          }
        }
      }
      if (hasRealOpponent && !isOwnBattle) {
        setStartConfirm(false);
        setIsWaitingForOwner(true);
        setOwnerWaitSeconds(5);
        return;
      }
      await startBattleNow();
    } catch (err: any) {
      setBattleError(err?.message || 'Battle start failed');
      setStartConfirm(false);
    } finally {
      setBattleLoading(false);
    }
  };

  const startBattleNow = async () => {
    if (isServerBackedBattle && currentBattleId && !isSpectator) {
      try {
        const mode: 'BOT' | 'PVP' = hasRealOpponent ? 'PVP' : 'BOT';
        const startResponse = await api.startBattleLobby(currentBattleId, mode);
        const rounds = Array.isArray(startResponse.data?.lobby?.roundsJson) ? startResponse.data?.lobby?.roundsJson : null;
        setPrefetchedRounds(rounds);
        setBattleProof(typeof startResponse.data?.battleProof === 'string' ? startResponse.data.battleProof : null);
        setBattleTieWinner(
          startResponse.data?.tieWinner === 'USER' || startResponse.data?.tieWinner === 'OPPONENT'
            ? startResponse.data.tieWinner
            : null
        );
        const serverStarted = startResponse.data?.lobby?.startedAt;
        if (serverStarted) setBattleStartedAt(new Date(serverStarted).getTime());
      } catch {
        setBattleProof(null);
        setBattleTieWinner(null);
      }
    }
    if (!battleStartedAt) setBattleStartedAt(Date.now());
    setStartConfirm(false);
    setIsWaitingForOwner(false);
    setBattleStarted(true);
    setCountdown(3);
  };

  useEffect(() => {
    if (!isWaitingForOwner) return;
    if (ownerWaitSeconds <= 0) {
      startBattleNow();
      return;
    }
    const timer = window.setTimeout(() => setOwnerWaitSeconds((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [isWaitingForOwner, ownerWaitSeconds]);

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

  const initializeBattle = async () => {
    if (battleOutcomes.length > 0) {
      setUserDrops([]);
      setBotDrops([]);
      setCurrentRound(0);
      lastRevealedRef.current = -1;
      return;
    }
    if (prefetchedRounds && currentBattleId) {
      const battle = [...availableBattles, ...botBattles].find((entry) => entry.id === currentBattleId);
      if (battle) {
        const outcomes = toOutcomesFromRounds(battle, prefetchedRounds);
        setBattleOutcomes(outcomes);
        setUserDrops([]);
        setBotDrops([]);
        setCurrentRound(0);
        lastRevealedRef.current = -1;
        return;
      }
    }
    const mode: 'BOT' | 'PVP' = hasRealOpponent ? 'PVP' : 'BOT';
    try {
      const response = await api.resolveBattle(
        selectedCases.map((entry) => entry.id),
        mode
      );
      const userResolved = Array.isArray(response.data?.userDrops) ? response.data.userDrops : [];
      const opponentResolved = Array.isArray(response.data?.opponentDrops) ? response.data.opponentDrops : [];
      setBattleProof(typeof response.data?.battleProof === 'string' ? response.data.battleProof : null);
      setBattleTieWinner(
        response.data?.tieWinner === 'USER' || response.data?.tieWinner === 'OPPONENT'
          ? response.data.tieWinner
          : null
      );
      if (userResolved.length !== selectedCases.length || opponentResolved.length !== selectedCases.length) {
        throw new Error('Resolve failed');
      }
      const outcomes = selectedCases.map((caseItem, index) => ({
        userItem: { ...userResolved[index], caseId: caseItem.id },
        botItem: { ...opponentResolved[index], caseId: caseItem.id },
      }));
    setBattleOutcomes(outcomes);
    setUserDrops([]);
    setBotDrops([]);
    setCurrentRound(0);
    lastRevealedRef.current = -1;
    } catch {
      setBattleProof(null);
      setBattleTieWinner(null);
      const outcomes = selectedCases.map((caseItem) => {
        const sorted = [...caseItem.possibleDrops].sort((a, b) => Number(a.value || 0) - Number(b.value || 0));
        const safe = sorted[0] || caseItem.possibleDrops[0];
        return {
          userItem: { ...safe, caseId: caseItem.id },
          botItem: { ...safe, caseId: caseItem.id },
        };
      });
      setBattleOutcomes(outcomes);
      setUserDrops([]);
      setBotDrops([]);
      lastRevealedRef.current = -1;
      setCurrentRound(0);
    }
  };

  useEffect(() => {
    if (gameState !== 'BATTLE') return;
    if (battleOutcomes.length === 0) return;

    const startTime = battleStartedAt || Date.now();
    const totalRounds = selectedCases.length;
    lastRevealedRef.current = -1;
    let finished = false;

    const tick = () => {
      if (finished) return;
      const elapsed = Date.now() - startTime - COUNTDOWN_MS;
      if (elapsed < 0) return;

      const roundIdx = Math.min(Math.floor(elapsed / ROUND_TOTAL_MS), totalRounds - 1);
      const inRound = elapsed - roundIdx * ROUND_TOTAL_MS;
      const spinDone = inRound >= SPIN_DURATION_MS + 500;

      const revealUpTo = spinDone ? roundIdx : roundIdx - 1;
      if (revealUpTo > lastRevealedRef.current) {
        const newUser: Item[] = [];
        const newBot: Item[] = [];
        for (let i = 0; i <= revealUpTo; i++) {
          const o = battleOutcomes[i];
          if (o) { newUser.push(o.userItem); newBot.push(o.botItem); }
        }
        setUserDrops(newUser);
        setBotDrops(newBot);
        lastRevealedRef.current = revealUpTo;
      }

      setCurrentRound((prev) => (prev !== roundIdx ? roundIdx : prev));

      if (elapsed >= totalRounds * ROUND_TOTAL_MS) {
        finished = true;
        finishGame();
      }
    };

    tick();
    const timer = setInterval(tick, 250);
    return () => { finished = true; clearInterval(timer); };
  }, [gameState, battleOutcomes, battleStartedAt, selectedCases.length]);

  const commitFinish = (finalUserTotal: number, finalBotTotal: number) => {
    let wonItems: Item[] = [];
    let reserveItems: Item[] = [];
    const mode: 'BOT' | 'PVP' = hasRealOpponent ? 'PVP' : 'BOT';

    const userWon = resolveUserWon(finalUserTotal, finalBotTotal);
    if (userWon) {
      wonItems = [...battleOutcomes.map(o => o.userItem), ...battleOutcomes.map(o => o.botItem)];
    } else if (isOwnBattle) {
      reserveItems = battleOutcomes.map((entry) => entry.userItem);
    }

    if (!isSpectator) {
      const opponentName = isOwnBattle ? (botName || 'Bot') : (hostName || 'Opponent');
      onBattleFinish(wonItems, totalCost, {
        reserveItems,
        mode,
        lobbyId: isServerBackedBattle ? currentBattleId : null,
        opponentName,
        caseIds: selectedCases.map((entry) => entry.id),
        battleProof,
      });
    }
    const winnerName = isSpectator
      ? (() => {
          if (finalUserTotal === finalBotTotal) {
            return pickHostWinsOnTie() ? (hostName || 'Host') : (botName || 'Opponent');
          }
          return finalUserTotal > finalBotTotal ? (hostName || 'Host') : (botName || 'Opponent');
        })()
      : (userWon ? userName : (isOwnBattle ? (botName || 'Bot') : (hostName || 'Opponent')));
    setForcedWinnerName(winnerName);
    if (isServerBackedBattle && currentBattleId) {
      setAvailableBattles(prev => prev.filter(battle => battle.id !== currentBattleId));
      api.finishBattleLobbyWithWinner(currentBattleId, winnerName).catch(() => {});
    }
  };

  const finishGame = () => {
    const finalUserTotal = sumUsdt(battleOutcomes.map(r => r.userItem));
    const finalBotTotal = sumUsdt(battleOutcomes.map(r => r.botItem));
    const isTie = finalUserTotal === finalBotTotal;

    if (isTie) {
      setShowTiebreaker(true);
      setTiebreakerRevealed(false);
      setTiebreakerRotation(0);

      const userWon = resolveUserWon(finalUserTotal, finalBotTotal);
      const leftWins = isOwnBattle ? userWon : !userWon;
      const baseSpins = 5 * 360;
      const jitter = tieWheelJitterDeg();
      const targetAngle = leftWins ? (90 + jitter) : (270 + jitter);
      const finalRotation = baseSpins + targetAngle;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTiebreakerRotation(finalRotation));
      });

      setTimeout(() => {
        setTiebreakerRevealed(true);
      }, 4200);

      setTimeout(() => {
        setShowTiebreaker(false);
        setTiebreakerRevealed(false);
        setGameState('RESULT');
        commitFinish(finalUserTotal, finalBotTotal);
      }, 6000);
    } else {
      setGameState('RESULT');
      commitFinish(finalUserTotal, finalBotTotal);
    }
  };

  const playAgain = () => {
    sessionStorage.removeItem('casefun:activeBattleLobbyId');
    sessionStorage.removeItem('casefun:focusBattleLobbyId');
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
    setCurrentBattleSource(null);
    setIsSpectator(false);
    setForcedWinnerName(null);
    setPrefetchedRounds(null);
    setLeftPlayerAvatar(null);
    setLeftPlayerAvatarMeta(undefined);
    setRightPlayerAvatar(null);
    setRightPlayerAvatarMeta(undefined);
    setLeftPlayerIsBot(false);
    setRightPlayerIsBot(false);
    setHasRealOpponent(false);
    setIsWaitingForOwner(false);
    setOwnerWaitSeconds(5);
    setBattleProof(null);
    setBattleTieWinner(null);
    setShowTiebreaker(false);
    setTiebreakerRotation(0);
    setTiebreakerRevealed(false);
    setBattleStartedAt(null);
    lastRevealedRef.current = -1;
    setGameState('SETUP');
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

  const ErrorBanner = battleError ? (
    <div className="mx-2 mb-2 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center justify-between">
      <span>{battleError}</span>
      <button onClick={() => setBattleError(null)} className="ml-3 text-red-400 hover:text-white font-bold">✕</button>
    </div>
  ) : null;

  // SETUP Screen
  if (gameState === 'SETUP') {
    return (
      <div className={`flex flex-col ${isTelegramMiniApp ? '' : 'h-full'}`}>
        {ErrorBanner}
        <div className={`${isTelegramMiniApp ? 'p-2' : 'flex-1 overflow-y-auto custom-scrollbar p-6'}`}>
          {isTelegramMiniApp ? (
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-lg font-black tracking-tight text-white">
                BATTLE<span className="text-web3-accent">LOBBY</span>
              </div>
              <button
                onClick={() => setCreateBattleOpen(true)}
                className="px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] bg-gradient-to-r from-web3-accent to-web3-success text-black"
              >
                + Create
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                AVAILABLE
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">
                  BATTLES
                </span>
              </h2>
              <AdminActionButton
                isAuthenticated={isAuthenticated}
                isAdmin={isAdmin}
                balance={balance}
                cost={0}
                onConnect={onOpenWalletConnect}
                onTopUp={(_shortfall) => {}}
                onAction={() => setCreateBattleOpen(true)}
                readyLabel="Create Battle"
                className="px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs shadow-[0_0_18px_rgba(102,252,241,0.35)]"
              />
            </div>
          )}
          <div className="mb-4">
            <SearchInput
              value={priceFilter}
              onChange={setPriceFilter}
              placeholder="Search by max price (e.g. 500)"
            />
          </div>

          {ownBattles.length > 0 && (
            <div className="mb-6">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Your Battles</div>
              <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 ${isTelegramMiniApp ? 'gap-2' : 'gap-4'}`}>
                {ownBattles.map((battle) => {
                  const battleCost = battle.cases.reduce((sum, c) => sum + c.price, 0);
                  return (
                    <div
                      key={battle.id}
                      className={`bg-black/20 border border-white/[0.08] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm ${
                        isTelegramMiniApp ? 'p-3' : 'p-4'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
                          {battle.hostAvatar ? <div className="w-5 h-5 rounded-full overflow-hidden shrink-0"><ImageWithMeta src={battle.hostAvatar} meta={battle.hostAvatarMeta ?? undefined} className="w-full h-full rounded-full" /></div> : <UserIcon size={14} className="text-web3-accent" />}
                          {battle.host}
                        </div>
                        {!isTelegramMiniApp && (
                          <div className="text-xs font-bold text-web3-accent">{battle.cases.length} rounds</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        {battle.cases.slice(0, 4).map((caseData, idx) => (
                          <div key={`${battle.id}-${caseData.id}-${idx}`} className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                            <CaseIcon
                              value={caseData.image || caseData.possibleDrops[0]?.image || ''}
                              size="sm"
                              meta={caseData.imageMeta}
                              className="rounded-full"
                            />
              </div>
            ))}
                        {battle.cases.length > 4 && (
                          <div className="text-xs text-gray-500">+{battle.cases.length - 4}</div>
                        )}
          </div>

                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-gray-500">
                            {isTelegramMiniApp ? 'Cost' : 'Total Cost'}
                          </div>
                          <div className="text-lg font-black text-white">{format2(battleCost)} ₮</div>
                        </div>
                        {!isTelegramMiniApp && (
                          <div className="text-xs text-gray-500">Rounds: {battle.cases.length}</div>
                        )}
        </div>

                      {battle.status && battle.status !== 'OPEN' ? (
                        <button
                          onClick={() => joinBattle(battle)}
                          className="w-full py-2.5 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 bg-web3-accent/20 border border-web3-accent/40 text-web3-accent"
                        >
                          View <ChevronRight size={16} />
                        </button>
                      ) : (
                        <AdminActionButton
                          isAuthenticated={isAuthenticated}
                          isAdmin={isAdmin}
                          balance={balance}
                          cost={0}
                          onConnect={onOpenWalletConnect}
                          onTopUp={onOpenTopUp}
                          onAction={() => joinBattle(battle)}
                          readyLabel={
                            <>
                              Join Battle <ChevronRight size={16} />
                            </>
                          }
                          topUpLabel={(shortfall) => `Need ${formatShortfallUp(shortfall)} ₮ more • Top up`}
                          className="w-full py-2.5 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                        />
                      )}
          </div>
                  );
                })}
                </div>
            </div>
          )}

          <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">All Battles</div>
          <div className={`grid ${isTelegramMiniApp ? 'grid-cols-1 gap-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'}`}>
            {otherBattles.map((battle) => {
              const battleCost = battle.cases.reduce((sum, c) => sum + c.price, 0);
              const isBotBattle = battle.source === 'BOT';
              return isTelegramMiniApp ? (
                <div
                  key={battle.id}
                  onClick={() => joinBattle(battle)}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-3 active:scale-[0.98] transition"
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    {battle.cases.slice(0, 3).map((caseData, idx) => (
                      <div key={`${battle.id}-${caseData.id}-${idx}`} className="w-9 h-9 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                        <CaseIcon value={caseData.image || caseData.possibleDrops[0]?.image || ''} size="sm" meta={caseData.imageMeta} className="rounded-full" />
                      </div>
                    ))}
                    {battle.cases.length > 3 && <span className="text-[10px] text-gray-500">+{battle.cases.length - 3}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isBotBattle ? <Bot size={12} className="text-web3-accent shrink-0" /> : battle.hostAvatar ? <div className="w-4 h-4 rounded-full overflow-hidden shrink-0"><ImageWithMeta src={battle.hostAvatar} meta={battle.hostAvatarMeta ?? undefined} className="w-full h-full rounded-full" /></div> : <UserIcon size={12} className="text-web3-accent shrink-0" />}
                      <span className="text-[11px] font-bold text-white truncate">{battle.host}</span>
                    </div>
                    <div className="text-[10px] text-gray-500">{battle.cases.length} rounds</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-web3-accent">{format2(battleCost)} ₮</div>
                    <div className="text-[9px] text-gray-500 uppercase">Join</div>
                  </div>
                </div>
              ) : (
                <div
                  key={battle.id}
                  className="bg-black/20 border border-white/[0.08] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
                      {isBotBattle ? <Bot size={14} className="text-web3-accent" /> : battle.hostAvatar ? <div className="w-5 h-5 rounded-full overflow-hidden shrink-0"><ImageWithMeta src={battle.hostAvatar} meta={battle.hostAvatarMeta ?? undefined} className="w-full h-full rounded-full" /></div> : <UserIcon size={14} className="text-web3-accent" />}
                      {battle.host}
                    </div>
                    <div className="text-xs font-bold text-web3-accent">{battle.cases.length} rounds</div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    {battle.cases.slice(0, 4).map((caseData, idx) => (
                      <div key={`${battle.id}-${caseData.id}-${idx}`} className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                        <CaseIcon value={caseData.image || caseData.possibleDrops[0]?.image || ''} size="sm" meta={caseData.imageMeta} className="rounded-full" />
                      </div>
                    ))}
                    {battle.cases.length > 4 && <div className="text-xs text-gray-500">+{battle.cases.length - 4}</div>}
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gray-500">Total Cost</div>
                      <div className="text-lg font-black text-white">{format2(battleCost)} ₮</div>
                    </div>
                    <div className="text-xs text-gray-500">Rounds: {battle.cases.length}</div>
                  </div>
                  {battle.status && battle.status !== 'OPEN' ? (
                    <button onClick={() => joinBattle(battle)} className="w-full py-2.5 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 bg-web3-accent/20 border border-web3-accent/40 text-web3-accent">
                      View <ChevronRight size={16} />
                    </button>
                  ) : (
                    <AdminActionButton isAuthenticated={isAuthenticated} isAdmin={isAdmin} balance={balance} cost={battleCost} onConnect={onOpenWalletConnect} onTopUp={onOpenTopUp} onAction={() => joinBattle(battle)}
                      readyLabel={<>Join Battle <ChevronRight size={16} /></>}
                      topUpLabel={(shortfall) => `Need ${formatShortfallUp(shortfall)} ₮ more • Top up`}
                      className="w-full py-2.5 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                    />
                  )}
                </div>
              );
            })}
        </div>
        </div>

        {createBattleOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
            <div className={`relative bg-black/70 border border-white/[0.12] rounded-2xl w-[94%] max-w-6xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm flex flex-col ${
              isTelegramMiniApp ? 'p-4 h-[calc(100dvh-2.5rem)]' : 'p-8 h-[720px]'
            }`}>
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
                <ConfirmModal
                  title={battleLoading ? 'Creating...' : 'Confirm'}
                  message={battleLoading ? 'Please wait' : `${format2(createTotalCost)} ₮`}
                  confirmLabel={battleLoading ? 'Loading...' : 'Create'}
                  cancelLabel="Cancel"
                  onConfirm={battleLoading ? () => {} : handleCreateBattle}
                  onCancel={battleLoading ? () => {} : () => setCreateConfirm(false)}
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                <div className="lg:col-span-2 flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500">Pick cases</div>
                    <SearchInput
                      value={createSearchFilter}
                      onChange={(value) => setCreateSearchFilter(sanitizeCreateSearch(value))}
                      placeholder="Search by name, token ($DOGE) or max price (500)"
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
                              <div className="text-[10px] text-gray-300 font-bold">{format2(caseData.price)} ₮</div>
                              {caseData.openDurationHours && caseData.createdAt && (
                                <div className="text-[9px] uppercase tracking-wider text-gray-500">
                                  {getRemainingTime(caseData)}
                                </div>
                              )}
                              <div className="flex-1 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                                  <CaseIcon
                                    value={caseData.image || caseData.possibleDrops[0]?.image || ''}
                                    size="sm"
                                    meta={caseData.imageMeta}
                                    className="rounded-full"
                                  />
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
                              <div className="text-[10px] text-gray-300 font-bold">{format2(caseData.price)} ₮</div>
                              {caseData.openDurationHours && caseData.createdAt && (
                                <div className="text-[9px] uppercase tracking-wider text-gray-500">
                                  {getRemainingTime(caseData)}
                                </div>
                              )}
                              <div className="flex-1 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center">
                                  <CaseIcon
                                    value={caseData.image || caseData.possibleDrops[0]?.image || ''}
                                    size="sm"
                                    meta={caseData.imageMeta}
                                    className="rounded-full"
                                  />
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
                  <Pagination
                    className="mt-auto pt-3"
                    currentPage={createCasesPage}
                    totalPages={createCasesTotalPages}
                    onPageChange={setCreateCasesPage}
                  />
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
                            <CaseIcon
                              value={caseData.image || caseData.possibleDrops[0]?.image || ''}
                              size="sm"
                              meta={caseData.imageMeta}
                              className="rounded-full"
                            />
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
                      {isTelegramMiniApp ? 'Cost' : 'Total Cost'}
          </div>
                    <div className="text-lg font-black text-white mb-4">
                      {format2(createTotalCost)} ₮
            </div>
                    <AdminActionButton
                      isAuthenticated={isAuthenticated}
                      isAdmin={isAdmin}
                      balance={balance}
                      cost={0}
                      onConnect={onOpenWalletConnect}
                      onTopUp={(_shortfall) => {}}
                      onAction={handleCreateBattle}
                      readyLabel="Create Battle"
                      disabled={createSelectedCases.length === 0}
                      className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-xs"
                    />
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
  const userTotal = sumUsdt(userDrops);
  const botTotal = sumUsdt(botDrops);
  const isUserWinning = userTotal >= botTotal;
  const canStartBattleNow = isSpectator ? false : isOwnBattle || canAffordBattle;
  const hasOpponent = opponent.type !== null;
  const leftIsUser = isOwnBattle;
  const leftName = leftIsUser ? userName : hostName || opponent.name;
  const rightName = leftIsUser ? botName || opponent.name : isSpectator ? (botName || 'Opponent') : userName;

  if (gameState !== 'SETUP') {
    const isResult = gameState === 'RESULT';
    const finalUserTotal = sumUsdt(battleOutcomes.map(r => r.userItem));
    const finalBotTotal = sumUsdt(battleOutcomes.map(r => r.botItem));
    const groupByCurrency = (items: Item[]) =>
      items.reduce((acc, item) => { acc[item.currency] = (acc[item.currency] || 0) + item.value; return acc; }, {} as Record<string, number>);
    const userTokensByCurrency = groupByCurrency(battleOutcomes.map(r => r.userItem));
    const botTokensByCurrency = groupByCurrency(battleOutcomes.map(r => r.botItem));
    const leftTotal = leftIsUser ? finalUserTotal : finalBotTotal;
    const rightTotal = leftIsUser ? finalBotTotal : finalUserTotal;
    const leftTokensByCurrency = leftIsUser ? userTokensByCurrency : botTokensByCurrency;
    const rightTokensByCurrency = leftIsUser ? botTokensByCurrency : userTokensByCurrency;
    const userWon = resolveUserWon(finalUserTotal, finalBotTotal);
    const leftWon = forcedWinnerName
      ? forcedWinnerName.toLowerCase() === leftName.toLowerCase()
      : (leftTotal === rightTotal ? (leftIsUser ? userWon : !userWon) : leftTotal > rightTotal);
    const displayWin = isSpectator ? leftWon : userWon;
    const wonItems = userWon
      ? [...battleOutcomes.map(o => o.userItem), ...battleOutcomes.map(o => o.botItem)]
      : [];
    const winningsUsdt = wonItems.reduce((s, item) => s + itemUsdt(item), 0);
    const winningsByToken = wonItems.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item.value;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className={`flex flex-col relative ${isTelegramMiniApp ? 'min-h-0' : 'min-h-screen'}`}>
        {ErrorBanner}
        {/* Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="text-9xl font-black text-web3-accent animate-pulse">
              {countdown > 0 ? countdown : 'FIGHT!'}
            </div>
          </div>
        )}

        {/* Tiebreaker Wheel Overlay */}
        {showTiebreaker && (() => {
          const tieUserWon = resolveUserWon(
            sumUsdt(battleOutcomes.map(r => r.userItem)),
            sumUsdt(battleOutcomes.map(r => r.botItem))
          );
          const tieLeftWon = isOwnBattle ? tieUserWon : !tieUserWon;
          const winnerColor = tieLeftWon ? '#66FCF1' : '#EF4444';
          return (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-lg animate-fade-in">
            <div className="flex flex-col items-center gap-6 w-full max-w-xs px-4">
              {/* Title */}
              <div className="text-center">
                <div className="text-lg font-black uppercase tracking-tight text-white">
                  Draw<span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent to-web3-purple animate-gradient bg-size-200">!</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mt-1">Spinning for the winner</div>
              </div>

              {/* Player legend */}
              <div className="flex items-center justify-center gap-4 w-full">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${tiebreakerRevealed && tieLeftWon ? 'border-web3-accent/60 bg-web3-accent/10' : 'border-white/[0.08] bg-black/30'} transition-all duration-500`}>
                  <div className="w-3 h-3 rounded-full bg-[#66FCF1] shrink-0" />
                  <span className="text-[11px] font-bold text-white truncate max-w-[80px]">{leftName}</span>
                </div>
                <div className="text-[10px] font-bold text-gray-600">VS</div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${tiebreakerRevealed && !tieLeftWon ? 'border-red-500/60 bg-red-500/10' : 'border-white/[0.08] bg-black/30'} transition-all duration-500`}>
                  <div className="w-3 h-3 rounded-full bg-[#EF4444] shrink-0" />
                  <span className="text-[11px] font-bold text-white truncate max-w-[80px]">{rightName}</span>
                </div>
              </div>

              {/* Wheel */}
              <div className="relative">
                {/* Pointer — fixed at top */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
                  <div style={{
                    width: 0, height: 0,
                    borderLeft: '12px solid transparent',
                    borderRight: '12px solid transparent',
                    borderTop: '22px solid white',
                    filter: tiebreakerRevealed ? `drop-shadow(0 0 12px ${winnerColor})` : 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))',
                    transition: 'filter 0.5s',
                  }} />
                </div>

                {/* Outer glow ring */}
                <div
                  className="absolute -inset-3 rounded-full transition-all duration-700"
                  style={{
                    boxShadow: tiebreakerRevealed
                      ? `0 0 40px ${winnerColor}40, 0 0 80px ${winnerColor}20`
                      : '0 0 30px rgba(102,252,241,0.08)',
                  }}
                />

                {/* Wheel body */}
                <div
                  className="w-56 h-56 rounded-full border-[3px] border-white/10 relative overflow-hidden"
                  style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.4)' }}
                >
                  <div
                    className="w-full h-full rounded-full relative"
                    style={{
                      transform: `rotate(${tiebreakerRotation}deg)`,
                      transition: tiebreakerRotation > 0 ? 'transform 4s cubic-bezier(0.15, 0.85, 0.25, 1)' : 'none',
                    }}
                  >
                    {/* Left=teal (180-360°), Right=red (0-180°) */}
                    <div className="absolute inset-0" style={{
                      background: 'conic-gradient(from 0deg, #8b1a1a 0deg, #a12020 45deg, #8b1a1a 90deg, #5c1515 180deg, #0d3d3a 180deg, #155e57 225deg, #1a7a70 270deg, #155e57 315deg, #0d3d3a 360deg)',
                    }} />

                    {/* Vertical divider */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-[3px] -translate-x-[1.5px] bg-gradient-to-b from-transparent via-white/50 to-transparent" />

                    {/* Teal accent stripe (left half) */}
                    <div className="absolute top-0 bottom-0 left-0 w-1/2">
                      <div className="absolute inset-y-0 right-0 w-[4%] bg-[#66FCF1]/25" />
                    </div>
                    {/* Red accent stripe (right half) */}
                    <div className="absolute top-0 bottom-0 right-0 w-1/2">
                      <div className="absolute inset-y-0 left-0 w-[4%] bg-[#EF4444]/25" />
                    </div>

                    {/* Left player name (teal half) — vertical, parallel to divider */}
                    <div className="absolute top-0 bottom-0 left-0 w-1/2 flex items-center justify-center">
                      <span className="text-[#66FCF1] font-black text-[11px] uppercase tracking-[0.15em] drop-shadow-[0_0_8px_rgba(102,252,241,0.6)] max-w-[80px] truncate text-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        {leftName}
                      </span>
                    </div>
                    {/* Right player name (red half) — vertical, parallel to divider */}
                    <div className="absolute top-0 bottom-0 right-0 w-1/2 flex items-center justify-center">
                      <span className="text-[#EF4444] font-black text-[11px] uppercase tracking-[0.15em] drop-shadow-[0_0_8px_rgba(239,68,68,0.6)] max-w-[80px] truncate text-center" style={{ writingMode: 'vertical-rl' }}>
                        {rightName}
                      </span>
                    </div>

                    {/* Center hub */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-[#0B1018] border-2 border-white/20 shadow-[0_0_15px_rgba(0,0,0,0.6)]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Winner announcement */}
              {tiebreakerRevealed && (
                <div className="animate-scale-in text-center mt-1">
                  <div className="text-2xl font-black uppercase tracking-tight">
                    <span style={{ color: winnerColor }}>{tieLeftWon ? leftName : rightName}</span>
                  </div>
                  <div className="text-xs font-bold uppercase tracking-[0.3em] mt-1" style={{ color: winnerColor }}>
                    Winner
                  </div>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {isTelegramMiniApp && (
          <div className="px-2 pt-2">
            <button
              onClick={playAgain}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-black/25 border border-white/[0.12] hover:border-web3-accent/50 transition-all duration-300 text-gray-300 hover:text-white"
            >
              <ArrowLeft size={16} />
              <span className="font-bold uppercase tracking-wider text-xs">Back</span>
            </button>
          </div>
        )}

        {/* Scoreboard */}
        {isTelegramMiniApp ? (
          <div className="flex items-center gap-2 px-3 py-2 mt-1 bg-black/20 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 bg-gray-800 rounded-full border border-web3-accent flex items-center justify-center shrink-0 overflow-hidden">
                {leftPlayerIsBot ? <Bot className="text-web3-accent" size={16} /> : leftPlayerAvatar ? <ImageWithMeta src={leftPlayerAvatar} meta={leftPlayerAvatarMeta} className="w-full h-full rounded-full" /> : <UserIcon className="text-web3-accent" size={16}/>}
              </div>
              <span className="text-[11px] font-bold text-white truncate">{leftName}</span>
            </div>
            <div className="shrink-0 px-2 py-1 rounded-lg bg-gray-900/70 border border-gray-700 text-center">
              <div className="text-[8px] text-gray-500 font-bold uppercase">Round</div>
              <div className="text-sm font-bold text-white">{currentRound + 1}<span className="text-gray-600">/</span>{selectedCases.length}</div>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
              <span className="text-[11px] font-bold text-white truncate">{rightName}</span>
              <div className="w-8 h-8 bg-gray-800 rounded-full border border-red-500 flex items-center justify-center shrink-0 overflow-hidden">
                {rightPlayerIsBot ? <Bot className="text-red-500" size={16} /> : rightPlayerAvatar ? <ImageWithMeta src={rightPlayerAvatar} meta={rightPlayerAvatarMeta} className="w-full h-full rounded-full" /> : <UserIcon className="text-red-500" size={16}/>}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-black/20 border-b border-white/[0.06] shadow-lg z-20 backdrop-blur-sm h-20 flex">
            <div className={`flex-1 flex items-center justify-center relative transition-colors duration-500 ${hasOpponent && isUserWinning ? 'bg-green-900/10' : ''}`}>
              <button onClick={playAgain} className="absolute left-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 border border-white/[0.12] hover:border-web3-accent/50 transition-all duration-300 text-gray-400 hover:text-white">
                <ArrowLeft size={18} />
                <span className="font-bold">Back</span>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-800 rounded-full border border-web3-accent flex items-center justify-center">
                  {leftPlayerIsBot ? <Bot className="text-web3-accent" size={20} /> : leftPlayerAvatar ? <ImageWithMeta src={leftPlayerAvatar} meta={leftPlayerAvatarMeta} className="w-full h-full rounded-full" /> : <UserIcon className="text-web3-accent" size={20}/>}
                </div>
                <div className="font-bold text-white">{leftName}</div>
              </div>
            </div>
            <div className="w-20 bg-gray-900 border-x border-gray-700 flex flex-col items-center justify-center z-30">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Round</div>
              <div className="text-lg font-bold text-white">{currentRound + 1}<span className="text-gray-600">/</span>{selectedCases.length}</div>
            </div>
            <div className={`flex-1 flex items-center justify-center transition-colors duration-500 ${hasOpponent && !isUserWinning ? 'bg-red-900/10' : ''}`}>
              {!battleStarted && opponent.type ? (
                <div className="text-gray-500 font-bold uppercase tracking-wider animate-pulse">Waiting for you...</div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-800 rounded-full border border-red-500 flex items-center justify-center">
                    {rightPlayerIsBot ? <Bot className="text-red-500" size={20} /> : rightPlayerAvatar ? <ImageWithMeta src={rightPlayerAvatar} meta={rightPlayerAvatarMeta} className="w-full h-full rounded-full" /> : <UserIcon className="text-red-500" size={20}/>}
                  </div>
                  <div className="font-bold text-white">{rightName}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cases Strip */}
        <div className={`border-b border-white/[0.06] bg-black/20 backdrop-blur-sm relative overflow-hidden ${
          isTelegramMiniApp ? 'h-14' : 'px-6 py-4'
        }`}>
          {!isTelegramMiniApp && (
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
              Total Cost <span className="text-web3-accent font-bold">{format2(totalCost)} ₮</span>
            </div>
          )}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center pointer-events-none">
            <div
              className="flex items-center gap-2 transition-transform duration-700 ease-out"
              style={{
                transform: `translateX(calc(50% - ${currentRound * 48}px - 20px))`,
                position: 'relative',
              }}
            >
              {selectedCases.map((caseData, idx) => {
                const isActive = idx === currentRound;
                const isPast = idx < currentRound;
                return (
                  <div
                    key={`${caseData.id}-${idx}-strip`}
                    className={`shrink-0 rounded-full border bg-black/30 flex items-center justify-center transition-all duration-500 ${
                      isActive
                        ? `${isTelegramMiniApp ? 'w-10 h-10' : 'w-10 h-10'} border-web3-accent scale-125`
                        : `w-10 h-10 border-white/[0.12] ${isPast ? 'opacity-40' : 'opacity-70'}`
                    }`}
                  >
                    <span className={isActive ? 'drop-shadow-[0_0_10px_rgba(102,252,241,0.9)]' : ''}>
                      <CaseIcon
                        value={caseData.image || caseData.possibleDrops[0]?.image || ''}
                        size="sm"
                        meta={caseData.imageMeta}
                        className="rounded-full"
                      />
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-black/60 to-transparent"></div>
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/60 to-transparent"></div>
          </div>
        </div>

        {/* Split Screen */}
        <div className={`flex-1 relative overflow-hidden ${isTelegramMiniApp ? 'flex gap-3 p-3' : 'flex'}`}>
          {!isTelegramMiniApp && <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/[0.06] pointer-events-none"></div>}
          {/* Pre-start layout when joining a battle */}
          {!battleStarted && opponent.type && (
            <>
          <div className={`flex-1 relative flex flex-col items-center ${isTelegramMiniApp ? 'rounded-xl border border-white/[0.08] bg-black/20' : 'border-r border-gray-800'}`}>
                <div className={`absolute top-0 inset-x-0 h-40 pointer-events-none bg-gradient-to-b ${leftIsUser ? 'from-web3-accent/5' : 'from-red-500/5'} to-transparent`}></div>
                <div className={`w-full max-w-lg z-10 flex flex-col items-center ${isTelegramMiniApp ? 'mt-10 px-3' : 'mt-20 px-6'}`}>
                  <div className={`w-32 h-32 rounded-full border-2 ${leftIsUser ? 'border-web3-accent/60' : 'border-web3-success/60'} bg-black/30 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.35)]`}>
                    <Check size={32} className="text-web3-success" />
                    </div>
                  <div className="mt-4 text-xs uppercase tracking-widest text-gray-400">{leftIsUser ? 'You ready' : 'Creator ready'}</div>
                  </div>
                </div>

              <div className={`flex-1 relative flex flex-col items-center ${isTelegramMiniApp ? 'rounded-xl border border-white/[0.08] bg-black/20' : ''}`}>
                <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none"></div>
              <div className={`relative flex flex-col items-center animate-fade-in ${isTelegramMiniApp ? 'mt-10' : 'mt-20'}`}>
                <button
                  onClick={handleStartBattle}
                  disabled={startConfirm || isWaitingForOwner}
                  className={`w-32 h-32 rounded-full border-2 flex items-center justify-center transition ${
                    !isAuthenticated
                      ? 'border-web3-accent/60 bg-black/30 shadow-[0_0_24px_rgba(102,252,241,0.35)] hover:scale-105'
                      : canStartBattleNow
                        ? 'border-web3-accent/60 bg-black/30 shadow-[0_0_24px_rgba(102,252,241,0.35)] hover:scale-105'
                        : 'border-red-500/40 bg-gray-800/50'
                  } ${(startConfirm || isWaitingForOwner) ? 'opacity-40 cursor-wait' : ''}`}
                  aria-label="Join Battle"
                >
                  <span className={`text-xs uppercase tracking-widest font-bold text-center px-2 ${
                    !isAuthenticated || canStartBattleNow ? 'text-web3-accent' : 'text-gray-400'
                  }`}>
                    {!isAuthenticated
                      ? 'Connect'
                      : !canStartBattleNow
                        ? `Need ${formatShortfallUp(battleShortfall)} ₮ more • Top up`
                        : isOwnBattle
                          ? 'Call Bot'
                          : isWaitingForOwner
                            ? 'Waiting'
                            : 'Join'}
                  </span>
                </button>
            </div>
          </div>
            </>
          )}

          {!(!battleStarted && opponent.type) && (
            <>
              {/* Left Side */}
              <div className={`flex-1 relative flex flex-col items-center ${isTelegramMiniApp ? 'rounded-xl border border-white/[0.08] bg-black/20' : 'border-r border-gray-800'}`}>
                <div className={`absolute top-0 inset-x-0 h-40 pointer-events-none bg-gradient-to-b ${leftIsUser ? 'from-web3-accent/5' : 'from-red-500/5'} to-transparent`}></div>
                
                <div className={`w-full max-w-xl px-4 z-10 ${isTelegramMiniApp ? 'mt-3' : 'mt-6'}`}>
                  {currentCase && (
                      <CaseRoulette
                        key={`left-roulette-${currentRound}`}
                        caseData={currentCase}
                        winner={leftIsUser ? battleOutcomes[currentRound]?.userItem || null : battleOutcomes[currentRound]?.botItem || null}
                        openMode="normal"
                        index={0}
                        skipReveal
                        compactContent={isTelegramMiniApp}
                      />
                  )}
                  </div>

                <div className={`flex-1 w-full max-w-lg px-4 overflow-y-auto custom-scrollbar pb-4 ${isTelegramMiniApp ? 'mt-4' : 'mt-8'}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(leftIsUser ? userDrops : botDrops).map((item, i) => (
                      <ItemCard key={`${item.id}-${i}`} item={item} size="sm" currencyPrefix="$" compactContent={isTelegramMiniApp} />
              ))}
                          </div>
                        </div>
                      </div>

              {/* Right Side */}
          <div className={`flex-1 relative flex flex-col items-center justify-center ${isTelegramMiniApp ? 'rounded-xl border border-white/[0.08] bg-black/20' : ''}`}>
            {hasOpponent ? (
              <>
                    <div className={`absolute top-0 inset-x-0 h-40 pointer-events-none bg-gradient-to-b ${leftIsUser ? 'from-red-500/5' : 'from-web3-accent/5'} to-transparent`}></div>

                <div className="w-full h-full flex flex-col items-center justify-start">
                      <div className={`w-full max-w-xl px-4 z-10 ${isTelegramMiniApp ? 'mt-3' : 'mt-6'}`}>
                        {currentCase && (
                          <CaseRoulette
                            key={`right-roulette-${currentRound}`}
                            caseData={currentCase}
                            winner={leftIsUser ? battleOutcomes[currentRound]?.botItem || null : battleOutcomes[currentRound]?.userItem || null}
                            openMode="normal"
                            index={0}
                            skipReveal
                            compactContent={isTelegramMiniApp}
                          />
                        )}
                  </div>

                      <div className={`flex-1 w-full max-w-lg px-4 overflow-y-auto custom-scrollbar pb-4 ${isTelegramMiniApp ? 'mt-4' : 'mt-8'}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {(leftIsUser ? botDrops : userDrops).map((item, i) => (
                            <ItemCard key={`${item.id}-${i}`} item={item} size="sm" currencyPrefix="$" compactContent={isTelegramMiniApp} />
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

        {startConfirm && !battleStarted && opponent.type && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 overflow-y-auto py-4">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.16] bg-[#0E1016]/95 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.55)] my-auto">
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Confirm battle</div>
              <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-white">
                JOIN
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">
                  BATTLE
                </span>
              </h3>

              <div className="mt-4 space-y-2 rounded-xl border border-white/[0.1] bg-black/35 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 uppercase tracking-widest text-[10px]">Opponent</span>
                  <span className="font-bold text-white uppercase">{hostName || opponent.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 uppercase tracking-widest text-[10px]">Rounds</span>
                  <span className="font-bold text-white">{selectedCases.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 uppercase tracking-widest text-[10px]">Battle cost</span>
                  <span className="font-black text-web3-accent">{format2(totalCost)} ₮</span>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setStartConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-white/[0.14] text-[10px] uppercase tracking-widest text-gray-300 hover:text-white hover:border-web3-accent/40 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartBattle}
                  disabled={battleLoading}
                  className={`px-5 py-2 rounded-lg bg-gradient-to-r from-web3-accent to-web3-success text-black font-black text-[10px] uppercase tracking-widest hover:scale-105 transition ${battleLoading ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {battleLoading ? 'Loading...' : isOwnBattle ? 'Call Bot' : 'Start Battle'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isWaitingForOwner && !battleStarted && opponent.type && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 overflow-y-auto py-4">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.16] bg-[#0E1016]/95 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.55)] text-center my-auto">
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Lobby status</div>
              <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-white">
                Waiting
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">
                  OWNER
                </span>
              </h3>
              <div className="mt-3 text-sm text-gray-300">
                Waiting for battle owner to join lobby...
              </div>
              <div className="mt-2 text-xs uppercase tracking-widest text-web3-accent">
                Starting in {ownerWaitSeconds}s
              </div>
            </div>
          </div>
        )}

        {isResult && (
          <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-slate-800/70 border border-white/[0.20] rounded-2xl p-6 text-center max-w-lg w-[90%] shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          {displayWin ? (
            <div className="flex flex-col items-center">
                  <div className="relative mb-2">
                    <div className="absolute -top-3 -left-6 text-web3-accent animate-ping">
                      <Sparkles size={13} />
                    </div>
                    <div className="absolute -top-3 -right-6 text-web3-success animate-ping" style={{ animationDelay: '0.3s' }}>
                      <Sparkles size={13} />
                    </div>
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-web3-purple animate-ping" style={{ animationDelay: '0.55s' }}>
                      <Sparkles size={13} />
                    </div>
                  <h1 className="text-3xl font-black uppercase tracking-tight mb-2 animate-fade-in text-white">
                    YOU
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">
                      VICTORY
                    </span>
                  </h1>
                  </div>
                  <div className="flex items-center gap-6 w-full justify-center mt-4">
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">{leftName}</div>
                      {Object.entries(leftTokensByCurrency).map(([cur, amt]) => (
                        <div key={cur} className="text-sm font-bold text-white">{format2(Number(amt))} ${cur}</div>
                      ))}
                      <div className="text-xs text-green-400">~ {format2(leftTotal)} ₮</div>
                </div>
                    <div className="text-xs font-bold text-gray-600">VS</div>
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">{rightName}</div>
                      {Object.entries(rightTokensByCurrency).map(([cur, amt]) => (
                        <div key={cur} className="text-sm font-bold text-white">{format2(Number(amt))} ${cur}</div>
                      ))}
                      <div className="text-xs text-red-400">~ {format2(rightTotal)} ₮</div>
                </div>
              </div>
                  <div className="bg-black/30 p-4 rounded-xl border border-white/[0.08] w-full mt-5 mb-5 animate-fade-in">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Winnings</div>
                    <div className="flex flex-wrap justify-center gap-3">
                  {Object.keys(winningsByToken).length === 0 ? (
                        <span className="text-gray-500 text-sm">No tokens won</span>
                  ) : (
                    Object.entries(winningsByToken).map(([currency, amount]) => (
                          <div key={currency} className="bg-black/40 px-3 py-1.5 rounded border border-white/[0.12] flex items-center gap-2">
                            <span className="text-white font-mono text-sm font-bold">{format2(Number(amount || 0))} ${currency}</span>
                      </div>
                    ))
                  )}
                </div>
                    <div className="text-center mt-2">
                      <span className="text-web3-accent font-mono text-sm font-bold">~ {format2(winningsUsdt)} ₮</span>
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
                      <div className="text-[10px] text-gray-500 uppercase">{leftName}</div>
                      {Object.entries(leftTokensByCurrency).map(([cur, amt]) => (
                        <div key={cur} className="text-sm font-bold text-white">{format2(Number(amt))} ${cur}</div>
                      ))}
                      <div className="text-xs text-gray-400">~ {format2(leftTotal)} ₮</div>
                </div>
                    <div className="text-xs font-bold text-gray-600">VS</div>
                <div className="text-center">
                      <div className="text-[10px] text-gray-500 uppercase">{rightName}</div>
                      {Object.entries(rightTokensByCurrency).map(([cur, amt]) => (
                        <div key={cur} className="text-sm font-bold text-white">{format2(Number(amt))} ${cur}</div>
                      ))}
                      <div className="text-xs text-red-400">~ {format2(rightTotal)} ₮</div>
                </div>
              </div>
                  <div className="bg-black/30 p-4 rounded-xl border border-white/[0.08] w-full mt-5 mb-5 animate-fade-in">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                    {isTelegramMiniApp ? 'Cost' : 'Total Cost'}
                  </div>
                  <div className="text-2xl font-mono font-bold text-red-500">{format2(totalCost)} ₮</div>
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
