export default function RecordingsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar skeleton */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-24 animate-pulse rounded-xl bg-zinc-800 light:bg-zinc-200" />
        <div className="h-10 w-28 animate-pulse rounded-xl bg-zinc-800 light:bg-zinc-200" />
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-zinc-800 light:bg-zinc-200" />
      </div>

      {/* Loading spinner */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-8 light:border-zinc-200 light:bg-white">
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />
          <p className="text-sm text-zinc-400 light:text-zinc-500">Loading recordings...</p>
        </div>
      </section>
    </div>
  );
}
