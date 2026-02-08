import React from 'react';

interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  className = '',
}) => (
  <div className={['flex items-center gap-2 border-b border-white/5 pb-1', className].join(' ')}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] rounded-t-lg border-t border-x ${
          activeId === tab.id
            ? 'bg-web3-card text-white border-gray-700'
            : 'text-gray-400 hover:text-gray-200 border-transparent'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
