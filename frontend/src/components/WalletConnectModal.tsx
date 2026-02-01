import React from 'react';
import { X } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { Button } from './Button';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (address: string) => void;
}

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({ isOpen, onClose, onConnect }) => {
  const { connectWallet, isConnecting, error } = useWallet();

  if (!isOpen) return null;

  const handleConnect = async () => {
    const address = await connectWallet();
    if (address) {
      onConnect(address);
      onClose();
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
          disabled={isConnecting}
          className="w-full py-4 text-lg"
        >
          {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
        </Button>

        <p className="text-gray-500 text-xs mt-6 text-center">
          By connecting your wallet, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
