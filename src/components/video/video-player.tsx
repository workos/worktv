"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  isPlaying?: boolean;
  onClick?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ src, poster, isPlaying, onClick }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Forward the ref
    useImperativeHandle(ref, () => videoRef.current!, []);

    return (
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          preload="metadata"
          playsInline
          onClick={onClick}
          className="h-full w-full cursor-pointer"
        />

        {/* Play button overlay */}
        {!isPlaying && (
          <button
            onClick={onClick}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
            aria-label="Play video"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-105">
              <svg
                className="h-10 w-10 translate-x-0.5 text-zinc-900"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
      </div>
    );
  }
);
