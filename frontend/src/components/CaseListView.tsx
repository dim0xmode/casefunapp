import React, { useState, useMemo } from 'react';
import { Case, Rarity } from '../types';

// Rarity colors mapping
const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]: '#9CA3AF',
  [Rarity.UNCOMMON]: '#10B981',
  [Rarity.RARE]: '#8B5CF6',
  [Rarity.LEGENDARY]: '#F59E0B',
  [Rarity.MYTHIC]: '#EF4444',
};

interface CaseListViewProps {
  cases: Case[];
  onSelectCase: (caseData: Case) => void;
  userName: string;
}

export const CaseListView: React.FC<CaseListViewProps> = ({ cases, onSelectCase, userName }) => {
  const [searchFilter, setSearchFilter] = useState('');

  const sanitizeSearchInput = (value: string) => {
    return value.replace(/[^a-zA-Z0-9$ ]/g, '');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeSearchInput(e.target.value);
    setSearchFilter(sanitized);
  };

  const { ownCases, allCases } = useMemo(() => {
    const searchTrimmed = searchFilter.trim();
    const searchLower = searchTrimmed.toLowerCase();
    const priceQuery = Number(searchFilter);
    const hasPriceFilter = Number.isFinite(priceQuery) && priceQuery > 0;
    const hasTokenFilter = searchTrimmed.startsWith('$') && searchTrimmed.length > 1;
    const tokenSearch = hasTokenFilter ? searchTrimmed.slice(1).toLowerCase() : '';
    const hasNameFilter = searchLower.length > 0 && !hasPriceFilter && !hasTokenFilter;
    
    let base = cases;
    
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
  }, [cases, searchFilter, userName]);
  const renderCaseIcon = (value: string) => {
    if (!value) return <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>;
    if (value.startsWith('http')) {
      return <img src={value} alt="token logo" className="w-14 h-14 object-contain" />;
    }
    return <span>{value}</span>;
  };

  const getRemainingTime = (caseData: Case) => {
    if (!caseData.openDurationHours || !caseData.createdAt) return null;
    const endAt = caseData.createdAt + caseData.openDurationHours * 60 * 60 * 1000;
    const msLeft = endAt - Date.now();
    if (msLeft <= 0) return 'Expired';
    const hours = Math.floor(msLeft / (60 * 60 * 1000));
    const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="w-full min-h-screen text-white px-6 py-12 relative">
      {/* Cases Grid */}
      <div className="max-w-7xl mx-auto">
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
              {ownCases.map((caseData) => (
                <div
                  key={caseData.id}
                  onClick={() => onSelectCase(caseData)}
                  className="group relative bg-web3-card/50 backdrop-blur-xl p-4 rounded-2xl border border-web3-accent/20 hover:border-web3-accent/50 transition-all duration-300 overflow-hidden cursor-pointer hover:scale-105 aspect-square flex flex-col"
                >
                  {/* Background glow */}
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
                    {/* 1. Case Visual (Эмодзи токена) */}
                    <div className="flex items-center justify-center">
                      <div className="w-24 h-24 bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 rounded-xl border-2 border-web3-accent/50 shadow-[0_0_30px_rgba(102,252,241,0.2)] backdrop-blur-sm flex items-center justify-center text-5xl">
                        {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                      </div>
                    </div>

                    {/* Case Info */}
                    <div className="w-full text-center space-y-1">
                      {/* 2. Название */}
                      <h3 className="text-xs font-black truncate">{caseData.name}</h3>
                      
                      {/* 3. Цена и RTU в одной плашке */}
                      <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-web3-accent/20 to-web3-purple/20 border border-web3-accent/30 flex items-center justify-between gap-1.5">
                        <span className="font-black text-xs text-white">{caseData.price} ₮</span>
                        <span className="font-bold text-[10px] text-web3-success">RTU {caseData.rtu}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
            <input
              value={searchFilter}
              onChange={handleSearchChange}
              placeholder="Search by name, token ($DOGE) or max price (500)"
              className="w-full md:w-[320px] px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-sm"
            />
          </div>
        </div>

        {allCases.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {allCases.map((caseData) => (
            <div
              key={caseData.id}
              onClick={() => onSelectCase(caseData)}
              className="group relative bg-web3-card/50 backdrop-blur-xl p-4 rounded-2xl border border-white/[0.05] hover:border-web3-accent/50 transition-all duration-300 overflow-hidden cursor-pointer hover:scale-105 aspect-square flex flex-col"
            >
              {/* Background glow */}
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
                {/* 1. Case Visual (Эмодзи токена) */}
                <div className="flex items-center justify-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 rounded-xl border-2 border-web3-accent/50 shadow-[0_0_30px_rgba(102,252,241,0.2)] backdrop-blur-sm flex items-center justify-center text-5xl">
                    {renderCaseIcon(caseData.image || caseData.possibleDrops[0]?.image || '')}
                  </div>
                </div>

                {/* Case Info */}
                <div className="w-full text-center space-y-1">
                  {/* 2. Название */}
                  <h3 className="text-xs font-black truncate">{caseData.name}</h3>
                  
                  {/* 3. Цена и RTU в одной плашке */}
                  <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-web3-accent/20 to-web3-purple/20 border border-web3-accent/30 flex items-center justify-between gap-1.5">
                    <span className="font-black text-xs text-white">{caseData.price} ₮</span>
                    <span className="font-bold text-[10px] text-web3-success">RTU {caseData.rtu}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        )}
      </div>
    </div>
  );
};
