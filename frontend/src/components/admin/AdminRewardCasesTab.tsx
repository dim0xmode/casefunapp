import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { formatUsdt } from '../../utils/number';

type Status = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
type Currency = 'CFP' | 'USDT' | 'TEST_CFP' | 'TEST_USDT';
type DropKind = 'USDT' | 'CFT' | 'NFT' | 'TEST_USDT' | 'TEST_CFT' | 'TEST_NFT';
type LimitMode = 'NONE' | 'BY_OPENS' | 'BY_DROP';

type DropDraft = {
  id?: string;
  kind: DropKind;
  name: string;
  amount: string;
  probability: string;
  rarity: string;
  color: string;
  image: string | null;
  nftChain: string | null;
  nftContract: string | null;
};

type CaseDraft = {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  openCurrency: Currency;
  openPrice: string;
  prePrice: string;
  chain: string;
  startAt: string; // datetime-local value
  endAt: string;
  limitMode: LimitMode;
  limitTotal: string;
  drops: DropDraft[];
};

const CURRENCIES: { value: Currency; label: string; isTest?: boolean }[] = [
  { value: 'CFP', label: 'CFP (real)' },
  { value: 'USDT', label: 'USDT (real)' },
  { value: 'TEST_CFP', label: 'TEST CFP (cosmetic)', isTest: true },
  { value: 'TEST_USDT', label: 'TEST USDT (cosmetic)', isTest: true },
];

const DROP_KINDS: { value: DropKind; label: string; isTest?: boolean }[] = [
  { value: 'USDT', label: 'USDT (real)' },
  { value: 'CFT', label: 'CFT (future token, virtual)' },
  { value: 'NFT', label: 'NFT (real, 1-of-1)' },
  { value: 'TEST_USDT', label: 'TEST USDT (cosmetic)', isTest: true },
  { value: 'TEST_CFT', label: 'TEST CFT (cosmetic)', isTest: true },
  { value: 'TEST_NFT', label: 'TEST NFT (cosmetic)', isTest: true },
];

const LIMIT_MODES: { value: LimitMode; label: string; hint: string }[] = [
  { value: 'NONE', label: 'Unlimited', hint: 'Case runs until manually stopped.' },
  { value: 'BY_OPENS', label: 'By total opens', hint: 'Auto-pauses after N openings (mixed-kind cases).' },
  { value: 'BY_DROP', label: 'By drop quantity', hint: 'Monovalent only — auto-pauses when drop budget is exhausted.' },
];

const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY', 'MYTHIC'];

const emptyDrop = (): DropDraft => ({
  kind: 'USDT',
  name: '',
  amount: '',
  probability: '',
  rarity: 'COMMON',
  color: '#9CA3AF',
  image: null,
  nftChain: null,
  nftContract: null,
});

const emptyCase = (): CaseDraft => ({
  name: '',
  description: '',
  imageUrl: '',
  openCurrency: 'CFP',
  openPrice: '1',
  prePrice: '',
  chain: '',
  startAt: '',
  endAt: '',
  limitMode: 'NONE',
  limitTotal: '',
  drops: [emptyDrop()],
});

const toLocalInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const STATUS_ORDER: Record<Status, number> = {
  ACTIVE: 0,
  SCHEDULED: 1,
  DRAFT: 2,
  PAUSED: 3,
  COMPLETED: 4,
};

const statusBadgeClass = (status: Status) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'SCHEDULED':
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    case 'DRAFT':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    case 'PAUSED':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'COMPLETED':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
  }
};

