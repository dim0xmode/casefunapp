import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ChevronLeft,
  Coins,
  ExternalLink,
  MessageCircle,
  PlusCircle,
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
    options?: { reserveItems?: Item[]; mode?: 'BOT' | 'PVP'; lobbyId?: string | null; opponentName?: string }
  ) => void;
  onChargeBattle: (amount: number) => Promise<boolean>;
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

const PRIMARY_TABS: Array<{
  id: MiniTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'cases', label: 'Cases', icon: Boxes },
  { id: 'create', label: 'Create', icon: PlusCircle },
  { id: 'upgrade', label: 'Upgrade', icon: Coins },
  { id: 'battle', label: 'Battle', icon: Swords },
  { id: 'profile', label: 'Profile', icon: UserCircle2 },
];

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
    if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0B1018');
    if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0B1018');
  } catch { /* ignore */ }
};

// ─── Shared layout wrappers ───────────────────────────────────────────────────

/** Full-screen fixed shell — works regardless of parent height chain */
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="fixed inset-0 flex flex-col z-[10] overflow-hidden"
    style={{ background: 'var(--tg-theme-bg-color, #0B1018)' }}
  >
    {children}
  </div>
);

/** Centered full-screen layout for auth/wallet screens */
const CenteredShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Shell>
    <div className="flex-1 flex items-center justify-center p-5 overflow-y-auto">
      {children}
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
  const [earlyContact, setEarlyContact] = useState('');
  const [earlyMessage, setEarlyMessage] = useState('');
  const [earlyNotice, setEarlyNotice] = useState<string | null>(null);
  const [topUpUsdt, setTopUpUsdt] = useState('');
  const [topUpEth, setTopUpEth] = useState('');
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpStatus, setTopUpStatus] = useState<string | null>(null);
  const [topUpPendingHash, setTopUpPendingHash] = useState<string | null>(null);

  useEffect(() => { initTelegramApp(); }, []);

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

  const isSecondaryTab = activeTab === 'topup' || activeTab === 'early';

  const goToTab = (tab: MiniTab) => {
    if (PRIMARY_TABS.find((t) => t.id === tab)) setLastPrimaryTab(tab);
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
        onCreate={onCreateCase} creatorName={user.username} balance={balance}
        onOpenTopUp={onOpenTopUp} onBalanceUpdate={onBalanceUpdate}
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
        />
        {canSubmitEarly && (
          <button
            type="button"
            onClick={() => goToTab('early')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] active:bg-white/[0.06] transition"
          >
            <MessageCircle size={18} style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }} />
            <span className="flex-1 text-left text-sm font-medium" style={{ color: 'var(--tg-theme-text-color, #ffffff)' }}>
              Request Early Access
            </span>
            <span style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }} className="text-sm">›</span>
          </button>
        )}
      </div>
    );

    if (activeTab === 'topup') {
      const parsedEth = Number(topUpEth.replace(/,/g, '.').trim());
      const canTopUp = Number.isFinite(parsedEth) && parsedEth > 0 && !topUpBusy;
      return (
        <div className="space-y-3">
          {/* Balance card */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.04))' }}>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
              Current balance
            </div>
            <div className="text-3xl font-black" style={{ color: 'var(--tg-theme-text-color, #ffffff)' }}>
              {Number(balance || 0).toFixed(2)} <span style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }}>₮</span>
            </div>
          </div>

          {/* Amount inputs */}
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.04))' }}>
            <div>
              <label className="text-xs font-medium block mb-2" style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
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

            <div className="h-px" style={{ background: 'var(--tg-theme-hint-color, rgba(255,255,255,0.06))' }} />

            <div>
              <label className="text-xs font-medium block mb-2" style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
                You pay (ETH Sepolia)
              </label>
              <input
                type="text" inputMode="decimal" value={topUpEth}
                onChange={(e) => handleTopUpEthChange(e.target.value)}
                placeholder="0.000000"
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/[0.08] focus:outline-none focus:border-web3-accent/40 text-white font-mono text-lg"
              />
              <div className="mt-1.5 text-xs" style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
                {ethPrice ? `1 ETH ≈ ${ethPrice.toFixed(2)} ₮` : 'Loading price…'}
              </div>
            </div>
          </div>

          {topUpStatus && (
            <div className="px-4 py-3 rounded-xl border border-white/[0.06] text-sm text-gray-300 break-words"
              style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.03))' }}>
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
              className="w-full py-4 rounded-2xl text-sm font-black disabled:opacity-40 active:scale-[0.98] transition"
              style={{
                background: canTopUp ? 'var(--tg-theme-button-color, linear-gradient(to right, #66FCF1, #10B981))' : undefined,
                color: canTopUp ? 'var(--tg-theme-button-text-color, #000)' : undefined,
                ...(canTopUp ? {} : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }),
              }}
            >
              {topUpBusy ? 'Processing…' : 'Top Up via MetaMask'}
            </button>
          )}

          <a href="https://sepolia-faucet.pk910.de/" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs transition"
            style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
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
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.04))' }}>
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
          <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
            {200 - earlyMessage.length} chars remaining
          </div>
          {earlyNotice && <div className="text-sm text-gray-300">{earlyNotice}</div>}
          <button
            type="button" onClick={submitEarlyAccess}
            disabled={earlyAccessSubmitting || !canSubmitEarly}
            className="w-full py-3.5 rounded-xl text-sm font-black disabled:opacity-50 active:scale-[0.98] transition"
            style={{
              background: 'var(--tg-theme-button-color, linear-gradient(to right, #66FCF1, #10B981))',
              color: 'var(--tg-theme-button-text-color, #000)',
            }}
          >
            {earlyAccessSubmitting ? 'Sending…' : 'Submit Request'}
          </button>
        </div>
      </div>
    );
  };

  // ── Unauthenticated ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <CenteredShell>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center space-y-2">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto border border-white/[0.08]"
              style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(102,252,241,0.1))' }}
            >
              <span className="text-3xl font-black" style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }}>CF</span>
            </div>
            <div className="text-2xl font-black" style={{ color: 'var(--tg-theme-text-color, #ffffff)' }}>Casefun</div>
            <div className="text-sm" style={{ color: 'var(--tg-theme-hint-color, #9ca3af)' }}>
              Sign in with Telegram to start playing
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button" onClick={() => onAuthenticate()} disabled={isAuthenticating}
              className="w-full py-4 rounded-2xl text-base font-black disabled:opacity-60 active:scale-[0.98] transition"
              style={{
                background: 'var(--tg-theme-button-color, linear-gradient(to right, #66FCF1, #10B981))',
                color: 'var(--tg-theme-button-text-color, #000)',
              }}
            >
              {isAuthenticating ? 'Authorizing…' : 'Sign In with Telegram'}
            </button>
            {onOpenTelegramBot && (
              <button
                type="button" onClick={() => { if (onOpenTelegramBot) void onOpenTelegramBot(); }}
                className="w-full py-3.5 rounded-2xl border border-white/[0.12] text-sm font-semibold inline-flex items-center justify-center gap-2 active:opacity-70 transition"
                style={{ color: 'var(--tg-theme-text-color, #e5e7eb)' }}
              >
                Open in Telegram <ExternalLink size={14} />
              </button>
            )}
            {showDevLogin && (
              <button
                type="button" onClick={() => onDevAuthenticate?.()} disabled={isDevAuthenticating}
                className="w-full py-3 rounded-2xl border border-white/[0.06] text-xs font-medium disabled:opacity-60 transition"
                style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}
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
            <div className="text-2xl font-black" style={{ color: 'var(--tg-theme-text-color, #ffffff)' }}>
              Link your wallet
            </div>
            <div className="text-sm" style={{ color: 'var(--tg-theme-hint-color, #9ca3af)' }}>
              Connect an EVM wallet to start playing
            </div>
          </div>

          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.04))' }}
          >
            <ul className="space-y-2 text-sm" style={{ color: 'var(--tg-theme-hint-color, #9ca3af)' }}>
              <li className="flex items-center gap-2">
                <span style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }}>→</span>
                One wallet per account
              </li>
              <li className="flex items-center gap-2">
                <span style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }}>→</span>
                Use the same wallet on site and mini app
              </li>
            </ul>
            <button
              type="button" onClick={() => onLinkWallet()} disabled={isLinkingWallet}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black disabled:opacity-60 active:scale-[0.98] transition"
              style={{
                background: 'var(--tg-theme-button-color, linear-gradient(to right, #66FCF1, #10B981))',
                color: 'var(--tg-theme-button-text-color, #000)',
              }}
            >
              <Wallet size={18} />
              {isLinkingWallet ? 'Connecting…' : 'Connect Wallet'}
            </button>
            <div className="text-center text-xs" style={{ color: 'var(--tg-theme-hint-color, #6b7280)' }}>
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
      <div
        className="shrink-0 flex items-center gap-3 px-4 border-b"
        style={{
          height: '56px',
          background: 'var(--tg-theme-bg-color, #0B1018)',
          borderColor: 'var(--tg-theme-hint-color, rgba(255,255,255,0.06))',
        }}
      >
        {/* Left: back OR avatar */}
        {isSecondaryTab ? (
          <button
            type="button" onClick={() => goToTab(lastPrimaryTab)}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-white/[0.08] active:bg-white/[0.08] transition"
          >
            <ChevronLeft size={18} style={{ color: 'var(--tg-theme-text-color, #e5e7eb)' }} />
          </button>
        ) : (
          <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden border border-white/[0.1]">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-sm font-black"
                style={{
                  background: 'var(--tg-theme-secondary-bg-color, rgba(102,252,241,0.15))',
                  color: 'var(--tg-theme-accent-text-color, #66FCF1)',
                }}
              >
                {(user.username || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Center: username or secondary title */}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-bold truncate leading-tight"
            style={{ color: 'var(--tg-theme-text-color, #ffffff)' }}
          >
            {isSecondaryTab ? SECONDARY_TITLES[activeTab] : (user.username || 'User')}
          </div>
        </div>

        {/* Right: balance chip → opens top-up */}
        <button
          type="button" onClick={() => goToTab('topup')}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/[0.08] active:scale-95 transition"
          style={{ background: 'var(--tg-theme-secondary-bg-color, rgba(102,252,241,0.08))' }}
        >
          <span
            className="text-[13px] font-black tabular-nums"
            style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }}
          >
            {Number(balance || 0).toFixed(2)} ₮
          </span>
          <span
            className="text-base font-bold leading-none opacity-60"
            style={{ color: 'var(--tg-theme-accent-text-color, #66FCF1)' }}
          >
            +
          </span>
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' } as unknown as React.CSSProperties}
      >
        <div className="p-3 pb-6">
          {renderTabContent()}
        </div>
      </div>

      {/* ── Bottom tab bar ── */}
      <div
        className="shrink-0 flex border-t"
        style={{
          background: 'var(--tg-theme-bg-color, #0B1018)',
          borderColor: 'var(--tg-theme-hint-color, rgba(255,255,255,0.06))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id} type="button"
              onClick={() => goToTab(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 relative min-h-[56px] active:opacity-60 transition-opacity select-none"
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full"
                  style={{ background: 'var(--tg-theme-accent-text-color, #66FCF1)' }}
                />
              )}
              <span style={{ color: active
                ? 'var(--tg-theme-accent-text-color, #66FCF1)'
                : 'var(--tg-theme-hint-color, #4b5563)',
                display: 'flex', transition: 'color 150ms',
              }}>
                <Icon size={22} />
              </span>
              <span
                className="text-[11px] font-medium leading-none transition-colors duration-150"
                style={{ color: active
                  ? 'var(--tg-theme-accent-text-color, #66FCF1)'
                  : 'var(--tg-theme-hint-color, #4b5563)'
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </Shell>
  );
};
