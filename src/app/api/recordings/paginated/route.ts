import { NextResponse } from "next/server";
import {
  getRecordingsPaginated,
  getSpeakersByRecordingIds,
  getSummariesByRecordingIds,
} from "@/lib/db";
import type { AISummary } from "@/types/video";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") as "zoom" | "gong" | "all" | null;
  const cursor = searchParams.get("cursor") ?? undefined;
  const parsedLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 1), 100);
  const includeSummaries = searchParams.get("includeSummaries") === "true";

  const sourceFilter = source === "zoom" || source === "gong" ? source : "all";

  const result = getRecordingsPaginated(sourceFilter, limit, cursor);

  const speakersByRecording = getSpeakersByRecordingIds(
    result.items.map((r) => r.id)
  );

  // Fetch summaries if requested (for grid view)
  const summariesByRecording = includeSummaries
    ? getSummariesByRecordingIds(result.items.map((r) => r.id))
    : {};

  const recordingsWithMeta = result.items.map((recording) => {
    const speakers = speakersByRecording[recording.id] ?? [];
    const summaryRow = summariesByRecording[recording.id];
    let summaryBrief: string | null = null;
    if (summaryRow) {
      try {
        const parsed = JSON.parse(summaryRow.content) as AISummary;
        summaryBrief = parsed.brief || null;
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Invalid summary JSON for recording ${recording.id}:`, e);
        }
      }
    }
    return {
      ...recording,
      speakers,
      hasTranscript: speakers.length > 0,
      posterUrl: recording.poster_url,
      previewGifUrl: recording.preview_gif_url,
      summaryBrief,
      match_type: "title" as const,
      match_text: null,
      match_time: null,
    };
  });

  return NextResponse.json({
    recordings: recordingsWithMeta,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  });
}
