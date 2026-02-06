import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { getClipById, getRecordingById, dbRowToClip } from "@/lib/db";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clipId: string }>;
}): Promise<Metadata> {
  const { clipId } = await params;
  const clipRow = await getClipById(clipId);

  if (!clipRow) {
    return { title: "Clip Not Found" };
  }

  const recording = await getRecordingById(clipRow.recording_id);
  const clip = dbRowToClip(clipRow);
  const duration = formatDuration(clip.endTime - clip.startTime);
  const recordingTitle = recording?.custom_title ?? recording?.title ?? "Recording";
  const title = clip.title || `Clip from ${recordingTitle}`;
  const description = `${duration} clip from "${recordingTitle}"`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      url: `/c/${clipId}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ClipRedirectPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;
  const clipRow = await getClipById(clipId);

  if (!clipRow) {
    notFound();
  }

  redirect(`/recordings/${encodeURIComponent(clipRow.recording_id)}?clip=${clipId}`);
}
