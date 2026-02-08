import React, { useState, useMemo } from 'react';
import { Case } from '../types';
import { SearchInput } from './ui/SearchInput';
import { CaseIcon } from './CaseIcon';

interface CaseListViewProps {
  cases: Case[];
  onSelectCase: (caseData: Case, mode?: 'open' | 'stats') => void;
  userName: string;
  viewMode: 'active' | 'inactive';
  onViewModeChange: (mode: 'active' | 'inactive') => void;
}

export const CaseListView: React.FC<CaseListViewProps> = ({
  cases,
  onSelectCase,
  userName,
  viewMode,
  onViewModeChange,
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  const sanitizeSearchInput = (value: string) => {
    return value.replace(/[^a-zA-Z0-9$ ]/g, '');
  };

  const handleSearchChange = (value: string) => {
    const sanitized = sanitizeSearchInput(value);
    setSearchFilter(sanitized);
  };

  const isCaseExpired = (caseData: Case) => {
    if (!caseData.openDurationHours || !caseData.createdAt) return false;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    return endAt <= Date.now();
  };

  const { ownCases, allCases } = useMemo(() => {
    const searchTrimmed = searchFilter.trim();
    const searchLower = searchTrimmed.toLowerCase();
    const priceQuery = Number(searchFilter);
    const hasPriceFilter = Number.isFinite(priceQuery) && priceQuery > 0;
    const hasTokenFilter = searchTrimmed.startsWith('$') && searchTrimmed.length > 1;
    const tokenSearch = hasTokenFilter ? searchTrimmed.slice(1).toLowerCase() : '';
    const hasNameFilter = searchLower.length > 0 && !hasPriceFilter && !hasTokenFilter;
    
    let base = cases.filter((caseData) =>
      viewMode === 'inactive' ? isCaseExpired(caseData) : !isCaseExpired(caseData)
    );
    
    if (hasPriceFilter) {
      base = base.filter(c => c.price <= priceQuery);
    } else if (hasTokenFilter) {
      base = base.filter(c => c.currency.toLowerCase().includes(tokenSearch) || c.tokenTicker?.toLowerCase().includes(tokenSearch));
    } else if (hasNameFilter) {
      base = base.filter(c => c.name.toLowerCase().includes(searchLower));
    }
    
    const sorted = base.sort((a, b) => b.price - a.price);
    const own = sorted.filter(c => c.creatorName === userName);
    return { ownCases: own, allCases: sorted };
  }, [cases, searchFilter, userName, viewMode]);

  const getRemainingTime = (caseData: Case) => {
    if (!caseData.openDurationHours || !caseData.createdAt) return null;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    const msLeft = endAt - Date.now();
    if (msLeft <= 0) return 'Expired';
    const hours = Math.floor(msLeft / (60 * 60 * 1000));
    const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  const renderCaseCard = (caseData: Case, inactive: boolean) => (
    <div
      key={caseData.id}
      onClick={() => onSelectCase(caseData, inactive ? 'stats' : 'open')}
      className="group relative bg-web3-card/50 backdrop-blur-xl p-4 rounded-2xl border border-white/[0.05] hover:border-web3-accent/50 transition-all duration-300 overflow-hidden cursor-pointer hover:scale-105 aspect-square flex flex-col"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-web3-accent/[0.02] to-web3-purple/[0.02] group-hover:bg-gradient-to-br group-hover:from-web3-accent/10 group-hover:to-web3-purple/10 transition-all duration-300"></div>

      <div className="relative z-10 flex flex-col h-full gap-0.5 px-2 pt-1 pb-1">
        {caseData.openDurationHours && caseData.createdAt && (
          <div className="text-[9px] uppercase tracking-wider text-gray-500 text-center leading-none">
            {getRemainingTime(caseData)}
          </div>
        )}
        <div className="text-[10px] uppercase tracking-wider text-gray-500 text-center">
          {caseData.creatorName || 'Creator'}
        </div>
        <div className="flex items-center justify-center">
          <div className="w-24 h-24 bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 rounded-xl border-2 border-web3-accent/50 shadow-[0_0_30px_rgba(102,252,241,0.2)] backdrop-blur-sm flex items-center justify-center text-5xl">
            <CaseIcon
              value={caseData.image || caseData.possibleDrops[0]?.image || ''}
              size="lg"
              meta={caseData.imageMeta}
            />
          </div>
        </div>

        <div className="w-full text-center space-y-1">
          <h3 className="text-xs font-black truncate">{caseData.name}</h3>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            ${caseData.tokenTicker || caseData.currency}
          </div>
          <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-web3-accent/20 to-web3-purple/20 border border-web3-accent/30 flex items-center justify-between gap-1.5">
            <span className="font-black text-xs text-white">{caseData.price} ₮</span>
            <span className="font-bold text-[10px] text-web3-success">RTU {caseData.rtu}%</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen text-white px-6 py-12 relative">
      {/* Cases Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center mb-10">
          <div className="flex items-center gap-2 rounded-full bg-black/30 border border-white/[0.08] p-1 backdrop-blur-xl">
            <button
              onClick={() => onViewModeChange('active')}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-widest transition-all ${
                viewMode === 'active'
                  ? 'bg-gradient-to-r from-web3-accent to-web3-success text-black shadow-[0_0_20px_rgba(102,252,241,0.5)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Available
            </button>
            <button
              onClick={() => onViewModeChange('inactive')}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-widest transition-all ${
                viewMode === 'inactive'
                  ? 'bg-gradient-to-r from-web3-purple to-web3-accent text-black shadow-[0_0_20px_rgba(139,92,246,0.5)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Unavailable
            </button>
          </div>
        </div>
        {ownCases.length > 0 && (
          <div className="mb-8">
            {/* MY CASES Header - Centered */}
            <div className="mb-8 flex items-center justify-center">
              <div className="group text-2xl font-black tracking-tighter flex items-center gap-3 text-white cursor-pointer transition-all duration-300 hover:scale-105 select-none relative">
                {/* Soft glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-web3-accent/10 to-web3-purple/10 rounded-lg opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500"></div>
                <span className="relative">
                  MY<span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">CASES</span>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {ownCases.map((caseData) => renderCaseCard(caseData, viewMode === 'inactive'))}
            </div>
          </div>
        )}

        {/* COMMUNITY CASES Header and Filter - Same Row */}
        <div className="mb-8 flex items-center gap-4 relative">
          <div className="flex-1"></div>
          <div className="group text-2xl font-black tracking-tighter flex items-center gap-3 text-white cursor-pointer transition-all duration-300 hover:scale-105 select-none relative">
            {/* Soft glow */}
            <div className="absolute -inset-2 bg-gradient-to-r from-web3-accent/10 to-web3-purple/10 rounded-lg opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500"></div>
            <span className="relative">
              COMMUNITY<span className="text-transparent bg-clip-text bg-gradient-to-r from-web3-accent via-web3-success to-web3-purple animate-gradient bg-size-200">CASES</span>
            </span>
          </div>
          <div className="flex-1 flex justify-end">
            <SearchInput
              value={searchFilter}
              onChange={handleSearchChange}
              placeholder="Search by name, token ($DOGE) or max price (500)"
            />
          </div>
        </div>

        {allCases.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {allCases.map((caseData) => renderCaseCard(caseData, viewMode === 'inactive'))}
          </div>
        )}
      </div>
    </div>
  );
};
