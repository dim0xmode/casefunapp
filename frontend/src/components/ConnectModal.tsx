import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import type { DiscoveredWallet } from '../hooks/useWallet';
import type { ConnectedWalletResult } from './WalletConnectModal';
import metamaskIcon from '../assets/wallet-icons/metamask.svg';
import trustWalletIcon from '../assets/wallet-icons/trustwallet.svg';
import okxIcon from '../assets/wallet-icons/okx.svg';
import coinbaseIcon from '../assets/wallet-icons/coinbase.svg';
import walletConnectIcon from '../assets/wallet-icons/walletconnect.svg';
import ledgerIcon from '../assets/wallet-icons/ledger.svg';

type AuthMethod = 'telegram' | 'evm' | 'ton';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectEvm: (result: ConnectedWalletResult) => Promise<boolean>;
  onLoginTelegramWidget: (payload: Record<string, any>) => Promise<void>;
  onLoginTon: (address: string, proof: any) => Promise<void>;
  connectWithProvider?: (provider: any) => Promise<string | null>;
  isConnecting: boolean;
  error: string | null;
  isAuthLoading?: boolean;
  discoveredWallets?: DiscoveredWallet[];
  walletConnectConfig?: { projectId: string; chainId: number; rpcUrl?: string };
  telegramBotUsername?: string;
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
  onConnectEvm,
  onLoginTelegramWidget,
  onLoginTon,
  connectWithProvider,
  isConnecting,
  error,
  isAuthLoading = false,
  discoveredWallets = [],
  walletConnectConfig,
  telegramBotUsername,
}) => {
  const [activeMethod, setActiveMethod] = useState<AuthMethod>('telegram');
  const [localConnecting, setLocalConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const tgWidgetRef = useRef<HTMLDivElement>(null);
  const busy = isConnecting || isAuthLoading || localConnecting;

  useEffect(() => {
    if (!isOpen) {
      setLocalError(null);
      setLocalConnecting(false);
    }
  }, [isOpen]);

  const handleTelegramCallback = useCallback(async (tgUser: any) => {
    try {
      await onLoginTelegramWidget(tgUser);
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || 'Telegram login failed');
    }
  }, [onLoginTelegramWidget, onClose]);

  useEffect(() => {
    if (!isOpen || activeMethod !== 'telegram' || !telegramBotUsername) return;
    (window as any).__telegramLoginCallback = handleTelegramCallback;

    const container = tgWidgetRef.current;
    if (!container) return;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', telegramBotUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', '__telegramLoginCallback(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;
    container.appendChild(script);

    return () => {
      delete (window as any).__telegramLoginCallback;
    };
  }, [isOpen, activeMethod, telegramBotUsername, handleTelegramCallback]);

  if (!isOpen) return null;

  const connectViaWalletConnect = async () => {
    if (!walletConnectConfig?.projectId) {
      setLocalError('WalletConnect is not configured.');
      return;
    }
    setLocalConnecting(true);
    setLocalError(null);
    try {
      const { connectWallet: wcConnect } = await import('../utils/walletConnect');
      const session = await wcConnect({
        projectId: walletConnectConfig.projectId,
        chainId: walletConnectConfig.chainId,
        rpcUrl: walletConnectConfig.rpcUrl,
      });
      const ok = await onConnectEvm({
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
        const ok = await onConnectEvm({ address, provider: wallet.provider });
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
      await connectViaWalletConnect();
    }
  };

  const handleTonConnect = async () => {
    setLocalConnecting(true);
    setLocalError(null);
    try {
      const { TonConnectUI } = await import('@tonconnect/ui');
      const tonConnectUI = new TonConnectUI({
        manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
      });
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      tonConnectUI.setConnectRequestParameters({
        state: 'ready',
        value: { tonProof: nonce },
      });
      await new Promise((r) => setTimeout(r, 150));
      const result = await tonConnectUI.connectWallet();
      if (result) {
        const account = tonConnectUI.account;
        if (account) {
          const tonProofItem = (result as any).connectItems?.tonProof;
          const rawProof = tonProofItem?.proof ?? tonProofItem;
          const proof = rawProof ? { ...rawProof, publicKey: account.publicKey } : undefined;
          await onLoginTon(account.address, proof);
          onClose();
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('User rejected') || err?.message?.includes('dismissed')) return;
      setLocalError(err?.message || 'TON connection failed');
    } finally {
      setLocalConnecting(false);
    }
  };

  const displayError = localError || error;

  const tabs: { id: AuthMethod; label: string }[] = [
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

        <h2 className="text-3xl font-black mb-4">Connect</h2>
        <p className="text-gray-400 mb-6 text-sm">Choose how you want to sign in to CaseFun.</p>

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

        {activeMethod === 'telegram' && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">Sign in with your Telegram account</p>
            <div ref={tgWidgetRef} className="flex justify-center min-h-[48px] items-center">
              {!telegramBotUsername && (
                <span className="text-gray-500 text-xs">Telegram login is not configured</span>
              )}
            </div>
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
            <Button onClick={connectViaWalletConnect} disabled={busy} className="w-full py-4 text-lg">
              {localConnecting ? 'Connecting...' : isAuthLoading ? 'Signing...' : 'Connect via QR Code'}
            </Button>
          </>
        )}

        {activeMethod === 'ton' && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">Connect your TON wallet</p>
            <Button onClick={handleTonConnect} disabled={busy} className="w-full py-4 text-lg">
              {localConnecting ? 'Connecting...' : 'Connect TON Wallet'}
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
