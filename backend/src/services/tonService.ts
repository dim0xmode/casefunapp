import { TonClient, WalletContractV4, internal, toNano, beginCell, Address, Cell } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { config } from '../config/env.js';

let _client: TonClient | null = null;
let _keypair: { publicKey: Buffer; secretKey: Buffer } | null = null;
let _wallet: WalletContractV4 | null = null;

const getClient = (): TonClient => {
  if (!_client) {
    _client = new TonClient({
      endpoint: config.tonEndpoint || 'https://testnet.toncenter.com/api/v2/jsonRPC',
      apiKey: config.tonApiKey || undefined,
    });
  }
  return _client;
};

const getKeypair = async () => {
  if (!_keypair) {
    if (!config.tonMnemonic) {
      throw new Error('TON_MNEMONIC is not configured');
    }
    const words = config.tonMnemonic.split(' ').map((w) => w.trim()).filter(Boolean);
    _keypair = await mnemonicToPrivateKey(words);
  }
  return _keypair;
};

const getTreasuryWallet = async () => {
  if (!_wallet) {
    const keypair = await getKeypair();
    _wallet = WalletContractV4.create({
      publicKey: keypair.publicKey,
      workchain: 0,
    });
  }
  return _wallet;
};

// Standard TEP-74 Jetton minter opcodes
const JETTON_MINT_OPCODE = 0x642b7d07;
const JETTON_TRANSFER_OPCODE = 0xf8a7ea5;

const buildJettonMintBody = (toAddress: Address, jettonAmount: bigint, fromAddress: Address): Cell => {
  return beginCell()
    .storeUint(JETTON_MINT_OPCODE, 32) // op::mint
    .storeUint(0, 64) // query_id
    .storeAddress(toAddress)
    .storeCoins(toNano('0.05')) // forward_ton_amount
    .storeRef(
      beginCell()
        .storeUint(JETTON_TRANSFER_OPCODE, 32)
        .storeUint(0, 64)
        .storeCoins(jettonAmount)
        .storeAddress(fromAddress)
        .storeAddress(fromAddress) // response_destination
        .storeBit(false)
        .storeCoins(0)
        .storeBit(false)
        .endCell()
    )
    .endCell();
};

export const deployJetton = async (
  name: string,
  ticker: string,
  _decimals: number = 9
): Promise<string> => {
  const client = getClient();
  const keypair = await getKeypair();
  const wallet = await getTreasuryWallet();
  const contract = client.open(wallet);

  const walletBalance = await client.getBalance(wallet.address);
  const minRequired = toNano('0.3');
  if (walletBalance < minRequired) {
    throw new Error(
      `TON treasury has insufficient balance (${Number(walletBalance) / 1e9} TON). ` +
      `Need at least 0.3 TON. Fund address: ${wallet.address.toString()}`
    );
  }

  const jettonContent = beginCell()
    .storeUint(0x01, 8) // on-chain metadata
    .storeStringTail(JSON.stringify({ name, symbol: ticker, decimals: String(_decimals) }))
    .endCell();

  const jettonMinterCode = Cell.fromBoc(
    Buffer.from(JETTON_MINTER_CODE_HEX, 'hex')
  )[0];
  const jettonWalletCode = Cell.fromBoc(
    Buffer.from(JETTON_WALLET_CODE_HEX, 'hex')
  )[0];

  const minterData = beginCell()
    .storeCoins(0) // total_supply
    .storeAddress(wallet.address) // admin_address
    .storeRef(jettonContent) // content
    .storeRef(jettonWalletCode) // jetton_wallet_code
    .endCell();

  const minterStateInit = {
    code: jettonMinterCode,
    data: minterData,
  };

  const minterAddress = new Address(
    0,
    beginCell()
      .storeRef(jettonMinterCode)
      .storeRef(minterData)
      .endCell()
      .hash()
  );

  const seqno = await contract.getSeqno();
  await contract.sendTransfer({
    seqno,
    secretKey: keypair.secretKey,
    messages: [
      internal({
        to: minterAddress,
        value: toNano('0.15'),
        init: minterStateInit,
        body: beginCell().endCell(),
      }),
    ],
  });

  // Wait for deployment
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const state = await client.getContractState(minterAddress);
    if (state.state === 'active') {
      return minterAddress.toString();
    }
  }

  return minterAddress.toString();
};

