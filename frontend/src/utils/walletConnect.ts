import EthereumProvider from '@walletconnect/ethereum-provider';

export type TelegramWalletOption = 'metamask' | 'trust' | 'okx' | 'coinbase';

interface WalletConnectSession {
  provider: any;
  address: string;
  disconnect: () => Promise<void>;
}

interface ConnectParams {
  projectId: string;
  chainId: number;
  rpcUrl?: string;
  onStatus?: (message: string) => void;
}

const HTTP_RE = /^https?:\/\//i;

const getConnectedAddress = async (provider: any): Promise<string> => {
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    return Array.isArray(accounts) && accounts[0] ? String(accounts[0]).toLowerCase() : '';
  } catch { return ''; }
};

/**
 * Purge stale WalletConnect data from localStorage.
 * Forces a fresh pairing so display_uri always fires.
 */
const clearStaleWcStorage = () => {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('wc@') || k.startsWith('walletconnect') || k.startsWith('-walletlink'))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ok */ }
};

/**
 * Patch window.open so the WC Modal's deep links go through tg.openLink().
 * Returns a restore function.
 */
const NATIVE_TO_UNIVERSAL: Record<string, string> = {
  metamask: 'https://metamask.app.link/wc',
  cbwallet: 'https://go.cb-w.com/wc',
  trust: 'https://link.trustwallet.com/wc',
  okx: 'https://www.okx.com/download',
};

const nativeSchemeToUniversal = (url: string): string | null => {
  for (const [scheme, base] of Object.entries(NATIVE_TO_UNIVERSAL)) {
    if (url.toLowerCase().startsWith(`${scheme}:`)) {
      const afterScheme = url.replace(/^[^:]+:\/?\/?/, '');
      const qIdx = afterScheme.indexOf('?');
      const query = qIdx >= 0 ? afterScheme.slice(qIdx) : '';
      return query ? `${base}${query}` : base;
    }
  }
  return null;
};

export const patchWindowOpenForTelegram = (): (() => void) | null => {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg?.openLink || typeof tg.openLink !== 'function') return null;

  const openViaTg = (href: string) => {
    try { tg.openLink(href, { try_instant_view: false }); } catch {
      try { tg.openLink(href); } catch { /* give up */ }
    }
  };

  const orig = window.open.bind(window);
  window.open = function patched(url?: string | URL, target?: string, features?: string) {
    const s = String(url ?? '');
    if (!s) return orig(url as string, target, features);

    // Raw WC pairing URIs (wc:ecc22…@2?relay-protocol=irn&…) can't be
    // opened in Telegram WebView — suppress them; the relay handles it.
    if (/^wc:/i.test(s)) return null;

    // Native wallet schemes (metamask://, cbwallet://) → HTTP universal links
    const universal = nativeSchemeToUniversal(s);
    if (universal) { openViaTg(universal); return null; }

    if (HTTP_RE.test(s)) { openViaTg(s); return null; }

    return orig(url as string, target, features);
  };
  return () => { window.open = orig; };
};

/**
 * Standard WalletConnect connection via the official WC Modal.
 *
 * The modal handles: wallet selection UI, deep linking, reconnection, session detection.
 * We only add two things:
 *   1. window.open patch so deep links work in Telegram WebView
 *   2. On visibilitychange, nudge the subscriber to re-subscribe (non-disruptive)
 */
export const connectWallet = async ({
  projectId,
  chainId,
  rpcUrl,
  onStatus,
}: ConnectParams): Promise<WalletConnectSession> => {
  if (!projectId) throw new Error('WalletConnect not configured. Set VITE_WALLETCONNECT_PROJECT_ID.');

  onStatus?.('Cleaning up…');
  clearStaleWcStorage();

  onStatus?.('Initializing WalletConnect…');
  const restoreWindowOpen = patchWindowOpenForTelegram();

  let visHandler: (() => void) | null = null;

  try {
    const provider = await EthereumProvider.init({
      projectId,
      chains: [1],
      optionalChains: [1, chainId],
      showQrModal: true,
      metadata: {
        name: 'Casefun',
        description: 'Casefun – open cases, upgrade items, battle',
        url: 'https://casefun.net',
        icons: ['https://casefun.net/favicon.ico'],
      },
      methods: ['eth_requestAccounts', 'eth_accounts', 'personal_sign', 'eth_signTypedData_v4'],
      optionalMethods: ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_sendTransaction'],
      rpcMap: { 1: 'https://cloudflare-eth.com', ...(rpcUrl ? { [chainId]: rpcUrl } : {}) },
      qrModalOptions: {
        themeMode: 'dark' as const,
        themeVariables: { '--wcm-z-index': '99999' },
      },
    });

    if (provider.session) {
      onStatus?.('Clearing old session…');
      try { await provider.disconnect(); } catch { /* ok */ }
    }

    // Non-disruptive: when user returns from wallet app, re-subscribe to topics.
    // This does NOT close/reopen the WebSocket — just refreshes subscriptions
    // so the relay delivers any pending session approval.
    visHandler = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const sub = provider?.signer?.client?.core?.relayer?.subscriber;
        if (sub && typeof (sub as any).restart === 'function') (sub as any).restart();
      } catch { /* ok */ }
    };
    document.addEventListener('visibilitychange', visHandler);

    onStatus?.('Choose your wallet…');
    await provider.connect();
    onStatus?.('Connected! Getting address…');

    const address = await getConnectedAddress(provider);
    if (!address) {
      await provider.disconnect().catch(() => {});
      throw new Error('Connected but no address returned.');
    }

    return {
      provider,
      address,
      disconnect: async () => { await provider.disconnect().catch(() => {}); },
    };
  } finally {
    restoreWindowOpen?.();
    if (visHandler) document.removeEventListener('visibilitychange', visHandler);
  }
};

