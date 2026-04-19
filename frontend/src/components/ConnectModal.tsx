import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { Button } from './Button';
import type { DiscoveredWallet } from '../hooks/useWallet';
import type { ConnectedWalletResult } from './WalletConnectModal';
import metamaskIcon from '../assets/wallet-icons/metamask.svg';
import trustWalletIcon from '../assets/wallet-icons/trustwallet.svg';
import okxIcon from '../assets/wallet-icons/okx.svg';
import coinbaseIcon from '../assets/wallet-icons/coinbase.svg';
import walletConnectIcon from '../assets/wallet-icons/walletconnect.svg';
import ledgerIcon from '../assets/wallet-icons/ledger.svg';
import { api } from '../services/api';

type AuthMethod = 'telegram' | 'evm' | 'ton';

export type ConnectModalMode = 'login' | 'link';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: ConnectModalMode;
  /** When set, only this auth method is shown (no chain tabs) — used for direct "Link EVM"/"Link TON" buttons */
  lockChain?: 'evm' | 'ton';
  onConnectEvm: (result: ConnectedWalletResult) => Promise<boolean>;
  onLinkEvm?: (result: ConnectedWalletResult) => Promise<boolean>;
  onLoginTelegramWidget: (payload: Record<string, any>) => Promise<void>;
  onLoginTon: (address: string, proof: any) => Promise<void>;
  onLinkTon?: () => Promise<void>;
  connectWithProvider?: (provider: any) => Promise<string | null>;
  isConnecting: boolean;
  error: string | null;
  isAuthLoading?: boolean;
  discoveredWallets?: DiscoveredWallet[];
  walletConnectConfig?: { projectId: string; chainId: number; rpcUrl?: string };
  telegramBotUsername?: string;
  referralCode?: string | null;
}

const STATIC_WALLET_OPTIONS = [
  { label: 'MetaMask', iconUrl: metamaskIcon, matchKey: 'metamask' },
  { label: 'Trust Wallet', iconUrl: trustWalletIcon, matchKey: 'trust' },
  { label: 'OKX Wallet', iconUrl: okxIcon, matchKey: 'okx' },
  { label: 'Coinbase Wallet', iconUrl: coinbaseIcon, matchKey: 'coinbase' },
  { label: 'WalletConnect', iconUrl: walletConnectIcon, matchKey: 'walletconnect' },
  { label: 'Ledger', iconUrl: ledgerIcon, matchKey: 'ledger' },
];

