import { NextResponse } from "next/server";
import { getAllUniqueSpeakers } from "@/lib/db/d1";

export async function GET() {
  const speakers = await getAllUniqueSpeakers();
  return NextResponse.json(speakers);
}
