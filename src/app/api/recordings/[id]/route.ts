import { NextResponse } from "next/server";
import {
  getRecordingById,
  updateRecordingCustomTitle,
} from "@/lib/db/d1";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const recording = await getRecordingById(id);

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
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

    const recording = await getRecordingById(id);
    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    await updateRecordingCustomTitle(id, customTitle ?? null);

    return NextResponse.json({ success: true, customTitle: customTitle ?? null });
  } catch (error) {
    console.error("Failed to update recording:", error);
    return NextResponse.json(
      { error: "Failed to update recording", details: String(error) },
      { status: 500 }
    );
  }
}
