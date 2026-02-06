import { NextResponse } from "next/server";
import { getAllClipsWithRecordingTitle, dbRowToClip } from "@/lib/db";

export async function GET() {
  try {
    const clipRows = await getAllClipsWithRecordingTitle();
    const clips = clipRows.map((row) => ({
      ...dbRowToClip(row),
      recordingTitle: row.recording_title,
    }));

    return NextResponse.json(clips);
  } catch (error) {
    console.error("Failed to fetch clips:", error);
    return NextResponse.json(
      { error: "Failed to fetch clips" },
      { status: 500 }
    );
  }
}
