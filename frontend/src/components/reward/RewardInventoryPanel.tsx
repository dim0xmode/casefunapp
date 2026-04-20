import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { ImageWithMeta } from '../ui/ImageWithMeta';
import { ItemCard } from '../ItemCard';
import { formatDecimal } from '../../utils/number';
import { Item, Rarity } from '../../types';
import {
  RewardInventoryGroup,
  RewardDropKind,
  dropKindLabel,
  isTestDrop,
  isNftDrop,
  currencyLabel,
  isTestCurrency,
} from '../../types/reward';

interface Props {
  isTelegramMiniApp?: boolean;
}

const kindColor = (kind: RewardDropKind): string => {
  switch (kind) {
    case 'USDT':
    case 'TEST_USDT':
      return '#10B981';
    case 'CFT':
    case 'TEST_CFT':
      return '#66FCF1';
    case 'NFT':
    case 'TEST_NFT':
      return '#D946EF';
    default:
      return '#9CA3AF';
  }
};

const stackToItem = (
  kind: RewardDropKind,
  amount: number,
  caseName: string
): Item => ({
  id: `${caseName}-${kind}`,
  name: dropKindLabel(kind),
  value: Number(amount) || 0,
  currency: dropKindLabel(kind),
  rarity: Rarity.COMMON,
  image: isNftDrop(kind) ? '🖼️' : kind.includes('USDT') ? '💵' : '🪙',
  color: kindColor(kind),
});

const toRarity = (raw: string | undefined): Rarity => {
  const r = String(raw || '').toUpperCase();
  if (r === 'UNCOMMON') return Rarity.UNCOMMON;
  if (r === 'RARE') return Rarity.RARE;
  if (r === 'LEGENDARY') return Rarity.LEGENDARY;
  if (r === 'MYTHIC') return Rarity.MYTHIC;
  return Rarity.COMMON;
};

const nftToItem = (n: RewardInventoryGroup['nftItems'][number]): Item => ({
  id: n.id,
  name: n.name,
  value: 1,
  currency: dropKindLabel(n.kind),
  rarity: toRarity(n.rarity),
  image: n.image || '🖼️',
  color: n.color || kindColor(n.kind),
});

export const RewardInventoryPanel: React.FC<Props> = ({ isTelegramMiniApp = false }) => {
  const [groups, setGroups] = useState<RewardInventoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.getMyRewardInventory();
      setGroups(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load rewards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.case.name.localeCompare(b.case.name));
  }, [groups]);

  if (loading) {
    return <div className="text-xs text-gray-500 text-center py-8">Loading…</div>;
  }
  if (error) {
    return <div className="text-xs text-red-400 text-center py-8">{error}</div>;
  }
  if (sortedGroups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-xs text-gray-500">
        No reward drops yet. Open a reward case to see your prizes here.
      </div>
    );
  }

  return (
    <div className={isTelegramMiniApp ? 'space-y-4' : 'space-y-5'}>
      {sortedGroups.map((g) => {
        const caseTest = isTestCurrency(g.case.openCurrency);
        const hasAny = g.stacks.length > 0 || g.nftItems.length > 0;
        return (
          <div
            key={g.case.id}
            className="rounded-2xl border border-white/[0.08] bg-black/20 p-3 md:p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 to-web3-accent/20 overflow-hidden shrink-0">
                {g.case.imageUrl ? (
                  <ImageWithMeta
                    src={g.case.imageUrl}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg">🎁</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate flex items-center gap-2">
                  {g.case.name}
                  {caseTest && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/15">
                      TEST
                    </span>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{g.case.status}</span>
                  {g.prePurchase && g.prePurchase.remaining > 0 && (
                    <span className="text-emerald-400 font-bold">
                      {g.prePurchase.remaining} prepaid
                    </span>
                  )}
                </div>
              </div>
            </div>

            {hasAny ? (
              <div
                className={`grid ${
                  isTelegramMiniApp
                    ? 'grid-cols-3 gap-2'
                    : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3'
                }`}
              >
                {g.stacks.map((s) => (
                  <ItemCard
                    key={`${g.case.id}-${s.kind}`}
                    item={stackToItem(s.kind, s.amount, g.case.name)}
                    size="sm"
                    compactContent={isTelegramMiniApp}
                    currencyPrefix=""
                  />
                ))}
                {g.nftItems.map((n) => (
                  <ItemCard
                    key={n.id}
                    item={nftToItem(n)}
                    size="sm"
                    compactContent={isTelegramMiniApp}
                    currencyPrefix=""
                  />
                ))}
              </div>
            ) : (
              g.prePurchase && g.prePurchase.remaining > 0 ? (
                <div className="text-[11px] text-gray-500 text-center py-2">
                  {g.prePurchase.remaining} pre-purchase slot
                  {g.prePurchase.remaining === 1 ? '' : 's'} reserved (
                  {currencyLabel(g.prePurchase.currency)}). Drops appear here after opening.
                </div>
              ) : (
                <div className="text-[11px] text-gray-600 text-center py-2">No drops yet.</div>
              )
            )}

            {(g.stacks.length > 0 || g.nftItems.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                {g.stacks.map((s) => {
                  const test = isTestDrop(s.kind);
                  return (
                    <button
                      key={`claim-${s.kind}`}
                      disabled
                      title={test ? 'Test drop — cosmetic only' : 'Available on mainnet'}
                      className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/[0.04] border border-white/[0.08] text-gray-500 cursor-not-allowed"
                    >
                      Claim {formatDecimal(s.amount)} {dropKindLabel(s.kind)}
                    </button>
                  );
                })}
                {g.nftItems.length > 0 && (
                  <button
                    disabled
                    title="Available on mainnet"
                    className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/[0.04] border border-white/[0.08] text-gray-500 cursor-not-allowed"
                  >
                    Claim {g.nftItems.length} NFT
                    {g.nftItems.length === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
