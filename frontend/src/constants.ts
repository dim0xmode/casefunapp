import { Case, Item, Rarity, User } from './types';

export const RARITY_COLORS = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#3B82F6',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

export const getAttributesByValue = (value: number): { color: string; rarity: Rarity } => {
  if (value >= 500) return { color: RARITY_COLORS[Rarity.MYTHIC], rarity: Rarity.MYTHIC };
  if (value >= 250) return { color: RARITY_COLORS[Rarity.LEGENDARY], rarity: Rarity.LEGENDARY };
  if (value >= 100) return { color: RARITY_COLORS[Rarity.RARE], rarity: Rarity.RARE };
  if (value >= 50) return { color: RARITY_COLORS[Rarity.UNCOMMON], rarity: Rarity.UNCOMMON };
  return { color: RARITY_COLORS[Rarity.COMMON], rarity: Rarity.COMMON };
};

export const createMockItem = (id: string, value: number, currency: string): Item => {
  const { color, rarity } = getAttributesByValue(value);
  return {
    id,
    name: `${value} $${currency}`,
    value,
    currency,
    rarity,
    image: '',
    color
  };
};

const TEST1_POOL = [
  createMockItem('t1-1', 2, 'TEST1'),
  createMockItem('t1-2', 5, 'TEST1'),
  createMockItem('t1-3', 10, 'TEST1'),
  createMockItem('t1-4', 20, 'TEST1'),
  createMockItem('t1-5', 50, 'TEST1'),
];

const TEST2_POOL = [
  createMockItem('t2-1', 10, 'TEST2'),
  createMockItem('t2-2', 25, 'TEST2'),
  createMockItem('t2-3', 50, 'TEST2'),
  createMockItem('t2-4', 100, 'TEST2'),
  createMockItem('t2-5', 250, 'TEST2'),
];

const TEST3_POOL = [
  createMockItem('t3-1', 20, 'TEST3'),
  createMockItem('t3-2', 50, 'TEST3'),
  createMockItem('t3-3', 100, 'TEST3'),
  createMockItem('t3-4', 200, 'TEST3'),
  createMockItem('t3-5', 500, 'TEST3'),
];

export const MOCK_ITEMS: Item[] = [...TEST1_POOL, ...TEST2_POOL, ...TEST3_POOL];

export const MOCK_CASES: Case[] = [
  {
    id: 'c1',
    name: '$TEST1',
    currency: 'TEST1',
    price: 10,
    image: '',
    rtu: 96,
    possibleDrops: TEST1_POOL,
  },
  {
    id: 'c2',
    name: '$TEST2',
    currency: 'TEST2',
    price: 50,
    image: '',
    rtu: 96,
    possibleDrops: TEST2_POOL,
  },
  {
    id: 'c3',
    name: '$TEST3',
    currency: 'TEST3',
    price: 100,
    image: '',
    rtu: 96,
    possibleDrops: TEST3_POOL,
  },
];

export const INITIAL_USER: User = {
  username: 'CryptoKing',
  walletAddress: '0x71C...3a2',
  balance: 2000,
  role: 'USER',
  avatar: '',
  avatarMeta: { fit: 'cover', scale: 1, x: 0, y: 0 },
  transactions: [],
  battleHistory: [],
  stats: {
    casesOpened: 0,
    totalWon: 0,
    upgradesAttempted: 0,
    upgradeSuccessCount: 0,
  }
};
