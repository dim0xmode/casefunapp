import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Case, Item, Rarity } from '../types';
import { Package, Sparkles, XCircle, Swords, PlusCircle } from 'lucide-react';
import { ImageWithMeta } from './ui/ImageWithMeta';
import { api } from '../services/api';

const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#10B981',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

type ActivityType = 'CASE_OPEN' | 'CASE_CREATE' | 'BATTLE_WIN' | 'BATTLE_LOSS' | 'UPGRADE_SUCCESS' | 'UPGRADE_FAIL';

interface Activity {
  id: string;
  type: ActivityType;
  user: string;
  caseName?: string;
  currency?: string;
  value?: number;
  rarity?: string;
  image?: string | null;
  imageMeta?: any;
  tokenPrice?: number;
  rounds?: number;
  cost?: number;
  item?: Item;
  timestamp: Date;
  isReal?: boolean;
}

const TYPE_META: Record<ActivityType, { icon: React.ReactNode; color: string; label: string }> = {
  CASE_OPEN: { icon: <Package size={12} />, color: '#66FCF1', label: 'Opened' },
  CASE_CREATE: { icon: <PlusCircle size={12} />, color: '#A78BFA', label: 'Created' },
  BATTLE_WIN: { icon: <Swords size={12} />, color: '#10B981', label: 'Won battle' },
  BATTLE_LOSS: { icon: <Swords size={12} />, color: '#EF4444', label: 'Lost battle' },
  UPGRADE_SUCCESS: { icon: <Sparkles size={12} />, color: '#10B981', label: 'Upgraded' },
  UPGRADE_FAIL: { icon: <XCircle size={12} />, color: '#EF4444', label: 'Failed upgrade' },
};

