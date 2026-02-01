import { NextResponse } from "next/server";
import { getAllUniqueSpeakers } from "@/lib/db";

export async function GET() {
  const speakers = getAllUniqueSpeakers();
  return NextResponse.json(speakers);
}
