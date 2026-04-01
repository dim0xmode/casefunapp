import type { TelegramWalletOption } from './walletConnect';

export const TELEGRAM_PREFERRED_WALLET_STORAGE_KEY = 'casefun:tgPreferredWallet';

const stripProtocol = (value: string) => String(value || '').replace(/^https?:\/\//i, '');

export const buildWalletBrowserDeepLinks = (wallet: TelegramWalletOption, targetUrl: string) => {
  const safeUrl = String(targetUrl || '').trim();
  const encodedUrl = encodeURIComponent(safeUrl);
  const encodedNoProtocol = encodeURIComponent(stripProtocol(safeUrl));
  if (wallet === 'metamask') {
    return {
      primaryUrl: `https://link.metamask.io/dapp/${encodedNoProtocol}`,
      fallbackUrl: `https://metamask.app.link/dapp/${encodedNoProtocol}`,
    };
  }
  if (wallet === 'trust') {
    return {
      primaryUrl: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodedUrl}`,
      fallbackUrl: `trust://open_url?coin_id=60&url=${encodedUrl}`,
    };
  }
  if (wallet === 'okx') {
    const okxNative = `okx://wallet/dapp/url?dappUrl=${encodedUrl}`;
    return {
      primaryUrl: `https://web3.okx.com/download?deeplink=${encodeURIComponent(okxNative)}`,
      fallbackUrl: okxNative,
    };
  }
  return {
    primaryUrl: `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`,
    fallbackUrl: `cbwallet://dapp?url=${encodedUrl}`,
  };
};

export const isTelegramWebViewContext = () =>
  typeof window !== 'undefined' && Boolean((window as any)?.Telegram?.WebApp);

export const hasInjectedEthereumProvider = () =>
  typeof window !== 'undefined' && typeof window.ethereum?.request === 'function';

export const isWalletLinkBridgeMode = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('walletLinkMode') === 'bridge';
};

export const getWalletLinkModeFromLocation = () => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return String(params.get('walletLinkMode') || '').trim().toLowerCase();
};

export const getWalletLinkBotFromLocation = () => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return String(params.get('bot') || '').trim().replace(/^@+/, '');
};

export const getTopUpBridgeModeFromLocation = () => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return String(params.get('topupMode') || '').trim().toLowerCase();
};

export const getTopUpAmountFromLocation = () => {
  if (typeof window === 'undefined') return 0;
  const params = new URLSearchParams(window.location.search);
  const raw = Number(params.get('amountUsdt'));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

export const isTelegramWalletOption = (value: string): value is TelegramWalletOption =>
  value === 'metamask' || value === 'trust' || value === 'okx' || value === 'coinbase';

const isLegacyTelegramPath = (normalizedPath: string) => /^\/tg\d+(?:$|[/?])/.test(normalizedPath);

export const isTelegramMiniAppPath = (pathname: string) => {
  const normalized = pathname.toLowerCase();
  return (
    normalized === '/tg' ||
    normalized.startsWith('/tg?') ||
    normalized.startsWith('/tg/') ||
    isLegacyTelegramPath(normalized)
  );
};

export const getCanonicalTelegramMiniAppPath = (pathname: string) => {
  const normalized = String(pathname || '').toLowerCase();
  if (normalized === '/tg' || normalized.startsWith('/tg/')) {
    return pathname || '/tg';
  }
  const legacyMatch = normalized.match(/^\/tg\d+(\/.*)?$/);
  if (!legacyMatch) {
    return pathname;
  }
  return `/tg${legacyMatch[1] || ''}`;
};

const REFERRAL_STORAGE_KEY = 'casefun_ref';

export const getRefCodeFromLocation = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('ref');
  const v = raw?.trim();
  return v ? v : null;
};

export const saveRefCode = (code: string) => {
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code.trim());
  } catch {
    // ignore
  }
};

export const getStoredRefCode = (): string | null => {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const clearRefCode = () => {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
};
