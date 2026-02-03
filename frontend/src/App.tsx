import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { CaseView } from './components/CaseView';
import { CreateCaseView } from './components/CreateCaseView';
import { UpgradeView } from './components/UpgradeView';
import { BattleView } from './components/BattleView';
import { ProfileView } from './components/ProfileView';
import { AdminView } from './components/AdminView';
import { LiveFeed } from './components/LiveFeed';
import { WalletConnectModal } from './components/WalletConnectModal';
import { TopUpModal } from './components/TopUpModal';
import { INITIAL_USER } from './constants';
import { User, Item, Rarity, Case } from './types';
import { useWallet } from './hooks/useWallet';
import { BrowserProvider } from 'ethers';
import { api, resolveAssetUrl } from './services/api';

const NOW = Date.now();

// Test cases data - 10 different cases with meme tokens
const TEST_CASES: Case[] = [
  {
    id: 'doge-case',
    name: 'Doge Pack',
    currency: 'DOGE',
    price: 5,
    image: '',
    rtu: 95,
    openDurationHours: 2,
    createdAt: NOW - (30 * 60 * 1000),
    possibleDrops: [
      { id: 'doge-0.5', name: '50 DOGE', value: 0.5, currency: 'DOGE', rarity: Rarity.COMMON, image: '🐕', color: '#9CA3AF' },
      { id: 'doge-1', name: '100 DOGE', value: 1, currency: 'DOGE', rarity: Rarity.COMMON, image: '🐕', color: '#9CA3AF' },
      { id: 'doge-2', name: '250 DOGE', value: 2, currency: 'DOGE', rarity: Rarity.COMMON, image: '🐕', color: '#9CA3AF' },
      { id: 'doge-3', name: '350 DOGE', value: 3, currency: 'DOGE', rarity: Rarity.UNCOMMON, image: '🐕', color: '#10B981' },
      { id: 'doge-5', name: '500 DOGE', value: 5, currency: 'DOGE', rarity: Rarity.UNCOMMON, image: '🐕', color: '#10B981' },
      { id: 'doge-7', name: '750 DOGE', value: 7, currency: 'DOGE', rarity: Rarity.RARE, image: '🐕', color: '#8B5CF6' },
      { id: 'doge-8', name: '1000 DOGE', value: 8, currency: 'DOGE', rarity: Rarity.RARE, image: '🐕', color: '#8B5CF6' },
    ]
  },
  {
    id: 'pepe-case',
    name: 'Pepe Box',
    currency: 'PEPE',
    price: 15,
    image: '',
    rtu: 90,
    openDurationHours: 6,
    createdAt: NOW - (2 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'pepe-3', name: '3K PEPE', value: 3, currency: 'PEPE', rarity: Rarity.COMMON, image: '🐸', color: '#9CA3AF' },
      { id: 'pepe-5', name: '5K PEPE', value: 5, currency: 'PEPE', rarity: Rarity.COMMON, image: '🐸', color: '#9CA3AF' },
      { id: 'pepe-10', name: '10K PEPE', value: 10, currency: 'PEPE', rarity: Rarity.COMMON, image: '🐸', color: '#9CA3AF' },
      { id: 'pepe-15', name: '15K PEPE', value: 15, currency: 'PEPE', rarity: Rarity.UNCOMMON, image: '🐸', color: '#10B981' },
      { id: 'pepe-20', name: '20K PEPE', value: 20, currency: 'PEPE', rarity: Rarity.UNCOMMON, image: '🐸', color: '#10B981' },
      { id: 'pepe-28', name: '28K PEPE', value: 28, currency: 'PEPE', rarity: Rarity.RARE, image: '🐸', color: '#8B5CF6' },
      { id: 'pepe-35', name: '35K PEPE', value: 35, currency: 'PEPE', rarity: Rarity.RARE, image: '🐸', color: '#8B5CF6' },
      { id: 'pepe-50', name: '50K PEPE', value: 50, currency: 'PEPE', rarity: Rarity.LEGENDARY, image: '🐸', color: '#F59E0B' },
    ]
  },
  {
    id: 'shib-case',
    name: 'Shiba Chest',
    currency: 'SHIB',
    price: 25,
    image: '',
    rtu: 88,
    openDurationHours: 12,
    createdAt: NOW - (5 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'shib-5', name: '5M SHIB', value: 5, currency: 'SHIB', rarity: Rarity.COMMON, image: '🐶', color: '#9CA3AF' },
      { id: 'shib-10', name: '10M SHIB', value: 10, currency: 'SHIB', rarity: Rarity.COMMON, image: '🐶', color: '#9CA3AF' },
      { id: 'shib-15', name: '15M SHIB', value: 15, currency: 'SHIB', rarity: Rarity.UNCOMMON, image: '🐶', color: '#10B981' },
      { id: 'shib-20', name: '20M SHIB', value: 20, currency: 'SHIB', rarity: Rarity.UNCOMMON, image: '🐶', color: '#10B981' },
      { id: 'shib-30', name: '30M SHIB', value: 30, currency: 'SHIB', rarity: Rarity.RARE, image: '🐶', color: '#8B5CF6' },
      { id: 'shib-40', name: '40M SHIB', value: 40, currency: 'SHIB', rarity: Rarity.RARE, image: '🐶', color: '#8B5CF6' },
      { id: 'shib-60', name: '60M SHIB', value: 60, currency: 'SHIB', rarity: Rarity.LEGENDARY, image: '🐶', color: '#F59E0B' },
      { id: 'shib-75', name: '75M SHIB', value: 75, currency: 'SHIB', rarity: Rarity.LEGENDARY, image: '🐶', color: '#F59E0B' },
    ]
  },
  {
    id: 'floki-case',
    name: 'Floki Vault',
    currency: 'FLOKI',
    price: 50,
    image: '',
    rtu: 85,
    openDurationHours: 24,
    createdAt: NOW - (10 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'floki-15', name: '15K FLOKI', value: 15, currency: 'FLOKI', rarity: Rarity.COMMON, image: '🦊', color: '#9CA3AF' },
      { id: 'floki-20', name: '20K FLOKI', value: 20, currency: 'FLOKI', rarity: Rarity.COMMON, image: '🦊', color: '#9CA3AF' },
      { id: 'floki-30', name: '30K FLOKI', value: 30, currency: 'FLOKI', rarity: Rarity.UNCOMMON, image: '🦊', color: '#10B981' },
      { id: 'floki-40', name: '40K FLOKI', value: 40, currency: 'FLOKI', rarity: Rarity.UNCOMMON, image: '🦊', color: '#10B981' },
      { id: 'floki-60', name: '60K FLOKI', value: 60, currency: 'FLOKI', rarity: Rarity.RARE, image: '🦊', color: '#8B5CF6' },
      { id: 'floki-80', name: '80K FLOKI', value: 80, currency: 'FLOKI', rarity: Rarity.RARE, image: '🦊', color: '#8B5CF6' },
      { id: 'floki-100', name: '100K FLOKI', value: 100, currency: 'FLOKI', rarity: Rarity.LEGENDARY, image: '🦊', color: '#F59E0B' },
      { id: 'floki-120', name: '120K FLOKI', value: 120, currency: 'FLOKI', rarity: Rarity.LEGENDARY, image: '🦊', color: '#F59E0B' },
    ]
  },
  {
    id: 'bonk-case',
    name: 'Bonk Crate',
    currency: 'BONK',
    price: 100,
    image: '',
    rtu: 82,
    openDurationHours: 72,
    createdAt: NOW - (24 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'bonk-40', name: '40M BONK', value: 40, currency: 'BONK', rarity: Rarity.COMMON, image: '🔨', color: '#9CA3AF' },
      { id: 'bonk-50', name: '50M BONK', value: 50, currency: 'BONK', rarity: Rarity.COMMON, image: '🔨', color: '#9CA3AF' },
      { id: 'bonk-70', name: '70M BONK', value: 70, currency: 'BONK', rarity: Rarity.UNCOMMON, image: '🔨', color: '#10B981' },
      { id: 'bonk-100', name: '100M BONK', value: 100, currency: 'BONK', rarity: Rarity.UNCOMMON, image: '🔨', color: '#10B981' },
      { id: 'bonk-140', name: '140M BONK', value: 140, currency: 'BONK', rarity: Rarity.RARE, image: '🔨', color: '#8B5CF6' },
      { id: 'bonk-180', name: '180M BONK', value: 180, currency: 'BONK', rarity: Rarity.RARE, image: '🔨', color: '#8B5CF6' },
      { id: 'bonk-240', name: '240M BONK', value: 240, currency: 'BONK', rarity: Rarity.LEGENDARY, image: '🔨', color: '#F59E0B' },
      { id: 'bonk-300', name: '300M BONK', value: 300, currency: 'BONK', rarity: Rarity.LEGENDARY, image: '🔨', color: '#F59E0B' },
    ]
  },
  {
    id: 'wojak-case',
    name: 'Wojak Case',
    currency: 'WOJAK',
    price: 150,
    image: '',
    rtu: 80,
    openDurationHours: 6,
    createdAt: NOW - (4 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'wojak-60', name: '60K WOJAK', value: 60, currency: 'WOJAK', rarity: Rarity.UNCOMMON, image: '😐', color: '#10B981' },
      { id: 'wojak-80', name: '80K WOJAK', value: 80, currency: 'WOJAK', rarity: Rarity.UNCOMMON, image: '😐', color: '#10B981' },
      { id: 'wojak-110', name: '110K WOJAK', value: 110, currency: 'WOJAK', rarity: Rarity.RARE, image: '😐', color: '#8B5CF6' },
      { id: 'wojak-140', name: '140K WOJAK', value: 140, currency: 'WOJAK', rarity: Rarity.RARE, image: '😐', color: '#8B5CF6' },
      { id: 'wojak-190', name: '190K WOJAK', value: 190, currency: 'WOJAK', rarity: Rarity.LEGENDARY, image: '😐', color: '#F59E0B' },
      { id: 'wojak-250', name: '250K WOJAK', value: 250, currency: 'WOJAK', rarity: Rarity.LEGENDARY, image: '😐', color: '#F59E0B' },
      { id: 'wojak-330', name: '330K WOJAK', value: 330, currency: 'WOJAK', rarity: Rarity.MYTHIC, image: '😐', color: '#EF4444' },
      { id: 'wojak-400', name: '400K WOJAK', value: 400, currency: 'WOJAK', rarity: Rarity.MYTHIC, image: '😐', color: '#EF4444' },
    ]
  },
  {
    id: 'chad-case',
    name: 'Chad Box',
    currency: 'CHAD',
    price: 200,
    image: '',
    rtu: 78,
    openDurationHours: 12,
    createdAt: NOW - (3 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'chad-80', name: '80K CHAD', value: 80, currency: 'CHAD', rarity: Rarity.UNCOMMON, image: '💪', color: '#10B981' },
      { id: 'chad-100', name: '100K CHAD', value: 100, currency: 'CHAD', rarity: Rarity.UNCOMMON, image: '💪', color: '#10B981' },
      { id: 'chad-150', name: '150K CHAD', value: 150, currency: 'CHAD', rarity: Rarity.RARE, image: '💪', color: '#8B5CF6' },
      { id: 'chad-200', name: '200K CHAD', value: 200, currency: 'CHAD', rarity: Rarity.RARE, image: '💪', color: '#8B5CF6' },
      { id: 'chad-280', name: '280K CHAD', value: 280, currency: 'CHAD', rarity: Rarity.LEGENDARY, image: '💪', color: '#F59E0B' },
      { id: 'chad-350', name: '350K CHAD', value: 350, currency: 'CHAD', rarity: Rarity.LEGENDARY, image: '💪', color: '#F59E0B' },
      { id: 'chad-480', name: '480K CHAD', value: 480, currency: 'CHAD', rarity: Rarity.MYTHIC, image: '💪', color: '#EF4444' },
      { id: 'chad-600', name: '600K CHAD', value: 600, currency: 'CHAD', rarity: Rarity.MYTHIC, image: '💪', color: '#EF4444' },
    ]
  },
  {
    id: 'moon-case',
    name: 'Moon Chest',
    currency: 'MOON',
    price: 300,
    image: '',
    rtu: 75,
    openDurationHours: 24,
    createdAt: NOW - (18 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'moon-120', name: '120K MOON', value: 120, currency: 'MOON', rarity: Rarity.UNCOMMON, image: '🌙', color: '#10B981' },
      { id: 'moon-150', name: '150K MOON', value: 150, currency: 'MOON', rarity: Rarity.UNCOMMON, image: '🌙', color: '#10B981' },
      { id: 'moon-220', name: '220K MOON', value: 220, currency: 'MOON', rarity: Rarity.RARE, image: '🌙', color: '#8B5CF6' },
      { id: 'moon-280', name: '280K MOON', value: 280, currency: 'MOON', rarity: Rarity.RARE, image: '🌙', color: '#8B5CF6' },
      { id: 'moon-380', name: '380K MOON', value: 380, currency: 'MOON', rarity: Rarity.LEGENDARY, image: '🌙', color: '#F59E0B' },
      { id: 'moon-500', name: '500K MOON', value: 500, currency: 'MOON', rarity: Rarity.LEGENDARY, image: '🌙', color: '#F59E0B' },
      { id: 'moon-680', name: '680K MOON', value: 680, currency: 'MOON', rarity: Rarity.MYTHIC, image: '🌙', color: '#EF4444' },
      { id: 'moon-850', name: '850K MOON', value: 850, currency: 'MOON', rarity: Rarity.MYTHIC, image: '🌙', color: '#EF4444' },
    ]
  },
  {
    id: 'rocket-case',
    name: 'Rocket Box',
    currency: 'ROCKET',
    price: 500,
    image: '',
    rtu: 72,
    openDurationHours: 72,
    createdAt: NOW - (40 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'rocket-200', name: '200K ROCKET', value: 200, currency: 'ROCKET', rarity: Rarity.RARE, image: '🚀', color: '#8B5CF6' },
      { id: 'rocket-250', name: '250K ROCKET', value: 250, currency: 'ROCKET', rarity: Rarity.RARE, image: '🚀', color: '#8B5CF6' },
      { id: 'rocket-350', name: '350K ROCKET', value: 350, currency: 'ROCKET', rarity: Rarity.LEGENDARY, image: '🚀', color: '#F59E0B' },
      { id: 'rocket-450', name: '450K ROCKET', value: 450, currency: 'ROCKET', rarity: Rarity.LEGENDARY, image: '🚀', color: '#F59E0B' },
      { id: 'rocket-600', name: '600K ROCKET', value: 600, currency: 'ROCKET', rarity: Rarity.MYTHIC, image: '🚀', color: '#EF4444' },
      { id: 'rocket-800', name: '800K ROCKET', value: 800, currency: 'ROCKET', rarity: Rarity.MYTHIC, image: '🚀', color: '#EF4444' },
      { id: 'rocket-1100', name: '1.1M ROCKET', value: 1100, currency: 'ROCKET', rarity: Rarity.MYTHIC, image: '🚀', color: '#EF4444' },
      { id: 'rocket-1500', name: '1.5M ROCKET', value: 1500, currency: 'ROCKET', rarity: Rarity.MYTHIC, image: '🚀', color: '#EF4444' },
    ]
  },
  {
    id: 'diamond-case',
    name: 'Diamond Vault',
    currency: 'DIAMOND',
    price: 1000,
    image: '',
    rtu: 70,
    openDurationHours: 24,
    createdAt: NOW - (8 * 60 * 60 * 1000),
    possibleDrops: [
      { id: 'diamond-400', name: '400K DIAMOND', value: 400, currency: 'DIAMOND', rarity: Rarity.RARE, image: '💎', color: '#8B5CF6' },
      { id: 'diamond-500', name: '500K DIAMOND', value: 500, currency: 'DIAMOND', rarity: Rarity.RARE, image: '💎', color: '#8B5CF6' },
      { id: 'diamond-700', name: '700K DIAMOND', value: 700, currency: 'DIAMOND', rarity: Rarity.LEGENDARY, image: '💎', color: '#F59E0B' },
      { id: 'diamond-900', name: '900K DIAMOND', value: 900, currency: 'DIAMOND', rarity: Rarity.LEGENDARY, image: '💎', color: '#F59E0B' },
      { id: 'diamond-1200', name: '1.2M DIAMOND', value: 1200, currency: 'DIAMOND', rarity: Rarity.MYTHIC, image: '💎', color: '#EF4444' },
      { id: 'diamond-1600', name: '1.6M DIAMOND', value: 1600, currency: 'DIAMOND', rarity: Rarity.MYTHIC, image: '💎', color: '#EF4444' },
      { id: 'diamond-2200', name: '2.2M DIAMOND', value: 2200, currency: 'DIAMOND', rarity: Rarity.MYTHIC, image: '💎', color: '#EF4444' },
      { id: 'diamond-3000', name: '3M DIAMOND', value: 3000, currency: 'DIAMOND', rarity: Rarity.MYTHIC, image: '💎', color: '#EF4444' },
    ]
  }
];

