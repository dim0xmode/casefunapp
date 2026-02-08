import React, { useState, useEffect } from 'react';
import { Case, Item, Rarity } from '../types';
import { Package, TrendingUp, XCircle, Sparkles, User } from 'lucide-react';
import { ImageWithMeta } from './ui/ImageWithMeta';

const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#10B981',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

type ActivityType = 'CASE_OPEN' | 'UPGRADE_SUCCESS' | 'UPGRADE_FAIL';

interface Activity {
  id: string;
  type: ActivityType;
  user: string;
  item?: Item;
  caseName?: string;
  timestamp: Date;
  multiplier?: number;
}

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  CASE_OPEN: <Package size={14} />,
  UPGRADE_SUCCESS: <Sparkles size={14} />,
  UPGRADE_FAIL: <XCircle size={14} />,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  CASE_OPEN: '#66FCF1',
  UPGRADE_SUCCESS: '#10B981',
  UPGRADE_FAIL: '#EF4444',
};

const mockNames = [
  'Apex', 'SniperX', 'Valkyrie', 'Titan', 'Shadow', 'Nova',
  'Orion', 'Helix', 'Rogue', 'Cipher', 'Atlas', 'Zephyr'
];

const getRarityByValue = (value: number): Rarity => {
  if (value < 5) return Rarity.COMMON;
  if (value < 20) return Rarity.UNCOMMON;
  if (value < 50) return Rarity.RARE;
  if (value < 100) return Rarity.LEGENDARY;
  return Rarity.MYTHIC;
};

interface LiveFeedProps {
  cases: Case[];
  onSelectUser: (username: string) => void;
}

export const LiveFeed: React.FC<LiveFeedProps> = ({ cases, onSelectUser }) => {
  const [activities, setActivities] = useState<Activity[]>([]);

  const renderTokenLogo = (item?: Item) => {
    const value = item?.image || '';
    if (!value) return <span className="text-[8px] uppercase tracking-widest text-gray-500">Logo</span>;
    const isImage = value.startsWith('http') || value.startsWith('/') || value.startsWith('data:');
    if (isImage) {
      return (
        <ImageWithMeta
          src={value}
          meta={item?.imageMeta}
          className="w-full h-full rounded-full"
          imgClassName="w-full h-full"
        />
      );
    }
    return <span className="text-sm">{value}</span>;
  };

  const generateMockActivity = (): Activity | null => {
    if (!cases.length) return null;
    const types: ActivityType[] = ['CASE_OPEN', 'UPGRADE_SUCCESS', 'UPGRADE_FAIL'];
    const type = types[Math.floor(Math.random() * types.length)];
    const caseData = cases[Math.floor(Math.random() * cases.length)];
    const drops = caseData.possibleDrops?.length ? caseData.possibleDrops : [];
    const itemSource = drops.length > 0
      ? drops[Math.floor(Math.random() * drops.length)]
      : {
          id: `item-${Date.now()}`,
          name: caseData.name,
          value: Math.max(1, Math.floor(caseData.price)),
          currency: caseData.currency,
          rarity: Rarity.COMMON,
          image: caseData.image || '🪙',
          color: RARITY_COLORS[Rarity.COMMON],
        };
    const normalizedRarity = getRarityByValue(itemSource.value);
    const normalizedItem: Item = {
      ...itemSource,
      rarity: normalizedRarity,
      color: RARITY_COLORS[normalizedRarity],
    };

    return {
      id: `activity-${Date.now()}-${Math.random()}`,
      type,
      user: mockNames[Math.floor(Math.random() * mockNames.length)],
      item: normalizedItem,
      caseName: caseData.name,
      timestamp: new Date(),
      multiplier: type === 'UPGRADE_SUCCESS' ? Math.random() * 5 + 1.5 : undefined,
    };
  };

  useEffect(() => {
    // Generate initial activities
    const initial = Array.from({ length: 15 }, () => generateMockActivity()).filter(Boolean) as Activity[];
    setActivities(initial);

    // Add new activity every 3-8 seconds
    const interval = setInterval(() => {
      const newActivity = generateMockActivity();
      if (!newActivity) return;
      setActivities(prev => [newActivity, ...prev].slice(0, 30)); // Keep last 30
    }, Math.random() * 5000 + 3000);

    return () => clearInterval(interval);
  }, [cases]);

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getActivityText = (activity: Activity): React.ReactNode => {
    switch (activity.type) {
      case 'CASE_OPEN':
        return (
          <>
            opened <span className="font-bold text-web3-accent">{activity.caseName}</span> and won{' '}
            <span className="font-bold" style={{ color: RARITY_COLORS[activity.item?.rarity || Rarity.COMMON] }}>
              {activity.item?.value} ${activity.item?.currency}
            </span>
          </>
        );
      case 'UPGRADE_SUCCESS':
        return (
          <>
            upgraded to{' '}
            <span className="font-bold text-web3-success">
              {activity.item?.value} ${activity.item?.currency}
            </span>{' '}
            <span className="text-xs text-gray-500">({activity.multiplier?.toFixed(1)}x)</span>
          </>
        );
      case 'UPGRADE_FAIL':
        return (
          <>
            failed upgrade, lost{' '}
            <span className="font-bold text-red-400">
              {activity.item?.value} ${activity.item?.currency}
            </span>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-64 bg-web3-card/40 border-r border-white/[0.06] flex flex-col h-full shadow-2xl pt-20">
      {/* Header */}
      <div className="p-3 border-b border-white/[0.06] bg-black/20 backdrop-blur-2xl">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-1.5 h-1.5 bg-web3-success rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]"></div>
          <h3 className="font-bold text-xs uppercase tracking-[0.12em] text-white">Live Feed</h3>
        </div>
        <p className="text-[9px] text-gray-500 uppercase tracking-wider">Real-time activity</p>
      </div>

      {/* Activity List - Fixed height, no scroll */}
      <div className="flex-1 overflow-hidden">
        <div className="p-2 space-y-1 h-full">
          {activities.slice(0, 12).map((activity, index) => (
            <div 
              key={activity.id}
              onClick={() => onSelectUser(activity.user)}
              className="bg-web3-card/40 hover:bg-web3-card/60 p-2 rounded-xl border border-white/[0.06] hover:border-white/[0.16] transition-all duration-200 animate-slide-in cursor-pointer group backdrop-blur-xl"
              style={{ 
                animationDelay: `${index * 0.05}s`,
                borderLeftWidth: '2px',
                borderLeftColor: ACTIVITY_COLORS[activity.type]
              }}
            >
              <div className="flex items-start gap-1.5">
                {/* Icon */}
                <div 
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 bg-black/20 border border-white/[0.06]"
                  style={{ 
                    color: ACTIVITY_COLORS[activity.type]
                  }}
                >
                  {ACTIVITY_ICONS[activity.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <User size={8} className="text-gray-600 flex-shrink-0" />
                    <span className="font-bold text-[10px] text-white truncate">{activity.user}</span>
                  </div>
                  <p className="text-[9px] text-gray-400 leading-relaxed line-clamp-2">
                    {getActivityText(activity)}
                  </p>
                </div>

                {/* Item indicator */}
                {activity.item && (
                  <div 
                    className="w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 bg-black/30"
                    style={{ borderColor: RARITY_COLORS[getRarityByValue(activity.item.value)] }}
                  >
                    {renderTokenLogo(activity.item)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
