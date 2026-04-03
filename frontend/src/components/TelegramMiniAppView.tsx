import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ChevronLeft,
  Coins,
  ExternalLink,
  MessageCircle,
  PlusCircle,
  Sparkles,
  Swords,
  UserCircle2,
  Wallet,
} from 'lucide-react';
import { parseEther } from 'ethers';
import { Case, Item, Rarity, User } from '../types';
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

type EarlyAccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
interface EarlyAccessStatusPayload {
  canSubmit: boolean;
  blockReason:
    | 'PENDING_REVIEW'
    | 'ALREADY_APPROVED'
    | 'ALREADY_EARLY_ACCESS'
    | 'ADMIN_ACCOUNT'
    | 'SUPPORT_ACCOUNT'
    | 'REFERRAL_SIGNUP'
    | null;
  request: {
    id: string;
    topic: 'EARLY_ACCESS';
    status: EarlyAccessRequestStatus;
    contact: string;
    message: string;
    createdAt: string;
    reviewedAt: string | null;
  } | null;
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
  isActivitiesEnabled: boolean;
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
  onSubmitEarlyAccess: (payload: { contact: string; message: string }) => Promise<void>;
  earlyAccessSubmitting: boolean;
  earlyAccessStatus: EarlyAccessStatusPayload | null;
  onAuthenticate: () => Promise<void> | void;
  onDevAuthenticate?: () => Promise<void> | void;
  onOpenTelegramBot?: () => Promise<void> | void;
  onLinkWallet: (wallet?: TelegramWalletOption) => Promise<void> | void;
  walletDeepLink?: string | null;
  onOpenHome: () => void;
  externalProvider?: any;
  onConnectWalletForTopUp?: () => Promise<any>;
}

type MiniTab = 'cases' | 'create' | 'upgrade' | 'battle' | 'profile' | 'topup' | 'early';

