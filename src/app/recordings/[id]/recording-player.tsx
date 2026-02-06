"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import type { Recording, Clip } from "@/types/video";
import { useVideoPlayer } from "@/hooks/use-video-player";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { VideoPlayer } from "@/components/video/video-player";
import { AudioPlayer } from "@/components/video/audio-player";
import { VideoControls } from "@/components/video/video-controls";
import { TranscriptPanel } from "@/components/video/transcript-panel";
import { SpeakerTimeline } from "@/components/video/speaker-timeline";
import { SummaryPanel } from "@/components/summary/summary-panel";
import { CaptionOverlay } from "@/components/video/caption-overlay";
import { ClipCreator } from "@/components/video/clip-creator";
import { ClipsPanel } from "@/components/video/clips-panel";
import { ClipSuccessModal } from "@/components/video/clip-success-modal";
import { ParticipantsPanel } from "@/components/video/participants-panel";
import type { AISummary } from "@/types/video";
import type { ParticipantRow } from "@/lib/db";

interface VideoView {
  viewType: string;
  label: string;
  videoUrl: string;
}

interface RecordingPlayerProps {
  recording: Recording;
  videoViews?: VideoView[];
  summary: AISummary | null;
  activeClip?: Clip | null;
  clips?: Clip[];
  participants?: ParticipantRow[];
}

type LeftPanelTab = "summary" | "transcript" | "clips" | "participants";

