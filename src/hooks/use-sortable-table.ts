import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export function useSortableTable<T>(data: T[] | undefined, defaultSort?: SortConfig) {
  const [sort, setSort] = useState<SortConfig>(defaultSort ?? { key: "", direction: null });

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: "", direction: null };
    });
  };

  const sorted = useMemo(() => {
    if (!data || !sort.key || !sort.direction) return data ?? [];
    return [...data].sort((a, b) => {
      const aVal = (a as any)[sort.key];
      const bVal = (b as any)[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === "string" ? aVal.localeCompare(bVal) : Number(aVal) - Number(bVal);
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, sort]);

  return { sort, toggleSort, sorted };
}
