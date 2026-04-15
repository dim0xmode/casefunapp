import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ChevronLeft,
  Coins,
  Copy,
  ExternalLink,
  Gift,
  Lock,
  PlusCircle,
  Rocket,
  Swords,
  UserCircle2,
  Wallet,
} from 'lucide-react';
import { parseEther } from 'ethers';
import { Case, Item, Rarity, RewardClaimRecord, RewardTask, User } from '../types';
import { getLevelInfo, formatCfp } from '../utils/number';
import { api } from '../services/api';
import type { TelegramWalletOption } from '../utils/walletConnect';
import { CaseView } from './CaseView';
import { CreateCaseView } from './CreateCaseView';
import { UpgradeView } from './UpgradeView';
import { BattleView } from './BattleView';
import { ProfileView } from './ProfileView';

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
}

interface TelegramMiniAppViewProps {
  user: User;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isDevAuthenticating?: boolean;
  showDevLogin?: boolean;
  authError: string | null;
  isLinkingWallet: boolean;
  cases: Case[];
  inventory: Item[];
  burntItems: Item[];
  claimedItems: Item[];
  battleHistory: BattleRecord[];
  balance: number;
  onCreateCase: (caseData: Case) => void;
  onOpenCase: (caseId: string, count: number) => Promise<Item[]>;
  onUpgrade: (originalItems: Item[], multiplier: number) => Promise<{ success: boolean; targetValue: number }>;
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
  onChargeBattle: (caseIds: string[], battleProof?: string | null) => Promise<boolean>;
  onOpenTopUp: (prefillUsdt?: number) => void;
  onBalanceUpdate?: (balance: number) => void;
  onOpenWalletConnect: () => void;
  onClaimToken: (caseId: string) => Promise<void>;
  onSelectUser?: (username: string) => void;
  getUserAvatarByName?: (username: string) => string | undefined;
  onUpdateUsername?: (username: string) => Promise<void> | void;
  onUploadAvatar?: (file: File, meta?: Record<string, any>) => Promise<string | void> | string | void;
  onUpdateAvatarMeta?: (meta: Record<string, any>) => Promise<void> | void;
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
  onAuthenticate: () => Promise<void> | void;
  onDevAuthenticate?: () => Promise<void> | void;
  onOpenTelegramBot?: () => Promise<void> | void;
  onLinkWallet: (wallet?: TelegramWalletOption) => Promise<void> | void;
  walletDeepLink?: string | null;
  onOpenHome: () => void;
  externalProvider?: any;
  onConnectWalletForTopUp?: () => Promise<any>;
}

type MiniTab = 'cases' | 'create' | 'upgrade' | 'rewards' | 'battle' | 'profile' | 'topup';

type TabDef = {
  id: MiniTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

const BASE_TABS: TabDef[] = [
  { id: 'cases', label: 'Cases', icon: Boxes },
  { id: 'create', label: 'Create', icon: PlusCircle },
  { id: 'upgrade', label: 'Upgrade', icon: Coins },
  { id: 'battle', label: 'Battle', icon: Swords },
  { id: 'profile', label: 'Profile', icon: UserCircle2 },
  { id: 'rewards', label: 'Rewards', icon: Gift },
];

const SECONDARY_TITLES: Partial<Record<MiniTab, string>> = {
  topup: 'Top Up',
};

const resolveCaseExpiresAt = (caseData?: Pick<Case, 'openDurationHours' | 'createdAt'> | null) => {
  if (!caseData?.openDurationHours || !caseData?.createdAt) return null;
  const createdAt = Number(caseData.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  return createdAt + Number(caseData.openDurationHours) * 60 * 60 * 1000;
};

const normalizeRarity = (value: unknown) => {
  if (typeof value === 'string' && Object.values(Rarity).includes(value as Rarity)) return value as Rarity;
  return Rarity.COMMON;
};

const toProfileItem = (item: Item): Item => ({ ...item, rarity: normalizeRarity(item.rarity) });

// ─── Telegram helpers ────────────────────────────────────────────────────────
const initTelegramApp = () => {
  try {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;
    if (typeof tg.ready === 'function') tg.ready();
    if (typeof tg.expand === 'function') tg.expand();
    if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0B0C10');
    if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0B0C10');
  } catch { /* ignore */ }
};

// ─── Shared layout wrappers ───────────────────────────────────────────────────

/** Full-screen fixed shell — works regardless of parent height chain */
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="fixed inset-0 flex flex-col z-[10] overflow-hidden"
    style={{ background: '#0B0C10' }}
  >
    <div className="absolute inset-0 pointer-events-none" style={{
      background: [
        'radial-gradient(ellipse 90% 55% at 50% -12%, rgba(102,252,241,0.10) 0%, transparent 55%)',
        'radial-gradient(ellipse 70% 50% at 85% 100%, rgba(139,92,246,0.07) 0%, transparent 50%)',
        'radial-gradient(ellipse 50% 45% at 10% 60%, rgba(16,185,129,0.05) 0%, transparent 50%)',
      ].join(', '),
    }} />
    <div className="relative z-[1] flex flex-col flex-1 overflow-hidden">
      {children}
    </div>
  </div>
);

const CenteredShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Shell>
    <div className="flex-1 flex items-center justify-center p-5 overflow-y-auto">
      {children}
    </div>
  </Shell>
);

