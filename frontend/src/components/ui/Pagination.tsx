import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  className = '',
}) => {
  const safeTotal = Math.max(1, totalPages);
  const prevDisabled = currentPage <= 0;
  const nextDisabled = currentPage >= safeTotal - 1;

  return (
    <div className={['flex items-center justify-center gap-3', className].join(' ')}>
      <span className="text-[10px] uppercase tracking-widest text-gray-500">
        Page {currentPage + 1} / {safeTotal}
      </span>
      <button
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={prevDisabled}
        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Prev
      </button>
      <button
        onClick={() => onPageChange(Math.min(safeTotal - 1, currentPage + 1))}
        disabled={nextDisabled}
        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs uppercase tracking-widest text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
};
