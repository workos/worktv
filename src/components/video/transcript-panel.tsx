"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import type { TranscriptSegment as TranscriptSegmentType } from "@/types/video";
import { findCurrentSegment } from "@/types/video";
import { TranscriptSegment } from "./transcript-segment";
import { MagnifyingGlassIcon, ChevronUpIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/20/solid";

interface TranscriptPanelProps {
  segments: TranscriptSegmentType[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
}: TranscriptPanelProps) {
  const segmentRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const currentSegment = findCurrentSegment(segments, currentTime);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Find all segments that match the search query
  const matchingSegments = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return segments.filter(seg => seg.text.toLowerCase().includes(query));
  }, [segments, searchQuery]);

  const matchingSegmentIds = useMemo(() =>
    new Set(matchingSegments.map(seg => seg.id)),
    [matchingSegments]
  );

  const setSegmentRef = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        segmentRefs.current.set(id, el);
      } else {
        segmentRefs.current.delete(id);
      }
    },
    []
  );

  // Reset match index when search query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  // Scroll to current match when navigating
  useEffect(() => {
    if (matchingSegments.length > 0 && searchQuery.trim()) {
      const matchedSegment = matchingSegments[currentMatchIndex];
      if (matchedSegment && segmentRefs.current.has(matchedSegment.id) && containerRef.current) {
        const element = segmentRefs.current.get(matchedSegment.id);
        const container = containerRef.current;
        if (!element) return;

        const elementTop = element.offsetTop;
        const elementHeight = element.offsetHeight;
        const containerHeight = container.clientHeight;
        const scrollTarget = elementTop - (containerHeight / 2) + (elementHeight / 2);

        container.scrollTo({
          top: Math.max(0, scrollTarget),
          behavior: "smooth",
        });
      }
    }
  }, [currentMatchIndex, matchingSegments, searchQuery]);

  // Auto-scroll to current segment when not searching
  useEffect(() => {
    if (searchQuery.trim()) return; // Don't auto-scroll during search

    if (currentSegment && segmentRefs.current.has(currentSegment.id) && containerRef.current) {
      const element = segmentRefs.current.get(currentSegment.id);
      const container = containerRef.current;
      if (!element) return;

      const elementTop = element.offsetTop;
      const elementHeight = element.offsetHeight;
      const containerHeight = container.clientHeight;
      const scrollTarget = elementTop - (containerHeight / 2) + (elementHeight / 2);

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: "smooth",
      });
    }
  }, [currentSegment, searchQuery]);

  const goToNextMatch = useCallback(() => {
    if (matchingSegments.length === 0) return;
    setCurrentMatchIndex(prev => (prev + 1) % matchingSegments.length);
  }, [matchingSegments.length]);

  const goToPrevMatch = useCallback(() => {
    if (matchingSegments.length === 0) return;
    setCurrentMatchIndex(prev => (prev - 1 + matchingSegments.length) % matchingSegments.length);
  }, [matchingSegments.length]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Keyboard shortcuts for search navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Enter to go to next match, Shift+Enter for previous
      if (e.key === "Enter" && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        if (e.shiftKey) {
          goToPrevMatch();
        } else {
          goToNextMatch();
        }
      }
      // Escape to clear search
      if (e.key === "Escape" && searchQuery) {
        e.preventDefault();
        clearSearch();
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, goToNextMatch, goToPrevMatch, clearSearch]);

  if (segments.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-center text-sm text-zinc-500">
        <div>
          <p>No transcript available</p>
          <p className="mt-1 text-xs text-zinc-600">
            Transcripts require Zoom transcription to be enabled for the meeting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search transcript..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 pl-9 pr-24 text-sm text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 light:border-zinc-300 light:bg-white light:text-zinc-800 light:placeholder-zinc-400"
        />
        {searchQuery && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <span className="text-xs text-zinc-500">
              {matchingSegments.length > 0
                ? `${currentMatchIndex + 1}/${matchingSegments.length}`
                : "0/0"}
            </span>
            <button
              onClick={goToPrevMatch}
              disabled={matchingSegments.length === 0}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 light:hover:bg-zinc-200 light:hover:text-zinc-700"
              title="Previous match (Shift+Enter)"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              onClick={goToNextMatch}
              disabled={matchingSegments.length === 0}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 light:hover:bg-zinc-200 light:hover:text-zinc-700"
              title="Next match (Enter)"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            <button
              onClick={clearSearch}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 light:hover:bg-zinc-200 light:hover:text-zinc-700"
              title="Clear search (Escape)"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Transcript segments */}
      <div
        ref={containerRef}
        className="flex max-h-[500px] flex-col gap-1 overflow-y-auto scroll-smooth pr-2"
      >
        {searchQuery.trim() ? (
          // Show filtered results when searching
          matchingSegments.length > 0 ? (
            matchingSegments.map((segment, index) => {
              const prevSpeaker = index > 0 ? matchingSegments[index - 1].speaker : null;
              const isNewSpeaker = segment.speaker !== prevSpeaker;
              const isCurrentMatch = matchingSegments[currentMatchIndex]?.id === segment.id;
              return (
                <TranscriptSegment
                  key={segment.id}
                  ref={setSegmentRef(segment.id)}
                  startTime={segment.startTime}
                  speaker={segment.speaker}
                  text={segment.text}
                  isActive={isCurrentMatch}
                  showSpeaker={isNewSpeaker}
                  onClick={() => onSeek(segment.startTime)}
                  searchQuery={searchQuery}
                  isSearchMatch={true}
                />
              );
            })
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
              No results found for "{searchQuery}"
            </div>
          )
        ) : (
          // Show all segments when not searching
          segments.map((segment, index) => {
            const prevSpeaker = index > 0 ? segments[index - 1].speaker : null;
            const isNewSpeaker = segment.speaker !== prevSpeaker;
            return (
              <TranscriptSegment
                key={segment.id}
                ref={setSegmentRef(segment.id)}
                startTime={segment.startTime}
                speaker={segment.speaker}
                text={segment.text}
                isActive={currentSegment?.id === segment.id}
                showSpeaker={isNewSpeaker}
                onClick={() => onSeek(segment.startTime)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
