import { useMemo, useState } from 'react';

export const usePagination = <T,>(items: T[], perPage: number) => {
  const [page, setPage] = useState(0);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((items?.length || 0) / perPage)),
    [items, perPage]
  );

  const pagedItems = useMemo(() => {
    const start = page * perPage;
    return items.slice(start, start + perPage);
  }, [items, page, perPage]);

  const safeSetPage = (nextPage: number) => {
    const safe = Math.min(Math.max(0, nextPage), totalPages - 1);
    setPage(safe);
  };

  return { page, setPage: safeSetPage, totalPages, pagedItems };
};
