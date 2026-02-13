import { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { CaseView } from './components/CaseView';
import { CreateCaseView } from './components/CreateCaseView';
import { UpgradeView } from './components/UpgradeView';
import { BattleView } from './components/BattleView';
import { ProfileView } from './components/ProfileView';
import { AdminView } from './components/AdminView';
import { LiveFeed } from './components/LiveFeed';
import { WalletConnectModal } from './components/WalletConnectModal';
import { TopUpModal } from './components/TopUpModal';
import { FeedbackWidget } from './components/FeedbackWidget';
import { ImageWithMeta } from './components/ui/ImageWithMeta';
import { INITIAL_USER } from './constants';
import { User, Item, Case } from './types';
import { useWallet } from './hooks/useWallet';
import { BrowserProvider } from 'ethers';
import { api, resolveAssetUrl } from './services/api';
import { getPendingDepositHashes, removePendingDepositHash } from './utils/pendingDeposits';
import { playCaseCreatedCelebration, playDullClick } from './utils/audio';

interface BattleRecord {
  id: string;
  opponent: string;
  result: 'WIN' | 'LOSS';
  cost: number;
  wonValue: number;
  wonItems: Item[];
}

const TAB_PATHS: Record<string, string> = {
  home: '/',
  createcase: '/create',
  case: '/cases',
  upgrade: '/upgrade',
  casebattle: '/battles',
  profile: '/profile',
  admin: '/admin',
};

const getTabFromPath = (pathname: string) => {
  const normalized = pathname.toLowerCase();
  const match = Object.entries(TAB_PATHS).find(([, path]) => path === normalized);
  return match?.[0] || 'home';
};

const App = () => {
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(window.location.pathname));
  const [user, setUser] = useState<User>(INITIAL_USER);
  const [isWalletConnectOpen, setIsWalletConnectOpen] = useState(false);
  const [inventory, setInventory] = useState<Item[]>([]);
  const [burntItems, setBurntItems] = useState<Item[]>([]);
  const [claimedItems, setClaimedItems] = useState<Item[]>([]);
  const [battleHistory, setBattleHistory] = useState<BattleRecord[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [createdCaseNotice, setCreatedCaseNotice] = useState<Case | null>(null);
  const [profileView, setProfileView] = useState<{
    user: User;
    inventory: Item[];
    burntItems: Item[];
    claimedItems: Item[];
    battleHistory: BattleRecord[];
  } | null>(null);
  const [mustSetUsername, setMustSetUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [botProfiles, setBotProfiles] = useState<Record<string, {
    user: User;
    inventory: Item[];
    burntItems: Item[];
    claimedItems: Item[];
    battleHistory: BattleRecord[];
  }>>({});
  const [balance, setBalance] = useState(0);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpInitialUsdt, setTopUpInitialUsdt] = useState<number | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [lastAuthAddress, setLastAuthAddress] = useState<string | null>(null);
  const [battleStartAlert, setBattleStartAlert] = useState<{
    lobbyId: string;
    hostName: string;
    joinerName: string;
    rounds: number;
    totalCost: number;
    startedAt: string;
  } | null>(null);

  const {
    address: walletAddress,
    isConnected,
    connectWallet,
    disconnectWallet,
    formatAddress,
    isConnecting: isWalletConnecting,
    error: walletError,
  } = useWallet();
  const isAdmin = user.role === 'ADMIN';
  const isEarlyAccess = user.role === 'MODERATOR';
  const canUseActivities = isAdmin || isEarlyAccess;

  const handleBalanceUpdate = (nextBalance: number) => {
    if (typeof nextBalance === 'number') {
      setBalance(nextBalance);
    }
  };

  const resetUserState = () => {
    setUser(INITIAL_USER);
    setInventory([]);
    setBurntItems([]);
    setClaimedItems([]);
    setBattleHistory([]);
    setBalance(0);
    setProfileView(null);
    setActiveTab('home');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
    resetUserState();
    setLastAuthAddress(null);
  };

  const mapCaseFromApi = (caseData: any): Case => ({
    id: caseData.id,
    name: caseData.name,
    currency: caseData.currency,
    tokenTicker: caseData.tokenTicker || caseData.currency,
    tokenPrice: caseData.tokenPrice,
    price: caseData.price,
    image: resolveAssetUrl(caseData.imageUrl || caseData.image || ''),
    imageMeta: caseData.imageMeta,
    rtu: caseData.rtu,
    openDurationHours: caseData.openDurationHours,
    createdAt: caseData.createdAt ? new Date(caseData.createdAt).getTime() : undefined,
    creatorName: caseData.createdBy?.username || caseData.creatorName,
    tokenAddress: caseData.tokenAddress,
    tokenDecimals: caseData.tokenDecimals,
    mintedAt: caseData.mintedAt ? new Date(caseData.mintedAt).getTime() : undefined,
    totalSupply: caseData.totalSupply,
    stats: caseData.stats,
    possibleDrops: (caseData.drops || caseData.possibleDrops || []).map((drop: any) => ({
      id: drop.id,
      name: drop.name,
      value: drop.value,
      currency: drop.currency,
      rarity: drop.rarity,
      image: resolveAssetUrl(drop.image || caseData.imageUrl || caseData.image || ''),
      imageMeta: caseData.imageMeta,
      color: drop.color,
      caseId: caseData.id,
    })),
  });

  const caseMetaMap = useMemo(() => {
    return new Map(cases.map((caseData) => [caseData.id, caseData.imageMeta]));
  }, [cases]);

  const enrichItemsWithCaseMeta = (items: Item[]) => {
    if (!items || !Array.isArray(items)) return [];
    return items.map((item) => {
      const meta = item.caseId ? caseMetaMap.get(item.caseId) : undefined;
      if (!meta) return item;
      return { ...item, imageMeta: item.imageMeta ?? meta };
    });
  };

  const loadProfile = async (fallbackAddress?: string) => {
    try {
      const response = await api.getProfile();
      if (response.data?.user) {
        setUser(prev => ({
          ...prev,
          ...response.data?.user,
          walletAddress: response.data?.user?.walletAddress || fallbackAddress || prev.walletAddress,
        }));
        if (response.data?.user?.walletAddress) {
          setLastAuthAddress(response.data.user.walletAddress.toLowerCase());
        }
        if (typeof response.data?.user?.balance === 'number') {
          setBalance(response.data.user.balance);
        }
      }
      if (response.data?.inventory) {
        const mapped = response.data.inventory.map((item: any) => ({
          ...item,
          image: resolveAssetUrl(item.image || ''),
        })) as Item[];
        setInventory(enrichItemsWithCaseMeta(mapped));
      }
      if (response.data?.burntItems) {
        const mapped = response.data.burntItems.map((item: any) => ({
          ...item,
          image: resolveAssetUrl(item.image || ''),
        })) as Item[];
        setBurntItems(enrichItemsWithCaseMeta(mapped));
      }
      if (response.data?.claimedItems) {
        const mapped = response.data.claimedItems.map((item: any) => ({
          ...item,
          image: resolveAssetUrl(item.image || ''),
        })) as Item[];
        setClaimedItems(enrichItemsWithCaseMeta(mapped));
      }
      if (response.data?.battleHistory) {
        setBattleHistory(
          response.data.battleHistory.map((battle: any) => ({
            id: battle.id,
            opponent: battle.opponent || 'Bot',
            result: battle.result,
            cost: battle.cost,
            wonValue: battle.wonValue,
            wonItems: battle.wonItems || [],
            timestamp: battle.timestamp ? new Date(battle.timestamp).getTime() : Date.now(),
            caseCount: battle.caseCount || battle.wonItems?.length || 0,
          }))
        );
      }
    } catch (error) {
      // not logged in
    }
  };

  const handleClaimToken = async (caseId: string) => {
    const response = await api.claimToken(caseId);
    if (!response.data) {
      throw new Error('Claim failed');
    }
    await loadProfile();
  };

  const loginWithWalletAddress = async (address: string) => {
    if (!address || !window.ethereum) return false;
    if (isAuthLoading) return false;
    setIsAuthLoading(true);
    try {
      if (lastAuthAddress && lastAuthAddress === address.toLowerCase()) {
        await loadProfile(address);
        return true;
      }

      const nonceResponse = await api.getNonce(address);
      const message = nonceResponse.data?.message;
      if (!message) return false;

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);

      const loginResponse = await api.loginWithWallet(address, signature, message);
      if (loginResponse.data?.user) {
        setUser(prev => ({
          ...prev,
          ...loginResponse.data?.user,
          walletAddress: address,
        }));
        if (typeof loginResponse.data?.user?.balance === 'number') {
          setBalance(loginResponse.data.user.balance);
        }
      }
      await loadProfile(address);
      setLastAuthAddress(address.toLowerCase());
      return true;
    } catch (error) {
      console.error('Wallet login failed', error);
      try {
        await api.logout();
      } catch {
        // ignore logout failures
      }
      resetUserState();
      setLastAuthAddress(null);
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleWalletConnect = async (address: string) => {
    return loginWithWalletAddress(address);
  };

  useEffect(() => {
    if (!walletAddress) {
      return;
    }
    if (lastAuthAddress && walletAddress.toLowerCase() !== lastAuthAddress) {
      handleLogout();
      return;
    }
    setUser(prev => ({
      ...prev,
      walletAddress: walletAddress,
    }));
  }, [walletAddress, lastAuthAddress]);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    const targetWallet = (user.walletAddress || walletAddress || '').toLowerCase();
    if (!lastAuthAddress || !targetWallet) return;
    if (targetWallet !== lastAuthAddress.toLowerCase()) return;

    let cancelled = false;
    let running = false;

    const syncPendingDeposits = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const hashes = getPendingDepositHashes(targetWallet);
        if (!hashes.length) return;

        for (const hash of hashes) {
          if (cancelled) break;
          try {
            const response = await api.confirmDeposit(hash);
            if (typeof response.data?.balance === 'number') {
              setBalance(response.data.balance);
              removePendingDepositHash(targetWallet, hash);
            } else if (!response.data?.pending) {
              // Unknown non-pending response; keep hash for next sync.
            }
          } catch (error: any) {
            const message = String(error?.message || '').toLowerCase();
            if (message.includes('already claimed')) {
              removePendingDepositHash(targetWallet, hash);
              await loadProfile(targetWallet);
            }
          }
        }
      } finally {
        running = false;
      }
    };

    syncPendingDeposits();
    const timer = window.setInterval(syncPendingDeposits, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [lastAuthAddress, user.walletAddress, walletAddress]);

  useEffect(() => {
    if (!lastAuthAddress || !canUseActivities || !user.id) {
      setBattleStartAlert(null);
      return;
    }
    let cancelled = false;
    const seenKey = `casefun:seenBattleStarts:${user.id}`;
    const readSeen = () => {
      try {
        const raw = localStorage.getItem(seenKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const writeSeen = (items: string[]) => {
      localStorage.setItem(seenKey, JSON.stringify(items.slice(-80)));
    };
    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await api.getBattleLobbies();
        const lobbies = Array.isArray(response.data?.lobbies) ? response.data.lobbies : [];
        const seen = new Set(readSeen());
        const fresh = lobbies.find((lobby: any) => {
          if (lobby?.status !== 'IN_PROGRESS' || !lobby?.startedAt) return false;
          const isParticipant = lobby.hostUserId === user.id || lobby.joinerUserId === user.id;
          if (!isParticipant) return false;
          const id = `${lobby.id}:${lobby.startedAt}`;
          return !seen.has(id);
        });
        if (!fresh) return;
        const marker = `${fresh.id}:${fresh.startedAt}`;
        seen.add(marker);
        writeSeen(Array.from(seen));
        setBattleStartAlert({
          lobbyId: String(fresh.id),
          hostName: String(fresh.hostName || 'Host'),
          joinerName: String(fresh.joinerName || 'Opponent'),
          rounds: Array.isArray(fresh.caseIds) ? fresh.caseIds.length : 0,
          totalCost: Number(fresh.totalCost || 0),
          startedAt: String(fresh.startedAt),
        });
        playDullClick(0.33);
      } catch {
        // ignore poll errors
      }
    };

    poll();
    const timer = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [lastAuthAddress, canUseActivities, user.id]);

  useEffect(() => {
    const handlePopState = () => {
      const nextTab = getTabFromPath(window.location.pathname);
      handleTabChange(nextTab, 'none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [lastAuthAddress]);

  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      handleTabChange('home', 'replace');
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    const normalized = walletAddress?.toLowerCase() || null;
    if (!isConnected || !normalized) return;
    if (!lastAuthAddress) return;
    if (normalized === lastAuthAddress) return;
    handleLogout();
  }, [walletAddress, isConnected, lastAuthAddress]);

  useEffect(() => {
    const loadCases = async () => {
      try {
        const response = await api.getCases(true);
        if (response.data?.cases) {
          setCases(response.data.cases.map(mapCaseFromApi));
        }
      } catch (error) {
        console.error('Failed to load cases', error);
      }
    };
    loadCases();
  }, []);

  useEffect(() => {
    if (!lastAuthAddress) {
      setMustSetUsername(false);
      return;
    }
    const currentName = (user.username || '').trim().toUpperCase();
    const wallet = (user.walletAddress || '').toLowerCase();
    const isPlaceholder =
      !currentName ||
      currentName === 'USER' ||
      currentName.startsWith('USER_') ||
      (wallet && currentName.toLowerCase() === wallet);
    setMustSetUsername(isPlaceholder);
    if (isPlaceholder) {
      setUsernameDraft('');
      setUsernameError('Please create a username to continue.');
      setUsernameAvailable(null);
    }
  }, [user.username, user.walletAddress, lastAuthAddress]);

  useEffect(() => {
    if (!mustSetUsername) return;
    const value = usernameDraft.trim();
    const localError = validateUsernameLocal(value);
    setUsernameError(localError);
    if (!value || localError) {
      setUsernameAvailable(null);
      return;
    }
    setUsernameChecking(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await api.checkUsernameAvailability(value);
        const available = response.data?.available;
        setUsernameAvailable(Boolean(available));
        if (!available) {
          setUsernameError('Username is already taken.');
        } else {
          setUsernameError(null);
        }
      } catch (error) {
        setUsernameError('Unable to check name. Try again.');
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [usernameDraft, mustSetUsername]);

  useEffect(() => {
    if (!cases.length) return;
    setInventory((prev) => enrichItemsWithCaseMeta(prev));
    setBurntItems((prev) => enrichItemsWithCaseMeta(prev));
  }, [cases]);

  const updateUrl = (tab: string, mode: 'push' | 'replace' | 'none' = 'push') => {
    const nextPath = TAB_PATHS[tab] || '/';
    if (mode === 'none') return;
    if (mode === 'replace') {
      window.history.replaceState({ tab }, '', nextPath);
      return;
    }
    window.history.pushState({ tab }, '', nextPath);
  };

  const handleTabChange = (tab: string, mode: 'push' | 'replace' | 'none' = 'push') => {
    const requiresAuth = tab === 'profile' || tab === 'admin';
    if (requiresAuth && !lastAuthAddress) {
      setIsWalletConnectOpen(true);
      setActiveTab('home');
      setProfileView(null);
      updateUrl('home', 'replace');
      return;
    }
    if (tab === 'admin' && !isAdmin) {
      setActiveTab('home');
      updateUrl('home', 'replace');
      return;
    }
    setActiveTab(tab);
    updateUrl(tab, mode);
    // Navigation via header/history should return to own profile context.
    setProfileView(null);
  };

  const handleCreateCase = () => {
    handleTabChange('createcase');
  };

  const handleOpenTopUp = (prefillUsdt?: number) => {
    const safePrefill =
      typeof prefillUsdt === 'number' && Number.isFinite(prefillUsdt) && prefillUsdt > 0
        ? prefillUsdt
        : null;
    setTopUpInitialUsdt(safePrefill);
    setIsTopUpOpen(true);
  };

  const handleCloseTopUp = () => {
    setIsTopUpOpen(false);
    setTopUpInitialUsdt(null);
  };

  const handleCaseCreated = (newCase: Case) => {
    setCases(prev => [newCase, ...prev]);
    handleTabChange('case');
    setCreatedCaseNotice(newCase);
  };

  useEffect(() => {
    if (!createdCaseNotice) return;
    playCaseCreatedCelebration();
  }, [createdCaseNotice]);


  const handleOpenCase = async (caseId: string, count: number) => {
    const winners: Item[] = [];
    let latestBalance = balance;
    const caseMeta = cases.find((caseData) => caseData.id === caseId)?.imageMeta;
    for (let i = 0; i < count; i++) {
      const response = await api.openCase(caseId);
      const won = response.data?.wonDrop;
      if (won) {
        const item: Item = {
          id: won.id,
          name: won.name,
          value: won.value,
          currency: won.currency,
          rarity: won.rarity,
          image: won.image || '',
          color: won.color,
          caseId: won.caseId || caseId,
          imageMeta: caseMeta,
        };
        winners.push(item);
      }
      if (typeof response.data?.balance === 'number') {
        latestBalance = response.data.balance;
      }
    }
    if (winners.length) {
      setInventory(prev => [...winners, ...prev]);
      setUser(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          casesOpened: prev.stats.casesOpened + winners.length,
        },
      }));
    }
    setBalance(latestBalance);
    return winners;
  };

  const isCaseExpired = (caseId?: string) => {
    if (!caseId) return false;
    const caseData = cases.find((entry) => entry.id === caseId);
    if (!caseData) return true;
    if (!caseData.openDurationHours || !caseData.createdAt) return false;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    return endAt <= Date.now();
  };

  const activeInventory = useMemo(
    () => inventory.filter((item) => !isCaseExpired(item.caseId)),
    [inventory, cases]
  );

  const handleUpgrade = async (originalItems: Item[], multiplier: number) => {
    const response = await api.upgradeItem(originalItems.map((item) => item.id), multiplier);
    const success = response.data?.success;
    const targetValue = response.data?.targetValue;
    const newItem = response.data?.newItem;
    const consumedItemIds = response.data?.consumedItemIds || response.data?.burntItemIds || [];
    const consumedSet = new Set(consumedItemIds);
    const consumedItems = originalItems.filter((item) => consumedSet.has(item.id));

    if (consumedSet.size > 0) {
      setInventory((prev) => prev.filter((item) => !consumedSet.has(item.id)));
      setBurntItems((prev) => [...consumedItems, ...prev]);
    }

    if (success && newItem) {
      const fallbackItem = originalItems[0];
      const upgradedItem: Item = {
        id: newItem.id,
        name: newItem.name,
        value: newItem.value,
        currency: newItem.currency,
        rarity: newItem.rarity,
        image: newItem.image || fallbackItem?.image || '',
        color: newItem.color,
        caseId: newItem.caseId,
      };
      setInventory(prev => {
        return [upgradedItem, ...prev];
      });
      setUser(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          upgradesAttempted: prev.stats.upgradesAttempted + 1,
          upgradeSuccessCount: prev.stats.upgradeSuccessCount + 1,
        },
      }));
    } else {
      setUser(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          upgradesAttempted: prev.stats.upgradesAttempted + 1,
        },
      }));
    }

    return { success: Boolean(success), targetValue: Number(targetValue || 0) };
  };

  const handleBattleFinish = async (
    wonItems: Item[],
    totalCost: number,
    options?: { reserveItems?: Item[]; mode?: 'BOT' | 'PVP'; lobbyId?: string | null }
  ) => {
    const isWin = wonItems.length > 0;
    const wonValue = wonItems.reduce((sum, item) => sum + item.value, 0);
    
    const battleRecord: BattleRecord = {
      id: `battle-${Date.now()}`,
      opponent: 'Bot_SniperX',
      result: isWin ? 'WIN' : 'LOSS',
      cost: totalCost,
      wonValue: wonValue,
      wonItems: wonItems
    };
    
    setBattleHistory(prev => [battleRecord, ...prev]);

    try {
      const response = await api.recordBattle(isWin ? 'WIN' : 'LOSS', totalCost, wonItems, {
        reserveItems: options?.reserveItems || [],
        mode: options?.mode || 'PVP',
        lobbyId: options?.lobbyId || undefined,
      });
      const created = response.data?.items;
      if (Array.isArray(created) && created.length > 0) {
        const mapped = created.map((item: any) => ({
          id: item.id,
          name: item.name,
          value: Number(item.value || 0),
          currency: item.currency,
          rarity: item.rarity,
          image: item.image || '',
          color: item.color || '',
          caseId: item.caseId || undefined,
          imageMeta: item.caseId ? caseMetaMap.get(item.caseId) : undefined,
        })) as Item[];
        setInventory(prev => [...mapped, ...prev.filter(existing => !mapped.find(m => m.id === existing.id))]);
      } else if (isWin) {
        setInventory(prev => [...wonItems, ...prev]);
      }
    } catch (error) {
      console.error('Failed to record battle', error);
      if (isWin) {
        setInventory(prev => [...wonItems, ...prev]);
      }
    }
  };

  const handleUpdateUsername = async (username: string) => {
    const response = await api.updateProfile(username);
    if (response.data?.user) {
      setUser(prev => ({ ...prev, ...response.data?.user }));
      if (profileView) {
        setProfileView({
          ...profileView,
          user: { ...profileView.user, ...response.data.user },
        });
      }
    }
  };

  const sanitizeUsername = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

  const validateUsernameLocal = (value: string) => {
    if (!value) return 'Username is required.';
    if (!/^[A-Z0-9_-]{3,20}$/.test(value)) {
      return 'Use 3-20 chars (A-Z, 0-9, _ or -).';
    }
    if (value.startsWith('USER_')) {
      return 'Username is reserved.';
    }
    return null;
  };

  const handleSaveRequiredUsername = async () => {
    const value = usernameDraft.trim();
    const localError = validateUsernameLocal(value);
    if (localError) {
      setUsernameError(localError);
      return;
    }
    if (usernameAvailable === false) {
      setUsernameError('Username is already taken.');
      return;
    }
    setUsernameSaving(true);
    try {
      await handleUpdateUsername(value);
      setMustSetUsername(false);
      setUsernameDraft('');
      setUsernameError(null);
    } catch (error) {
      setUsernameError('Failed to update username.');
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleUploadAvatar = async (file: File, meta?: Record<string, any>) => {
    const response = await api.uploadAvatar(file, meta);
    const avatarUrl = response.data?.avatarUrl;
    if (avatarUrl) {
      setUser(prev => ({
        ...prev,
        avatar: resolveAssetUrl(avatarUrl),
        avatarMeta: response.data?.user?.avatarMeta ?? prev.avatarMeta,
      }));
      if (profileView) {
        setProfileView({
          ...profileView,
          user: {
            ...profileView.user,
            avatar: resolveAssetUrl(avatarUrl),
            avatarMeta: response.data?.user?.avatarMeta ?? profileView.user.avatarMeta,
          },
        });
      }
    }
    return avatarUrl ? resolveAssetUrl(avatarUrl) : undefined;
  };

  const handleUpdateAvatarMeta = async (meta: Record<string, any>) => {
    const response = await api.updateAvatarMeta(meta);
    if (response.data?.user) {
      setUser(prev => ({ ...prev, ...response.data.user }));
      if (profileView) {
        setProfileView({
          ...profileView,
          user: { ...profileView.user, ...response.data.user },
        });
      }
    }
  };

  const handleChargeBattle = async (amount: number) => {
    try {
      const response = await api.chargeBattle(amount);
      if (response.data?.balance !== undefined) {
        setBalance(response.data.balance);
      }
      return true;
    } catch (error) {
      console.error('Failed to charge battle', error);
      return false;
    }
  };

  const buildBotProfile = (username: string) => {
    const pickCase = () => cases[Math.floor(Math.random() * cases.length)];
    const pickItem = () => {
      const caseData = pickCase();
      const drop = caseData.possibleDrops[Math.floor(Math.random() * caseData.possibleDrops.length)];
      return { ...drop, id: `${drop.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
    };

    const inventoryCount = 8 + Math.floor(Math.random() * 8);
    const burntCount = Math.floor(Math.random() * 4);
    const inventoryItems = Array.from({ length: inventoryCount }, pickItem);
    const burntItemsList = Array.from({ length: burntCount }, pickItem);
    const battleHistoryList: BattleRecord[] = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => {
      const wonItems = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, pickItem);
      const wonValue = wonItems.reduce((sum, item) => sum + item.value, 0);
      const cost = Math.max(10, Math.floor(Math.random() * 200));
      const result = Math.random() > 0.45 ? 'WIN' : 'LOSS';
      return {
        id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        opponent: 'Bot',
        result,
        cost,
        wonValue,
        wonItems: result === 'WIN' ? wonItems : [],
      };
    });

    const upgradesAttempted = 20 + Math.floor(Math.random() * 50);
    const upgradeSuccessCount = Math.floor(upgradesAttempted * (0.3 + Math.random() * 0.5));
    const casesOpened = 40 + Math.floor(Math.random() * 200);

    return {
      user: {
        username,
        walletAddress: `0xBOT${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 6)}`,
        balance: 0,
        avatar: '',
        transactions: [],
        battleHistory: [],
        stats: {
          casesOpened,
          totalWon: inventoryItems.reduce((sum, item) => sum + item.value, 0),
          upgradesAttempted,
          upgradeSuccessCount,
        }
      },
      inventory: inventoryItems,
      burntItems: burntItemsList,
      claimedItems: [],
      battleHistory: battleHistoryList,
    };
  };

  const handleSelectUser = (username: string) => {
    if (username === user.username) {
      setProfileView(null);
      setActiveTab('profile');
      return;
    }

    if (botProfiles[username]) {
      setProfileView(botProfiles[username]);
      setActiveTab('profile');
      return;
    }

    const profile = buildBotProfile(username);
    setBotProfiles(prev => ({ ...prev, [username]: profile }));
    setProfileView(profile);
    setActiveTab('profile');
  };

  const getUserAvatarByName = (username: string) => {
    if (!username) return undefined;
    if (username === user.username) {
      return user.avatar || undefined;
    }
    return botProfiles[username]?.user?.avatar || undefined;
  };

  return (
    <div className="flex flex-col h-screen bg-[#0B0C10] text-white overflow-hidden font-sans relative">
      {/* Global Parallax Background - Fixed positioning */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div 
              className="absolute w-[600px] h-[600px] bg-web3-accent/30 rounded-full blur-[140px] animate-pulse-slow"
              style={{ 
                top: '-100px',
                right: '10%',
                animationDelay: '0s'
              }}
            ></div>
            
            <div 
              className="absolute w-[700px] h-[700px] bg-web3-purple/25 rounded-full blur-[150px] animate-pulse-slow"
              style={{ 
                top: '20%',
                left: '5%',
                animationDelay: '1s'
              }}
            ></div>

            <div 
              className="absolute w-[800px] h-[800px] bg-web3-success/20 rounded-full blur-[160px] animate-pulse-slow"
              style={{ 
                top: '50%',
                right: '15%',
                animationDelay: '2s'
              }}
            ></div>

            <div 
              className="absolute w-[650px] h-[650px] bg-web3-gold/25 rounded-full blur-[140px] animate-pulse-slow"
              style={{ 
                bottom: '10%',
                left: '20%',
                animationDelay: '1.5s'
              }}
            ></div>

            <div 
              className="absolute w-[750px] h-[750px] bg-web3-purple/30 rounded-full blur-[155px] animate-pulse-slow"
              style={{ 
                bottom: '-10%',
                right: '25%',
                animationDelay: '0.5s'
              }}
            ></div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        <Header 
          user={user} 
          activeTab={activeTab} 
          setActiveTab={handleTabChange} 
          onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
          balance={balance}
          onOpenTopUp={handleOpenTopUp}
          onLogout={handleLogout}
          onDisconnectWallet={disconnectWallet}
          walletAddress={walletAddress}
          isConnected={isConnected}
          formatAddress={formatAddress}
          isAuthLoading={isAuthLoading}
          isAuthenticated={Boolean(lastAuthAddress)}
          isAdmin={isAdmin}
        />

        {/* Live Feed Sidebar - Left side, hidden on home */}
        {activeTab !== 'home' && <LiveFeed cases={cases} onSelectUser={handleSelectUser} />}

        <main className="flex-1 overflow-y-auto custom-scrollbar relative pt-20">
          <div className="relative min-h-full">
            {activeTab === 'home' && (
              <HomeView onCreateCase={handleCreateCase} />
            )}

            {activeTab === 'createcase' && (
              <div className="animate-fade-in">
                <CreateCaseView
                  onCreate={handleCaseCreated}
                  creatorName={user.username}
                  balance={balance}
                  onOpenTopUp={handleOpenTopUp}
                  onBalanceUpdate={setBalance}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={canUseActivities}
                  cases={cases}
                />
              </div>
            )}

            {activeTab === 'case' && (
              <div className="animate-fade-in">
                <CaseView
                  cases={cases}
                  onOpenCase={handleOpenCase}
                  balance={balance}
                  onOpenTopUp={handleOpenTopUp}
                  userName={user.username}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={canUseActivities}
                />
              </div>
            )}

            {activeTab === 'upgrade' && (
              <div className="animate-fade-in">
                <UpgradeView
                  inventory={activeInventory}
                  onUpgrade={handleUpgrade}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={canUseActivities}
                />
              </div>
            )}

            {activeTab === 'casebattle' && (
              <div className="animate-fade-in h-full">
                <BattleView 
                  cases={cases} 
                  userName={user.username}
                  userAvatar={user.avatar}
                  userAvatarMeta={user.avatarMeta}
                  onBattleFinish={handleBattleFinish}
                  balance={balance}
                  onChargeBattle={handleChargeBattle}
                  onOpenTopUp={handleOpenTopUp}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={canUseActivities}
                />
              </div>
            )}

            {activeTab === 'profile' && lastAuthAddress && (
              <div className="animate-fade-in">
                <ProfileView 
                  user={profileView?.user || user}
                  inventory={profileView?.inventory || inventory}
                  burntItems={profileView?.burntItems || burntItems}
                  claimedItems={profileView?.claimedItems || claimedItems}
                  battleHistory={profileView?.battleHistory || battleHistory}
                  balance={balance}
                  cases={cases}
                  isEditable={!profileView}
                  onSelectUser={handleSelectUser}
                  getUserAvatarByName={getUserAvatarByName}
                  onUpdateUsername={handleUpdateUsername}
                  onUploadAvatar={handleUploadAvatar}
                  onUpdateAvatarMeta={handleUpdateAvatarMeta}
                  onClaimToken={handleClaimToken}
                />
              </div>
            )}

            {activeTab === 'admin' && lastAuthAddress && isAdmin && (
              <div className="animate-fade-in">
                <AdminView currentUser={user} />
              </div>
            )}
          </div>

        </main>
      </div>

      <WalletConnectModal
        isOpen={isWalletConnectOpen}
        onClose={() => setIsWalletConnectOpen(false)}
        onConnect={handleWalletConnect}
        connectWallet={connectWallet}
        isConnecting={isWalletConnecting}
        error={walletError}
        isAuthLoading={isAuthLoading}
      />

      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={handleCloseTopUp}
        onBalanceUpdate={handleBalanceUpdate}
        isAuthenticated={Boolean(lastAuthAddress)}
        onConnectWallet={() => setIsWalletConnectOpen(true)}
        initialUsdtAmount={topUpInitialUsdt}
        walletAddress={user.walletAddress || walletAddress}
      />

      {createdCaseNotice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-modal-fade">
          <div className="bg-web3-card/80 border border-white/[0.12] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] px-8 py-6 text-center max-w-sm w-[90%] animate-modal-pop">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Success</div>
            <div className="text-2xl font-black bg-gradient-to-r from-web3-accent to-web3-success bg-clip-text text-transparent animate-gradient">
              Case created
            </div>
            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-2xl border border-white/[0.12] bg-black/40 flex items-center justify-center text-3xl">
                {createdCaseNotice.image ? (
                  createdCaseNotice.image.startsWith('http') || createdCaseNotice.image.startsWith('/') ? (
                    <ImageWithMeta
                      src={createdCaseNotice.image}
                      meta={createdCaseNotice.imageMeta}
                      className="w-12 h-12"
                      imgClassName="w-full h-full"
                    />
                  ) : (
                    <span>{createdCaseNotice.image}</span>
                  )
                ) : (
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>
                )}
              </div>
              <div className="text-sm font-bold text-center">
                {createdCaseNotice.name}
                <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-1">
                  ${createdCaseNotice.tokenTicker || createdCaseNotice.currency}
                </div>
              </div>
              <div className="px-3 py-1 rounded-full text-xs bg-web3-accent/10 border border-web3-accent/30">
                {createdCaseNotice.price} ₮ • RTU {createdCaseNotice.rtu}%
              </div>
              {createdCaseNotice.tokenAddress && (
                <div className="w-full mt-2 text-[10px] uppercase tracking-widest text-gray-400">
                  Token {createdCaseNotice.tokenAddress.slice(0, 6)}...{createdCaseNotice.tokenAddress.slice(-4)}
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText?.(createdCaseNotice.tokenAddress || '')}
                    className="ml-2 px-2 py-1 rounded-md border border-white/[0.12] text-gray-300 hover:text-white hover:border-web3-accent/40 transition"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setCreatedCaseNotice(null)}
              className="mt-5 px-5 py-2.5 rounded-xl bg-white/10 border border-white/[0.1] text-xs uppercase tracking-widest hover:text-white hover:border-white/40 transition"
            >
              Nice
            </button>
          </div>
        </div>
      )}

      {mustSetUsername && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[92%] max-w-md bg-black/60 border border-white/[0.12] rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="text-xs uppercase tracking-widest text-gray-500">Welcome</div>
            <div className="text-2xl font-black text-white mt-1">Create your username</div>
            <div className="text-[11px] uppercase tracking-widest text-gray-500 mt-2">
              Use A-Z, 0-9, _ or - (3-20 chars)
            </div>

            <div className="mt-5">
              <input
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(sanitizeUsername(e.target.value))}
                placeholder="USERNAME"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/[0.12] focus:outline-none focus:border-web3-accent/50 text-sm uppercase tracking-widest"
              />
              {usernameChecking && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500">Checking...</div>
              )}
              {usernameError && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-red-400">{usernameError}</div>
              )}
              {!usernameError && usernameAvailable && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-web3-success">Available</div>
              )}
            </div>

            <button
              onClick={handleSaveRequiredUsername}
              disabled={Boolean(usernameError) || !usernameDraft || usernameSaving || usernameChecking}
              className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-web3-accent to-web3-success text-black font-black uppercase tracking-widest text-xs disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {usernameSaving ? 'Saving...' : 'Save Username'}
            </button>
          </div>
        </div>
      )}

      {activeTab !== 'admin' && (
        <>
        {battleStartAlert && (
          <button
            onClick={() => {
              sessionStorage.setItem('casefun:focusBattleLobbyId', battleStartAlert.lobbyId);
              handleTabChange('casebattle');
              setBattleStartAlert(null);
            }}
            className="fixed right-24 bottom-6 z-[75] w-[390px] max-w-[calc(100vw-140px)] rounded-2xl border border-web3-accent/55 bg-black/90 backdrop-blur-md px-5 py-4 text-left shadow-[0_0_24px_rgba(102,252,241,0.30)] hover:border-web3-accent/80 transition"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse" />
              <div className="text-[11px] uppercase tracking-widest text-web3-accent">Battle started</div>
            </div>
            <div className="text-base font-black text-white">{battleStartAlert.hostName} vs {battleStartAlert.joinerName}</div>
            <div className="text-xs text-gray-300 mt-1">
              {battleStartAlert.rounds} rounds • {Number(battleStartAlert.totalCost || 0).toFixed(2)} ₮
            </div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-2">Tap to open live battle</div>
          </button>
        )}
        <FeedbackWidget
          isAuthenticated={Boolean(lastAuthAddress)}
          onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
        />
        </>
      )}

    </div>
  );
};

export default App;