interface BattleRecord {
  id: string;
  opponent: string;
  result: 'WIN' | 'LOSS';
  cost: number;
  wonValue: number;
  wonItems: Item[];
}

const TAB_PATHS: Record<string, string> = {
  home: '/',
  createcase: '/create',
  case: '/cases',
  upgrade: '/upgrade',
  casebattle: '/battles',
  profile: '/profile',
  admin: '/admin',
};

const getTabFromPath = (pathname: string) => {
  const normalized = pathname.toLowerCase();
  const match = Object.entries(TAB_PATHS).find(([, path]) => path === normalized);
  return match?.[0] || 'home';
};

const App = () => {
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(window.location.pathname));
  const [user, setUser] = useState<User>(INITIAL_USER);
  const [isWalletConnectOpen, setIsWalletConnectOpen] = useState(false);
  const [inventory, setInventory] = useState<Item[]>([]);
  const [burntItems, setBurntItems] = useState<Item[]>([]);
  const [battleHistory, setBattleHistory] = useState<BattleRecord[]>([]);
  const [cases, setCases] = useState<Case[]>(TEST_CASES);
  const [createdCaseNotice, setCreatedCaseNotice] = useState<Case | null>(null);
  const [profileView, setProfileView] = useState<{
    user: User;
    inventory: Item[];
    burntItems: Item[];
    battleHistory: BattleRecord[];
  } | null>(null);
  const [botProfiles, setBotProfiles] = useState<Record<string, {
    user: User;
    inventory: Item[];
    burntItems: Item[];
    battleHistory: BattleRecord[];
  }>>({});
  const [balance, setBalance] = useState(0);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [lastAuthAddress, setLastAuthAddress] = useState<string | null>(null);

  const { address: walletAddress, isConnected } = useWallet();
  const isAdmin = user.role === 'ADMIN';

  const addBalance = async (amount: number) => {
    if (!isAdmin) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      const response = await api.topUp(amount);
      if (response.data?.balance !== undefined) {
        setBalance(response.data.balance);
      }
    } catch (error) {
      console.error('Top up failed', error);
    }
  };

  const resetUserState = () => {
    setUser(INITIAL_USER);
    setInventory([]);
    setBurntItems([]);
    setBattleHistory([]);
    setBalance(0);
    setProfileView(null);
    setActiveTab('home');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
    resetUserState();
    setLastAuthAddress(null);
  };

  const mapCaseFromApi = (caseData: any): Case => ({
    id: caseData.id,
    name: caseData.name,
    currency: caseData.currency,
    tokenTicker: caseData.tokenTicker || caseData.currency,
    tokenPrice: caseData.tokenPrice,
    price: caseData.price,
    image: resolveAssetUrl(caseData.imageUrl || caseData.image || ''),
    rtu: caseData.rtu,
    openDurationHours: caseData.openDurationHours,
    createdAt: caseData.createdAt ? new Date(caseData.createdAt).getTime() : undefined,
    creatorName: caseData.createdBy?.username || caseData.creatorName,
    possibleDrops: (caseData.drops || caseData.possibleDrops || []).map((drop: any) => ({
      id: drop.id,
      name: drop.name,
      value: drop.value,
      currency: drop.currency,
      rarity: drop.rarity,
        image: resolveAssetUrl(drop.image || caseData.imageUrl || caseData.image || ''),
      color: drop.color,
      caseId: caseData.id,
    })),
  });

  const loadProfile = async (fallbackAddress?: string) => {
    try {
      const response = await api.getProfile();
      if (response.data?.user) {
        setUser(prev => ({
          ...prev,
          ...response.data?.user,
          walletAddress: response.data?.user?.walletAddress || fallbackAddress || prev.walletAddress,
        }));
        if (response.data?.user?.walletAddress) {
          setLastAuthAddress(response.data.user.walletAddress.toLowerCase());
        }
        if (typeof response.data?.user?.balance === 'number') {
          setBalance(response.data.user.balance);
        }
      }
      if (response.data?.inventory) {
        setInventory(
          response.data.inventory.map((item: any) => ({
            ...item,
            image: resolveAssetUrl(item.image || ''),
          }))
        );
      }
      if (response.data?.burntItems) {
        setBurntItems(
          response.data.burntItems.map((item: any) => ({
            ...item,
            image: resolveAssetUrl(item.image || ''),
          }))
        );
      }
      if (response.data?.battleHistory) {
        setBattleHistory(
          response.data.battleHistory.map((battle: any) => ({
            id: battle.id,
            opponent: battle.opponent || 'Bot',
            result: battle.result,
            cost: battle.cost,
            wonValue: battle.wonValue,
            wonItems: battle.wonItems || [],
            timestamp: battle.timestamp ? new Date(battle.timestamp).getTime() : Date.now(),
            caseCount: battle.caseCount || battle.wonItems?.length || 0,
          }))
        );
      }
    } catch (error) {
      // not logged in
    }
  };

  const loginWithWalletAddress = async (address: string) => {
    if (!address || !window.ethereum) return false;
    if (isAuthLoading) return false;
    setIsAuthLoading(true);
    try {
      if (lastAuthAddress && lastAuthAddress === address.toLowerCase()) {
        await loadProfile(address);
        return true;
      }

      const nonceResponse = await api.getNonce(address);
      const message = nonceResponse.data?.message;
      if (!message) return false;

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);

      const loginResponse = await api.loginWithWallet(address, signature, message);
      if (loginResponse.data?.user) {
        setUser(prev => ({
          ...prev,
          ...loginResponse.data?.user,
          walletAddress: address,
        }));
        if (typeof loginResponse.data?.user?.balance === 'number') {
          setBalance(loginResponse.data.user.balance);
        }
      }
      await loadProfile(address);
      setLastAuthAddress(address.toLowerCase());
      return true;
    } catch (error) {
      console.error('Wallet login failed', error);
      try {
        await api.logout();
      } catch {
        // ignore logout failures
      }
      resetUserState();
      setLastAuthAddress(null);
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleWalletConnect = async (address: string) => {
    await loginWithWalletAddress(address);
  };

  useEffect(() => {
    if (!walletAddress) {
      return;
    }
    if (lastAuthAddress && walletAddress.toLowerCase() !== lastAuthAddress) {
      handleLogout();
      return;
    }
    setUser(prev => ({
      ...prev,
      walletAddress: walletAddress,
    }));
  }, [walletAddress, lastAuthAddress]);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const nextTab = getTabFromPath(window.location.pathname);
      handleTabChange(nextTab, 'none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [lastAuthAddress]);

  useEffect(() => {
    const normalized = walletAddress?.toLowerCase() || null;
    if (!isConnected || !normalized) return;
    if (!lastAuthAddress) return;
    if (normalized === lastAuthAddress) return;
    handleLogout();
  }, [walletAddress, isConnected, lastAuthAddress]);

  useEffect(() => {
    const loadCases = async () => {
      try {
        const response = await api.getCases();
        if (response.data?.cases) {
          setCases(response.data.cases.map(mapCaseFromApi));
        }
      } catch (error) {
        console.error('Failed to load cases', error);
      }
    };
    loadCases();
  }, []);

  const updateUrl = (tab: string, mode: 'push' | 'replace' | 'none' = 'push') => {
    const nextPath = TAB_PATHS[tab] || '/';
    if (mode === 'none') return;
    if (mode === 'replace') {
      window.history.replaceState({ tab }, '', nextPath);
      return;
    }
    window.history.pushState({ tab }, '', nextPath);
  };

  const handleTabChange = (tab: string, mode: 'push' | 'replace' | 'none' = 'push') => {
    const requiresAuth = tab === 'profile' || tab === 'admin';
    if (requiresAuth && !lastAuthAddress) {
      setIsWalletConnectOpen(true);
      setActiveTab('home');
      setProfileView(null);
      updateUrl('home', 'replace');
      return;
    }
    setActiveTab(tab);
    updateUrl(tab, mode);
    if (tab !== 'profile') {
      setProfileView(null);
    }
  };

  const handleCreateCase = () => {
    handleTabChange('createcase');
  };

  const handleCaseCreated = (newCase: Case) => {
    setCases(prev => [newCase, ...prev]);
    handleTabChange('case');
    setCreatedCaseNotice(newCase);
  };


  const handleOpenCase = async (caseId: string, count: number) => {
    if (!isAdmin) return [];
    const winners: Item[] = [];
    let latestBalance = balance;
    for (let i = 0; i < count; i++) {
      const response = await api.openCase(caseId);
      const won = response.data?.wonDrop;
      if (won) {
        const item: Item = {
          id: won.id,
          name: won.name,
          value: won.value,
          currency: won.currency,
          rarity: won.rarity,
          image: won.image || '',
          color: won.color,
          caseId: won.caseId || caseId,
        };
        winners.push(item);
      }
      if (typeof response.data?.balance === 'number') {
        latestBalance = response.data.balance;
      }
    }
    if (winners.length) {
      setInventory(prev => [...winners, ...prev]);
      setUser(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          casesOpened: prev.stats.casesOpened + winners.length,
        },
      }));
    }
    setBalance(latestBalance);
    return winners;
  };

  const handleUpgrade = async (originalItem: Item, multiplier: number) => {
    if (!isAdmin) {
      return { success: false, targetValue: 0 };
    }
    const response = await api.upgradeItem(originalItem.id, multiplier);
    const success = response.data?.success;
    const targetValue = response.data?.targetValue;
    const newItem = response.data?.newItem;
    const burntItemId = response.data?.burntItemId;

    if (!success && burntItemId) {
      setInventory(prev => prev.filter((item) => item.id !== burntItemId));
      const burnt = inventory.find((item) => item.id === burntItemId);
      if (burnt) {
        setBurntItems(prev => [burnt, ...prev]);
      }
    }

    if (success && newItem) {
      const upgradedItem: Item = {
        id: newItem.id,
        name: newItem.name,
        value: newItem.value,
        currency: newItem.currency,
        rarity: newItem.rarity,
        image: newItem.image || originalItem.image || '',
        color: newItem.color,
        caseId: newItem.caseId,
      };
      setInventory(prev => {
        const index = prev.findIndex((item) => item.id === upgradedItem.id);
        if (index === -1) {
          return [upgradedItem, ...prev];
        }
        const copy = [...prev];
        copy[index] = upgradedItem;
        return copy;
      });
      setUser(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          upgradesAttempted: prev.stats.upgradesAttempted + 1,
          upgradeSuccessCount: prev.stats.upgradeSuccessCount + 1,
        },
      }));
    } else {
      setUser(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          upgradesAttempted: prev.stats.upgradesAttempted + 1,
        },
      }));
    }

    return { success: Boolean(success), targetValue: Number(targetValue || 0) };
  };

  const handleBattleFinish = async (wonItems: Item[], totalCost: number) => {
    if (!isAdmin) return;
    const isWin = wonItems.length > 0;
    const wonValue = wonItems.reduce((sum, item) => sum + item.value, 0);
    
    if (isWin) {
      setInventory(prev => [...wonItems, ...prev]);
    }
    
    const battleRecord: BattleRecord = {
      id: `battle-${Date.now()}`,
      opponent: 'Bot_SniperX',
      result: isWin ? 'WIN' : 'LOSS',
      cost: totalCost,
      wonValue: wonValue,
      wonItems: wonItems
    };
    
    setBattleHistory(prev => [battleRecord, ...prev]);

    try {
      await api.recordBattle(isWin ? 'WIN' : 'LOSS', totalCost, wonItems);
    } catch (error) {
      console.error('Failed to record battle', error);
    }
  };

  const handleUpdateUsername = async (username: string) => {
    const response = await api.updateProfile(username);
    if (response.data?.user) {
      setUser(prev => ({ ...prev, ...response.data?.user }));
      if (profileView) {
        setProfileView({
          ...profileView,
          user: { ...profileView.user, ...response.data.user },
        });
      }
    }
  };

  const handleUploadAvatar = async (file: File) => {
    const response = await api.uploadAvatar(file);
    const avatarUrl = response.data?.avatarUrl;
    if (avatarUrl) {
      setUser(prev => ({ ...prev, avatar: resolveAssetUrl(avatarUrl) }));
      if (profileView) {
        setProfileView({
          ...profileView,
          user: { ...profileView.user, avatar: resolveAssetUrl(avatarUrl) },
        });
      }
    }
    return avatarUrl ? resolveAssetUrl(avatarUrl) : undefined;
  };

  const handleChargeBattle = async (amount: number) => {
    if (!isAdmin) return false;
    try {
      const response = await api.chargeBattle(amount);
      if (response.data?.balance !== undefined) {
        setBalance(response.data.balance);
      }
      return true;
    } catch (error) {
      console.error('Failed to charge battle', error);
      return false;
    }
  };

  const buildBotProfile = (username: string) => {
    const pickCase = () => cases[Math.floor(Math.random() * cases.length)];
    const pickItem = () => {
      const caseData = pickCase();
      const drop = caseData.possibleDrops[Math.floor(Math.random() * caseData.possibleDrops.length)];
      return { ...drop, id: `${drop.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
    };

    const inventoryCount = 8 + Math.floor(Math.random() * 8);
    const burntCount = Math.floor(Math.random() * 4);
    const inventoryItems = Array.from({ length: inventoryCount }, pickItem);
    const burntItemsList = Array.from({ length: burntCount }, pickItem);
    const battleHistoryList: BattleRecord[] = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => {
      const wonItems = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, pickItem);
      const wonValue = wonItems.reduce((sum, item) => sum + item.value, 0);
      const cost = Math.max(10, Math.floor(Math.random() * 200));
      const result = Math.random() > 0.45 ? 'WIN' : 'LOSS';
      return {
        id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        opponent: 'Bot',
        result,
        cost,
        wonValue,
        wonItems: result === 'WIN' ? wonItems : [],
      };
    });

    const upgradesAttempted = 20 + Math.floor(Math.random() * 50);
    const upgradeSuccessCount = Math.floor(upgradesAttempted * (0.3 + Math.random() * 0.5));
    const casesOpened = 40 + Math.floor(Math.random() * 200);

    return {
      user: {
        username,
        walletAddress: `0xBOT${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 6)}`,
        balance: 0,
        avatar: '',
        transactions: [],
        battleHistory: [],
        stats: {
          casesOpened,
          totalWon: inventoryItems.reduce((sum, item) => sum + item.value, 0),
          upgradesAttempted,
          upgradeSuccessCount,
        }
      },
      inventory: inventoryItems,
      burntItems: burntItemsList,
      battleHistory: battleHistoryList,
    };
  };

  const handleSelectUser = (username: string) => {
    if (username === user.username) {
      setProfileView(null);
      setActiveTab('profile');
      return;
    }

    if (botProfiles[username]) {
      setProfileView(botProfiles[username]);
      setActiveTab('profile');
      return;
    }

    const profile = buildBotProfile(username);
    setBotProfiles(prev => ({ ...prev, [username]: profile }));
    setProfileView(profile);
    setActiveTab('profile');
  };

  return (
    <div className="flex flex-col h-screen bg-[#0B0C10] text-white overflow-hidden font-sans relative">
      {/* Global Parallax Background - Fixed positioning */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div 
              className="absolute w-[600px] h-[600px] bg-web3-accent/30 rounded-full blur-[140px] animate-pulse-slow"
              style={{ 
                top: '-100px',
                right: '10%',
                animationDelay: '0s'
              }}
            ></div>
            
            <div 
              className="absolute w-[700px] h-[700px] bg-web3-purple/25 rounded-full blur-[150px] animate-pulse-slow"
              style={{ 
                top: '20%',
                left: '5%',
                animationDelay: '1s'
              }}
            ></div>

            <div 
              className="absolute w-[800px] h-[800px] bg-web3-success/20 rounded-full blur-[160px] animate-pulse-slow"
              style={{ 
                top: '50%',
                right: '15%',
                animationDelay: '2s'
              }}
            ></div>

            <div 
              className="absolute w-[650px] h-[650px] bg-web3-gold/25 rounded-full blur-[140px] animate-pulse-slow"
              style={{ 
                bottom: '10%',
                left: '20%',
                animationDelay: '1.5s'
              }}
            ></div>

            <div 
              className="absolute w-[750px] h-[750px] bg-web3-purple/30 rounded-full blur-[155px] animate-pulse-slow"
              style={{ 
                bottom: '-10%',
                right: '25%',
                animationDelay: '0.5s'
              }}
            ></div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        <Header 
          user={user} 
          activeTab={activeTab} 
          setActiveTab={handleTabChange} 
          onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
          balance={balance}
          onOpenTopUp={() => {
            if (!isAdmin) return;
            setIsTopUpOpen(true);
          }}
          onLogout={handleLogout}
          isAuthLoading={isAuthLoading}
          isAuthenticated={Boolean(lastAuthAddress)}
          isAdmin={isAdmin}
        />

        {/* Live Feed Sidebar - Left side, hidden on home */}
        {activeTab !== 'home' && <LiveFeed cases={cases} onSelectUser={handleSelectUser} />}

        <main className="flex-1 overflow-y-auto custom-scrollbar relative pt-20">
          <div className="relative min-h-full">
            {activeTab === 'home' && (
              <HomeView onCreateCase={handleCreateCase} />
            )}

            {activeTab === 'createcase' && (
              <div className="animate-fade-in">
                <CreateCaseView
                  onCreate={handleCaseCreated}
                  creatorName={user.username}
                  balance={balance}
                  onOpenTopUp={() => {
                    if (!isAdmin) return;
                    setIsTopUpOpen(true);
                  }}
                  onBalanceUpdate={setBalance}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {activeTab === 'case' && (
              <div className="animate-fade-in">
                <CaseView
                  cases={cases}
                  onOpenCase={handleOpenCase}
                  balance={balance}
                  onOpenTopUp={() => {
                    if (!isAdmin) return;
                    setIsTopUpOpen(true);
                  }}
                  userName={user.username}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {activeTab === 'upgrade' && (
              <div className="animate-fade-in">
                <UpgradeView
                  inventory={inventory}
                  onUpgrade={handleUpgrade}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {activeTab === 'casebattle' && (
              <div className="animate-fade-in h-full">
                <BattleView 
                  cases={cases} 
                  userName={user.username}
                  onBattleFinish={handleBattleFinish}
                  balance={balance}
                  onChargeBattle={handleChargeBattle}
                  onOpenTopUp={() => {
                    if (!isAdmin) return;
                    setIsTopUpOpen(true);
                  }}
                  isAuthenticated={Boolean(lastAuthAddress)}
                  onOpenWalletConnect={() => setIsWalletConnectOpen(true)}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {activeTab === 'profile' && lastAuthAddress && (
              <div className="animate-fade-in">
                <ProfileView 
                  user={profileView?.user || user}
                  inventory={profileView?.inventory || inventory}
                  burntItems={profileView?.burntItems || burntItems}
                  battleHistory={profileView?.battleHistory || battleHistory}
                  balance={balance}
                  isEditable={!profileView}
                  onUpdateUsername={handleUpdateUsername}
                  onUploadAvatar={handleUploadAvatar}
                />
              </div>
            )}

            {activeTab === 'admin' && lastAuthAddress && (
              <div className="animate-fade-in">
                <AdminView />
              </div>
            )}
          </div>

        </main>
      </div>

      <WalletConnectModal
        isOpen={isWalletConnectOpen}
        onClose={() => setIsWalletConnectOpen(false)}
        onConnect={handleWalletConnect}
      />

      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        onTopUp={addBalance}
        isAdmin={isAdmin}
      />

      {createdCaseNotice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-modal-fade">
          <div className="bg-web3-card/80 border border-white/[0.12] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] px-8 py-6 text-center max-w-sm w-[90%] animate-modal-pop">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-2">Success</div>
            <div className="text-2xl font-black bg-gradient-to-r from-web3-accent to-web3-success bg-clip-text text-transparent animate-gradient">
              Case created
            </div>
            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-2xl border border-white/[0.12] bg-black/40 flex items-center justify-center text-3xl">
                {createdCaseNotice.image ? (
                  createdCaseNotice.image.startsWith('http') ? (
                    <img src={createdCaseNotice.image} alt="case logo" className="w-12 h-12 object-contain" />
                  ) : (
                    <span>{createdCaseNotice.image}</span>
                  )
                ) : (
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>
                )}
              </div>
              <div className="text-sm font-bold">{createdCaseNotice.name}</div>
              <div className="px-3 py-1 rounded-full text-xs bg-web3-accent/10 border border-web3-accent/30">
                {createdCaseNotice.price} ₮ • RTU {createdCaseNotice.rtu}%
              </div>
            </div>
            <button
              onClick={() => setCreatedCaseNotice(null)}
              className="mt-5 px-5 py-2.5 rounded-xl bg-white/10 border border-white/[0.1] text-xs uppercase tracking-widest hover:text-white hover:border-white/40 transition"
            >
              Nice
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
