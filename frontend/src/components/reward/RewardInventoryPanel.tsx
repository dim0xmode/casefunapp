import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { ImageWithMeta } from '../ui/ImageWithMeta';
import { formatDecimal } from '../../utils/number';
import {
  RewardInventoryGroup,
  dropKindLabel,
  isTestDrop,
  currencyLabel,
  isTestCurrency,
} from '../../types/reward';

interface Props {
  isTelegramMiniApp?: boolean;
}

const kindBadgeColor = (kind: string) => {
  switch (kind) {
    case 'USDT':
    case 'TEST_USDT':
      return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'CFT':
    case 'TEST_CFT':
      return 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10';
    case 'NFT':
    case 'TEST_NFT':
      return 'text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10';
    default:
      return 'text-gray-300 border-gray-500/30 bg-gray-500/10';
  }
};

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

  if (loading) {
    return <div className="text-xs text-gray-500 text-center py-8">Loading…</div>;
  }
  if (error) {
    return <div className="text-xs text-red-400 text-center py-8">{error}</div>;
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-xs text-gray-500">
        No reward drops yet. Open a reward case to see your prizes here.
      </div>
    );
  }

  return (
    <div className={isTelegramMiniApp ? 'space-y-3' : 'space-y-4'}>
      {groups.map((g) => {
        const caseTest = isTestCurrency(g.case.openCurrency);
        return (
          <div
            key={g.case.id}
            className="rounded-2xl border border-white/[0.08] bg-black/25 p-3 md:p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              {g.case.imageUrl ? (
                <ImageWithMeta
                  src={g.case.imageUrl}
                  className="w-10 h-10 rounded-lg border border-white/[0.06] overflow-hidden"
                  imgClassName="w-full h-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate flex items-center gap-2">
                  {g.case.name}
                  {caseTest && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/15">
                      TEST
                    </span>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">
                  {g.case.status}
                  {g.prePurchase && g.prePurchase.remaining > 0 && (
                    <span className="ml-2 text-emerald-400">
                      {g.prePurchase.remaining} prepaid
                    </span>
                  )}
                </div>
              </div>
            </div>

            {g.stacks.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {g.stacks.map((s) => {
                  const test = isTestDrop(s.kind);
                  return (
                    <div
                      key={s.kind}
                      className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-black/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${kindBadgeColor(
                            s.kind
                          )}`}
                        >
                          {dropKindLabel(s.kind)}
                        </span>
                        <span className="text-sm font-bold text-white">
                          {formatDecimal(Number(s.amount))}
                        </span>
                      </div>
                      <button
                        disabled
                        title={test ? 'Test drop — cosmetic only' : 'Available on mainnet'}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/[0.04] border border-white/[0.06] text-gray-500 cursor-not-allowed"
                      >
                        Claim
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {g.nftItems.length > 0 && (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-2">
                {g.nftItems.map((n) => {
                  const test = isTestDrop(n.kind);
                  return (
                    <div
                      key={n.id}
                      className="rounded-lg border border-white/[0.06] bg-black/30 p-2 flex flex-col items-center gap-1 relative"
                    >
                      {test && (
                        <div className="absolute top-1 right-1 text-[8px] font-black uppercase px-1 py-0.5 rounded border border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/20">
                          TEST
                        </div>
                      )}
                      <div
                        className="w-full aspect-square rounded-md border flex items-center justify-center overflow-hidden"
                        style={{ borderColor: n.color + '60' }}
                      >
                        {n.image ? (
                          <ImageWithMeta
                            src={n.image}
                            className="w-full h-full"
                            imgClassName="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] uppercase text-gray-500">NFT</span>
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-white text-center truncate w-full">
                        {n.name}
                      </div>
                      <button
                        disabled
                        title={test ? 'Test NFT — cosmetic only' : 'Available on mainnet'}
                        className="w-full px-1 py-1 rounded text-[9px] font-bold bg-white/[0.04] border border-white/[0.06] text-gray-500 cursor-not-allowed"
                      >
                        Claim
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {g.stacks.length === 0 &&
              g.nftItems.length === 0 &&
              g.prePurchase &&
              g.prePurchase.remaining > 0 && (
                <div className="text-[10px] text-gray-500 italic">
                  No drops yet — {g.prePurchase.remaining} pre-purchase slot
                  {g.prePurchase.remaining === 1 ? '' : 's'} pending ({currencyLabel(g.prePurchase.currency)}).
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
};
