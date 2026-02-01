"use client";

import { useCallback, useRef } from "react";

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function ProgressBar({ currentTime, duration, onSeek }: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || duration === 0) return;
      const rect = barRef.current.getBoundingClientRect();
      const percent = (event.clientX - rect.left) / rect.width;
      onSeek(percent * duration);
    },
    [duration, onSeek]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      className="group relative h-1 flex-1 cursor-pointer rounded-full bg-zinc-700 transition-all hover:h-1.5 light:bg-zinc-300"
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
        style={{ width: `${progress}%` }}
      />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100 light:bg-zinc-700"
        style={{ left: `calc(${progress}% - 6px)` }}
      />
    </div>
  );
}