const findDiscovered = (matchKey: string, discoveredWallets: DiscoveredWallet[]): DiscoveredWallet | undefined => {
  const key = matchKey.toLowerCase();
  return discoveredWallets.find((w) => w.name.toLowerCase().includes(key) || w.rdns.toLowerCase().includes(key));
};

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  mode = 'login',
  lockChain,
  onConnectEvm,
  onLinkEvm,
  onLoginTelegramWidget,
  onLoginTon,
  onLinkTon,
  connectWithProvider,
  isConnecting,
  error,
  isAuthLoading = false,
  discoveredWallets = [],
  walletConnectConfig,
  telegramBotUsername: _telegramBotUsername,
  referralCode,
}) => {
  const isLinkMode = mode === 'link';
  const defaultTab: AuthMethod = lockChain ? lockChain : (isLinkMode ? 'evm' : 'telegram');
  const [activeMethod, setActiveMethod] = useState<AuthMethod>(defaultTab);
  const [localConnecting, setLocalConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tgLoginState, setTgLoginState] = useState<'idle' | 'polling' | 'success'>('idle');
  const pollRef = useRef(false);
  const busy = isConnecting || isAuthLoading || localConnecting;

  useEffect(() => {
    if (!isOpen) {
      setLocalError(null);
      setLocalConnecting(false);
      setTgLoginState('idle');
      pollRef.current = false;
      setActiveMethod(lockChain ? lockChain : (isLinkMode ? 'evm' : 'telegram'));
    } else if (lockChain) {
      setActiveMethod(lockChain);
    }
  }, [isOpen, isLinkMode, lockChain]);

  if (!isOpen) return null;

  const handleEvmResult = async (result: ConnectedWalletResult): Promise<boolean> => {
    if (isLinkMode && onLinkEvm) {
      return onLinkEvm(result);
    }
    return onConnectEvm(result);
  };

  const connectViaWalletConnect = async (walletKey?: string) => {
    if (!walletConnectConfig?.projectId) {
      setLocalError('WalletConnect is not configured.');
      return;
    }
    setLocalConnecting(true);
    setLocalError(null);
    try {
      const wc = await import('../utils/walletConnect');
      const session = walletKey
        ? await wc.connectWalletDirect({
            projectId: walletConnectConfig.projectId,
            chainId: walletConnectConfig.chainId,
            rpcUrl: walletConnectConfig.rpcUrl,
            walletKey,
          })
        : await wc.connectWallet({
            projectId: walletConnectConfig.projectId,
            chainId: walletConnectConfig.chainId,
            rpcUrl: walletConnectConfig.rpcUrl,
          });
      const ok = await handleEvmResult({
        address: session.address,
        provider: session.provider,
        disconnect: session.disconnect,
      });
      if (ok) onClose();
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('dismissed')) return;
      setLocalError(err?.message || 'Connection failed');
    } finally {
      setLocalConnecting(false);
    }
  };

  const connectViaInjected = async (wallet: DiscoveredWallet) => {
    if (!connectWithProvider) return;
    setLocalConnecting(true);
    setLocalError(null);
    try {
      const address = await connectWithProvider(wallet.provider);
      if (address) {
        const ok = await handleEvmResult({ address, provider: wallet.provider });
        if (ok) onClose();
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Connection failed');
    } finally {
      setLocalConnecting(false);
    }
  };

  const handleWalletClick = async (matchKey: string) => {
    if (busy) return;
    const discovered = findDiscovered(matchKey, discoveredWallets);
    if (discovered && connectWithProvider) {
      await connectViaInjected(discovered);
    } else {
      await connectViaWalletConnect(matchKey);
    }
  };

  const handleTonConnect = async () => {
    setLocalConnecting(true);
    setLocalError(null);
    try {
      if (isLinkMode && onLinkTon) {
        await onLinkTon();
        onClose();
      } else {
        const { connectTonWallet } = await import('../utils/tonConnect');
        const wallet = await connectTonWallet();
        await onLoginTon(wallet.address, wallet.proof);
        onClose();
      }
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('dismissed')) return;
      setLocalError(err?.message || 'TON connection failed');
    } finally {
      setLocalConnecting(false);
    }
  };

  const handleTelegramBotLogin = async () => {
    if (tgLoginState !== 'idle') return;
    setLocalError(null);
    setTgLoginState('polling');
    pollRef.current = true;

    try {
      const startResp = await api.startTelegramWebLogin(referralCode);
      const url = startResp.data?.url;
      const token = startResp.data?.token;
      if (!url || !token) throw new Error('Failed to start Telegram login');

      window.open(url, '_blank');

      const timeoutMs = 120_000;
      const pollIntervalMs = 2_000;
      const startedAt = Date.now();

      while (pollRef.current && Date.now() - startedAt < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (!pollRef.current) break;

        const status = await api.pollTelegramWebLogin(token);
        const d = status.data;
        if (d?.completed && d?.user) {
          setTgLoginState('success');
          await onLoginTelegramWidget(d.user);
          onClose();
          return;
        }
        if (d?.failed) {
          throw new Error(d.message || 'Telegram login failed');
        }
        if (d?.expired) {
          throw new Error('Login link expired. Please try again.');
        }
      }

      if (pollRef.current) {
        throw new Error('Login timed out. Open the bot link and press Start, then try again.');
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Telegram login failed');
    } finally {
      setTgLoginState('idle');
      pollRef.current = false;
    }
  };

  const displayError = localError || error;

  const tabs: { id: AuthMethod; label: string }[] = isLinkMode
    ? [
        { id: 'evm', label: 'EVM Wallet' },
        { id: 'ton', label: 'TON Wallet' },
      ]
    : [
        { id: 'telegram', label: 'Telegram' },
        { id: 'evm', label: 'EVM Wallet' },
        { id: 'ton', label: 'TON Wallet' },
      ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-web3-card border border-gray-700 rounded-2xl p-8 max-w-md w-full relative my-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
          <X size={24} />
        </button>

        <h2 className="text-3xl font-black mb-4">
          {lockChain === 'evm'
            ? 'Link EVM Wallet'
            : lockChain === 'ton'
            ? 'Link TON Wallet'
            : isLinkMode
            ? 'Link Wallet'
            : 'Connect'}
        </h2>
        <p className="text-gray-400 mb-6 text-sm">
          {lockChain
            ? 'Pick your wallet to link.'
            : isLinkMode
            ? 'Link a wallet to your account for deposits and claims.'
            : 'Choose how you want to sign in to CaseFun.'}
        </p>

        {!lockChain && (
          <div className="flex gap-1 mb-6 bg-black/30 rounded-xl p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveMethod(tab.id); setLocalError(null); }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  activeMethod === tab.id
                    ? 'bg-web3-accent text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {activeMethod === 'telegram' && !isLinkMode && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">Sign in with your Telegram account</p>

            {tgLoginState === 'idle' && (
              <button
                onClick={handleTelegramBotLogin}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold text-base transition-all disabled:opacity-50"
              >
                <Send size={20} />
                Log in with Telegram
              </button>
            )}

            {tgLoginState === 'polling' && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-web3-accent">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm font-medium">Waiting for confirmation...</span>
                </div>
                <p className="text-gray-500 text-xs">
                  A new tab opened with the bot. Press <strong>Start</strong> in Telegram to confirm login.
                </p>
                <button
                  onClick={() => { pollRef.current = false; setTgLoginState('idle'); }}
                  className="text-gray-500 hover:text-gray-300 text-xs underline transition"
                >
                  Cancel
                </button>
              </div>
            )}

            {tgLoginState === 'success' && (
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <span className="text-sm font-bold">Login successful!</span>
              </div>
            )}
          </div>
        )}

        {activeMethod === 'evm' && (
          <>
            <div className="mb-5">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Choose wallet</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STATIC_WALLET_OPTIONS.map((wallet) => {
                  const installed = findDiscovered(wallet.matchKey, discoveredWallets);
                  return (
                    <button
                      key={wallet.label}
                      type="button"
                      disabled={busy}
                      onClick={() => handleWalletClick(wallet.matchKey)}
                      className={`rounded-lg border px-2.5 py-2 flex items-center gap-2 transition-all text-left cursor-pointer ${
                        installed
                          ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10'
                          : 'border-white/[0.08] bg-black/25 hover:border-white/20 hover:bg-white/5'
                      } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <span className="w-6 h-6 rounded-md border border-white/[0.14] bg-white/90 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={installed?.icon || wallet.iconUrl} alt={`${wallet.label} icon`} className="w-4 h-4 object-contain" loading="lazy" />
                      </span>
                      <span className="min-w-0 flex flex-col">
                        <span className="text-[10px] text-gray-300 font-semibold leading-tight truncate">{wallet.label}</span>
                        {installed ? (
                          <span className="text-[8px] text-emerald-400 uppercase tracking-wide">Installed</span>
                        ) : (
                          <span className="text-[8px] text-gray-500 uppercase tracking-wide">QR / App</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={() => connectViaWalletConnect()} disabled={busy} className="w-full py-4 text-lg">
              {localConnecting ? 'Connecting...' : isAuthLoading ? 'Signing...' : 'Connect via QR Code'}
            </Button>
          </>
        )}

        {activeMethod === 'ton' && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">
              {isLinkMode ? 'Link your TON wallet' : 'Connect your TON wallet'}
            </p>
            <Button onClick={handleTonConnect} disabled={busy} className="w-full py-4 text-lg">
              {localConnecting ? 'Connecting...' : isLinkMode ? 'Link TON Wallet' : 'Connect TON Wallet'}
            </Button>
          </div>
        )}

        {displayError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4">
            <p className="text-red-400 text-sm">{displayError}</p>
          </div>
        )}

        {isAuthLoading && (
          <div className="mt-3 text-[11px] uppercase tracking-widest text-gray-500 text-center">
            Confirm signature in your wallet
          </div>
        )}

        <p className="text-gray-500 text-xs mt-6 text-center">
          By connecting, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
