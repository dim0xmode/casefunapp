import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { CaseView } from './components/CaseView';
import { CreateCaseView } from './components/CreateCaseView';
import { UpgradeView } from './components/UpgradeView';
import { BattleView } from './components/BattleView';
import { ProfileView } from './components/ProfileView';
import { AdminView } from './components/AdminView';
import { LiveFeed } from './components/LiveFeed';
import { TelegramMiniAppSection } from './components/telegram/TelegramMiniAppSection';
import { ConnectModal } from './components/ConnectModal';
import { TopUpModal } from './components/TopUpModal';
import { FeedbackWidget } from './components/FeedbackWidget';
import { ImageWithMeta } from './components/ui/ImageWithMeta';
import { INITIAL_USER } from './constants';
import { User, Item, Case } from './types';
import { useWallet } from './hooks/useWallet';
import { useWakeLock } from './hooks/useWakeLock';
import { BrowserProvider, getAddress, hexlify, toUtf8Bytes } from 'ethers';
import { api, resolveAssetUrl } from './services/api';
import { getPendingDepositHashes, removePendingDepositHash } from './utils/pendingDeposits';
import { playCaseCreatedCelebration, playDullClick } from './utils/audio';
import type { TelegramWalletOption } from './utils/walletConnect';
import {
  TELEGRAM_PREFERRED_WALLET_STORAGE_KEY,
  getCanonicalTelegramMiniAppPath,
  getTopUpAmountFromLocation,
  getTopUpBridgeModeFromLocation,
  getWalletLinkBotFromLocation,
  getWalletLinkModeFromLocation,
  hasInjectedEthereumProvider,
  isTelegramMiniAppPath,
  isTelegramWalletOption,
  isTelegramWebViewContext,
  isWalletLinkBridgeMode,
  getRefCodeFromLocation,
  getRefCodeFromTelegramStartParam,
  saveRefCode,
  getStoredRefCode,
  clearRefCode,
} from './utils/telegramMiniApp';

interface BattleRecord {
  id: string;
  opponent: string;
  result: 'WIN' | 'LOSS';
  cost: number;
  wonValue: number;
  wonItems: Item[];
  timestamp?: number;
  caseCount?: number;
  roundCount?: number;
  mode?: 'BOT' | 'PVP' | string;
}

interface TelegramWalletConnectSession {
  provider: any;
  address: string;
  wallet: TelegramWalletOption;
  disconnect: () => Promise<void>;
}

const TAB_PATHS: Record<string, string> = {
  home: '/',
  createcase: '/create',
  case: '/cases',
  upgrade: '/upgrade',
  casebattle: '/battles',
  profile: '/profile',
  admin: '/admin',
  tg: '/tg',
};
const BACKGROUND_ANIMATION_STORAGE_KEY = 'casefun:bgAnimationEnabled';
const TELEGRAM_DEV_ID_STORAGE_KEY = 'casefun:tgDevIdentity';
const TELEGRAM_DEV_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_TG_DEV_LOGIN === '1';

const getTabFromPath = (pathname: string) => {
  if (isTelegramMiniAppPath(pathname)) {
    return 'tg';
  }
  const normalized = pathname.toLowerCase();
  const match = Object.entries(TAB_PATHS).find(([, path]) => path === normalized);
  return match?.[0] || 'home';
};