export const AdminRewardCasesTab: React.FC = () => {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | Status>('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<CaseDraft | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'list' | 'stats'>('list');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.getAdminRewardCases({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      });
      setCases(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load reward cases');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedCases = useMemo(() => {
    return [...cases].sort((a, b) => {
      const sa = STATUS_ORDER[a.status as Status] ?? 99;
      const sb = STATUS_ORDER[b.status as Status] ?? 99;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [cases]);

  const openNew = () => setDraft(emptyCase());

  const openEdit = (c: any) => {
    setDraft({
      id: c.id,
      name: c.name || '',
      description: c.description || '',
      imageUrl: c.imageUrl || '',
      openCurrency: c.openCurrency,
      openPrice: String(c.openPrice ?? ''),
      prePrice: c.prePrice == null ? '' : String(c.prePrice),
      chain: c.chain || '',
      startAt: toLocalInput(c.startAt),
      endAt: toLocalInput(c.endAt),
      limitMode: c.limitMode,
      limitTotal: c.limitTotal == null ? '' : String(c.limitTotal),
      drops: Array.isArray(c.drops) && c.drops.length
        ? c.drops.map((d: any) => ({
            id: d.id,
            kind: d.kind,
            name: d.name,
            amount: String(d.amount ?? ''),
            probability: String(d.probability ?? ''),
            rarity: d.rarity || 'COMMON',
            color: d.color || '#9CA3AF',
            image: d.image || null,
            nftChain: d.nftChain || null,
            nftContract: d.nftContract || null,
          }))
        : [emptyDrop()],
    });
  };

  const closeDraft = () => setDraft(null);

  const save = async () => {
    if (!draft) return;
    const probSum = draft.drops.reduce((acc, d) => acc + (Number(d.probability) || 0), 0);
    if (Math.abs(probSum - 100) > 0.01) {
      window.alert(`Drop probabilities must sum to 100 (current: ${probSum.toFixed(4)})`);
      return;
    }

    const payload = {
      name: draft.name,
      description: draft.description || null,
      imageUrl: draft.imageUrl || null,
      openCurrency: draft.openCurrency,
      openPrice: Number(draft.openPrice),
      prePrice: draft.prePrice ? Number(draft.prePrice) : null,
      chain: draft.chain || null,
      startAt: fromLocalInput(draft.startAt),
      endAt: fromLocalInput(draft.endAt),
      limitMode: draft.limitMode,
      limitTotal: draft.limitMode === 'NONE' ? null : Number(draft.limitTotal),
      drops: draft.drops.map((d, idx) => ({
        id: d.id,
        kind: d.kind,
        name: d.name.trim(),
        amount: Number(d.amount),
        probability: Number(d.probability),
        rarity: d.rarity || 'COMMON',
        color: d.color || '#9CA3AF',
        image: d.image || null,
        sortOrder: idx,
        nftChain: d.nftChain || null,
        nftContract: d.nftContract || null,
      })),
    };

    setSaving('save');
    try {
      if (draft.id) {
        await api.updateAdminRewardCase(draft.id, payload);
      } else {
        await api.createAdminRewardCase(payload);
      }
      setDraft(null);
      await load();
    } catch (err: any) {
      window.alert(err?.message || 'Failed to save case');
    } finally {
      setSaving(null);
    }
  };

  const act = async (id: string, action: string, fn: () => Promise<any>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setSaving(`${action}-${id}`);
    try {
      await fn();
      await load();
    } catch (err: any) {
      window.alert(err?.message || `Failed: ${action}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.1] bg-black/35 p-1 w-fit">
        <button
          onClick={() => setSubTab('list')}
          className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest font-bold transition ${
            subTab === 'list'
              ? 'bg-web3-accent/20 text-web3-accent'
              : 'text-gray-400'
          }`}
        >
          Cases
        </button>
        <button
          onClick={() => setSubTab('stats')}
          className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest font-bold transition ${
            subTab === 'stats'
              ? 'bg-web3-accent/20 text-web3-accent'
              : 'text-gray-400'
          }`}
        >
          Statistics
        </button>
      </div>

      {subTab === 'stats' && <RewardCaseStatsPanel />}

      {subTab === 'list' && <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Reward Cases are independent of the RTU economy. Pre-purchase allowed when SCHEDULED, drops use admin-set probabilities.
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-web3-accent to-web3-success text-black"
        >
          + Create Reward Case
        </button>
      </div>

      {loading && <div className="text-xs text-gray-500">Loading…</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}

      {!loading && !error && sortedCases.length === 0 && (
        <div className="text-xs text-gray-500 p-8 text-center border border-dashed border-white/[0.08] rounded-xl">
          No reward cases yet. Create one to get started.
        </div>
      )}

      <div className="space-y-2">
        {sortedCases.map((c) => {
          const prePurchaseOutstanding = c.prePurchaseSummary?.totalRemaining ?? c.stats?.openPrePurchaseRemaining ?? 0;
          const openingsCount = c.stats?.totalOpens ?? c.totalOpens ?? 0;
          const dropCount = Array.isArray(c.drops) ? c.drops.length : 0;
          return (
            <div
              key={c.id}
              className="rounded-xl border border-white/[0.08] bg-black/20 p-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-4"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    className="w-12 h-12 rounded-lg object-cover border border-white/[0.05]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-white/[0.04] border border-white/[0.05]" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-white truncate">{c.name}</div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold ${statusBadgeClass(
                        c.status
                      )}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5 space-x-2">
                    <span>{dropCount} drop{dropCount === 1 ? '' : 's'}</span>
                    <span>•</span>
                    <span>
                      {formatUsdt(c.openPrice)} {c.openCurrency}
                      {c.prePrice != null ? ` (pre ${formatUsdt(c.prePrice)})` : ''}
                    </span>
                    {c.chain && (
                      <>
                        <span>•</span>
                        <span>{c.chain}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>
                      {c.limitMode === 'NONE'
                        ? 'no limit'
                        : `${c.limitMode === 'BY_OPENS' ? 'opens' : 'drops'}: ${
                            c.limitRemaining ?? '?'
                          } / ${c.limitTotal ?? '?'}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-0.5 text-[10px] text-gray-500">
                <div>opens: {openingsCount}</div>
                <div>pre: {prePurchaseOutstanding} outstanding</div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => openEdit(c)}
                  disabled={c.status === 'COMPLETED'}
                  className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 disabled:opacity-40"
                >
                  Edit
                </button>
                {c.status === 'DRAFT' && (
                  <button
                    onClick={() => act(c.id, 'publish', () => api.publishAdminRewardCase(c.id))}
                    disabled={saving !== null}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                  >
                    Publish
                  </button>
                )}
                {(c.status === 'ACTIVE' || c.status === 'SCHEDULED') && (
                  <button
                    onClick={() => act(c.id, 'pause', () => api.pauseAdminRewardCase(c.id))}
                    disabled={saving !== null}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                  >
                    Pause
                  </button>
                )}
                {c.status === 'PAUSED' && (
                  <button
                    onClick={() => act(c.id, 'resume', () => api.resumeAdminRewardCase(c.id))}
                    disabled={saving !== null}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                  >
                    Resume
                  </button>
                )}
                {c.status !== 'COMPLETED' && (
                  <button
                    onClick={() =>
                      act(
                        c.id,
                        'complete',
                        () => api.completeAdminRewardCase(c.id),
                        'Complete this case? This is IRREVERSIBLE — no refunds will be processed on unused pre-purchases.'
                      )
                    }
                    disabled={saving !== null}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-400 hover:bg-purple-500/25"
                  >
                    Complete
                  </button>
                )}
                {prePurchaseOutstanding > 0 && c.status !== 'COMPLETED' && (
                  <button
                    onClick={() =>
                      act(
                        c.id,
                        'refund',
                        () => api.refundAdminRewardCasePrePurchases(c.id),
                        `Refund ALL outstanding pre-purchases on "${c.name}"? This cannot be undone.`
                      )
                    }
                    disabled={saving !== null}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                  >
                    Refund pre
                  </button>
                )}
                {openingsCount === 0 && prePurchaseOutstanding === 0 && c.status !== 'COMPLETED' && (
                  <button
                    onClick={() =>
                      act(
                        c.id,
                        'delete',
                        () => api.deleteAdminRewardCase(c.id),
                        `Delete "${c.name}" permanently? This cannot be undone.`
                      )
                    }
                    disabled={saving !== null}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      </>}

      {draft && (
        <RewardCaseEditor
          draft={draft}
          setDraft={setDraft}
          onClose={closeDraft}
          onSave={save}
          saving={saving === 'save'}
        />
      )}
    </div>
  );
};

const RewardCaseStatsPanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.getAdminRewardCaseStats({
        from: from || undefined,
        to: to || undefined,
      });
      setData(res?.data || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">Range</div>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
        />
        <span className="text-gray-600 text-xs">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
        />
        <button
          onClick={() => {
            setFrom('');
            setTo('');
          }}
          className="px-3 py-1.5 rounded-lg text-[11px] bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]"
        >
          Clear
        </button>
      </div>

      {loading && <div className="text-xs text-gray-500">Loading…</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Cases" value={data.totals?.casesCount ?? 0} />
            <StatTile label="Opens in range" value={data.totals?.rangeOpens ?? 0} />
            <StatTile
              label="Paid in range"
              value={Number(data.totals?.rangePaid ?? 0).toFixed(2)}
            />
            <StatTile
              label="Pre-purchase outstanding"
              value={data.totals?.outstandingPrePurchase ?? 0}
            />
          </div>

          <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left p-2">Case</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-right p-2">Opens (total)</th>
                  <th className="text-right p-2">Opens (range)</th>
                  <th className="text-right p-2">Paid (range)</th>
                  <th className="text-right p-2">Pre outstanding</th>
                  <th className="text-right p-2">Limit left</th>
                </tr>
              </thead>
              <tbody>
                {(data.cases || []).map((c: any) => (
                  <tr key={c.id} className="border-t border-white/[0.04]">
                    <td className="p-2 text-white font-bold">{c.name}</td>
                    <td className="p-2">
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-white/[0.1] text-gray-300">
                        {c.status}
                      </span>
                    </td>
                    <td className="p-2 text-right text-gray-300">{c.totalOpens}</td>
                    <td className="p-2 text-right text-white">{c.rangeOpens}</td>
                    <td className="p-2 text-right text-white">
                      {Number(c.rangePaid || 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-right text-amber-300">
                      {c.prePurchase?.outstanding ?? 0}
                    </td>
                    <td className="p-2 text-right text-gray-400">
                      {c.limitMode === 'NONE'
                        ? '∞'
                        : `${c.limitRemaining ?? '?'} / ${c.limitTotal ?? '?'}`}
                    </td>
                  </tr>
                ))}
                {(!data.cases || data.cases.length === 0) && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-500 text-xs">
                      No cases
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
    <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
    <div className="text-xl font-black text-white mt-1">{value}</div>
  </div>
);

type EditorProps = {
  draft: CaseDraft;
  setDraft: React.Dispatch<React.SetStateAction<CaseDraft | null>>;
  onClose: () => void;
  onSave: () => Promise<void>;
  saving: boolean;
};

const RewardCaseEditor: React.FC<EditorProps> = ({ draft, setDraft, onClose, onSave, saving }) => {
  const patchCase = (patch: Partial<CaseDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  const patchDrop = (idx: number, patch: Partial<DropDraft>) =>
    setDraft((prev) =>
      prev
        ? { ...prev, drops: prev.drops.map((d, i) => (i === idx ? { ...d, ...patch } : d)) }
        : prev
    );
  const addDrop = () =>
    setDraft((prev) => (prev ? { ...prev, drops: [...prev.drops, emptyDrop()] } : prev));
  const removeDrop = (idx: number) =>
    setDraft((prev) =>
      prev && prev.drops.length > 1
        ? { ...prev, drops: prev.drops.filter((_, i) => i !== idx) }
        : prev
    );

  const probSum = draft.drops.reduce((acc, d) => acc + (Number(d.probability) || 0), 0);
  const probValid = Math.abs(probSum - 100) <= 0.01;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm overflow-y-auto p-4">
      <div className="max-w-4xl mx-auto bg-[#0B0C10] border border-white/[0.08] rounded-2xl my-8 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-white">
            {draft.id ? 'Edit Reward Case' : 'New Reward Case'}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-white/[0.05]"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input
              value={draft.name}
              onChange={(e) => patchCase({ name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Image URL">
            <input
              value={draft.imageUrl}
              onChange={(e) => patchCase({ imageUrl: e.target.value })}
              className="input"
              placeholder="https://…"
            />
          </Field>
          <Field label="Description" span2>
            <textarea
              value={draft.description}
              onChange={(e) => patchCase({ description: e.target.value })}
              rows={2}
              className="input"
            />
          </Field>
          <Field label="Open currency" required>
            <select
              value={draft.openCurrency}
              onChange={(e) => patchCase({ openCurrency: e.target.value as Currency })}
              className="input"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Open price" required>
            <input
              type="number"
              min="0"
              step="0.00001"
              value={draft.openPrice}
              onChange={(e) => patchCase({ openPrice: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Pre-purchase price" hint="Leave empty to use open price">
            <input
              type="number"
              min="0"
              step="0.00001"
              value={draft.prePrice}
              onChange={(e) => patchCase({ prePrice: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Chain" hint="EVM / TON (optional)">
            <select
              value={draft.chain}
              onChange={(e) => patchCase({ chain: e.target.value })}
              className="input"
            >
              <option value="">— none —</option>
              <option value="EVM">EVM</option>
              <option value="TON">TON</option>
            </select>
          </Field>
          <Field label="Start at" hint="Leave empty → DRAFT (hidden)">
            <input
              type="datetime-local"
              value={draft.startAt}
              onChange={(e) => patchCase({ startAt: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="End at" hint="Leave empty → runs until manual complete">
            <input
              type="datetime-local"
              value={draft.endAt}
              onChange={(e) => patchCase({ endAt: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Limit mode" required>
            <select
              value={draft.limitMode}
              onChange={(e) => patchCase({ limitMode: e.target.value as LimitMode })}
              className="input"
            >
              {LIMIT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-gray-600 mt-1">
              {LIMIT_MODES.find((m) => m.value === draft.limitMode)?.hint}
            </div>
          </Field>
          {draft.limitMode !== 'NONE' && (
            <Field label="Limit total" required>
              <input
                type="number"
                min="0.00001"
                step="0.00001"
                value={draft.limitTotal}
                onChange={(e) => patchCase({ limitTotal: e.target.value })}
                className="input"
              />
            </Field>
          )}
        </div>

        <div className="border-t border-white/[0.05] pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-white">Drops ({draft.drops.length})</div>
            <div className={`text-xs ${probValid ? 'text-emerald-400' : 'text-red-400'}`}>
              Probability sum: {probSum.toFixed(4)} / 100
            </div>
          </div>
          <div className="space-y-3">
            {draft.drops.map((drop, idx) => (
              <div
                key={drop.id ?? idx}
                className="rounded-lg border border-white/[0.06] bg-black/30 p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end"
              >
                <Field label={`#${idx + 1} Kind`}>
                  <select
                    value={drop.kind}
                    onChange={(e) => patchDrop(idx, { kind: e.target.value as DropKind })}
                    className="input"
                  >
                    {DROP_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Name">
                  <input
                    value={drop.name}
                    onChange={(e) => patchDrop(idx, { name: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Amount" hint={drop.kind.endsWith('NFT') ? 'must be 1' : ''}>
                  <input
                    type="number"
                    min="0"
                    step="0.00001"
                    value={drop.amount}
                    onChange={(e) => patchDrop(idx, { amount: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Probability %">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={drop.probability}
                    onChange={(e) => patchDrop(idx, { probability: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Rarity">
                  <select
                    value={drop.rarity}
                    onChange={(e) => patchDrop(idx, { rarity: e.target.value })}
                    className="input"
                  >
                    {RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex gap-2 items-end">
                  <Field label="Color">
                    <input
                      type="color"
                      value={drop.color}
                      onChange={(e) => patchDrop(idx, { color: e.target.value })}
                      className="w-full h-[34px] rounded border border-white/[0.08] bg-black/40"
                    />
                  </Field>
                  <button
                    onClick={() => removeDrop(idx)}
                    disabled={draft.drops.length === 1}
                    className="h-[34px] px-2 rounded text-[10px] bg-red-500/15 text-red-400 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
                <Field label="Image URL" span2>
                  <input
                    value={drop.image || ''}
                    onChange={(e) => patchDrop(idx, { image: e.target.value || null })}
                    className="input"
                    placeholder="https://…"
                  />
                </Field>
                {(drop.kind === 'NFT' || drop.kind === 'TEST_NFT') && (
                  <>
                    <Field label="NFT chain">
                      <select
                        value={drop.nftChain || ''}
                        onChange={(e) => patchDrop(idx, { nftChain: e.target.value || null })}
                        className="input"
                      >
                        <option value="">— inherit case chain —</option>
                        <option value="EVM">EVM</option>
                        <option value="TON">TON</option>
                      </select>
                    </Field>
                    <Field label="NFT contract (future)">
                      <input
                        value={drop.nftContract || ''}
                        onChange={(e) =>
                          patchDrop(idx, { nftContract: e.target.value || null })
                        }
                        className="input"
                        placeholder="0x… or TON address"
                      />
                    </Field>
                  </>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addDrop}
            disabled={draft.drops.length >= 50}
            className="mt-3 px-3 py-1.5 rounded text-[11px] font-bold bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 disabled:opacity-40"
          >
            + Add drop
          </button>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.05] pt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs bg-white/[0.05] hover:bg-white/[0.08] text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !probValid || !draft.name.trim()}
            className="px-5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-40"
          >
            {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create case'}
          </button>
        </div>
        <style>{`
          .input {
            width: 100%;
            padding: 8px 10px;
            border-radius: 8px;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.08);
            color: #D1D5DB;
            font-size: 12px;
          }
          .input:focus { outline: 1px solid rgba(16,185,129,0.4); }
        `}</style>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
  span2?: boolean;
}> = ({ label, children, hint, required, span2 }) => (
  <div className={`space-y-1 ${span2 ? 'md:col-span-2' : ''}`}>
    <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
      {label}
      {required && <span className="text-red-400"> *</span>}
    </label>
    {children}
    {hint && <div className="text-[10px] text-gray-600">{hint}</div>}
  </div>
);
