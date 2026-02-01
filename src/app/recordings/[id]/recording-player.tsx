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

interface VideoView {
  viewType: string;
  label: string;
  videoUrl: string;
}

interface RecordingPlayerProps {
  recording: Recording;
  videoViews?: VideoView[];
}

type PanelTab = "transcript" | "chat";

export function RecordingPlayer({ recording, videoViews = [] }: RecordingPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<PanelTab>("transcript");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);

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

  // Toggle captions track mode when state changes
  const toggleCaptions = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const newEnabled = !captionsEnabled;
    setCaptionsEnabled(newEnabled);

    // Set the track mode
    if (video.textTracks.length > 0) {
      video.textTracks[0].mode = newEnabled ? "showing" : "hidden";
    }
  }, [captionsEnabled]);

  // Use the selected view's URL, or fall back to recording.videoUrl
  const currentVideoUrl = videoViews.length > 0
    ? videoViews[currentViewIndex]?.videoUrl || recording.videoUrl
    : recording.videoUrl;
  const {
    state,
    togglePlay,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
  } = useVideoPlayer(videoRef);

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
    <div className="flex flex-col gap-4">
      {/* Video section - full width */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 light:border-zinc-200 light:bg-white">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black light:border-zinc-300">
          <VideoPlayer
            ref={videoRef}
            src={currentVideoUrl}
            poster={recording.posterUrl}
            captionsUrl={captionsUrl}
            captionsEnabled={captionsEnabled}
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
      </section>

      {/* Speaker timeline and transcript side by side */}
      {hasTranscript && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
          {/* Speaker timeline */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 light:border-zinc-200 light:bg-white">
            <div className="mb-3 text-sm font-semibold">Speaker Timeline</div>
            <SpeakerTimeline
              segments={recording.transcript}
              speakers={recording.speakers}
              duration={state.duration}
              currentTime={state.currentTime}
              onSeek={seek}
            />
          </section>

          {/* Transcript/Chat panel */}
          <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 light:border-zinc-200 light:bg-white">
            {/* Tab header */}
            <div className="mb-4">
              {hasChatMessages ? (
                <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1 light:border-zinc-200 light:bg-zinc-100">
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
              ) : (
                <>
                  <div className="text-sm font-semibold">Transcript</div>
                  <div className="text-xs text-zinc-400 light:text-zinc-500">
                    Click any line to jump to that moment
                  </div>
                </>
              )}
            </div>

            {activeTab === "transcript" ? (
              <TranscriptPanel
                segments={recording.transcript}
                currentTime={state.currentTime}
                onSeek={seek}
              />
            ) : (
              <ChatPanel
                messages={recording.chatMessages ?? []}
                currentTime={state.currentTime}
                onSeek={seek}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
