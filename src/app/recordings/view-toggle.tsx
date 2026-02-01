"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ViewToggle({ currentView }: { currentView: "list" | "calendar" }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setView(view: "list" | "calendar") {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "calendar") {
      params.set("view", "calendar");
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
    </div>
  );
}
