"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SearchContextValue {
  isSearching: boolean;
  startSearching: () => void;
  stopSearching: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isSearching, setIsSearching] = useState(false);

  const startSearching = useCallback(() => setIsSearching(true), []);
  const stopSearching = useCallback(() => setIsSearching(false), []);

  return (
    <SearchContext.Provider value={{ isSearching, startSearching, stopSearching }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}
