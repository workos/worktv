import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRecordingById,
  getSegmentsByRecordingId,
  getSpeakersByRecordingId,
  getParticipantsByRecordingId,
  getRelatedRecordings,
  getVideoFilesByRecordingId,
  getChatMessagesByRecordingId,
  getSummaryByRecordingId,
  isMediaUrlExpired,
  getClipById,
  getClipsByRecordingId,
  dbRowToRecording,
  dbRowToClip,
  type RecordingRow,
  type ParticipantRow,
} from "@/lib/db";
import { getRecording } from "@/data/mock-recordings";
import { getZoomAccessToken } from "@/lib/zoom/auth";
import { RecordingPlayer } from "./recording-player";
import { LocalDateTime } from "@/components/local-datetime";
import { NavTitle } from "@/components/nav-title";
import { EditableTitle } from "@/components/editable-title";
import type { AISummary, Clip } from "@/types/video";

const VIEW_TYPE_LABELS: Record<string, string> = {
  shared_screen_with_speaker_view: "Screen + Speaker",
  active_speaker: "Active Speaker",
  speaker_view: "Speaker",
  gallery_view: "Gallery",
  shared_screen: "Screen Only",
};

export default async function RecordingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clip?: string }>;
}) {
  const { id: rawId } = await params;
  const { clip: clipId } = await searchParams;
  const id = decodeURIComponent(rawId);

  // Try mock data first (for demo IDs)
  const mockRecording = getRecording(id);
  if (mockRecording) {
    return <RecordingPageContent recording={mockRecording} relatedRecordings={[]} videoViews={[]} summary={null} activeClip={null} clips={[]} participants={[]} />;
  }

  // Try D1 database
  const row = await getRecordingById(id);
  if (!row) {
    notFound();
  }

  const segments = await getSegmentsByRecordingId(id);
  const speakers = await getSpeakersByRecordingId(id);
  const participants = await getParticipantsByRecordingId(id);
  const relatedRecordings = await getRelatedRecordings(row.title, id);
  const videoFiles = await getVideoFilesByRecordingId(id);
  const chatMessages = await getChatMessagesByRecordingId(id);
  const summaryRow = await getSummaryByRecordingId(id);
  const clipRows = await getClipsByRecordingId(id);
  const clips = clipRows.map(dbRowToClip);

  // Get active clip if specified
  let activeClip: Clip | null = null;
  if (clipId) {
    const clipRow = await getClipById(clipId);
    if (clipRow && clipRow.recording_id === id) {
      activeClip = dbRowToClip(clipRow);
    }
  }

  let summary: AISummary | null = null;
  if (summaryRow) {
    try {
      summary = JSON.parse(summaryRow.content) as AISummary;
    } catch {
      console.error("Failed to parse stored summary for recording:", id);
    }
  }

  // Get fresh access token for video playback (returns null if Zoom not configured)
  let accessToken: string | undefined;
  try {
    accessToken = (await getZoomAccessToken()) ?? undefined;
  } catch (error) {
    console.warn("Failed to get Zoom access token:", error);
  }

  const recording = dbRowToRecording(row, segments, speakers, accessToken);

  // Check if Gong media URL has expired
  const mediaExpired =
    row.source === "gong" && isMediaUrlExpired(row.media_url_expires_at);

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
      mediaExpired={mediaExpired}
      activeClip={activeClip}
      clips={clips}
      participants={participants}
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
  mediaExpired = false,
  activeClip,
  clips,
  participants,
}: {
  recording: {
    id: string;
    title: string;
    customTitle?: string;
    description?: string;
    videoUrl: string;
    posterUrl?: string;
    duration: number;
    space: string;
    source?: string;
    mediaType?: "video" | "audio";
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
  mediaExpired?: boolean;
  activeClip: Clip | null;
  clips: Clip[];
  participants: ParticipantRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {mediaExpired && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 light:border-amber-300 light:bg-amber-50 light:text-amber-800">
          <span className="font-medium">Media URL expired.</span>{" "}
          <span className="text-amber-300 light:text-amber-600">
            Run <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs light:bg-amber-200">npm run sync:gong</code> to refresh the recording URL.
          </span>
        </div>
      )}

      <NavTitle>
        <div className="text-center">
          <EditableTitle
            recordingId={recording.id}
            originalTitle={recording.title}
            customTitle={recording.customTitle}
            className="truncate text-lg font-semibold"
          />
          <p className="text-xs text-zinc-400 light:text-zinc-500">
            <LocalDateTime
              iso={recording.createdAt}
              options={{
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              }}
            />
            {" · "}
            <LocalDateTime
              iso={recording.createdAt}
              options={{
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              }}
            />
          </p>
        </div>
      </NavTitle>

      <RecordingPlayer recording={recording} videoViews={videoViews} summary={summary} activeClip={activeClip} clips={clips} participants={participants} />

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
