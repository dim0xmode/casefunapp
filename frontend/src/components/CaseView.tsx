import React, { useState } from 'react';
import { Case, Item } from '../types';
import { CaseListView } from './CaseListView';
import { CaseOpeningView } from './CaseOpeningView';

interface CaseViewProps {
  cases: Case[];
  onOpenCase: (caseId: string, count: number) => Promise<Item[]>;
  balance: number;
  onOpenTopUp: (prefillUsdt?: number) => void;
  userName: string;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
  isAdmin: boolean;
}

export const CaseView: React.FC<CaseViewProps> = ({ cases, onOpenCase, balance, onOpenTopUp, userName, isAuthenticated, onOpenWalletConnect, isAdmin }) => {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedMode, setSelectedMode] = useState<'open' | 'stats'>('open');
  const [listViewMode, setListViewMode] = useState<'active' | 'inactive'>('active');

  const handleSelectCase = (caseData: Case, mode: 'open' | 'stats' = 'open') => {
    setSelectedCase(caseData);
    setSelectedMode(mode);
    setListViewMode(mode === 'stats' ? 'inactive' : 'active');
  };

  const handleBackToList = () => {
    setSelectedCase(null);
  };

  return (
    <>
      {selectedCase ? (
        <CaseOpeningView
          caseData={selectedCase}
          onBack={handleBackToList}
          onOpenCase={onOpenCase}
          balance={balance}
          onOpenTopUp={onOpenTopUp}
          isAuthenticated={isAuthenticated}
          onOpenWalletConnect={onOpenWalletConnect}
          isAdmin={isAdmin}
          viewMode={selectedMode}
        />
      ) : (
        <CaseListView
          cases={cases}
          onSelectCase={handleSelectCase}
          userName={userName}
          viewMode={listViewMode}
          onViewModeChange={setListViewMode}
        />
      )}
    </>
  );
};
