"use client";

import { useState } from "react";
import type { Clip } from "@/types/video";
import { formatTime } from "@/types/video";
import { ConfirmModal } from "@/components/ui/confirm-modal";

interface ClipsPanelProps {
  clips: Clip[];
  activeClipId?: string | null;
  onClipSelect: (clip: Clip) => void;
  onClipDelete: (clipId: string) => void;
}

export function ClipsPanel({ clips, activeClipId, onClipSelect, onClipDelete }: ClipsPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clipToDelete, setClipToDelete] = useState<Clip | null>(null);

  const handleCopyLink = async (clip: Clip) => {
    const url = `${window.location.origin}/c/${clip.id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteConfirm = async () => {
    if (!clipToDelete) return;

    const clipId = clipToDelete.id;
    setDeletingId(clipId);
    setClipToDelete(null);
    try {
      const response = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
      if (response.ok) {
        onClipDelete(clipId);
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="text-center text-sm text-zinc-500">
        No clips yet. Create one using the Clip button above.
      </div>
    );
  }

  return (
    <>
      {clipToDelete && (
        <ConfirmModal
          title="Delete Clip"
          message={`Are you sure you want to delete "${clipToDelete.title || "Untitled Clip"}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          isDestructive
          onConfirm={handleDeleteConfirm}
          onCancel={() => setClipToDelete(null)}
        />
      )}
      <div className="space-y-2">
        {clips.map((clip) => {
        const isActive = activeClipId === clip.id;
        const isCopied = copiedId === clip.id;
        const isDeleting = deletingId === clip.id;

        return (
          <div
            key={clip.id}
            className={`group rounded-lg border p-3 transition ${
              isActive
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20 light:border-zinc-200 light:bg-zinc-50 light:hover:border-zinc-300"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => onClipSelect(clip)}
                className="flex-1 text-left"
              >
                <div className="mb-1 line-clamp-2 text-sm font-medium">
                  {clip.title || "Untitled Clip"}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{formatTime(clip.startTime)} - {formatTime(clip.endTime)}</span>
                  <span className="rounded bg-amber-500/20 px-1 py-0.5 text-amber-400">
                    {formatTime(clip.endTime - clip.startTime)}
                  </span>
                </div>
              </button>

              <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => handleCopyLink(clip)}
                  className="rounded p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 light:hover:bg-zinc-200 light:hover:text-zinc-700"
                  title="Copy share link"
                >
                  {isCopied ? (
                    <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setClipToDelete(clip)}
                  disabled={isDeleting}
                  className="rounded p-1.5 text-zinc-400 transition hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                  title="Delete clip"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
