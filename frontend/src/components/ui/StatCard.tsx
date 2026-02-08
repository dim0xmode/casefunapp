import React from 'react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  className = '',
  valueClassName = 'text-2xl font-black text-white',
}) => (
  <div className={['bg-black/25 backdrop-blur-xl p-4 rounded-xl border border-white/[0.12]', className].join(' ')}>
    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{label}</div>
    <div className={valueClassName}>{value}</div>
  </div>
);
