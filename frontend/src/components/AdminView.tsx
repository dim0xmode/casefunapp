import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { SearchInput } from './ui/SearchInput';
import { Pagination } from './ui/Pagination';
import { StatCard } from './ui/StatCard';

type TabKey =
  | 'overview'
  | 'users'
  | 'cases'
  | 'battles'
  | 'inventory'
  | 'transactions'
  | 'rtu'
  | 'settings'
  | 'audit'
  | 'reports'
  | 'cms';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'cases', label: 'Cases' },
  { key: 'battles', label: 'Battles' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'rtu', label: 'RTU' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit' },
  { key: 'reports', label: 'Reports' },
  { key: 'cms', label: 'CMS' },
];

const IMMUTABLE_ADMIN_WALLET = '0xc459241D1AC02250dE56b8B7165ebEDF59236524';

type AdminViewProps = {
  currentUser?: { walletAddress?: string | null };
};

export const AdminView: React.FC<AdminViewProps> = ({ currentUser }) => {
  const canEditRoles =
    (currentUser?.walletAddress || '').toLowerCase() === IMMUTABLE_ADMIN_WALLET.toLowerCase();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [caseEdits, setCaseEdits] = useState<Record<string, any>>({});
  const [settingsEdits, setSettingsEdits] = useState<Record<string, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rtuAlertThreshold, setRtuAlertThreshold] = useState(0);
  const [newSetting, setNewSetting] = useState({ key: '', value: '' });
  const [rtuAdjust, setRtuAdjust] = useState({
    caseId: '',
    tokenSymbol: '',
    deltaToken: '',
    deltaSpentUsdt: '',
    reason: '',
  });
  const [filters, setFilters] = useState({
    userRole: 'all',
    userStatus: 'all',
    caseStatus: 'all',
    txType: 'all',
    battleResult: 'all',
    inventoryStatus: 'all',
  });
  const [sort, setSort] = useState({
    users: { key: 'createdAt', dir: 'desc' },
    cases: { key: 'createdAt', dir: 'desc' },
    transactions: { key: 'timestamp', dir: 'desc' },
    battles: { key: 'timestamp', dir: 'desc' },
    inventory: { key: 'createdAt', dir: 'desc' },
  });
  const [pages, setPages] = useState({
    users: 0,
    cases: 0,
    battles: 0,
    inventory: 0,
    transactions: 0,
    audit: 0,
    rtuLedgers: 0,
    rtuEvents: 0,
  });

  const PAGE_SIZE = 12;
  const explorerBase = (import.meta as any).env?.VITE_EXPLORER_URL || 'https://sepolia.etherscan.io';

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const shortWallet = (value?: string) => {
    if (!value) return '-';
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  };

  const sortList = (items: any[], key: string, dir: 'asc' | 'desc') => {
    const sorted = [...items].sort((a, b) => {
      const va = a?.[key];
      const vb = b?.[key];
      if (va === vb) return 0;
      if (va === undefined || va === null) return 1;
      if (vb === undefined || vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb));
    });
    return dir === 'asc' ? sorted : sorted.reverse();
  };

  const downloadCsv = (name: string, rows: Record<string, any>[]) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((key) => {
            const value = row[key];
            const stringValue = value === null || value === undefined ? '' : String(value);
            return `"${stringValue.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      switch (activeTab) {
        case 'overview':
          setData((await api.getAdminOverview()).data ?? null);
          break;
        case 'users':
          setData((await api.getAdminUsers()).data?.users ?? []);
          break;
        case 'cases':
          setData((await api.getAdminCases()).data?.cases ?? []);
          break;
        case 'battles':
          setData((await api.getAdminBattles()).data?.battles ?? []);
          break;
        case 'inventory':
          setData((await api.getAdminInventory()).data?.items ?? []);
          break;
        case 'transactions':
          setData((await api.getAdminTransactions()).data?.transactions ?? []);
          break;
        case 'rtu': {
          const [ledgers, events] = await Promise.all([
            api.getAdminRtuLedgers(),
            api.getAdminRtuEvents(),
          ]);
          setData({
            ledgers: ledgers.data?.ledgers ?? [],
            events: events.data?.events ?? [],
          });
          break;
        }
        case 'settings':
          setData((await api.getAdminSettings()).data?.settings ?? []);
          break;
        case 'audit':
          setData((await api.getAdminAudit()).data?.logs ?? []);
          break;
        case 'reports':
        case 'cms':
          setData(null);
          break;
        default:
          setData(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeTab]);

  useEffect(() => {
    setPages((prev) => ({
      ...prev,
      users: 0,
      cases: 0,
      battles: 0,
      inventory: 0,
      transactions: 0,
    }));
  }, [search, filters]);

  const users = useMemo(() => {
    if (activeTab !== 'users' || !Array.isArray(data)) return [];
    if (!search.trim()) return data;
    const query = search.toLowerCase();
    return data.filter((user: any) =>
      String(user.username).toLowerCase().includes(query) ||
      String(user.walletAddress).toLowerCase().includes(query)
    );
  }, [activeTab, data, search]);

  const cases = useMemo(() => {
    if (activeTab !== 'cases' || !Array.isArray(data)) return [];
    if (!search.trim()) return data;
    const query = search.toLowerCase();
    return data.filter((caseItem: any) =>
      String(caseItem.name).toLowerCase().includes(query) ||
      String(caseItem.tokenTicker || caseItem.currency).toLowerCase().includes(query)
    );
  }, [activeTab, data, search]);
  const overview = useMemo(
    () => (activeTab === 'overview' ? data : null),
    [activeTab, data]
  );
  const battles = useMemo(() => {
    if (activeTab !== 'battles' || !Array.isArray(data)) return [];
    const query = search.trim().toLowerCase();
    return data.filter((battle: any) =>
      (!query || String(battle.userId).toLowerCase().includes(query)) &&
      (filters.battleResult === 'all' || battle.result === filters.battleResult)
    );
  }, [activeTab, data, search, filters.battleResult]);

  const inventory = useMemo(() => {
    if (activeTab !== 'inventory' || !Array.isArray(data)) return [];
    const query = search.trim().toLowerCase();
    return data.filter((item: any) =>
      (!query ||
        String(item.name).toLowerCase().includes(query) ||
        String(item.userId).toLowerCase().includes(query)) &&
      (filters.inventoryStatus === 'all' || item.status === filters.inventoryStatus)
    );
  }, [activeTab, data, search, filters.inventoryStatus]);

  const transactions = useMemo(() => {
    if (activeTab !== 'transactions' || !Array.isArray(data)) return [];
    const query = search.trim().toLowerCase();
    return data.filter((tx: any) =>
      (!query || String(tx.userId).toLowerCase().includes(query)) &&
      (filters.txType === 'all' || tx.type === filters.txType)
    );
  }, [activeTab, data, search, filters.txType]);
  const settings = useMemo(
    () => (activeTab === 'settings' && Array.isArray(data) ? data : []),
    [activeTab, data]
  );
  const audit = useMemo(
    () => (activeTab === 'audit' && Array.isArray(data) ? data : []),
    [activeTab, data]
  );
  const rtuLedgers = useMemo(
    () => (activeTab === 'rtu' && data?.ledgers ? data.ledgers : []),
    [activeTab, data]
  );
  const rtuEvents = useMemo(
    () => (activeTab === 'rtu' && data?.events ? data.events : []),
    [activeTab, data]
  );

  const applyUserFilters = useMemo(() => {
    const filtered = users.filter((user: any) =>
      (filters.userRole === 'all' || user.role === filters.userRole) &&
      (filters.userStatus === 'all' || (filters.userStatus === 'banned' ? user.isBanned : !user.isBanned))
    );
    return sortList(filtered, sort.users.key, sort.users.dir as 'asc' | 'desc');
  }, [users, filters.userRole, filters.userStatus, sort.users]);

  const applyCaseFilters = useMemo(() => {
    const filtered = cases.filter((caseItem: any) =>
      filters.caseStatus === 'all' ? true : (filters.caseStatus === 'active' ? caseItem.isActive : !caseItem.isActive)
    );
    return sortList(filtered, sort.cases.key, sort.cases.dir as 'asc' | 'desc');
  }, [cases, filters.caseStatus, sort.cases]);

  const sortedTransactions = useMemo(
    () => sortList(transactions, sort.transactions.key, sort.transactions.dir as 'asc' | 'desc'),
    [transactions, sort.transactions]
  );

  const sortedBattles = useMemo(
    () => sortList(battles, sort.battles.key, sort.battles.dir as 'asc' | 'desc'),
    [battles, sort.battles]
  );

  const sortedInventory = useMemo(
    () => sortList(inventory, sort.inventory.key, sort.inventory.dir as 'asc' | 'desc'),
    [inventory, sort.inventory]
  );

  const paginate = (items: any[], pageKey: keyof typeof pages) => {
    const page = pages[pageKey];
    const start = page * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  };

  const totalPages = (items: any[]) => Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  return (
    <div className="w-full min-h-screen text-white px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-xl text-xs uppercase tracking-widest border transition ${
                activeTab === tab.key
                  ? 'bg-web3-card/60 border-web3-accent/40 text-white'
                  : 'bg-black/20 border-white/[0.08] text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-gray-500">{activeTab}</div>
            <div className="flex items-center gap-2">
              {(activeTab === 'users' || activeTab === 'cases' || activeTab === 'battles' || activeTab === 'inventory' || activeTab === 'transactions') && (
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search..."
                  className="md:w-auto text-xs"
                />
              )}
              {activeTab === 'users' && (
                <select
                  value={`${sort.users.key}:${sort.users.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':');
                    setSort((prev) => ({ ...prev, users: { key, dir } }));
                  }}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="createdAt:desc">Newest</option>
                  <option value="createdAt:asc">Oldest</option>
                  <option value="balance:desc">Balance ↓</option>
                  <option value="balance:asc">Balance ↑</option>
                  <option value="username:asc">Username A–Z</option>
                </select>
              )}
              {activeTab === 'cases' && (
                <select
                  value={`${sort.cases.key}:${sort.cases.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':');
                    setSort((prev) => ({ ...prev, cases: { key, dir } }));
                  }}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="createdAt:desc">Newest</option>
                  <option value="createdAt:asc">Oldest</option>
                  <option value="price:desc">Price ↓</option>
                  <option value="price:asc">Price ↑</option>
                  <option value="rtu:desc">RTU ↓</option>
                  <option value="rtu:asc">RTU ↑</option>
                </select>
              )}
              {activeTab === 'transactions' && (
                <select
                  value={`${sort.transactions.key}:${sort.transactions.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':');
                    setSort((prev) => ({ ...prev, transactions: { key, dir } }));
                  }}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="timestamp:desc">Newest</option>
                  <option value="timestamp:asc">Oldest</option>
                  <option value="amount:desc">Amount ↓</option>
                  <option value="amount:asc">Amount ↑</option>
                </select>
              )}
              {activeTab === 'battles' && (
                <select
                  value={`${sort.battles.key}:${sort.battles.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':');
                    setSort((prev) => ({ ...prev, battles: { key, dir } }));
                  }}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="timestamp:desc">Newest</option>
                  <option value="timestamp:asc">Oldest</option>
                  <option value="cost:desc">Cost ↓</option>
                  <option value="cost:asc">Cost ↑</option>
                </select>
              )}
              {activeTab === 'inventory' && (
                <select
                  value={`${sort.inventory.key}:${sort.inventory.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':');
                    setSort((prev) => ({ ...prev, inventory: { key, dir } }));
                  }}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="createdAt:desc">Newest</option>
                  <option value="createdAt:asc">Oldest</option>
                  <option value="value:desc">Value ↓</option>
                  <option value="value:asc">Value ↑</option>
                </select>
              )}
              {activeTab === 'users' && (
                <>
                  <select
                    value={filters.userRole}
                    onChange={(e) => setFilters((prev) => ({ ...prev, userRole: e.target.value }))}
                    className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                  >
                    <option value="all">All roles</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MODERATOR">Moderator</option>
                    <option value="USER">User</option>
                  </select>
                  <select
                    value={filters.userStatus}
                    onChange={(e) => setFilters((prev) => ({ ...prev, userStatus: e.target.value }))}
                    className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                  >
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="banned">Banned</option>
                  </select>
                </>
              )}
              {activeTab === 'cases' && (
                <select
                  value={filters.caseStatus}
                  onChange={(e) => setFilters((prev) => ({ ...prev, caseStatus: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="all">All cases</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              )}
              {activeTab === 'transactions' && (
                <select
                  value={filters.txType}
                  onChange={(e) => setFilters((prev) => ({ ...prev, txType: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="all">All types</option>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="CASE_OPEN">Case open</option>
                  <option value="CASE_CREATE">Case create</option>
                  <option value="UPGRADE">Upgrade</option>
                  <option value="BATTLE">Battle</option>
                </select>
              )}
              {activeTab === 'battles' && (
                <select
                  value={filters.battleResult}
                  onChange={(e) => setFilters((prev) => ({ ...prev, battleResult: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="all">All results</option>
                  <option value="WIN">Win</option>
                  <option value="LOSS">Loss</option>
                </select>
              )}
              {activeTab === 'inventory' && (
                <select
                  value={filters.inventoryStatus}
                  onChange={(e) => setFilters((prev) => ({ ...prev, inventoryStatus: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                >
                  <option value="all">All items</option>
                  <option value="ACTIVE">Active</option>
                  <option value="BURNT">Burnt</option>
                </select>
              )}
              <button
                onClick={load}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white"
              >
                Refresh
              </button>
              {(activeTab === 'transactions' || activeTab === 'battles' || activeTab === 'inventory') && (
                <button
                  onClick={() => {
                    const rows =
                      activeTab === 'transactions'
                        ? sortedTransactions
                        : activeTab === 'battles'
                          ? sortedBattles
                          : sortedInventory;
                    downloadCsv(activeTab, rows);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-web3-accent/20 border border-web3-accent/40 text-xs uppercase tracking-widest text-web3-accent hover:text-white"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
          {loading && <div className="text-gray-400 text-sm">Loading…</div>}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {!loading && !error && activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Key Metrics</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Users', value: overview?.stats?.users ?? 0 },
                    { label: 'Cases', value: overview?.stats?.cases ?? 0 },
                    { label: 'Battles', value: overview?.stats?.battles ?? 0 },
                    { label: 'Inventory', value: overview?.stats?.inventory ?? 0 },
                    { label: 'Transactions', value: overview?.stats?.transactions ?? 0 },
                    { label: 'RTU Ledgers', value: overview?.stats?.rtuLedgers ?? 0 },
                  ].map((item) => (
                    <StatCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3">
                  <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Top Spenders</div>
                  {(overview?.topUsersBySpend ?? []).length === 0 ? (
                    <div className="text-xs text-gray-500">No data yet.</div>
                  ) : (
                    (overview?.topUsersBySpend ?? []).map((user: any) => (
                      <div key={user.userId} className="flex items-center justify-between text-xs text-gray-400 py-1 border-b border-white/[0.04]">
                        <span className="truncate max-w-[160px]">{user.username}</span>
                        <span className="text-gray-500">{shortWallet(user.walletAddress)}</span>
                        <span className="text-white font-bold">{Number(user.spent || 0).toFixed(2)} ₮</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3">
                  <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Recent Transactions</div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 pb-2">
                    <span>Type</span>
                    <span>User</span>
                    <span>Amount</span>
                  </div>
                  {(overview?.recentTransactions ?? []).map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between text-xs text-gray-400 py-1 border-b border-white/[0.04]">
                      <span>{tx.type}</span>
                      <span className="truncate max-w-[120px]">{tx.user?.username || shortWallet(tx.user?.walletAddress)}</span>
                      <span>{tx.amount} {tx.currency}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Recent Openings</div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 pb-2">
                  <span>Case</span>
                  <span>User</span>
                  <span>Won</span>
                </div>
                {(overview?.recentOpenings ?? []).map((open: any) => (
                  <div key={open.id} className="flex items-center justify-between text-xs text-gray-400 py-1 border-b border-white/[0.04]">
                    <span>{open.case?.name || open.caseId}</span>
                    <span className="truncate max-w-[140px]">{open.user?.username || shortWallet(open.user?.walletAddress)}</span>
                    <span>{open.wonValue} ${open.case?.tokenTicker || open.case?.currency || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'users' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 min-w-0">
              <div className="space-y-3">
                {paginate(applyUserFilters, 'users').map((user: any) => (
                  <div key={user.id} className="grid grid-cols-1 md:grid-cols-8 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Username</div>
                      <div className="text-sm font-bold truncate">{user.username}</div>
                    </div>
                    <div className="min-w-0 md:col-span-2">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Wallet</div>
                      <div className="text-xs text-gray-500 truncate">{user.walletAddress}</div>
                    </div>
                    <div className="text-xs text-gray-400">{user.balance} ₮</div>
                    <div className="text-[10px] text-gray-500">{formatDate(user.createdAt)}</div>
                    <div>
                      <select
                        value={user.role}
                        disabled={!canEditRoles || user.walletAddress?.toLowerCase() === IMMUTABLE_ADMIN_WALLET.toLowerCase()}
                        onChange={async (e) => {
                          setSaving(user.id);
                          await api.updateAdminUserRole(user.id, e.target.value);
                          await load();
                          setSaving(null);
                        }}
                        className="w-full bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="USER">USER</option>
                        <option value="MODERATOR">EARLY_ACCESS</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>
                    <div className="text-xs text-gray-400">{user.isBanned ? 'Banned' : 'Active'}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setSelectedUserId(user.id)}
                        className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-white/5 border border-white/10 text-gray-300 hover:text-white"
                      >
                        Details
                      </button>
                      <button
                        onClick={async () => {
                          setSaving(user.id);
                          await api.updateAdminUserBan(user.id, !user.isBanned);
                          await load();
                          setSaving(null);
                        }}
                        disabled={user.walletAddress?.toLowerCase() === IMMUTABLE_ADMIN_WALLET.toLowerCase()}
                        className={`px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest ${
                          user.isBanned
                            ? 'bg-web3-success/20 text-web3-success border border-web3-success/40'
                            : 'bg-red-500/10 text-red-400 border border-red-500/40'
                        }`}
                      >
                        {saving === user.id ? 'Saving...' : user.isBanned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  </div>
                ))}
                <Pagination
                  currentPage={pages.users}
                  totalPages={totalPages(applyUserFilters)}
                  onPageChange={(next) => setPages((prev) => ({ ...prev, users: next }))}
                />
              </div>
              <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3 min-h-[200px] min-w-0 overflow-hidden">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">User Detail</div>
                {selectedUserId ? (
                  <UserDetail userId={selectedUserId} />
                ) : (
                  <div className="text-xs text-gray-500">Select a user to see details.</div>
                )}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'cases' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 min-w-0">
              <div className="space-y-3">
                {paginate(applyCaseFilters, 'cases').map((caseItem: any) => {
                  const edit = caseEdits[caseItem.id] || {};
                  const adminStats = caseItem.adminStats || {};
                  const payoutTxHash = adminStats.payoutTxHash || caseItem.payoutTxHash || null;
                  const payoutStatus = adminStats.payoutStatus || (caseItem.payoutAt ? 'PAID' : caseItem.mintedAt ? 'PENDING' : 'NOT_MINTED');
                  return (
                    <div key={caseItem.id} className="grid grid-cols-1 md:grid-cols-10 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 min-w-0">
                    <div className="md:col-span-2 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-gray-500">Case</div>
                        <div className="text-sm font-bold truncate">{caseItem.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          ${caseItem.tokenTicker || caseItem.currency}
                        </div>
                      </div>
                    <div className="text-xs text-gray-400 truncate">
                      {caseItem.createdBy?.username || '—'}
                    </div>
                      <input
                        value={edit.price ?? caseItem.price}
                        onChange={(e) => setCaseEdits((prev) => ({ ...prev, [caseItem.id]: { ...edit, price: e.target.value } }))}
                        className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      />
                      <input
                        value={edit.rtu ?? caseItem.rtu}
                        onChange={(e) => setCaseEdits((prev) => ({ ...prev, [caseItem.id]: { ...edit, rtu: e.target.value } }))}
                        className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      />
                      <input
                        value={edit.tokenPrice ?? caseItem.tokenPrice ?? ''}
                        onChange={(e) => setCaseEdits((prev) => ({ ...prev, [caseItem.id]: { ...edit, tokenPrice: e.target.value } }))}
                        className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      />
                      <input
                        value={edit.openDurationHours ?? caseItem.openDurationHours ?? ''}
                        onChange={(e) => setCaseEdits((prev) => ({ ...prev, [caseItem.id]: { ...edit, openDurationHours: e.target.value } }))}
                        className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      />
                      <select
                        value={(edit.isActive ?? caseItem.isActive) ? 'true' : 'false'}
                        onChange={(e) => setCaseEdits((prev) => ({ ...prev, [caseItem.id]: { ...edit, isActive: e.target.value === 'true' } }))}
                        className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                      <button
                        onClick={() => setSelectedCaseId(caseItem.id)}
                        className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-white/5 border border-white/10 text-gray-300 hover:text-white"
                      >
                        Details
                      </button>
                      <button
                        onClick={async () => {
                          setSaving(caseItem.id);
                          await api.updateAdminCase(caseItem.id, {
                            price: Number(edit.price ?? caseItem.price),
                            rtu: Number(edit.rtu ?? caseItem.rtu),
                            tokenPrice: Number(edit.tokenPrice ?? caseItem.tokenPrice ?? 0),
                            openDurationHours: Number(edit.openDurationHours ?? caseItem.openDurationHours ?? 0),
                            isActive: edit.isActive ?? caseItem.isActive,
                          });
                          await load();
                          setSaving(null);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
                      >
                        {saving === caseItem.id ? 'Saving...' : 'Save'}
                      </button>
                      <div className="md:col-span-10 mt-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-gray-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Openings</div>
                            <div className="font-bold">{Number(adminStats.openings || 0)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Spent</div>
                            <div className="font-bold">{Number(adminStats.spentUsdt || 0).toFixed(2)} ₮</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Payout Status</div>
                            <div className={`font-bold ${
                              payoutStatus === 'PAID'
                                ? 'text-web3-success'
                                : payoutStatus === 'PENDING'
                                ? 'text-yellow-400'
                                : 'text-gray-400'
                            }`}>
                              {payoutStatus}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Declared RTU</div>
                            <div className="font-bold">{Number(adminStats.declaredRtu || 0).toFixed(2)}%</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Open Target</div>
                            <div className="font-bold">{Number(adminStats.openRtuTarget || 0).toFixed(2)}%</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Actual RTU</div>
                            <div className="font-bold">
                              {adminStats.actualRtuPercent == null ? '-' : `${Number(adminStats.actualRtuPercent).toFixed(2)}%`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Reserve (token)</div>
                            <div className={`font-bold ${Number(adminStats.reserveToken || 0) >= 0 ? 'text-web3-success' : 'text-red-400'}`}>
                              {Number(adminStats.reserveToken || 0).toFixed(4)}
                            </div>
                          </div>
                          <div className="sm:col-span-2 lg:col-span-8">
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Tx Hash</div>
                            {payoutTxHash ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono truncate">{`${payoutTxHash.slice(0, 10)}...${payoutTxHash.slice(-8)}`}</span>
                                <a
                                  href={`${explorerBase.replace(/\/$/, '')}/tx/${payoutTxHash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-web3-accent hover:text-white transition uppercase tracking-widest text-[10px]"
                                >
                                  Etherscan
                                </a>
                              </div>
                            ) : (
                              <div className="text-gray-500">-</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <Pagination
                  currentPage={pages.cases}
                  totalPages={totalPages(applyCaseFilters)}
                  onPageChange={(next) => setPages((prev) => ({ ...prev, cases: next }))}
                />
              </div>
              <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3 min-h-[200px] min-w-0 overflow-hidden">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Case Detail</div>
                {selectedCaseId ? (
                  <CaseDetail caseId={selectedCaseId} />
                ) : (
                  <div className="text-xs text-gray-500">Select a case to see details.</div>
                )}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'battles' && (
            <div className="space-y-2">
              {paginate(sortedBattles, 'battles').map((battle: any) => (
                <div key={battle.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2">{battle.id}</div>
                  <div>{battle.userId}</div>
                  <div>{battle.result}</div>
                  <div>{battle.cost} ₮</div>
                  <div>{formatDate(battle.timestamp)}</div>
                </div>
              ))}
              <Pagination
                currentPage={pages.battles}
                totalPages={totalPages(sortedBattles)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, battles: next }))}
              />
            </div>
          )}

          {!loading && !error && activeTab === 'inventory' && (
            <div className="space-y-2">
              {paginate(sortedInventory, 'inventory').map((item: any) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2">{item.id}</div>
                  <div>{item.userId}</div>
                  <div>{item.name}</div>
                  <div>{item.value} {item.currency}</div>
                  <div>{item.status}</div>
                  <div>{formatDate(item.createdAt)}</div>
                </div>
              ))}
              <Pagination
                currentPage={pages.inventory}
                totalPages={totalPages(sortedInventory)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, inventory: next }))}
              />
            </div>
          )}

          {!loading && !error && activeTab === 'transactions' && (
            <div className="space-y-2">
              {paginate(sortedTransactions, 'transactions').map((tx: any) => (
                <div key={tx.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2">{tx.id}</div>
                  <div>{tx.userId}</div>
                  <div>{tx.type}</div>
                  <div>{tx.amount} {tx.currency}</div>
                  <div>{tx.status}</div>
                  <div>{formatDate(tx.timestamp)}</div>
                </div>
              ))}
              <Pagination
                currentPage={pages.transactions}
                totalPages={totalPages(sortedTransactions)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, transactions: next }))}
              />
            </div>
          )}

          {!loading && !error && activeTab === 'rtu' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3">
                <input
                  value={rtuAdjust.caseId}
                  onChange={(e) => setRtuAdjust((prev) => ({ ...prev, caseId: e.target.value }))}
                  placeholder="caseId"
                  className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <input
                  value={rtuAdjust.tokenSymbol}
                  onChange={(e) => setRtuAdjust((prev) => ({ ...prev, tokenSymbol: e.target.value }))}
                  placeholder="token"
                  className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <input
                  value={rtuAdjust.deltaToken}
                  onChange={(e) => setRtuAdjust((prev) => ({ ...prev, deltaToken: e.target.value }))}
                  placeholder="delta token"
                  className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <input
                  value={rtuAdjust.deltaSpentUsdt}
                  onChange={(e) => setRtuAdjust((prev) => ({ ...prev, deltaSpentUsdt: e.target.value }))}
                  placeholder="delta usdt"
                  className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <input
                  value={rtuAdjust.reason}
                  onChange={(e) => setRtuAdjust((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="reason"
                  className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <button
                  onClick={async () => {
                    if (!rtuAdjust.caseId || !rtuAdjust.tokenSymbol || !rtuAdjust.deltaToken) return;
                    await api.adjustAdminRtu({
                      caseId: rtuAdjust.caseId,
                      tokenSymbol: rtuAdjust.tokenSymbol,
                      deltaToken: Number(rtuAdjust.deltaToken),
                      deltaSpentUsdt: Number(rtuAdjust.deltaSpentUsdt || 0),
                      reason: rtuAdjust.reason,
                    });
                    setRtuAdjust({ caseId: '', tokenSymbol: '', deltaToken: '', deltaSpentUsdt: '', reason: '' });
                    await load();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
                >
                  Adjust
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Alert threshold (token)</div>
                <input
                  value={rtuAlertThreshold}
                  onChange={(e) => setRtuAlertThreshold(Number(e.target.value) || 0)}
                  className="w-24 px-2 py-1 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Ledgers</div>
                <div className="space-y-2">
                  {paginate(rtuLedgers, 'rtuLedgers').map((ledger: any) => {
                    const alert =
                      rtuAlertThreshold > 0 &&
                      Math.abs(Number(ledger.bufferDebtToken || 0)) >= rtuAlertThreshold;
                    return (
                    <div
                      key={ledger.id}
                      className={`grid grid-cols-1 md:grid-cols-7 gap-3 items-center rounded-xl p-3 text-xs ${
                        alert
                          ? 'bg-red-500/10 border border-red-500/40 text-red-300'
                          : 'bg-black/30 border border-white/[0.08] text-gray-400'
                      }`}
                    >
                      <div className="md:col-span-2">{ledger.caseId}</div>
                      <div>{ledger.tokenSymbol}</div>
                      <div>{ledger.tokenPriceUsdt}</div>
                      <div>{ledger.rtuPercent}%</div>
                      <div>{ledger.totalSpentUsdt}</div>
                      <div>{ledger.totalTokenIssued}</div>
                      <div>{ledger.bufferDebtToken}</div>
                    </div>
                    );
                  })}
                  <Pagination
                    currentPage={pages.rtuLedgers}
                    totalPages={totalPages(rtuLedgers)}
                    onPageChange={(next) => setPages((prev) => ({ ...prev, rtuLedgers: next }))}
                  />
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Events</div>
                <div className="space-y-2">
                  {paginate(rtuEvents, 'rtuEvents').map((event: any) => (
                    <div key={event.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                      <div className="md:col-span-2">{event.caseId}</div>
                      <div>{event.tokenSymbol}</div>
                      <div>{event.type}</div>
                      <div>{event.deltaSpentUsdt}</div>
                      <div>{event.deltaToken}</div>
                      <div>{formatDate(event.createdAt)}</div>
                    </div>
                  ))}
                  <Pagination
                    currentPage={pages.rtuEvents}
                    totalPages={totalPages(rtuEvents)}
                    onPageChange={(next) => setPages((prev) => ({ ...prev, rtuEvents: next }))}
                  />
                </div>
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'settings' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3">
                <input
                  value={newSetting.key}
                  onChange={(e) => setNewSetting((prev) => ({ ...prev, key: e.target.value }))}
                  placeholder="new_setting_key"
                  className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <input
                  value={newSetting.value}
                  onChange={(e) => setNewSetting((prev) => ({ ...prev, value: e.target.value }))}
                  placeholder='{"value": 1}'
                  className="md:col-span-2 bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                />
                <button
                  onClick={async () => {
                    if (!newSetting.key.trim()) return;
                    let parsed: any = newSetting.value;
                    try {
                      parsed = JSON.parse(newSetting.value);
                    } catch {
                      parsed = newSetting.value;
                    }
                    setSaving(newSetting.key);
                    await api.updateAdminSetting(newSetting.key, parsed);
                    setNewSetting({ key: '', value: '' });
                    await load();
                    setSaving(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
                >
                  {saving === newSetting.key ? 'Saving...' : 'Add'}
                </button>
              </div>
              {settings.map((setting) => (
                <div key={setting.id} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3">
                  <div className="text-xs text-gray-400">{setting.key}</div>
                  <textarea
                    value={settingsEdits[setting.key] ?? JSON.stringify(setting.value)}
                    onChange={(e) => setSettingsEdits((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                    className="md:col-span-2 bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs h-16"
                  />
                  <button
                    onClick={async () => {
                      setSaving(setting.key);
                      let parsed: any = settingsEdits[setting.key] ?? setting.value;
                      try {
                        parsed = JSON.parse(settingsEdits[setting.key] ?? JSON.stringify(setting.value));
                      } catch {
                        parsed = settingsEdits[setting.key] ?? setting.value;
                      }
                      await api.updateAdminSetting(setting.key, parsed);
                      await load();
                      setSaving(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
                  >
                    {saving === setting.key ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && activeTab === 'audit' && (
            <div className="space-y-2">
              {paginate(audit, 'audit').map((log) => (
                <div key={log.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2">{log.action}</div>
                  <div>{log.adminId}</div>
                  <div>{log.entity}</div>
                  <div>{log.entityId}</div>
                  <div>{formatDate(log.createdAt)}</div>
                </div>
              ))}
              <Pagination
                currentPage={pages.audit}
                totalPages={totalPages(audit)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, audit: next }))}
              />
            </div>
          )}

          {!loading && !error && (activeTab === 'reports' || activeTab === 'cms') && (
            <div className="text-sm text-gray-400">Section coming soon.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const UserDetail: React.FC<{ userId: string }> = ({ userId }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'inventory' | 'burnt' | 'transactions' | 'battles'>('inventory');
  const [balanceEdit, setBalanceEdit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getAdminUserDetail(userId);
        setDetail(response.data);
        if (response.data?.user?.balance !== undefined) {
          setBalanceEdit(String(response.data.user.balance));
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [userId]);

  if (loading) return <div className="text-xs text-gray-400">Loading…</div>;
  if (error) return <div className="text-xs text-red-400">{error}</div>;
  if (!detail?.user) return <div className="text-xs text-gray-500">No data</div>;

  return (
    <div className="space-y-4 text-xs text-gray-400">
      <div>
        <div className="text-gray-500 uppercase tracking-widest text-[10px]">User</div>
        <div className="truncate">{detail.user.username}</div>
        <div className="text-[10px] text-gray-500 truncate">{detail.user.walletAddress}</div>
        {detail.user.isBanned && (
          <div className="text-[10px] text-red-400">Banned: {detail.user.banReason || '—'}</div>
        )}
      </div>
      {detail.summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Deposits</div>
            <div className="text-xs">{detail.summary.deposits}</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Spent</div>
            <div className="text-xs">{detail.summary.spent}</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Net</div>
            <div className="text-xs">{detail.summary.net}</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 items-center">
        <input
          value={balanceEdit}
          onChange={(e) => setBalanceEdit(e.target.value)}
          className="col-span-2 bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
        />
        <button
          onClick={async () => {
            setSaving(true);
            await api.updateAdminUserBalance(userId, Number(balanceEdit));
            const refreshed = await api.getAdminUserDetail(userId);
            setDetail(refreshed.data);
            setSaving(false);
          }}
          className="px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
        >
          {saving ? 'Saving...' : 'Set Balance'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { key: 'inventory', label: `Inventory (${detail.user.inventory?.length ?? 0})` },
          { key: 'burnt', label: `Burnt (${detail.burntItems?.length ?? 0})` },
          { key: 'transactions', label: `Transactions (${detail.user.transactions?.length ?? 0})` },
          { key: 'battles', label: `Battles (${detail.user.battles?.length ?? 0})` },
        ] as const).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border ${
              tab === item.key
                ? 'bg-web3-card/60 border-web3-accent/40 text-white'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'inventory' && (
        <div className="space-y-2">
          {(detail.user.inventory ?? []).map((item: any) => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div className="truncate">{item.name}</div>
              <div>{item.value} {item.currency}</div>
              <div>{item.rarity}</div>
              <div className="text-gray-500">{item.status}</div>
              <div className="text-gray-500">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'burnt' && (
        <div className="space-y-2">
          {(detail.burntItems ?? []).map((item: any) => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div className="truncate">{item.name}</div>
              <div>{item.value} {item.currency}</div>
              <div>{item.rarity}</div>
              <div className="text-gray-500">BURNT</div>
              <div className="text-gray-500">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="space-y-2">
          {(detail.user.transactions ?? []).map((tx: any) => (
            <div key={tx.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div className="truncate">{tx.type}</div>
              <div>{tx.amount} {tx.currency}</div>
              <div className="text-gray-500">{tx.status}</div>
              <div className="text-gray-500">{new Date(tx.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'battles' && (
        <div className="space-y-2">
          {(detail.user.battles ?? []).map((battle: any) => (
            <div key={battle.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div className="truncate">{battle.result}</div>
              <div>{battle.cost} ₮</div>
              <div>{battle.wonValue}</div>
              <div className="text-gray-500">{new Date(battle.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CaseDetail: React.FC<{ caseId: string }> = ({ caseId }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'drops' | 'openings' | 'rtu'>('drops');
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getAdminCaseDetail(caseId);
        setDetail(response.data?.case);
        setStats(response.data?.stats || null);
      } catch (err: any) {
        setError(err?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [caseId]);

  if (loading) return <div className="text-xs text-gray-400">Loading…</div>;
  if (error) return <div className="text-xs text-red-400">{error}</div>;
  if (!detail) return <div className="text-xs text-gray-500">No data</div>;

  return (
    <div className="space-y-4 text-xs text-gray-400">
      <div>
        <div className="text-gray-500 uppercase tracking-widest text-[10px]">Case</div>
        <div className="truncate">{detail.name}</div>
        <div className="text-[10px] text-gray-500 truncate">${detail.tokenTicker || detail.currency}</div>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Openings</div>
            <div className="text-xs">{stats.totalOpenings}</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Avg Won</div>
            <div className="text-xs">{stats.avgWonValue?.toFixed ? stats.avgWonValue.toFixed(2) : stats.avgWonValue}</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Total Won</div>
            <div className="text-xs">{stats.totalWonValue}</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Last Open</div>
            <div className="text-xs">{stats.lastOpenedAt ? new Date(stats.lastOpenedAt).toLocaleString() : '-'}</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Declared RTU</div>
            <div className="text-xs">
              {stats.declaredRtu == null ? '-' : `${Number(stats.declaredRtu).toFixed(2)}%`}
            </div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Open Target RTU</div>
            <div className="text-xs">
              {stats.openRtuTarget == null ? '-' : `${Number(stats.openRtuTarget).toFixed(2)}%`}
            </div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Actual RTU</div>
            <div className="text-xs">
              {stats.actualRtuPercent == null ? '-' : `${Number(stats.actualRtuPercent).toFixed(2)}%`}
            </div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Reserve Token</div>
            <div className={`text-xs ${Number(stats.reserveToken || 0) >= 0 ? 'text-web3-success' : 'text-red-400'}`}>
              {Number(stats.reserveToken || 0).toFixed(4)}
            </div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Drop Limits</div>
            <div className="text-xs">
              min {'<='} {Number(stats.minDropAllowed || 0).toFixed(4)} / max {'>='} {Number(stats.maxDropAllowed || 0).toFixed(4)}
            </div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Current Drops</div>
            <div className="text-xs">
              min {Number(stats.minDropActual || 0).toFixed(4)} / max {Number(stats.maxDropActual || 0).toFixed(4)}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          { key: 'drops', label: `Drops (${detail.drops?.length ?? 0})` },
          { key: 'openings', label: `Openings (${detail.openings?.length ?? 0})` },
          { key: 'rtu', label: `RTU (${detail.rtuEvents?.length ?? 0})` },
        ] as const).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border ${
              tab === item.key
                ? 'bg-web3-card/60 border-web3-accent/40 text-white'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'drops' && (
        <div className="space-y-2">
          {(detail.drops ?? []).map((drop: any) => (
            <div key={drop.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div className="truncate">{drop.name}</div>
              <div>{drop.value} {drop.currency}</div>
              <div>{drop.rarity}</div>
              <div className="text-gray-500">{drop.probability}%</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'openings' && (
        <div className="space-y-2">
          {(detail.openings ?? []).map((open: any) => (
            <div key={open.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div className="truncate">{open.userId}</div>
              <div>{open.wonValue}</div>
              <div className="truncate">{open.wonDropId}</div>
              <div className="text-gray-500">{new Date(open.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'rtu' && (
        <div className="space-y-2">
          {(detail.rtuEvents ?? []).map((event: any) => (
            <div key={event.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div>{event.type}</div>
              <div>{event.deltaSpentUsdt}</div>
              <div>{event.deltaToken}</div>
              <div className="text-gray-500">{new Date(event.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