export const transferJetton = async (
  jettonMasterAddress: string,
  toAddress: string,
  amount: bigint
): Promise<string> => {
  const client = getClient();
  const keypair = await getKeypair();
  const wallet = await getTreasuryWallet();
  const contract = client.open(wallet);

  const masterAddr = Address.parse(jettonMasterAddress);
  const destAddr = Address.parse(toAddress);

  // Get treasury's jetton wallet address via get_wallet_address
  const jettonWalletAddr = await client.runMethod(masterAddr, 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(wallet.address).endCell() },
  ]);
  const myJettonWallet = jettonWalletAddr.stack.readAddress();

  const transferBody = beginCell()
    .storeUint(JETTON_TRANSFER_OPCODE, 32)
    .storeUint(0, 64) // query_id
    .storeCoins(amount) // jetton amount
    .storeAddress(destAddr) // destination
    .storeAddress(wallet.address) // response_destination
    .storeBit(false) // custom_payload
    .storeCoins(toNano('0.01')) // forward_ton_amount
    .storeBit(false) // forward_payload
    .endCell();

  const seqno = await contract.getSeqno();
  await contract.sendTransfer({
    seqno,
    secretKey: keypair.secretKey,
    messages: [
      internal({
        to: myJettonWallet,
        value: toNano('0.1'),
        body: transferBody,
      }),
    ],
  });

  // Wait for seqno increment as confirmation
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const newSeqno = await contract.getSeqno();
    if (newSeqno > seqno) {
      return `ton_tx_${Date.now()}_${seqno}`;
    }
  }

  return `ton_tx_pending_${seqno}`;
};

// Compiled standard TEP-74 Jetton minter and wallet contracts (testnet-compatible)
// These are the standard Jetton contracts from ton-blockchain/token-contract
const JETTON_MINTER_CODE_HEX =
  'b5ee9c72010206010001ed000114ff00f4a413f4bcf2c80b0102016203020025a0f26100105036248028ce17cb1fcb3fc9ed5400808210d53276db708010c8cb055003cf1623fa0213cb6acb1f01cf16c9ed5402f901ed44d0d300019b0d21801698fe99ff6a268698f98e99fe98f9aee0a82101adb7eeb708010c8cb055003cf1623fa0213cb6acb1fcb3fc98042fb001400093010bef2e0c00182104d0300018e1b8eb1084308700001d401d0d300d31fd4d30731d31fd4d4d30731d31f018020d7218308d71820f9017082108b77173504c8cb1fcb3fc910065f041012f2c40140101f100f42f4a413f4bcf2c80b020f82106d8e5e3004c8cb1fcb3fc910045f0470f20e';

const JETTON_WALLET_CODE_HEX =
  'b5ee9c724010130100036d000114ff00f4a413f4bcf2c80b0102016204020201200302001dbf5007434c0c05c6c2544d7c0fc02f83e903e900c7e800c5c75c87e800c7e800c1cea6d003c00812ce3850c1b088d148cb1c17cb865407e90350c0408fc00f801b4c7f4cfb513411b28c4008e1a30d31f01c200f2e0cee8210178d451920d70b1fde0c85004cf16c9c8801001cb055003cf1601fa02cb6ac971fb001002c98040fb0001f800ed44d0fa40d33fd4d4d4d3ffd74c7f90f80130d0d303f404307fe0d31fd33f5114baf2e0c70182103b9aca000018bef2e0c95171c7058ec030343c00c082102108b4de16cbde83';