const App = () => {
  const [activeTab, setActiveTab] = useState(() =>
    getTabFromPath(getCanonicalTelegramMiniAppPath(window.location.pathname))
  );
  const [user, setUser] = useState<User>(INITIAL_USER);
  const [isWalletConnectOpen, setIsWalletConnectOpen] = useState(false);
  const [connectModalMode, setConnectModalMode] = useState<'login' | 'link'>('login');
  const [connectModalLockChain, setConnectModalLockChain] = useState<'evm' | 'ton' | undefined>(undefined);
  const [mergePrompt, setMergePrompt] = useState<{
    secondaryUserId: string;
    identifier: string;
    mergeToken: string;
    preview?: {
      balance: number;
      rewardPoints: number;
      inventoryCount: number;
      openingsCount: number;
      battlesCount: number;
      casesCreated: number;
      hasAvatar: boolean;
      username: string;
      avatarUrl?: string | null;
      identifiers: {
        telegram?: { id: string; username: string | null };
        evm?: string;
        ton?: string;
        twitter?: { id: string; username: string | null };
      };
    } | null;
  } | null>(null);
  const [mergeAvatarChoice, setMergeAvatarChoice] = useState<'primary' | 'secondary'>('primary');
  const [mergeUsernameChoice, setMergeUsernameChoice] = useState<'primary' | 'secondary'>('primary');
  const [isMerging, setIsMerging] = useState(false);
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
  const [pendingTwitterCode, setPendingTwitterCode] = useState<string | null>(null);
  const [pendingTwitterState, setPendingTwitterState] = useState<string | null>(null);
  const [twitterBusy, setTwitterBusy] = useState(false);
  const [twitterNotice, setTwitterNotice] = useState<string | null>(null);
  const [twitterError, setTwitterError] = useState<string | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramAuthBusy, setTelegramAuthBusy] = useState(false);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);
  const [telegramDevAuthBusy, setTelegramDevAuthBusy] = useState(false);
  const [telegramWalletLinking, setTelegramWalletLinking] = useState(false);
  const [telegramBridgeAutoTried, setTelegramBridgeAutoTried] = useState(false);
  const [telegramTopUpBridgeAutoTried, setTelegramTopUpBridgeAutoTried] = useState(false);
  const [telegramWalletLaunchLink, setTelegramWalletLaunchLink] = useState<{
    primaryUrl: string;
    fallbackUrl?: string;
  } | null>(null);
  const [telegramWalletConnectSession, setTelegramWalletConnectSession] = useState<TelegramWalletConnectSession | null>(null);
  const [isBackgroundAnimated, setIsBackgroundAnimated] = useState(() => {
    try {
      const saved = localStorage.getItem(BACKGROUND_ANIMATION_STORAGE_KEY);
      if (saved === null) return true;
      return saved !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const canonicalPath = getCanonicalTelegramMiniAppPath(window.location.pathname);
    if (canonicalPath !== window.location.pathname) {
      const nextUrl = `${canonicalPath}${window.location.search}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, []);

  useWakeLock();

  const {
    address: walletAddress,
    isConnected,
    connectWallet,
    connectWithProvider,
    disconnectWallet,
    formatAddress,
    isConnecting: isWalletConnecting,
    error: walletError,
    discoveredWallets,
  } = useWallet();
  const isAdmin = user.role === 'ADMIN';
  const isTelegramDevLoginAvailable = import.meta.env.DEV && TELEGRAM_DEV_LOGIN_ENABLED;

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
    setTelegramBusy(false);
    setTelegramError(null);
    setTelegramAuthBusy(false);
    setTelegramAuthError(null);
    setTelegramDevAuthBusy(false);
    setTelegramWalletLinking(false);
    setTelegramBridgeAutoTried(false);
    setTelegramTopUpBridgeAutoTried(false);
    setTelegramWalletLaunchLink(null);
    setTelegramWalletConnectSession(null);
    setActiveTab('home');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
    await disconnectTelegramWalletConnectSession().catch(() => {});
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
    tonTokenAddress: caseData.tonTokenAddress,
    chainType: caseData.chainType || 'EVM',
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
          response.data.battleHistory.map((battle: any) => {
            const wonItems = battle.wonItems || [];
            const wonLen = Array.isArray(wonItems) ? wonItems.length : 0;
            const fromDb = Number(battle.roundCount) || Number(battle.caseCount) || 0;
            const inferredFromDoubledItems =
              String(battle.result).toUpperCase() === 'WIN' && wonLen >= 2 ? Math.floor(wonLen / 2) : 0;
            const roundCount = fromDb > 0 ? fromDb : inferredFromDoubledItems;
            return {
              id: battle.id,
              opponent: battle.opponent || battle.opponentId || 'Bot',
              result: battle.result,
              cost: battle.cost,
              wonValue: battle.wonValue,
              wonItems,
              timestamp: battle.timestamp ? new Date(battle.timestamp).getTime() : Date.now(),
              caseCount: roundCount,
              roundCount,
              mode: battle.mode,
            };
          })
        );
      }
    } catch (error) {
      // not logged in
    }
  };

  const getTelegramWebAppInitData = () => {
    try {
      const webApp = (window as any)?.Telegram?.WebApp;
      if (!webApp) return '';
      if (typeof webApp.ready === 'function') {
        webApp.ready();
      }
      if (typeof webApp.expand === 'function') {
        webApp.expand();
      }
      const raw = webApp.initData;
      return typeof raw === 'string' ? raw.trim() : '';
    } catch {
      return '';
    }
  };

  const handleTelegramLogin = async () => {
    const initData = getTelegramWebAppInitData();
    if (!initData) {
      setTelegramAuthError('Open /tg from Telegram mini app and try again.');
      return;
    }
    setTelegramAuthBusy(true);
    setTelegramAuthError(null);
    try {
      const response = await api.loginWithTelegram(initData, getStoredRefCode());
      const nextUser = response.data?.user;
      if (!nextUser) {
        throw new Error('Telegram login failed.');
      }
      setUser((prev) => ({
        ...prev,
        ...nextUser,
        walletAddress: nextUser.walletAddress || prev.walletAddress,
      }));
      if (typeof nextUser.balance === 'number') {
        setBalance(nextUser.balance);
      }
      if (nextUser.walletAddress) {
        setLastAuthAddress(String(nextUser.walletAddress).toLowerCase());
      }
      await loadProfile(nextUser.walletAddress);
      clearRefCode();
      setTelegramError(null);
    } catch (error: any) {
      setTelegramAuthError(error?.message || 'Failed to authorize with Telegram.');
    } finally {
      setTelegramAuthBusy(false);
    }
  };

  const getOrCreateTelegramDevIdentity = () => {
    try {
      const existing = localStorage.getItem(TELEGRAM_DEV_ID_STORAGE_KEY);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed?.telegramId && parsed?.telegramUsername) {
          return {
            telegramId: String(parsed.telegramId),
            telegramUsername: String(parsed.telegramUsername),
          };
        }
      }
    } catch {
      // ignore storage issues
    }

    const seed = Math.random().toString(36).slice(2, 10);
    const identity = {
      telegramId: `dev_${seed}`,
      telegramUsername: `dev_${seed}`,
    };
    try {
      localStorage.setItem(TELEGRAM_DEV_ID_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // ignore storage issues
    }
    return identity;
  };

  const handleTelegramDevLogin = async () => {
    if (!isTelegramDevLoginAvailable) {
      setTelegramAuthError('Dev login is available only in local development.');
      return;
    }
    const identity = getOrCreateTelegramDevIdentity();
    setTelegramDevAuthBusy(true);
    setTelegramAuthError(null);
    try {
      const response = await api.loginWithTelegramDev({
        ...identity,
        referralCode: getStoredRefCode() || undefined,
      });
      const nextUser = response.data?.user;
      if (!nextUser) {
        throw new Error('Dev Telegram login failed.');
      }
      setUser((prev) => ({
        ...prev,
        ...nextUser,
        walletAddress: nextUser.walletAddress || prev.walletAddress,
      }));
      if (typeof nextUser.balance === 'number') {
        setBalance(nextUser.balance);
      }
      if (nextUser.walletAddress) {
        setLastAuthAddress(String(nextUser.walletAddress).toLowerCase());
      }
      await loadProfile(nextUser.walletAddress);
      clearRefCode();
      setTelegramError(null);
    } catch (error: any) {
      setTelegramAuthError(error?.message || 'Dev Telegram login failed.');
    } finally {
      setTelegramDevAuthBusy(false);
    }
  };

  const handleConnectTelegram = async () => {
    if (!lastAuthAddress) {
      setConnectModalMode('login');
      setIsWalletConnectOpen(true);
      return;
    }
    const initData = getTelegramWebAppInitData();
    let botLinkPopup: Window | null = null;
    let botLinkPopupNavigated = false;
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const response = initData
        ? await api.linkTelegram(initData)
        : await (async () => {
            // Open a blank tab synchronously on click to avoid popup blockers.
            botLinkPopup = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
            const start = await api.startTelegramBotLink();
            const url = String(start.data?.url || '').trim();
            const token = String(start.data?.token || '').trim();
            if (!url || !token) {
              if (botLinkPopup && !botLinkPopup.closed) {
                botLinkPopup.close();
              }
              throw new Error('Failed to start Telegram linking.');
            }

            if (botLinkPopup && !botLinkPopup.closed) {
              botLinkPopup.location.href = url;
              botLinkPopupNavigated = true;
            } else {
              // Fallback for strict browsers: open in current tab.
              window.location.href = url;
              throw new Error('Telegram link started. Return to casefun after pressing Start in bot.');
            }

            const timeoutMs = 90_000;
            const pollIntervalMs = 2_000;
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeoutMs) {
              await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
              const status = await api.getTelegramBotLinkStatus(token);
              const data = status.data as any;
              if (data?.linked && data?.user?.telegramId) {
                if (botLinkPopup && !botLinkPopup.closed) {
                  botLinkPopup.close();
                }
                return { status: 'success' as const, data: { user: data.user } };
              }
              if (data?.mergeRequired && data?.mergeToken && data?.conflictUserId) {
                if (botLinkPopup && !botLinkPopup.closed) {
                  botLinkPopup.close();
                }
                setMergePrompt({
                  secondaryUserId: data.conflictUserId,
                  mergeToken: data.mergeToken,
                  identifier: data.conflictUsername
                    ? `Telegram (${data.conflictUsername})`
                    : 'Telegram',
                  preview: data.preview ?? null,
                });
                setMergeAvatarChoice('primary');
                setMergeUsernameChoice('primary');
                return { status: 'success' as const, data: { user: data.user } };
              }
              if (data?.failed) {
                throw new Error(
                  data.reason ||
                    'Telegram link failed. Start a new link from profile and try again.'
                );
              }
            }

            throw new Error(
              'Telegram link is pending. Open the bot from the new tab, press Start, then click Connect Telegram again.'
            );
          })();
      if (!response.data?.user) {
        throw new Error('Failed to link Telegram account.');
      }
      setUser((prev) => ({ ...prev, ...response.data?.user }));
      setProfileView((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          user: { ...prev.user, ...response.data?.user },
        };
      });
      await loadProfile();
      setTelegramError(null);
    } catch (error: any) {
      // Prevent leaving an orphaned about:blank tab if link start fails early.
      const popup = botLinkPopup as Window | null;
      if (popup && !popup.closed && !botLinkPopupNavigated) {
        try {
          popup.close();
        } catch {
          // ignore popup close failures
        }
      }
      setTelegramError(error?.message || 'Failed to link Telegram account.');
    } finally {
      setTelegramBusy(false);
    }
  };

  const handleOpenTelegramMiniApp = async () => {
    if (!lastAuthAddress) {
      setConnectModalMode('login');
      setIsWalletConnectOpen(true);
      return;
    }
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const info = await api.getTelegramBotInfo();
      const url = String(info.data?.botUrl || '').trim();
      if (!url) {
        throw new Error('Telegram bot URL is unavailable.');
      }
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) {
        window.location.href = url;
      }
    } catch (error: any) {
      setTelegramError(error?.message || 'Failed to open Telegram Mini App.');
    } finally {
      setTelegramBusy(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const response = await api.unlinkTelegram();
      const unlinkUser = response.data?.user;
      if (unlinkUser) {
        setUser((prev) => ({ ...prev, ...unlinkUser }));
        setProfileView((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            user: { ...prev.user, ...unlinkUser },
          };
        });
      }
    } catch (error: any) {
      setTelegramError(error?.message || 'Failed to unlink Telegram account.');
    } finally {
      setTelegramBusy(false);
    }
  };

  const getPreferredTelegramWalletOption = (): TelegramWalletOption => {
    try {
      const raw = String(localStorage.getItem(TELEGRAM_PREFERRED_WALLET_STORAGE_KEY) || '')
        .trim()
        .toLowerCase();
      if (isTelegramWalletOption(raw)) {
        return raw;
      }
    } catch {
      // ignore storage errors
    }
    return 'metamask';
  };

  const setPreferredTelegramWalletOption = (wallet: TelegramWalletOption) => {
    try {
      localStorage.setItem(TELEGRAM_PREFERRED_WALLET_STORAGE_KEY, wallet);
    } catch {
      // ignore storage errors
    }
  };

  const getWalletConnectRuntimeConfig = () => {
    const projectId = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim();
    const rawChainId = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
    const chainId = Number.isFinite(rawChainId) && rawChainId > 0 ? Math.floor(rawChainId) : 11155111;
    const rpcUrl = String(import.meta.env.VITE_RPC_URL || '').trim();
    return {
      projectId,
      chainId,
      rpcUrl: rpcUrl || undefined,
    };
  };


  const disconnectTelegramWalletConnectSession = useCallback(async () => {
    const activeSession = telegramWalletConnectSession;
    setTelegramWalletConnectSession(null);
    setTelegramWalletLaunchLink(null);
    if (!activeSession) return;
    await activeSession.disconnect().catch(() => {});
  }, [telegramWalletConnectSession]);

  const resolveTelegramBotUsername = async () => {
    const fromQuery = getWalletLinkBotFromLocation();
    if (fromQuery) {
      return fromQuery;
    }
    let botUsername = 'casefun_bot';
    try {
      const info = await api.getTelegramBotInfo();
      const raw = String(info.data?.botUsername || '').trim().replace(/^@+/, '');
      if (raw) {
        botUsername = raw;
      }
    } catch {
      // fallback to known production bot username
    }
    return botUsername;
  };

  const openTelegramMiniAppDeepLink = (botUsername: string) => {
    const normalizedBot = String(botUsername || 'casefun_bot').trim().replace(/^@+/, '') || 'casefun_bot';
    const nativeUrl = `tg://resolve?domain=${normalizedBot}&startapp=linked`;
    const webUrl = `https://t.me/${normalizedBot}?startapp=linked`;
    try {
      window.location.assign(nativeUrl);
    } catch {
      // ignore and continue with https fallback
    }

    // Some wallet webviews ignore the first deep-link attempt.
    window.setTimeout(() => {
      try {
        window.location.assign(webUrl);
      } catch {
        // ignore fallback navigation errors
      }
    }, 260);

    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        try {
          window.location.assign(nativeUrl);
        } catch {
          // ignore retry navigation errors
        }
      }
    }, 1100);
    return { normalizedBot, webUrl };
  };

  const handleReturnToTelegramFromBridge = async (bridgeKind: 'wallet' | 'topup' = 'wallet') => {
    if (isTelegramWebViewContext()) {
      return;
    }
    const botUsername = await resolveTelegramBotUsername();
    const links = openTelegramMiniAppDeepLink(botUsername);
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        const fallbackPath =
          bridgeKind === 'topup'
            ? `/tg?topupMode=return&bot=${encodeURIComponent(links.normalizedBot)}`
            : `/tg?walletLinkMode=return&bot=${encodeURIComponent(links.normalizedBot)}`;
        window.location.replace(fallbackPath);
      }
    }, 1600);
  };

  const handleLinkWalletForTelegram = async (walletOption?: TelegramWalletOption) => {
    if (!lastAuthAddress) {
      setTelegramAuthError('Authorize with Telegram first.');
      return;
    }
    const resolvedWallet = walletOption || 'metamask';
    setPreferredTelegramWalletOption(resolvedWallet);
    setTelegramWalletLinking(true);
    setTelegramWalletLaunchLink(null);
    setTelegramAuthError(null);
    try {
      let linkedAddress = walletAddress || '';

      // In Telegram's WebView, some builds expose window.ethereum even though the real flow is
      // WalletConnect → MetaMask app. Using the injected path there often skips the server link step.
      const canUseInjectedWallet =
        hasInjectedEthereumProvider() &&
        Boolean(window.ethereum) &&
        (!isTelegramWebViewContext() || isWalletLinkBridgeMode());

      if (canUseInjectedWallet) {
        // Browser with injected wallet — use the old signature-based flow
        if (!linkedAddress) {
          linkedAddress = (await connectWallet()) || '';
        }
        if (!linkedAddress || !hasInjectedEthereumProvider() || !window.ethereum) {
          throw new Error('Connect an EVM wallet first and approve access.');
        }
        const signerProvider = new BrowserProvider(window.ethereum);
        const normalizedAddress = String(linkedAddress).toLowerCase();
        const nonceResponse = await api.getNonce(normalizedAddress);
        const message = nonceResponse.data?.message;
        if (!message) throw new Error('Failed to get nonce for wallet linking.');
        const signer = await signerProvider.getSigner();
        const signature = await signer.signMessage(message);
        const response = await api.linkWalletToCurrentAccount(normalizedAddress, signature, message);
        const nextUser = response.data?.user;
        if (!nextUser) throw new Error('Wallet link failed.');
        setUser((prev) => ({ ...prev, ...nextUser, walletAddress: nextUser.walletAddress || normalizedAddress || prev.walletAddress }));
        if (typeof nextUser.balance === 'number') setBalance(nextUser.balance);
        if (nextUser.walletAddress) setLastAuthAddress(String(nextUser.walletAddress).toLowerCase());
        await loadProfile(nextUser.walletAddress || normalizedAddress || undefined);
        setTelegramWalletLaunchLink(null);
        setTelegramAuthError(null);
        if (isWalletLinkBridgeMode()) { await handleReturnToTelegramFromBridge('wallet'); return; }
        return;
      }

      // Telegram Mini App — standard WalletConnect.
      // WC Modal handles wallet selection, deep linking, and session management.
      const { connectWallet: wcConnect, wcPersonalSign } = await import('./utils/walletConnect');
      const config = getWalletConnectRuntimeConfig();

      const session = await wcConnect({
        projectId: config.projectId,
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        onStatus: (msg) => setTelegramAuthError(msg),
      });

      const normalizedAddress = session.address.toLowerCase();
      setTelegramWalletConnectSession({
        provider: session.provider,
        address: normalizedAddress,
        wallet: resolvedWallet,
        disconnect: session.disconnect,
      });

      const nonceResponse = await api.getNonce(normalizedAddress);
      const message = nonceResponse.data?.message;
      if (!message) throw new Error('Failed to get nonce for wallet linking.');
      const msgHex = hexlify(toUtf8Bytes(message));
      const addressParam = getAddress(normalizedAddress);

      setTelegramAuthError('Approve the signature in your wallet to finish linking.');
      const signature = await wcPersonalSign(session.provider, msgHex, addressParam);

      const response = await api.linkWalletFromTelegram(normalizedAddress, signature, message);
      const nextUser = response.data?.user;
      if (!nextUser) throw new Error('Wallet link failed.');

      setUser((prev) => ({ ...prev, ...nextUser, walletAddress: nextUser.walletAddress || normalizedAddress || prev.walletAddress }));
      if (typeof nextUser.balance === 'number') setBalance(nextUser.balance);
      if (nextUser.walletAddress) setLastAuthAddress(String(nextUser.walletAddress).toLowerCase());
      await loadProfile(nextUser.walletAddress || normalizedAddress || undefined);
      setTelegramWalletLaunchLink(null);
      setTelegramAuthError(null);
    } catch (error: any) {
      const rawMessage = String(error?.message || '').trim();
      setTelegramAuthError(rawMessage || 'Failed to link wallet.');
    } finally {
      setTelegramWalletLinking(false);
    }
  };

  useEffect(() => {
    if (telegramBridgeAutoTried) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('walletLinkMode') !== 'bridge') return;
    if (!lastAuthAddress) return;
    if (user.hasLinkedWallet) return;
    if (!hasInjectedEthereumProvider()) {
      setTelegramAuthError('Open this link inside wallet app browser to continue linking.');
      setTelegramBridgeAutoTried(true);
      return;
    }
    setTelegramBridgeAutoTried(true);
    void handleLinkWalletForTelegram('metamask');
  }, [telegramBridgeAutoTried, lastAuthAddress, user.hasLinkedWallet]);

  useEffect(() => {
    if (telegramTopUpBridgeAutoTried) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('topupMode') !== 'bridge') return;
    if (!lastAuthAddress) return;
    if (!hasInjectedEthereumProvider()) {
      setTelegramAuthError('Open this link inside wallet app browser to continue top up.');
      setTelegramTopUpBridgeAutoTried(true);
      return;
    }
    const amountUsdt = getTopUpAmountFromLocation();
    if (amountUsdt > 0) {
      setTopUpInitialUsdt(amountUsdt);
    }
    setTelegramAuthError(null);
    setTelegramTopUpBridgeAutoTried(true);
    setIsTopUpOpen(true);
  }, [telegramTopUpBridgeAutoTried, lastAuthAddress]);

  const handleOpenTelegramFromBridgeHelper = async () => {
    try {
      setTelegramAuthError(null);
      const botUsername = await resolveTelegramBotUsername();
      openTelegramMiniAppDeepLink(botUsername);
    } catch (error: any) {
      setTelegramAuthError(error?.message || 'Failed to open Telegram Mini App.');
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (activeTab !== 'tg') return;
      if (isTelegramWebViewContext() && (!lastAuthAddress || !user.hasLinkedWallet)) {
        const initData = getTelegramWebAppInitData();
        if (initData) {
          void handleTelegramLogin();
          return;
        }
      }
      if (!lastAuthAddress && !user.id) return;
      void loadProfile().catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeTab, lastAuthAddress, user.hasLinkedWallet, user.id]);

  const handleClaimToken = async (caseId: string) => {
    const response = await api.claimToken(caseId);
    if (!response.data) {
      throw new Error('Claim failed');
    }
    await loadProfile();
  };

  const loginWithWalletAddress = async (address: string, externalProvider?: any) => {
    if (!address) return false;
    const signingProvider = externalProvider || (window as any).ethereum;
    if (!signingProvider) return false;
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

      let signature: string;
      if (externalProvider && typeof externalProvider.request === 'function') {
        const msgHex = hexlify(toUtf8Bytes(message));
        const addressParam = getAddress(address);
        const { isWalletConnectProvider, wcPersonalSign } = await import('./utils/walletConnect');
        if (isWalletConnectProvider(externalProvider)) {
          signature = await wcPersonalSign(externalProvider, msgHex, addressParam);
        } else {
          const sig = await externalProvider.request({
            method: 'personal_sign',
            params: [msgHex, addressParam],
          });
          signature = String(sig);
        }
      } else {
        const provider = new BrowserProvider(signingProvider);
        const signer = await provider.getSigner();
        signature = await signer.signMessage(message);
      }

      const loginResponse = await api.loginWithWallet(
        address,
        signature,
        message,
        getStoredRefCode()
      );
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
      clearRefCode();
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

  const handleWalletConnect = async (result: { address: string; provider?: any; disconnect?: () => Promise<void> }) => {
    return loginWithWalletAddress(result.address, result.provider);
  };

  const handleTelegramWidgetLogin = async (tgUser: Record<string, any>) => {
    try {
      setIsAuthLoading(true);
      let nextUser = tgUser;

      if (tgUser.id && tgUser.hash) {
        const response = await api.loginWithTelegramWidget(tgUser, getStoredRefCode());
        nextUser = response.data?.user;
      }

      if (nextUser) {
        setUser((prev) => ({ ...prev, ...nextUser }));
        if (typeof nextUser.balance === 'number') setBalance(nextUser.balance);
        const addr = nextUser.walletAddress || '';
        if (addr && !addr.startsWith('tg_') && !addr.startsWith('ton_')) {
          setLastAuthAddress(addr.toLowerCase());
        } else {
          setLastAuthAddress(nextUser.id);
        }
        clearRefCode();
        await loadProfile();
      }
    } catch (error) {
      console.error('Telegram login failed', error);
      throw error;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleTonLogin = async (tonAddress: string, proof: any) => {
    try {
      setIsAuthLoading(true);
      const response = await api.loginWithTon(tonAddress, proof, getStoredRefCode());
      const nextUser = response.data?.user;
      if (nextUser) {
        setUser((prev) => ({ ...prev, ...nextUser }));
        if (typeof nextUser.balance === 'number') setBalance(nextUser.balance);
        setLastAuthAddress(nextUser.id);
        clearRefCode();
        await loadProfile();
      }
    } catch (error) {
      console.error('TON login failed', error);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLinkTonWallet = async () => {
    try {
      const { connectTonWallet } = await import('./utils/tonConnect');
      const wallet = await connectTonWallet();
      const response = await api.linkTonWallet(wallet.address, wallet.proof);
      const data = response.data as any;

      if (data?.conflict) {
        setMergePrompt({
          secondaryUserId: data.conflictUserId,
          mergeToken: data.mergeToken,
          identifier: `TON ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
          preview: data.preview ?? null,
        });
        setMergeAvatarChoice('primary');
        setMergeUsernameChoice('primary');
        return;
      }

      if (data?.user) {
        setUser((prev) => ({ ...prev, ...data.user }));
      }
      await loadProfile();
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('dismissed')) return;
      console.error('Link TON wallet failed', err);
    }
  };

  const handleLinkEvmWallet = () => {
    setConnectModalMode('link');
    setConnectModalLockChain('evm');
    setIsWalletConnectOpen(true);
  };

  const handleLinkEvmWalletResult = async (result: { address: string; provider?: any; disconnect?: () => Promise<void> }): Promise<boolean> => {
    const address = result.address;
    const signingProvider = result.provider || (window as any).ethereum;
    if (!address || !signingProvider) return false;
    try {
      setIsAuthLoading(true);
      const nonceResponse = await api.getNonce(address);
      const message = nonceResponse.data?.message;
      if (!message) return false;

      let signature: string;
      if (signingProvider && typeof signingProvider.request === 'function') {
        const msgHex = hexlify(toUtf8Bytes(message));
        const addressParam = getAddress(address);
        const { isWalletConnectProvider, wcPersonalSign } = await import('./utils/walletConnect');
        if (isWalletConnectProvider(signingProvider)) {
          signature = await wcPersonalSign(signingProvider, msgHex, addressParam);
        } else {
          const sig = await signingProvider.request({
            method: 'personal_sign',
            params: [msgHex, addressParam],
          });
          signature = String(sig);
        }
      } else {
        const provider = new BrowserProvider(signingProvider);
        const signer = await provider.getSigner();
        signature = await signer.signMessage(message);
      }

      const linkResponse = await api.linkWalletToCurrentAccount(address, signature, message);
      const linkedUser = (linkResponse.data as any)?.user;
      if (linkedUser) {
        setUser((prev) => ({ ...prev, ...linkedUser }));
        if (typeof linkedUser.balance === 'number') setBalance(linkedUser.balance);
      }
      await loadProfile();
      return true;
    } catch (err: any) {
      console.error('Link EVM wallet failed', err);
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergePrompt) return;
    setIsMerging(true);
    try {
      const response = await api.confirmMerge(
        mergePrompt.secondaryUserId,
        mergePrompt.mergeToken,
        {
          preferAvatarFrom: mergeAvatarChoice,
          preferUsernameFrom: mergeUsernameChoice,
        }
      );
      const data = response.data as any;
      if (data?.user) {
        setUser((prev) => ({ ...prev, ...data.user }));
        if (typeof data.user.balance === 'number') setBalance(data.user.balance);
      }
      setMergePrompt(null);
      await loadProfile();
    } catch (err) {
      console.error('Merge failed', err);
    } finally {
      setIsMerging(false);
    }
  };

  useEffect(() => {
    if (!walletAddress) {
      return;
    }
    if (user.hasLinkedWallet === false) {
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
  }, [walletAddress, lastAuthAddress, user.hasLinkedWallet]);

  useEffect(() => {
    const refCode = getRefCodeFromLocation();
    if (refCode) {
      saveRefCode(refCode);
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', next);
      return;
    }
    const tgRef = getRefCodeFromTelegramStartParam();
    if (tgRef) {
      saveRefCode(tgRef);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'tg' && isTelegramWebViewContext()) {
      const initData = getTelegramWebAppInitData();
      if (initData) {
        void handleTelegramLogin();
        return;
      }
    }
    loadProfile();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BACKGROUND_ANIMATION_STORAGE_KEY, isBackgroundAnimated ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [isBackgroundAnimated]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (!code && !error) return;

    const hasWalletProvider = typeof (window as any).ethereum !== 'undefined';
    const hasTgWebApp = !!(window as any)?.Telegram?.WebApp?.initData;
    const canAuthenticate = hasWalletProvider || hasTgWebApp;

    if (code && state && !canAuthenticate) {
      const backendCallbackUrl = `${import.meta.env.VITE_API_URL || '/api'}/auth/twitter/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
      window.location.href = backendCallbackUrl;
      return;
    }

    window.history.replaceState({}, '', window.location.pathname);
    setActiveTab('profile');

    if (error) {
      const reason = errorDescription || error;
      setTwitterError(`Twitter link failed: ${reason}`);
      return;
    }

    if (!code || !state) {
      setTwitterError('Twitter callback data is incomplete.');
      return;
    }

    setPendingTwitterCode(code);
    setPendingTwitterState(state);
  }, []);

  useEffect(() => {
    if (!pendingTwitterCode || !pendingTwitterState) return;
    if (!lastAuthAddress || !user.id) return;

    let cancelled = false;
    const linkTwitter = async () => {
      setTwitterBusy(true);
      setTwitterError(null);
      try {
        const response = await api.linkTwitter(pendingTwitterCode, pendingTwitterState);
        if (cancelled) return;
        const twitterUser = response.data?.user;
        if (!twitterUser) {
          throw new Error('Failed to link Twitter account.');
        }
        setUser(prev => ({ ...prev, ...twitterUser }));
        setProfileView(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            user: { ...prev.user, ...twitterUser },
          };
        });
        const linkedUsername = twitterUser.twitterUsername
          ? `@${twitterUser.twitterUsername}`
          : 'Twitter';
        setTwitterNotice(`${linkedUsername} connected successfully.`);
      } catch (error: any) {
        if (!cancelled) {
          setTwitterError(error?.message || 'Failed to link Twitter account.');
        }
      } finally {
        if (!cancelled) {
          setTwitterBusy(false);
          setPendingTwitterCode(null);
          setPendingTwitterState(null);
        }
      }
    };

    linkTwitter();
    return () => {
      cancelled = true;
    };
  }, [pendingTwitterCode, pendingTwitterState, lastAuthAddress, user.id]);

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
              void loadProfile(targetWallet).catch(() => {});
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
    if (!lastAuthAddress || !true || !user.id) {
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
        const activeBattleLobbyId = sessionStorage.getItem('casefun:activeBattleLobbyId');
        const seen = new Set(readSeen());
        const fresh = lobbies.find((lobby: any) => {
          if (lobby?.status !== 'IN_PROGRESS' || !lobby?.startedAt) return false;
          const isCreator = lobby.hostUserId === user.id;
          if (!isCreator) return false;
          if (activeTab === 'casebattle') return false;
          if (activeBattleLobbyId && String(activeBattleLobbyId) === String(lobby.id)) return false;
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
  }, [lastAuthAddress, true, user.id, activeTab]);

  useEffect(() => {
    if (!battleStartAlert) return;
    const timer = window.setTimeout(() => setBattleStartAlert(null), 5000);
    return () => window.clearTimeout(timer);
  }, [battleStartAlert]);

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
    if (user.hasLinkedWallet === false) return;
    if (normalized === lastAuthAddress) return;
    handleLogout();
  }, [walletAddress, isConnected, lastAuthAddress, user.hasLinkedWallet]);

  useEffect(() => {
    const loadCases = async () => {
      try {
        const response = await api.getCases();
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
    const isPlaceholder = Boolean(
      !currentName ||
      currentName === 'USER' ||
      currentName.startsWith('USER_') ||
      (wallet && currentName.toLowerCase() === wallet)
    );
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
    if (requiresAuth && !lastAuthAddress && !user.id) {
      setConnectModalMode('login');
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
    if (activeTab === 'tg' && isTelegramWebViewContext() && !hasInjectedEthereumProvider()) {
      setTelegramAuthError(null);
      if (telegramWalletConnectSession?.provider) {
        const linkedWallet = String(user.walletAddress || '').toLowerCase();
        if (
          user.hasLinkedWallet &&
          linkedWallet.startsWith('0x') &&
          telegramWalletConnectSession.address &&
          telegramWalletConnectSession.address !== linkedWallet
        ) {
          void disconnectTelegramWalletConnectSession();
          setTelegramAuthError('Connected wallet does not match linked wallet. Reconnect with your linked wallet.');
          return;
        }
        setTopUpInitialUsdt(safePrefill);
        setIsTopUpOpen(true);
        return;
      }
      void (async () => {
        try {
          const { connectWallet: wcConnect } = await import('./utils/walletConnect');
          const config = getWalletConnectRuntimeConfig();

          const session = await wcConnect({
            projectId: config.projectId,
            chainId: config.chainId,
            rpcUrl: config.rpcUrl,
            onStatus: (msg) => setTelegramAuthError(msg),
          });

          setTelegramWalletConnectSession({
            provider: session.provider,
            address: session.address.toLowerCase(),
            wallet: getPreferredTelegramWalletOption(),
            disconnect: session.disconnect,
          });
          setTelegramAuthError(null);
          setTopUpInitialUsdt(safePrefill);
          setIsTopUpOpen(true);
        } catch (error: any) {
          const rawMessage = String(error?.message || '').trim();
          setTelegramAuthError(rawMessage || 'Top up failed. Tap again.');
        }
      })();
      return;
    }
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
    options?: {
      reserveItems?: Item[];
      mode?: 'BOT' | 'PVP';
      lobbyId?: string | null;
      opponentName?: string;
      caseIds?: string[];
      battleProof?: string | null;
    }
  ) => {
    const isWin = wonItems.length > 0;
    const wonValue = wonItems.reduce((sum, item) => sum + item.value, 0);
    
    const roundCount =
      Array.isArray(options?.caseIds) && options.caseIds.length > 0
        ? options.caseIds.length
        : isWin && wonItems.length >= 2
          ? Math.floor(wonItems.length / 2)
          : 1;
    const battleRecord: BattleRecord = {
      id: `battle-${Date.now()}`,
      opponent: options?.opponentName || 'Bot',
      result: isWin ? 'WIN' : 'LOSS',
      cost: totalCost,
      wonValue: wonValue,
      wonItems: wonItems,
      caseCount: roundCount,
      roundCount,
      mode: options?.mode,
    };
    
    setBattleHistory(prev => [battleRecord, ...prev]);

    try {
      if (!options?.battleProof) {
        throw new Error('Battle proof missing');
      }
      const response = await api.recordBattle(isWin ? 'WIN' : 'LOSS', totalCost, wonItems, {
        reserveItems: options?.reserveItems || [],
        mode: options?.mode || 'PVP',
        lobbyId: options?.lobbyId || undefined,
        opponentName: options?.opponentName || undefined,
        battleProof: options.battleProof,
        caseIds: options?.caseIds || [],
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
    const metaUser = response.data?.user;
    if (metaUser) {
      setUser(prev => ({ ...prev, ...metaUser }));
      if (profileView) {
        setProfileView({
          ...profileView,
          user: { ...profileView.user, ...metaUser },
        });
      }
    }
  };

  const handleConnectTwitter = async () => {
    setTwitterNotice(null);
    setTwitterError(null);
    setTwitterBusy(true);
    try {
      const response = await api.getTwitterConnectUrl();
      const url = response.data?.url;
      if (!url) {
        throw new Error('Failed to start Twitter linking.');
      }

      const tg = (window as any)?.Telegram?.WebApp;
      if (activeTab === 'tg' && tg) {
        if (typeof tg.openLink === 'function') {
          tg.openLink(url);
        } else {
          window.open(url, '_blank');
        }
        setTwitterNotice('Complete Twitter auth in the browser, then return here.');
        const pollLinked = async () => {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
              const profile = await api.getProfile();
              const pollUser = profile.data?.user;
              if (pollUser?.twitterUsername) {
                setUser(prev => ({ ...prev, ...pollUser }));
                setTwitterNotice(null);
                setTwitterBusy(false);
                return;
              }
            } catch { /* retry */ }
          }
          setTwitterNotice(null);
          setTwitterBusy(false);
        };
        void pollLinked();
      } else {
        window.location.href = url;
      }
    } catch (error: any) {
      setTwitterError(error?.message || 'Failed to start Twitter linking.');
      setTwitterBusy(false);
    }
  };

  const handleDisconnectTwitter = async () => {
    setTwitterBusy(true);
    setTwitterNotice(null);
    setTwitterError(null);
    try {
      const response = await api.unlinkTwitter();
      const disconnectedUser = response.data?.user;
      if (disconnectedUser) {
        setUser(prev => ({ ...prev, ...disconnectedUser }));
        setProfileView(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            user: { ...prev.user, ...disconnectedUser },
          };
        });
      }
      setTwitterNotice('Twitter account disconnected.');
    } catch (error: any) {
      setTwitterError(error?.message || 'Failed to disconnect Twitter account.');
    } finally {
      setTwitterBusy(false);
    }
  };

  const handleChargeBattle = async (caseIds: string[], battleProof?: string | null) => {
    const response = await api.chargeBattle(caseIds, battleProof || undefined);
    if (response.data?.balance !== undefined) {
      setBalance(response.data.balance);
    }
    return true;
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
  const backgroundPulseClass = isBackgroundAnimated ? 'animate-pulse-slow' : '';

  const walletLinkMode = getWalletLinkModeFromLocation();
  const topUpBridgeMode = getTopUpBridgeModeFromLocation();
  const walletLinkBot = getWalletLinkBotFromLocation();
  const isExternalBridgeContext = activeTab === 'tg' && !isTelegramWebViewContext();
  const isWalletBridgeLinked = walletLinkMode === 'bridge' && Boolean(user.hasLinkedWallet);
  const showTelegramWalletBridgeRunner =
    isExternalBridgeContext && walletLinkMode === 'bridge' && !isWalletBridgeLinked;
  const showTelegramTopUpBridgeRunner = isExternalBridgeContext && topUpBridgeMode === 'bridge';
  const showTelegramBridgeReturnHelper =
    isExternalBridgeContext &&
    (walletLinkMode === 'return' ||
      walletLinkMode === 'done' ||
      isWalletBridgeLinked ||
      topUpBridgeMode === 'return' ||
      topUpBridgeMode === 'done');

  return (
    <div className="flex flex-col h-screen bg-[#0B0C10] text-white overflow-hidden font-sans relative">
      {/* Global Parallax Background - Fixed positioning */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div 
              className={`absolute w-[600px] h-[600px] bg-web3-accent/30 rounded-full blur-[140px] ${backgroundPulseClass}`}
              style={{ 
                top: '-100px',
                right: '10%',
                animationDelay: '0s'
              }}
            ></div>
            
            <div 
              className={`absolute w-[700px] h-[700px] bg-web3-purple/25 rounded-full blur-[150px] ${backgroundPulseClass}`}
              style={{ 
                top: '20%',
                left: '5%',
                animationDelay: '1s'
              }}
            ></div>

            <div 
              className={`absolute w-[800px] h-[800px] bg-web3-success/20 rounded-full blur-[160px] ${backgroundPulseClass}`}
              style={{ 
                top: '50%',
                right: '15%',
                animationDelay: '2s'
              }}
            ></div>

            <div 
              className={`absolute w-[650px] h-[650px] bg-web3-gold/25 rounded-full blur-[140px] ${backgroundPulseClass}`}
              style={{ 
                bottom: '10%',
                left: '20%',
                animationDelay: '1.5s'
              }}
            ></div>

            <div 
              className={`absolute w-[750px] h-[750px] bg-web3-purple/30 rounded-full blur-[155px] ${backgroundPulseClass}`}
              style={{ 
                bottom: '-10%',
                right: '25%',
                animationDelay: '0.5s'
              }}
            ></div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {activeTab !== 'tg' && (
        <Header 
          user={user} 
          activeTab={activeTab} 
          setActiveTab={handleTabChange} 
          onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
            balance={balance}
            onOpenTopUp={handleOpenTopUp}
            onLogout={handleLogout}
            onDisconnectWallet={disconnectWallet}
            walletAddress={walletAddress}
            isConnected={isConnected}
            formatAddress={formatAddress}
            isAuthLoading={isAuthLoading}
            isAuthenticated={Boolean(lastAuthAddress || user.id)}
            isAdmin={isAdmin}
          />
        )}

        {/* Live Feed Sidebar - Left side, hidden on home */}
        {activeTab !== 'home' && activeTab !== 'tg' && <LiveFeed cases={cases} onSelectUser={handleSelectUser} />}

        <main className={`flex-1 overflow-y-auto custom-scrollbar relative ${activeTab === 'tg' ? 'pt-0' : 'pt-20'}`}>
          <div className="relative min-h-full">
            {activeTab === 'home' && (
              <HomeView
                onCreateCase={handleCreateCase}
                isAuthenticated={Boolean(lastAuthAddress || user.id)}
                onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
              />
            )}

            {activeTab === 'tg' && (
              <TelegramMiniAppSection
                showTelegramBridgeReturnHelper={showTelegramBridgeReturnHelper}
                showTelegramWalletBridgeRunner={showTelegramWalletBridgeRunner}
                showTelegramTopUpBridgeRunner={showTelegramTopUpBridgeRunner}
                walletLinkBot={walletLinkBot}
                telegramAuthError={telegramAuthError}
                onOpenTelegramFromBridgeHelper={handleOpenTelegramFromBridgeHelper}
                miniAppViewProps={{
                  user,
                  isAuthenticated: Boolean(lastAuthAddress),
                  isAuthenticating: telegramAuthBusy,
                  isDevAuthenticating: telegramDevAuthBusy,
                  showDevLogin: isTelegramDevLoginAvailable,
                  authError: telegramAuthError,
                  isLinkingWallet: telegramWalletLinking,
                  cases,
                  inventory,
                  burntItems,
                  claimedItems,
                  battleHistory,
                  balance,
                  onOpenCase: handleOpenCase,
                  onUpgrade: handleUpgrade,
                  onBattleFinish: handleBattleFinish,
                  onChargeBattle: handleChargeBattle,
                  onOpenTopUp: handleOpenTopUp,
                  onBalanceUpdate: setBalance,
                  onOpenWalletConnect: () => { setConnectModalMode('login'); setIsWalletConnectOpen(true); },
                  onClaimToken: handleClaimToken,
                  onSelectUser: handleSelectUser,
                  getUserAvatarByName,
                  onUpdateUsername: handleUpdateUsername,
                  onUploadAvatar: handleUploadAvatar,
                  onUpdateAvatarMeta: handleUpdateAvatarMeta,
                  onConnectTwitter: handleConnectTwitter,
                  onDisconnectTwitter: handleDisconnectTwitter,
                  twitterBusy,
                  twitterNotice,
                  twitterError,
                  onConnectTelegram: handleConnectTelegram,
                  onDisconnectTelegram: handleDisconnectTelegram,
                  onOpenTelegramMiniApp: handleOpenTelegramMiniApp,
                  telegramBusy,
                  telegramError,
                  isBackgroundAnimated,
                  onToggleBackgroundAnimation: () => setIsBackgroundAnimated((prev) => !prev),
                  onAuthenticate: handleTelegramLogin,
                  onDevAuthenticate: handleTelegramDevLogin,
                  onOpenTelegramBot: handleOpenTelegramMiniApp,
                  onLinkWallet: handleLinkWalletForTelegram,
                  walletDeepLink: telegramWalletLaunchLink?.primaryUrl || null,
                  onOpenHome: () => handleTabChange('home'),
                  onCreateCase: (newCase: Case) => {
                    setCases(prev => [newCase, ...prev]);
                  },
                  onLinkEvmWallet: handleLinkEvmWallet,
                  onLinkTonWallet: handleLinkTonWallet,
                  externalProvider: telegramWalletConnectSession?.provider || null,
                  onConnectWalletForTopUp: async () => {
                    const { connectWallet: wcConnect } = await import('./utils/walletConnect');
                    const cfg = getWalletConnectRuntimeConfig();
                    const session = await wcConnect({
                      projectId: cfg.projectId,
                      chainId: cfg.chainId,
                      rpcUrl: cfg.rpcUrl,
                      onStatus: (msg) => setTelegramAuthError(msg),
                    });
                    setTelegramWalletConnectSession({
                      provider: session.provider,
                      address: session.address.toLowerCase(),
                      wallet: getPreferredTelegramWalletOption(),
                      disconnect: session.disconnect,
                    });
                    setTelegramAuthError(null);
                    return session.provider;
                  },
                }}
              />
            )}

            {activeTab === 'createcase' && (
              <div className="animate-fade-in">
                <CreateCaseView
                  onCreate={handleCaseCreated}
                  creatorName={user.username}
                  balance={balance}
                  onOpenTopUp={handleOpenTopUp}
                  onBalanceUpdate={setBalance}
                  isAuthenticated={Boolean(lastAuthAddress || user.id)}
                  onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
                  isAdmin={true}
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
                  isAuthenticated={Boolean(lastAuthAddress || user.id)}
                  onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
                  isAdmin={true}
                />
              </div>
            )}

            {activeTab === 'upgrade' && (
              <div className="animate-fade-in">
                <UpgradeView
                  inventory={activeInventory}
                  onUpgrade={handleUpgrade}
                  isAuthenticated={Boolean(lastAuthAddress || user.id)}
                  onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
                  isAdmin={true}
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
                  isAuthenticated={Boolean(lastAuthAddress || user.id)}
                  onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
                  isAdmin={true}
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
                  balance={profileView?.user?.balance ?? balance}
                  cases={cases}
                  isEditable={!profileView}
                  onSelectUser={handleSelectUser}
                  getUserAvatarByName={getUserAvatarByName}
                  onUpdateUsername={handleUpdateUsername}
                  onUploadAvatar={handleUploadAvatar}
                  onUpdateAvatarMeta={handleUpdateAvatarMeta}
                  onClaimToken={handleClaimToken}
                  onConnectTwitter={handleConnectTwitter}
                  onDisconnectTwitter={handleDisconnectTwitter}
                  twitterBusy={twitterBusy}
                  twitterNotice={twitterNotice}
                  twitterError={twitterError}
                  onConnectTelegram={handleConnectTelegram}
                  onDisconnectTelegram={handleDisconnectTelegram}
                  onOpenTelegramMiniApp={handleOpenTelegramMiniApp}
                  telegramBusy={telegramBusy}
                  telegramError={telegramError}
                  isBackgroundAnimated={isBackgroundAnimated}
                  onToggleBackgroundAnimation={() => setIsBackgroundAnimated((prev) => !prev)}
                  onBalanceUpdate={setBalance}
                  onLinkEvmWallet={handleLinkEvmWallet}
                  onLinkTonWallet={handleLinkTonWallet}
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

      <ConnectModal
        isOpen={isWalletConnectOpen}
        onClose={() => { setIsWalletConnectOpen(false); setConnectModalMode('login'); setConnectModalLockChain(undefined); }}
        mode={connectModalMode}
        lockChain={connectModalLockChain}
        onConnectEvm={handleWalletConnect}
        onLinkEvm={handleLinkEvmWalletResult}
        onLoginTelegramWidget={handleTelegramWidgetLogin}
        onLoginTon={handleTonLogin}
        onLinkTon={handleLinkTonWallet}
        connectWithProvider={connectWithProvider}
        isConnecting={isWalletConnecting}
        error={walletError}
        isAuthLoading={isAuthLoading}
        discoveredWallets={discoveredWallets}
        walletConnectConfig={getWalletConnectRuntimeConfig()}
        telegramBotUsername={import.meta.env.VITE_TELEGRAM_BOT_USERNAME || ''}
        referralCode={getStoredRefCode()}
      />

      {mergePrompt && (() => {
        const preview = mergePrompt.preview;
        const primaryHasAvatar = !!user?.avatar;
        const secondaryHasAvatar = !!preview?.avatarUrl;
        const showAvatarChooser = primaryHasAvatar && secondaryHasAvatar;
        const eitherHasTelegram = !!user?.telegramId || !!preview?.identifiers.telegram;
        const showUsernameChooser = !eitherHasTelegram && !!preview?.username && preview.username !== user?.username;
        const fmt = (n: number) => Number(n || 0).toFixed(2);
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={() => setMergePrompt(null)}>
            <div className="bg-web3-card border border-gray-700 rounded-2xl p-6 max-w-md w-full relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-black mb-2 text-amber-400">Merge accounts?</h2>
              <p className="text-gray-300 text-sm mb-4">
                <span className="font-mono text-white">{mergePrompt.identifier}</span> is already linked to another casefun profile.
                Merging will combine everything into your current account.
              </p>

              {preview && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 mb-4 text-xs">
                  <div className="text-gray-400 mb-2 font-semibold uppercase tracking-wider">Will be added to your account</div>
                  <div className="grid grid-cols-2 gap-y-1 text-gray-200">
                    <span className="text-gray-400">Balance</span>
                    <span className="text-right font-mono text-white">+{fmt(preview.balance)} ₮</span>
                    <span className="text-gray-400">Reward points</span>
                    <span className="text-right font-mono text-white">+{preview.rewardPoints}</span>
                    <span className="text-gray-400">Inventory items</span>
                    <span className="text-right font-mono text-white">+{preview.inventoryCount}</span>
                    <span className="text-gray-400">Cases opened</span>
                    <span className="text-right font-mono text-white">+{preview.openingsCount}</span>
                    <span className="text-gray-400">Battles</span>
                    <span className="text-right font-mono text-white">+{preview.battlesCount}</span>
                    <span className="text-gray-400">Cases created</span>
                    <span className="text-right font-mono text-white">+{preview.casesCreated}</span>
                  </div>
                  {(preview.identifiers.evm || preview.identifiers.ton || preview.identifiers.twitter || preview.identifiers.telegram) && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="text-gray-400 mb-1 font-semibold uppercase tracking-wider">Linked identities transferred</div>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.identifiers.telegram && (
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">TG @{preview.identifiers.telegram.username || preview.identifiers.telegram.id}</span>
                        )}
                        {preview.identifiers.evm && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">EVM {preview.identifiers.evm.slice(0, 6)}…{preview.identifiers.evm.slice(-4)}</span>
                        )}
                        {preview.identifiers.ton && (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">TON {preview.identifiers.ton.slice(0, 6)}…{preview.identifiers.ton.slice(-4)}</span>
                        )}
                        {preview.identifiers.twitter && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">𝕏 @{preview.identifiers.twitter.username || preview.identifiers.twitter.id}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showAvatarChooser && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Pick avatar to keep</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMergeAvatarChoice('primary')}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition ${mergeAvatarChoice === 'primary' ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 hover:border-white/20'}`}
                    >
                      <img src={user?.avatar || ''} alt="current" className="w-10 h-10 rounded-full object-cover" />
                      <span className="text-xs text-gray-200">Current</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeAvatarChoice('secondary')}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition ${mergeAvatarChoice === 'secondary' ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 hover:border-white/20'}`}
                    >
                      <img src={preview?.avatarUrl || ''} alt="other" className="w-10 h-10 rounded-full object-cover" />
                      <span className="text-xs text-gray-200">From other acc</span>
                    </button>
                  </div>
                </div>
              )}

              {showUsernameChooser && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Pick username to keep</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMergeUsernameChoice('primary')}
                      className={`px-3 py-2 rounded-lg border text-sm font-mono truncate transition ${mergeUsernameChoice === 'primary' ? 'border-amber-400 bg-amber-400/10 text-white' : 'border-white/10 text-gray-300 hover:border-white/20'}`}
                    >
                      {user?.username || 'current'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeUsernameChoice('secondary')}
                      className={`px-3 py-2 rounded-lg border text-sm font-mono truncate transition ${mergeUsernameChoice === 'secondary' ? 'border-amber-400 bg-amber-400/10 text-white' : 'border-white/10 text-gray-300 hover:border-white/20'}`}
                    >
                      {preview?.username}
                    </button>
                  </div>
                </div>
              )}

              <p className="text-amber-400/80 text-xs mb-4">This action cannot be undone.</p>

              <div className="flex gap-3">
                <button
                  onClick={() => setMergePrompt(null)}
                  className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-300 text-sm font-bold hover:bg-gray-700/50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMerge}
                  disabled={isMerging}
                  className="flex-1 py-3 rounded-xl bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {isMerging ? 'Merging...' : 'Confirm merge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={handleCloseTopUp}
        onBalanceUpdate={handleBalanceUpdate}
        onTopUpConfirmed={async () => {
          const addr = (user.walletAddress || walletAddress || '').trim();
          if (addr) await loadProfile(addr).catch(() => {});
          if (topUpBridgeMode === 'bridge') {
            await handleReturnToTelegramFromBridge('topup');
          }
        }}
        isAuthenticated={Boolean(lastAuthAddress || user.id)}
        onConnectWallet={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
        initialUsdtAmount={topUpInitialUsdt}
        walletAddress={user.walletAddress || walletAddress}
        externalProvider={
          activeTab === 'tg' && isTelegramWebViewContext() && !hasInjectedEthereumProvider()
            ? telegramWalletConnectSession?.provider
            : undefined
        }
        tonAddress={user?.tonAddress || null}
        onLinkTonWallet={handleLinkTonWallet}
        onLinkEvmWallet={handleLinkEvmWallet}
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

      {activeTab !== 'admin' && activeTab !== 'tg' && (
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
          isAuthenticated={Boolean(lastAuthAddress || user.id)}
          onOpenWalletConnect={() => { setConnectModalMode('login'); setIsWalletConnectOpen(true); }}
        />
        </>
      )}

    </div>
  );
};

export default App;
