import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

const rpcUrl = process.env.ETHEREUM_RPC_URL || '';
const privateKey = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY || '';

// BOT Chain (Bohr testnet) — EVM-compatible L1, Chain ID 968.
const botRpcUrl = process.env.BOT_RPC_URL || 'https://rpc.bohr.life';
const botPrivateKey =
  process.env.BOT_TREASURY_PRIVATE_KEY ||
  process.env.TREASURY_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  '';
const botChainId = parseInt(process.env.BOT_CHAIN_ID || '968', 10);

const config: HardhatUserConfig = {
  solidity: '0.8.20',
  networks: {
    sepolia: rpcUrl && privateKey ? {
      url: rpcUrl,
      accounts: [privateKey],
    } : undefined,
    botTestnet: botRpcUrl && botPrivateKey ? {
      url: botRpcUrl,
      chainId: botChainId,
      accounts: [botPrivateKey],
    } : undefined,
  },
};

export default config;
