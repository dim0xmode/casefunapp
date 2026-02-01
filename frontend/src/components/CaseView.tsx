import React, { useState } from 'react';
import { Case, Item } from '../types';
import { CaseListView } from './CaseListView';
import { CaseOpeningView } from './CaseOpeningView';

interface CaseViewProps {
  cases: Case[];
  onOpenCase: (caseId: string, count: number) => Promise<Item[]>;
  balance: number;
  onOpenTopUp: () => void;
  userName: string;
  isAuthenticated: boolean;
  onOpenWalletConnect: () => void;
}

export const CaseView: React.FC<CaseViewProps> = ({ cases, onOpenCase, balance, onOpenTopUp, userName, isAuthenticated, onOpenWalletConnect }) => {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  const handleSelectCase = (caseData: Case) => {
    setSelectedCase(caseData);
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
        />
      ) : (
        <CaseListView cases={cases} onSelectCase={handleSelectCase} userName={userName} />
      )}
    </>
  );
};