type TabDef = { id: MiniTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

const BASE_TABS: TabDef[] = [
  { id: 'cases', label: 'Cases', icon: Boxes },
  { id: 'create', label: 'Create', icon: PlusCircle },
  { id: 'upgrade', label: 'Upgrade', icon: Coins },
  { id: 'battle', label: 'Battle', icon: Swords },
  { id: 'profile', label: 'Profile', icon: UserCircle2 },
];

const EARLY_TAB: TabDef = { id: 'early', label: 'Access', icon: Sparkles };

const SECONDARY_TITLES: Partial<Record<MiniTab, string>> = {
  topup: 'Top Up',
  early: 'Early Access',
};

const getEarlyBlockMessage = (reason: EarlyAccessStatusPayload['blockReason']) => {
  switch (reason) {
    case 'PENDING_REVIEW': return 'Your request is currently under review.';
    case 'ALREADY_APPROVED': return 'Your request has already been approved.';
    case 'ALREADY_EARLY_ACCESS': return 'You already have early access.';
    case 'ADMIN_ACCOUNT': return 'Administrators cannot submit early access requests.';
    case 'SUPPORT_ACCOUNT': return 'Support accounts cannot submit early access requests.';
    case 'REFERRAL_SIGNUP':
      return 'Referral signups get early access automatically after the first confirmed on-chain deposit. No application is required.';
    default: return 'Early access request is currently unavailable.';
  }
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
  isActivitiesEnabled,
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
  onSubmitEarlyAccess,
  earlyAccessSubmitting,
  earlyAccessStatus,
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
  const [earlyContact, setEarlyContact] = useState('');
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 3400);
    return () => clearTimeout(timer);
  }, []);
  const [earlyMessage, setEarlyMessage] = useState('');
  const [earlyNotice, setEarlyNotice] = useState<string | null>(null);
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
    if (!isAuthenticated || !isActivitiesEnabled) return;
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
  }, [isAuthenticated, isActivitiesEnabled, user.id, activeTab]);

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

  const needsEarlyAccess = !isActivitiesEnabled
    && earlyAccessStatus?.blockReason !== 'ALREADY_APPROVED'
    && earlyAccessStatus?.blockReason !== 'ALREADY_EARLY_ACCESS';

  const primaryTabs = useMemo(() => {
    return needsEarlyAccess ? [...BASE_TABS, EARLY_TAB] : BASE_TABS;
  }, [needsEarlyAccess]);

  const isSecondaryTab = activeTab === 'topup';

  const goToTab = (tab: MiniTab) => {
    if (primaryTabs.find((t) => t.id === tab)) setLastPrimaryTab(tab);
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

  // ── Early access ─────────────────────────────────────────────────────────────
  const canSubmitEarly = Boolean(earlyAccessStatus?.canSubmit ?? true);
  const earlyBlockMessage = canSubmitEarly ? null : getEarlyBlockMessage(earlyAccessStatus?.blockReason || null);

  const submitEarlyAccess = async () => {
    setEarlyNotice(null);
    const contact = earlyContact.trim();
    const message = earlyMessage.trim();
    if (!contact) { setEarlyNotice('Telegram contact is required.'); return; }
    if (!message || message.length > 200) { setEarlyNotice('Message must be 1–200 characters.'); return; }
    try {
      await onSubmitEarlyAccess({ contact, message });
      setEarlyNotice('Request sent successfully.');
      setEarlyMessage('');
    } catch (err: any) { setEarlyNotice(err?.message || 'Failed to send request.'); }
  };

  // ── Tab content ──────────────────────────────────────────────────────────────
  const renderTabContent = () => {
    if (activeTab === 'cases') return (
      <CaseView
        cases={cases} onOpenCase={onOpenCase} balance={balance}
        onOpenTopUp={onOpenTopUp} userName={user.username}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin={isActivitiesEnabled} isTelegramMiniApp
      />
    );

    if (activeTab === 'create') return (
      <CreateCaseView
        onCreate={(newCase) => { onCreateCase(newCase); goToTab('cases'); setSuccessToast(`Case "${newCase.name}" created!`); setTimeout(() => setSuccessToast(null), 4000); }}
        creatorName={user.username} balance={balance}
        onOpenTopUp={() => goToTab('topup')} onBalanceUpdate={onBalanceUpdate}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin={isActivitiesEnabled} cases={cases} isTelegramMiniApp
      />
    );

    if (activeTab === 'upgrade') return (
      <UpgradeView
        inventory={activeInventory} onUpgrade={onUpgrade}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin={isActivitiesEnabled} isTelegramMiniApp
      />
    );

    if (activeTab === 'battle') return (
      <BattleView
        cases={activeCases} userName={user.username}
        userAvatar={user.avatar} userAvatarMeta={user.avatarMeta}
        onBattleFinish={onBattleFinish} balance={balance}
        onChargeBattle={onChargeBattle} onOpenTopUp={onOpenTopUp}
        isAuthenticated={isAuthenticated} onOpenWalletConnect={onOpenWalletConnect}
        isAdmin={isActivitiesEnabled} isTelegramMiniApp
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
          telegramBotUsername="casefun_bot"
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

    // Early access
    return (
      <div className="space-y-3">
        {!canSubmitEarly && (
          <div className="px-4 py-3 rounded-xl border border-amber-400/25 bg-amber-400/5 text-amber-300 text-sm">
            {earlyBlockMessage}
          </div>
        )}
        <div className="rounded-2xl p-4 space-y-3 border border-white/[0.06] bg-black/20">
          <input
            value={earlyContact} onChange={(e) => setEarlyContact(e.target.value)}
            placeholder="@telegram_username"
            className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-web3-accent/40"
          />
          <textarea
            value={earlyMessage} onChange={(e) => setEarlyMessage(e.target.value.slice(0, 200))}
            placeholder="Tell us why you need early access…" rows={4}
            className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-web3-accent/40 resize-none"
          />
          <div className="text-xs text-gray-500">
            {200 - earlyMessage.length} chars remaining
          </div>
          {earlyNotice && <div className="text-sm text-gray-300">{earlyNotice}</div>}
          <button
            type="button" onClick={submitEarlyAccess}
            disabled={earlyAccessSubmitting || !canSubmitEarly}
            className="w-full py-3.5 rounded-xl text-sm font-black disabled:opacity-50 active:scale-[0.98] transition bg-gradient-to-r from-web3-accent to-web3-success text-black"
          >
            {earlyAccessSubmitting ? 'Sending…' : 'Submit Request'}
          </button>
        </div>
      </div>
    );
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
      <div className="shrink-0 flex items-center gap-3 px-4" style={{ height: '52px' }}>
        {isSecondaryTab ? (
          <button
            type="button" onClick={() => goToTab(lastPrimaryTab)}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/[0.05] active:bg-white/[0.1] transition"
          >
            <ChevronLeft size={18} className="text-gray-300" />
          </button>
        ) : (
          <div className="w-8 h-8 shrink-0 rounded-xl overflow-hidden border border-white/[0.08]">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-black bg-web3-accent/10 text-web3-accent">
                {(user.username || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-white truncate">
            {isSecondaryTab ? SECONDARY_TITLES[activeTab] : (user.username || 'User')}
          </div>
        </div>

        <button
          type="button" onClick={() => goToTab('topup')}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 transition"
          style={{ background: 'rgba(102,252,241,0.08)', border: '1px solid rgba(102,252,241,0.15)' }}
        >
          <Wallet size={14} className="text-web3-accent" />
          <span className="text-[13px] font-black tabular-nums text-web3-accent">
            {Number(balance || 0).toFixed(2)}
          </span>
        </button>
      </div>

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
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id} type="button"
                onClick={() => goToTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl active:scale-95 transition-all duration-150 select-none"
                style={active ? { background: 'rgba(102,252,241,0.08)' } : undefined}
              >
                <span className="flex transition-colors duration-150" style={{ color: active ? '#66FCF1' : '#4b5563' }}>
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span
                  className="text-[10px] font-semibold leading-none mt-0.5 transition-colors duration-150"
                  style={{ color: active ? '#66FCF1' : '#4b5563' }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Shell>
  );
};
