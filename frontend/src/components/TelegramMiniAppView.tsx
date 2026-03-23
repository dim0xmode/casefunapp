import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Coins,
  ExternalLink,
  MessageCircle,
  PlusCircle,
  Swords,
  UserCircle2,
  Wallet,
} from 'lucide-react';
import { Case, Item, Rarity, User } from '../types';
import metamaskIcon from '../assets/wallet-icons/metamask.svg';
import trustWalletIcon from '../assets/wallet-icons/trustwallet.svg';
import okxIcon from '../assets/wallet-icons/okx.svg';
import coinbaseIcon from '../assets/wallet-icons/coinbase.svg';
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
  onLinkWallet: (wallet: TelegramWalletOption) => Promise<void> | void;
  onOpenHome: () => void;
}

type MiniTab = 'cases' | 'create' | 'upgrade' | 'battle' | 'profile' | 'topup' | 'early';

const getEarlyAccessBlockMessage = (reason: EarlyAccessStatusPayload['blockReason']) => {
  switch (reason) {
    case 'PENDING_REVIEW':
      return 'Your request is currently under review.';
    case 'ALREADY_APPROVED':
      return 'Your request has already been approved.';
    case 'ALREADY_EARLY_ACCESS':
      return 'You already have early access.';
    case 'ADMIN_ACCOUNT':
      return 'Administrators cannot submit early access requests.';
    case 'SUPPORT_ACCOUNT':
      return 'Support accounts cannot submit early access requests.';
    default:
      return 'Early access request is currently unavailable.';
  }
};

