import { NextResponse } from "next/server";
import {
  getRecordingDetails,
  getTranscriptContent,
} from "@/lib/zoom/recordings";
import { transformZoomMeeting } from "@/lib/zoom/transform";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const details = await getRecordingDetails(id);

    const recording = await transformZoomMeeting(
      details,
      details.download_access_token,
      getTranscriptContent
    );

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found or not ready" },
        { status: 404 }
      );
    }

    return NextResponse.json(recording);
  } catch (error) {
    console.error("Failed to fetch recording:", error);
    return NextResponse.json(
      { error: "Failed to fetch recording", details: String(error) },
      { status: 500 }
    );
  }
}
