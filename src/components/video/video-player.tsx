"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  captionsUrl?: string;
  captionsEnabled?: boolean;
  onClick?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ src, poster, captionsUrl, captionsEnabled, onClick }, ref) {
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
    );
  }
);
