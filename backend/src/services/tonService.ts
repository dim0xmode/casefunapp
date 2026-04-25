import { TonClient, WalletContractV4, internal, toNano, beginCell, Address, Cell } from '@ton/ton';
import { contractAddress } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { config } from '../config/env.js';
import { tonQueue } from './chainQueue.js';

let _client: TonClient | null = null;
let _keypair: { publicKey: Buffer; secretKey: Buffer } | null = null;
let _wallet: WalletContractV4 | null = null;

export const getTonClient = (): TonClient => {
  if (!_client) {
    _client = new TonClient({
      endpoint: config.tonEndpoint || 'https://testnet.toncenter.com/api/v2/jsonRPC',
      apiKey: config.tonApiKey || undefined,
    });
  }
  return _client;
};

/**
 * Retry a TON RPC call with exponential backoff for transient failures
 * (rate limits 429, network blips, gateway errors). Toncenter limits
 * anonymous tier to ~1 RPS — without an API key we WILL hit 429.
 */
const retryTonCall = async <T>(fn: () => Promise<T>, attempts = 6, initialDelayMs = 1500): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status ?? err?.status;
      const message = String(err?.message || err?.response?.data?.error || '');
      const isRateLimited = status === 429 || /429|rate ?limit|too many/i.test(message);
      const isTransient = isRateLimited || status === 502 || status === 503 || status === 504 || /ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);
      if (!isTransient || i === attempts - 1) throw err;
      const delay = initialDelayMs * Math.pow(2, i) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
};

export const getTonKeypair = async () => {
  if (!_keypair) {
    if (!config.tonMnemonic) {
      throw new Error('TON_MNEMONIC is not configured');
    }
    const words = config.tonMnemonic.split(' ').map((w) => w.trim()).filter(Boolean);
    _keypair = await mnemonicToPrivateKey(words);
  }
  return _keypair;
};

export const getTonTreasuryWallet = async () => {
  if (!_wallet) {
    const keypair = await getTonKeypair();
    _wallet = WalletContractV4.create({
      publicKey: keypair.publicKey,
      workchain: 0,
    });
  }
  return _wallet;
};

// TEP-74 Jetton opcodes (from official ton-blockchain/jetton-contract)
const OP_MINT = 0x642b7d07;
const OP_INTERNAL_TRANSFER = 0x178d4519;
const OP_TRANSFER = 0xf8a7ea5;

/**
 * Build TEP-64 off-chain metadata content cell.
 * Uses a base64 data URI so we don't need IPFS/Pinata.
 */
const buildJettonContent = (name: string, symbol: string, decimals: number): Cell => {
  const metadata = {
    name,
    symbol,
    description: `${name} — case token on Casefun`,
    decimals: String(decimals),
    image: '',
  };
  const dataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
  return beginCell()
    .storeUint(0x01, 8) // off-chain prefix per TEP-64
    .storeStringTail(dataUri)
    .endCell();
};

/**
 * Build the initial data cell for the standard Jetton minter.
 * Layout per ton-blockchain/jetton-contract: supply, admin, transfer_admin, wallet_code, content
 */
const buildJettonMinterData = (adminAddress: Address, walletCode: Cell, content: Cell): Cell => {
  return beginCell()
    .storeCoins(0) // total_supply
    .storeAddress(adminAddress) // admin
    .storeAddress(null) // transfer_admin
    .storeRef(walletCode) // jetton_wallet_code
    .storeRef(content) // jetton_content
    .endCell();
};

/**
 * Build mint message body.
 * Outer: op::mint (0x642b7d07) | query_id | to_address | total_ton_amount | ref(internal_transfer)
 * Inner (internal_transfer): op | query_id | jetton_amount | from | response | forward_ton | maybe_ref(payload)
 */
