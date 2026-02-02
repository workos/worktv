import { NextResponse } from "next/server";
import {
  getRecordingsPaginated,
  getSpeakersByRecordingIds,
} from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") as "zoom" | "gong" | "all" | null;
  const cursor = searchParams.get("cursor") ?? undefined;
  const parsedLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 1), 100);

  const sourceFilter = source === "zoom" || source === "gong" ? source : "all";

  const result = getRecordingsPaginated(sourceFilter, limit, cursor);

  const speakersByRecording = getSpeakersByRecordingIds(
    result.items.map((r) => r.id)
  );

  const recordingsWithMeta = result.items.map((recording) => {
    const speakers = speakersByRecording[recording.id] ?? [];
    return {
      ...recording,
      speakers,
      hasTranscript: speakers.length > 0,
      posterUrl: recording.poster_url,
      previewGifUrl: recording.preview_gif_url,
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
