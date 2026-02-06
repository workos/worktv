"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { formatTime, type TranscriptSegment } from "@/types/video";

interface ClipCreatorProps {
  recordingId: string;
  videoUrl: string;
  duration: number;
  currentTime: number;
  transcript: TranscriptSegment[];
  onClose: () => void;
  onClipCreated: (clip: { id: string; startTime: number; endTime: number; title: string | null }) => void;
}

export function ClipCreator({
  recordingId,
  videoUrl,
  duration,
  currentTime,
  transcript,
  onClose,
  onClipCreated,
}: ClipCreatorProps) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Use actual video duration from the preview element, fallback to prop
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const defaultClipLength = Math.max(5, (duration || 60) * 0.1); // 10% of video, min 5 seconds
  const [startTime, setStartTime] = useState(Math.max(0, currentTime));
  const [endTime, setEndTime] = useState(Math.min(duration || 60, currentTime + defaultClipLength));
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState(startTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [settingPoint, setSettingPoint] = useState<"in" | "out" | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  const clipDuration = endTime - startTime;

  // Prevent background scrolling when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Get segments within the clip range for AI title generation
  const clipSegments = useMemo(() => {
    return transcript.filter(
      (seg) => seg.startTime < endTime && seg.endTime > startTime
    );
  }, [transcript, startTime, endTime]);

  // Track if user has manually edited the title
  const [userEditedTitle, setUserEditedTitle] = useState(false);

  // Generate AI title when clip range changes (debounced)
  useEffect(() => {
    if (clipSegments.length === 0) {
      return;
    }

    // Don't fetch while dragging
    if (draggingHandle) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsGeneratingTitle(true);
      try {
        const response = await fetch("/api/clips/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clipSegments,
            fullTranscript: transcript,
          }),
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json() as { title?: string };
          const newTitle = data.title || "";
          // Only auto-fill if user hasn't manually edited
          if (!userEditedTitle) {
            setTitle(newTitle);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to generate clip title:", err);
        }
      } finally {
        setIsGeneratingTitle(false);
      }
    }, 500); // Debounce 500ms

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [clipSegments, draggingHandle, transcript, userEditedTitle]);

  // Get transcript segments that are visible around the clip range
  const visibleSegments = transcript.filter(
    (seg) => seg.endTime >= startTime - 60 && seg.startTime <= endTime + 60
  );

  // Seek video to a specific time
  const seekTo = useCallback((time: number) => {
    const video = previewRef.current;
    if (video) {
      video.currentTime = time;
      setPreviewTime(time);
    }
  }, []);

  // Get duration from preview video and loop within clip bounds
  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        setVideoDuration(video.duration);
        // Adjust endTime if it exceeds the actual duration
        if (endTime > video.duration) {
          setEndTime(Math.min(video.duration, currentTime + 15));
        }
      }
    };

    const handleTimeUpdate = () => {
      setPreviewTime(video.currentTime);
      // Only loop back when playback goes past the end (not when seeking to end)
      if (isPlaying && video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    // Check if already loaded
    if (video.duration && !isNaN(video.duration) && video.duration > 0) {
      setVideoDuration(video.duration);
    }

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [startTime, endTime, isPlaying, currentTime]);

  // Seek preview to appropriate position when range changes
  // When dragging end handle, seek to end; otherwise seek to start
  useEffect(() => {
    const video = previewRef.current;
    if (video && !isPlaying) {
      if (draggingHandle === "end") {
        video.currentTime = endTime;
        setPreviewTime(endTime);
      } else {
        video.currentTime = startTime;
        setPreviewTime(startTime);
      }
    }
  }, [startTime, endTime, isPlaying, draggingHandle]);

  // Scroll transcript to keep current boundary segment in view (only while dragging)
  useEffect(() => {
    // Only auto-scroll while actively dragging a handle
    if (!draggingHandle) return;

    const container = transcriptContainerRef.current;
    if (!container) return;

    const targetTime = draggingHandle === "end" ? endTime : startTime;
    const targetSegment = container.querySelector(`[data-boundary-time="${targetTime.toFixed(2)}"]`);
    if (targetSegment) {
      targetSegment.scrollIntoView({ behavior: "instant", block: "center" });
    }
  }, [startTime, endTime, draggingHandle]);

  const handleSegmentClick = (segment: TranscriptSegment, position: "start" | "end") => {
    if (settingPoint === "in" || position === "start") {
      setStartTime(Math.min(segment.startTime, endTime - 1));
      setSettingPoint(null);
    } else if (settingPoint === "out" || position === "end") {
      setEndTime(Math.max(segment.endTime, startTime + 1));
      setSettingPoint(null);
    }
  };

  const togglePlayPause = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;

    if (video.paused) {
      video.currentTime = startTime;
      video.play();
    } else {
      video.pause();
    }
  }, [startTime]);

  const handleCreate = async () => {
    if (clipDuration <= 0) {
      setError("End time must be after start time");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime,
          endTime,
          title: title.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Failed to create clip");
      }

      const clip = await response.json() as { id: string; startTime: number; endTime: number; title: string | null };

      // Copy shareable URL to clipboard
      const shareUrl = `${window.location.origin}/c/${clip.id}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        // Clipboard API may fail in some contexts
      }

      // Notify parent (will close modal and show toast)
      onClipCreated(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create clip");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle timeline click to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoDuration || videoDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * videoDuration;
    seekTo(time);
  }, [videoDuration, seekTo]);

  // Calculate percentages safely
  const safePercent = (time: number) => {
    if (!videoDuration || videoDuration <= 0) return 0;
    return Math.max(0, Math.min(100, (time / videoDuration) * 100));
  };
  const startPercent = safePercent(startTime);
  const endPercent = safePercent(endTime);
  const previewPercent = safePercent(previewTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl light:border-zinc-200 light:bg-white">
        {/* Header */}
        <div className="relative flex items-center justify-center border-b border-white/10 px-4 py-3 light:border-zinc-200">
          <h2 className="text-sm font-semibold">Create Clip</h2>
          <button
            onClick={onClose}
            className="absolute right-4 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 light:hover:bg-zinc-100 light:hover:text-zinc-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 px-4 py-2 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 lg:flex-row">
          {/* Left: Video Preview */}
          <div className="min-h-0 flex-1">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
              <video
                ref={previewRef}
                src={videoUrl}
                className="h-full w-full object-contain"
                playsInline
              />
              {/* Play/Pause overlay */}
              <button
                onClick={togglePlayPause}
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100"
              >
                {isPlaying ? (
                  <svg className="h-16 w-16 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="h-16 w-16 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Range selector */}
            <div className="mt-4">
              <div
                className="relative h-3 cursor-pointer rounded-full bg-zinc-700 light:bg-zinc-200"
                onClick={handleTimelineClick}
              >
                {/* Selected range */}
                <div
                  className="absolute inset-y-0 rounded-full bg-amber-500/60"
                  style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
                />
                {/* Preview position */}
                <div
                  className="absolute top-1/2 h-4 w-1 -translate-y-1/2 bg-white"
                  style={{ left: `${previewPercent}%` }}
                />
                {/* Start handle */}
                <div
                  className="absolute top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize rounded bg-amber-500 shadow-lg"
                  style={{ left: `calc(${startPercent}% - 6px)` }}
                  onMouseDown={(e) => {
                    if (!videoDuration || videoDuration <= 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggingHandle("start");
                    const bar = e.currentTarget.parentElement!;
                    const rect = bar.getBoundingClientRect();
                    const handleMove = (moveE: MouseEvent) => {
                      const percent = Math.max(0, Math.min(1, (moveE.clientX - rect.left) / rect.width));
                      const newTime = percent * videoDuration;
                      const clampedTime = Math.min(newTime, endTime - 1);
                      setStartTime(clampedTime);
                      seekTo(clampedTime);
                    };
                    const handleUp = () => {
                      setDraggingHandle(null);
                      document.removeEventListener("mousemove", handleMove);
                      document.removeEventListener("mouseup", handleUp);
                    };
                    document.addEventListener("mousemove", handleMove);
                    document.addEventListener("mouseup", handleUp);
                  }}
                />
                {/* End handle */}
                <div
                  className="absolute top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize rounded bg-amber-500 shadow-lg"
                  style={{ left: `calc(${endPercent}% - 6px)` }}
                  onMouseDown={(e) => {
                    if (!videoDuration || videoDuration <= 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggingHandle("end");
                    const bar = e.currentTarget.parentElement!;
                    const rect = bar.getBoundingClientRect();
                    const handleMove = (moveE: MouseEvent) => {
                      const percent = Math.max(0, Math.min(1, (moveE.clientX - rect.left) / rect.width));
                      const newTime = percent * videoDuration;
                      const clampedTime = Math.max(newTime, startTime + 1);
                      setEndTime(clampedTime);
                      seekTo(clampedTime);
                    };
                    const handleUp = () => {
                      setDraggingHandle(null);
                      document.removeEventListener("mousemove", handleMove);
                      document.removeEventListener("mouseup", handleUp);
                    };
                    document.addEventListener("mousemove", handleMove);
                    document.addEventListener("mouseup", handleUp);
                  }}
                />
              </div>

              {/* Time display */}
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSettingPoint(settingPoint === "in" ? null : "in")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      settingPoint === "in"
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-700 hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                    }`}
                  >
                    <span>In:</span>
                    <span className="font-mono">{formatTime(startTime)}</span>
                  </button>
                  <button
                    onClick={() => setSettingPoint(settingPoint === "out" ? null : "out")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      settingPoint === "out"
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-700 hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                    }`}
                  >
                    <span>Out:</span>
                    <span className="font-mono">{formatTime(endTime)}</span>
                  </button>
                </div>
                <span className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400">
                  {formatTime(clipDuration)}
                </span>
              </div>
              {settingPoint && (
                <p className="mt-2 text-xs text-amber-400">
                  Click a transcript segment to set the {settingPoint === "in" ? "start" : "end"} point
                </p>
              )}

              {/* Clip title input */}
              <div className="mt-8">
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-zinc-400">
                  Clip Title
                  {isGeneratingTitle && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      AI generating...
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setUserEditedTitle(true);
                  }}
                  placeholder="Enter a title for your clip"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none light:border-zinc-200 light:bg-zinc-50"
                />
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={onClose}
                  className="rounded-lg px-5 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200 light:hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || clipDuration <= 0}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-black transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Clip"}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Transcript */}
          <div className="flex min-h-0 w-full flex-col lg:w-[400px]">
            <div className="mb-2 text-xs font-medium text-zinc-400">
              Click transcript to set in/out points
            </div>
            <div
              ref={transcriptContainerRef}
              className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-zinc-800/50 p-3 light:border-zinc-200 light:bg-zinc-50"
            >
              {visibleSegments.length === 0 ? (
                <p className="text-center text-xs text-zinc-500">No transcript available</p>
              ) : (
                <div className="space-y-2">
                  {visibleSegments.map((segment) => {
                    const isInClip = segment.startTime >= startTime && segment.endTime <= endTime;
                    const isPartialStart = segment.startTime < startTime && segment.endTime > startTime;
                    const isPartialEnd = segment.startTime < endTime && segment.endTime > endTime;
                    const isActive = previewTime >= segment.startTime && previewTime < segment.endTime;
                    const containsStart = segment.startTime <= startTime && segment.endTime > startTime;
                    const containsEnd = segment.startTime < endTime && segment.endTime >= endTime;

                    // Determine which boundary time this segment should be marked with for scrolling
                    const boundaryTime = containsStart ? startTime : containsEnd ? endTime : null;

                    // Highlight the segment at the boundary being dragged
                    const isDragTarget =
                      (draggingHandle === "start" && containsStart) ||
                      (draggingHandle === "end" && containsEnd);

                    return (
                      <div
                        key={segment.id}
                        data-boundary-time={boundaryTime?.toFixed(2)}
                        onClick={() => {
                          // Jump to segment time when clicked (unless setting in/out point)
                          if (!settingPoint) {
                            seekTo(segment.startTime);
                          }
                        }}
                        className={`group flex cursor-pointer gap-2 rounded-lg p-2 transition ${
                          isDragTarget
                            ? "bg-amber-500/30 ring-2 ring-amber-500"
                            : isActive
                            ? "bg-amber-500/20 ring-1 ring-amber-500/50"
                            : isInClip
                            ? "bg-amber-500/10"
                            : isPartialStart || isPartialEnd
                            ? "bg-amber-500/5"
                            : "hover:bg-white/5 light:hover:bg-zinc-100"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] font-medium text-zinc-400">{segment.speaker}</span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              {formatTime(segment.startTime)}
                            </span>
                          </div>
                          <p
                            className="text-xs leading-relaxed"
                            onClick={(e) => {
                              if (settingPoint) {
                                e.stopPropagation();
                                handleSegmentClick(segment, settingPoint === "in" ? "start" : "end");
                              }
                            }}
                          >
                            {segment.text.split(" ").map((word, i) => (
                              <span
                                key={i}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Estimate word timing within segment
                                  const wordCount = segment.text.split(" ").length;
                                  const segmentDuration = segment.endTime - segment.startTime;
                                  const wordTime = segment.startTime + (i / wordCount) * segmentDuration;

                                  if (settingPoint === "in") {
                                    setStartTime(Math.min(wordTime, endTime - 1));
                                    setSettingPoint(null);
                                  } else if (settingPoint === "out") {
                                    setEndTime(Math.max(wordTime, startTime + 1));
                                    setSettingPoint(null);
                                  }
                                }}
                                className={`inline-block rounded px-0.5 transition ${
                                  settingPoint
                                    ? "cursor-pointer hover:bg-amber-500/30"
                                    : ""
                                }`}
                              >
                                {word}{" "}
                              </span>
                            ))}
                          </p>
                        </div>
                        {/* Quick set buttons on right side, stacked vertically */}
                        <div className="flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStartTime(Math.min(segment.startTime, endTime - 1));
                            }}
                            className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                          >
                            In
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEndTime(Math.max(segment.endTime, startTime + 1));
                            }}
                            className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                          >
                            Out
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