const buildMintBody = (
  toAddress: Address,
  jettonAmount: bigint,
  fromAddress: Address,
  totalTonAmount: bigint,
  forwardTonAmount: bigint
): Cell => {
  const internalTransfer = beginCell()
    .storeUint(OP_INTERNAL_TRANSFER, 32)
    .storeUint(0, 64)
    .storeCoins(jettonAmount)
    .storeAddress(fromAddress) // from_address
    .storeAddress(fromAddress) // response_address
    .storeCoins(forwardTonAmount)
    .storeMaybeRef(null) // forward_payload
    .endCell();

  return beginCell()
    .storeUint(OP_MINT, 32)
    .storeUint(0, 64)
    .storeAddress(toAddress)
    .storeCoins(totalTonAmount)
    .storeRef(internalTransfer)
    .endCell();
};

/**
 * Get current TON treasury balance and address (for admin panel).
 */
export const getTonTreasuryStatus = async (): Promise<{
  address: string;
  addressFriendly: string;
  balance: string;
  balanceTon: number;
  network: 'mainnet' | 'testnet';
  configured: boolean;
}> => {
  if (!config.tonMnemonic) {
    return {
      address: '',
      addressFriendly: '',
      balance: '0',
      balanceTon: 0,
      network: (config.tonEndpoint || '').includes('testnet') ? 'testnet' : 'mainnet',
      configured: false,
    };
  }
  const client = getTonClient();
  const wallet = await getTonTreasuryWallet();
  const balance = await retryTonCall(() => client.getBalance(wallet.address));
  return {
    address: wallet.address.toRawString(),
    addressFriendly: wallet.address.toString({ bounceable: false, testOnly: (config.tonEndpoint || '').includes('testnet') }),
    balance: balance.toString(),
    balanceTon: Number(balance) / 1e9,
    network: (config.tonEndpoint || '').includes('testnet') ? 'testnet' : 'mainnet',
    configured: true,
  };
};

/**
 * Deploy a new TEP-74 Jetton minter contract on TON.
 * Returns the deployed minter address (raw form).
 */
export const deployJetton = async (
  name: string,
  ticker: string,
  decimals: number = 9
): Promise<string> => tonQueue.enqueue(`deployJetton:${ticker}`, async () => {
  const client = getTonClient();
  const keypair = await getTonKeypair();
  const wallet = await getTonTreasuryWallet();
  const contract = client.open(wallet);

  const walletBalance = await retryTonCall(() => client.getBalance(wallet.address));
  const minRequired = toNano('0.3');
  if (walletBalance < minRequired) {
    throw new Error(
      `TON treasury has insufficient balance (${Number(walletBalance) / 1e9} TON). ` +
      `Need at least 0.3 TON. Fund address: ${wallet.address.toString()}`
    );
  }

  const minterCode = Cell.fromBoc(Buffer.from(JETTON_MINTER_CODE_HEX, 'hex'))[0];
  const walletCode = Cell.fromBoc(Buffer.from(JETTON_WALLET_CODE_HEX, 'hex'))[0];

  const content = buildJettonContent(name, ticker, decimals);
  const minterData = buildJettonMinterData(wallet.address, walletCode, content);

  const init = { code: minterCode, data: minterData };
  const minterAddress = contractAddress(0, init);

  const seqno = await retryTonCall(() => contract.getSeqno());
  await retryTonCall(() => contract.sendTransfer({
    seqno,
    secretKey: keypair.secretKey,
    messages: [
      internal({
        to: minterAddress,
        value: toNano('0.15'),
        init,
        body: beginCell().endCell(),
        bounce: false,
      }),
    ],
  }));

  // Wait for the minter contract to be deployed and active.
  // Polls every 3s (avoids 1RPS toncenter limit when no API key is set).
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const state = await retryTonCall(() => client.getContractState(minterAddress));
      if (state.state === 'active') {
        return minterAddress.toString();
      }
    } catch {
      // Network blip — keep polling.
    }
  }

  return minterAddress.toString();
});

/**
 * Mint Jettons from the deployed minter to a destination address.
 * Used during case opening / claim flow when the treasury holds Jettons in trust.
 */
