import { NextResponse } from "next/server";
import { getAllUniqueSpeakers } from "@/lib/db";

export async function GET() {
  try {
    const speakers = await getAllUniqueSpeakers();
    return NextResponse.json(speakers);
  } catch (error) {
    console.error("Failed to fetch speakers:", error);
    return NextResponse.json(
      { error: "Failed to fetch speakers" },
      { status: 500 }
    );
  }
}
