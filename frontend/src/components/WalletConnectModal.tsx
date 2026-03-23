import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
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
  connectWallet: () => Promise<string | null>;
  isConnecting: boolean;
  error: string | null;
  isAuthLoading?: boolean;
}

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  connectWallet,
  isConnecting,
  error,
  isAuthLoading = false,
}) => {
  if (!isOpen) return null;

  const walletOptions = [
    {
      label: 'MetaMask',
      iconUrl: metamaskIcon,
    },
    {
      label: 'Trust Wallet',
      iconUrl: trustWalletIcon,
    },
    {
      label: 'OKX Wallet',
      iconUrl: okxIcon,
    },
    {
      label: 'Coinbase Wallet',
      iconUrl: coinbaseIcon,
    },
    {
      label: 'WalletConnect',
      iconUrl: walletConnectIcon,
    },
    {
      label: 'Ledger',
      iconUrl: ledgerIcon,
    },
  ];

  const handleConnect = async () => {
    const address = await connectWallet();
    if (address) {
      const ok = await onConnect(address);
      if (ok) {
        onClose();
      }
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
          Connect any EVM wallet to access all features of CaseFun.
        </p>

        <div className="mb-7">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Popular options
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {walletOptions.map((wallet) => (
              <div
                key={wallet.label}
                className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 flex items-center gap-2"
              >
                <span className="w-6 h-6 rounded-md border border-white/[0.14] bg-white/90 flex items-center justify-center overflow-hidden">
                  <img
                    src={wallet.iconUrl}
                    alt={`${wallet.label} icon`}
                    className="w-4 h-4 object-contain"
                    loading="lazy"
                  />
                </span>
                <span className="text-[10px] text-gray-300 font-semibold leading-tight">{wallet.label}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <Button
          onClick={handleConnect}
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
