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
