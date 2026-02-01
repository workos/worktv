"use client";

import { useState, useRef, useEffect } from "react";

interface PlaybackSpeedProps {
  rate: number;
  onRateChange: (rate: number) => void;
}

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlaybackSpeed({ rate, onRateChange }: PlaybackSpeedProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 light:text-zinc-500 light:hover:bg-zinc-200 light:hover:text-zinc-700"
        title="Playback speed"
      >
        {rate}x
      </button>
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-xl backdrop-blur light:border-zinc-200 light:bg-white">
          {speeds.map((speed) => (
            <button
              key={speed}
              onClick={() => {
                onRateChange(speed);
                setIsOpen(false);
              }}
              className={`block w-full rounded-lg px-4 py-1.5 text-left text-xs transition ${
                speed === rate
                  ? "bg-indigo-500/20 text-indigo-300 light:bg-indigo-100 light:text-indigo-700"
                  : "text-zinc-200 hover:bg-white/10 light:text-zinc-700 light:hover:bg-zinc-100"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