export const mintJetton = async (
  jettonMasterAddress: string,
  toAddress: string,
  amount: bigint
): Promise<string> => tonQueue.enqueue(`mintJetton:${jettonMasterAddress.slice(0, 8)}`, async () => {
  const client = getTonClient();
  const keypair = await getTonKeypair();
  const wallet = await getTonTreasuryWallet();
  const contract = client.open(wallet);

  const masterAddr = Address.parse(jettonMasterAddress);
  const destAddr = Address.parse(toAddress);

  const body = buildMintBody(
    destAddr,
    amount,
    wallet.address,
    toNano('0.05'), // total_ton_amount sent to internal_transfer
    toNano('0.01') // forward_ton_amount (notification)
  );

  const seqno = await retryTonCall(() => contract.getSeqno());
  await retryTonCall(() => contract.sendTransfer({
    seqno,
    secretKey: keypair.secretKey,
    messages: [
      internal({
        to: masterAddr,
        value: toNano('0.1'),
        body,
      }),
    ],
  }));

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const newSeqno = await retryTonCall(() => contract.getSeqno());
      if (newSeqno > seqno) {
        return `ton_mint_${Date.now()}_${seqno}`;
      }
    } catch {
      // Network blip — keep polling.
    }
  }
  return `ton_mint_pending_${seqno}`;
});

/**
 * Transfer Jettons already held by the treasury to a destination address.
 * Used when the treasury already owns the tokens (rather than minting on-demand).
 */
export const transferJetton = async (
  jettonMasterAddress: string,
  toAddress: string,
  amount: bigint
): Promise<string> => tonQueue.enqueue(`transferJetton:${jettonMasterAddress.slice(0, 8)}`, async () => {
  const client = getTonClient();
  const keypair = await getTonKeypair();
  const wallet = await getTonTreasuryWallet();
  const contract = client.open(wallet);

  const masterAddr = Address.parse(jettonMasterAddress);
  const destAddr = Address.parse(toAddress);

  const result = await retryTonCall(() => client.runMethod(masterAddr, 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(wallet.address).endCell() },
  ]));
  const myJettonWallet = result.stack.readAddress();

  const transferBody = beginCell()
    .storeUint(OP_TRANSFER, 32)
    .storeUint(0, 64) // query_id
    .storeCoins(amount)
    .storeAddress(destAddr) // destination
    .storeAddress(wallet.address) // response_destination
    .storeBit(false) // custom_payload (none)
    .storeCoins(toNano('0.01')) // forward_ton_amount
    .storeBit(false) // forward_payload (none)
    .endCell();

  const seqno = await retryTonCall(() => contract.getSeqno());
  await retryTonCall(() => contract.sendTransfer({
    seqno,
    secretKey: keypair.secretKey,
    messages: [
      internal({
        to: myJettonWallet,
        value: toNano('0.1'),
        body: transferBody,
      }),
    ],
  }));

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const newSeqno = await retryTonCall(() => contract.getSeqno());
      if (newSeqno > seqno) {
        return `ton_tx_${Date.now()}_${seqno}`;
      }
    } catch {
      // Network blip — keep polling.
    }
  }
  return `ton_tx_pending_${seqno}`;
});

/**
 * Look up a TON deposit transaction by its lt+hash on the treasury address.
 * Returns null if not found yet (tx may still be in mempool / not finalised).
 *
 * Toncenter's `getTransactions` lets us fetch a batch of recent treasury txs;
 * we then locate the one matching the given lt/hash and verify it's an
 * incoming transfer with the expected sender + amount.
 */
export type TonDepositTx = {
  lt: string;
  hash: string;
  from: string;
  to: string;
  amountNano: bigint;
  utime: number;
};

const isTestnet = (): boolean => (config.tonEndpoint || '').includes('testnet');

/**
 * Convert ANY TON address representation (raw `0:hex`, friendly `EQ…`/`UQ…`/`0Q…`/`kQ…`)
 * into the canonical user-friendly form (non-bounceable, with the correct testnet flag).
 *
 * The wallet sends raw form via TonConnect, but users see/copy the friendly form
 * in their wallet apps. We always store and display friendly so the two match.
 */
export const toFriendlyTonAddress = (raw: string): string => {
  if (!raw) return '';
  try {
    return Address.parse(raw).toString({
      urlSafe: true,
      bounceable: false,
      testOnly: isTestnet(),
    });
  } catch {
    return raw;
  }
};

