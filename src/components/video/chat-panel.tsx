"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import type { ChatMessage } from "@/types/video";
import { formatTime } from "@/types/video";

interface ChatPanelProps {
  messages: ChatMessage[];
  currentTime: number;
  onSeek: (time: number) => void;
}

function findCurrentMessage(
  messages: ChatMessage[],
  currentTime: number
): ChatMessage | null {
  // Find the last message before or at current time
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].timestamp <= currentTime) {
      return messages[i];
    }
  }
  return null;
}

export function ChatPanel({ messages, currentTime, onSeek }: ChatPanelProps) {
  const messageRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMessage = findCurrentMessage(messages, currentTime);

  const setMessageRef = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        messageRefs.current.set(id, el);
      } else {
        messageRefs.current.delete(id);
      }
    },
    []
  );

  useEffect(() => {
    if (currentMessage && messageRefs.current.has(currentMessage.id)) {
      const element = messageRefs.current.get(currentMessage.id);
      element?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentMessage]);

  // Generate consistent colors for senders
  const senderColors = useMemo(() => {
    const colors = [
      "#6366f1",
      "#22c55e",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#ec4899",
    ];
    const uniqueSenders = [...new Set(messages.map((m) => m.sender))];
    const colorMap = new Map<string, string>();
    uniqueSenders.forEach((sender, i) => {
      colorMap.set(sender, colors[i % colors.length]);
    });
    return colorMap;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-center text-sm text-zinc-500">
        <div>
          <p>No chat messages</p>
          <p className="mt-1 text-xs text-zinc-600">
            This meeting had no chat activity
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex max-h-[500px] flex-col gap-2 overflow-y-auto scroll-smooth pr-2"
    >
      {messages.map((message, index) => {
        const prevSender = index > 0 ? messages[index - 1].sender : null;
        const isNewSender = message.sender !== prevSender;
        const isCurrentOrPast = message.timestamp <= currentTime;
        const isActive = currentMessage?.id === message.id;

        return (
          <button
            key={message.id}
            ref={setMessageRef(message.id)}
            onClick={() => onSeek(message.timestamp)}
            className={`group flex flex-col rounded-lg px-3 py-2 text-left transition ${
              isActive
                ? "bg-indigo-500/20 light:bg-indigo-100"
                : isCurrentOrPast
                  ? "hover:bg-white/10 light:hover:bg-zinc-100"
                  : "opacity-50 hover:bg-white/5 light:hover:bg-zinc-50"
            }`}
          >
            {isNewSender && (
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: senderColors.get(message.sender) }}
                />
                <span className="text-xs font-medium text-zinc-300 light:text-zinc-700">
                  {message.sender}
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 text-sm text-zinc-100 light:text-zinc-900">
                {message.message}
              </p>
              <span className="shrink-0 text-xs text-zinc-500">
                {formatTime(message.timestamp)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