export const hasInjectedProvider = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as any).ethereum);

/**
 * Try to restore an existing WalletConnect session from localStorage
 * without showing any UI. Returns a usable provider or null.
 */
export const reconnectProvider = async (params: {
  projectId: string;
  chainId: number;
  rpcUrl?: string;
}): Promise<WalletConnectSession | null> => {
  if (!params.projectId) return null;
  try {
    const provider = await EthereumProvider.init({
      projectId: params.projectId,
      chains: [1],
      optionalChains: [1, params.chainId],
      showQrModal: false,
      metadata: {
        name: 'Casefun',
        description: 'Casefun – open cases, upgrade items, battle',
        url: 'https://casefun.net',
        icons: ['https://casefun.net/favicon.ico'],
      },
      methods: ['eth_requestAccounts', 'eth_accounts', 'personal_sign', 'eth_signTypedData_v4'],
      optionalMethods: ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_sendTransaction'],
      rpcMap: { 1: 'https://cloudflare-eth.com', ...(params.rpcUrl ? { [params.chainId]: params.rpcUrl } : {}) },
    });

    if (!provider.session) return null;

    const address = await getConnectedAddress(provider);
    if (!address) return null;

    return {
      provider,
      address,
      disconnect: async () => { await provider.disconnect().catch(() => {}); },
    };
  } catch {
    return null;
  }
};

const WALLET_REDIRECT_MAP: Record<string, string> = {
  metamask: 'https://metamask.app.link/wc',
  trust: 'https://link.trustwallet.com/wc',
  rainbow: 'https://rnbwapp.com/wc',
  coinbase: 'https://go.cb-w.com/wc',
  okx: 'https://www.okx.com/download?appendQuery=true',
};

/**
 * Open the connected wallet app in Telegram WebView.
 * Detects the wallet from WC session peer metadata and uses the
 * appropriate universal deep link so MetaMask/Trust/etc. opens for
 * pending approval requests.
 */
export const redirectToWallet = (provider: any, delayMs = 600): void => {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg?.openLink) return;

  const peerName = (provider?.session?.peer?.metadata?.name || '').toLowerCase();
  let url = '';
  for (const [key, link] of Object.entries(WALLET_REDIRECT_MAP)) {
    if (peerName.includes(key)) { url = link; break; }
  }
  if (!url) {
    const redirect = provider?.session?.peer?.metadata?.redirect;
    url = redirect?.universal || redirect?.native || '';
  }
  if (!url || !HTTP_RE.test(url)) return;

  setTimeout(() => {
    try { tg.openLink(url, { try_instant_view: false }); } catch {
      try { tg.openLink(url); } catch { /* ok */ }
    }
  }, delayMs);
};

/**
 * Ensure the relay subscriber is fresh before sending a request.
 */
export const nudgeRelay = (provider: any): void => {
  try {
    const sub = provider?.signer?.client?.core?.relayer?.subscriber;
    if (sub && typeof sub.restart === 'function') sub.restart();
  } catch { /* ok */ }
};

/**
 * Wrap an async operation (e.g. sendTransaction) with relay subscriber nudge.
 * When the user returns from the wallet app, subscriber.restart() ensures the
 * relay delivers any pending JSON-RPC responses (tx hash, etc.).
 */
export const withRelayNudge = async <T>(provider: any, fn: () => Promise<T>): Promise<T> => {
  const handler = () => {
    if (document.visibilityState !== 'visible') return;
    nudgeRelay(provider);
  };
  document.addEventListener('visibilitychange', handler);

  const POLL_INTERVAL_MS = 3_000;
  const poll = setInterval(() => nudgeRelay(provider), POLL_INTERVAL_MS);
  try {
    return await fn();
  } finally {
    clearInterval(poll);
    document.removeEventListener('visibilitychange', handler);
  }
};

const WC_SIGN_TIMEOUT_MS = 120_000;

/**
 * personal_sign via WalletConnect with timeout + aggressive relay polling.
 * In Telegram WebView the relay often doesn't deliver the response after
 * the user signs and returns — periodic nudging + a hard timeout prevent
 * the UI from hanging indefinitely.
 */
export const wcPersonalSign = async (
  provider: any,
  msgHex: string,
  address: string,
  timeoutMs: number = WC_SIGN_TIMEOUT_MS,
): Promise<string> => {
  const eip1193 = provider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  if (typeof eip1193?.request !== 'function') {
    throw new Error('Wallet provider is not ready. Try linking again.');
  }

  return withRelayNudge(provider, () => {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Signature timed out. Open the wallet app, sign the message, and try again.')),
        timeoutMs,
      );

      eip1193
        .request({ method: 'personal_sign', params: [msgHex, address] })
        .then((sig) => {
          clearTimeout(timer);
          if (typeof sig !== 'string' || !sig) {
            reject(new Error('Wallet did not return a signature.'));
          } else {
            resolve(sig);
          }
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  });
};
