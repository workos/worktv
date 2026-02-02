import Link from "next/link";
import { LocalDateTime } from "@/components/local-datetime";

interface Speaker {
  id: string;
  name: string;
  color: string;
}

interface RecordingGridCardProps {
  id: string;
  title: string;
  customTitle: string | null;
  source: string;
  duration: number;
  createdAt: string;
  speakers: Speaker[];
  posterUrl: string | null;
  previewGifUrl: string | null;
  summaryBrief: string | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, "0")}:00`;
  }
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingGridCard({
  id,
  title,
  customTitle,
  source,
  duration,
  createdAt,
  speakers,
  posterUrl,
  previewGifUrl,
  summaryBrief,
}: RecordingGridCardProps) {
  const displayTitle = customTitle ?? title;

  return (
    <Link
      href={`/recordings/${encodeURIComponent(id)}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 transition hover:border-white/20 hover:bg-zinc-800/50 light:border-zinc-200 light:bg-white light:hover:border-zinc-300 light:hover:bg-zinc-50"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-800 light:bg-zinc-200">
        {/* Poster image - stays visible, GIF layers on top */}
        {posterUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={posterUrl}
            alt={displayTitle}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* GIF on hover - fades in on top of poster */}
        {previewGifUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewGifUrl}
            alt={displayTitle}
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        )}
        {/* Placeholder when no images */}
        {!posterUrl && !previewGifUrl && (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-12 w-12 text-zinc-600 light:text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Source badge - upper right */}
        <div
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            source === "gong"
              ? "bg-violet-500/90 text-white"
              : "bg-blue-500/90 text-white"
          }`}
        >
          {source === "gong" ? "Gong" : "Zoom"}
        </div>

        {/* Duration badge - bottom right */}
        <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(duration)}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Title */}
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-50 light:text-zinc-900">
          {displayTitle}
        </h3>

        {/* Summary brief */}
        {summaryBrief && (
          <p className="line-clamp-2 text-xs text-zinc-400 light:text-zinc-500">
            {summaryBrief}
          </p>
        )}

        {/* Attendees and date */}
        <div className="mt-auto flex flex-col gap-1 pt-1">
          {speakers.length > 0 && (
            <div className="line-clamp-1 text-xs text-zinc-500">
              {speakers.map((s) => s.name).join(", ")}
            </div>
          )}
          <div className="text-xs text-zinc-600">
            <LocalDateTime iso={createdAt} />
          </div>
        </div>
      </div>
    </Link>
  );
}
