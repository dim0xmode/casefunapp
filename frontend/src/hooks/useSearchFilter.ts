import { useMemo } from 'react';

export const useSearchFilter = <T,>(
  items: T[],
  query: string,
  matcher: (item: T, queryLower: string) => boolean
) => {
  return useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) => matcher(item, trimmed));
  }, [items, query, matcher]);
};
