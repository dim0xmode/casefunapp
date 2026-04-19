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

export const sendTonTransfer = async (
  destinationAddress: string,
  amountNano: bigint,
  comment?: string,
  network?: TonNetwork
): Promise<TonSendResult> => {
  const ui = await getOrConnectTonUI();
  if (!ui.connected) throw new Error('TON wallet not connected');

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
  const result = await ui.sendTransaction(tx);
  return { boc: result.boc };
};
