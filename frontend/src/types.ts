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
  imageMeta?: ImageMeta;
  caseId?: string;
  status?: 'ACTIVE' | 'BURNT';
  claimedAt?: string;
  claimedTxHash?: string;
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
  imageMeta?: ImageMeta;
  tokenAddress?: string;
  tokenDecimals?: number;
  mintedAt?: number;
  totalSupply?: number;
  stats?: {
    totalOpenings: number;
    totalSpentUsdt: number;
    totalTokenFromOpens: number;
    totalTokenFromUpgrades: number;
    totalTokenFromBattles: number;
    totalTokenIssued: number;
    upgradesUsed: number;
    battlesUsed: number;
    actualRtu?: number | null;
    topHolders?: { userId: string; username: string; total: number }[];
  };
}

export interface ImageMeta {
  fit?: 'contain' | 'cover';
  scale?: number;
  x?: number;
  y?: number;
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
  hasLinkedWallet?: boolean;
  walletLinkedAt?: string | number | null;
  balance: number;
  role?: 'USER' | 'ADMIN' | 'MODERATOR' | 'SUPPORT';
  avatar?: string;
  avatarMeta?: ImageMeta;
  telegramId?: string | null;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
  telegramPhotoUrl?: string | null;
  telegramLinkedAt?: string | number | null;
  twitterId?: string | null;
  twitterUsername?: string | null;
  twitterName?: string | null;
  twitterLinkedAt?: string | number | null;
  referralCode?: string | null;
  referralConfirmedCount?: number;
  /** Set at signup when the user registered via ?ref= */
  referredById?: string | null;
  /** When referral qualification was met (e.g. 5 ₮+ on-chain deposits) */
  referralConfirmedAt?: string | null;
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
