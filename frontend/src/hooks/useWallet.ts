import { useState, useEffect } from 'react';
import { BrowserProvider } from 'ethers';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export const useWallet = () => {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const checkMetaMask = (): boolean => {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
  };

  const connectWallet = async () => {
    if (!checkMetaMask()) {
      setWalletState(prev => ({
        ...prev,
        error: 'MetaMask is not installed. Please install MetaMask extension.',
      }));
      return null;
    }

    setWalletState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setWalletState({
          address,
          isConnected: true,
          isConnecting: false,
          error: null,
        });
        return address;
      }
    } catch (error: any) {
      let errorMessage = 'Wallet connection error';
      
      if (error.code === 4001) {
        errorMessage = 'User rejected the connection request';
      } else if (error.code === -32002) {
        errorMessage = 'Request already pending. Check MetaMask';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setWalletState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
    }

    return null;
  };

  const disconnectWallet = () => {
    setWalletState({
      address: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    });
  };

  const getCurrentAddress = async () => {
    if (!checkMetaMask()) return null;

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_accounts', []);
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setWalletState(prev => ({
          ...prev,
          address,
          isConnected: true,
        }));
        return address;
      }
    } catch (error) {
      console.error('Error getting address:', error);
    }

    return null;
  };

  const formatAddress = (address: string | null): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  useEffect(() => {
    getCurrentAddress();

    if (checkMetaMask() && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          const newAddress = accounts[0];
          setWalletState(prev => ({
            ...prev,
            address: newAddress,
            isConnected: true,
            error: null,
          }));
        } else {
          setWalletState({
            address: null,
            isConnected: false,
            isConnecting: false,
            error: null,
          });
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum && window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  return {
    ...walletState,
    connectWallet,
    disconnectWallet,
    formatAddress,
    checkMetaMask,
  };
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (args: any) => void) => void;
      removeListener: (event: string, callback: (args: any) => void) => void;
      isMetaMask?: boolean;
    };
  }
}
