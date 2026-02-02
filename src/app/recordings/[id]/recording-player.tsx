"use client";

import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import type { Recording, ChatMessage } from "@/types/video";
import { createVttBlobUrl } from "@/types/video";
import { useVideoPlayer } from "@/hooks/use-video-player";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { VideoPlayer } from "@/components/video/video-player";
import { VideoControls } from "@/components/video/video-controls";
import { TranscriptPanel } from "@/components/video/transcript-panel";
import { ChatPanel } from "@/components/video/chat-panel";
import { SpeakerTimeline } from "@/components/video/speaker-timeline";
import { SummaryPanel } from "@/components/summary/summary-panel";
import type { AISummary } from "@/types/video";

interface VideoView {
  viewType: string;
  label: string;
  videoUrl: string;
}

interface RecordingPlayerProps {
  recording: Recording;
  videoViews?: VideoView[];
  summary: AISummary | null;
}

type PanelTab = "transcript" | "chat";

export function RecordingPlayer({ recording, videoViews = [], summary }: RecordingPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<PanelTab>("transcript");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);

  const hasChatMessages = (recording.chatMessages?.length ?? 0) > 0;
  const hasTranscript = recording.transcript.length > 0;

  // Generate VTT blob URL from transcript
  const captionsUrl = useMemo(() => {
    if (!hasTranscript) return undefined;
    return createVttBlobUrl(recording.transcript);
  }, [recording.transcript, hasTranscript]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (captionsUrl) {
        URL.revokeObjectURL(captionsUrl);
      }
    };
  }, [captionsUrl]);

  // Toggle captions
  const toggleCaptions = useCallback(() => {
    setCaptionsEnabled((prev) => !prev);
  }, []);

  // Use the selected view's URL, or fall back to recording.videoUrl
  const currentVideoUrl = videoViews.length > 0
    ? videoViews[currentViewIndex]?.videoUrl || recording.videoUrl
    : recording.videoUrl;
  const {
    state,
    play,
    togglePlay,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
  } = useVideoPlayer(videoRef);

  // Seek to time and start playing
  const seekAndPlay = useCallback((time: number) => {
    seek(time);
    play();
  }, [seek, play]);

  const handleVolumeUp = useCallback(() => {
    setVolume(Math.min(1, state.volume + 0.1));
  }, [setVolume, state.volume]);

  const handleVolumeDown = useCallback(() => {
    setVolume(Math.max(0, state.volume - 0.1));
  }, [setVolume, state.volume]);

  useKeyboardShortcuts({
    onTogglePlay: togglePlay,
    onSeekBack: () => seekRelative(-5),
    onSeekForward: () => seekRelative(5),
    onVolumeUp: handleVolumeUp,
    onVolumeDown: handleVolumeDown,
    onToggleMute: toggleMute,
    onToggleFullscreen: toggleFullscreen,
    onToggleCaptions: hasTranscript ? toggleCaptions : undefined,
  });

  // Handle view switching while preserving playback position
  const handleViewChange = useCallback((index: number) => {
    const video = videoRef.current;
    if (!video) return;

    const currentTime = video.currentTime;
    const wasPlaying = !video.paused;

    setCurrentViewIndex(index);

    // After source change, restore position and play state
    const handleLoadedMetadata = () => {
      video.currentTime = currentTime;
      if (wasPlaying) {
        video.play();
      }
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left column - AI Summary */}
      {hasTranscript && (
        <div className="lg:sticky lg:top-6 lg:self-start">
          <SummaryPanel
            summary={summary}
            recordingId={recording.id}
            hasTranscript={hasTranscript}
          />
        </div>
      )}

      {/* Right column - Video + Controls + Transcript */}
      <div className="flex flex-col gap-4">
        {/* Video section */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 light:border-zinc-200 light:bg-white">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black light:border-zinc-300">
            <VideoPlayer
              ref={videoRef}
              src={currentVideoUrl}
              poster={recording.posterUrl}
              captionsUrl={captionsUrl}
              captionsEnabled={captionsEnabled}
              isPlaying={state.isPlaying}
              onClick={togglePlay}
            />
          </div>

          <VideoControls
            isPlaying={state.isPlaying}
            currentTime={state.currentTime}
            duration={state.duration}
            volume={state.volume}
            isMuted={state.isMuted}
            playbackRate={state.playbackRate}
            isFullscreen={state.isFullscreen}
            captionsEnabled={captionsEnabled}
            hasCaptions={hasTranscript}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
            onPlaybackRateChange={setPlaybackRate}
            onToggleFullscreen={toggleFullscreen}
            onToggleCaptions={toggleCaptions}
          />

          {videoViews.length > 1 && (
            <div className="mt-4 flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1 light:border-zinc-200 light:bg-zinc-100">
              {videoViews.map((view, index) => (
                <button
                  key={view.viewType}
                  onClick={() => handleViewChange(index)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    index === currentViewIndex
                      ? "bg-white/15 text-zinc-100 light:bg-white light:text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-200 light:text-zinc-600 light:hover:text-zinc-900"
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          )}

          {/* Speaker timeline */}
          {hasTranscript && (
            <div className="mt-4">
              <SpeakerTimeline
                segments={recording.transcript}
                speakers={recording.speakers}
                duration={state.duration}
                currentTime={state.currentTime}
                onSeek={seek}
              />
            </div>
          )}
        </section>

        {/* Transcript/Chat panel - collapsible */}
        {hasTranscript && (
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 light:border-zinc-200 light:bg-white">
            {/* Collapsible header */}
            <button
              onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm font-medium text-zinc-200 light:text-zinc-700">
                  Transcript
                </span>
                <span className="text-xs text-zinc-500">
                  {recording.transcript.length} segments
                </span>
              </div>
              <svg
                className={`h-4 w-4 text-zinc-400 transition-transform ${
                  isTranscriptExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isTranscriptExpanded && (
              <div className="border-t border-white/10 p-4 light:border-zinc-200">
                {/* Tab switcher if chat messages exist */}
                {hasChatMessages && (
                  <div className="mb-4 flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1 light:border-zinc-200 light:bg-zinc-100">
                    <button
                      onClick={() => setActiveTab("transcript")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        activeTab === "transcript"
                          ? "bg-white/15 text-zinc-100 light:bg-white light:text-zinc-900"
                          : "text-zinc-400 hover:text-zinc-200 light:text-zinc-600 light:hover:text-zinc-900"
                      }`}
                    >
                      Transcript
                    </button>
                    <button
                      onClick={() => setActiveTab("chat")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        activeTab === "chat"
                          ? "bg-white/15 text-zinc-100 light:bg-white light:text-zinc-900"
                          : "text-zinc-400 hover:text-zinc-200 light:text-zinc-600 light:hover:text-zinc-900"
                      }`}
                    >
                      Chat ({recording.chatMessages?.length})
                    </button>
                  </div>
                )}

                {activeTab === "transcript" ? (
                  <TranscriptPanel
                    segments={recording.transcript}
                    currentTime={state.currentTime}
                    onSeek={seekAndPlay}
                  />
                ) : (
                  <ChatPanel
                    messages={recording.chatMessages ?? []}
                    currentTime={state.currentTime}
                    onSeek={seekAndPlay}
                  />
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
