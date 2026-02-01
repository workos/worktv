"use client";

import { forwardRef } from "react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  captionsUrl?: string;
  captionsEnabled?: boolean;
  onClick?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ src, poster, captionsUrl, captionsEnabled, onClick }, ref) {
    return (
      <video
        ref={ref}
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
            default={captionsEnabled}
          />
        )}
      </video>
    );
  }
);
