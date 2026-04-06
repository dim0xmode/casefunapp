import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserProvider } from 'ethers';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface DiscoveredWallet {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: EIP1193Provider;
}

type EIP1193Provider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, callback: (args: any) => void) => void;
  removeListener?: (event: string, callback: (args: any) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isCoinbaseBrowser?: boolean;
  isOKExWallet?: boolean;
  isOkxWallet?: boolean;
  isBraveWallet?: boolean;
  providers?: EIP1193Provider[];
};

const findProviderByLabel = (label: string): EIP1193Provider | null => {
  const eth = (window as any).ethereum as EIP1193Provider | undefined;
  if (!eth) return null;

  const providers: EIP1193Provider[] | undefined = eth.providers;
  if (!Array.isArray(providers) || providers.length === 0) return eth;

  const key = label.toLowerCase();
  if (key.includes('metamask')) return providers.find((p) => p.isMetaMask && !p.isBraveWallet) ?? null;
  if (key.includes('trust')) return providers.find((p) => p.isTrust || p.isTrustWallet) ?? null;
  if (key.includes('okx')) return providers.find((p) => p.isOKExWallet || p.isOkxWallet) ?? null;
  if (key.includes('coinbase')) return providers.find((p) => p.isCoinbaseWallet || p.isCoinbaseBrowser) ?? null;
  return eth;
};

export const useWallet = () => {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const [discoveredWallets, setDiscoveredWallets] = useState<DiscoveredWallet[]>([]);
  const activeProviderRef = useRef<EIP1193Provider | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const wallets = new Map<string, DiscoveredWallet>();

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.info?.uuid || !detail?.provider) return;
      wallets.set(detail.info.uuid, {
        uuid: detail.info.uuid,
        name: detail.info.name ?? '',
        icon: detail.info.icon ?? '',
        rdns: detail.info.rdns ?? '',
        provider: detail.provider,
      });
      setDiscoveredWallets(Array.from(wallets.values()));
    };

    window.addEventListener('eip6963:announceProvider', handler);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', handler);
  }, []);

  const resolveProvider = useCallback((): EIP1193Provider | null => {
    return activeProviderRef.current ?? (window as any).ethereum ?? null;
  }, []);

  const checkMetaMask = (): boolean => {
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).ethereum !== 'undefined' &&
      typeof (window as any).ethereum?.request === 'function'
    );
  };

  const connectWithProvider = useCallback(async (provider: EIP1193Provider): Promise<string | null> => {
    setWalletState((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      const bp = new BrowserProvider(provider as any);
      const accounts = await bp.send('eth_requestAccounts', []);
      if (accounts && accounts.length > 0) {
        activeProviderRef.current = provider;
        setWalletState({ address: accounts[0], isConnected: true, isConnecting: false, error: null });
        return accounts[0];
      }
    } catch (error: any) {
      let errorMessage = 'Wallet connection error';
      if (error.code === 4001) errorMessage = 'User rejected the connection request';
      else if (error.code === -32002) errorMessage = 'Request already pending. Check your wallet';
      else if (error.message) errorMessage = error.message;
      setWalletState((prev) => ({ ...prev, isConnecting: false, error: errorMessage }));
    }
    return null;
  }, []);

  const connectWallet = useCallback(async (walletLabel?: string) => {
    if (walletLabel) {
      const eipWallet = discoveredWallets.find((w) => w.name.toLowerCase().includes(walletLabel.toLowerCase()));
      if (eipWallet) return connectWithProvider(eipWallet.provider);

      const legacyProvider = findProviderByLabel(walletLabel);
      if (legacyProvider) return connectWithProvider(legacyProvider);
    }

    if (!checkMetaMask()) {
      setWalletState((prev) => ({
        ...prev,
        error: 'No wallet extension found. Install MetaMask or another EVM wallet.',
      }));
      return null;
    }

    return connectWithProvider((window as any).ethereum);
  }, [discoveredWallets, connectWithProvider]);

  const disconnectWallet = () => {
    activeProviderRef.current = null;
    setWalletState({ address: null, isConnected: false, isConnecting: false, error: null });
  };

  const getCurrentAddress = async () => {
    if (!checkMetaMask()) return null;
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const accounts = await provider.send('eth_accounts', []);
      if (accounts && accounts.length > 0) {
        setWalletState((prev) => ({ ...prev, address: accounts[0], isConnected: true }));
        return accounts[0];
      }
    } catch (error) {
      console.error('Error getting address:', error);
    }
    return null;
  };

  const getProvider = () => {
    const p = resolveProvider();
    if (!p) return null;
    return new BrowserProvider(p as any);
  };

  const getChainId = async () => {
    const provider = getProvider();
    if (!provider) return null;
    const network = await provider.getNetwork();
    return Number(network.chainId);
  };

  const ensureChain = async (chainId: number, rpcUrl?: string, explorerUrl?: string) => {
    const p = resolveProvider();
    if (!p) return false;
    const targetHex = `0x${chainId.toString(16)}`;
    try {
      const currentId = await getChainId();
      if (currentId === chainId) return true;
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] });
      return true;
    } catch (error: any) {
      if (error?.code !== 4902) return false;
      try {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: targetHex,
            chainName: 'Sepolia',
            rpcUrls: rpcUrl ? [rpcUrl] : [],
            nativeCurrency: { name: 'SepoliaETH', symbol: 'SEP', decimals: 18 },
            blockExplorerUrls: explorerUrl ? [explorerUrl] : [],
          }],
        });
        return true;
      } catch {
        return false;
      }
    }
  };

  const formatAddress = (address: string | null): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  useEffect(() => {
    getCurrentAddress();

    if (checkMetaMask() && (window as any).ethereum) {
      const eth = (window as any).ethereum;
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletState((prev) => ({ ...prev, address: accounts[0], isConnected: true, error: null }));
        } else {
          activeProviderRef.current = null;
          setWalletState({ address: null, isConnected: false, isConnecting: false, error: null });
        }
      };

      const handleChainChanged = () => window.location.reload();

      if (typeof eth.on === 'function') {
        eth.on('accountsChanged', handleAccountsChanged);
        eth.on('chainChanged', handleChainChanged);
      }

      return () => {
        if (eth && typeof eth.removeListener === 'function') {
          eth.removeListener('accountsChanged', handleAccountsChanged);
          eth.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  return {
    ...walletState,
    connectWallet,
    connectWithProvider,
    disconnectWallet,
    formatAddress,
    checkMetaMask,
    getProvider,
    getChainId,
    ensureChain,
    discoveredWallets,
  };
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on?: (event: string, callback: (args: any) => void) => void;
      removeListener?: (event: string, callback: (args: any) => void) => void;
      isMetaMask?: boolean;
      providers?: any[];
    };
  }
}
