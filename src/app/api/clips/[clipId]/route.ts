import { NextResponse } from "next/server";
import { getClipById, getRecordingById, deleteClip, dbRowToClip } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;

  try {
    const clipRow = await getClipById(clipId);

    if (!clipRow) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    const recording = await getRecordingById(clipRow.recording_id);
    const clip = {
      ...dbRowToClip(clipRow),
      recordingTitle: recording?.title ?? "Unknown Recording",
    };

    return NextResponse.json(clip);
  } catch (error) {
    console.error("Failed to fetch clip:", error);
    return NextResponse.json(
      { error: "Failed to fetch clip" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;

  try {
    const deleted = await deleteClip(clipId);

    if (!deleted) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete clip:", error);
    return NextResponse.json(
      { error: "Failed to delete clip" },
      { status: 500 }
    );
  }
}
