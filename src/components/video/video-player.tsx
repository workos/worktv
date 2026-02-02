"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  captionsUrl?: string;
  captionsEnabled?: boolean;
  isPlaying?: boolean;
  onClick?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ src, poster, captionsUrl, captionsEnabled, isPlaying, onClick }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Forward the ref
    useImperativeHandle(ref, () => videoRef.current!, []);

    // Set track mode when captionsEnabled changes
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const setTrackMode = () => {
        if (video.textTracks.length > 0) {
          video.textTracks[0].mode = captionsEnabled ? "showing" : "hidden";
        }
      };

      // Try to set immediately
      setTrackMode();

      // Also listen for track load in case it's not ready yet
      const track = video.querySelector("track");
      if (track) {
        track.addEventListener("load", setTrackMode);
        return () => track.removeEventListener("load", setTrackMode);
      }
    }, [captionsEnabled, captionsUrl]);

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
        >
          {captionsUrl && (
            <track
              kind="captions"
              src={captionsUrl}
              srcLang="en"
              label="English"
            />
          )}
        </video>

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
