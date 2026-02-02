import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRecordingById,
  getSegmentsByRecordingId,
  getSpeakersByRecordingId,
  getRelatedRecordings,
  getVideoFilesByRecordingId,
  getChatMessagesByRecordingId,
  getSummaryByRecordingId,
  dbRowToRecording,
  type RecordingRow,
} from "@/lib/db";
import { getRecording } from "@/data/mock-recordings";
import { getZoomAccessToken } from "@/lib/zoom/auth";
import { RecordingPlayer } from "./recording-player";
import { LocalDateTime } from "@/components/local-datetime";
import { SummaryPanel } from "@/components/summary/summary-panel";
import type { AISummary } from "@/types/video";

const VIEW_TYPE_LABELS: Record<string, string> = {
  shared_screen_with_speaker_view: "Screen + Speaker",
  active_speaker: "Active Speaker",
  speaker_view: "Speaker",
  gallery_view: "Gallery",
  shared_screen: "Screen Only",
};

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  // Try mock data first (for demo IDs)
  const mockRecording = getRecording(id);
  if (mockRecording) {
    return <RecordingPageContent recording={mockRecording} relatedRecordings={[]} videoViews={[]} summary={null} />;
  }

  // Try SQLite database
  const row = getRecordingById(id);
  if (!row) {
    notFound();
  }

  const segments = getSegmentsByRecordingId(id);
  const speakers = getSpeakersByRecordingId(id);
  const relatedRecordings = getRelatedRecordings(row.title, id);
  const videoFiles = getVideoFilesByRecordingId(id);
  const chatMessages = getChatMessagesByRecordingId(id);
  const summaryRow = getSummaryByRecordingId(id);
  let summary: AISummary | null = null;
  if (summaryRow) {
    try {
      summary = JSON.parse(summaryRow.content) as AISummary;
    } catch {
      console.error("Failed to parse stored summary for recording:", id);
    }
  }

  // Get fresh access token for video playback (optional - videos work without it in some cases)
  let accessToken: string | undefined;
  const hasZoomCredentials = process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET;
  if (hasZoomCredentials) {
    try {
      accessToken = await getZoomAccessToken();
    } catch (error) {
      console.warn("Failed to get Zoom access token:", error);
    }
  }

  const recording = dbRowToRecording(row, segments, speakers, accessToken);

  // Transform video files with labels and access token
  const videoViews = videoFiles.map((vf) => ({
    viewType: vf.view_type,
    label: VIEW_TYPE_LABELS[vf.view_type] || vf.view_type,
    videoUrl: accessToken
      ? `${vf.video_url}?access_token=${accessToken}`
      : vf.video_url,
  }));

  // Transform chat messages
  const chatMessagesFormatted = chatMessages.map((cm) => ({
    id: cm.id,
    timestamp: cm.timestamp,
    sender: cm.sender,
    message: cm.message,
  }));

  return (
    <RecordingPageContent
      recording={{ ...recording, chatMessages: chatMessagesFormatted }}
      relatedRecordings={relatedRecordings}
      videoViews={videoViews}
      summary={summary}
    />
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m`;
}

function RecordingPageContent({
  recording,
  relatedRecordings,
  videoViews,
  summary,
}: {
  recording: {
    id: string;
    title: string;
    description?: string;
    videoUrl: string;
    posterUrl?: string;
    duration: number;
    space: string;
    createdAt: string;
    speakers: { id: string; name: string; color: string }[];
    transcript: {
      id: string;
      startTime: number;
      endTime: number;
      speaker: string;
      text: string;
    }[];
    chatMessages?: {
      id: string;
      timestamp: number;
      sender: string;
      message: string;
    }[];
  };
  relatedRecordings: RecordingRow[];
  videoViews: { viewType: string; label: string; videoUrl: string }[];
  summary: AISummary | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6 light:border-zinc-200 light:bg-white">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">
            {recording.title}
          </h1>
          {recording.description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-300 light:text-zinc-600">{recording.description}</p>
          )}
        </div>
      </header>

      <SummaryPanel summary={summary} recordingId={recording.id} hasTranscript={recording.transcript.length > 0} />

      <RecordingPlayer recording={recording} videoViews={videoViews} />

      {relatedRecordings.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 light:border-zinc-200 light:bg-white">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300 light:text-zinc-700">
            Other instances of this meeting
          </h2>
          <div className="divide-y divide-white/10 light:divide-zinc-200">
            {relatedRecordings.map((related) => (
              <Link
                key={related.id}
                href={`/recordings/${encodeURIComponent(related.id)}`}
                className="flex items-center justify-between py-2 text-sm transition hover:text-zinc-100 light:hover:text-zinc-900"
              >
                <span className="text-zinc-300 light:text-zinc-600">
                  <LocalDateTime
                    iso={related.created_at}
                    options={{
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }}
                  />
                </span>
                <span className="text-xs text-zinc-500">
                  {formatDuration(related.duration)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
