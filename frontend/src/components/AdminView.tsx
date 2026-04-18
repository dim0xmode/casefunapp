import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { formatTokenValue, getLevelInfo } from '../utils/number';
import { SearchInput } from './ui/SearchInput';
import { Pagination } from './ui/Pagination';
import { StatCard } from './ui/StatCard';

type TabKey =
  | 'overview'
  | 'analytics'
  | 'users'
  | 'cases'
  | 'battles'
  | 'inventory'
  | 'transactions'
  | 'rtu'
  | 'settings'
  | 'audit'
  | 'feedback'
  | 'rewards'
  | 'promo'
  | 'mailing';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'users', label: 'Users' },
  { key: 'cases', label: 'Cases' },
  { key: 'battles', label: 'Battles' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'promo', label: 'Promo Codes' },
  { key: 'rtu', label: 'RTU' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'mailing', label: 'Mailing' },
];

const IMMUTABLE_ADMIN_WALLET = '0xc459241D1AC02250dE56b8B7165ebEDF59236524';

const formatDate = (value?: string | number | Date | null) => {
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

type AdminViewProps = {
  currentUser?: { walletAddress?: string | null; role?: string | null };
};

export const AdminView: React.FC<AdminViewProps> = ({ currentUser }) => {
  const isBootstrapWalletUser =
    (currentUser?.walletAddress || '').toLowerCase() === IMMUTABLE_ADMIN_WALLET.toLowerCase();
  const canEditRoles = String(currentUser?.role || '').toUpperCase() === 'ADMIN';
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
  const [caseEdits, setCaseEdits] = useState<Record<string, any>>({});
  const [settingsEdits, setSettingsEdits] = useState<Record<string, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rtuAlertThreshold, setRtuAlertThreshold] = useState(0);
  const [newSetting, setNewSetting] = useState({ key: '', value: '' });
  const [battlePreviewInput, setBattlePreviewInput] = useState('');
  const [battlePreviewMode, setBattlePreviewMode] = useState<'BOT' | 'PVP'>('BOT');
  const [battlePreviewLoading, setBattlePreviewLoading] = useState(false);
  const [battlePreviewError, setBattlePreviewError] = useState<string | null>(null);
  const [battlePreview, setBattlePreview] = useState<any>(null);

  const [mailingEmails, setMailingEmails] = useState('');
  const [mailingSubject, setMailingSubject] = useState('');
  const [mailingText, setMailingText] = useState('');
  const [mailingProgress, setMailingProgress] = useState<{ done: number; total: number } | null>(null);
  const [mailingResult, setMailingResult] = useState<{ sent: number; failed: number } | null>(null);
  const [mailingError, setMailingError] = useState<string | null>(null);
  const [mailingRunning, setMailingRunning] = useState(false);
  const [rtuAdjust, setRtuAdjust] = useState({
    caseId: '',
    tokenSymbol: '',
    deltaToken: '',
    deltaSpentUsdt: '',
    reason: '',
  });
  const [newRewardTask, setNewRewardTask] = useState({
    type: 'LIKE_TWEET',
    targetUrl: '',
    reward: 1,
    targetCount: '',
    targetCaseId: '',
    repeatIntervalHours: '',
    activeUntil: '',
  });
  const [editingTask, setEditingTask] = useState<any>(null);
  const [newPromo, setNewPromo] = useState({ code: '', amount: '', maxUses: '', usesPerUser: '' });
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
        case 'analytics':
          setData((await api.getAdminAnalytics()).data ?? null);
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
        case 'feedback': {
          const response = await api.getAdminFeedback();
          setData(response.data?.messages ?? []);
          setFeedbackUnreadCount(Number(response.data?.unreadCount || 0));
          break;
        }
        case 'rewards': {
          const [tasksRes, claimsRes] = await Promise.all([
            api.getAdminRewardTasks(),
            api.getAdminRewardClaims(),
          ]);
          setData({ tasks: tasksRes.data?.tasks || [], claims: claimsRes.data?.claims || [] });
          break;
        }
        case 'promo': {
          const [promosRes, activationsRes] = await Promise.all([
            api.getAdminPromoCodes(),
            api.getAdminPromoActivations(),
          ]);
          setData({ promos: promosRes.data?.promos || [], activations: activationsRes.data?.activations || [] });
          break;
        }
        case 'mailing':
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
    let mounted = true;
    const refreshUnread = async () => {
      try {
        const response = await api.getAdminFeedbackUnreadCount();
        if (!mounted) return;
        setFeedbackUnreadCount(Number(response.data?.unreadCount || 0));
      } catch {
        // ignore polling errors
      }
    };
    refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

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
  const analytics = useMemo(
    () => (activeTab === 'analytics' ? data : null),
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
  const feedbackMessages = useMemo(
    () => (activeTab === 'feedback' && Array.isArray(data) ? data : []),
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
              <span className="inline-flex items-center gap-1.5">
                {tab.label}
                {tab.key === 'feedback' && feedbackUnreadCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-widest text-gray-500">{activeTab}</div>
              {activeTab === 'users' && Array.isArray(data) && (
                <span className="text-[10px] text-gray-600">{applyUserFilters.length} records</span>
              )}
              {activeTab === 'cases' && Array.isArray(data) && (
                <span className="text-[10px] text-gray-600">{cases.length} records</span>
              )}
              {activeTab === 'battles' && Array.isArray(data) && (
                <span className="text-[10px] text-gray-600">{sortedBattles.length} records</span>
              )}
              {activeTab === 'inventory' && Array.isArray(data) && (
                <span className="text-[10px] text-gray-600">{sortedInventory.length} records</span>
              )}
              {activeTab === 'transactions' && Array.isArray(data) && (
                <span className="text-[10px] text-gray-600">{sortedTransactions.length} records</span>
              )}
              {activeTab === 'audit' && Array.isArray(data) && (
                <span className="text-[10px] text-gray-600">{audit.length} records</span>
              )}
            </div>
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
                  <option value="invitedUserCount:desc">Invited ↓</option>
                  <option value="invitedUserCount:asc">Invited ↑</option>
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
              {(['users', 'cases', 'battles', 'inventory', 'transactions', 'audit', 'analytics'] as TabKey[]).includes(activeTab) && (
                <button
                  onClick={() => {
                    if (activeTab === 'analytics' && analytics) {
                      const s = analytics.summary || {};
                      const g = analytics.growth || {};
                      const summaryRows = [
                        { metric: 'Total Users', value: s.totalUsers },
                        { metric: 'Total Cases', value: s.totalCases },
                        { metric: 'Open Cases', value: s.openCases },
                        { metric: 'Expired Cases', value: s.expiredCases },
                        { metric: 'Total Battles', value: s.totalBattles },
                        { metric: 'Total Deposits', value: s.totalDeposits },
                        { metric: 'Total Deposit Volume (USDT)', value: s.totalDepositVolume },
                        { metric: 'Total Openings', value: s.totalOpenings },
                        { metric: 'Token Claims', value: s.totalClaims },
                        { metric: 'Unclaimed Tokens Count', value: s.inventoryActiveCount },
                        { metric: 'Unclaimed Tokens Value', value: s.inventoryActiveValue },
                        { metric: 'Claimed Tokens Count', value: s.inventoryClaimedCount },
                        { metric: 'Claimed Tokens Value', value: s.inventoryClaimedValue },
                        { metric: 'New Users Today', value: g.newUsersToday },
                        { metric: 'New Users (7d)', value: g.newUsers7d },
                        { metric: 'New Users (30d)', value: g.newUsers30d },
                        { metric: 'Active Users (30d)', value: g.activeUsers30d },
                        { metric: 'Openings (30d)', value: g.openings30d },
                        { metric: 'Battles (30d)', value: g.battles30d },
                        { metric: 'Deposit Volume (30d, USDT)', value: g.deposit30dVolume },
                        { metric: 'Reward Claims (30d)', value: g.rewardClaims30d },
                      ];
                      downloadCsv('analytics_summary', summaryRows);
                      const charts = analytics.charts || {};
                      for (const [key, rows] of Object.entries(charts)) {
                        if (Array.isArray(rows) && rows.length > 0) {
                          downloadCsv(`analytics_${key}`, rows as Record<string, any>[]);
                        }
                      }
                      return;
                    }
                    const rowsMap: Record<string, any[]> = {
                      users: applyUserFilters,
                      cases: cases,
                      battles: sortedBattles,
                      inventory: sortedInventory,
                      transactions: sortedTransactions,
                      audit: audit,
                    };
                    downloadCsv(activeTab, rowsMap[activeTab] || []);
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
                    { label: 'Unread Feedback', value: overview?.stats?.feedbackUnread ?? 0 },
                  ].map((item) => (
                    <StatCard key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>

              <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Gas Wallet</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Signer</div>
                    <div className="text-gray-300 font-mono truncate">
                      {overview?.gasWallet?.address ? shortWallet(overview.gasWallet.address) : '-'}
                    </div>
                  </div>
                  <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Signer ETH</div>
                    <div className={`font-bold ${
                      overview?.gasWallet?.isLow === true ? 'text-red-400' : 'text-web3-success'
                    }`}>
                      {overview?.gasWallet?.ethBalance == null ? '-' : Number(overview.gasWallet.ethBalance).toFixed(4)}
                    </div>
                  </div>
                  <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Treasury ETH</div>
                    <div className="font-bold text-gray-200">
                      {overview?.gasWallet?.treasuryEthBalance == null ? '-' : Number(overview.gasWallet.treasuryEthBalance).toFixed(4)}
                    </div>
                  </div>
                  <div className="bg-black/20 border border-white/[0.06] rounded-lg p-2">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Status</div>
                    <div className={`font-bold ${
                      overview?.gasWallet?.rpcConnected === false
                        ? 'text-yellow-400'
                        : overview?.gasWallet?.isLow
                        ? 'text-red-400'
                        : 'text-web3-success'
                    }`}>
                      {overview?.gasWallet?.rpcConnected === false
                        ? 'RPC Offline'
                        : overview?.gasWallet?.isLow
                        ? `LOW (< ${Number(overview?.gasWallet?.lowThresholdEth || 0.03).toFixed(3)} ETH)`
                        : 'OK'}
                    </div>
                  </div>
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
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,640px)] gap-4 min-w-0">
              <div className="space-y-3">
                {paginate(applyUserFilters, 'users').map((user: any) => (
                  <div key={user.id} className="grid grid-cols-1 md:grid-cols-8 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Username</div>
                      <div className="text-sm font-bold truncate">{user.username}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {user.twitterUsername && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/[0.08] text-[9px] text-gray-400">
                            <svg viewBox="0 0 1200 1227" className="w-2 h-2 fill-current shrink-0"><path d="M714.163 519.284L1160.89 0H1055.14L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.748L515.454 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.06 687.828L521.627 619.936L144.011 79.6944H306.615L611.333 515.664L658.766 583.556L1055.19 1150.69H892.586L569.06 687.854V687.828Z" /></svg>
                            @{user.twitterUsername}
                          </span>
                        )}
                        {user.telegramUsername && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/[0.08] text-[9px] text-gray-400">
                            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-current shrink-0"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.800-.840-.547-.297-1.174.157-1.557.112-.098 3.018-2.885 3.076-3.13.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                            @{user.telegramUsername}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 md:col-span-2">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Wallet</div>
                      <div className="text-xs text-gray-500 truncate">{user.walletAddress}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Balance</div>
                      <div className="text-xs text-gray-400">{user.balance} ₮ · <span className="text-web3-accent">{user.rewardPoints ?? 0} CFP</span> · <span className="text-gray-500">Lvl {getLevelInfo(user.rewardPoints ?? 0).level}</span></div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        Invited: <span className="text-gray-300">{user.invitedUserCount ?? 0}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500">{formatDate(user.createdAt)}</div>
                    <div>
                      <select
                        value={user.role}
                        disabled={!canEditRoles || user.walletAddress?.toLowerCase() === IMMUTABLE_ADMIN_WALLET.toLowerCase()}
                        onChange={async (e) => {
                          setSaving(user.id);
                          try {
                          await api.updateAdminUserRole(user.id, e.target.value);
                          await load();
                          } catch (err: any) {
                            window.alert(err?.message || 'Failed to update role');
                            await load();
                          } finally {
                          setSaving(null);
                          }
                        }}
                        className="w-full bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="USER">USER</option>
                        <option value="MODERATOR">MODERATOR</option>
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
              <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3 min-h-[240px] min-w-0 max-h-[calc(100vh-9rem)] overflow-y-auto overflow-x-hidden">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">User detail</div>
                {selectedUserId ? (
                  <UserDetail
                    userId={selectedUserId}
                    isBootstrapAdmin={isBootstrapWalletUser}
                    onUserDeleted={() => {
                      setSelectedUserId(null);
                      void load();
                    }}
                  />
                ) : (
                  <div className="text-xs text-gray-500">Select a user to see full account activity.</div>
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
              <div className="text-xs text-gray-500 mb-2">PvP and bot battle results. Each row is one player's outcome — cost is the case opening price, result is WIN or LOSS.</div>
              <div className="hidden md:grid grid-cols-6 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                <div className="col-span-2">ID</div>
                <div>User</div>
                <div>Result</div>
                <div>Cost</div>
                <div>Date</div>
              </div>
              {sortedBattles.length === 0 && (
                <div className="text-sm text-gray-500 py-8 text-center">No battles found.</div>
              )}
              {paginate(sortedBattles, 'battles').map((battle: any) => (
                <div key={battle.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2 font-mono truncate">{battle.id}</div>
                  <div className="truncate">{battle.userId}</div>
                  <div>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${battle.result === 'WIN' ? 'bg-web3-success/20 text-web3-success' : 'bg-red-500/15 text-red-300'}`}>
                      {battle.result}
                    </span>
                  </div>
                  <div>{battle.cost} ₮</div>
                  <div>{formatDate(battle.timestamp)}</div>
                </div>
              ))}
              {sortedBattles.length > 0 && (
              <Pagination
                currentPage={pages.battles}
                totalPages={totalPages(sortedBattles)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, battles: next }))}
              />
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'inventory' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-2">Tokens won by users from case openings, upgrades, and battles. ACTIVE = in user's wallet, not yet claimed on-chain. BURNT = used in an upgrade attempt.</div>
              <div className="hidden md:grid grid-cols-7 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                <div className="col-span-2">ID</div>
                <div>User</div>
                <div>Name</div>
                <div>Value</div>
                <div>Status</div>
                <div>Date</div>
              </div>
              {sortedInventory.length === 0 && (
                <div className="text-sm text-gray-500 py-8 text-center">No inventory items found.</div>
              )}
              {paginate(sortedInventory, 'inventory').map((item: any) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2 font-mono truncate">{item.id}</div>
                  <div className="truncate">{item.userId}</div>
                  <div>{item.name}</div>
                  <div>{item.value} {item.currency}</div>
                  <div>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${item.status === 'ACTIVE' ? 'bg-web3-success/20 text-web3-success' : 'bg-gray-500/20 text-gray-400'}`}>
                      {item.status}
                    </span>
                  </div>
                  <div>{formatDate(item.createdAt)}</div>
                </div>
              ))}
              {sortedInventory.length > 0 && (
              <Pagination
                currentPage={pages.inventory}
                totalPages={totalPages(sortedInventory)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, inventory: next }))}
              />
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'transactions' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 mb-2">All balance movements. DEPOSIT = user top-up, CASE_OPEN = case opening cost, CASE_CREATE = case creation fee, BATTLE = battle entry cost, UPGRADE = upgrade attempt.</div>
              <div className="hidden md:grid grid-cols-7 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                <div className="col-span-2">ID</div>
                <div>User</div>
                <div>Type</div>
                <div>Amount</div>
                <div>Status</div>
                <div>Date</div>
              </div>
              {sortedTransactions.length === 0 && (
                <div className="text-sm text-gray-500 py-8 text-center">No transactions found.</div>
              )}
              {paginate(sortedTransactions, 'transactions').map((tx: any) => (
                <div key={tx.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2 font-mono truncate">{tx.id}</div>
                  <div className="truncate">{tx.userId}</div>
                  <div>
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold">{tx.type}</span>
                  </div>
                  <div>{tx.amount} {tx.currency}</div>
                  <div>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${tx.status === 'completed' ? 'bg-web3-success/20 text-web3-success' : tx.status === 'failed' ? 'bg-red-500/15 text-red-300' : 'bg-yellow-400/15 text-yellow-300'}`}>
                      {tx.status}
                    </span>
                  </div>
                  <div>{formatDate(tx.timestamp)}</div>
                </div>
              ))}
              {sortedTransactions.length > 0 && (
              <Pagination
                currentPage={pages.transactions}
                totalPages={totalPages(sortedTransactions)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, transactions: next }))}
              />
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'rtu' && (
            <div className="space-y-4">
              <div className="text-xs text-gray-500 mb-2">Return-To-User (RTU) engine. Tracks how much USDT was spent per case and how many tokens were issued. Buffer debt shows the deficit/surplus between ideal and actual token issuance. Use manual adjustment to correct ledger imbalances.</div>
              <div className="bg-black/30 border border-white/[0.08] rounded-xl p-3">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Battle Resolve Preview</div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                  <input
                    value={battlePreviewInput}
                    onChange={(e) => setBattlePreviewInput(e.target.value)}
                    placeholder="caseId1,caseId2,..."
                    className="md:col-span-3 bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                  />
                  <select
                    value={battlePreviewMode}
                    onChange={(e) => setBattlePreviewMode(e.target.value as 'BOT' | 'PVP')}
                    className="bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
                  >
                    <option value="BOT">BOT</option>
                    <option value="PVP">PVP</option>
                  </select>
                  <button
                    onClick={async () => {
                      const caseIds = battlePreviewInput
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean);
                      if (!caseIds.length) return;
                      setBattlePreviewLoading(true);
                      setBattlePreviewError(null);
                      try {
                        const response = await api.previewAdminBattleResolve({
                          caseIds,
                          mode: battlePreviewMode,
                        });
                        setBattlePreview(response.data || null);
                      } catch (err: any) {
                        setBattlePreview(null);
                        setBattlePreviewError(err?.message || 'Preview failed');
                      } finally {
                        setBattlePreviewLoading(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
                  >
                    {battlePreviewLoading ? 'Running...' : 'Run Preview'}
                  </button>
                </div>
                {battlePreviewError && (
                  <div className="mt-2 text-xs text-red-400">{battlePreviewError}</div>
                )}
                {battlePreview?.rounds?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {battlePreview.rounds.map((round: any, index: number) => (
                      <div key={`${round.caseId}-${index}`} className="rounded-lg border border-white/[0.08] bg-black/20 p-2 text-xs text-gray-300">
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                          <span className="uppercase tracking-widest text-gray-500">Round {index + 1}</span>
                          <span className="font-bold">{round.caseName}</span>
                          <span className="text-gray-500">{round.token}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">User drop</div>
                            <div>{formatTokenValue(round.userDrop?.value || 0)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Opponent drop</div>
                            <div>{formatTokenValue(round.opponentDrop?.value || 0)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Ideal/Max safe</div>
                            <div>{formatTokenValue(round.userDebug?.idealDrop || 0)} / {formatTokenValue(round.userDebug?.maxSafeDrop || 0)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">State after</div>
                            <div>spent {formatTokenValue(round.stateAfter?.spent || 0)} / issued {formatTokenValue(round.stateAfter?.issued || 0)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                  <div className="hidden md:grid grid-cols-8 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                    <div className="col-span-2">Case ID</div>
                    <div>Token</div>
                    <div>Price (USDT)</div>
                    <div>RTU %</div>
                    <div>Spent (USDT)</div>
                    <div>Issued</div>
                    <div>Buffer Debt</div>
                  </div>
                  {rtuLedgers.length === 0 && (
                    <div className="text-sm text-gray-500 py-4 text-center">No ledgers.</div>
                  )}
                  {paginate(rtuLedgers, 'rtuLedgers').map((ledger: any) => {
                    const alert =
                      rtuAlertThreshold > 0 &&
                      Math.abs(Number(ledger.bufferDebtToken || 0)) >= rtuAlertThreshold;
                    return (
                    <div
                      key={ledger.id}
                      className={`grid grid-cols-1 md:grid-cols-8 gap-3 items-center rounded-xl p-3 text-xs ${
                        alert
                          ? 'bg-red-500/10 border border-red-500/40 text-red-300'
                          : 'bg-black/30 border border-white/[0.08] text-gray-400'
                      }`}
                    >
                      <div className="md:col-span-2 font-mono truncate">{ledger.caseId}</div>
                      <div>{ledger.tokenSymbol}</div>
                      <div>{ledger.tokenPriceUsdt}</div>
                      <div>{ledger.rtuPercent}%</div>
                      <div>{formatTokenValue(ledger.totalSpentUsdt)}</div>
                      <div>{formatTokenValue(ledger.totalTokenIssued)}</div>
                      <div className={alert ? 'font-bold' : ''}>{formatTokenValue(ledger.bufferDebtToken)}</div>
                    </div>
                    );
                  })}
                  {rtuLedgers.length > 0 && (
                  <Pagination
                    currentPage={pages.rtuLedgers}
                    totalPages={totalPages(rtuLedgers)}
                    onPageChange={(next) => setPages((prev) => ({ ...prev, rtuLedgers: next }))}
                  />
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Events</div>
                <div className="space-y-2">
                  <div className="hidden md:grid grid-cols-7 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                    <div className="col-span-2">Case ID</div>
                    <div>Token</div>
                    <div>Type</div>
                    <div>Δ Spent (USDT)</div>
                    <div>Δ Token</div>
                    <div>Date</div>
                  </div>
                  {rtuEvents.length === 0 && (
                    <div className="text-sm text-gray-500 py-4 text-center">No events.</div>
                  )}
                  {paginate(rtuEvents, 'rtuEvents').map((event: any) => (
                    <div key={event.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                      <div className="md:col-span-2 font-mono truncate">{event.caseId}</div>
                      <div>{event.tokenSymbol}</div>
                      <div>
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold">{event.type}</span>
                      </div>
                      <div>{formatTokenValue(event.deltaSpentUsdt)}</div>
                      <div>{formatTokenValue(event.deltaToken)}</div>
                      <div>{formatDate(event.createdAt)}</div>
                    </div>
                  ))}
                  {rtuEvents.length > 0 && (
                  <Pagination
                    currentPage={pages.rtuEvents}
                    totalPages={totalPages(rtuEvents)}
                    onPageChange={(next) => setPages((prev) => ({ ...prev, rtuEvents: next }))}
                  />
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'settings' && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 mb-2">Key-value configuration store. Values can be JSON objects or plain strings. Changes take effect immediately.</div>
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
              <div className="text-xs text-gray-500 mb-2">Log of all admin actions — role changes, bans, case edits, RTU adjustments. Use for accountability and troubleshooting.</div>
              <div className="hidden md:grid grid-cols-6 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                <div className="col-span-2">Action</div>
                <div>Admin</div>
                <div>Entity</div>
                <div>Entity ID</div>
                <div>Date</div>
              </div>
              {audit.length === 0 && (
                <div className="text-sm text-gray-500 py-8 text-center">No audit logs.</div>
              )}
              {paginate(audit, 'audit').map((log) => (
                <div key={log.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                  <div className="md:col-span-2">{log.action}</div>
                  <div className="truncate">{log.adminId}</div>
                  <div>{log.entity}</div>
                  <div className="font-mono truncate">{log.entityId}</div>
                  <div>{formatDate(log.createdAt)}</div>
                </div>
              ))}
              {audit.length > 0 && (
              <Pagination
                currentPage={pages.audit}
                totalPages={totalPages(audit)}
                onPageChange={(next) => setPages((prev) => ({ ...prev, audit: next }))}
              />
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'feedback' && (
            <div className="space-y-2">
              {feedbackMessages.map((item: any) => {
                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-1 md:grid-cols-8 gap-3 items-center rounded-xl p-3 text-xs ${
                      item.isRead
                        ? 'bg-black/30 border border-white/[0.08] text-gray-400'
                        : 'bg-red-500/10 border border-red-500/30 text-red-200'
                    }`}
                  >
                    <div className="md:col-span-2 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">User</div>
                      <div className="truncate">{item.user?.username || 'Unknown'}</div>
                      <div className="text-[10px] text-gray-500 truncate">{item.user?.walletAddress || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Topic</div>
                      <div>{item.topic}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Contact</div>
                      <div className="truncate">{item.contact}</div>
                    </div>
                    <div className="md:col-span-2 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Message</div>
                      <div className="break-words whitespace-pre-wrap">{item.message}</div>
                    </div>
                    <div className="text-[10px] text-gray-500">{formatDate(item.createdAt)}</div>
                    <div className="flex justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={async () => {
                            setSaving(item.id);
                            await api.updateAdminFeedbackReadStatus(item.id, !item.isRead);
                            await load();
                            setSaving(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border ${
                            item.isRead
                              ? 'bg-white/5 border-white/10 text-gray-300'
                              : 'bg-red-500/20 border-red-500/40 text-red-200'
                          }`}
                        >
                          {saving === item.id ? 'Saving...' : item.isRead ? 'Mark Unread' : 'Mark Read'}
                        </button>
                    </div>
                  </div>
                );
              })}
              {!feedbackMessages.length && (
                <div className="text-sm text-gray-500">No feedback yet.</div>
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'rewards' && (
            <div className="space-y-4">
              {(() => {
                const isCaseFun = ['OPEN_CASES','OPEN_SPECIFIC_CASE','DO_UPGRADES','CREATE_BATTLES','JOIN_BATTLES','CLAIM_TOKENS','CREATE_CASES'].includes(newRewardTask.type);
                const needsUrl = ['LIKE_TWEET','REPOST_TWEET','COMMENT_TWEET'].includes(newRewardTask.type);
                const needsCaseId = newRewardTask.type === 'OPEN_SPECIFIC_CASE';
                const canCreate = saving === null
                  && (!needsUrl || newRewardTask.targetUrl.trim())
                  && (!isCaseFun || Number(newRewardTask.targetCount) > 0);
                return (
              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-5 space-y-4">
                <div className="text-sm font-bold text-white">Create Reward Task</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Task Type</label>
                    <select
                      value={newRewardTask.type}
                      onChange={(e) => setNewRewardTask((p) => ({ ...p, type: e.target.value, targetUrl: '', targetCount: '', targetCaseId: '' }))}
                      className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300"
                    >
                      <optgroup label="Social">
                        <option value="LIKE_TWEET">Like post on X</option>
                        <option value="REPOST_TWEET">Repost on X</option>
                        <option value="COMMENT_TWEET">Comment on post</option>
                        <option value="FOLLOW_TWITTER">Follow @casefunnet</option>
                        <option value="SUBSCRIBE_TELEGRAM">Join Telegram</option>
                      </optgroup>
                      <optgroup label="CaseFun">
                        <option value="OPEN_CASES">Open cases</option>
                        <option value="OPEN_SPECIFIC_CASE">Open specific case</option>
                        <option value="DO_UPGRADES">Complete upgrades</option>
                        <option value="CREATE_BATTLES">Create battles</option>
                        <option value="JOIN_BATTLES">Play battles</option>
                        <option value="CLAIM_TOKENS">Claim tokens</option>
                        <option value="CREATE_CASES">Create cases</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Reward (CFP)</label>
                    <input value={newRewardTask.reward} onChange={(e) => setNewRewardTask((p) => ({ ...p, reward: Math.max(1, Number(e.target.value) || 1) }))} type="number" min={1} placeholder="e.g. 5" className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600" />
                    <div className="text-[10px] text-gray-600">CFP awarded per completion</div>
                  </div>
                </div>

                {needsUrl && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Post URL</label>
                    <input value={newRewardTask.targetUrl} onChange={(e) => setNewRewardTask((p) => ({ ...p, targetUrl: e.target.value }))} placeholder="https://x.com/.../status/..." className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600" />
                  </div>
                )}

                {isCaseFun && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-gray-400 font-medium">Target Count</label>
                      <input value={newRewardTask.targetCount} onChange={(e) => setNewRewardTask((p) => ({ ...p, targetCount: e.target.value }))} type="number" min={1} placeholder="e.g. 5" className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600" />
                      <div className="text-[10px] text-gray-600">How many actions to complete the task</div>
                    </div>
                    {needsCaseId && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-gray-400 font-medium">Case ID</label>
                        <input value={newRewardTask.targetCaseId} onChange={(e) => setNewRewardTask((p) => ({ ...p, targetCaseId: e.target.value }))} placeholder="Case ID" className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600 font-mono" />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-gray-400 font-medium">Repeat Interval</label>
                      <select value={newRewardTask.repeatIntervalHours} onChange={(e) => setNewRewardTask((p) => ({ ...p, repeatIntervalHours: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300">
                        <option value="">One-time only</option>
                        <option value="0">Instantly repeatable (no cooldown)</option>
                        <option value="1">Every 1 hour</option>
                        <option value="6">Every 6 hours</option>
                        <option value="12">Every 12 hours</option>
                        <option value="24">Every 24 hours (daily)</option>
                        <option value="48">Every 48 hours</option>
                        <option value="168">Every 7 days (weekly)</option>
                      </select>
                      <div className="text-[10px] text-gray-600">One-time = claim once. Instant = available again immediately after claim. Timed = resets after cooldown.</div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-gray-400 font-medium">Active Until</label>
                      <input value={newRewardTask.activeUntil} onChange={(e) => setNewRewardTask((p) => ({ ...p, activeUntil: e.target.value }))} type="datetime-local" className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300" />
                      <div className="text-[10px] text-gray-600">Leave empty = active until manually disabled</div>
                    </div>
                  </div>
                )}

                          <button
                  type="button" disabled={!canCreate}
                            onClick={async () => {
                    setSaving('new-reward');
                    try {
                      await api.createAdminRewardTask({
                        type: newRewardTask.type, title: '', description: '',
                        targetUrl: newRewardTask.targetUrl || undefined,
                        reward: newRewardTask.reward, sortOrder: 100,
                        ...(isCaseFun ? {
                          targetCount: Number(newRewardTask.targetCount) || 1,
                          targetCaseId: newRewardTask.targetCaseId || undefined,
                          repeatIntervalHours: Number(newRewardTask.repeatIntervalHours) || undefined,
                          activeUntil: newRewardTask.activeUntil || undefined,
                        } : {}),
                      });
                      setNewRewardTask({ type: 'LIKE_TWEET', targetUrl: '', reward: 1, targetCount: '', targetCaseId: '', repeatIntervalHours: '', activeUntil: '' });
                              await load();
                    } catch (err: any) { window.alert(err?.message || 'Failed'); }
                    finally { setSaving(null); }
                  }}
                  className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-40"
                >
                  {saving === 'new-reward' ? 'Creating…' : 'Create Task'}
                </button>
              </div>
                );
              })()}

              {/* Task list */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">All Reward Tasks</div>
                {((data as any)?.tasks || []).map((task: any) => {
                  const TYPE_LABELS: Record<string, string> = { LIKE_TWEET: 'Like post', REPOST_TWEET: 'Repost', COMMENT_TWEET: 'Comment', FOLLOW_TWITTER: 'Follow X', SUBSCRIBE_TELEGRAM: 'Join TG', LINK_TWITTER: 'Link Twitter', LINK_TELEGRAM: 'Link Telegram', OPEN_CASES: 'Open cases', OPEN_SPECIFIC_CASE: 'Open specific case', DO_UPGRADES: 'Upgrades', CREATE_BATTLES: 'Create battles', JOIN_BATTLES: 'Play battles', CLAIM_TOKENS: 'Claim tokens', CREATE_CASES: 'Create cases' };
                  const isCF = task.category === 'CASEFUN';
                  const isEditing = editingTask?.id === task.id;
                  return (
                  <div key={task.id} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isCF ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>{isCF ? 'CaseFun' : 'Social'}</span>
                          <span className="text-xs text-white font-medium">{TYPE_LABELS[task.type] || task.title}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          +{task.reward} CFP · <span className="text-gray-400">{task.claimCount ?? 0} claims</span>
                          {isCF && task.targetCount ? ` · ${task.targetCount}× target` : ''}
                          {isCF && task.repeatIntervalHours != null && task.repeatIntervalHours === 0 ? ' · instant repeat' : isCF && task.repeatIntervalHours ? ` · repeats every ${task.repeatIntervalHours}h` : isCF ? ' · one-time' : ''}
                          {task.activeUntil ? ` · until ${new Date(task.activeUntil).toLocaleDateString()}` : ''}
                          {task.isDefault ? ' · Default' : ''}
                        </div>
                        {task.targetUrl && <div className="text-[10px] text-web3-accent truncate mt-0.5">{task.targetUrl}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => setEditingTask(isEditing ? null : { id: task.id, reward: task.reward, targetUrl: task.targetUrl || '', targetCount: task.targetCount || '', repeatIntervalHours: task.repeatIntervalHours ?? '', activeUntil: task.activeUntil ? new Date(task.activeUntil).toISOString().slice(0, 16) : '' })} className="text-[10px] px-2 py-1 rounded-lg border border-web3-accent/30 text-web3-accent">
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                        <button type="button" onClick={async () => { setSaving(task.id); try { await api.updateAdminRewardTask(task.id, { isActive: !task.isActive }); await load(); } catch (err: any) { window.alert(err?.message || 'Failed'); } finally { setSaving(null); } }} disabled={saving === task.id} className={`text-[10px] px-2 py-1 rounded-lg border ${task.isActive ? 'border-web3-success/30 text-web3-success' : 'border-gray-600 text-gray-500'}`}>
                          {task.isActive ? 'Active' : 'Inactive'}
                        </button>
                        {!task.isDefault && (
                          <button type="button" onClick={async () => { if (!window.confirm('Delete this task?')) return; setSaving(task.id); try { await api.deleteAdminRewardTask(task.id); await load(); } catch (err: any) { window.alert(err?.message || 'Failed'); } finally { setSaving(null); } }} disabled={saving === task.id} className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-400">Delete</button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-500">Reward (CFP)</label>
                          <input type="number" min={1} value={editingTask.reward} onChange={(e) => setEditingTask((p: any) => ({ ...p, reward: Number(e.target.value) || 1 }))} className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300" />
                        </div>
                        {!isCF && (
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500">Target URL</label>
                            <input value={editingTask.targetUrl} onChange={(e) => setEditingTask((p: any) => ({ ...p, targetUrl: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300" />
                          </div>
                        )}
                        {isCF && (
                          <>
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500">Target Count</label>
                              <input type="number" min={1} value={editingTask.targetCount} onChange={(e) => setEditingTask((p: any) => ({ ...p, targetCount: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500">Repeat (hours)</label>
                              <input type="number" min={0} value={editingTask.repeatIntervalHours} onChange={(e) => setEditingTask((p: any) => ({ ...p, repeatIntervalHours: e.target.value }))} placeholder="0 = one-time" className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500">Active Until</label>
                              <input type="datetime-local" value={editingTask.activeUntil} onChange={(e) => setEditingTask((p: any) => ({ ...p, activeUntil: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300" />
                            </div>
                          </>
                        )}
                        <div className="flex items-end">
                          <button type="button" disabled={saving === task.id} onClick={async () => {
                            setSaving(task.id);
                            try {
                              const updates: any = { reward: editingTask.reward };
                              if (!isCF) updates.targetUrl = editingTask.targetUrl || null;
                              if (isCF) {
                                if (editingTask.targetCount) updates.targetCount = Number(editingTask.targetCount);
                                updates.repeatIntervalHours = Number(editingTask.repeatIntervalHours) || null;
                                updates.activeUntil = editingTask.activeUntil || null;
                              }
                              await api.updateAdminRewardTask(task.id, updates);
                              setEditingTask(null);
                              await load();
                            } catch (err: any) { window.alert(err?.message || 'Failed'); }
                            finally { setSaving(null); }
                          }} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-50">
                            {saving === task.id ? '...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              {/* Claims history */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Recent Claims</div>
                {((data as any)?.claims || []).length === 0 && (
                  <div className="text-xs text-gray-600">No claims yet</div>
                )}
                {((data as any)?.claims || []).slice(0, 50).map((claim: any) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-black/15"
                  >
                    <div>
                      <div className="text-[11px] text-white">
                        {claim.username} — {claim.taskTitle}
                      </div>
                      <div className="text-[10px] text-gray-600">
                        {new Date(claim.claimedAt).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-web3-accent font-bold">+{claim.reward} CFP</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analytics tab */}
          {!loading && !error && activeTab === 'analytics' && analytics && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Platform report — generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSaving('pdf');
                    try {
                      const { jsPDF } = await import('jspdf');
                      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                      const W = pdf.internal.pageSize.getWidth();
                      const H = pdf.internal.pageSize.getHeight();
                      const m = 15;
                      let y = 0;
                      const s = analytics.summary || {};
                      const g = analytics.growth || {};
                      const charts = analytics.charts || {};

                      const bg = (yy: number, hh: number, color = [19, 22, 32]) => {
                        pdf.setFillColor(color[0], color[1], color[2]);
                        pdf.rect(0, yy, W, hh, 'F');
                      };
                      const checkPage = (need: number) => {
                        if (y + need > H - 10) { pdf.addPage(); bg(0, H); y = m; }
                      };
                      const sectionTitle = (text: string) => {
                        checkPage(15);
                        pdf.setFontSize(7); pdf.setTextColor(100, 110, 130);
                        pdf.text(text.toUpperCase(), m, y); y += 6;
                      };
                      const drawMetricGrid = (items: { label: string; value: string | number }[], cols = 4) => {
                        const cellW = (W - m * 2) / cols;
                        const cellH = 14;
                        const rows = Math.ceil(items.length / cols);
                        checkPage(rows * cellH + 2);
                        items.forEach((item, i) => {
                          const col = i % cols;
                          const row = Math.floor(i / cols);
                          const cx = m + col * cellW;
                          const cy = y + row * cellH;
                          pdf.setFillColor(15, 17, 25);
                          pdf.roundedRect(cx + 1, cy, cellW - 2, cellH - 2, 2, 2, 'F');
                          pdf.setFontSize(6); pdf.setTextColor(100, 110, 130);
                          pdf.text(item.label.toUpperCase(), cx + 4, cy + 5);
                          pdf.setFontSize(11); pdf.setTextColor(255, 255, 255);
                          pdf.text(String(item.value), cx + 4, cy + 10.5);
                        });
                        y += rows * cellH + 3;
                      };
                      const drawBarChart = (title: string, rows: { date: string; value: number }[], color: number[], isCurrency = false) => {
                        if (!rows.length) return;
                        checkPage(42);
                        pdf.setFontSize(7); pdf.setTextColor(100, 110, 130);
                        pdf.text(title.toUpperCase(), m, y);
                        const total = rows.reduce((a, r) => a + r.value, 0);
                        const totalStr = isCurrency ? `${total.toFixed(2)} USDT` : total.toLocaleString();
                        pdf.text(`TOTAL: ${totalStr}`, W - m, y, { align: 'right' });
                        y += 4;
                        const chartW = W - m * 2;
                        const chartH = 28;
                        pdf.setFillColor(15, 17, 25);
                        pdf.roundedRect(m, y, chartW, chartH, 2, 2, 'F');
                        const maxVal = Math.max(...rows.map((r) => r.value), 1);
                        const barW = (chartW - 4) / rows.length;
                        rows.forEach((r, i) => {
                          const pct = r.value / maxVal;
                          const bh = Math.max(pct * (chartH - 6), 0.5);
                          pdf.setFillColor(color[0], color[1], color[2]);
                          pdf.rect(m + 2 + i * barW + 0.3, y + chartH - 2 - bh, Math.max(barW - 0.6, 0.5), bh, 'F');
                        });
                        pdf.setFontSize(5); pdf.setTextColor(80, 90, 100);
                        pdf.text(rows[0]?.date?.slice(5) || '', m + 2, y + chartH + 3);
                        pdf.text(rows[rows.length - 1]?.date?.slice(5) || '', W - m - 2, y + chartH + 3, { align: 'right' });
                        y += chartH + 7;
                      };

                      bg(0, H);

                      pdf.setFillColor(99, 102, 241);
                      pdf.rect(0, 0, W, 38, 'F');
                      pdf.setFontSize(22); pdf.setTextColor(255, 255, 255);
                      pdf.text('CaseFun', m, 16);
                      pdf.setFontSize(10); pdf.setTextColor(200, 210, 255);
                      pdf.text('Platform Analytics Report', m, 23);
                      pdf.setFontSize(8); pdf.setTextColor(180, 190, 230);
                      pdf.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), m, 30);
                      pdf.setFontSize(7);
                      pdf.text('Confidential', W - m, 30, { align: 'right' });
                      y = 46;

                      sectionTitle('Platform Summary');
                      drawMetricGrid([
                        { label: 'Total Users', value: s.totalUsers ?? 0 },
                        { label: 'Cases Created', value: s.totalCases ?? 0 },
                        { label: 'Open Cases', value: s.openCases ?? 0 },
                        { label: 'Expired Cases', value: s.expiredCases ?? 0 },
                        { label: 'Total Openings', value: (s.totalOpenings ?? 0).toLocaleString() },
                        { label: 'Total Battles', value: (s.totalBattles ?? 0).toLocaleString() },
                        { label: 'Total Deposits', value: s.totalDeposits ?? 0 },
                        { label: 'Deposit Volume', value: `${Number(s.totalDepositVolume ?? 0).toFixed(2)} ₮` },
                        { label: 'Token Claims', value: s.totalClaims ?? 0 },
                        { label: 'Unclaimed Tokens', value: `${s.inventoryActiveCount ?? 0} (${Number(s.inventoryActiveValue ?? 0).toFixed(2)} ₮)` },
                        { label: 'Claimed Tokens', value: `${s.inventoryClaimedCount ?? 0} (${Number(s.inventoryClaimedValue ?? 0).toFixed(2)} ₮)` },
                      ]);

                      sectionTitle('Growth — Last 30 Days');
                      drawMetricGrid([
                        { label: 'New Users Today', value: g.newUsersToday ?? 0 },
                        { label: 'New Users (7d)', value: g.newUsers7d ?? 0 },
                        { label: 'New Users (30d)', value: g.newUsers30d ?? 0 },
                        { label: 'Active Users (30d)', value: g.activeUsers30d ?? 0 },
                        { label: 'Openings (30d)', value: g.openings30d ?? 0 },
                        { label: 'Battles (30d)', value: g.battles30d ?? 0 },
                        { label: 'Deposits (30d)', value: `${Number(g.deposit30dVolume ?? 0).toFixed(2)} ₮` },
                        { label: 'Reward Claims (30d)', value: g.rewardClaims30d ?? 0 },
                      ]);

                      sectionTitle('Daily Activity — 30 Day Trend');
                      drawBarChart('New Registrations', charts.dailyNewUsers || [], [99, 102, 241]);
                      drawBarChart('Daily Active Users', charts.dailyActiveUsers || [], [34, 197, 94]);
                      drawBarChart('Case Openings', charts.dailyOpenings || [], [245, 158, 11]);
                      drawBarChart('Battles', charts.dailyBattles || [], [239, 68, 68]);
                      drawBarChart('Deposit Volume (USDT)', charts.dailyDeposits || [], [6, 182, 212], true);

                      const pageCount = pdf.getNumberOfPages();
                      for (let p = 1; p <= pageCount; p++) {
                        pdf.setPage(p);
                        pdf.setFontSize(6); pdf.setTextColor(80, 90, 100);
                        pdf.text(`CaseFun Analytics Report — Page ${p} of ${pageCount}`, m, H - 5);
                        pdf.text(new Date().toISOString().slice(0, 10), W - m, H - 5, { align: 'right' });
                      }

                      pdf.save(`CaseFun_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
                    } catch (err) {
                      console.error('PDF generation failed:', err);
                    } finally {
                              setSaving(null);
                    }
                            }}
                  disabled={saving === 'pdf'}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-50"
                          >
                  {saving === 'pdf' ? 'Generating...' : 'Download PDF Report'}
                          </button>
                </div>
              </div>

              <div className="space-y-6">
              <div>
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Platform Summary</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Users', value: analytics.summary?.totalUsers ?? 0, desc: 'Registered accounts' },
                    { label: 'Cases Created', value: analytics.summary?.totalCases ?? 0, desc: 'Total cases on platform' },
                    { label: 'Open Cases', value: analytics.summary?.openCases ?? 0, desc: 'Currently available to open' },
                    { label: 'Expired Cases', value: analytics.summary?.expiredCases ?? 0, desc: 'Cases past their duration' },
                    { label: 'Total Openings', value: (analytics.summary?.totalOpenings ?? 0).toLocaleString(), desc: 'Case openings all time' },
                    { label: 'Total Battles', value: (analytics.summary?.totalBattles ?? 0).toLocaleString(), desc: 'PvP and bot battles' },
                    { label: 'Total Deposits', value: analytics.summary?.totalDeposits ?? 0, desc: 'Deposit transactions' },
                    { label: 'Deposit Volume', value: `${Number(analytics.summary?.totalDepositVolume ?? 0).toFixed(2)} ₮`, desc: 'Total USDT deposited' },
                    { label: 'Token Claims', value: analytics.summary?.totalClaims ?? 0, desc: 'Token claim transactions' },
                    { label: 'Unclaimed Tokens', value: `${analytics.summary?.inventoryActiveCount ?? 0} items`, desc: `Value: ${Number(analytics.summary?.inventoryActiveValue ?? 0).toFixed(2)} ₮` },
                    { label: 'Claimed Tokens', value: `${analytics.summary?.inventoryClaimedCount ?? 0} items`, desc: `Value: ${Number(analytics.summary?.inventoryClaimedValue ?? 0).toFixed(2)} ₮` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">{item.label}</div>
                      <div className="text-lg font-bold text-white">{item.value}</div>
                      {item.desc && <div className="text-[10px] text-gray-600 mt-0.5">{item.desc}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Growth — Last 30 Days</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'New Users Today', value: analytics.growth?.newUsersToday ?? 0, accent: true },
                    { label: 'New Users (7d)', value: analytics.growth?.newUsers7d ?? 0 },
                    { label: 'New Users (30d)', value: analytics.growth?.newUsers30d ?? 0 },
                    { label: 'Active Users (30d)', value: analytics.growth?.activeUsers30d ?? 0, accent: true, desc: 'Users who opened at least 1 case' },
                    { label: 'Openings (30d)', value: analytics.growth?.openings30d ?? 0 },
                    { label: 'Battles (30d)', value: analytics.growth?.battles30d ?? 0 },
                    { label: 'Deposits (30d)', value: `${Number(analytics.growth?.deposit30dVolume ?? 0).toFixed(2)} ₮` },
                    { label: 'Reward Claims (30d)', value: analytics.growth?.rewardClaims30d ?? 0, desc: 'CFP reward tasks completed' },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-xl border p-3 ${(item as any).accent ? 'bg-web3-accent/5 border-web3-accent/20' : 'bg-black/20 border-white/[0.06]'}`}>
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">{item.label}</div>
                      <div className={`text-lg font-bold ${(item as any).accent ? 'text-web3-accent' : 'text-white'}`}>{item.value}</div>
                      {(item as any).desc && <div className="text-[10px] text-gray-600 mt-0.5">{(item as any).desc}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {(() => {
                const charts = analytics.charts || {};
                const chartConfigs: { key: string; label: string; color: string; isCurrency?: boolean }[] = [
                  { key: 'dailyNewUsers', label: 'New Registrations', color: '#6366f1' },
                  { key: 'dailyActiveUsers', label: 'Daily Active Users', color: '#22c55e' },
                  { key: 'dailyOpenings', label: 'Case Openings', color: '#f59e0b' },
                  { key: 'dailyBattles', label: 'Battles', color: '#ef4444' },
                  { key: 'dailyDeposits', label: 'Deposit Volume (₮)', color: '#06b6d4', isCurrency: true },
                ];
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {chartConfigs.map(({ key, label, color, isCurrency }) => {
                      const rows: { date: string; value: number }[] = charts[key] || [];
                      if (!rows.length) return null;
                      const maxVal = Math.max(...rows.map((r) => r.value), 1);
                      const total = rows.reduce((s, r) => s + r.value, 0);
                      return (
                        <div key={key} className="bg-black/30 border border-white/[0.08] rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
                            <div className="text-xs text-gray-600">
                              Total: {isCurrency ? `${total.toFixed(2)} ₮` : total.toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-end gap-[2px] h-32">
                            {rows.map((r) => {
                              const pct = (r.value / maxVal) * 100;
                              return (
                                <div key={r.date} className="flex-1 group relative flex flex-col justify-end h-full">
                                  <div
                                    className="rounded-t-sm min-h-[2px] transition-all hover:opacity-80"
                                    style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                                  />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black/90 border border-white/10 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap z-10">
                                    {r.date}: {isCurrency ? `${r.value.toFixed(2)} ₮` : r.value}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between mt-1 text-[9px] text-gray-600">
                            <span>{rows[0]?.date?.slice(5)}</span>
                            <span>{rows[rows.length - 1]?.date?.slice(5)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'promo' && (
            <div className="space-y-4">
              <div className="text-xs text-gray-500 mb-4">When a user activates a promo code, the specified amount is transferred from your main admin wallet balance to their account. Make sure your admin balance has enough funds.</div>
              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-5 space-y-4">
                <div className="text-sm font-bold text-white mb-1">New Promo Code</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Promo Code</label>
                    <input
                      value={newPromo.code}
                      onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. WELCOME50"
                      className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 font-mono uppercase placeholder-gray-600"
                    />
                    <div className="text-[10px] text-gray-600">The code users will enter to activate. Auto-capitalized.</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Reward Amount (₮)</label>
                    <input
                      value={newPromo.amount}
                      onChange={(e) => setNewPromo((p) => ({ ...p, amount: e.target.value }))}
                      placeholder="e.g. 5.00"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600"
                    />
                    <div className="text-[10px] text-gray-600">How much ₮ each user receives when they activate this code.</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Total Activations</label>
                    <input
                      value={newPromo.maxUses}
                      onChange={(e) => setNewPromo((p) => ({ ...p, maxUses: e.target.value }))}
                      placeholder="e.g. 100"
                      type="number"
                      min="1"
                      className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600"
                    />
                    <div className="text-[10px] text-gray-600">Max number of times this code can be used across all users.</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-gray-400 font-medium">Limit Per User</label>
                    <input
                      value={newPromo.usesPerUser}
                      onChange={(e) => setNewPromo((p) => ({ ...p, usesPerUser: e.target.value }))}
                      placeholder="e.g. 1"
                      type="number"
                      min="1"
                      className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-gray-300 placeholder-gray-600"
                    />
                    <div className="text-[10px] text-gray-600">How many times a single user can use this code. Usually 1.</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                          <button
                    disabled={!newPromo.code.trim() || !Number(newPromo.amount) || !Number(newPromo.maxUses) || !Number(newPromo.usesPerUser) || saving !== null}
                            onClick={async () => {
                      setSaving('new-promo');
                      try {
                        await api.createAdminPromoCode({
                          code: newPromo.code.trim(),
                          amount: Number(newPromo.amount),
                          maxUses: Number(newPromo.maxUses),
                          usesPerUser: Number(newPromo.usesPerUser),
                        });
                        setNewPromo({ code: '', amount: '', maxUses: '', usesPerUser: '' });
                              await load();
                      } catch (err: any) {
                        window.alert(err?.message || 'Failed');
                      } finally {
                              setSaving(null);
                      }
                            }}
                    className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-web3-accent to-web3-success text-black disabled:opacity-40 transition"
                          >
                    {saving === 'new-promo' ? 'Creating...' : 'Create Promo Code'}
                          </button>
                  <span className="text-[10px] text-gray-600">All fields are required</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">All Promo Codes</div>
                <div className="hidden md:grid grid-cols-8 gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                  <div>Code</div>
                  <div>Amount</div>
                  <div>Used / Max</div>
                  <div>Per User</div>
                  <div>Funder</div>
                  <div>Status</div>
                  <div>Created</div>
                  <div></div>
                </div>
                {((data as any)?.promos || []).length === 0 && (
                  <div className="text-sm text-gray-500 py-4 text-center">No promo codes yet.</div>
                )}
                {((data as any)?.promos || []).map((promo: any) => (
                  <div key={promo.id} className="grid grid-cols-1 md:grid-cols-8 gap-3 items-center bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-gray-400">
                    <div className="font-mono font-bold text-white">{promo.code}</div>
                    <div>{promo.amount} ₮</div>
                    <div>{promo._count?.activations ?? promo.currentUses} / {promo.maxUses}</div>
                    <div>{promo.usesPerUser}</div>
                    <div className="truncate">{promo.fundingUser?.username || '-'}</div>
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${promo.isActive ? 'bg-web3-success/20 text-web3-success' : 'bg-gray-500/20 text-gray-400'}`}>
                        {promo.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div>{formatDate(promo.createdAt)}</div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          setSaving(promo.id);
                          try {
                            await api.updateAdminPromoCode(promo.id, { isActive: !promo.isActive });
                            await load();
                          } finally { setSaving(null); }
                        }}
                        disabled={saving === promo.id}
                        className={`text-[10px] px-2 py-1 rounded-lg border ${promo.isActive ? 'border-yellow-500/30 text-yellow-400' : 'border-web3-success/30 text-web3-success'}`}
                      >
                        {promo.isActive ? 'Disable' : 'Enable'}
                      </button>
                        </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Recent Activations</div>
                {((data as any)?.activations || []).length === 0 && (
                  <div className="text-xs text-gray-600">No activations yet.</div>
                )}
                {((data as any)?.activations || []).map((act: any) => (
                  <div key={act.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.06] bg-black/15">
                    <div>
                      <div className="text-[11px] text-white">
                        {act.user?.username || 'Unknown'} — <span className="font-mono text-web3-accent">{act.promo?.code}</span>
                    </div>
                      <div className="text-[10px] text-gray-600">{new Date(act.activatedAt).toLocaleString()}</div>
                  </div>
                    <span className="text-[11px] font-mono text-web3-success font-bold">+{act.amount} ₮</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'mailing' && (
            <div className="space-y-6 max-w-2xl">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white">Email Mailing</h2>
                <p className="text-xs text-gray-400">Paste email addresses (one per line or comma-separated). Sends in batches of 50.</p>
            </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">Subject</label>
                  <input
                    type="text"
                    value={mailingSubject}
                    onChange={(e) => setMailingSubject(e.target.value)}
                    disabled={mailingRunning}
                    placeholder="e.g. Big update from CaseFun 🎉"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-web3-accent/50 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">Message Text</label>
                  <textarea
                    value={mailingText}
                    onChange={(e) => setMailingText(e.target.value)}
                    disabled={mailingRunning}
                    rows={6}
                    placeholder="Write your message here..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-web3-accent/50 disabled:opacity-50 resize-y"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-400 mb-1">
                    Recipients
                    {mailingEmails.trim() && (
                      <span className="ml-2 normal-case text-web3-accent">
                        {mailingEmails.split(/[\n,]+/).map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).length} valid
                      </span>
                    )}
                  </label>
                  <textarea
                    value={mailingEmails}
                    onChange={(e) => setMailingEmails(e.target.value)}
                    disabled={mailingRunning}
                    rows={8}
                    placeholder={"user1@gmail.com\nuser2@gmail.com\nuser3@example.com"}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-web3-accent/50 disabled:opacity-50 resize-y font-mono text-xs"
                  />
                </div>

                {mailingError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                    {mailingError}
                  </div>
                )}

                {mailingProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Sending... {mailingProgress.done} / {mailingProgress.total} emails</span>
                      <span>{Math.round((mailingProgress.done / mailingProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-web3-accent to-web3-success rounded-full transition-all duration-300"
                        style={{ width: `${(mailingProgress.done / mailingProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {mailingResult && !mailingRunning && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-400 space-y-1">
                    <div className="font-bold">✅ Done!</div>
                    <div>Sent: <span className="text-white">{mailingResult.sent}</span></div>
                    {mailingResult.failed > 0 && <div className="text-yellow-400">Failed: {mailingResult.failed}</div>}
                  </div>
                )}

                <button
                  disabled={mailingRunning || !mailingSubject.trim() || !mailingText.trim() || !mailingEmails.trim()}
                  onClick={async () => {
                    setMailingError(null);
                    setMailingResult(null);
                    setMailingProgress(null);

                    const allEmails = mailingEmails
                      .split(/[\n,]+/)
                      .map(e => e.trim().toLowerCase())
                      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

                    const unique = [...new Set(allEmails)];
                    if (unique.length === 0) {
                      setMailingError('No valid email addresses found.');
                      return;
                    }

                    const BATCH = 50;
                    const batches: string[][] = [];
                    for (let i = 0; i < unique.length; i += BATCH) {
                      batches.push(unique.slice(i, i + BATCH));
                    }

                    setMailingRunning(true);
                    setMailingProgress({ done: 0, total: unique.length });

                    let totalSent = 0;
                    let totalFailed = 0;

                    for (const batch of batches) {
                      try {
                        const res = await api.sendMailingBatch({
                          emails: batch,
                          subject: mailingSubject.trim(),
                          text: mailingText.trim(),
                        });
                        totalSent += res.data?.sent ?? batch.length;
                        totalFailed += batch.length - (res.data?.sent ?? batch.length);
                      } catch {
                        totalFailed += batch.length;
                      }
                      setMailingProgress(prev => prev ? { ...prev, done: Math.min(prev.done + batch.length, unique.length) } : null);
                    }

                    setMailingRunning(false);
                    setMailingProgress(null);
                    setMailingResult({ sent: totalSent, failed: totalFailed });
                  }}
                  className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all bg-gradient-to-r from-web3-accent to-web3-success text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {mailingRunning ? 'Sending...' : 'Send Emails'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

type UserDetailTab =
  | 'inventory'
  | 'burnt'
  | 'deposits'
  | 'claims'
  | 'openings'
  | 'transactions'
  | 'battles'
  | 'feedback'
  | 'rewards';

const UserDetail: React.FC<{
  userId: string;
  isBootstrapAdmin: boolean;
  onUserDeleted: () => void;
}> = ({ userId, isBootstrapAdmin, onUserDeleted }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<UserDetailTab>('inventory');
  const [balanceEdit, setBalanceEdit] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const refreshed = await api.getAdminUserDetail(userId);
    setDetail(refreshed.data);
    if (refreshed.data?.user?.balance !== undefined) {
      setBalanceEdit(String(refreshed.data.user.balance));
    }
  };

  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        await reload();
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

  const u = detail.user;
  const refIn = detail.referralInsight;
  const sum = detail.summary;
  const isImmutableBootstrap =
    String(u.walletAddress || '').toLowerCase() === IMMUTABLE_ADMIN_WALLET.toLowerCase();

  const tabButtons: { key: UserDetailTab; label: string }[] = [
    { key: 'inventory', label: `Items (${u.inventory?.length ?? 0})` },
    { key: 'burnt', label: `Burnt (${detail.burntItems?.length ?? 0})` },
    { key: 'deposits', label: `Deposits (${detail.deposits?.length ?? 0})` },
    { key: 'claims', label: `Claims (${detail.claims?.length ?? 0})` },
    { key: 'openings', label: `Opens (${u.openings?.length ?? 0})` },
    { key: 'transactions', label: `Ledger (${u.transactions?.length ?? 0})` },
    { key: 'battles', label: `Battles (${u.battles?.length ?? 0})` },
    { key: 'feedback', label: `Feedback (${detail.feedbacks?.length ?? 0})` },
    { key: 'rewards', label: `Rewards (${detail.rewardClaims?.length ?? 0})` },
  ];

  return (
    <div className="space-y-3 text-xs text-gray-400">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-gray-500 uppercase tracking-widest text-[10px]">Account</div>
          <div className="font-bold text-white truncate">{u.username}</div>
          <div className="text-[10px] text-gray-500 font-mono break-all">{u.id}</div>
          <div className="text-[10px] text-gray-500 break-all mt-0.5">{u.walletAddress}</div>
          <div className="text-[10px] mt-1">
            Role <span className="text-gray-300">{u.role}</span> · Created {formatDate(u.createdAt)}
          </div>
          <div className="text-[10px]">
            Wallet linked: {u.hasLinkedWallet ? 'yes' : 'no'}
            {u.walletLinkedAt ? ` · ${formatDate(u.walletLinkedAt)}` : ''}
          </div>
          <div className="text-[10px]">Balance {u.balance} ₮ · <span className="text-web3-accent">{u.rewardPoints ?? 0} CFP</span> · <span className="text-gray-400">Lvl {getLevelInfo(u.rewardPoints ?? 0).level}</span></div>
          {u.isBanned && <div className="text-[10px] text-red-400">Banned: {u.banReason || '—'}</div>}
        </div>
        {isBootstrapAdmin && (
          <button
            type="button"
            disabled={deleting || isImmutableBootstrap}
            onClick={async () => {
              if (isImmutableBootstrap) return;
              if (
                !window.confirm(
                  `Permanently delete user "${u.username}"? Cases they created will be reassigned to the main admin. This cannot be undone.`
                )
              ) {
                return;
              }
              setDeleting(true);
              try {
                await api.deleteAdminUser(userId);
                onUserDeleted();
              } catch (err: any) {
                window.alert(err?.message || 'Delete failed');
              } finally {
                setDeleting(false);
              }
            }}
            className="shrink-0 px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-widest bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 disabled:opacity-50"
          >
            {isImmutableBootstrap ? 'Immutable account' : deleting ? 'Deleting…' : 'Delete user'}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-black/25 p-2 space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">Linked accounts</div>
        <div className="text-[11px]">
          <span className="text-gray-500">X / Twitter:</span>{' '}
          {u.twitterUsername ? (
            <span className="text-gray-200">
              @{u.twitterUsername}
              {u.twitterName ? ` (${u.twitterName})` : ''}
              {u.twitterLinkedAt ? ` · linked ${formatDate(u.twitterLinkedAt)}` : ''}
            </span>
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </div>
        <div className="text-[11px]">
          <span className="text-gray-500">Telegram:</span>{' '}
          {u.telegramId ? (
            <span className="text-gray-200">
              {u.telegramUsername ? `@${u.telegramUsername}` : u.telegramFirstName || u.telegramId}
              {u.telegramLinkedAt ? ` · linked ${formatDate(u.telegramLinkedAt)}` : ''}
            </span>
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </div>
      </div>

      {refIn && (
        <div className="rounded-lg border border-white/[0.08] bg-black/25 p-2 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Referrals</div>
          <div className="text-[11px]">
            Their code: <span className="font-mono text-web3-accent">{refIn.referralCode || '—'}</span>
          </div>
          <div className="text-[11px]">
            Confirmed invites (first deposit confirmed):{' '}
            <span className="text-white font-bold">{refIn.referralConfirmedCount ?? 0}</span>
          </div>
          <div className="text-[11px]">
            Signups with this link: <span className="text-gray-200">{refIn.invitedUserCount ?? 0}</span> total,{' '}
            <span className="text-gray-200">{refIn.invitedConfirmedCount ?? 0}</span> funded (first deposit)
          </div>
          <div className="text-[11px]">
            Referred by:{' '}
            {refIn.referredBy ? (
              <span className="text-gray-200">
                {refIn.referredBy.username} <span className="text-gray-500 font-mono text-[10px]">{refIn.referredBy.id}</span>
              </span>
            ) : (
              <span className="text-gray-600">—</span>
            )}
            {u.referralConfirmedAt ? ` · confirmed ${formatDate(u.referralConfirmedAt)}` : ''}
          </div>
        </div>
      )}

      {detail.createdCases?.length > 0 && (
        <div className="rounded-lg border border-white/[0.08] bg-black/25 p-2">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Cases created ({detail.createdCases.length})
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {detail.createdCases.map((c: any) => (
              <div key={c.id} className="text-[10px] flex justify-between gap-2 border-b border-white/[0.06] pb-1">
                <span className="truncate text-gray-300">{c.name}</span>
                <span className="text-gray-500 shrink-0">{c.isActive ? 'active' : 'off'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sum && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Tx deposits</div>
            <div className="text-xs text-white">{Number(sum.deposits).toFixed(2)} ₮</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">On-chain (sum)</div>
            <div className="text-xs text-white">{Number(sum.onChainDepositUsdtTotal ?? 0).toFixed(2)} ₮</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Spent (ledger)</div>
            <div className="text-xs">{Number(sum.spent).toFixed(2)} ₮</div>
          </div>
          <div className="bg-black/30 border border-white/[0.08] rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Net</div>
            <div className="text-xs">{Number(sum.net).toFixed(2)} ₮</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 items-center">
        <input
          value={balanceEdit}
          disabled={isImmutableBootstrap}
          onChange={(e) => setBalanceEdit(e.target.value)}
          className="col-span-2 bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-xs"
        />
        <button
          onClick={async () => {
            if (isImmutableBootstrap) return;
            setSaving(true);
            try {
            await api.updateAdminUserBalance(userId, Number(balanceEdit));
              await reload();
            } finally {
            setSaving(false);
            }
          }}
          disabled={saving || isImmutableBootstrap}
          className="px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest bg-web3-accent/20 text-web3-accent border border-web3-accent/40"
        >
          {isImmutableBootstrap ? 'Locked' : saving ? 'Saving...' : 'Set balance'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabButtons.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-2 py-1 rounded-md text-[9px] uppercase tracking-wider border leading-tight ${
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
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(u.inventory ?? []).map((item: any) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-0.5 bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]"
            >
              <div className="truncate text-gray-200">{item.name}</div>
              <div className="flex flex-wrap gap-x-2 text-gray-500">
                <span>
                  {item.value} {item.currency}
                </span>
                <span>{item.rarity}</span>
                <span>{item.status}</span>
                {item.caseId && <span className="font-mono truncate">case {item.caseId}</span>}
              </div>
              <div className="text-gray-600">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))}
          {!u.inventory?.length && <div className="text-gray-600 text-[10px]">No items.</div>}
        </div>
      )}

      {tab === 'burnt' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(detail.burntItems ?? []).map((item: any) => (
            <div key={item.id} className="grid grid-cols-1 gap-0.5 bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]">
              <div className="truncate text-gray-200">{item.name}</div>
              <div>
                {item.value} {item.currency} · {item.rarity}
              </div>
              <div className="text-gray-600">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))}
          {!detail.burntItems?.length && <div className="text-gray-600 text-[10px]">None.</div>}
        </div>
      )}

      {tab === 'deposits' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(detail.deposits ?? []).map((d: any) => (
            <div key={d.id} className="bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px] space-y-0.5">
              <div className="font-mono text-gray-300 break-all">{d.txHash}</div>
              <div>
                {Number(d.amountUsdt).toFixed(2)} ₮ · {Number(d.amountEth).toFixed(6)} ETH · ch {d.chainId}
              </div>
              <div className="text-gray-600">{formatDate(d.createdAt)}</div>
            </div>
          ))}
          {!detail.deposits?.length && <div className="text-gray-600 text-[10px]">No on-chain deposits.</div>}
        </div>
      )}

      {tab === 'claims' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(detail.claims ?? []).map((cl: any) => (
            <div key={cl.id} className="bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]">
              <div className="text-gray-200">{cl.case?.name || cl.caseId}</div>
              <div>
                {cl.amount} · {cl.status}
                {cl.txHash && <span className="block font-mono text-gray-500 break-all">{cl.txHash}</span>}
              </div>
              <div className="text-gray-600">{formatDate(cl.createdAt)}</div>
            </div>
          ))}
          {!detail.claims?.length && <div className="text-gray-600 text-[10px]">No claims.</div>}
        </div>
      )}

      {tab === 'openings' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(u.openings ?? []).map((op: any) => (
            <div key={op.id} className="bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]">
              <div className="text-gray-200">{op.case?.name || op.caseId}</div>
              <div>
                Won {op.wonValue} · drop {op.wonDropId}
              </div>
              <div className="text-gray-600">{formatDate(op.timestamp)}</div>
            </div>
          ))}
          {!u.openings?.length && <div className="text-gray-600 text-[10px]">No case openings.</div>}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(u.transactions ?? []).map((tx: any) => (
            <div key={tx.id} className="bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]">
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-gray-200">{tx.type}</span>
                <span>
                  {tx.amount} {tx.currency}
                </span>
              </div>
              <div className="text-gray-600">{tx.status}</div>
              <div className="text-gray-600">{formatDate(tx.timestamp)}</div>
            </div>
          ))}
          {!u.transactions?.length && <div className="text-gray-600 text-[10px]">No transactions.</div>}
        </div>
      )}

      {tab === 'battles' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(u.battles ?? []).map((battle: any) => (
            <div key={battle.id} className="bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]">
              <div className="text-gray-200">{battle.result}</div>
              <div>
                Cost {battle.cost} ₮ · won value {battle.wonValue}
                {battle.opponentId && <span className="block text-gray-500">Opponent id {battle.opponentId}</span>}
              </div>
              <div className="text-gray-600">{formatDate(battle.timestamp)}</div>
            </div>
          ))}
          {!u.battles?.length && <div className="text-gray-600 text-[10px]">No battles.</div>}
        </div>
      )}

      {tab === 'feedback' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {(detail.feedbacks ?? []).map((fb: any) => (
            <div key={fb.id} className="bg-black/30 border border-white/[0.08] rounded-lg p-2 text-[10px]">
              <div className="text-gray-200">
                {fb.topic} · {fb.status}
              </div>
              <div className="text-gray-500 break-words">{fb.message}</div>
              <div className="text-gray-600">{formatDate(fb.createdAt)}</div>
            </div>
          ))}
          {!detail.feedbacks?.length && <div className="text-gray-600 text-[10px]">No feedback.</div>}
        </div>
      )}

      {tab === 'rewards' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          <div className="text-[10px] text-gray-500 mb-1">Total: <span className="text-web3-accent font-bold">{u.rewardPoints ?? 0} CFP</span> · Level <span className="text-white font-bold">{getLevelInfo(u.rewardPoints ?? 0).level}</span></div>
          {(detail.rewardClaims ?? []).map((rc: any) => (
            <div key={rc.id} className="flex items-center justify-between bg-black/30 border border-white/[0.08] rounded-lg p-2">
              <div>
                <div className="text-[11px] text-white">{rc.task?.title || 'Deleted task'}</div>
                <div className="text-[10px] text-gray-500">
                  {rc.task?.category === 'CASEFUN' ? 'CaseFun' : 'Social'} · {formatDate(rc.claimedAt)}
                </div>
              </div>
              <span className="text-[10px] font-mono text-web3-accent font-bold">+{rc.reward} CFP</span>
            </div>
          ))}
          {!detail.rewardClaims?.length && <div className="text-gray-600 text-[10px]">No reward claims.</div>}
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
