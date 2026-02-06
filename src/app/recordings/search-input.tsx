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

interface Participant {
  email: string;
  name: string;
  count: number;
}

type FilterItem =
  | { type: "speaker"; data: Speaker }
  | { type: "participant"; data: Participant };

export function SearchInput({
  defaultValue,
  defaultSpeakers,
  defaultParticipant,
}: {
  defaultValue?: string;
  defaultSpeakers?: string[];
  defaultParticipant?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startSearching } = useSearch();
  const [query, setQuery] = useState(defaultValue ?? "");
  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>(
    defaultSpeakers ?? []
  );
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(
    defaultParticipant ?? null
  );
  const [isPending, startTransition] = useTransition();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync state with URL params when they change (e.g., clicking "Clear")
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    const urlSpeakers = searchParams.getAll("speaker");
    const urlParticipant = searchParams.get("participant");
    setQuery(urlQuery);
    setSelectedSpeakers(urlSpeakers);
    setSelectedParticipant(urlParticipant);
  }, [searchParams]);

  // Fetch speakers and participants on mount
  useEffect(() => {
    fetch("/api/speakers")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch speakers");
        return res.json() as Promise<Speaker[]>;
      })
      .then(setSpeakers)
      .catch((err) => {
        console.error("Failed to fetch speakers:", err);
      });

    fetch("/api/participants")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch participants");
        return res.json() as Promise<Participant[]>;
      })
      .then(setParticipants)
      .catch((err) => {
        console.error("Failed to fetch participants:", err);
      });
  }, []);

  // Combine and filter items based on mention query, excluding already selected speakers
  const filteredItems = useMemo(() => {
    const items: FilterItem[] = [];
    const lower = mentionQuery.toLowerCase();

    // Add matching speakers (excluding already selected)
    for (const speaker of speakers) {
      if (selectedSpeakers.includes(speaker.name)) continue;
      if (!mentionQuery || speaker.name.toLowerCase().includes(lower)) {
        items.push({ type: "speaker", data: speaker });
      }
    }

    // Add matching participants (only if no speakers selected)
    if (selectedSpeakers.length === 0) {
      for (const participant of participants) {
        if (!mentionQuery ||
            participant.email.toLowerCase().includes(lower) ||
            participant.name.toLowerCase().includes(lower)) {
          items.push({ type: "participant", data: participant });
        }
      }
    }

    // Sort by count (descending)
    return items.sort((a, b) => b.data.count - a.data.count);
  }, [speakers, participants, mentionQuery, selectedSpeakers]);

  // Reset highlighted index when filtered items change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredItems]);

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

  // Global "/" hotkey to focus search
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger if already typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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

  const selectItem = useCallback(
    (item: FilterItem) => {
      // Remove the @mention text from query
      const cursorPos = inputRef.current?.selectionStart ?? query.length;
      const textBeforeCursor = query.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");
      let newQuery = query;
      if (atIndex !== -1) {
        newQuery = (query.slice(0, atIndex) + query.slice(cursorPos).trimStart()).trim();
      }

      let newSpeakers = selectedSpeakers;
      let newParticipant = selectedParticipant;

      if (item.type === "speaker") {
        // Add speaker to selected list, clear participant
        newSpeakers = [...selectedSpeakers, item.data.name];
        newParticipant = null;
      } else {
        // Set participant, clear speakers
        newParticipant = item.data.email;
        newSpeakers = [];
      }

      // Update local state
      setSelectedSpeakers(newSpeakers);
      setSelectedParticipant(newParticipant);
      setQuery(newQuery);
      setShowDropdown(false);
      setMentionQuery("");

      // Navigate with new filter
      startSearching();
      startTransition(() => {
        const params = new URLSearchParams();
        // Preserve view and source params
        const view = searchParams.get("view");
        const source = searchParams.get("source");
        if (view) params.set("view", view);
        if (source) params.set("source", source);
        if (newQuery) params.set("q", newQuery);
        // Add speakers or participant
        if (newSpeakers.length > 0) {
          for (const s of newSpeakers) {
            params.append("speaker", s);
          }
        } else if (newParticipant) {
          params.set("participant", newParticipant);
        }
        router.push(`/?${params.toString()}`);
      });
    },
    [query, selectedSpeakers, selectedParticipant, searchParams, router, startSearching, startTransition]
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
        router.push(`/?${params.toString()}`);
      });

      inputRef.current?.focus();
    },
    [selectedSpeakers, query, searchParams, router, startSearching, startTransition]
  );

  const removeParticipant = useCallback(() => {
    setSelectedParticipant(null);

    // Navigate without participant filter
    startSearching();
    startTransition(() => {
      const params = new URLSearchParams();
      // Preserve view and source params
      const view = searchParams.get("view");
      const source = searchParams.get("source");
      if (view) params.set("view", view);
      if (source) params.set("source", source);
      if (query.trim()) params.set("q", query.trim());
      router.push(`/?${params.toString()}`);
    });

    inputRef.current?.focus();
  }, [query, searchParams, router, startSearching, startTransition]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < filteredItems.length - 1 ? i + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i > 0 ? i - 1 : filteredItems.length - 1
        );
      } else if (e.key === "Enter" && filteredItems.length > 0) {
        e.preventDefault();
        selectItem(filteredItems[highlightedIndex]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [showDropdown, filteredItems, highlightedIndex, selectItem]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showDropdown && filteredItems.length > 0) {
      selectItem(filteredItems[highlightedIndex]);
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
      // Add all speakers or participant
      if (selectedSpeakers.length > 0) {
        for (const s of selectedSpeakers) {
          params.append("speaker", s);
        }
      } else if (selectedParticipant) {
        params.set("participant", selectedParticipant);
      }
      router.push(`/?${params.toString()}`);
    });
  }

  const hasFilter = selectedSpeakers.length > 0 || selectedParticipant;

  return (
    <form onSubmit={handleSubmit} className="relative flex-1">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 transition focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 light:border-zinc-300 light:bg-white light:focus-within:border-indigo-500 light:focus-within:ring-indigo-500/30">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 text-zinc-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
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
        {selectedParticipant && (
          <button
            type="button"
            onClick={removeParticipant}
            className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30 light:bg-emerald-100 light:text-emerald-700 light:hover:bg-emerald-200"
          >
            <span>{selectedParticipant}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3 w-3"
            >
              <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
            </svg>
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={
            hasFilter
              ? "Add more filters or search..."
              : "Search recordings... (type @ to filter by speaker)"
          }
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none light:text-zinc-900 light:placeholder-zinc-400"
        />
        {!isFocused && !query && !hasFilter && (
          <kbd className="hidden shrink-0 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs font-medium text-zinc-400 sm:inline-block light:border-zinc-300 light:bg-zinc-100 light:text-zinc-500">
            /
          </kbd>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl light:border-zinc-200 light:bg-white"
        >
          {filteredItems.map((item, index) => (
            <button
              key={item.type === "speaker" ? `s-${item.data.name}` : `p-${item.data.email}`}
              type="button"
              onClick={() => selectItem(item)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                index === highlightedIndex
                  ? "bg-indigo-500/20 text-zinc-100 light:bg-indigo-100 light:text-zinc-900"
                  : "text-zinc-300 hover:bg-white/5 light:text-zinc-700 light:hover:bg-zinc-100"
              }`}
            >
              {item.type === "speaker" ? (
                <>
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.data.color }}
                  />
                  <span className="flex-1 truncate">{item.data.name}</span>
                </>
              ) : (
                <>
                  <svg className="h-3 w-3 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div className="flex-1 truncate">
                    <span>{item.data.name}</span>
                    <span className="ml-1 text-zinc-500">{item.data.email}</span>
                  </div>
                </>
              )}
              <span className="text-xs text-zinc-500">
                {item.data.count} meeting{item.data.count !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