const normaliseTonAddress = (raw: string): string => toFriendlyTonAddress(raw);

export const tonAddressesEqual = (a: string, b: string): boolean => {
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
};

/**
 * Fetch recent treasury transactions and return the incoming ones (in_msg.value > 0
 * and source is set). Used for both lt/hash lookups and address-based scans.
 */
export const fetchTreasuryIncoming = async (limit = 25): Promise<TonDepositTx[]> => {
  const client = getTonClient();
  const wallet = await getTonTreasuryWallet();
  const txs = await retryTonCall(() => client.getTransactions(wallet.address, { limit }));

  const out: TonDepositTx[] = [];
  for (const tx of txs) {
    const inMsg: any = (tx as any).inMessage;
    if (!inMsg) continue;
    const info = inMsg.info;
    if (!info || info.type !== 'internal') continue;
    const value = info.value?.coins;
    if (!value || value <= 0n) continue;
    const src = info.src;
    if (!src) continue;

    out.push({
      lt: String((tx as any).lt),
      hash: (tx as any).hash().toString('hex'),
      from: normaliseTonAddress(src.toString()),
      to: normaliseTonAddress(info.dest.toString()),
      amountNano: BigInt(value),
      utime: Number((tx as any).now ?? 0),
    });
  }
  return out;
};

/**
 * Locate a specific deposit by lt + hash. Returns null when not yet visible
 * on chain (caller should retry shortly).
 */
export const findTreasuryDepositByLtHash = async (
  lt: string,
  hash: string
): Promise<TonDepositTx | null> => {
  const txs = await fetchTreasuryIncoming(50);
  const target = txs.find((t) => t.lt === String(lt) && t.hash === hash.toLowerCase());
  return target || null;
};

/**
 * Find a recent deposit from a specific TON address that has not been recorded yet.
 * Used by the scan-deposit fallback when the client can't return lt+hash directly.
 */
export const findRecentDepositFromAddress = async (
  fromAddress: string,
  options: { limit?: number; sinceUtime?: number } = {}
): Promise<TonDepositTx | null> => {
  const txs = await fetchTreasuryIncoming(options.limit ?? 50);
  const since = options.sinceUtime ?? 0;
  for (const tx of txs) {
    if (tx.utime < since) continue;
    if (tonAddressesEqual(tx.from, fromAddress)) return tx;
  }
  return null;
};

// ──────────────────────────────────────────────────────────────────────────
// Compiled standard TEP-74 Jetton minter & wallet contracts.
// Source: https://github.com/ton-blockchain/jetton-contract (v2.0.0 build artifacts)
// ──────────────────────────────────────────────────────────────────────────

