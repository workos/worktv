"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useState,
  useTransition,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useSearch } from "./search-context";

interface Speaker {
  name: string;
  color: string;
  count: number;
}

export function SearchInput({
  defaultValue,
  defaultSpeakers,
}: {
  defaultValue?: string;
  defaultSpeakers?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startSearching } = useSearch();
  const [query, setQuery] = useState(defaultValue ?? "");
  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>(
    defaultSpeakers ?? []
  );
  const [isPending, startTransition] = useTransition();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [speakersError, setSpeakersError] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync state with URL params when they change (e.g., clicking "Clear")
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    const urlSpeakers = searchParams.getAll("speaker");
    setQuery(urlQuery);
    setSelectedSpeakers(urlSpeakers);
  }, [searchParams]);

  // Fetch speakers on mount
  useEffect(() => {
    fetch("/api/speakers")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch speakers");
        return res.json();
      })
      .then(setSpeakers)
      .catch((err) => {
        console.error("Failed to fetch speakers:", err);
        setSpeakersError(true);
      });
  }, []);

  // Filter speakers based on mention query and exclude already selected
  const filteredSpeakers = useMemo(() => {
    const availableSpeakers = speakers.filter(
      (s) => !selectedSpeakers.includes(s.name)
    );
    if (!mentionQuery) return availableSpeakers;
    const lower = mentionQuery.toLowerCase();
    return availableSpeakers.filter((s) => s.name.toLowerCase().includes(lower));
  }, [speakers, mentionQuery, selectedSpeakers]);

  // Reset highlighted index when filtered speakers change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredSpeakers]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      // Check if we're typing a mention
      const cursorPos = e.target.selectionStart ?? value.length;
      const textBeforeCursor = value.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");

      if (atIndex !== -1) {
        // Check there's no space between @ and cursor (still typing the mention)
        const textAfterAt = textBeforeCursor.slice(atIndex + 1);
        if (!textAfterAt.includes(" ")) {
          setMentionQuery(textAfterAt);
          setShowDropdown(true);
          return;
        }
      }

      setShowDropdown(false);
      setMentionQuery("");
    },
    []
  );

  const selectSpeaker = useCallback(
    (speaker: Speaker) => {
      // Remove the @mention text from query
      const cursorPos = inputRef.current?.selectionStart ?? query.length;
      const textBeforeCursor = query.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");
      let newQuery = query;
      if (atIndex !== -1) {
        newQuery = (query.slice(0, atIndex) + query.slice(cursorPos).trimStart()).trim();
      }

      // Add speaker to selected list
      const newSpeakers = [...selectedSpeakers, speaker.name];

      // Update local state
      setSelectedSpeakers(newSpeakers);
      setQuery(newQuery);
      setShowDropdown(false);
      setMentionQuery("");

      // Navigate with new speaker filter
      startSearching();
      startTransition(() => {
        const params = new URLSearchParams();
        // Preserve view and source params
        const view = searchParams.get("view");
        const source = searchParams.get("source");
        if (view) params.set("view", view);
        if (source) params.set("source", source);
        if (newQuery) params.set("q", newQuery);
        // Add all speakers
        for (const s of newSpeakers) {
          params.append("speaker", s);
        }
        router.push(`/recordings?${params.toString()}`);
      });
    },
    [query, selectedSpeakers, searchParams, router, startSearching, startTransition]
  );

  const removeSpeaker = useCallback(
    (speakerToRemove: string) => {
      const newSpeakers = selectedSpeakers.filter((s) => s !== speakerToRemove);
      setSelectedSpeakers(newSpeakers);

      // Navigate with updated speaker filter
      startSearching();
      startTransition(() => {
        const params = new URLSearchParams();
        // Preserve view and source params
        const view = searchParams.get("view");
        const source = searchParams.get("source");
        if (view) params.set("view", view);
        if (source) params.set("source", source);
        if (query.trim()) params.set("q", query.trim());
        // Add remaining speakers
        for (const s of newSpeakers) {
          params.append("speaker", s);
        }
        router.push(`/recordings?${params.toString()}`);
      });

      inputRef.current?.focus();
    },
    [selectedSpeakers, query, searchParams, router, startSearching, startTransition]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < filteredSpeakers.length - 1 ? i + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i > 0 ? i - 1 : filteredSpeakers.length - 1
        );
      } else if (e.key === "Enter" && filteredSpeakers.length > 0) {
        e.preventDefault();
        selectSpeaker(filteredSpeakers[highlightedIndex]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [showDropdown, filteredSpeakers, highlightedIndex, selectSpeaker]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showDropdown && filteredSpeakers.length > 0) {
      selectSpeaker(filteredSpeakers[highlightedIndex]);
      return;
    }
    startSearching();
    startTransition(() => {
      const params = new URLSearchParams();
      // Preserve view and source params
      const view = searchParams.get("view");
      const source = searchParams.get("source");
      if (view) params.set("view", view);
      if (source) params.set("source", source);
      if (query.trim()) params.set("q", query.trim());
      // Add all speakers
      for (const s of selectedSpeakers) {
        params.append("speaker", s);
      }
      router.push(`/recordings?${params.toString()}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex-1">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 transition focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 light:border-zinc-300 light:bg-white light:focus-within:border-indigo-500 light:focus-within:ring-indigo-500/30">
        {selectedSpeakers.map((speaker) => (
          <button
            key={speaker}
            type="button"
            onClick={() => removeSpeaker(speaker)}
            className="flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/30 light:bg-indigo-100 light:text-indigo-700 light:hover:bg-indigo-200"
          >
            <span>@{speaker}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3 w-3"
            >
              <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
            </svg>
          </button>
        ))}
        <input
          ref={inputRef}
          type="text"
          placeholder={
            selectedSpeakers.length > 0
              ? "Add more speakers or search..."
              : "Search recordings... (type @ to filter by speaker)"
          }
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none light:text-zinc-900 light:placeholder-zinc-400"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded p-1 text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50 light:text-zinc-500 light:hover:text-zinc-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Speaker autocomplete dropdown */}
      {showDropdown && filteredSpeakers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl light:border-zinc-200 light:bg-white"
        >
          {filteredSpeakers.map((speaker, index) => (
            <button
              key={speaker.name}
              type="button"
              onClick={() => selectSpeaker(speaker)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                index === highlightedIndex
                  ? "bg-indigo-500/20 text-zinc-100 light:bg-indigo-100 light:text-zinc-900"
                  : "text-zinc-300 hover:bg-white/5 light:text-zinc-700 light:hover:bg-zinc-100"
              }`}
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: speaker.color }}
              />
              <span className="flex-1 truncate">{speaker.name}</span>
              <span className="text-xs text-zinc-500">
                {speaker.count} meeting{speaker.count !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
