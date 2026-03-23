import EthereumProvider from '@walletconnect/ethereum-provider';

export type TelegramWalletOption = 'metamask' | 'trust' | 'okx' | 'coinbase';

interface StartWalletConnectParams {
  wallet: TelegramWalletOption;
  projectId: string;
  chainId: number;
  rpcUrl?: string;
  onDeeplink?: (url: string) => void;
}

interface WalletConnectSession {
  provider: any;
  address: string;
  disconnect: () => Promise<void>;
}

const getDeeplinkForWallet = (wallet: TelegramWalletOption, wcUri: string) => {
  const encoded = encodeURIComponent(wcUri);
  switch (wallet) {
    case 'metamask':
      return `https://metamask.app.link/wc?uri=${encoded}`;
    case 'trust':
      return `https://link.trustwallet.com/wc?uri=${encoded}`;
    case 'okx':
      return `okx://walletconnect?uri=${encoded}`;
    case 'coinbase':
      return `https://go.cb-w.com/wc?uri=${encoded}`;
    default:
      return wcUri;
  }
};

const openExternalLink = (url: string) => {
  const tg = (window as any)?.Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.location.href = url;
};

export const connectWalletWithDeeplink = async ({
  wallet,
  projectId,
  chainId,
  rpcUrl,
  onDeeplink,
}: StartWalletConnectParams): Promise<WalletConnectSession> => {
  if (!projectId) {
    throw new Error('WalletConnect is not configured. Add VITE_WALLETCONNECT_PROJECT_ID.');
  }

  const provider = await EthereumProvider.init({
    projectId,
    chains: [chainId],
    optionalChains: [chainId],
    showQrModal: false,
    methods: ['eth_requestAccounts', 'eth_accounts', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4'],
    optionalMethods: ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_sendTransaction'],
    rpcMap: rpcUrl ? { [chainId]: rpcUrl } : undefined,
  });

  provider.on('display_uri', (wcUri: string) => {
    const deeplink = getDeeplinkForWallet(wallet, wcUri);
    onDeeplink?.(deeplink);
    openExternalLink(deeplink);
  });

  await provider.connect();
  const accounts = (await provider.request({ method: 'eth_accounts' })) as string[] | undefined;
  const address = Array.isArray(accounts) && accounts[0] ? String(accounts[0]).toLowerCase() : '';
  if (!address) {
    await provider.disconnect().catch(() => {});
    throw new Error('WalletConnect connected but no wallet address returned.');
  }

  return {
    provider,
    address,
    disconnect: async () => {
      await provider.disconnect().catch(() => {});
    },
  };
};
