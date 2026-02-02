import { NextResponse } from "next/server";
import { generateClipTitle } from "@/lib/ai/summarize";
import type { TranscriptSegment } from "@/types/video";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clipSegments, fullTranscript } = body as {
      clipSegments: TranscriptSegment[];
      fullTranscript?: TranscriptSegment[];
    };

    if (!clipSegments || !Array.isArray(clipSegments)) {
      return NextResponse.json(
        { error: "clipSegments array is required" },
        { status: 400 }
      );
    }

    if (clipSegments.length === 0) {
      return NextResponse.json({ title: "" });
    }

    const title = await generateClipTitle(clipSegments, fullTranscript);
    return NextResponse.json({ title });
  } catch (error) {
    console.error("Error generating clip title:", error);
    return NextResponse.json(
      { error: "Failed to generate clip title" },
      { status: 500 }
    );
  }
}
