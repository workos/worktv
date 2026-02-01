"use client";

import { useEffect } from "react";

interface KeyboardShortcutsOptions {
  onTogglePlay: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleCaptions?: () => void;
}

export function useKeyboardShortcuts({
  onTogglePlay,
  onSeekBack,
  onSeekForward,
  onVolumeUp,
  onVolumeDown,
  onToggleMute,
  onToggleFullscreen,
  onToggleCaptions,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          onTogglePlay();
          break;
        case "arrowleft":
        case "j":
          event.preventDefault();
          onSeekBack();
          break;
        case "arrowright":
        case "l":
          event.preventDefault();
          onSeekForward();
          break;
        case "arrowup":
          event.preventDefault();
          onVolumeUp();
          break;
        case "arrowdown":
          event.preventDefault();
          onVolumeDown();
          break;
        case "m":
          event.preventDefault();
          onToggleMute();
          break;
        case "f":
          event.preventDefault();
          onToggleFullscreen();
          break;
        case "c":
          if (onToggleCaptions) {
            event.preventDefault();
            onToggleCaptions();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onTogglePlay,
    onSeekBack,
    onSeekForward,
    onVolumeUp,
    onVolumeDown,
    onToggleMute,
    onToggleFullscreen,
    onToggleCaptions,
  ]);
}