const resolveCaseExpiresAt = (caseData?: Pick<Case, 'openDurationHours' | 'createdAt'> | null) => {
  if (!caseData?.openDurationHours || !caseData?.createdAt) return null;
  const createdAt = Number(caseData.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  return createdAt + Number(caseData.openDurationHours) * 60 * 60 * 1000;
};

const shortenAddress = (value?: string | null) => {
  if (!value) return '';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const normalizeRarity = (value: unknown) => {
  if (typeof value === 'string' && Object.values(Rarity).includes(value as Rarity)) {
    return value as Rarity;
  }
  return Rarity.COMMON;
};

const toProfileItem = (item: Item): Item => ({
  ...item,
  rarity: normalizeRarity(item.rarity),
});

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
  onOpenHome,
}) => {
  const [activeTab, setActiveTab] = useState<MiniTab>('cases');
  const [earlyContact, setEarlyContact] = useState('');
  const [earlyMessage, setEarlyMessage] = useState('');
  const [earlyNotice, setEarlyNotice] = useState<string | null>(null);

  const hasWallet = Boolean(user.hasLinkedWallet && user.walletAddress);
  const caseMap = useMemo(() => new Map(cases.map((entry) => [entry.id, entry])), [cases]);

  const activeCases = useMemo(() => {
    const now = Date.now();
    return cases.filter((entry) => {
      const expiresAt = resolveCaseExpiresAt(entry);
      if (!expiresAt) return true;
      return expiresAt > now;
    });
  }, [cases]);

  const activeInventory = useMemo(() => {
    const now = Date.now();
    return inventory.filter((item) => {
      const caseData = item.caseId ? caseMap.get(item.caseId) : null;
      const expiresAt = resolveCaseExpiresAt(caseData);
      if (!expiresAt) return true;
      return expiresAt > now;
    });
  }, [inventory, caseMap]);

  const walletOptions: Array<{ id: TelegramWalletOption; label: string; iconUrl: string }> = [
    { id: 'metamask', label: 'MetaMask', iconUrl: metamaskIcon },
    { id: 'trust', label: 'Trust Wallet', iconUrl: trustWalletIcon },
    { id: 'okx', label: 'OKX Wallet', iconUrl: okxIcon },
    { id: 'coinbase', label: 'Coinbase', iconUrl: coinbaseIcon },
  ];

  const tabs: Array<{ id: MiniTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'cases', label: 'Cases', icon: Boxes },
    { id: 'create', label: 'Create', icon: PlusCircle },
    { id: 'upgrade', label: 'Upgrade', icon: Coins },
    { id: 'battle', label: 'Battle', icon: Swords },
    { id: 'profile', label: 'Profile', icon: UserCircle2 },
    { id: 'topup', label: 'TopUp', icon: Wallet },
    { id: 'early', label: 'Early', icon: MessageCircle },
  ];
  const activeTabMeta = tabs.find((entry) => entry.id === activeTab) || tabs[0];

  const submitEarlyAccess = async () => {
    setEarlyNotice(null);
    const contact = earlyContact.trim();
    const message = earlyMessage.trim();
    if (!contact) {
      setEarlyNotice('Telegram contact is required.');
      return;
    }
    if (!message || message.length > 200) {
      setEarlyNotice('Message length must be between 1 and 200 characters.');
      return;
    }
    try {
      await onSubmitEarlyAccess({ contact, message });
      setEarlyNotice('Early access request sent.');
      setEarlyMessage('');
    } catch (error: any) {
      setEarlyNotice(error?.message || 'Failed to send early access request.');
    }
  };

  const canSubmitEarly = Boolean(earlyAccessStatus?.canSubmit ?? true);
  const earlyBlockMessage = canSubmitEarly ? null : getEarlyAccessBlockMessage(earlyAccessStatus?.blockReason || null);

  const renderTabContent = () => {
    if (activeTab === 'cases') {
      return (
        <CaseView
          cases={cases}
          onOpenCase={onOpenCase}
          balance={balance}
          onOpenTopUp={onOpenTopUp}
          userName={user.username}
          isAuthenticated={isAuthenticated}
          onOpenWalletConnect={onOpenWalletConnect}
          isAdmin={isActivitiesEnabled}
          isTelegramMiniApp
        />
      );
    }

    if (activeTab === 'create') {
      return (
        <CreateCaseView
          onCreate={onCreateCase}
          creatorName={user.username}
          balance={balance}
          onOpenTopUp={onOpenTopUp}
          onBalanceUpdate={onBalanceUpdate}
          isAuthenticated={isAuthenticated}
          onOpenWalletConnect={onOpenWalletConnect}
          isAdmin={isActivitiesEnabled}
          cases={cases}
          isTelegramMiniApp
        />
      );
    }

    if (activeTab === 'upgrade') {
      return (
        <UpgradeView
          inventory={activeInventory}
          onUpgrade={onUpgrade}
          isAuthenticated={isAuthenticated}
          onOpenWalletConnect={onOpenWalletConnect}
          isAdmin={isActivitiesEnabled}
          isTelegramMiniApp
        />
      );
    }

    if (activeTab === 'battle') {
      return (
        <div className="h-full">
          <BattleView
            cases={activeCases}
            userName={user.username}
            userAvatar={user.avatar}
            userAvatarMeta={user.avatarMeta}
            onBattleFinish={onBattleFinish}
            balance={balance}
            onChargeBattle={onChargeBattle}
            onOpenTopUp={onOpenTopUp}
            isAuthenticated={isAuthenticated}
            onOpenWalletConnect={onOpenWalletConnect}
            isAdmin={isActivitiesEnabled}
            isTelegramMiniApp
          />
        </div>
      );
    }

    if (activeTab === 'profile') {
      return (
        <ProfileView
          user={user}
          inventory={inventory.map(toProfileItem)}
          burntItems={burntItems.map(toProfileItem)}
          claimedItems={claimedItems.map(toProfileItem)}
          battleHistory={battleHistory}
          balance={balance}
          cases={cases}
          isEditable
          onSelectUser={onSelectUser}
          getUserAvatarByName={getUserAvatarByName}
          onUpdateUsername={onUpdateUsername}
          onUploadAvatar={onUploadAvatar}
          onUpdateAvatarMeta={onUpdateAvatarMeta}
          onClaimToken={onClaimToken}
          onConnectTwitter={onConnectTwitter}
          onDisconnectTwitter={onDisconnectTwitter}
          twitterBusy={twitterBusy}
          twitterNotice={twitterNotice}
          twitterError={twitterError}
          onConnectTelegram={onConnectTelegram}
          onDisconnectTelegram={onDisconnectTelegram}
          onOpenTelegramMiniApp={onOpenTelegramMiniApp}
          telegramBusy={telegramBusy}
          telegramError={telegramError}
          isBackgroundAnimated={isBackgroundAnimated}
          onToggleBackgroundAnimation={onToggleBackgroundAnimation}
          isTelegramMiniApp
        />
      );
    }

    if (activeTab === 'topup') {
      return (
        <div className="rounded-2xl border border-white/[0.12] bg-black/35 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">TopUp</div>
          <div className="text-lg font-black text-white mt-1">{Number(balance || 0).toFixed(2)} ₮</div>
          <div className="text-[11px] text-gray-400 mt-1">
            Choose amount, confirm in wallet, balance updates automatically.
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[5, 10, 25, 50].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => onOpenTopUp(amount)}
                className="px-3 py-3 rounded-xl border border-web3-accent/35 text-web3-accent text-xs font-black uppercase tracking-widest"
              >
                +{amount} ₮
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-white/[0.1] bg-black/30 p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Need test ETH?</div>
            <a
              href="https://sepolia-faucet.pk910.de/"
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-web3-accent hover:text-white transition"
            >
              Open Sepolia faucet
              <ExternalLink size={12} />
            </a>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenWalletConnect()}
              className="w-full px-3 py-2 rounded-lg border border-white/[0.14] text-gray-200 text-[10px] uppercase tracking-widest"
            >
              Wallet Connect
            </button>
            <button
              type="button"
              onClick={() => onOpenHome()}
              className="w-full px-3 py-2 rounded-lg border border-white/[0.14] text-gray-200 text-[10px] uppercase tracking-widest"
            >
              Open Home
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-white/[0.12] bg-black/35 p-4">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">Early Access</div>
        {!canSubmitEarly && <div className="mt-2 text-[11px] uppercase tracking-widest text-amber-300">{earlyBlockMessage}</div>}
        <div className="mt-3 space-y-2">
          <input
            value={earlyContact}
            onChange={(e) => setEarlyContact(e.target.value)}
            placeholder="@telegram_username"
            className="w-full px-3 py-2 rounded-lg bg-black/35 border border-white/[0.12] text-sm text-white focus:outline-none focus:border-web3-accent/45"
          />
          <textarea
            value={earlyMessage}
            onChange={(e) => setEarlyMessage(e.target.value.slice(0, 200))}
            placeholder="Tell us why you need early access..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-black/35 border border-white/[0.12] text-sm text-white focus:outline-none focus:border-web3-accent/45 resize-none"
          />
          <div className="text-[10px] uppercase tracking-widest text-gray-500">{200 - earlyMessage.length} chars left</div>
          {earlyNotice && <div className="text-[11px] uppercase tracking-widest text-gray-300">{earlyNotice}</div>}
          <button
            type="button"
            onClick={() => submitEarlyAccess()}
            disabled={earlyAccessSubmitting || !canSubmitEarly}
            className="w-full px-3 py-2 rounded-lg border border-web3-accent/35 text-web3-accent text-[10px] uppercase tracking-widest disabled:opacity-60"
          >
            {earlyAccessSubmitting ? 'Sending...' : 'Submit Request'}
          </button>
        </div>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-2 py-2">
        <div className="rounded-[24px] border border-web3-accent/35 bg-[#0B1018] p-4">
          <div className="text-[11px] uppercase tracking-widest text-web3-accent font-bold">Telegram Authorization</div>
          <div className="text-sm text-gray-200 mt-2">Open from Telegram Mini App and authorize your account.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAuthenticate()}
              disabled={isAuthenticating}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-web3-accent to-web3-success text-black text-[11px] uppercase tracking-widest font-black disabled:opacity-60"
            >
              {isAuthenticating ? 'Authorizing...' : 'Authorize'}
            </button>
            {onOpenTelegramBot && (
              <button
                type="button"
                onClick={() => onOpenTelegramBot?.()}
                className="px-4 py-2 rounded-lg border border-white/[0.14] text-gray-200 text-[11px] uppercase tracking-widest font-black inline-flex items-center gap-1.5"
              >
                Open Telegram
                <ExternalLink size={12} />
              </button>
            )}
            {showDevLogin && (
              <button
                type="button"
                onClick={() => onDevAuthenticate?.()}
                disabled={isDevAuthenticating}
                className="px-4 py-2 rounded-lg border border-white/[0.14] text-gray-200 text-[11px] uppercase tracking-widest font-black disabled:opacity-60"
              >
                {isDevAuthenticating ? 'Signing in...' : 'Dev Login'}
              </button>
            )}
          </div>
          {authError && <div className="mt-3 text-[11px] uppercase tracking-widest text-red-300">{authError}</div>}
        </div>
      </div>
    );
  }

  if (!hasWallet) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-2 py-2">
        <div className="rounded-[24px] border border-white/[0.12] bg-[#0B1018] backdrop-blur-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Wallet</div>
          <div className="text-sm text-white font-bold mt-1">
            {user.walletAddress ? shortenAddress(user.walletAddress) : 'Wallet is not linked'}
          </div>
          <div className="mt-3 rounded-xl border border-white/[0.12] bg-black/30 p-4">
            <div className="text-[11px] uppercase tracking-widest text-amber-300 inline-flex items-center gap-1.5">
              <AlertTriangle size={13} />
              Link wallet first
            </div>
            <div className="text-xs text-gray-300 mt-2">
              Connect any EVM wallet via WalletConnect and sign once to unlock all features.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {walletOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onLinkWallet(option.id)}
                  disabled={isLinkingWallet}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-web3-accent/35 text-web3-accent text-[10px] uppercase tracking-widest font-black disabled:opacity-60"
                >
                  <span className="w-5 h-5 rounded-md border border-white/[0.14] bg-white/90 flex items-center justify-center overflow-hidden">
                    <img src={option.iconUrl} alt={`${option.label} icon`} className="w-3.5 h-3.5 object-contain" loading="lazy" />
                  </span>
                  {isLinkingWallet ? 'Opening...' : option.label}
                </button>
              ))}
            </div>
          </div>
          {(authError || telegramError || twitterError) && (
            <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-red-200">
              {authError || telegramError || twitterError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-2 pt-2 pb-2">
      <div className="rounded-[24px] border border-white/[0.12] bg-[#0B1018] backdrop-blur-xl overflow-hidden">
        <div className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0B1018]/95 backdrop-blur-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500">Casefun Mini App</div>
              <div className="text-sm font-black text-white mt-0.5">{activeTabMeta.label}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.16em] text-gray-500">Balance</div>
              <div className="text-sm font-black text-web3-accent">{Number(balance || 0).toFixed(2)} ₮</div>
            </div>
          </div>
        </div>

        <div className="px-2 py-2 pb-[calc(80px+env(safe-area-inset-bottom,0px))]">
          {renderTabContent()}
        </div>
      </div>

      <div className="sticky bottom-0 z-30 mt-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="rounded-2xl border border-white/[0.12] bg-[#0B1018]/95 backdrop-blur-xl p-1.5">
          <div className="grid grid-cols-7 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-1 py-2 rounded-xl border text-[9px] uppercase tracking-[0.14em] flex flex-col items-center justify-center gap-1 ${
                  active
                    ? 'border-web3-accent/60 text-web3-accent bg-web3-accent/12'
                    : 'border-white/[0.08] text-gray-500 hover:text-white'
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
};
