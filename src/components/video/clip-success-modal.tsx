"use client";

import { useEffect, useRef } from "react";

interface ClipSuccessModalProps {
  clipUrl: string;
  onClose: () => void;
}

export function ClipSuccessModal({ clipUrl, onClose }: ClipSuccessModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Select all text when modal opens
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  }, []);

  // Prevent background scrolling
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(clipUrl);
      if (inputRef.current) {
        inputRef.current.select();
      }
    } catch {
      // Clipboard API may fail in some contexts
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl light:border-zinc-200 light:bg-white">
        <div className="mb-4 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h2 className="mb-1 text-center text-lg font-semibold">Clip Created</h2>
        <p className="mb-4 text-center text-sm text-zinc-400">
          Link copied to clipboard
        </p>

        <div className="mb-6">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={clipUrl}
              readOnly
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none light:border-zinc-200 light:bg-zinc-50 light:text-zinc-800"
            />
            <button
              onClick={handleCopy}
              className="rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 light:border-zinc-200 light:bg-zinc-100 light:hover:bg-zinc-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-amber-400"
        >
          Done
        </button>
      </div>
    </div>
  );
}