const JETTON_MINTER_CODE_HEX =
  'b5ee9c7241021601000494000114ff00f4a413f4bcf2c80b0102016202110202cb031002f5d0cb434c0c05c6c238ecc200835c874c7c0608405e351466ea44c38601035c87e800c3b51343e803e903e90353534541168504d3214017e809400f3c58073c5b333327b55383e903e900c7e800c7d007e800c7e80004c5c3e0e80b4c7c04074cfc044bb51343e803e903e9035353449a084190adf41eeb8c08e4960407019635355161c705f2e04904fa4021fa4430c000f2e14dfa00d4d120d0d31f018210178d4519baf2e0488040d721fa00fa4031fa4031fa0020d70b009ad74bc00101c001b0f2b19130e254431b05018e2191729171e2f839206e938127519120e2216e94318128c39101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b025597f0600ea820898968070fb02f828450470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d0c8801801cb0501cf1658fa02029858775003cb6bcccc9730017158cb6acce2c98011fb005005a04314c85005fa025003cf1601cf16ccccc9ed5403f682107bdd97deba8ee53505fa00fa40f82854120770546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d05008c705f2e04a12a144145036c85005fa025003cf1601cf16ccccc9ed54fa40d120d70b01c000b3915be30de02582102c76b973bae302342408090b0044c8801001cb0501cf1670fa027001cb6a8210d53276db01cb1f0101cb3fc98042fb0001fe355f033401fa40d2000101d195c821cf16c9916de2c8801001cb055004cf1670fa027001cb6a8210d173540001cb1f500401cb3f23fa4430c0008e35f828440470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d012cf1697316c127001cb01e2f400c980500a0004fb0004fe82106501f354ba8e2130335142c705f2e04902fa40d1400304c85005fa025003cf1601cf16ccccc9ed54e0248210fb88e119ba8e20313303d15131c705f2e0498b024034c85005fa025003cf1601cf16ccccc9ed54e02482107431f221bae30237238210cb862902bae302365b2082102508d66abae3026c318210d372158c0c0d0e0f004430335042c705f2e04901d18b028b024034c85005fa025003cf1601cf16ccccc9ed540044335142c705f2e049c85003cf16c9134440c85005fa025003cf1601cf16ccccc9ed54001e3002c705f2e049d4d4d101ed54fb04000cbadc840ff2f0001da23864658380e78b64814183fa0bc002012012130025bd9adf6a2687d007d207d206a6a6888122f82402027114150085adbcf6a2687d007d207d206a6a688a2f827c1400b82a3002098a81e46581ac7d0100e78b00e78b6490e4658089fa00097a00658064fc80383a6465816503e5ffe4e84000cfaf16f6a2687d007d207d206a6a68bf99e836c1783872ebdb514d9c97c283b7f0ae5179029e2b6119c39462719e4f46ed8f7413e62c780a417877407e978f01a40711411b1acb773a96bdd93fa83bb5ca8435013c8c4b3ac91f4589cc780a38646583fa0064a18040707b3bbd';

const JETTON_WALLET_CODE_HEX =
  'b5ee9c7241020f01000380000114ff00f4a413f4bcf2c80b01020162020c02f8d001d0d3030171b08e48135f038020d721ed44d0d303fa00fa40fa40d104d31f01840f218210178d4519ba0282107bdd97deba12b1f2f48040d721fa003012a0401303c8cb0358fa0201cf1601cf16c9ed54e0fa40fa4031fa0031f401fa0031fa00013170f83a02d31f012082100f8a7ea5ba8e85303459db3ce033030601f603d33f0101fa00fa4021fa4430c000f2e14ded44d0d303fa00fa40fa40d1521ac705f2e0495115a120c2fff2aff82a54259070546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d004fa40f401fa002020d70b009ad74bc00101c001b0f2b19130e20401fec88210178d451901cb1f500a01cb3f5008fa0223cf1601cf1626fa025007cf16c9c8801801cb055004cf1670fa024063775003cb6bccccc945372191729171e2f839206e938127519120e2216e94318128c39101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b00405002a8050fb005803c8cb0358fa0201cf1601cf16c9ed54025c228210178d4519ba8e84325adb3ce034218210595f07bcba8e843101db3ce0135f038210d372158cbadc840ff2f0070a03e8ed44d0d303fa00fa40fa40d107d33f0101fa00fa40fa4053bac705f82a5464e070546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d0500cc7051bb1f2e04a5152a009fa0021925f04e30d22d70b01c000b3953010246c31e30d500308090b0060c882107362d09c01cb1f2501cb3f5004fa0258cf1658cf16c9c8801001cb0524cf1658fa02017158cb6accc98011fb0000785054a1f82fa07381040982100966018070f837b60972fb02c8801001cb0501cf1670fa027001cb6a8210d53276db01cb1f5801cb3fc9810082fb000101f2ed44d0d303fa00fa40fa40d106d33f0101fa00fa40f401d15141a15238c705f2e04926c2fff2afc882107bdd97de01cb1f5801cb3f01fa0221cf1658cf16c9c8801801cb0526cf1670fa02017158cb6accc903f839206e9430811703de718102f270f8380170f836a0811a6570f836a0bcf2b0028050fb00030b002003c8cb0358fa0201cf1601cf16c9ed540201200d0e0027bfd8176a2686981fd007d207d206899fc15209840021bc508f6a2686981fd007d207d2068af81c054e4a66';
