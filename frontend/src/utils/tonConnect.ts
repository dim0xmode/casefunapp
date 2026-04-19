import type { TonConnectUI as TonConnectUIType } from '@tonconnect/ui';

let instance: TonConnectUIType | null = null;

export const getTonConnectUI = async (): Promise<TonConnectUIType> => {
  if (instance) {
    try {
      await instance.disconnect();
    } catch {
      // might not be connected — that's fine
    }
    return instance;
  }

  const { TonConnectUI } = await import('@tonconnect/ui');
  instance = new TonConnectUI({
    manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
    restoreConnection: false,
  });
  return instance;
};

export interface TonWalletResult {
  address: string;
  proof?: {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    payload: string;
    signature: string;
    publicKey?: string;
  };
}

export const connectTonWallet = async (): Promise<TonWalletResult> => {
  const ui = await getTonConnectUI();

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  ui.setConnectRequestParameters({
    state: 'ready',
    value: { tonProof: nonce },
  });

  const wallet = await ui.connectWallet();
  const account = ui.account;
  if (!account) throw new Error('No account returned from TON wallet');

  const tonProofItem = (wallet as any).connectItems?.tonProof;
  const rawProof = tonProofItem?.proof ?? tonProofItem;
  const proof = rawProof
    ? { ...rawProof, publicKey: account.publicKey }
    : undefined;

  return { address: account.address, proof };
};

/**
 * Get a TonConnectUI instance that DOES NOT auto-disconnect on access.
 * Used by flows where we need an active session (e.g. sending TON for deposits).
 */
export const getOrConnectTonUI = async (): Promise<TonConnectUIType> => {
  const { TonConnectUI } = await import('@tonconnect/ui');
  if (!instance) {
    instance = new TonConnectUI({
      manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
      restoreConnection: true,
    });
  }
  if (!instance.connected) {
    await instance.connectWallet();
  }
  return instance;
};

export interface TonSendResult {
  /** boc returned by TonConnect — used as txHash field on backend */
  boc: string;
}

/**
 * Send native TON (in nanotons) from the connected user wallet to the given destination.
 * Returns the signed BoC. The backend then resolves it to lt+hash via toncenter.
 *
 * Note: TonConnect's `sendTransaction` only returns the message BoC, not lt/hash.
 * We poll the treasury's incoming tx list on the backend to find the matching deposit.
 */
// TonConnect network IDs: '-3' = testnet, '-239' = mainnet.
export type TonNetwork = 'testnet' | 'mainnet';
const networkToChain = (n?: TonNetwork): string | undefined => {
  if (n === 'testnet') return '-3';
  if (n === 'mainnet') return '-239';
  return undefined;
};

export class TonNetworkMismatchError extends Error {
  walletNetwork: 'mainnet' | 'testnet' | 'unknown';
  required: TonNetwork;
  constructor(required: TonNetwork, walletNetwork: 'mainnet' | 'testnet' | 'unknown') {
    super(
      required === 'testnet'
        ? 'Your TON wallet is connected to Mainnet. Switch to Testnet account in your wallet (Tonkeeper → Settings → Active accounts → enable Testnet) and reconnect.'
        : 'Your TON wallet is connected to Testnet. Switch to Mainnet account and reconnect.'
    );
    this.name = 'TonNetworkMismatchError';
    this.required = required;
    this.walletNetwork = walletNetwork;
  }
}

const detectAccountNetwork = (chain?: string | number | null): 'mainnet' | 'testnet' | 'unknown' => {
  const v = String(chain ?? '');
  if (v === '-239') return 'mainnet';
  if (v === '-3') return 'testnet';
  return 'unknown';
};

export const sendTonTransfer = async (
  destinationAddress: string,
  amountNano: bigint,
  comment?: string,
  network?: TonNetwork
): Promise<TonSendResult> => {
  const ui = await getOrConnectTonUI();
  if (!ui.connected) throw new Error('TON wallet not connected');

  if (network) {
    const walletNet = detectAccountNetwork(ui.account?.chain as any);
    if (walletNet !== 'unknown' && walletNet !== network) {
      throw new TonNetworkMismatchError(network, walletNet);
    }
  }

  let payload: string | undefined;
  if (comment) {
    const { beginCell } = await import('@ton/core');
    const cell = beginCell().storeUint(0, 32).storeStringTail(comment).endCell();
    payload = cell.toBoc().toString('base64');
  }

  const chain = networkToChain(network);
  const tx: any = {
    validUntil: Math.floor(Date.now() / 1000) + 5 * 60,
    ...(chain ? { network: chain } : {}),
    messages: [
      {
        address: destinationAddress,
        amount: amountNano.toString(),
        ...(payload ? { payload } : {}),
      },
    ],
  };
  try {
    const result = await ui.sendTransaction(tx);
    return { boc: result.boc };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (/wrong network/i.test(msg)) {
      const walletNet = detectAccountNetwork(ui.account?.chain as any);
      throw new TonNetworkMismatchError(network ?? 'testnet', walletNet);
    }
    throw err;
  }
};

export const disconnectTon = async (): Promise<void> => {
  if (!instance) return;
  try {
    await instance.disconnect();
  } catch {
    // already disconnected
  }
};
