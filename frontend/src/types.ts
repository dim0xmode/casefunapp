export enum Rarity {
  COMMON = 'COMMON',
  UNCOMMON = 'UNCOMMON',
  RARE = 'RARE',
  LEGENDARY = 'LEGENDARY',
  MYTHIC = 'MYTHIC',
}

export interface Item {
  id: string;
  name: string;
  value: number;
  currency: string;
  rarity: Rarity;
  image: string;
  color: string;
  caseId?: string;
  status?: 'ACTIVE' | 'BURNT';
}

export interface Case {
  id: string;
  name: string;
  currency: string;
  price: number;
  image: string;
  rtu: number; // Return to User percentage (94-96%)
  possibleDrops: Item[];
  creatorName?: string;
  tokenTicker?: string;
  tokenPrice?: number;
  openDurationHours?: number;
  createdAt?: number;
}

export interface Transaction {
  id: string;
  type: 'DEPOSIT';
  amount: number;
  currency: string;
  timestamp: number;
}

export interface BattleRecord {
  id: string;
  opponent: string;
  result: 'WIN' | 'LOSS';
  cost: number;
  wonValue: number;
  wonItems: Item[];
  timestamp: number;
  caseCount: number;
}

export interface User {
  id?: string;
  username: string;
  walletAddress: string;
  balance: number;
  role?: 'USER' | 'ADMIN' | 'MODERATOR';
  avatar: string;
  transactions: Transaction[];
  battleHistory: BattleRecord[];
  stats: {
    casesOpened: number;
    totalWon: number;
    upgradesAttempted: number;
    upgradeSuccessCount: number;
  }
}

export interface FeedItem {
  id: string;
  username: string;
  action: 'OPEN_CASE' | 'UPGRADE_SUCCESS' | 'UPGRADE_FAIL';
  detail: string;
  timestamp: number;
  rarity?: Rarity;
}
