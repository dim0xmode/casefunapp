export type RewardCaseStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type RewardCaseCurrency = 'CFP' | 'USDT' | 'TEST_CFP' | 'TEST_USDT';
export type RewardDropKind = 'USDT' | 'CFT' | 'NFT' | 'TEST_USDT' | 'TEST_CFT' | 'TEST_NFT';
export type RewardCaseLimitMode = 'NONE' | 'BY_OPENS' | 'BY_DROP';

export interface RewardDropSummary {
  id: string;
  kind: RewardDropKind;
  name: string;
  amount: number;
  probability: number;
  rarity: string;
  color: string;
  image: string | null;
  nftChain?: string | null;
  nftContract?: string | null;
}

export interface RewardCaseSummary {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  status: RewardCaseStatus;
  openCurrency: RewardCaseCurrency;
  openPrice: number;
  prePrice?: number | null;
  chain?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  limitMode: RewardCaseLimitMode;
  limitTotal?: number | null;
  limitRemaining?: number | null;
  totalOpens: number;
  drops: RewardDropSummary[];
  userPrePurchase?: { remaining: number; totalBought: number; pricePaid?: number };
}

export interface RewardOpenResult {
  drops: Array<{
    dropId: string;
    kind: RewardDropKind;
    name: string;
    amount: number;
    rarity: string;
    color: string;
    image: string | null;
    isTest: boolean;
  }>;
  usedPrePurchase: number;
  paidUnits: number;
  pricePaid: number;
  currency: RewardCaseCurrency;
}

export interface RewardInventoryGroup {
  case: {
    id: string;
    name: string;
    imageUrl?: string | null;
    status: RewardCaseStatus;
    openCurrency: RewardCaseCurrency;
    openPrice?: number;
    prePrice?: number | null;
  };
  stacks: Array<{
    kind: RewardDropKind;
    amount: number;
    claimedAmount: number;
    lastDropAt?: string | null;
  }>;
  nftItems: Array<{
    id: string;
    dropId: string;
    kind: RewardDropKind;
    name: string;
    image?: string | null;
    rarity: string;
    color: string;
    chain?: string | null;
    contractAddress?: string | null;
    tokenId?: number | null;
    claimedAt?: string | null;
    createdAt: string;
  }>;
  prePurchase: { remaining: number; totalBought: number; pricePaid: number; currency: RewardCaseCurrency } | null;
}

export const isTestCurrency = (c: RewardCaseCurrency) =>
  c === 'TEST_CFP' || c === 'TEST_USDT';
export const isTestDrop = (k: RewardDropKind) =>
  k === 'TEST_USDT' || k === 'TEST_CFT' || k === 'TEST_NFT';
export const isNftDrop = (k: RewardDropKind) => k === 'NFT' || k === 'TEST_NFT';

export const currencyLabel = (c: RewardCaseCurrency): string => {
  switch (c) {
    case 'CFP':
      return 'CFP';
    case 'USDT':
      return 'USDT';
    case 'TEST_CFP':
      return 'TEST CFP';
    case 'TEST_USDT':
      return 'TEST USDT';
    default:
      return String(c);
  }
};

export const dropKindLabel = (k: RewardDropKind): string => {
  switch (k) {
    case 'USDT':
      return 'USDT';
    case 'CFT':
      return 'CFT';
    case 'NFT':
      return 'NFT';
    case 'TEST_USDT':
      return 'TEST USDT';
    case 'TEST_CFT':
      return 'TEST CFT';
    case 'TEST_NFT':
      return 'TEST NFT';
    default:
      return String(k);
  }
};
