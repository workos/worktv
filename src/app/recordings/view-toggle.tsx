"use client";

import { useRouter, useSearchParams } from "next/navigation";

type ViewType = "list" | "calendar" | "clips";

export function ViewToggle({ currentView }: { currentView: ViewType }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setView(view: ViewType) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "calendar") {
      params.set("view", "calendar");
    } else if (view === "clips") {
      params.set("view", "clips");
    } else {
      params.delete("view");
    }
    router.push(`/recordings?${params.toString()}`);
  }

  return (
    <div className="flex rounded-lg border border-white/10 bg-zinc-900/50 p-1 light:border-zinc-300 light:bg-white">
      <button
        onClick={() => setView("list")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          currentView === "list"
            ? "bg-white/10 text-zinc-100 light:bg-zinc-200 light:text-zinc-900"
            : "text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-700"
        }`}
        title="List view"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <button
        onClick={() => setView("calendar")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          currentView === "calendar"
            ? "bg-white/10 text-zinc-100 light:bg-zinc-200 light:text-zinc-900"
            : "text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-700"
        }`}
        title="Calendar view"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <button
        onClick={() => setView("clips")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          currentView === "clips"
            ? "bg-white/10 text-zinc-100 light:bg-zinc-200 light:text-zinc-900"
            : "text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-700"
        }`}
        title="Clips"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M1.469 3.75a3.5 3.5 0 005.617 4.11l.883.51a.75.75 0 00.75-1.3l-.884-.51A3.518 3.518 0 008 5.25a3.5 3.5 0 00-6.531-1.5zM3.5 5.25a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.634 4.97L18.75 15.5a.75.75 0 01-.75 1.299L8.384 11.52a.75.75 0 01.75-1.3zm-2.103 1.9a3.5 3.5 0 00-5.562 4.13A3.5 3.5 0 008 14.75a3.518 3.518 0 00-.165-1.06l.884-.51a.75.75 0 00-.75-1.3l-.883.51a3.483 3.483 0 00-.055-.17zM4.5 16.25a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"
            clipRule="evenodd"
          />
          <path d="M10.116 9.192a.75.75 0 01.374-.991l8.76-3.94a.75.75 0 01.618 1.366l-8.76 3.94a.75.75 0 01-.992-.375z" />
        </svg>
      </button>
    </div>
  );
}
