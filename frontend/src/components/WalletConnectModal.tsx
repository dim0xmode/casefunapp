import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

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
          Connect your MetaMask wallet to access all features of CaseFun.
        </p>

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
          {isConnecting ? 'Connecting...' : isAuthLoading ? 'Signing...' : 'Connect MetaMask'}
        </Button>
        {isAuthLoading && (
          <div className="mt-3 text-[11px] uppercase tracking-widest text-gray-500 text-center">
            Confirm signature in MetaMask
          </div>
        )}

        <p className="text-gray-500 text-xs mt-6 text-center">
          By connecting your wallet, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
