import { NextResponse } from "next/server";
import { listRecordings } from "@/lib/zoom/recordings";
import { transformZoomMeetingToListItem } from "@/lib/zoom/transform";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const pageSize = searchParams.get("pageSize")
    ? parseInt(searchParams.get("pageSize")!)
    : 30;

  try {
    const response = await listRecordings("me", { from, to, pageSize });

    const recordings = response.meetings
      .map(transformZoomMeetingToListItem)
      .filter(Boolean);

    return NextResponse.json({
      recordings,
      totalRecords: response.total_records,
      nextPageToken: response.next_page_token,
    });
  } catch (error) {
    console.error("Failed to fetch recordings:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings", details: String(error) },
      { status: 500 }
    );
  }
}
