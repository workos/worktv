"use client";

import { forwardRef } from "react";
import { formatTime } from "@/types/video";

interface TranscriptSegmentProps {
  startTime: number;
  speaker: string;
  text: string;
  isActive: boolean;
  showSpeaker: boolean;
  onClick: () => void;
}

export const TranscriptSegment = forwardRef<
  HTMLButtonElement,
  TranscriptSegmentProps
>(function TranscriptSegment(
  { startTime, speaker, text, isActive, showSpeaker, onClick },
  ref
) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`group w-full text-left text-sm transition ${
        showSpeaker ? "mt-3 first:mt-0" : ""
      }`}
    >
      {showSpeaker && (
        <div className="mb-1 text-xs font-semibold text-zinc-400 light:text-zinc-500">{speaker}</div>
      )}
      <div className="flex items-start gap-3">
        <span
          className={`flex-1 transition ${
            isActive
              ? "text-zinc-50 light:text-zinc-900"
              : "text-zinc-500 group-hover:text-zinc-300 light:text-zinc-500 light:group-hover:text-zinc-700"
          }`}
        >
          {text}
        </span>
        <span
          className={`shrink-0 font-mono text-xs transition ${
            isActive
              ? "text-indigo-400 light:text-indigo-600"
              : "text-zinc-600 group-hover:text-zinc-500"
          }`}
        >
          {formatTime(startTime)}
        </span>
      </div>
    </button>
  );
});
