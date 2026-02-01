import Link from "next/link";
import { Suspense } from "react";
import {
  getAllRecordings,
  searchRecordings,
  searchRecordingsWithSpeaker,
  getSpeakersByRecordingIds,
} from "@/lib/db";
import { SearchInput } from "./search-input";
import { ViewToggle } from "./view-toggle";
import { CalendarView } from "./calendar-view";
import { LocalDateTime } from "@/components/local-datetime";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m`;
}

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; speaker?: string }>;
}) {
  const { q, view, speaker } = await searchParams;

  // Determine which query to run based on filters
  let recordings;
  if (speaker) {
    recordings = searchRecordingsWithSpeaker(q ?? "", speaker);
  } else if (q) {
    recordings = searchRecordings(q);
  } else {
    recordings = getAllRecordings();
  }

  const isCalendarView = view === "calendar";

  // Prepare recordings data for client components
  const speakersByRecording = getSpeakersByRecordingIds(
    recordings.map((r) => r.id)
  );

  const recordingsWithMeta = recordings.map((recording) => {
    const speakers = speakersByRecording[recording.id] ?? [];
    return {
      ...recording,
      speakers,
      hasTranscript: speakers.length > 0,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<div className="h-10 animate-pulse rounded-xl bg-zinc-800 light:bg-zinc-200" />}>
        <div className="flex items-center gap-3">
          <ViewToggle currentView={isCalendarView ? "calendar" : "list"} />
          <SearchInput defaultValue={q} defaultSpeaker={speaker} />
        </div>
      </Suspense>
      {(q || speaker) && (
        <div className="flex items-center gap-2 text-sm text-zinc-400 light:text-zinc-600">
          <span>
            {recordings.length} result{recordings.length !== 1 ? "s" : ""}
            {speaker && (
              <>
                {" "}with <span className="font-medium text-indigo-400 light:text-indigo-600">@{speaker}</span>
              </>
            )}
            {q && (
              <>
                {" "}for "{q}"
              </>
            )}
          </span>
          <Link
            href="/recordings"
            className="text-indigo-400 hover:text-indigo-300 light:text-indigo-600 light:hover:text-indigo-500"
          >
            Clear
          </Link>
        </div>
      )}

      {recordings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-8 text-center text-sm text-zinc-400 light:border-zinc-200 light:bg-white light:text-zinc-600">
          <p>No recordings found.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Run{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 light:bg-zinc-100">
              npm run sync
            </code>{" "}
            to pull recordings from Zoom.
          </p>
        </div>
      ) : isCalendarView ? (
        <CalendarView recordings={recordingsWithMeta} />
      ) : (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-2 light:border-zinc-200 light:bg-white">
          <div className="divide-y divide-white/10 light:divide-zinc-200">
            {recordingsWithMeta.map((recording) => (
              <Link
                key={recording.id}
                href={`/recordings/${encodeURIComponent(recording.id)}`}
                className="group grid gap-2 rounded-xl p-4 transition hover:bg-white/5 md:grid-cols-[1fr_auto] light:hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-50 light:text-zinc-900">
                    {recording.title}
                  </div>
                  {recording.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-400 light:text-zinc-500">
                      {recording.description}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatDuration(recording.duration)}
                    {recording.speakers.length > 0 && (
                      <span>
                        {" · "}
                        {recording.speakers.map((s) => s.name).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center text-xs text-zinc-500">
                  <LocalDateTime iso={recording.created_at} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