const MOCK_NAMES = [
  'Apex', 'SniperX', 'Valkyrie', 'Titan', 'Shadow', 'Nova',
  'Orion', 'Helix', 'Rogue', 'Cipher', 'Atlas', 'Zephyr',
  'Blaze', 'Storm', 'Venom', 'Phantom', 'Echo', 'Frost',
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
  const [visibleCount, setVisibleCount] = useState(12);
  const containerRef = useRef<HTMLDivElement>(null);
  const realEventsRef = useRef<Activity[]>([]);
  const lastFetchRef = useRef<string | null>(null);

  const calcVisibleCount = useCallback(() => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    const rowHeight = 44;
    setVisibleCount(Math.max(6, Math.floor(h / rowHeight)));
  }, []);

  useEffect(() => {
    calcVisibleCount();
    const observer = new ResizeObserver(calcVisibleCount);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [calcVisibleCount]);

  const generateMock = useCallback((): Activity | null => {
    if (!cases.length) return null;
    const types: ActivityType[] = ['CASE_OPEN', 'UPGRADE_SUCCESS', 'UPGRADE_FAIL'];
    const type = types[Math.floor(Math.random() * types.length)];
    const c = cases[Math.floor(Math.random() * cases.length)];
    const drops = c.possibleDrops?.length ? c.possibleDrops : [];
    const drop = drops.length > 0 ? drops[Math.floor(Math.random() * drops.length)] : null;
    const value = drop ? drop.value : Math.max(1, Math.floor(c.price));
    const rarity = getRarityByValue(value);

    return {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      user: MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)],
      caseName: c.name,
      currency: (c as any).tokenTicker || c.currency,
      value,
      rarity,
      image: drop?.image || c.image || null,
      imageMeta: (c as any).imageMeta || null,
      timestamp: new Date(Date.now() - Math.random() * 300_000),
      isReal: false,
    };
  }, [cases]);

  useEffect(() => {
    const fetchReal = async () => {
      try {
        const res = await api.getActivityFeed();
        const events: Activity[] = (res.data?.events || []).map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
          isReal: true,
        }));
        realEventsRef.current = events;
        lastFetchRef.current = new Date().toISOString();
      } catch { /* ignore */ }
    };
    fetchReal();
    const poll = setInterval(fetchReal, 30_000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!cases.length) {
      setActivities([]);
      return;
    }

    const build = () => {
      const real = realEventsRef.current.slice(0, visibleCount);
      const needed = Math.max(0, visibleCount - real.length);
      const mocks = Array.from({ length: needed }, () => generateMock()).filter(Boolean) as Activity[];
      const merged = [...real, ...mocks];
      merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(merged.slice(0, visibleCount));
    };

    build();

    const interval = setInterval(() => {
      const real = realEventsRef.current;
      setActivities(prev => {
        const mock = generateMock();
        if (!mock) return prev;
        const next = [mock, ...prev];
        const realIds = new Set(real.map(r => r.id));
        const kept = next.filter(a => a.isReal ? realIds.has(a.id) : true);
        const realInList = kept.filter(a => a.isReal);
        const mocksInList = kept.filter(a => !a.isReal);
        const combined = [...realInList, ...mocksInList].slice(0, visibleCount);
        combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return combined;
      });
    }, 4000 + Math.random() * 4000);

    return () => clearInterval(interval);
  }, [cases, visibleCount, generateMock]);

  const formatTimeAgo = (date: Date): string => {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return 'now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  };

  const getDescription = (a: Activity): React.ReactNode => {
    switch (a.type) {
      case 'CASE_OPEN':
        return (
          <>
            <span className="text-white/70">{a.caseName}</span>
            {a.value != null && <> · <span className="font-bold" style={{ color: RARITY_COLORS[getRarityByValue(a.value)] }}>{a.value} {a.currency}</span></>}
          </>
        );
      case 'CASE_CREATE':
        return <><span className="text-[#A78BFA]">{a.caseName}</span> · {a.value} {a.currency}</>;
      case 'BATTLE_WIN':
        return <><span className="text-web3-success font-bold">Won</span> {a.value != null ? `${a.value.toFixed(1)} ₮` : ''}</>;
      case 'BATTLE_LOSS':
        return <><span className="text-red-400 font-bold">Lost</span> {a.cost != null ? `${a.cost.toFixed(1)} ₮` : ''}</>;
      case 'UPGRADE_SUCCESS':
        return <><span className="text-web3-success font-bold">{a.value} {a.currency}</span></>;
      case 'UPGRADE_FAIL':
        return <><span className="text-red-400">{a.value} {a.currency}</span></>;
      default:
        return null;
    }
  };

  const renderIcon = (a: Activity) => {
    const img = a.image;
    if (img && (img.startsWith('http') || img.startsWith('/') || img.startsWith('data:'))) {
      return (
        <ImageWithMeta
          src={img}
          meta={a.imageMeta}
          className="w-full h-full rounded-lg"
          imgClassName="w-full h-full object-cover"
        />
      );
    }
    const meta = TYPE_META[a.type];
    return <span style={{ color: meta.color }}>{meta.icon}</span>;
  };

  if (!cases.length) return null;

  return (
    <div className="w-56 bg-black/40 border-r border-white/[0.06] flex flex-col h-full pt-20">
      <div className="px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-web3-success rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <span className="font-bold text-[10px] uppercase tracking-[0.15em] text-gray-300">Live</span>
          <span className="text-[9px] text-gray-600 ml-auto tabular-nums">{activities.filter(a => a.isReal).length} real</span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden px-1.5 py-1">
        {activities.map((a, i) => {
          const meta = TYPE_META[a.type];
          return (
            <div
              key={a.id}
              onClick={() => onSelectUser(a.user)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/[0.04] group ${i === 0 ? 'animate-slide-in' : ''}`}
            >
              <div className="w-7 h-7 rounded-lg border border-white/[0.08] bg-black/30 flex items-center justify-center shrink-0 overflow-hidden">
                {renderIcon(a)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-white truncate max-w-[60px]">{a.user}</span>
                  <span className="text-[9px] shrink-0" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <div className="text-[9px] text-gray-500 truncate leading-tight">
                  {getDescription(a)}
                </div>
              </div>

              <span className="text-[8px] text-gray-600 tabular-nums shrink-0">{formatTimeAgo(a.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
