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

export const provider = config.ethereumRpcUrl
  ? new ethers.JsonRpcProvider(config.ethereumRpcUrl)
  : null;

export const treasurySigner =
  config.treasuryPrivateKey && provider
    ? new ethers.Wallet(config.treasuryPrivateKey, provider)
    : null;

export const getTreasuryContract = () => {
  if (!treasurySigner || !config.treasuryAddress) return null;
  return new ethers.Contract(config.treasuryAddress, treasuryAbi, treasurySigner);
};

export const getTokenFactoryContract = () => {
  if (!treasurySigner || !config.tokenFactoryAddress) return null;
  return new ethers.Contract(config.tokenFactoryAddress, tokenFactoryAbi, treasurySigner);
};

export const getCaseTokenContract = (address: string) => {
  if (!treasurySigner) return null;
  return new ethers.Contract(address, caseTokenAbi, treasurySigner);
};

export const getPriceFeedContract = () => {
  if (!provider || !config.priceFeedAddress) return null;
  return new ethers.Contract(config.priceFeedAddress, priceFeedAbi, provider);
};

export const normalizeAddress = (value?: string | null) => {
  return value ? value.toLowerCase() : '';
};
