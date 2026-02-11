import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

const rpcUrl = process.env.ETHEREUM_RPC_URL || '';
const privateKey = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY || '';

const config: HardhatUserConfig = {
  solidity: '0.8.20',
  networks: {
    sepolia: rpcUrl && privateKey ? {
      url: rpcUrl,
      accounts: [privateKey],
    } : undefined,
  },
};

export default config;
