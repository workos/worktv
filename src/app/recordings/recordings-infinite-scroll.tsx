"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { RecordingPreview } from "./recording-preview";
import { LocalDateTime } from "@/components/local-datetime";

interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface RecordingWithMeta {
  id: string;
  title: string;
  custom_title: string | null;
  description: string | null;
  duration: number;
  source: string;
  created_at: string;
  speakers: Speaker[];
  hasTranscript: boolean;
  posterUrl: string | null;
  previewGifUrl: string | null;
}

interface RecordingsInfiniteScrollProps {
  initialRecordings: RecordingWithMeta[];
  initialHasMore: boolean;
  initialCursor: string | null;
  source: "zoom" | "gong" | "all";
}

export function RecordingsInfiniteScroll({
  initialRecordings,
  initialHasMore,
  initialCursor,
  source,
}: RecordingsInfiniteScrollProps) {
  const [recordings, setRecordings] = useState(initialRecordings);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // Reset state when props change (e.g., source filter changes)
  useEffect(() => {
    setRecordings(initialRecordings);
    setHasMore(initialHasMore);
    setCursor(initialCursor);
  }, [initialRecordings, initialHasMore, initialCursor]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !cursor) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        cursor,
        limit: "20",
      });
      const response = await fetch(`/api/recordings/paginated?${params}`);
      const data = await response.json();

      setRecordings((prev) => [...prev, ...data.recordings]);
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch (error) {
      console.error("Failed to load more recordings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, cursor, source]);

  // Keep loadMore ref updated
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current?.();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-2 light:border-zinc-200 light:bg-white">
      <div className="divide-y divide-white/10 light:divide-zinc-200">
        {recordings.map((recording) => (
          <Link
            key={recording.id}
            href={`/recordings/${encodeURIComponent(recording.id)}`}
            className="group flex gap-4 rounded-xl p-4 transition hover:bg-white/5 light:hover:bg-zinc-50"
          >
            <RecordingPreview
              posterUrl={recording.posterUrl}
              previewGifUrl={recording.previewGifUrl}
              title={recording.custom_title ?? recording.title}
              duration={recording.duration}
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-50 light:text-zinc-900">
                  {recording.custom_title ?? recording.title}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    recording.source === "gong"
                      ? "bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600"
                      : "bg-blue-500/20 text-blue-400 light:bg-blue-100 light:text-blue-600"
                  }`}
                >
                  {recording.source === "gong" ? "Gong" : "Zoom"}
                </span>
              </div>
              {recording.description && (
                <div className="mt-0.5 line-clamp-1 text-xs text-zinc-400 light:text-zinc-500">
                  {recording.description}
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                {recording.speakers.length > 0 && (
                  <>
                    <span>
                      {recording.speakers.map((s) => s.name).join(", ")}
                    </span>
                    <span className="text-zinc-600">·</span>
                  </>
                )}
                <LocalDateTime iso={recording.created_at} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-4">
        {isLoading && (
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          </div>
        )}
        {!hasMore && recordings.length > 0 && (
          <p className="text-center text-xs text-zinc-500">
            All {recordings.length} recordings loaded
          </p>
        )}
      </div>
    </section>
  );
}
