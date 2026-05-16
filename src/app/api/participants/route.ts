import { NextResponse } from "next/server";
import { getAllUniqueParticipants } from "@/lib/db/d1";

export async function GET() {
  try {
    const participants = await getAllUniqueParticipants();
    return NextResponse.json(participants);
  } catch (error) {
    console.error("Failed to fetch participants:", error);
    return NextResponse.json({ error: "Failed to fetch participants" }, { status: 500 });
  }
}
