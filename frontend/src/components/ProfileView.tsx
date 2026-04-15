import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { User, Item, Case, ImageMeta, RewardTask, RewardClaimRecord } from '../types';
import { Copy, ArrowUp, ArrowDown, Swords, Package, User as UserIcon, Settings, Gift, Play, Pause, ExternalLink, UploadCloud, Lock, Rocket } from 'lucide-react';
import { ItemCard } from './ItemCard';
import { SearchInput } from './ui/SearchInput';
import { Pagination } from './ui/Pagination';
import { EmptyState } from './ui/EmptyState';
import { Tabs } from './ui/Tabs';
import { StatCard } from './ui/StatCard';
import { ItemGrid } from './ui/ItemGrid';
import { ImageAdjustModal } from './ui/ImageAdjustModal';
import { ImageWithMeta } from './ui/ImageWithMeta';
import { usePagination } from '../hooks/usePagination';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { api } from '../services/api';
import { formatTokenValue, getLevelInfo, formatCfp } from '../utils/number';

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
  opponentWonItems?: Item[];
  lostItems?: Item[];
  timestamp?: number;
  caseCount?: number;
  /** Same as caseCount when set from API; preferred for display */
  roundCount?: number;
  mode?: 'BOT' | 'PVP' | string;
}

interface ProfileViewProps {
  user: User;
  inventory: Item[];
  burntItems: Item[];
  claimedItems: Item[];
  battleHistory: BattleRecord[];
  balance: number;
  cases: Case[];
  isEditable?: boolean;
  onSelectUser?: (username: string) => void;
  getUserAvatarByName?: (username: string) => string | undefined;
  onUpdateUsername?: (username: string) => Promise<void> | void;
  onUploadAvatar?: (file: File, meta?: ImageMeta) => Promise<string | void> | string | void;
  onUpdateAvatarMeta?: (meta: ImageMeta) => Promise<void> | void;
  onClaimToken?: (caseId: string) => Promise<void> | void;
  onConnectTwitter?: () => Promise<void> | void;
  onDisconnectTwitter?: () => Promise<void> | void;
  twitterBusy?: boolean;
  twitterNotice?: string | null;
  twitterError?: string | null;
  onConnectTelegram?: () => Promise<void> | void;
  onDisconnectTelegram?: () => Promise<void> | void;
  onOpenTelegramMiniApp?: () => Promise<void> | void;
  telegramBusy?: boolean;
  telegramError?: string | null;
  isBackgroundAnimated?: boolean;
  onToggleBackgroundAnimation?: () => void;
  isTelegramMiniApp?: boolean;
  telegramBotUsername?: string;
  onBalanceUpdate?: (balance: number) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  inventory,
  burntItems,
  claimedItems,
  battleHistory,
  balance,
  cases,
  isEditable = false,
  onSelectUser,
  getUserAvatarByName,
  onUpdateUsername,
  onUploadAvatar,
  onUpdateAvatarMeta,
  onClaimToken,
  onConnectTwitter,
  onDisconnectTwitter,
  twitterBusy = false,
  twitterError = null,
  onConnectTelegram,
  onDisconnectTelegram,
  onOpenTelegramMiniApp,
  telegramBusy = false,
  telegramError = null,
  isBackgroundAnimated = true,
  onToggleBackgroundAnimation,
  isTelegramMiniApp = false,
  telegramBotUsername = 'casefun_bot',
  onBalanceUpdate,
}) => {
  const [tab, setTab] = useState<'inventory' | 'expired' | 'claimed' | 'burnt' | 'battles'>('inventory');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [portfolioSort, setPortfolioSort] = useState<'name' | 'amount'>('name');
  const [portfolioTab, setPortfolioTab] = useState<'active' | 'claimed'>('active');
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [inventoryPage, setInventoryPage] = useState(0);
  const [burntPage, setBurntPage] = useState(0);
  const [claimedPage, setClaimedPage] = useState(0);
  const [battlePage, setBattlePage] = useState(0);
  const [editName, setEditName] = useState(user?.username || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const avatarAbortRef = useRef<(() => void) | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [avatarMeta, setAvatarMeta] = useState<ImageMeta>(
    user?.avatarMeta || { fit: 'cover', scale: 1, x: 0, y: 0 }
  );
  const [isAvatarAdjustOpen, setIsAvatarAdjustOpen] = useState(false);
  const [claimingCaseId, setClaimingCaseId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimProgress, setClaimProgress] = useState(0);
  const [claimStage, setClaimStage] = useState('');
  const [showClaimOverlay, setShowClaimOverlay] = useState(false);
  const claimTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const CLAIM_STAGES = [
    { at: 0, text: 'Preparing claim request...' },
    { at: 10, text: 'Verifying token ownership...' },
    { at: 25, text: 'Connecting to blockchain...' },
    { at: 40, text: 'Building transaction...' },
    { at: 55, text: 'Submitting to network...' },
    { at: 70, text: 'Waiting for confirmation...' },
    { at: 85, text: 'Transferring tokens...' },
    { at: 95, text: 'Finalizing...' },
  ];

  const startClaimProgress = useCallback(() => {
    setClaimProgress(0);
    setClaimStage(CLAIM_STAGES[0].text);
    setShowClaimOverlay(true);
    claimTimers.current.forEach(t => clearTimeout(t));
    claimTimers.current = [];
    let current = 0;
    const tick = () => {
      current += 0.8 + Math.random() * 2;
      if (current > 95) current = 95;
      setClaimProgress(Math.round(current));
      const stage = [...CLAIM_STAGES].reverse().find(s => current >= s.at);
      if (stage) setClaimStage(stage.text);
      if (current < 95) {
        const delay = current < 30 ? 150 + Math.random() * 250
          : current < 60 ? 300 + Math.random() * 500
          : 600 + Math.random() * 800;
        claimTimers.current.push(setTimeout(tick, delay));
      }
    };
    claimTimers.current.push(setTimeout(tick, 200));
  }, []);

  const finishClaimProgress = useCallback(async (success: boolean) => {
    claimTimers.current.forEach(t => clearTimeout(t));
    claimTimers.current = [];
    setClaimProgress(100);
    setClaimStage(success ? 'Tokens claimed!' : 'Claim failed');
    await new Promise(r => setTimeout(r, 800));
    setShowClaimOverlay(false);
    setClaimProgress(0);
  }, []);

  useEffect(() => {
    return () => { claimTimers.current.forEach(t => clearTimeout(t)); };
  }, []);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [referralInvited, setReferralInvited] = useState<number>(user?.referralConfirmedCount ?? 0);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const canShowReferralLink = true;
  const [socialRewardsTab, setSocialRewardsTab] = useState<'social' | 'rewards'>('social');
  const [rewardsSubTab, setRewardsSubTab] = useState<'tasks' | 'casefun' | 'history'>('tasks');
  const [rewardTasks, setRewardTasks] = useState<RewardTask[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardClaimRecord[]>([]);
  const [rewardPoints, setRewardPoints] = useState(user?.rewardPoints ?? 0);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [activatedTasks, setActivatedTasks] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('cf_activated_tasks');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const markTaskActivated = useCallback((taskId: string) => {
    setActivatedTasks((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      try { sessionStorage.setItem('cf_activated_tasks', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => { setRewardPoints(user?.rewardPoints ?? 0); }, [user?.rewardPoints]);

  const loadRewardTasks = useCallback(async () => {
    if (!isEditable || !user?.id) return;
    setRewardsLoading(true);
    try {
      const res = await api.getRewardTasks();
      setRewardTasks(Array.isArray(res.data?.tasks) ? res.data.tasks : []);
      if (typeof res.data?.totalPoints === 'number') setRewardPoints(res.data.totalPoints);
    } catch { /* ignore */ }
    finally { setRewardsLoading(false); }
  }, [isEditable, user?.id]);

  const loadRewardHistory = useCallback(async () => {
    if (!isEditable || !user?.id) return;
    try {
      const res = await api.getRewardHistory();
      setRewardHistory(Array.isArray(res.data?.claims) ? res.data.claims : []);
    } catch { /* ignore */ }
  }, [isEditable, user?.id]);

  useEffect(() => { loadRewardTasks(); }, [loadRewardTasks]);
  useEffect(() => { if (rewardsSubTab === 'history') loadRewardHistory(); }, [rewardsSubTab, loadRewardHistory]);

  useEffect(() => {
    const onFocus = () => { loadRewardTasks(); };
    window.addEventListener('focus', onFocus);
    const onVisible = () => { if (document.visibilityState === 'visible') loadRewardTasks(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadRewardTasks]);

  const handleClaimReward = async (taskId: string) => {
    setClaimingTaskId(taskId);
    setRewardError(null);
    try {
      const res = await api.claimReward(taskId);
      if (typeof res.data?.totalPoints === 'number') setRewardPoints(res.data.totalPoints);
      await loadRewardTasks();
    } catch (err: any) {
      setRewardError(err?.message || 'Failed to claim reward');
    } finally {
      setClaimingTaskId(null);
    }
  };

  const taskNeedsAction = (task: RewardTask) =>
    !['LINK_TWITTER', 'LINK_TELEGRAM'].includes(task.type);

  const getTaskActionUrl = (task: RewardTask): string | null => {
    if (['LIKE_TWEET', 'REPOST_TWEET', 'COMMENT_TWEET'].includes(task.type)) return task.targetUrl || null;
    if (task.type === 'FOLLOW_TWITTER') return 'https://x.com/casefunnet';
    if (task.type === 'SUBSCRIBE_TELEGRAM') return 'https://t.me/CaseFun_Chat';
    return task.targetUrl || null;
  };

  const openExternalUrl = useCallback((url: string, taskId: string) => {
    markTaskActivated(taskId);
    const tg = (window as any)?.Telegram?.WebApp;
    if (isTelegramMiniApp && tg) {
      const isTgLink = url.startsWith('https://t.me/');
      if (isTgLink && typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(url);
      } else if (typeof tg.openLink === 'function') {
        tg.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  }, [isTelegramMiniApp, markTaskActivated]);

  const renderTaskTitle = (task: RewardTask) => {
    const linkClass = "text-web3-accent underline hover:text-web3-accent/80 cursor-pointer";
    const tweetTypes = ['LIKE_TWEET', 'REPOST_TWEET', 'COMMENT_TWEET'];
    if (task.targetUrl && tweetTypes.includes(task.type)) {
      const verb = task.type === 'LIKE_TWEET' ? 'Like' : task.type === 'REPOST_TWEET' ? 'Repost' : 'Comment on';
      return <>{verb} <span onClick={() => openExternalUrl(task.targetUrl!, task.id)} className={linkClass}>this post</span></>;
    }
    if (task.type === 'FOLLOW_TWITTER') {
      return <>Follow <span onClick={() => openExternalUrl('https://x.com/casefunnet', task.id)} className={linkClass}>@casefunnet</span></>;
    }
    if (task.type === 'SUBSCRIBE_TELEGRAM') {
      return <>Join <span onClick={() => openExternalUrl('https://t.me/CaseFun_Chat', task.id)} className={linkClass}>Telegram channel</span></>;
    }
    return task.title;
  };

  const ITEMS_PER_PAGE = 36;
  const BATTLES_PER_PAGE = 10;

  const casesById = useMemo(() => {
    return new Map((cases || []).map((caseData) => [caseData.id, caseData]));
  }, [cases]);

  const profileDisplayName = useMemo(() => {
    if (!isTelegramMiniApp) {
      return user?.username || 'User';
    }
    const tgUsername = String(user?.telegramUsername || '').trim().replace(/^@+/, '');
    if (tgUsername) {
      return `@${tgUsername}`;
    }
    const tgFirstName = String(user?.telegramFirstName || '').trim();
    if (tgFirstName) {
      return tgFirstName;
    }
    return user?.username || 'User';
  }, [isTelegramMiniApp, user?.telegramUsername, user?.telegramFirstName, user?.username]);

  const isCaseExpired = (caseId?: string) => {
    if (!caseId) return false;
    const caseData = casesById.get(caseId);
    if (!caseData) return true;
    if (!caseData.openDurationHours || !caseData.createdAt) return false;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    return endAt <= Date.now();
  };

  const activeInventory = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return [];
    return inventory.filter((item) => !isCaseExpired(item.caseId));
  }, [inventory, casesById]);

  const sortedInventory = useMemo(() => {
    try {
      if (!activeInventory || !Array.isArray(activeInventory)) return [];
      return [...activeInventory].sort((a, b) => {
        const aValue = Number(a?.value) || 0;
        const bValue = Number(b?.value) || 0;
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      });
    } catch (error) {
      console.error('Error sorting inventory:', error);
      return [];
    }
  }, [activeInventory, sortOrder]);

  const groupedExpired = useMemo(() => {
    const CURRENCY_EMOJI: Record<string, string> = {
      SOL: '◎', ETH: 'Ξ', BTC: '₿', USDC: '💲', USDT: '💲', BNB: '🔶', MATIC: '🟣', AVAX: '🔺', TON: '💎',
    };
    const groups = new Map<string, Item & { count: number }>();
    if (!inventory || !Array.isArray(inventory)) return [];
    for (const item of inventory) {
      if (!item || !isCaseExpired(item.caseId) || item.claimedAt) continue;
      const currencyKey = item.currency || 'UNKNOWN';
      const existing = groups.get(currencyKey);
      const fallbackImage = item.image || CURRENCY_EMOJI[currencyKey.toUpperCase()] || '🪙';
      if (!existing) {
        groups.set(currencyKey, {
          ...item,
          id: `expired-${currencyKey}`,
          name: `${Number(item.value || 0)} ${currencyKey}`,
          image: item.image || fallbackImage,
          value: Number(item.value || 0),
          count: 1,
        });
      } else {
        const nextValue = Number(existing.value || 0) + Number(item.value || 0);
        groups.set(currencyKey, {
          ...existing,
          image: existing.image || fallbackImage,
          value: nextValue,
          name: `${nextValue} ${currencyKey}`,
          count: existing.count + 1,
        });
      }
    }
    const items = Array.from(groups.values());
    return items.sort((a, b) => {
      const aValue = Number(a?.value) || 0;
      const bValue = Number(b?.value) || 0;
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }, [inventory, sortOrder, casesById]);
  const {
    page: expiredPage,
    setPage: setExpiredPage,
    totalPages: expiredTotalPages,
    pagedItems: pagedExpired,
  } = usePagination(groupedExpired, ITEMS_PER_PAGE);

  const groupedClaimed = useMemo(() => {
    const groups = new Map<string, Item & { count: number }>();
    if (!claimedItems || !Array.isArray(claimedItems)) return [];
    for (const item of claimedItems) {
      if (!item) continue;
      const currencyKey = item.currency || 'UNKNOWN';
      const existing = groups.get(currencyKey);
      if (!existing) {
        groups.set(currencyKey, {
          ...item,
          id: `claimed-${currencyKey}`,
          name: `${Number(item.value || 0)} ${currencyKey}`,
          value: Number(item.value || 0),
          count: 1,
        });
      } else {
        const nextValue = Number(existing.value || 0) + Number(item.value || 0);
        groups.set(currencyKey, {
          ...existing,
          value: nextValue,
          name: `${nextValue} ${currencyKey}`,
          count: existing.count + 1,
        });
      }
    }
    const items = Array.from(groups.values());
    return items.sort((a, b) => {
      const aValue = Number(a?.value) || 0;
      const bValue = Number(b?.value) || 0;
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }, [claimedItems, sortOrder]);

  const formatAddress = (address?: string | null) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBattleTime = (timestamp?: number) => {
    if (!timestamp || !Number.isFinite(timestamp)) return 'Unknown time';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTwitterLinkedAt = (value?: string | number | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTelegramLinkedAt = (value?: string | number | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleCopyAddress = async (address?: string | null) => {
    if (!address) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
        return;
      }
    } catch {
      // ignore clipboard errors
    }
  };

  const handleClaimToken = async (caseId?: string) => {
    if (!caseId || !onClaimToken) return;
    setClaimError(null);
    setClaimingCaseId(caseId);
    startClaimProgress();
    try {
      await onClaimToken(caseId);
      await finishClaimProgress(true);
    } catch (error: any) {
      await finishClaimProgress(false);
      setClaimError(error?.message || 'Claim failed');
    } finally {
      setClaimingCaseId(null);
    }
  };

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

  const claimedTotalPages = useMemo(() => {
    try {
      const length = Array.isArray(groupedClaimed) ? groupedClaimed.length : 0;
      return Math.max(1, Math.ceil(length / ITEMS_PER_PAGE));
    } catch (error) {
      console.error('Error calculating claimed pages:', error);
      return 1;
    }
  }, [groupedClaimed]);

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

  const pagedClaimed = useMemo(() => {
    try {
      if (!groupedClaimed || !Array.isArray(groupedClaimed)) return [];
      const start = claimedPage * ITEMS_PER_PAGE;
      return groupedClaimed.slice(start, start + ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error paginating claimed items:', error);
      return [];
    }
  }, [groupedClaimed, claimedPage]);

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
    if (claimedPage > claimedTotalPages - 1) {
      setClaimedPage(Math.max(0, claimedTotalPages - 1));
    }
  }, [claimedTotalPages, claimedPage]);

  React.useEffect(() => {
    if (battlePage > battleTotalPages - 1) {
      setBattlePage(Math.max(0, battleTotalPages - 1));
    }
  }, [battleTotalPages, battlePage]);


  React.useEffect(() => {
    setEditName(user?.username || '');
    // When opening another profile, always land on main inventory tab.
    setTab('inventory');
    setInventoryPage(0);
    setBurntPage(0);
    setClaimedPage(0);
    setBattlePage(0);
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

  React.useEffect(() => {
    if (user?.avatarMeta) {
      setAvatarMeta(user.avatarMeta);
    }
  }, [user?.avatarMeta]);

  useEffect(() => {
    setReferralInvited(user?.referralConfirmedCount ?? 0);
  }, [user?.referralConfirmedCount]);

  useEffect(() => {
    if (!isEditable || !user?.id || !canShowReferralLink) {
      setReferralUrl(null);
      setReferralError(null);
      setReferralLoading(false);
      return;
    }
    let cancelled = false;
    setReferralLoading(true);
    setReferralError(null);
    void (async () => {
      try {
        const r = await api.getReferralCode();
        if (cancelled || !r.data?.code) return;
        const code = r.data.code;
        if (isTelegramMiniApp) {
          setReferralUrl(`https://t.me/${telegramBotUsername}?startapp=ref_${encodeURIComponent(code)}`);
        } else {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          setReferralUrl(`${origin}/?ref=${encodeURIComponent(code)}`);
        }
        setReferralInvited(r.data.invitedCount ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          setReferralError(e?.message || 'Failed to load referral link');
        }
      } finally {
        if (!cancelled) setReferralLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditable, user?.id, canShowReferralLink, isTelegramMiniApp, telegramBotUsername]);

  const handleSaveName = async () => {
    if (!onUpdateUsername) return;
    const nextName = (editName || '').trim().toUpperCase();
    if (!nextName) {
      setNameError('Enter a username.');
      return;
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(nextName)) {
      setNameError('Use 3-20 chars (A-Z, 0-9, _ or -).');
      return;
    }
    if (nextName.startsWith('USER_')) {
      setNameError('Username is reserved.');
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

  const handleSaveAvatarMeta = async (nextMeta: ImageMeta) => {
    if (!onUpdateAvatarMeta) return;
    setAvatarError(null);
    try {
      await onUpdateAvatarMeta(nextMeta);
    } catch (error) {
      setAvatarError('Failed to save avatar display.');
    }
  };

  const handleAvatarChange = useCallback((file?: File | null) => {
    if (!file || !onUploadAvatar) return;
    setAvatarError(null);
    if (file.size > 1024 * 1024) {
      setAvatarError('Avatar too large (max 1MB).');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    const initialMeta: ImageMeta = { fit: 'cover', scale: 1, x: 0, y: 0 };
    setAvatarMeta(initialMeta);
    setIsUploadingAvatar(true);
    setAvatarUploadProgress(0);

    const { promise, abort } = api.uploadAvatarWithProgress(
      file,
      initialMeta,
      (pct) => setAvatarUploadProgress(pct),
    );
    avatarAbortRef.current = abort;

    promise
      .then(async (response) => {
        const avatarUrl = response.data?.avatarUrl;
        if (avatarUrl) {
          try { await onUploadAvatar(file, initialMeta); } catch {}
          setAvatarPreview(avatarUrl.startsWith('/') ? avatarUrl : avatarUrl);
          setIsAvatarAdjustOpen(true);
        }
      })
      .catch((err) => {
        if (err?.message !== 'Upload cancelled') setAvatarError('Failed to upload avatar.');
      })
      .finally(() => {
        setIsUploadingAvatar(false);
        setAvatarUploadProgress(0);
        avatarAbortRef.current = null;
      });
  }, [onUploadAvatar]);

  const cancelAvatarUpload = useCallback(() => {
    avatarAbortRef.current?.();
    setIsUploadingAvatar(false);
    setAvatarUploadProgress(0);
    avatarAbortRef.current = null;
  }, []);

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

  const activeHoldings = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return {} as Record<string, number>;
    return inventory
      .filter(item => item && !isCaseExpired(item.caseId) && !item.claimedAt)
      .reduce((acc, item) => {
        acc[item.currency] = (acc[item.currency] || 0) + item.value;
        return acc;
      }, {} as Record<string, number>);
  }, [inventory, casesById]);

  const claimedHoldings = useMemo(() => {
    if (!claimedItems || !Array.isArray(claimedItems)) return {} as Record<string, number>;
    return claimedItems.reduce((acc, item) => {
      if (!item) return acc;
      acc[item.currency] = (acc[item.currency] || 0) + item.value;
      return acc;
    }, {} as Record<string, number>);
  }, [claimedItems]);

  const claimableHoldings = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return {} as Record<string, number>;
    return inventory
      .filter(item => item && isCaseExpired(item.caseId) && !item.claimedAt)
      .reduce((acc, item) => {
        acc[item.currency] = (acc[item.currency] || 0) + item.value;
        return acc;
      }, {} as Record<string, number>);
  }, [inventory, casesById]);

  const mergedClaimedEntries = useMemo(() => {
    const merged: Record<string, { claimed: number; claimable: number }> = {};
    for (const [cur, amt] of Object.entries(claimedHoldings)) {
      if (!merged[cur]) merged[cur] = { claimed: 0, claimable: 0 };
      merged[cur].claimed += amt;
    }
    for (const [cur, amt] of Object.entries(claimableHoldings)) {
      if (!merged[cur]) merged[cur] = { claimed: 0, claimable: 0 };
      merged[cur].claimable += amt;
    }
    return merged;
  }, [claimedHoldings, claimableHoldings]);

  const toEntries = (holdings: Record<string, number>) =>
    Object.entries(holdings).map(([currency, total]) => ({ currency, total }));

  const activeBaseEntries = useMemo(() => toEntries(activeHoldings), [activeHoldings]);

  const claimedBaseEntries = useMemo(() =>
    Object.entries(mergedClaimedEntries).map(([currency, { claimed, claimable }]) => ({
      currency,
      total: claimed + claimable,
      claimed,
      claimable,
    })),
  [mergedClaimedEntries]);

  const currentPortfolioBase = portfolioTab === 'active' ? activeBaseEntries : claimedBaseEntries;

  const filteredPortfolioEntries = useSearchFilter(
    currentPortfolioBase,
    portfolioSearch,
    (entry, query) => entry.currency.toLowerCase().includes(query)
  );

  const portfolioEntries = useMemo(() => {
    const sorted = [...filteredPortfolioEntries].sort((a, b) => {
      if (portfolioSort === 'name') {
        return a.currency.localeCompare(b.currency);
      }
      return b.total - a.total;
    });
    return sorted;
  }, [filteredPortfolioEntries, portfolioSort]);
  const miniUpgradeIconCardClass = isTelegramMiniApp ? 'aspect-square !min-h-0' : '';

  if (!user) {
    return (
      <div className={`${isTelegramMiniApp ? 'p-3 min-h-0' : 'p-8 min-h-screen'} max-w-[1600px] mx-auto flex items-center justify-center`}>
        <div className="text-gray-500">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className={`${isTelegramMiniApp ? 'p-3 min-h-0' : 'p-8 min-h-screen'} max-w-[1600px] mx-auto`}>
      <div className={`${isTelegramMiniApp ? 'grid grid-cols-1 gap-3 mb-4' : 'grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8'}`}>
        <div
          className={`xl:col-span-4 bg-black/20 border border-white/[0.12] rounded-2xl flex flex-col backdrop-blur-2xl ${
            isTelegramMiniApp ? 'p-4 h-auto min-h-0' : 'p-6 h-[440px]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">
              Asset Portfolio
            </h3>
            {!isTelegramMiniApp && (
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
            )}
          </div>

          <div className="flex items-center gap-1 mb-3">
            <button
              onClick={() => { setPortfolioTab('active'); setPortfolioSearch(''); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition ${
                portfolioTab === 'active'
                  ? 'bg-web3-accent/15 text-web3-accent border-web3-accent/30'
                  : 'text-gray-500 border-white/[0.08] hover:text-white'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => { setPortfolioTab('claimed'); setPortfolioSearch(''); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition ${
                portfolioTab === 'claimed'
                  ? 'bg-web3-accent/15 text-web3-accent border-web3-accent/30'
                  : 'text-gray-500 border-white/[0.08] hover:text-white'
              }`}
            >
              Claimed
            </button>
          </div>

          {!isTelegramMiniApp && (
            <div className="mb-3">
              <SearchInput
                value={portfolioSearch}
                onChange={setPortfolioSearch}
                placeholder="Search token"
                className="md:w-full"
              />
            </div>
          )}

          <div className={`${isTelegramMiniApp ? 'grid grid-cols-2 gap-2' : 'space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0'}`}>
            {portfolioEntries.length === 0 && (
              <div className="text-gray-600 text-sm italic py-4 text-center">
                {portfolioTab === 'active' ? 'No active tokens.' : 'No claimed tokens yet.'}
              </div>
            )}
            {(isTelegramMiniApp ? portfolioEntries.slice(0, 6) : portfolioEntries).map((entry) => (
              <div key={entry.currency} className={`bg-black/25 backdrop-blur-xl rounded-lg border border-white/[0.12] flex items-center justify-between group hover:border-web3-accent/30 transition-colors ${isTelegramMiniApp ? 'px-3 py-2' : 'px-4 py-3'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${entry.total > 0 ? (portfolioTab === 'active' ? 'bg-web3-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-web3-accent shadow-[0_0_8px_rgba(102,252,241,0.5)]') : 'bg-gray-700'}`}></div>
                  <span className="font-bold text-gray-300 text-sm">${entry.currency}</span>
                </div>
                {portfolioTab === 'claimed' && 'claimable' in entry ? (
                  <div className="text-right">
                    <span className="font-mono text-white font-bold text-sm">{formatTokenValue(entry.total || 0)}</span>
                    {(entry as any).claimable > 0 && (
                      <div className="text-[9px] text-web3-success font-bold">{formatTokenValue((entry as any).claimable)} claimable</div>
                    )}
                  </div>
                ) : (
                  <span className="font-mono text-white font-bold">{formatTokenValue(entry.total || 0)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div
          className={`xl:col-span-4 bg-black/20 border border-white/[0.12] rounded-2xl backdrop-blur-2xl relative overflow-hidden ${
            isTelegramMiniApp ? 'p-4 h-auto min-h-0' : 'p-6 h-[440px]'
          }`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple bg-size-200 animate-gradient"></div>
          {isEditable && (
            <>
              {!isTelegramMiniApp && onToggleBackgroundAnimation && (
                <button
                  onClick={onToggleBackgroundAnimation}
                  className={`absolute left-4 top-4 h-9 px-2.5 rounded-full border flex items-center justify-center gap-1.5 transition ${
                    isBackgroundAnimated
                      ? 'border-web3-accent/45 bg-web3-accent/15 text-web3-accent hover:border-web3-accent/70'
                      : 'border-white/[0.12] bg-white/5 text-gray-300 hover:text-white hover:border-web3-accent/40'
                  }`}
                  title={isBackgroundAnimated ? 'Disable background animation' : 'Enable background animation'}
                  aria-label="Toggle background animation"
                >
                  {isBackgroundAnimated ? <Pause size={13} /> : <Play size={13} />}
                  <span className="text-[9px] font-bold uppercase tracking-widest">
                    {isBackgroundAnimated ? 'FX ON' : 'FX OFF'}
                  </span>
                </button>
              )}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/5 border border-white/[0.12] flex items-center justify-center text-gray-300 hover:text-white hover:border-web3-accent/40 transition"
                aria-label="Open settings"
              >
                <Settings size={16} />
              </button>
            </>
          )}

          <div className="h-full flex flex-col items-center text-center">
            <div className="relative mt-1 mb-4">
              <div className="absolute inset-0 bg-web3-accent/20 blur-xl rounded-full"></div>
              <div className="w-24 h-24 rounded-full bg-gray-800 border-4 border-web3-accent flex items-center justify-center relative z-10 overflow-hidden">
                {user?.avatar ? (
                  <ImageWithMeta src={user.avatar} meta={user.avatarMeta} className="w-full h-full" />
                ) : (
                  <UserIcon size={48} className="text-web3-accent" />
                )}
              </div>
            </div>
            
            <h2 className={`${isTelegramMiniApp ? 'text-xl' : 'text-2xl'} font-black text-white`}>{profileDisplayName}</h2>

            {(() => {
              const lvl = getLevelInfo(rewardPoints);
              return (
              <div className="w-full max-w-[240px] mt-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-web3-accent to-web3-purple">Lvl {lvl.level}</span>
                  <span className="text-[10px] text-gray-500 tabular-nums">{lvl.isMaxLevel ? 'MAX' : `${lvl.xpInLevel} / ${lvl.xpNeeded}`}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple transition-all duration-700" style={{ width: `${lvl.progress}%` }} />
                </div>
              </div>
              );
            })()}

            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/30 border border-white/[0.12] backdrop-blur-xl mb-2">
              <span className="font-mono text-sm font-bold text-white tabular-nums">
                {balance.toLocaleString('en-US')}₮
              </span>
              {rewardPoints > 0 && (
                <>
                  <span className="text-gray-600">·</span>
                  <span className="font-mono text-sm font-bold text-web3-accent tabular-nums">{formatCfp(rewardPoints)} CFP</span>
                </>
              )}
            </div>

            {user?.hasLinkedWallet && user?.walletAddress && (
              <div
                className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-gray-700 mb-4 hover:border-web3-accent/50 transition-colors cursor-pointer group/wallet"
              onClick={() => navigator.clipboard.writeText(user.walletAddress)}
              title={`Click to copy: ${user.walletAddress}`}
            >
              <div className="w-2 h-2 rounded-full bg-web3-success shadow-[0_0_5px_#10B981] animate-pulse"></div>
                <span className="font-mono text-web3-accent text-xs font-bold tracking-wide">{formatWalletAddress(user.walletAddress)}</span>
              <Copy size={12} className="text-gray-500 group-hover/wallet:text-web3-accent transition-colors ml-1" />
              </div>
            )}

            <div className="w-full h-[1px] bg-white/5 mb-4"></div>

            <div className={`grid grid-cols-2 gap-3 w-full ${isTelegramMiniApp ? 'mt-1' : ''}`}>
              <StatCard
                label="Cases Opened"
                value={user?.stats?.casesOpened || 0}
                className="px-3 py-2 rounded-lg"
                valueClassName="text-lg font-black text-white"
              />
              <StatCard
                label="Win Rate"
                value={`${successRate}%`}
                className="px-3 py-2 rounded-lg"
                valueClassName={`text-lg font-black ${parseFloat(successRate) > 50 ? 'text-web3-success' : 'text-gray-400'}`}
              />
            </div>
          </div>
            </div>

        {!isTelegramMiniApp && (
        <div
          className="xl:col-span-4 bg-black/20 border border-white/[0.12] rounded-2xl backdrop-blur-2xl flex flex-col p-6 h-[440px]"
        >
          <div className="flex items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => setSocialRewardsTab('social')}
              className={`text-xs font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg transition ${
                socialRewardsTab === 'social'
                  ? 'text-white bg-white/[0.08]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Social
            </button>
            <button
              type="button"
              onClick={() => setSocialRewardsTab('rewards')}
              className={`text-xs font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                socialRewardsTab === 'rewards'
                  ? 'text-white bg-white/[0.08]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Gift size={11} />
              Rewards
              {rewardTasks.some((t: any) => !t.claimed && !(t.onCooldown)) && socialRewardsTab !== 'rewards' && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          </div>

          {socialRewardsTab === 'social' && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
              <div className="space-y-2">
                {/* Twitter / X row */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-black/20">
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${user?.twitterId ? 'border-web3-success/40' : 'border-white/10'}`}>
                    <svg viewBox="0 0 1200 1227" className={`w-3 h-3 fill-current ${user?.twitterId ? 'text-web3-success' : 'text-gray-500'}`}>
                      <path d="M714.163 519.284L1160.89 0H1055.14L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.748L515.454 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.06 687.828L521.627 619.936L144.011 79.6944H306.615L611.333 515.664L658.766 583.556L1055.19 1150.69H892.586L569.06 687.854V687.828Z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">X / Twitter</div>
                    {user?.twitterId ? (
                      <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        <span className="text-sm font-bold text-white truncate">@{user.twitterUsername || 'connected'}</span>
                        {formatTwitterLinkedAt(user?.twitterLinkedAt) && (
                          <span className="text-[10px] text-gray-600 shrink-0">{formatTwitterLinkedAt(user?.twitterLinkedAt)}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 mt-0.5">Not linked</div>
                    )}
                  </div>
                  {isEditable && (
                    <button type="button" onClick={() => user?.twitterId ? onDisconnectTwitter?.() : onConnectTwitter?.()} disabled={twitterBusy || (!user?.twitterId && !onConnectTwitter) || (Boolean(user?.twitterId) && !onDisconnectTwitter)} className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg border transition disabled:opacity-40 ${user?.twitterId ? 'border-red-500/25 text-red-400 hover:border-red-500/50' : 'border-web3-accent/25 text-web3-accent hover:border-web3-accent/50'} ${twitterBusy ? 'opacity-70 cursor-wait' : ''}`}>
                      {twitterBusy ? '…' : user?.twitterId ? 'Disconnect' : 'Connect'}
                    </button>
                  )}
                </div>

                {/* Telegram row */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-black/20">
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${user?.telegramId ? 'border-web3-success/40' : 'border-white/10'}`}>
                    <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 fill-current ${user?.telegramId ? 'text-web3-success' : 'text-gray-500'}`}>
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.800-.840-.547-.297-1.174.157-1.557.112-.098 3.018-2.885 3.076-3.13.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Telegram</div>
                    {user?.telegramId ? (
                      <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        <span className="text-sm font-bold text-white truncate">{user.telegramUsername ? `@${user.telegramUsername}` : user.telegramFirstName || 'linked'}</span>
                        {formatTelegramLinkedAt(user?.telegramLinkedAt) && (
                          <span className="text-[10px] text-gray-600 shrink-0">{formatTelegramLinkedAt(user?.telegramLinkedAt)}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 mt-0.5">Not linked</div>
                    )}
                  </div>
                  {isEditable && (
                    <button type="button" onClick={() => user?.telegramId ? onDisconnectTelegram?.() : onConnectTelegram?.()} disabled={telegramBusy || (!user?.telegramId && !onConnectTelegram) || (Boolean(user?.telegramId) && !onDisconnectTelegram)} className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg border transition disabled:opacity-40 ${user?.telegramId ? 'border-red-500/25 text-red-400 hover:border-red-500/50' : 'border-web3-accent/25 text-web3-accent hover:border-web3-accent/50'} ${telegramBusy ? 'opacity-70 cursor-wait' : ''}`}>
                      {telegramBusy ? '…' : user?.telegramId ? 'Disconnect' : 'Connect'}
                    </button>
                  )}
                </div>

                {isEditable && canShowReferralLink && (
                  <div className="flex flex-col gap-2 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-black/20">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Referrals</div>
                    {referralLoading ? (
                      <div className="text-xs text-gray-600">Loading…</div>
                    ) : referralError ? (
                      <div className="text-[10px] text-red-400">{referralError}</div>
                    ) : (
                      <>
                        <div className="text-[11px] text-gray-400 leading-snug">
                          Confirmed invites:{' '}
                          <span className="text-white font-bold tabular-nums">{referralInvited}</span>
                          <span className="block mt-1 text-[10px] text-gray-600">Counted after your invitee links both Twitter and Telegram. You earn 8 CFP per referral + 10% of their task rewards.</span>
                        </div>
                        {referralUrl && (
                          <div className="flex flex-col gap-1.5 pt-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] text-web3-accent truncate flex-1 font-mono">{referralUrl}</span>
                              <button type="button" onClick={() => { void navigator.clipboard?.writeText(referralUrl).catch(() => {}); }} className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-white/[0.12] text-gray-300 hover:text-white hover:border-web3-accent/40 transition">
                                <Copy size={12} /> Copy
                              </button>
                            </div>
                            {isTelegramMiniApp && (
                              <button type="button" onClick={() => { try { const tg = (window as any)?.Telegram?.WebApp; const text = `Join me on CaseFun! Open crypto cases and win tokens.`; if (typeof tg?.openTelegramLink === 'function') { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(text)}`); } else { window.open(`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(text)}`, '_blank'); } } catch { /* ignore */ } }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-web3-accent to-web3-success text-black active:scale-[0.98] transition">
                                <ExternalLink size={12} /> Share via Telegram
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-600 mb-2">
                  <Gift size={11} /> Promo Code
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!promoCode.trim() || promoLoading) return;
                  setPromoLoading(true);
                  setPromoResult(null);
                  try {
                    const res = await api.activatePromo(promoCode.trim().toUpperCase());
                    setPromoResult({ ok: true, msg: `+${res.data?.amount} ₮ added to your balance!` });
                    setPromoCode('');
                    if (onBalanceUpdate && typeof res.data?.balance === 'number') onBalanceUpdate(res.data.balance);
                  } catch (err: any) {
                    setPromoResult({ ok: false, msg: err?.message || 'Failed to activate' });
                  } finally {
                    setPromoLoading(false);
                  }
                }} className="flex gap-2">
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Enter code"
                    className="flex-1 min-w-0 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-web3-accent/40 font-mono uppercase tracking-wider"
                  />
                  <button
                    type="submit"
                    disabled={!promoCode.trim() || promoLoading}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-40 shrink-0"
                  >
                    {promoLoading ? '...' : 'Apply'}
                  </button>
                </form>
                {promoResult && (
                  <div className={`mt-1.5 text-[10px] ${promoResult.ok ? 'text-web3-success' : 'text-red-400'}`}>{promoResult.msg}</div>
                )}
              </div>

              {isEditable && twitterError && <div className="mt-2 text-[10px] text-red-400">{twitterError}</div>}
              {isEditable && telegramError && <div className="mt-2 text-[10px] text-red-400">{telegramError}</div>}
            </div>
          )}

          {socialRewardsTab === 'rewards' && (
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 custom-scrollbar pr-1">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] text-gray-400">
                  Total: <span className="text-web3-accent font-mono font-bold">{formatCfp(rewardPoints)} CFP</span>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setRewardsSubTab('tasks')} className={`text-[10px] px-2 py-0.5 rounded-md transition flex items-center gap-1 ${rewardsSubTab === 'tasks' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    Social
                    {rewardsSubTab !== 'tasks' && rewardTasks.some((t: any) => (t.category || 'SOCIAL') === 'SOCIAL' && !t.claimed && !t.locked) && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  </button>
                  <button type="button" onClick={() => setRewardsSubTab('casefun')} className={`text-[10px] px-2 py-0.5 rounded-md transition flex items-center gap-1 ${rewardsSubTab === 'casefun' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    CaseFun
                    {rewardsSubTab !== 'casefun' && rewardTasks.some((t: any) => t.category === 'CASEFUN' && !t.claimed && !t.onCooldown) && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  </button>
                  <button type="button" onClick={() => setRewardsSubTab('history')} className={`text-[10px] px-2 py-0.5 rounded-md transition ${rewardsSubTab === 'history' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'}`}>History</button>
                </div>
              </div>

              {rewardsSubTab === 'tasks' && (() => {
                const socialTasks = rewardTasks.filter((t: any) => (t.category || 'SOCIAL') === 'SOCIAL' && !t.claimed);
                return (
                <div className="space-y-1.5">
                  {rewardsLoading && <div className="text-xs text-gray-600">Loading tasks…</div>}
                  {!rewardsLoading && socialTasks.length === 0 && (
                    <div className="text-center py-6">
                      <Gift size={20} className="mx-auto text-gray-600 mb-2" />
                      <div className="text-[11px] text-gray-500">All social tasks completed!</div>
                      <div className="text-[10px] text-gray-600 mt-1">More tasks coming soon — stay tuned</div>
                    </div>
                  )}
                  {socialTasks.map((task) => {
                    const needsAction = taskNeedsAction(task);
                    const isActivated = activatedTasks.has(task.id);
                    const showClaim = isEditable && task.completed && !task.locked && (!needsAction || isActivated);
                    const showGo = isEditable && task.completed && !task.locked && needsAction && !isActivated;
                    const actionUrl = getTaskActionUrl(task);
                    return (
                    <div key={task.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-black/20 ${task.locked ? 'border-white/[0.04] opacity-60' : 'border-white/[0.08]'}`}>
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${task.locked ? 'border-white/10 text-gray-600' : isActivated ? 'border-web3-accent/40 text-web3-accent' : 'border-white/10 text-gray-500'}`}>
                        {task.locked ? <Lock size={10} /> : <Gift size={11} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-white font-medium">{renderTaskTitle(task)}</div>
                        {task.locked && <div className="text-[10px] text-gray-500 mt-0.5">Link Twitter & Telegram first</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-web3-accent">+{task.reward}</span>
                        {showGo && actionUrl && (
                          <button type="button" onClick={() => openExternalUrl(actionUrl, task.id)} className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-web3-accent/40 text-web3-accent hover:bg-web3-accent/10 active:scale-[0.97] transition flex items-center gap-1">Go <ExternalLink size={10} /></button>
                        )}
                        {showClaim && (
                          <button type="button" disabled={claimingTaskId === task.id} onClick={() => handleClaimReward(task.id)} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-50 active:scale-[0.97] transition">
                            {claimingTaskId === task.id ? '…' : 'Claim'}
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {rewardError && <div className="text-[10px] text-red-400 mt-1">{rewardError}</div>}
                </div>
                );
              })()}

              {rewardsSubTab === 'casefun' && (() => {
                const cfTasks = rewardTasks.filter((t: any) => t.category === 'CASEFUN').sort((a: any, b: any) => (a.onCooldown ? 1 : 0) - (b.onCooldown ? 1 : 0));
                const now = Date.now();
                return (
                <div className="space-y-1.5">
                  {rewardsLoading && <div className="text-xs text-gray-600">Loading tasks…</div>}
                  {!rewardsLoading && cfTasks.length === 0 && (
                    <div className="text-center py-6">
                      <Rocket size={20} className="mx-auto text-gray-600 mb-2" />
                      <div className="text-[11px] text-gray-500">No CaseFun tasks yet!</div>
                      <div className="text-[10px] text-gray-600 mt-1">Platform challenges coming soon</div>
                    </div>
                  )}
                  {cfTasks.map((task: any) => {
                    const progress = task.progress ?? 0;
                    const target = task.targetCount ?? 1;
                    const pct = Math.min(100, Math.round((progress / target) * 100));
                    const isComplete = progress >= target && !task.onCooldown;
                    const isCooldown = task.onCooldown && task.cooldownEndsAt;
                    const isDone = task.claimed && !task.onCooldown;

                    let timeLabel = '';
                    if (task.activeUntil) {
                      const d = new Date(task.activeUntil);
                      timeLabel = `Until ${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;
                    } else {
                      timeLabel = 'Always active';
                    }

                    let cooldownLabel = '';
                    if (isCooldown) {
                      const ms = new Date(task.cooldownEndsAt).getTime() - now;
                      if (ms > 0) {
                        const h = Math.floor(ms / 3600000);
                        const m = Math.floor((ms % 3600000) / 60000);
                        cooldownLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      }
                    }

                    return (
                    <div key={task.id} className={`px-3 py-2.5 rounded-xl border bg-black/20 ${isCooldown || isDone ? 'border-white/[0.04] opacity-60' : 'border-white/[0.08]'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-white font-medium">{task.title}</div>
                          <div className="text-[10px] text-gray-500">{task.description} · <span className="text-gray-600">{timeLabel}</span></div>
                        </div>
                        <span className="text-[10px] font-mono text-web3-accent shrink-0 ml-2">+{task.reward} CFP</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
                        <div className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-web3-success' : 'bg-web3-accent'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-gray-500">
                          {isCooldown ? (
                            <span className="text-yellow-500">Next in {cooldownLabel}</span>
                          ) : isDone ? (
                            <span className="text-gray-600">Completed</span>
                          ) : (
                            <span>{pct}%</span>
                          )}
                        </div>
                        {isComplete && isEditable && (
                          <button type="button" disabled={claimingTaskId === task.id} onClick={() => handleClaimReward(task.id)} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-50 active:scale-[0.97] transition">
                            {claimingTaskId === task.id ? '…' : 'Claim'}
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {rewardError && <div className="text-[10px] text-red-400 mt-1">{rewardError}</div>}
                </div>
                );
              })()}

              {rewardsSubTab === 'history' && (
                <div className="space-y-1">
                  {rewardHistory.length === 0 && <div className="text-xs text-gray-600">No rewards claimed yet</div>}
                  {rewardHistory.map((claim) => {
                    const meta = claim.metadata as Record<string, any> | null;
                    let title = claim.taskTitle || 'Reward';
                    let subtitle = '';
                    if (claim.type === 'REFERRAL_BONUS') {
                      title = 'Referral confirmed';
                      subtitle = 'Invited user linked Twitter & Telegram';
                    } else if (claim.type === 'REFERRAL_KICKBACK') {
                      const who = meta?.referralUsername || 'referral';
                      const pts = meta?.taskReward ?? 0;
                      title = `Referral reward (10%)`;
                      subtitle = `${who} earned ${formatCfp(pts)} CFP — you received 10%`;
                    }
                    return (
                    <div key={claim.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-black/15">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-white truncate">{title}</div>
                        {subtitle && <div className="text-[10px] text-gray-500 truncate">{subtitle}</div>}
                        <div className="text-[10px] text-gray-600">{new Date(claim.claimedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span className="text-[11px] font-mono text-web3-accent font-bold shrink-0 ml-2">+{formatCfp(claim.reward)} CFP</span>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {isTelegramMiniApp ? (
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-black/30 p-0.5 overflow-x-auto">
            {([
              { id: 'inventory', label: 'Items' },
              { id: 'expired', label: 'Expired' },
              { id: 'claimed', label: 'Claimed' },
              { id: 'burnt', label: 'Burnt' },
              { id: 'battles', label: 'Battles' },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 min-w-0 px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-web3-accent/15 text-web3-accent border border-web3-accent/30'
                    : 'text-gray-500 border border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {(tab === 'inventory' || tab === 'expired') && (
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest"
            >
              {tab === 'inventory' ? 'Price' : 'Amount'} {sortOrder === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-6">
          <Tabs
            className="flex-1"
            tabs={[
              { id: 'inventory', label: 'Items' },
              { id: 'expired', label: 'Expired' },
              { id: 'claimed', label: 'Claimed' },
              { id: 'burnt', label: 'Burnt' },
              { id: 'battles', label: 'Battles' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as any)}
          />
          {tab === 'inventory' && (
            <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="ml-auto flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition">
              Price {sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
            </button>
          )}
          {tab === 'expired' && (
            <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="ml-auto flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition">
              Amount {sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
            </button>
          )}
        </div>
      )}

      <div
        className={`bg-black/20 border border-white/[0.12] rounded-2xl flex flex-col backdrop-blur-2xl ${
          isTelegramMiniApp ? 'p-3 min-h-[320px]' : 'p-6 h-[810px]'
        }`}
      >
            {/* Inventory Tab */}
            {tab === 'inventory' && (
              <div className="flex flex-col h-full min-h-0">
                {(!sortedInventory || sortedInventory.length === 0) ? (
                  <EmptyState
                    icon={<Package size={48} />}
                    message="Inventory is empty"
                    className={isTelegramMiniApp ? 'min-h-[420px] rounded-xl' : 'min-h-[810px] rounded-xl'}
                  />
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    {isTelegramMiniApp ? (
                      <div className="grid grid-cols-4 gap-2">
                        {pagedInventory.map((item, index) => {
                          if (!item || !item.id) return null;
                          return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" compactContent className={miniUpgradeIconCardClass} />;
                        })}
                      </div>
                    ) : (
                      <ItemGrid className="auto-rows-max gap-3">
                        {pagedInventory.map((item, index) => {
                          if (!item || !item.id) return null;
                          return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" />;
                        })}
                      </ItemGrid>
                    )}
                    <Pagination
                      className="mt-2.5 pb-2.5 flex-shrink-0"
                      currentPage={inventoryPage}
                      totalPages={inventoryTotalPages}
                      onPageChange={setInventoryPage}
                    />
                  </div>
                )}
              </div>
            )}

            {tab === 'expired' && (
              <div className="flex flex-col h-full min-h-0">
                {groupedExpired.length === 0 ? (
                  <EmptyState
                    icon={<Package size={48} />}
                    message="No expired tokens"
                    className={isTelegramMiniApp ? 'min-h-[420px] rounded-xl' : 'min-h-[810px] rounded-xl'}
                  />
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    {claimError && (
                      <div className="text-[11px] uppercase tracking-widest text-red-400 text-center mb-2">
                        {claimError}
                      </div>
                    )}
                    {isTelegramMiniApp ? (
                      <div className="grid grid-cols-4 gap-2">
                        {pagedExpired.map((item, index) => {
                          const caseInfo = item.caseId ? casesById.get(item.caseId) : undefined;
                          const tokenAddress = caseInfo?.tokenAddress || '';
                          const canClaim = Boolean(isEditable && onClaimToken && item.caseId && tokenAddress);
                          const isClaiming = claimingCaseId === item.caseId;
                          return (
                            <div key={`${item.id}-${index}`} className="flex flex-col gap-1">
                              <ItemCard item={item} size="sm" currencyPrefix="$" compactContent className={miniUpgradeIconCardClass} />
                              <button
                                type="button"
                                onClick={() => handleClaimToken(item.caseId)}
                                disabled={!canClaim || isClaiming}
                                className={`w-full text-[8px] uppercase tracking-widest rounded-md px-1.5 py-1.5 border transition ${
                                  canClaim
                                    ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black border-transparent'
                                    : 'bg-gray-700/50 text-gray-400 border-white/[0.08]'
                                } ${isClaiming ? 'opacity-70 cursor-wait' : ''}`}
                              >
                                {canClaim ? (isClaiming ? 'Claiming...' : 'Claim') : 'Not available'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <ItemGrid className="auto-rows-max gap-3">
                        {pagedExpired.map((item, index) => {
                          const caseInfo = item.caseId ? casesById.get(item.caseId) : undefined;
                          const tokenAddress = caseInfo?.tokenAddress || '';
                          const canClaim = Boolean(isEditable && onClaimToken && item.caseId && tokenAddress);
                          const isClaiming = claimingCaseId === item.caseId;
                          return (
                            <div key={`${item.id}-${index}`} className="flex flex-col items-center gap-2">
                              <ItemCard item={item} size="sm" currencyPrefix="$" />
                              <div className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 px-2">
                                <span className="truncate">Token {tokenAddress ? formatAddress(tokenAddress) : 'N/A'}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyAddress(tokenAddress)}
                                  disabled={!tokenAddress}
                                  className={`px-2 py-1 rounded-md border transition ${
                                    tokenAddress
                                      ? 'border-white/[0.12] text-gray-300 hover:text-white hover:border-web3-accent/40'
                                      : 'border-white/[0.08] text-gray-600 cursor-not-allowed'
                                  }`}
                                >
                                  Copy
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClaimToken(item.caseId)}
                                disabled={!canClaim || isClaiming}
                                className={`w-full text-[10px] uppercase tracking-widest rounded-lg px-3 py-2 border transition ${
                                  canClaim
                                    ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black border-transparent hover:scale-105'
                                    : 'bg-gray-700/50 text-gray-400 border-white/[0.08]'
                                } ${isClaiming ? 'opacity-70 cursor-wait' : ''}`}
                              >
                                {canClaim ? (isClaiming ? 'Claiming...' : 'Claim') : 'Not available'}
                              </button>
                            </div>
                          );
                        })}
                      </ItemGrid>
                    )}
                    <Pagination
                      className="mt-2.5 pb-2.5 flex-shrink-0"
                      currentPage={expiredPage}
                      totalPages={expiredTotalPages}
                      onPageChange={setExpiredPage}
                    />
                        </div>
                )}
                        </div>
            )}

            {tab === 'claimed' && (
              <div className="flex flex-col h-full min-h-0">
                {groupedClaimed.length === 0 ? (
                  <EmptyState
                    icon={<Package size={48} />}
                    message="No claimed tokens"
                    className={isTelegramMiniApp ? 'min-h-[420px] rounded-xl' : 'min-h-[810px] rounded-xl'}
                  />
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    {isTelegramMiniApp ? (
                      <div className="grid grid-cols-4 gap-2">
                        {pagedClaimed.map((item, index) => {
                          if (!item || !item.id) return null;
                          return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" currencyPrefix="$" compactContent className={miniUpgradeIconCardClass} />;
                        })}
                      </div>
                    ) : (
                      <ItemGrid className="auto-rows-max gap-3">
                        {pagedClaimed.map((item, index) => {
                          if (!item || !item.id) return null;
                          return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" currencyPrefix="$" />;
                        })}
                      </ItemGrid>
                    )}
                    <Pagination
                      className="mt-2.5 pb-2.5 flex-shrink-0"
                      currentPage={claimedPage}
                      totalPages={claimedTotalPages}
                      onPageChange={setClaimedPage}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Burnt Items Tab */}
            {tab === 'burnt' && (
              <div className="flex flex-col h-full min-h-0">
                {(!burntItems || burntItems.length === 0) ? (
                  <EmptyState
                    icon={<Package size={48} />}
                    message="No burnt items"
                    className={isTelegramMiniApp ? 'min-h-[420px] rounded-xl' : 'min-h-[810px] rounded-xl'}
                  />
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    {isTelegramMiniApp ? (
                      <div className="grid grid-cols-4 gap-2">
                        {pagedBurnt.map((item, index) => {
                          if (!item || !item.id) return null;
                          return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" status="burnt" compactContent className={miniUpgradeIconCardClass} />;
                        })}
                      </div>
                    ) : (
                      <ItemGrid className="auto-rows-max gap-3">
                        {pagedBurnt.map((item, index) => {
                          if (!item || !item.id) return null;
                          return <ItemCard key={`${item.id}-${index}`} item={item} size="sm" status="burnt" />;
                        })}
                      </ItemGrid>
                    )}
                    <Pagination
                      className="mt-2.5 pb-2.5 flex-shrink-0"
                      currentPage={burntPage}
                      totalPages={burntTotalPages}
                      onPageChange={setBurntPage}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Battle History Tab */}
            {tab === 'battles' && (
              <div className="flex flex-col h-full min-h-0">
                {(!battleHistory || battleHistory.length === 0) ? (
                  <EmptyState
                    icon={<Swords size={48} />}
                    message="No combat history"
                    className={isTelegramMiniApp ? 'min-h-[420px] rounded-xl' : 'min-h-[810px] rounded-xl'}
                  />
                ) : (
                  <div className="flex flex-col h-full justify-between">
                    <div className={`grid gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 content-start ${isTelegramMiniApp ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
                      {pagedBattleHistory.map((battle) => {
                        if (!battle || !battle.id) return null;
                        try {
                    const winningsByCategory = (battle.wonItems || []).reduce((acc, item) => {
                            if (!item || !item.currency) return acc;
                            const value = Number(item.value) || 0;
                            acc[item.currency] = (acc[item.currency] || 0) + value;
                            return acc;
                          }, {} as Record<string, number>);
                          const opponentItems = battle.opponentWonItems || battle.lostItems || [];
                          const opponentByCategory = opponentItems.reduce((acc, item) => {
                            if (!item || !item.currency) return acc;
                            const value = Number(item.value) || 0;
                            acc[item.currency] = (acc[item.currency] || 0) + value;
                      return acc;
                    }, {} as Record<string, number>);
                    
                    const hasWinnings = Object.keys(winningsByCategory).length > 0;
                          const hasOpponentWinnings = Object.keys(opponentByCategory).length > 0;
                          const cost = Number(battle.cost) || 0;
                          const modeLabel = String(battle.mode || '').toUpperCase() === 'PVP' ? 'PVP' : 'BOT';
                          const wonLen = (battle.wonItems || []).length;
                          const fromStored = Number(battle.roundCount) || Number(battle.caseCount) || 0;
                          const inferredWinRounds =
                            battle.result === 'WIN' && wonLen >= 2 ? Math.floor(wonLen / 2) : 0;
                          const roundsLabel = Math.max(1, fromStored || inferredWinRounds || 1);
                          const topWonItems = (battle.wonItems || []).slice(0, 4);
                          const extraWonItems = Math.max(0, (battle.wonItems || []).length - topWonItems.length);
                          const opponentName = String(battle.opponent || 'Unknown');
                          const opponentAvatar = getUserAvatarByName?.(opponentName);
                          const canOpenOpponentProfile = Boolean(
                            onSelectUser &&
                              opponentName &&
                              opponentName.toLowerCase() !== 'unknown'
                          );

                    return (
                            <div
                              key={battle.id}
                              className={`bg-black/15 backdrop-blur-2xl p-4 rounded-xl border transition-colors ${
                                battle.result === 'WIN'
                                  ? 'border-web3-success/25 hover:border-web3-success/40'
                                  : 'border-red-500/20 hover:border-red-500/35'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                                  {canOpenOpponentProfile ? (
                                    <button
                                      type="button"
                                      onClick={() => onSelectUser?.(opponentName)}
                                      className={`w-10 h-10 rounded-full overflow-hidden border-2 flex items-center justify-center transition ${
                                        battle.result === 'WIN'
                                          ? 'border-web3-success/45 hover:border-web3-success/70'
                                          : 'border-red-500/45 hover:border-red-500/70'
                                      }`}
                                      title={`Open ${opponentName} profile`}
                                    >
                                      {opponentAvatar ? (
                                        <ImageWithMeta src={opponentAvatar} className="w-full h-full" />
                                      ) : (
                                        <div className="w-full h-full bg-black/40 flex items-center justify-center">
                                          <UserIcon size={16} className="text-gray-300" />
                                        </div>
                                      )}
                                    </button>
                                  ) : (
                                    <div className={`w-10 h-10 rounded-full overflow-hidden border-2 flex items-center justify-center ${
                                      battle.result === 'WIN'
                                        ? 'border-web3-success/45 bg-green-900/15'
                                        : 'border-red-500/45 bg-red-900/15'
                                    }`}>
                                      {opponentAvatar ? (
                                        <ImageWithMeta src={opponentAvatar} className="w-full h-full" />
                                      ) : (
                                        <UserIcon size={16} className="text-gray-300" />
                                      )}
                          </div>
                                  )}
                          <div>
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">
                                      {modeLabel} • {roundsLabel} rounds
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                      {(user?.username || 'YOU').toUpperCase()} vs {opponentName}
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                      {formatBattleTime(battle.timestamp)}
                                    </div>
                          </div>
                        </div>
                        
                                <div className={`text-xs font-black px-2 py-1 rounded-md border ${
                                  battle.result === 'WIN'
                                    ? 'text-web3-success border-web3-success/30 bg-web3-success/10'
                                    : 'text-red-400 border-red-500/30 bg-red-500/10'
                                }`}>
                                  {battle.result === 'WIN' ? 'WIN' : 'LOSS'}
                                </div>
                              </div>

                              <div className="mt-3 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-widest text-gray-500">Table stake</div>
                                <div className="font-mono text-sm font-bold text-gray-300">{cost.toFixed(2)} ₮</div>
                              </div>

                              <div className="mt-3">
                                {battle.result === 'WIN' ? (
                                  <>
                                    <div className="text-[10px] uppercase tracking-widest text-web3-success mb-2">
                                      Received tokens
                                    </div>
                                    {hasWinnings ? (
                                      <div className="flex flex-wrap gap-2">
                                        {Object.entries(winningsByCategory).map(([currency, amount]) => (
                                          <div key={currency} className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-web3-success/20">
                                            <span className="text-xs font-mono font-bold text-white">{formatTokenValue(amount)}</span>
                                            <span className="text-[10px] font-bold text-web3-accent">${currency}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                                      <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                                        Win without token details
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="text-[10px] uppercase tracking-widest text-red-400 mb-2">
                                      Loss
                                    </div>
                                    {hasOpponentWinnings ? (
                                      <>
                                        <div className="text-[11px] text-gray-400 mb-2">
                                          Opponent received:
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {Object.entries(opponentByCategory).map(([currency, amount]) => (
                                            <div key={currency} className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-red-500/20">
                                              <span className="text-xs font-mono font-bold text-white">{formatTokenValue(amount)}</span>
                                              <span className="text-[10px] font-bold text-red-300">${currency}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-[11px] text-gray-400">
                                        You did not receive tokens in this battle.
                            </div>
                          )}
                                  </>
                                )}
                              </div>

                              {battle.result === 'WIN' && (
                                <div className="mt-3">
                                  <>
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                                      Loot items
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                      {topWonItems.map((item, idx) => (
                                        <div key={`${battle.id}-won-${item.id || idx}`} className="text-[10px] px-2 py-1 rounded-md bg-black/35 border border-white/[0.08] text-gray-300 truncate max-w-[120px]">
                                          {(item.name || item.currency || 'Item').toUpperCase()}
                                        </div>
                                      ))}
                                      {extraWonItems > 0 && (
                                        <div className="text-[10px] px-2 py-1 rounded-md bg-black/35 border border-white/[0.08] text-gray-400">
                                          +{extraWonItems} more
                            </div>
                          )}
                        </div>
                                  </>
                                </div>
                              )}
                      </div>
                    );
                        } catch (error) {
                          console.error('Error rendering battle:', error, battle);
                          return null;
                        }
                      })}
                    </div>
                    <Pagination
                      className="mt-2.5 pb-2.5 flex-shrink-0"
                      currentPage={battlePage}
                      totalPages={battleTotalPages}
                      onPageChange={setBattlePage}
                    />
                  </div>
                )}
              </div>
            )}
      </div>

      {isEditable && isSettingsOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 animate-fade-in overflow-y-auto py-4">
          <div className="w-[92%] max-w-md bg-web3-card/95 border border-white/[0.12] rounded-3xl px-8 py-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] animate-scale-in my-auto">
            <div className="text-xs uppercase tracking-widest text-gray-500">Profile Settings</div>
            <div className="text-2xl font-black text-white mt-1">Edit Profile</div>

            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Avatar</div>
              <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/[0.12] cursor-pointer hover:border-web3-accent/50 transition">
                <div className="w-10 h-10 rounded-full bg-gray-800 border border-white/[0.12] overflow-hidden flex items-center justify-center">
                  {avatarPreview || user?.avatar ? (
                    <ImageWithMeta
                      src={avatarPreview || user.avatar || ''}
                      meta={avatarMeta}
                      className="w-full h-full"
                    />
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
              {(avatarPreview || user?.avatar) && (
                <div className="mt-3 flex items-center justify-end">
                  <button
                    onClick={() => setIsAvatarAdjustOpen(true)}
                    className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.12] text-[10px] uppercase tracking-widest text-gray-300 hover:text-white"
                  >
                    Adjust Display
                  </button>
                </div>
              )}
              {avatarError && (
                <div className="mt-2 text-[10px] uppercase tracking-widest text-red-400">{avatarError}</div>
              )}
            </div>

            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Display Name</div>
              <div className="flex items-center gap-2">
                <input
                  value={editName}
                  onChange={(e) =>
                    setEditName(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
                  }
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

      <ImageAdjustModal
        open={isAvatarAdjustOpen && Boolean(avatarPreview || user?.avatar)}
        src={(avatarPreview || user?.avatar || '') as string}
        initialMeta={avatarMeta}
        defaultMeta={{ fit: 'cover', scale: 1, x: 0, y: 0 }}
        shape="circle"
        title="Avatar Display"
        onClose={() => setIsAvatarAdjustOpen(false)}
        onSave={(nextMeta) => {
          setAvatarMeta(nextMeta);
          setIsAvatarAdjustOpen(false);
          handleSaveAvatarMeta(nextMeta);
        }}
      />

      {isUploadingAvatar && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[280px] rounded-2xl border border-white/[0.08] bg-[#0B1018] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <UploadCloud size={20} className="text-web3-accent animate-pulse" />
              <span className="text-sm font-bold text-white">Uploading Avatar</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-web3-accent to-web3-success transition-all duration-300 ease-out"
                style={{ width: `${avatarUploadProgress}%` }}
              />
            </div>
            <div className="text-xs tabular-nums text-gray-400 text-right mb-5">
              {avatarUploadProgress}%
            </div>
            <button
              type="button"
              onClick={cancelAvatarUpload}
              className="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-semibold text-red-400 active:scale-[0.97] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {showClaimOverlay && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[320px] rounded-2xl border border-white/[0.08] bg-[#0B1018] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-web3-accent/10 border border-web3-accent/20 flex items-center justify-center">
                <Rocket size={20} className="text-web3-accent animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Claiming Tokens</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Please wait</div>
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-white/[0.06] overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${claimProgress}%`,
                  background: claimProgress === 100
                    ? 'linear-gradient(90deg, #10B981, #66FCF1)'
                    : 'linear-gradient(90deg, #66FCF1, #8B5CF6)',
                }}
              />
            </div>

            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 truncate">{claimStage}</span>
              <span className="text-xs font-mono text-web3-accent tabular-nums ml-2">{claimProgress}%</span>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-web3-accent animate-pulse" />
                <span className="text-[10px] text-gray-500">This may take a moment</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
