import React, { useState, useMemo } from 'react';
import { Case } from '../types';
import { SearchInput } from './ui/SearchInput';
import { ImageWithMeta } from './ui/ImageWithMeta';

interface CaseListViewProps {
  cases: Case[];
  onSelectCase: (caseData: Case, mode?: 'open' | 'stats') => void;
  userName: string;
  viewMode: 'active' | 'inactive';
  onViewModeChange: (mode: 'active' | 'inactive') => void;
  isTelegramMiniApp?: boolean;
}

export const CaseListView: React.FC<CaseListViewProps> = ({
  cases,
  onSelectCase,
  userName,
  viewMode,
  onViewModeChange,
  isTelegramMiniApp = false,
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

  const renderCaseCard = (caseData: Case, inactive: boolean) => {
    const logoValue = caseData.image || caseData.possibleDrops[0]?.image || '';
    const logoIsImage =
      logoValue.startsWith('http') || logoValue.startsWith('/') || logoValue.startsWith('data:');
    const remainingTime = getRemainingTime(caseData);

    if (isTelegramMiniApp) {
      return (
        <div
          key={caseData.id}
          onClick={() => onSelectCase(caseData, inactive ? 'stats' : 'open')}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-web3-card/40 transition-all duration-200 active:scale-[0.97] hover:border-web3-accent/40"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-web3-accent/[0.04] to-web3-purple/[0.04] group-hover:from-web3-accent/10 group-hover:to-web3-purple/10 transition-all duration-200" />
          <div className="relative z-10 flex flex-col items-center p-2.5 gap-1.5">
            <div className="text-[8px] uppercase tracking-wider text-gray-500 leading-none">
              {remainingTime || (inactive ? 'closed' : 'open')}
            </div>

            <div className="w-14 h-14 rounded-xl border border-web3-accent/30 bg-gradient-to-br from-web3-purple/25 to-web3-accent/25 flex items-center justify-center overflow-hidden shadow-[0_0_16px_rgba(102,252,241,0.1)]">
              {logoValue ? (
                logoIsImage ? (
                  <ImageWithMeta
                    src={logoValue}
                    meta={caseData.imageMeta}
                    className="w-full h-full"
                    imgClassName="w-full h-full"
                  />
                ) : (
                  <span className="text-2xl leading-none select-none">{logoValue}</span>
                )
              ) : (
                <span className="text-[8px] uppercase tracking-widest text-gray-500">Logo</span>
              )}
            </div>

            <div className="text-[11px] font-black text-white text-center leading-tight truncate w-full">
              {caseData.name}
            </div>

            <div className="flex items-center justify-between gap-2 w-full text-[10px] leading-none px-0.5">
              <span className="font-bold text-web3-accent">{caseData.price} ₮</span>
              <span className="font-bold text-web3-success">{caseData.rtu}%</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={caseData.id}
        onClick={() => onSelectCase(caseData, inactive ? 'stats' : 'open')}
        className="group relative bg-web3-card/50 backdrop-blur-xl rounded-2xl border border-white/[0.05] hover:border-web3-accent/50 transition-all duration-300 overflow-hidden cursor-pointer hover:-translate-y-1 aspect-square flex flex-col p-4 min-h-[220px]"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-web3-accent/[0.02] to-web3-purple/[0.02] group-hover:bg-gradient-to-br group-hover:from-web3-accent/10 group-hover:to-web3-purple/10 transition-all duration-300"></div>

        <div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto] gap-1 px-2 py-2">
          {caseData.openDurationHours && caseData.createdAt && (
            <div className="text-[9px] uppercase tracking-wider text-gray-500 text-center leading-none">
              {getRemainingTime(caseData)}
            </div>
          )}
          <div className="text-[10px] uppercase tracking-wider text-gray-500 text-center">
            {caseData.creatorName || 'Creator'}
          </div>
          <div className="flex items-center justify-center min-h-0">
            <div className="w-[42%] max-w-[88px] min-w-[44px] aspect-square bg-gradient-to-br from-web3-purple/30 to-web3-accent/30 rounded-xl border-2 border-web3-accent/50 shadow-[0_0_30px_rgba(102,252,241,0.2)] backdrop-blur-sm flex items-center justify-center overflow-hidden">
              {logoValue ? (
                logoIsImage ? (
                  <ImageWithMeta
                    src={logoValue}
                    meta={caseData.imageMeta}
                    className="w-full h-full"
                    imgClassName="w-full h-full"
                  />
                ) : (
                  <span className="text-[clamp(22px,3.2vw,36px)] leading-none select-none">
                    {logoValue}
                  </span>
                )
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-gray-500">Logo</span>
              )}
            </div>
          </div>

          <div className="w-full text-center space-y-1">
            <h3 className="text-xs font-black truncate">{caseData.name}</h3>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              ${caseData.tokenTicker || caseData.currency}
              {caseData.tokenPrice != null && caseData.tokenPrice > 0 && (
                <span className="text-web3-accent/70 ml-1">({caseData.tokenPrice} USDT)</span>
              )}
            </div>
            <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-web3-accent/20 to-web3-purple/20 border border-web3-accent/30 flex items-center justify-between gap-1.5">
              <span className="font-black text-xs text-white">{caseData.price} ₮</span>
              <span className="font-bold text-[10px] text-web3-success">RTU {caseData.rtu}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isTelegramMiniApp) {
    const normalizedUserName = String(userName || '').trim().toLowerCase();
    const isOwnCaseMini = (caseData: Case) => {
      const creator = String(caseData.creatorName || '').trim().toLowerCase();
      return creator.length > 0 && normalizedUserName.length > 0 && creator === normalizedUserName;
    };
    const ownCasesMini = allCases.filter((caseData) => isOwnCaseMini(caseData));
    const communityCases = allCases.filter((caseData) => !isOwnCaseMini(caseData));
    return (
      <div className="w-full text-white px-1 py-1">
        <div className="mb-3">
          <SearchInput
            value={searchFilter}
            onChange={handleSearchChange}
            placeholder="Search by name, token ($DOGE) or max price (500)"
            className="w-full"
          />
        </div>

        <div className="mb-3 flex items-center gap-1 rounded-xl border border-white/[0.1] bg-black/35 p-1">
          <button
            onClick={() => onViewModeChange('active')}
            className={`flex-1 px-3 py-2 rounded-lg text-[10px] uppercase tracking-widest transition ${
              viewMode === 'active'
                ? 'bg-web3-accent/20 border border-web3-accent/50 text-web3-accent'
                : 'text-gray-400'
            }`}
          >
            Available
          </button>
          <button
            onClick={() => onViewModeChange('inactive')}
            className={`flex-1 px-3 py-2 rounded-lg text-[10px] uppercase tracking-widest transition ${
              viewMode === 'inactive'
                ? 'bg-web3-purple/20 border border-web3-purple/45 text-web3-purple'
                : 'text-gray-400'
            }`}
          >
            Unavailable
          </button>
        </div>

        {ownCasesMini.length > 0 && viewMode === 'active' && (
          <div className="mb-4">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">My cases</div>
            <div className="grid grid-cols-3 gap-2">
              {ownCasesMini.map((caseData) => renderCaseCard(caseData, false))}
            </div>
          </div>
        )}

        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">
          {viewMode === 'inactive' ? 'Unavailable cases' : 'Community cases'}
        </div>
        {(viewMode === 'inactive' ? allCases : communityCases).length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-4 text-center text-[10px] uppercase tracking-widest text-gray-500">
            {viewMode === 'inactive' ? 'No unavailable cases' : 'No community cases'}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(viewMode === 'inactive' ? allCases : communityCases).map((caseData) =>
              renderCaseCard(caseData, viewMode === 'inactive')
            )}
          </div>
        )}
      </div>
    );
  }

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