const SplashScreen: React.FC = () => (
  <Shell>
    {/* Decorative glow orbs — match main site background feel */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute w-[340px] h-[340px] rounded-full blur-[100px] animate-pulse-slow" style={{ top: '-80px', right: '-40px', background: 'rgba(102,252,241,0.12)' }} />
      <div className="absolute w-[280px] h-[280px] rounded-full blur-[90px] animate-pulse-slow" style={{ bottom: '-60px', left: '-30px', background: 'rgba(139,92,246,0.09)', animationDelay: '1.5s' }} />
    </div>

    <div className="relative z-[2] flex-1 flex flex-col items-center justify-center gap-8">
      <div className="animate-scale-in flex flex-col items-center gap-3">
        <div className="text-6xl font-black tracking-[0.2em]">
          <span className="text-white/95">CASE</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">FUN</span>
        </div>
        <div className="text-[10px] font-semibold tracking-[0.3em] text-web3-accent/60 uppercase animate-fade-in">Open&nbsp;&nbsp;·&nbsp;&nbsp;Win&nbsp;&nbsp;·&nbsp;&nbsp;Collect</div>
      </div>

      <div className="w-48 h-[3px] rounded-full bg-white/[0.06] overflow-hidden mt-2 animate-fade-in">
        <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-web3-accent to-web3-success animate-loading-bar" />
      </div>
    </div>
  </Shell>
);

export const TelegramMiniAppView: React.FC<TelegramMiniAppViewProps> = ({
  user,
  isAuthenticated,
  isAuthenticating,
  isDevAuthenticating = false,
  showDevLogin = false,
  authError,
  isLinkingWallet,
  cases,
  inventory,
  burntItems,
  claimedItems,
  battleHistory,
  balance,
  onCreateCase,
  onOpenCase,
  onUpgrade,
  onBattleFinish,
  onChargeBattle,
  onOpenTopUp,
  onBalanceUpdate,
  onOpenWalletConnect,
  onClaimToken,
  onSelectUser,
  getUserAvatarByName,
  onUpdateUsername,
  onUploadAvatar,
  onUpdateAvatarMeta,
  onConnectTwitter,
  onDisconnectTwitter,
  twitterBusy = false,
  twitterNotice = null,
  twitterError = null,
  onConnectTelegram,
  onDisconnectTelegram,
  onOpenTelegramMiniApp,
  telegramBusy = false,
  telegramError = null,
  isBackgroundAnimated = true,
  onToggleBackgroundAnimation,
  onAuthenticate,
  onDevAuthenticate,
  onOpenTelegramBot,
  onLinkWallet,
  walletDeepLink: _walletDeepLink = null,
  onOpenHome: _onOpenHome,
  externalProvider: _externalProvider,
  onConnectWalletForTopUp: _onConnectWalletForTopUp,
}) => {
  const [activeTab, setActiveTab] = useState<MiniTab>('cases');
  const [lastPrimaryTab, setLastPrimaryTab] = useState<MiniTab>('cases');
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 3400);
    return () => clearTimeout(timer);
  }, []);
  const [topUpUsdt, setTopUpUsdt] = useState('');
  const [topUpEth, setTopUpEth] = useState('');
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpStatus, setTopUpStatus] = useState<string | null>(null);
  const [topUpPendingHash, setTopUpPendingHash] = useState<string | null>(null);
  const [battleAlert, setBattleAlert] = useState<{ lobbyId: string; hostName: string; joinerName: string; rounds: number; totalCost: number } | null>(null);
  const battleAlertSeenRef = React.useRef<Set<string>>(new Set());

  useEffect(() => { initTelegramApp(); }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await api.getBattleLobbies();
        const lobbies = Array.isArray(res.data?.lobbies) ? res.data.lobbies : [];
        const fresh = lobbies.find((l: any) => {
          if (l?.status !== 'IN_PROGRESS' || !l?.startedAt) return false;
          if (l.hostUserId !== user.id) return false;
          if (activeTab === 'battle') return false;
          const key = `${l.id}:${l.startedAt}`;
          return !battleAlertSeenRef.current.has(key);
        });
        if (!fresh || cancelled) return;
        battleAlertSeenRef.current.add(`${fresh.id}:${fresh.startedAt}`);
        setBattleAlert({
          lobbyId: fresh.id,
          hostName: fresh.hostName || 'Host',
          joinerName: fresh.joinerName || 'Opponent',
          rounds: Array.isArray(fresh.caseIds) ? fresh.caseIds.length : 0,
          totalCost: Number(fresh.totalCost || 0),
        });
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isAuthenticated, user.id, activeTab]);

  useEffect(() => {
    if (!battleAlert) return;
    const timer = setTimeout(() => setBattleAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [battleAlert]);

  const hasWallet = Boolean(user.hasLinkedWallet && user.walletAddress);
  const caseMap = useMemo(() => new Map(cases.map((e) => [e.id, e])), [cases]);

  const activeCases = useMemo(() => {
    const now = Date.now();
    return cases.filter((e) => { const x = resolveCaseExpiresAt(e); return !x || x > now; });
  }, [cases]);

  const activeInventory = useMemo(() => {
    const now = Date.now();
    return inventory.filter((item) => {
      const caseData = item.caseId ? caseMap.get(item.caseId) : null;
      const x = resolveCaseExpiresAt(caseData);
      return !x || x > now;
    });
  }, [inventory, caseMap]);

  const [rewardsSubTab, setRewardsSubTab] = useState<'social' | 'earn' | 'history'>('social');
  const [rewardTasks, setRewardTasks] = useState<RewardTask[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardClaimRecord[]>([]);
  const [rewardPoints, setRewardPoints] = useState(user?.rewardPoints ?? 0);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [activatedTasks, setActivatedTasks] = useState<Set<string>>(() => {
    try { const s = sessionStorage.getItem('cf_activated_tasks'); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });

  const markTaskActivated = useCallback((taskId: string) => {
    setActivatedTasks((prev) => {
      const next = new Set(prev); next.add(taskId);
      try { sessionStorage.setItem('cf_activated_tasks', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  useEffect(() => { setRewardPoints(user?.rewardPoints ?? 0); }, [user?.rewardPoints]);

  const loadRewardTasks = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    setRewardsLoading(true);
    try {
      const res = await api.getRewardTasks();
      setRewardTasks(Array.isArray(res.data?.tasks) ? res.data.tasks : []);
      if (typeof res.data?.totalPoints === 'number') setRewardPoints(res.data.totalPoints);
    } catch {} finally { setRewardsLoading(false); }
  }, [isAuthenticated, user?.id]);

  const loadRewardHistory = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const res = await api.getRewardHistory();
      setRewardHistory(Array.isArray(res.data?.claims) ? res.data.claims : []);
    } catch {}
  }, [isAuthenticated, user?.id]);

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
    } finally { setClaimingTaskId(null); }
  };

  const taskNeedsAction = (task: RewardTask) => !['LINK_TWITTER', 'LINK_TELEGRAM'].includes(task.type);

  const getTaskActionUrl = (task: RewardTask): string | null => {
    if (['LIKE_TWEET', 'REPOST_TWEET', 'COMMENT_TWEET'].includes(task.type)) return task.targetUrl || null;
    if (task.type === 'FOLLOW_TWITTER') return 'https://x.com/casefunnet';
    if (task.type === 'SUBSCRIBE_TELEGRAM') return 'https://t.me/CaseFun_Chat';
    return task.targetUrl || null;
  };

  const openExternalUrl = useCallback((url: string, taskId: string) => {
    markTaskActivated(taskId);
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg) {
      const isTgLink = url.startsWith('https://t.me/');
      if (isTgLink && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(url);
      else if (typeof tg.openLink === 'function') tg.openLink(url);
      else window.open(url, '_blank');
    } else {
      window.open(url, '_blank');
    }
  }, [markTaskActivated]);

  const renderTaskTitle = useCallback((task: RewardTask) => {
    const linkClass = "text-web3-accent underline hover:text-web3-accent/80 cursor-pointer";
    const tweetTypes = ['LIKE_TWEET', 'REPOST_TWEET', 'COMMENT_TWEET'];
    if (task.targetUrl && tweetTypes.includes(task.type)) {
      const verb = task.type === 'LIKE_TWEET' ? 'Like' : task.type === 'REPOST_TWEET' ? 'Repost' : 'Comment on';
      return <>{verb} <span onClick={() => openExternalUrl(task.targetUrl!, task.id)} className={linkClass}>this post</span></>;
    }
    if (task.type === 'FOLLOW_TWITTER') return <>Follow <span onClick={() => openExternalUrl('https://x.com/casefunnet', task.id)} className={linkClass}>@casefunnet</span></>;
    if (task.type === 'SUBSCRIBE_TELEGRAM') return <>Join <span onClick={() => openExternalUrl('https://t.me/CaseFun_Chat', task.id)} className={linkClass}>Telegram channel</span></>;
    return task.title;
  }, [openExternalUrl]);

  const hasActiveRewards = rewardTasks.some((t) => !t.claimed && !t.onCooldown);

  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [referralInvited, setReferralInvited] = useState<number>(user?.referralConfirmedCount ?? 0);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let cancelled = false;
    setReferralLoading(true);
    void (async () => {
      try {
        const r = await api.getReferralCode();
        if (cancelled || !r.data?.code) return;
        setReferralUrl(`https://t.me/casefun_bot?startapp=ref_${encodeURIComponent(r.data.code)}`);
        setReferralInvited(r.data.invitedCount ?? 0);
      } catch (e: any) {
        if (!cancelled) setReferralError(e?.message || 'Failed to load referral link');
      } finally { if (!cancelled) setReferralLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id]);

  const formatLinkedAt = (value?: string | number | null) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const headerCfp = rewardPoints > 0 ? rewardPoints : (user?.rewardPoints ?? 0);
  const headerLvl = getLevelInfo(headerCfp);

  const isSecondaryTab = activeTab === 'topup';

  const goToTab = (tab: MiniTab) => {
    if (BASE_TABS.find((t) => t.id === tab)) setLastPrimaryTab(tab);
    setActiveTab(tab);
  };

  // ── Top-up logic ────────────────────────────────────────────────────────────
  const chainId = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
  const treasuryAddress = String(import.meta.env.VITE_TREASURY_ADDRESS || '');

  useEffect(() => {
    if (activeTab !== 'topup') return;
    let cancelled = false;
    api.getEthPrice()
      .then((r) => { if (!cancelled && r.data?.price) setEthPrice(r.data.price); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleTopUpUsdtChange = (value: string) => {
    const clean = value.replace(/[^\d.,]/g, '');
    setTopUpUsdt(clean); setTopUpStatus(null);
    if (!ethPrice) return;
    const num = Number(clean.replace(/,/g, '.'));
    if (!Number.isFinite(num) || num <= 0) { setTopUpEth(''); return; }
    setTopUpEth((num / ethPrice).toFixed(6));
  };

  const handleTopUpEthChange = (value: string) => {
    const clean = value.replace(/[^\d.,]/g, '');
    setTopUpEth(clean); setTopUpStatus(null);
    if (!ethPrice) return;
    const num = Number(clean.replace(/,/g, '.'));
    if (!Number.isFinite(num) || num <= 0) { setTopUpUsdt(''); return; }
    setTopUpUsdt((num * ethPrice).toFixed(2));
  };

  const pollForDeposit = async (): Promise<boolean> => {
    for (let i = 0; i < 20; i++) {
      try {
        const r = await api.scanDeposit();
        if (r.data?.found && r.data?.pending) {
          setTopUpStatus(`Found! Waiting confirmations (${r.data.confirmations || 0})…`);
          await new Promise((ok) => setTimeout(ok, 5000));
          continue;
        }
        if (r.data?.found && typeof r.data?.balance === 'number') {
          if (onBalanceUpdate) onBalanceUpdate(r.data.balance);
          setTopUpPendingHash(null);
          setTopUpStatus('Top up confirmed!');
          setTopUpUsdt(''); setTopUpEth('');
          return true;
        }
      } catch { /* retry */ }
      await new Promise((ok) => setTimeout(ok, 5000));
    }
    setTopUpStatus('Deposit not found yet — tap "Check" to retry.');
    return false;
  };

  const handleTopUpSubmit = async () => {
    const rawEth = topUpEth.replace(/,/g, '.').trim();
    const ethNum = Number(rawEth);
    if (!Number.isFinite(ethNum) || ethNum <= 0) return;
    if (!treasuryAddress) { setTopUpStatus('Treasury address not configured.'); return; }
    const weiValue = parseEther(rawEth);
    const deepLink = `https://metamask.app.link/send/${treasuryAddress}@${chainId}?value=${weiValue.toString()}`;
    setTopUpBusy(true);
    setTopUpStatus('Opening wallet…');
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg?.openLink) {
      try { tg.openLink(deepLink, { try_instant_view: false }); }
      catch { try { tg.openLink(deepLink); } catch { window.open(deepLink, '_blank'); } }
    } else { window.open(deepLink, '_blank'); }
    setTopUpStatus('Confirm in MetaMask, then return here. Scanning for deposit…');
    setTopUpPendingHash('scanning');
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onReturn);
      setTimeout(() => { void pollForDeposit().finally(() => setTopUpBusy(false)); }, 3000);
    };
    document.addEventListener('visibilitychange', onReturn);
  };

  // ── Tab content ──────────────────────────────────────────────────────────────
  const renderTabContent = () => {
    if (activeTab === 'cases') return (
      <CaseView
        cases={cases} onOpenCase={onOpenCase} balance={balance}
        onOpenTopUp={onOpenTopUp} userName={user.username}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin isTelegramMiniApp
      />
    );

    if (activeTab === 'create') return (
      <CreateCaseView
        onCreate={(newCase) => { onCreateCase(newCase); goToTab('cases'); setSuccessToast(`Case "${newCase.name}" created!`); setTimeout(() => setSuccessToast(null), 4000); }}
        creatorName={user.username} balance={balance}
        onOpenTopUp={() => goToTab('topup')} onBalanceUpdate={onBalanceUpdate}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin cases={cases} isTelegramMiniApp
      />
    );

    if (activeTab === 'upgrade') return (
      <UpgradeView
        inventory={activeInventory} onUpgrade={onUpgrade}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin isTelegramMiniApp
      />
    );

    if (activeTab === 'rewards') return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] text-gray-400">
            Points: <span className="text-web3-accent font-mono font-bold">{formatCfp(rewardPoints)} CFP</span>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setRewardsSubTab('social')} className={`text-[10px] px-2.5 py-1 rounded-md transition ${rewardsSubTab === 'social' ? 'bg-white/[0.08] text-white' : 'text-gray-500'}`}>Social</button>
            <button type="button" onClick={() => setRewardsSubTab('earn')} className={`text-[10px] px-2.5 py-1 rounded-md transition flex items-center gap-1 ${rewardsSubTab === 'earn' ? 'bg-white/[0.08] text-white' : 'text-gray-500'}`}>
              Earn
              {rewardsSubTab !== 'earn' && rewardTasks.some((t) => !t.claimed && !t.onCooldown && !t.locked) && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
            </button>
            <button type="button" onClick={() => { setRewardsSubTab('history'); loadRewardHistory(); }} className={`text-[10px] px-2.5 py-1 rounded-md transition ${rewardsSubTab === 'history' ? 'bg-white/[0.08] text-white' : 'text-gray-500'}`}>History</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
          {/* ── Social: account linking, referrals, promo ── */}
          {rewardsSubTab === 'social' && (
            <div className="space-y-2">
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
                      {formatLinkedAt(user?.twitterLinkedAt) && <span className="text-[10px] text-gray-600 shrink-0">{formatLinkedAt(user?.twitterLinkedAt)}</span>}
                    </div>
                  ) : <div className="text-xs text-gray-600 mt-0.5">Not linked</div>}
                </div>
                <button type="button" onClick={() => user?.twitterId ? onDisconnectTwitter?.() : onConnectTwitter?.()} disabled={twitterBusy} className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg border transition disabled:opacity-40 ${user?.twitterId ? 'border-red-500/25 text-red-400' : 'border-web3-accent/25 text-web3-accent'} ${twitterBusy ? 'opacity-70 cursor-wait' : ''}`}>
                  {twitterBusy ? '…' : user?.twitterId ? 'Disconnect' : 'Connect'}
                </button>
              </div>

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
                      {formatLinkedAt(user?.telegramLinkedAt) && <span className="text-[10px] text-gray-600 shrink-0">{formatLinkedAt(user?.telegramLinkedAt)}</span>}
                    </div>
                  ) : <div className="text-xs text-gray-600 mt-0.5">Not linked</div>}
                </div>
                <button type="button" onClick={() => user?.telegramId ? onDisconnectTelegram?.() : onConnectTelegram?.()} disabled={telegramBusy} className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg border transition disabled:opacity-40 ${user?.telegramId ? 'border-red-500/25 text-red-400' : 'border-web3-accent/25 text-web3-accent'} ${telegramBusy ? 'opacity-70 cursor-wait' : ''}`}>
                  {telegramBusy ? '…' : user?.telegramId ? 'Disconnect' : 'Connect'}
                </button>
              </div>

              <div className="flex flex-col gap-2 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-black/20">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Referrals</div>
                {referralLoading ? <div className="text-xs text-gray-600">Loading…</div> : referralError ? <div className="text-[10px] text-red-400">{referralError}</div> : (
                  <>
                    <div className="text-[11px] text-gray-400 leading-snug">
                      Confirmed invites: <span className="text-white font-bold tabular-nums">{referralInvited}</span>
                      <span className="block mt-1 text-[10px] text-gray-600">Counted after your invitee links both Twitter and Telegram. You earn 8 CFP per referral + 10% of their task rewards.</span>
                    </div>
                    {referralUrl && (
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] text-web3-accent truncate flex-1 font-mono">{referralUrl}</span>
                          <button type="button" onClick={() => { void navigator.clipboard?.writeText(referralUrl).catch(() => {}); }} className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-white/[0.12] text-gray-300 hover:text-white transition">
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        <button type="button" onClick={() => { try { const tg = (window as any)?.Telegram?.WebApp; const text = `Join me on CaseFun! Open crypto cases and win tokens.`; if (typeof tg?.openTelegramLink === 'function') { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(text)}`); } else { window.open(`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(text)}`, '_blank'); } } catch {} }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-web3-accent to-web3-success text-black active:scale-[0.98] transition">
                          <ExternalLink size={12} /> Share via Telegram
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-600 mb-2">
                  <Gift size={11} /> Promo Code
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!promoCode.trim() || promoLoading) return;
                  setPromoLoading(true); setPromoResult(null);
                  try {
                    const res = await api.activatePromo(promoCode.trim().toUpperCase());
                    setPromoResult({ ok: true, msg: `+${res.data?.amount} ₮ added to your balance!` });
                    setPromoCode('');
                    if (onBalanceUpdate && typeof res.data?.balance === 'number') onBalanceUpdate(res.data.balance);
                  } catch (err: any) { setPromoResult({ ok: false, msg: err?.message || 'Failed to activate' }); }
                  finally { setPromoLoading(false); }
                }} className="flex gap-2">
                  <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Enter code" className="flex-1 min-w-0 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-web3-accent/40 font-mono uppercase tracking-wider" />
                  <button type="submit" disabled={!promoCode.trim() || promoLoading} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-40 shrink-0">
                    {promoLoading ? '...' : 'Apply'}
                  </button>
                </form>
                {promoResult && <div className={`mt-1.5 text-[10px] ${promoResult.ok ? 'text-web3-success' : 'text-red-400'}`}>{promoResult.msg}</div>}
              </div>

              {twitterError && <div className="text-[10px] text-red-400">{twitterError}</div>}
              {telegramError && <div className="text-[10px] text-red-400">{telegramError}</div>}
            </div>
          )}

          {/* ── Earn: all reward tasks merged ── */}
          {rewardsSubTab === 'earn' && (() => {
            const allTasks = rewardTasks.filter((t) => !t.claimed);
            const socialTasks = allTasks.filter((t) => (t.category || 'SOCIAL') === 'SOCIAL');
            const cfTasks = allTasks.filter((t) => t.category === 'CASEFUN').sort((a, b) => (a.onCooldown ? 1 : 0) - (b.onCooldown ? 1 : 0));
            const now = Date.now();
            return (
            <div className="space-y-1.5">
              {rewardsLoading && <div className="text-xs text-gray-600">Loading tasks…</div>}
              {!rewardsLoading && allTasks.length === 0 && (
                <div className="text-center py-8">
                  <Gift size={24} className="mx-auto text-gray-600 mb-2" />
                  <div className="text-[11px] text-gray-500">All tasks completed!</div>
                  <div className="text-[10px] text-gray-600 mt-1">More tasks coming soon — stay tuned</div>
                </div>
              )}
              {socialTasks.map((task) => {
                const needsAction = taskNeedsAction(task);
                const isActivated = activatedTasks.has(task.id);
                const showClaim = task.completed && !task.locked && (!needsAction || isActivated);
                const showGo = task.completed && !task.locked && needsAction && !isActivated;
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
                      <button type="button" onClick={() => openExternalUrl(actionUrl, task.id)} className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-web3-accent/40 text-web3-accent active:scale-[0.97] transition flex items-center gap-1">Go <ExternalLink size={10} /></button>
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
              {cfTasks.map((task: any) => {
                const progress = task.progress ?? 0;
                const target = task.targetCount ?? 1;
                const pct = Math.min(100, Math.round((progress / target) * 100));
                const isComplete = progress >= target && !task.onCooldown;
                const isCooldown = task.onCooldown && task.cooldownEndsAt;
                const isDone = task.claimed && !task.onCooldown;
                const timeLabel = task.activeUntil ? `Until ${new Date(task.activeUntil).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}` : 'Always active';
                let cooldownLabel = '';
                if (isCooldown) {
                  const ms = new Date(task.cooldownEndsAt).getTime() - now;
                  if (ms > 0) { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); cooldownLabel = h > 0 ? `${h}h ${m}m` : `${m}m`; }
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
                      {isCooldown ? <span className="text-yellow-500">Next in {cooldownLabel}</span> : isDone ? <span className="text-gray-600">Completed</span> : <span>{pct}%</span>}
                    </div>
                    {isComplete && (
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

          {/* ── History ── */}
          {rewardsSubTab === 'history' && (
            <div className="space-y-1">
              {rewardHistory.length === 0 && <div className="text-xs text-gray-600 text-center py-8">No rewards claimed yet</div>}
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
      </div>
    );

    if (activeTab === 'battle') return (
      <BattleView
        cases={activeCases} userName={user.username}
        userAvatar={user.avatar} userAvatarMeta={user.avatarMeta}
        onBattleFinish={onBattleFinish} balance={balance}
        onChargeBattle={onChargeBattle} onOpenTopUp={onOpenTopUp}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin isTelegramMiniApp
      />
    );

    if (activeTab === 'profile') return (
      <div className="space-y-3">
        <ProfileView
          user={user} inventory={inventory.map(toProfileItem)}
          burntItems={burntItems.map(toProfileItem)} claimedItems={claimedItems.map(toProfileItem)}
          battleHistory={battleHistory} balance={balance} cases={cases}
          isEditable onSelectUser={onSelectUser} getUserAvatarByName={getUserAvatarByName}
          onUpdateUsername={onUpdateUsername} onUploadAvatar={onUploadAvatar}
          onUpdateAvatarMeta={onUpdateAvatarMeta} onClaimToken={onClaimToken}
          onConnectTwitter={onConnectTwitter} onDisconnectTwitter={onDisconnectTwitter}
          twitterBusy={twitterBusy} twitterNotice={twitterNotice} twitterError={twitterError}
          onConnectTelegram={onConnectTelegram} onDisconnectTelegram={onDisconnectTelegram}
          onOpenTelegramMiniApp={onOpenTelegramMiniApp} telegramBusy={telegramBusy}
          telegramError={telegramError} isBackgroundAnimated={isBackgroundAnimated}
          onToggleBackgroundAnimation={onToggleBackgroundAnimation} isTelegramMiniApp
          telegramBotUsername="casefun_bot" onBalanceUpdate={onBalanceUpdate}
        />
      </div>
    );

    if (activeTab === 'topup') {
      const parsedEth = Number(topUpEth.replace(/,/g, '.').trim());
      const canTopUp = Number.isFinite(parsedEth) && parsedEth > 0 && !topUpBusy;
      return (
        <div className="space-y-3">
          {/* Balance card */}
          <div className="rounded-2xl p-4 border border-white/[0.06] bg-black/20">
            <div className="text-xs font-medium mb-1 text-gray-500">
              Current balance
            </div>
            <div className="text-3xl font-black text-white">
              {Number(balance || 0).toFixed(2)} <span className="text-web3-accent">₮</span>
            </div>
          </div>

          {/* Amount inputs */}
          <div className="rounded-2xl p-4 space-y-4 border border-white/[0.06] bg-black/20">
            <div>
              <label className="text-xs font-medium block mb-2 text-gray-500">
                You get (Balance ₮)
              </label>
              <input
                type="text" inputMode="decimal" value={topUpUsdt}
                onChange={(e) => handleTopUpUsdtChange(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] focus:outline-none focus:border-web3-accent/40 text-white font-mono text-lg"
              />
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((a) => (
                  <button
                    key={a} type="button"
                    onClick={() => handleTopUpUsdtChange(String(a))}
                    className="py-2 rounded-xl border border-web3-accent/20 bg-web3-accent/5 text-web3-accent text-xs font-bold hover:bg-web3-accent/15 active:scale-95 transition"
                  >
                    +{a}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div>
              <label className="text-xs font-medium block mb-2 text-gray-500">
                You pay (ETH Sepolia)
              </label>
              <input
                type="text" inputMode="decimal" value={topUpEth}
                onChange={(e) => handleTopUpEthChange(e.target.value)}
                placeholder="0.000000"
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] focus:outline-none focus:border-web3-accent/40 text-white font-mono text-lg"
              />
              <div className="mt-1.5 text-xs text-gray-500">
                {ethPrice ? `1 ETH ≈ ${ethPrice.toFixed(2)} ₮` : 'Loading price…'}
              </div>
            </div>
          </div>

          {topUpStatus && (
            <div className="px-4 py-3 rounded-xl border border-white/[0.06] bg-black/20 text-sm text-gray-300 break-words">
              {topUpStatus}
            </div>
          )}

          {topUpPendingHash ? (
            <button
              type="button"
              onClick={() => { setTopUpBusy(true); pollForDeposit().finally(() => setTopUpBusy(false)); }}
              disabled={topUpBusy}
              className="w-full py-4 rounded-2xl border border-web3-accent/30 bg-web3-accent/10 text-web3-accent text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition"
            >
              {topUpBusy ? 'Scanning…' : 'Check deposit'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTopUpSubmit}
              disabled={!canTopUp}
              className={`w-full py-4 rounded-2xl text-sm font-black disabled:opacity-40 active:scale-[0.98] transition ${
                canTopUp
                  ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black'
                  : 'bg-white/[0.08] text-white/30'
              }`}
            >
              {topUpBusy ? 'Processing…' : 'Top Up via MetaMask'}
            </button>
          )}

          <a href="https://sepolia-faucet.pk910.de/" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-web3-accent transition">
            Need test ETH? Sepolia faucet <ExternalLink size={11} />
          </a>
        </div>
      );
    }

    return null;
  };

  // ── Loading splash — show for at least 2.4 s so users notice it ─────────────
  if (!splashDone || isAuthenticating || isDevAuthenticating) {
    return <SplashScreen />;
  }

  // ── Unauthenticated ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <CenteredShell>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto border border-white/[0.08] bg-web3-accent/10">
              <span className="text-3xl font-black text-web3-accent">CF</span>
            </div>
            <div className="text-2xl font-black text-white">Casefun</div>
            <div className="text-sm text-gray-400">
              Sign in with Telegram to start playing
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button" onClick={() => onAuthenticate()} disabled={isAuthenticating}
              className="w-full py-4 rounded-2xl text-base font-black disabled:opacity-60 active:scale-[0.98] transition bg-gradient-to-r from-web3-accent to-web3-success text-black"
            >
              {isAuthenticating ? 'Authorizing…' : 'Sign In with Telegram'}
            </button>
            {onOpenTelegramBot && (
              <button
                type="button" onClick={() => { if (onOpenTelegramBot) void onOpenTelegramBot(); }}
                className="w-full py-3.5 rounded-2xl border border-white/[0.12] text-sm font-semibold inline-flex items-center justify-center gap-2 active:opacity-70 transition text-gray-200"
              >
                Open in Telegram <ExternalLink size={14} />
              </button>
            )}
            {showDevLogin && (
              <button
                type="button" onClick={() => onDevAuthenticate?.()} disabled={isDevAuthenticating}
                className="w-full py-3 rounded-2xl border border-white/[0.06] text-xs font-medium disabled:opacity-60 transition text-gray-500"
              >
                {isDevAuthenticating ? 'Signing in…' : 'Dev Login'}
              </button>
            )}
          </div>

          {authError && (
            <div className="px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/10 text-sm text-red-300">
              {authError}
            </div>
          )}
        </div>
      </CenteredShell>
    );
  }

  // ── No wallet ────────────────────────────────────────────────────────────────
  if (!hasWallet) {
    return (
      <CenteredShell>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto border border-amber-400/20"
              style={{ background: 'rgba(251, 191, 36, 0.08)' }}
            >
              <Wallet size={32} className="text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white">
              Link your wallet
            </div>
            <div className="text-sm text-gray-400">
              Connect an EVM wallet to start playing
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-3 border border-white/[0.06] bg-black/20">
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-web3-accent">→</span>
                One wallet per account
              </li>
              <li className="flex items-center gap-2">
                <span className="text-web3-accent">→</span>
                Use the same wallet on site and mini app
              </li>
            </ul>
            <button
              type="button" onClick={() => onLinkWallet()} disabled={isLinkingWallet}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black disabled:opacity-60 active:scale-[0.98] transition bg-gradient-to-r from-web3-accent to-web3-success text-black"
            >
              <Wallet size={18} />
              {isLinkingWallet ? 'Connecting…' : 'Connect Wallet'}
            </button>
            <div className="text-center text-xs text-gray-500">
              MetaMask · Trust · OKX · Coinbase · WalletConnect
            </div>
          </div>

          {(authError || telegramError || twitterError) && (
            <div className="px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/10 text-sm text-red-300">
              {authError || telegramError || twitterError}
            </div>
          )}
        </div>
      </CenteredShell>
    );
  }

  // ── Authenticated app shell ──────────────────────────────────────────────────
  return (
    <Shell>
      {/* ── Top bar ── */}
      {isSecondaryTab ? (
        <div className="shrink-0 flex items-center gap-3 px-4" style={{ height: '52px' }}>
          <button type="button" onClick={() => goToTab(lastPrimaryTab)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/[0.05] active:bg-white/[0.1] transition">
            <ChevronLeft size={18} className="text-gray-300" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-white truncate">{SECONDARY_TITLES[activeTab]}</div>
          </div>
          <button type="button" onClick={() => goToTab('topup')} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 transition" style={{ background: 'rgba(102,252,241,0.08)', border: '1px solid rgba(102,252,241,0.15)' }}>
            <Wallet size={14} className="text-web3-accent" />
            <span className="text-[13px] font-black tabular-nums text-web3-accent">{Number(balance || 0).toFixed(2)}</span>
          </button>
        </div>
      ) : (
        <div className="shrink-0 px-3 pt-2 pb-1.5">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => goToTab('profile')} className="shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-web3-accent/40 active:scale-95 transition relative">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-black bg-web3-accent/10 text-web3-accent">
                  {(user.username || 'U')[0].toUpperCase()}
                </div>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-bold text-white truncate">{user.username || 'User'}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-web3-accent/15 to-web3-purple/15 border border-web3-accent/20 text-transparent bg-clip-text bg-gradient-to-r from-web3-accent to-web3-purple" style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundImage: 'linear-gradient(to right, #66FCF1, #8B5CF6)' }}>Lvl {headerLvl.level}</span>
                </div>
                <button type="button" onClick={() => goToTab('topup')} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg active:scale-95 transition" style={{ background: 'rgba(102,252,241,0.08)', border: '1px solid rgba(102,252,241,0.15)' }}>
                  <Wallet size={12} className="text-web3-accent" />
                  <span className="text-[12px] font-black tabular-nums text-web3-accent">{Number(balance || 0).toFixed(2)}</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div key={headerCfp} className="h-full rounded-full bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple" style={{ width: `${headerLvl.progress}%` }} />
                </div>
                <span className="text-[9px] text-gray-500 tabular-nums shrink-0">{headerLvl.isMaxLevel ? 'MAX' : `${headerLvl.xpInLevel}/${headerLvl.xpNeeded}`}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      {successToast && (
        <div className="mx-3 mt-2 px-4 py-3 rounded-xl bg-web3-accent/20 border border-web3-accent/40 text-web3-accent text-xs font-bold flex items-center justify-between animate-fade-in">
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast(null)} className="ml-3 text-web3-accent/60 hover:text-white font-bold">✕</button>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' } as unknown as React.CSSProperties}
      >
        <div className="px-3 pt-2 pb-4">
          {renderTabContent()}
        </div>
      </div>

      {/* Battle alert toast */}
      {battleAlert && (
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem('casefun:focusBattleLobbyId', battleAlert.lobbyId);
            goToTab('battle');
            setBattleAlert(null);
          }}
          className="shrink-0 mx-3 mb-2 px-4 py-3 rounded-xl border border-web3-accent/50 bg-black/90 backdrop-blur-md text-left shadow-[0_0_20px_rgba(102,252,241,0.25)] active:scale-[0.98] transition animate-fade-in"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-web3-accent font-bold">Battle started</span>
          </div>
          <div className="text-sm font-black text-white">{battleAlert.hostName} vs {battleAlert.joinerName}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{battleAlert.rounds} rounds · {Number(battleAlert.totalCost).toFixed(2)} ₮ · Tap to open</div>
        </button>
      )}

      {/* ── Bottom tab bar ── */}
      <div
        className="shrink-0 border-t border-white/[0.04]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', background: 'rgba(11,12,16,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as React.CSSProperties}
      >
        <div className="flex items-end px-1 pt-1 pb-1">
          {BASE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const isRewardsTab = tab.id === 'rewards';
            const showDot = isRewardsTab && !active && hasActiveRewards;
            return (
              <button
                key={tab.id} type="button"
                onClick={() => goToTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl active:scale-95 transition-all duration-150 select-none"
                style={
                  isRewardsTab && active
                    ? { background: 'linear-gradient(135deg, rgba(102,252,241,0.12), rgba(139,92,246,0.08))' }
                    : active ? { background: 'rgba(102,252,241,0.08)' } : undefined
                }
              >
                {isRewardsTab ? (
                  <>
                    <svg width={0} height={0} className="absolute"><defs><linearGradient id="rwdGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#66FCF1" /><stop offset="50%" stopColor="#10B981" /><stop offset="100%" stopColor="#8B5CF6" /></linearGradient></defs></svg>
                    <span className={`relative flex ${!active ? 'animate-glow-pulse' : ''}`} style={{ filter: active ? 'drop-shadow(0 0 6px rgba(102,252,241,0.5))' : undefined }}>
                      <Icon size={22} strokeWidth={active ? 2.2 : 1.8} style={{ stroke: 'url(#rwdGrad)' }} />
                      {showDot && <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    </span>
                    <span className="text-[10px] font-bold leading-none mt-0.5 text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">
                      {tab.label}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="relative flex transition-colors duration-150" style={{ color: active ? '#66FCF1' : '#4b5563' }}>
                      <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                    </span>
                    <span className="text-[10px] font-semibold leading-none mt-0.5 transition-colors duration-150" style={{ color: active ? '#66FCF1' : '#4b5563' }}>
                      {tab.label}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Shell>
  );
};
