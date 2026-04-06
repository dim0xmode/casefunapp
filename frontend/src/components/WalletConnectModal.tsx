import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import type { DiscoveredWallet } from '../hooks/useWallet';
import metamaskIcon from '../assets/wallet-icons/metamask.svg';
import trustWalletIcon from '../assets/wallet-icons/trustwallet.svg';
import okxIcon from '../assets/wallet-icons/okx.svg';
import coinbaseIcon from '../assets/wallet-icons/coinbase.svg';
import walletConnectIcon from '../assets/wallet-icons/walletconnect.svg';
import ledgerIcon from '../assets/wallet-icons/ledger.svg';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (address: string) => Promise<boolean>;
  connectWallet: (walletLabel?: string) => Promise<string | null>;
  connectWithProvider?: (provider: any) => Promise<string | null>;
  isConnecting: boolean;
  error: string | null;
  isAuthLoading?: boolean;
  discoveredWallets?: DiscoveredWallet[];
}

const STATIC_WALLET_OPTIONS = [
  { label: 'MetaMask', iconUrl: metamaskIcon, matchKey: 'metamask' },
  { label: 'Trust Wallet', iconUrl: trustWalletIcon, matchKey: 'trust' },
  { label: 'OKX Wallet', iconUrl: okxIcon, matchKey: 'okx' },
  { label: 'Coinbase Wallet', iconUrl: coinbaseIcon, matchKey: 'coinbase' },
  { label: 'WalletConnect', iconUrl: walletConnectIcon, matchKey: 'walletconnect' },
  { label: 'Ledger', iconUrl: ledgerIcon, matchKey: 'ledger' },
];

const isWalletInstalled = (
  matchKey: string,
  discoveredWallets: DiscoveredWallet[],
): DiscoveredWallet | undefined => {
  const key = matchKey.toLowerCase();
  return discoveredWallets.find(
    (w) => w.name.toLowerCase().includes(key) || w.rdns.toLowerCase().includes(key),
  );
};

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  connectWallet,
  connectWithProvider,
  isConnecting,
  error,
  isAuthLoading = false,
  discoveredWallets = [],
}) => {
  if (!isOpen) return null;

  const handleConnectWith = async (walletLabel: string) => {
    const discovered = isWalletInstalled(walletLabel.toLowerCase(), discoveredWallets);
    let address: string | null = null;

    if (discovered && connectWithProvider) {
      address = await connectWithProvider(discovered.provider);
    } else {
      address = await connectWallet(walletLabel);
    }

    if (address) {
      const ok = await onConnect(address);
      if (ok) onClose();
    }
  };

  const handleConnectDefault = async () => {
    const address = await connectWallet();
    if (address) {
      const ok = await onConnect(address);
      if (ok) onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-web3-card border border-gray-700 rounded-2xl p-8 max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h2 className="text-3xl font-black mb-6">Connect Wallet</h2>

        <p className="text-gray-400 mb-8">
          Select a wallet to connect. If your wallet is installed, click it directly.
        </p>

        <div className="mb-7">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Available wallets
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STATIC_WALLET_OPTIONS.map((wallet) => {
              const installed = isWalletInstalled(wallet.matchKey, discoveredWallets);
              const isClickable = Boolean(installed) || wallet.matchKey !== 'walletconnect' && wallet.matchKey !== 'ledger';
              return (
                <button
                  key={wallet.label}
                  type="button"
                  disabled={isConnecting || isAuthLoading || !isClickable}
                  onClick={() => handleConnectWith(wallet.label)}
                  className={`rounded-lg border px-2.5 py-2 flex items-center gap-2 transition-all text-left ${
                    installed
                      ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 cursor-pointer'
                      : isClickable
                        ? 'border-white/[0.08] bg-black/25 hover:border-white/20 hover:bg-white/5 cursor-pointer'
                        : 'border-white/[0.06] bg-black/15 opacity-50 cursor-default'
                  }`}
                >
                  <span className="w-6 h-6 rounded-md border border-white/[0.14] bg-white/90 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={installed?.icon || wallet.iconUrl}
                      alt={`${wallet.label} icon`}
                      className="w-4 h-4 object-contain"
                      loading="lazy"
                    />
                  </span>
                  <span className="min-w-0 flex flex-col">
                    <span className="text-[10px] text-gray-300 font-semibold leading-tight truncate">{wallet.label}</span>
                    {installed && (
                      <span className="text-[8px] text-emerald-400 uppercase tracking-wide">Installed</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <Button
          onClick={handleConnectDefault}
          disabled={isConnecting || isAuthLoading}
          className="w-full py-4 text-lg"
        >
          {isConnecting ? 'Connecting...' : isAuthLoading ? 'Signing...' : 'Connect Wallet'}
        </Button>
        {isAuthLoading && (
          <div className="mt-3 text-[11px] uppercase tracking-widest text-gray-500 text-center">
            Confirm signature in your wallet
          </div>
        )}

        <p className="text-gray-500 text-xs mt-6 text-center">
          By connecting your wallet, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