export function RecordingPlayer({ recording, videoViews = [], summary, activeClip, clips = [], participants = [] }: RecordingPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("summary");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [isCreatingClip, setIsCreatingClip] = useState(false);
  const [localClips, setLocalClips] = useState<Clip[]>(clips);
  const [createdClipUrl, setCreatedClipUrl] = useState<string | null>(null);

  const isAudioOnly = recording.mediaType === "audio";
  const mediaRef = isAudioOnly ? audioRef : videoRef;

  const hasTranscript = recording.transcript.length > 0;

  // Toggle captions
  const toggleCaptions = useCallback(() => {
    setCaptionsEnabled((prev) => !prev);
  }, []);

  // Seek to clip start when activeClip is set and video loads
  useEffect(() => {
    if (!activeClip) return;
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.currentTime = activeClip.startTime;
    };

    if (video.readyState >= 1) {
      video.currentTime = activeClip.startTime;
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [activeClip]);

  // Use the selected view's URL, or fall back to recording.videoUrl
  const currentVideoUrl = videoViews.length > 0
    ? videoViews[currentViewIndex]?.videoUrl || recording.videoUrl
    : recording.videoUrl;
  const {
    state,
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
  } = useVideoPlayer(mediaRef);

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

  // Disable keyboard shortcuts when clip creator modal is open
  const noop = useCallback(() => {}, []);
  useKeyboardShortcuts({
    onTogglePlay: isCreatingClip ? noop : togglePlay,
    onSeekBack: isCreatingClip ? noop : () => seekRelative(-5),
    onSeekForward: isCreatingClip ? noop : () => seekRelative(5),
    onVolumeUp: isCreatingClip ? noop : handleVolumeUp,
    onVolumeDown: isCreatingClip ? noop : handleVolumeDown,
    onToggleMute: isCreatingClip ? noop : toggleMute,
    onToggleFullscreen: isCreatingClip || isAudioOnly ? undefined : toggleFullscreen,
    onToggleCaptions: isCreatingClip || !hasTranscript || isAudioOnly ? undefined : toggleCaptions,
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
    <div className="flex gap-6">
      {/* Left column - AI Summary / Transcript tabs */}
      {hasTranscript && (
        <div
          className={`shrink-0 transition-all duration-150 ease-out ${
            showLeftPanel
              ? "w-full opacity-100 lg:w-[calc(50%-12px)]"
              : "w-0 overflow-hidden opacity-0"
          }`}
        >
          <div className="rounded-2xl border border-white/10 bg-zinc-900/50 light:border-zinc-200 light:bg-white">
            {/* Tab header */}
            <div className="flex items-center justify-between border-b border-white/10 light:border-zinc-200">
              <div className="flex">
                <button
                  onClick={() => setLeftPanelTab("summary")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    leftPanelTab === "summary"
                      ? "border-b-2 border-indigo-400 text-zinc-200 light:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Summary
                </button>
                <button
                  onClick={() => setLeftPanelTab("transcript")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    leftPanelTab === "transcript"
                      ? "border-b-2 border-indigo-400 text-zinc-200 light:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Transcript
                </button>
                <button
                  onClick={() => setLeftPanelTab("clips")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    leftPanelTab === "clips"
                      ? "border-b-2 border-indigo-400 text-zinc-200 light:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                  </svg>
                  Clips{localClips.length > 0 && ` (${localClips.length})`}
                </button>
                <button
                  onClick={() => setLeftPanelTab("participants")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    leftPanelTab === "participants"
                      ? "border-b-2 border-indigo-400 text-zinc-200 light:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Participants
                </button>
              </div>
              <button
                onClick={() => setShowLeftPanel(false)}
                className="mr-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors duration-150 hover:bg-zinc-800 hover:text-zinc-300 light:hover:bg-zinc-100 light:hover:text-zinc-600"
                title="Hide Panel"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Tab content */}
            <div className="p-4">
              {leftPanelTab === "summary" && (
                <SummaryPanel
                  summary={summary}
                  recordingId={recording.id}
                  hasTranscript={hasTranscript}
                  embedded
                />
              )}
              {leftPanelTab === "transcript" && (
                <TranscriptPanel
                  segments={recording.transcript}
                  currentTime={state.currentTime}
                  onSeek={seekAndPlay}
                />
              )}
              {leftPanelTab === "clips" && (
                <ClipsPanel
                  clips={localClips}
                  activeClipId={activeClip?.id}
                  onClipSelect={(clip) => {
                    seek(clip.startTime);
                    play();
                  }}
                  onClipDelete={(clipId) => {
                    setLocalClips((prev) => prev.filter((c) => c.id !== clipId));
                  }}
                />
              )}
              {leftPanelTab === "participants" && (
                <ParticipantsPanel participants={participants} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right column - Video/Audio + Controls */}
      <div className={`flex min-w-0 flex-col gap-4 transition-all duration-150 lg:sticky lg:top-6 lg:self-start ${
        showLeftPanel || !hasTranscript ? "flex-1" : "mx-auto w-full lg:w-[75%]"
      }`}>
        {/* Show panel button when hidden */}
        {hasTranscript && !showLeftPanel && (
          <button
            onClick={() => setShowLeftPanel(true)}
            className="flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-400 transition-all duration-150 hover:bg-zinc-700/80 hover:text-zinc-200 light:border-zinc-200 light:bg-white/80 light:text-zinc-500 light:hover:bg-zinc-100/80 light:hover:text-zinc-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Expand Summary, Transcript and Clips
          </button>
        )}

        {/* Media section */}
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 light:border-zinc-200 light:bg-white">
          <div className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-black light:border-zinc-300 ${isAudioOnly ? "aspect-[3/1]" : "aspect-video"}`}>
            {isAudioOnly ? (
              <AudioPlayer
                ref={audioRef}
                src={currentVideoUrl}
                onClick={togglePlay}
              />
            ) : (
              <>
                <VideoPlayer
                  ref={videoRef}
                  src={currentVideoUrl}
                  poster={recording.posterUrl}
                  isPlaying={state.isPlaying}
                  onClick={togglePlay}
                />
                <CaptionOverlay
                  segments={recording.transcript}
                  currentTime={state.currentTime}
                  enabled={captionsEnabled}
                />
              </>
            )}
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
            hasCaptions={hasTranscript && !isAudioOnly}
            activeClip={activeClip}
            clips={localClips}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
            onPlaybackRateChange={setPlaybackRate}
            onToggleFullscreen={isAudioOnly ? undefined : toggleFullscreen}
            onToggleCaptions={isAudioOnly ? undefined : toggleCaptions}
            onCreateClip={() => {
              pause();
              setIsCreatingClip(true);
            }}
          />

          {isCreatingClip && (
            <ClipCreator
              recordingId={recording.id}
              videoUrl={currentVideoUrl}
              duration={state.duration}
              currentTime={state.currentTime}
              transcript={recording.transcript}
              onClose={() => setIsCreatingClip(false)}
              onClipCreated={(clip) => {
                setLocalClips((prev) => [...prev, clip as Clip]);
                setIsCreatingClip(false);
                const clipUrl = `${window.location.origin}/c/${clip.id}`;
                setCreatedClipUrl(clipUrl);
              }}
            />
          )}

          {createdClipUrl && (
            <ClipSuccessModal
              clipUrl={createdClipUrl}
              onClose={() => setCreatedClipUrl(null)}
            />
          )}

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
                participants={participants.map(p => ({ name: p.name, email: p.email }))}
              />
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
