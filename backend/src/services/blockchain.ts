import { ethers } from 'ethers';
import { config } from '../config/env.js';

const treasuryAbi = [
  'function withdraw(address to, uint256 amount) external',
  'function transferToken(address token, address to, uint256 amount) external',
  'function mintToken(address token, address to, uint256 amount) external',
];

const tokenFactoryAbi = [
  'event TokenDeployed(address indexed token, string name, string symbol)',
  'function createToken(string name, string symbol) external returns (address)',
];

const caseTokenAbi = [
  'function mint(address to, uint256 amount) external',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

const priceFeedAbi = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];

/**
 * EVM-chain registry.
 *
 * BOT Chain is fully EVM-compatible, so instead of duplicating all the
 * ethers.js wiring we parameterize a single struct per EVM chain and reuse
 * the same deploy/mint/payout/claim code paths. The default `'EVM'` chain
 * keeps its original singleton exports (see aliases at the bottom) so existing
 * imports continue to work unchanged.
 */
export type EvmChainKey = 'EVM' | 'BOT';

interface EvmChain {
  key: EvmChainKey;
  provider: ethers.JsonRpcProvider | null;
  treasurySigner: ethers.Wallet | null;
  treasuryAddress: string;
  tokenFactoryAddress: string;
  payoutAddress: string;
  chainId: number;
  confirmations: number;
  getTreasuryContract: () => ethers.Contract | null;
  getTokenFactoryContract: () => ethers.Contract | null;
  getCaseTokenContract: (address: string) => ethers.Contract | null;
}

const buildEvmChain = (params: {
  key: EvmChainKey;
  rpcUrl: string;
  privateKey: string;
  treasuryAddress: string;
  tokenFactoryAddress: string;
  payoutAddress: string;
  chainId: number;
  confirmations: number;
}): EvmChain => {
  const chainProvider = params.rpcUrl ? new ethers.JsonRpcProvider(params.rpcUrl) : null;
  const signer =
    params.privateKey && chainProvider ? new ethers.Wallet(params.privateKey, chainProvider) : null;

  const chain: EvmChain = {
    key: params.key,
    provider: chainProvider,
    treasurySigner: signer,
    treasuryAddress: params.treasuryAddress,
    tokenFactoryAddress: params.tokenFactoryAddress,
    payoutAddress: params.payoutAddress,
    chainId: params.chainId,
    confirmations: params.confirmations,
    getTreasuryContract: () => {
      if (!signer || !params.treasuryAddress) return null;
      return new ethers.Contract(params.treasuryAddress, treasuryAbi, signer);
    },
    getTokenFactoryContract: () => {
      if (!signer || !params.tokenFactoryAddress) return null;
      return new ethers.Contract(params.tokenFactoryAddress, tokenFactoryAbi, signer);
    },
    getCaseTokenContract: (address: string) => {
      if (!signer) return null;
      return new ethers.Contract(address, caseTokenAbi, signer);
    },
  };

  return chain;
};

const evmChains: Record<EvmChainKey, EvmChain> = {
  EVM: buildEvmChain({
    key: 'EVM',
    rpcUrl: config.ethereumRpcUrl,
    privateKey: config.treasuryPrivateKey,
    treasuryAddress: config.treasuryAddress,
    tokenFactoryAddress: config.tokenFactoryAddress,
    payoutAddress: config.treasuryPayoutAddress || config.bootstrapAdminWallet,
    chainId: config.chainId,
    confirmations: config.confirmations,
  }),
  BOT: buildEvmChain({
    key: 'BOT',
    rpcUrl: config.botRpcUrl,
    privateKey: config.botTreasuryPrivateKey,
    treasuryAddress: config.botTreasuryAddress,
    tokenFactoryAddress: config.botTokenFactoryAddress,
    payoutAddress: config.botTreasuryPayoutAddress || config.bootstrapAdminWallet,
    chainId: config.botChainId,
    confirmations: config.botConfirmations,
  }),
};

/** Resolve the EVM chain struct for a given key (defaults to the main EVM chain). */
export const getEvmChain = (key: EvmChainKey = 'EVM'): EvmChain => evmChains[key];

// ── Backward-compatible aliases for the default EVM chain ──────────────────
export const provider = evmChains.EVM.provider;

export const treasurySigner = evmChains.EVM.treasurySigner;

export const getTreasuryContract = () => evmChains.EVM.getTreasuryContract();

export const getTokenFactoryContract = () => evmChains.EVM.getTokenFactoryContract();

export const getCaseTokenContract = (address: string) =>
  evmChains.EVM.getCaseTokenContract(address);

export const getPriceFeedContract = () => {
  const evmProvider = evmChains.EVM.provider;
  if (!evmProvider || !config.priceFeedAddress) return null;
  return new ethers.Contract(config.priceFeedAddress, priceFeedAbi, evmProvider);
};

export const normalizeAddress = (value?: string | null) => {
  return value ? value.toLowerCase() : '';
};
