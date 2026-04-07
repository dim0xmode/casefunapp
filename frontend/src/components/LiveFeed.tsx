import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Case, Rarity } from '../types';
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
  avatar?: string | null;
  avatarMeta?: any;
  caseName?: string;
  currency?: string;
  value?: number;
  image?: string | null;
  imageMeta?: any;
  cost?: number;
  timestamp: Date;
  isReal?: boolean;
}

const TYPE_META: Record<ActivityType, { icon: React.ReactNode; color: string; verb: string }> = {
  CASE_OPEN: { icon: <Package size={11} />, color: '#66FCF1', verb: 'opened' },
  CASE_CREATE: { icon: <PlusCircle size={11} />, color: '#A78BFA', verb: 'created' },
  BATTLE_WIN: { icon: <Swords size={11} />, color: '#10B981', verb: 'won battle' },
  BATTLE_LOSS: { icon: <Swords size={11} />, color: '#EF4444', verb: 'lost battle' },
  UPGRADE_SUCCESS: { icon: <Sparkles size={11} />, color: '#10B981', verb: 'upgraded' },
  UPGRADE_FAIL: { icon: <XCircle size={11} />, color: '#EF4444', verb: 'failed upgrade' },
};

const MOCK_NAMES = [
  'Apex', 'SniperX', 'Valkyrie', 'Titan', 'Shadow', 'Nova',
  'Orion', 'Helix', 'Rogue', 'Cipher', 'Atlas', 'Zephyr',
  'Blaze', 'Storm', 'Venom', 'Phantom', 'Echo', 'Frost',
];

const getRarityByValue = (v: number): Rarity => {
  if (v < 5) return Rarity.COMMON;
  if (v < 20) return Rarity.UNCOMMON;
  if (v < 50) return Rarity.RARE;
  if (v < 100) return Rarity.LEGENDARY;
  return Rarity.MYTHIC;
};

interface LiveFeedProps {
  cases: Case[];
  onSelectUser: (username: string) => void;
}

export const LiveFeed: React.FC<LiveFeedProps> = ({ cases, onSelectUser }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [slots, setSlots] = useState(14);
  const containerRef = useRef<HTMLDivElement>(null);
  const realRef = useRef<Activity[]>([]);

  const calcSlots = useCallback(() => {
    if (!containerRef.current) return;
    const ROW_H = 38;
    setSlots(Math.max(6, Math.floor(containerRef.current.clientHeight / ROW_H)));
  }, []);

  useEffect(() => {
    calcSlots();
    const ro = new ResizeObserver(calcSlots);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [calcSlots]);

  const makeMock = useCallback((): Activity | null => {
    if (!cases.length) return null;
    const types: ActivityType[] = ['CASE_OPEN', 'UPGRADE_SUCCESS', 'UPGRADE_FAIL'];
    const type = types[Math.floor(Math.random() * types.length)];
    const c = cases[Math.floor(Math.random() * cases.length)];
    const drops = c.possibleDrops?.length ? c.possibleDrops : [];
    const drop = drops.length ? drops[Math.floor(Math.random() * drops.length)] : null;
    const value = drop ? drop.value : Math.max(1, Math.floor(c.price));
    return {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      user: MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)],
      caseName: c.name,
      currency: (c as any).tokenTicker || c.currency,
      value,
      image: drop?.image || c.image || null,
      imageMeta: (c as any).imageMeta || null,
      timestamp: new Date(Date.now() - Math.random() * 300_000),
      isReal: false,
    };
  }, [cases]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.getActivityFeed();
        realRef.current = (res.data?.events || []).map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
          isReal: true,
        }));
      } catch { /* */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!cases.length) { setActivities([]); return; }

    const fill = () => {
      const real = realRef.current.slice(0, slots);
      const need = Math.max(0, slots - real.length);
      const mocks = Array.from({ length: need }, () => makeMock()).filter(Boolean) as Activity[];
      setActivities([...real, ...mocks].slice(0, slots));
    };
    fill();

    const id = setInterval(() => {
      setActivities(prev => {
        const m = makeMock();
        if (!m) return prev;
        const realIds = new Set(realRef.current.map(r => r.id));
        const reals = prev.filter(a => a.isReal && realIds.has(a.id));
        const mocks = prev.filter(a => !a.isReal);
        mocks.unshift(m);
        return [...reals, ...mocks].slice(0, slots);
      });
    }, 4000 + Math.random() * 3000);

    return () => clearInterval(id);
  }, [cases, slots, makeMock]);

  const renderAvatar = (a: Activity) => {
    if (a.avatar && (a.avatar.startsWith('http') || a.avatar.startsWith('/') || a.avatar.startsWith('data:'))) {
      return (
        <ImageWithMeta
          src={a.avatar}
          meta={a.avatarMeta}
          className="w-full h-full rounded-full"
          imgClassName="w-full h-full object-cover"
        />
      );
    }
    const initial = (a.user?.[0] || '?').toUpperCase();
    return <span className="text-[9px] font-bold text-gray-500">{initial}</span>;
  };

  const getDetail = (a: Activity): React.ReactNode => {
    const meta = TYPE_META[a.type];
    switch (a.type) {
      case 'CASE_OPEN':
        return (
          <span>
            <span style={{ color: meta.color }}>{meta.verb}</span>{' '}
            <span className="text-white/60">{a.caseName}</span>
            {a.value != null && (
              <span className="font-bold" style={{ color: RARITY_COLORS[getRarityByValue(a.value)] }}> {a.value} {a.currency}</span>
            )}
          </span>
        );
      case 'CASE_CREATE':
        return <span><span style={{ color: meta.color }}>{meta.verb}</span> <span className="text-white/60">{a.caseName}</span></span>;
      case 'BATTLE_WIN':
        return <span><span style={{ color: meta.color }}>{meta.verb}</span>{a.value != null ? ` ${a.value.toFixed(1)} ₮` : ''}</span>;
      case 'BATTLE_LOSS':
        return <span><span style={{ color: meta.color }}>{meta.verb}</span>{a.cost != null ? ` ${a.cost.toFixed(1)} ₮` : ''}</span>;
      case 'UPGRADE_SUCCESS':
        return <span><span style={{ color: meta.color }}>{meta.verb}</span> <span className="text-web3-success font-bold">{a.value} {a.currency}</span></span>;
      case 'UPGRADE_FAIL':
        return <span><span style={{ color: meta.color }}>{meta.verb}</span> <span className="text-red-400">{a.value} {a.currency}</span></span>;
      default:
        return null;
    }
  };

  if (!cases.length) return null;

  return (
    <div className="w-52 bg-black/40 border-r border-white/[0.06] flex flex-col h-full pt-20">
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-web3-success rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <span className="font-bold text-[10px] uppercase tracking-[0.15em] text-gray-400">Live</span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden">
        {activities.map((a, i) => (
          <div
            key={a.id}
            onClick={() => onSelectUser(a.user)}
            className={`flex items-center gap-2 px-2.5 py-[5px] cursor-pointer transition hover:bg-white/[0.03] ${i === 0 ? 'animate-slide-in' : ''}`}
          >
            <div className="w-6 h-6 rounded-full bg-black/40 border border-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
              {renderAvatar(a)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-white truncate block">{a.user}</span>
              <span className="text-[9px] text-gray-500 truncate block leading-tight">
                {getDetail(a)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
