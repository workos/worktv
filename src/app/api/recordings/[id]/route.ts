import { NextResponse } from "next/server";
import {
  getRecordingDetails,
  getTranscriptContent,
} from "@/lib/zoom/recordings";
import { transformZoomMeeting } from "@/lib/zoom/transform";
import { updateRecordingCustomTitle, getRecordingById } from "@/lib/db";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json() as { customTitle?: string };
    const { customTitle } = body;

    // Verify recording exists
    const recording = getRecordingById(id);
    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Update custom title (null to revert to original)
    updateRecordingCustomTitle(id, customTitle ?? null);

    return NextResponse.json({ success: true, customTitle: customTitle ?? null });
  } catch (error) {
    console.error("Failed to update recording:", error);
    return NextResponse.json(
      { error: "Failed to update recording", details: String(error) },
      { status: 500 }
    );
  }
}
