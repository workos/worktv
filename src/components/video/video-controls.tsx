"use client";

import { ProgressBar } from "./progress-bar";
import { VolumeControl } from "./volume-control";
import { PlaybackSpeed } from "./playback-speed";
import { formatTime } from "@/types/video";

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  captionsEnabled?: boolean;
  hasCaptions?: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
  onToggleCaptions?: () => void;
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  captionsEnabled,
  hasCaptions,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onPlaybackRateChange,
  onToggleFullscreen,
  onToggleCaptions,
}: VideoControlsProps) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-3">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="text-zinc-400 transition hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-700"
          title={isPlaying ? "Pause (K)" : "Play (K)"}
        >
          {isPlaying ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <VolumeControl
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
        />

        <span className="font-mono text-xs text-zinc-400 light:text-zinc-500">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        <PlaybackSpeed rate={playbackRate} onRateChange={onPlaybackRateChange} />

        {hasCaptions && onToggleCaptions && (
          <button
            onClick={onToggleCaptions}
            className={`rounded px-1.5 py-0.5 text-xs font-bold transition ${
              captionsEnabled
                ? "bg-white text-zinc-900 light:bg-zinc-800 light:text-white"
                : "text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-700"
            }`}
            title={captionsEnabled ? "Hide captions (C)" : "Show captions (C)"}
          >
            CC
          </button>
        )}

        <button
          onClick={onToggleFullscreen}
          className="text-zinc-400 transition hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-700"
          title="Fullscreen (F)"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
