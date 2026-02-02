"use client";

import type { TranscriptSegment } from "@/types/video";
import { findCurrentSegment } from "@/types/video";

interface CaptionOverlayProps {
  segments: TranscriptSegment[];
  currentTime: number;
  enabled: boolean;
}

export function CaptionOverlay({ segments, currentTime, enabled }: CaptionOverlayProps) {
  if (!enabled) return null;

  const currentSegment = findCurrentSegment(segments, currentTime);
  if (!currentSegment) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-4">
      <div className="max-w-[80%] rounded bg-black/80 px-4 py-2 text-center">
        <span className="text-sm font-medium text-white">
          {currentSegment.text}
        </span>
      </div>
    </div>
  );
}
