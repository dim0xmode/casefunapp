import React from 'react';

interface ItemGridProps {
  children: React.ReactNode;
  className?: string;
}

export const ItemGrid: React.FC<ItemGridProps> = ({ children, className = '' }) => (
  <div
    className={[
      'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4',
      className,
    ].join(' ')}
  >
    {children}
  </div>
);
