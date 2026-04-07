import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Case, Rarity } from '../types';

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

const TYPE_META: Record<ActivityType, { color: string; verb: string }> = {
  CASE_OPEN: { color: '#66FCF1', verb: 'opened' },
  CASE_CREATE: { color: '#A78BFA', verb: 'created' },
  BATTLE_WIN: { color: '#10B981', verb: 'won battle' },
  BATTLE_LOSS: { color: '#EF4444', verb: 'lost battle' },
  UPGRADE_SUCCESS: { color: '#10B981', verb: 'upgraded' },
  UPGRADE_FAIL: { color: '#EF4444', verb: 'failed upgrade' },
};

const BOT_NAMES = [
  'Apex', 'SniperX', 'Valkyrie', 'Titan', 'Shadow', 'Nova',
  'Orion', 'Helix', 'Rogue', 'Cipher', 'Atlas', 'Zephyr',
  'Blaze', 'Storm', 'Venom', 'Phantom', 'Echo', 'Frost',
  'Nyx', 'Reaper', 'Lynx', 'Spectre', 'Pulse', 'Viper',
];

const getRarityByValue = (v: number): Rarity => {
  if (v < 5) return Rarity.COMMON;
  if (v < 20) return Rarity.UNCOMMON;
  if (v < 50) return Rarity.RARE;
  if (v < 100) return Rarity.LEGENDARY;
  return Rarity.MYTHIC;
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface LiveFeedProps {
  cases: Case[];
  onSelectUser: (username: string) => void;
}

export const LiveFeed: React.FC<LiveFeedProps> = ({ cases, onSelectUser }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [slots, setSlots] = useState(20);
  const containerRef = useRef<HTMLDivElement>(null);
  const seenRealIds = useRef(new Set<string>());

  const calcSlots = useCallback(() => {
    if (!containerRef.current) return;
    const ROW_H = 32;
    setSlots(Math.max(8, Math.floor(containerRef.current.clientHeight / ROW_H)));
  }, []);

  useEffect(() => {
    calcSlots();
    window.addEventListener('resize', calcSlots);
    const ro = new ResizeObserver(calcSlots);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { ro.disconnect(); window.removeEventListener('resize', calcSlots); };
  }, [calcSlots]);

  const makeBotActivity = useCallback((): Activity | null => {
    if (!cases.length) return null;
    const types: ActivityType[] = ['CASE_OPEN', 'CASE_OPEN', 'CASE_OPEN', 'UPGRADE_SUCCESS', 'UPGRADE_FAIL', 'BATTLE_WIN', 'BATTLE_LOSS'];
    const type = pick(types);
    const c = pick(cases);

    if (type === 'BATTLE_WIN' || type === 'BATTLE_LOSS') {
      return {
        id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        user: pick(BOT_NAMES),
        value: type === 'BATTLE_WIN' ? +(Math.random() * 50 + 1).toFixed(1) : 0,
        cost: +(Math.random() * 30 + 1).toFixed(1),
        timestamp: new Date(),
        isReal: false,
      };
    }

    const drops = c.possibleDrops?.length ? c.possibleDrops : [];
    const drop = drops.length ? pick(drops) : null;
    const value = drop ? drop.value : Math.max(1, Math.floor(c.price));
    return {
      id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      user: pick(BOT_NAMES),
      caseName: c.name,
      currency: (c as any).tokenTicker || c.currency,
      value,
      image: drop?.image || c.image || null,
      imageMeta: (c as any).imageMeta || null,
      timestamp: new Date(),
      isReal: false,
    };
  }, [cases]);

  useEffect(() => {
    if (!cases.length) { setActivities([]); return; }
    const initial = Array.from({ length: slots }, () => makeBotActivity()).filter(Boolean) as Activity[];
    setActivities(initial);
  }, [cases.length, slots, makeBotActivity]);

  useEffect(() => {
    if (!cases.length) return;

    const fetchAndMerge = async () => {
      try {
        const res = await api.getActivityFeed();
        const events: Activity[] = (res.data?.events || []).map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
          isReal: true,
        }));

        const newEvents = events.filter(e => !seenRealIds.current.has(e.id));
        for (const e of events) seenRealIds.current.add(e.id);

        if (newEvents.length > 0) {
          setActivities(prev => {
            const merged = [...newEvents, ...prev];
            return merged.slice(0, slots);
          });
        }
      } catch { /* */ }
    };

    fetchAndMerge();
    const pollId = setInterval(fetchAndMerge, 15_000);
    return () => clearInterval(pollId);
  }, [cases.length, slots]);

  useEffect(() => {
    if (!cases.length) return;

    const tick = () => {
      const bot = makeBotActivity();
      if (!bot) return;
      setActivities(prev => [bot, ...prev].slice(0, slots));
    };

    const id = setInterval(tick, 2500 + Math.random() * 2500);
    return () => clearInterval(id);
  }, [cases.length, slots, makeBotActivity]);

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
          <>
            <span style={{ color: meta.color }}>{meta.verb}</span>{' '}
            <span className="text-white/50">{a.caseName}</span>
            {a.value != null && (
              <span className="font-bold" style={{ color: RARITY_COLORS[getRarityByValue(a.value)] }}> {a.value} {a.currency}</span>
            )}
          </>
        );
      case 'CASE_CREATE':
        return <><span style={{ color: meta.color }}>{meta.verb}</span> <span className="text-white/50">{a.caseName}</span></>;
      case 'BATTLE_WIN':
        return <><span style={{ color: meta.color }}>{meta.verb}</span>{a.value ? ` ${a.value} ₮` : ''}</>;
      case 'BATTLE_LOSS':
        return <><span style={{ color: meta.color }}>{meta.verb}</span>{a.cost ? ` ${a.cost} ₮` : ''}</>;
      case 'UPGRADE_SUCCESS':
        return <><span style={{ color: meta.color }}>{meta.verb}</span> <span className="text-web3-success font-bold">{a.value} {a.currency}</span></>;
      case 'UPGRADE_FAIL':
        return <><span style={{ color: meta.color }}>{meta.verb}</span> <span className="text-red-400">{a.value} {a.currency}</span></>;
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
            className={`flex items-center gap-2 px-2.5 py-[4px] cursor-pointer transition hover:bg-white/[0.03] ${i === 0 ? 'animate-slide-in' : ''}`}
          >
            <div className="w-5 h-5 rounded-full bg-black/40 border border-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
              {renderAvatar(a)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-white truncate block leading-none">{a.user}</span>
              <span className="text-[9px] text-gray-500 truncate block leading-tight mt-[1px]">
                {getDetail(a)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
