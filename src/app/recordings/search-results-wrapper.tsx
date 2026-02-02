"use client";

import { useEffect, type ReactNode } from "react";
import { useSearch } from "./search-context";

interface SearchResultsWrapperProps {
  children: ReactNode;
}

export function SearchResultsWrapper({ children }: SearchResultsWrapperProps) {
  const { isSearching, stopSearching } = useSearch();

  // Stop the searching state when this component mounts (server render completed)
  useEffect(() => {
    stopSearching();
  }, [stopSearching]);

  if (isSearching) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-8 light:border-zinc-200 light:bg-white">
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />
          <p className="text-sm text-zinc-400 light:text-zinc-500">Searching...</p>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
