"use client";

import { useRef, useEffect, useCallback } from "react";
import type { TranscriptSegment as TranscriptSegmentType } from "@/types/video";
import { findCurrentSegment } from "@/types/video";
import { TranscriptSegment } from "./transcript-segment";

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
  const currentSegment = findCurrentSegment(segments, currentTime);

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

  useEffect(() => {
    if (currentSegment && segmentRefs.current.has(currentSegment.id) && containerRef.current) {
      const element = segmentRefs.current.get(currentSegment.id);
      const container = containerRef.current;
      if (!element) return;

      // Calculate scroll position to center the element within the container
      const elementTop = element.offsetTop;
      const elementHeight = element.offsetHeight;
      const containerHeight = container.clientHeight;
      const scrollTarget = elementTop - (containerHeight / 2) + (elementHeight / 2);

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: "smooth",
      });
    }
  }, [currentSegment]);

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
    <div
      ref={containerRef}
      className="flex max-h-[500px] flex-col gap-1 overflow-y-auto scroll-smooth pr-2"
    >
      {segments.map((segment, index) => {
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
        })}
    </div>
  );
}
