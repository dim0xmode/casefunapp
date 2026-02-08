import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  message,
  className = '',
}) => (
  <div className={['flex flex-col items-center justify-center h-full text-gray-600', className].join(' ')}>
    {icon ? <div className="mb-4 opacity-20">{icon}</div> : null}
    <p className="text-sm font-mono uppercase">{message}</p>
  </div>
);
