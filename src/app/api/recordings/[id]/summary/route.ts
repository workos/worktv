import { NextResponse } from "next/server";
import {
  getSegmentsByRecordingId,
  getSummaryByRecordingId,
  upsertSummary,
} from "@/lib/db";
import { generateTranscriptSummary, SUMMARY_MODEL } from "@/lib/ai/summarize";
import type { AISummary } from "@/types/video";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const summaryRow = getSummaryByRecordingId(id);

    if (!summaryRow) {
      return NextResponse.json(
        { error: "Summary not found" },
        { status: 404 }
      );
    }

    const summary = JSON.parse(summaryRow.content) as AISummary;
    return NextResponse.json({
      summary,
      model: summaryRow.model,
      generatedAt: summaryRow.generated_at,
    });
  } catch (error) {
    console.error("Failed to fetch summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get transcript segments
    const segments = getSegmentsByRecordingId(id);

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this recording" },
        { status: 400 }
      );
    }

    // Transform to the expected format
    const transcriptSegments = segments.map((s) => ({
      id: s.id,
      startTime: s.start_time,
      endTime: s.end_time,
      speaker: s.speaker,
      text: s.text,
    }));

    // Generate new summary
    const summary = await generateTranscriptSummary(transcriptSegments);

    // Save to database
    upsertSummary({
      recordingId: id,
      content: JSON.stringify(summary),
      model: SUMMARY_MODEL,
    });

    return NextResponse.json({
      summary,
      model: SUMMARY_MODEL,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to regenerate summary:", error);
    return NextResponse.json(
      { error: "Failed to regenerate summary", details: String(error) },
      { status: 500 }
    );
  }
}
