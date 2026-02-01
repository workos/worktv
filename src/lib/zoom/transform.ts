import type { ZoomMeeting, ZoomRecordingFile } from "@/types/zoom";
import type { Recording, TranscriptSegment, Speaker } from "@/types/video";

export function parseTranscript(content: string): TranscriptSegment[] {
  // Try to detect format and parse accordingly
  if (content.startsWith("WEBVTT")) {
    return parseVttTranscript(content);
  }
  // Zoom JSON transcript format
  if (content.trim().startsWith("{") || content.trim().startsWith("[")) {
    return parseJsonTranscript(content);
  }
  // Try VTT anyway
  return parseVttTranscript(content);
}

function parseJsonTranscript(jsonContent: string): TranscriptSegment[] {
  try {
    const data = JSON.parse(jsonContent);
    const segments: TranscriptSegment[] = [];

    // Handle Zoom's transcript JSON format
    const items = Array.isArray(data) ? data : data.timeline || data.segments || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      segments.push({
        id: `seg-${i + 1}`,
        startTime: item.start_time ?? item.startTime ?? item.start ?? 0,
        endTime: item.end_time ?? item.endTime ?? item.end ?? 0,
        speaker: item.speaker ?? item.user_name ?? item.username ?? "Speaker",
        text: item.text ?? item.content ?? item.message ?? "",
      });
    }

    return segments;
  } catch (error) {
    console.error("[Zoom] Failed to parse JSON transcript:", error);
    return [];
  }
}

function parseVttTranscript(vttContent: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Handle both \r\n and \n line endings
  const normalizedContent = vttContent.replace(/\r\n/g, "\n");
  const blocks = normalizedContent.split(/\n\n+/);

  let id = 0;
  for (const block of blocks) {
    if (block.startsWith("WEBVTT") || !block.trim()) continue;

    const lines = block.split("\n").filter((l) => l.trim());

    // Find the line with the timestamp (might be first or second if there's a cue number)
    let timeLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLine = i;
        break;
      }
    }

    if (timeLine === -1) continue;

    const timeMatch = lines[timeLine].match(
      /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/
    );

    if (timeMatch && lines.length > timeLine + 1) {
      const startTime = parseVttTime(timeMatch[1]);
      const endTime = parseVttTime(timeMatch[2]);
      const text = lines.slice(timeLine + 1).join(" ").trim();

      if (!text) continue;

      // Try to extract speaker from text (format: "Speaker Name: text")
      const speakerMatch = text.match(/^([^:]+):\s*(.+)$/);

      segments.push({
        id: `seg-${++id}`,
        startTime,
        endTime,
        speaker: speakerMatch ? speakerMatch[1].trim() : "Speaker",
        text: speakerMatch ? speakerMatch[2].trim() : text,
      });
    }
  }

  return segments;
}

function parseVttTime(time: string): number {
  const normalized = time.replace(",", ".");
  const [hours, minutes, seconds] = normalized.split(":");
  const [secs, ms] = seconds.split(".");
  return (
    parseInt(hours) * 3600 +
    parseInt(minutes) * 60 +
    parseInt(secs) +
    parseInt(ms) / 1000
  );
}

export function extractSpeakers(segments: TranscriptSegment[]): Speaker[] {
  const speakerNames = [...new Set(segments.map((s) => s.speaker))];
  const colors = [
    "#6366f1",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
  ];

  return speakerNames.map((name, i) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    color: colors[i % colors.length],
  }));
}

export function findVideoFile(
  files: ZoomRecordingFile[]
): ZoomRecordingFile | undefined {
  const priority = [
    "shared_screen_with_speaker_view",
    "active_speaker",
    "speaker_view",
    "gallery_view",
    "shared_screen",
  ];

  for (const type of priority) {
    const file = files.find(
      (f) =>
        f.file_type === "MP4" &&
        f.recording_type === type &&
        f.status === "completed"
    );
    if (file) return file;
  }

  return files.find((f) => f.file_type === "MP4" && f.status === "completed");
}

export function findTranscriptFile(
  files: ZoomRecordingFile[]
): ZoomRecordingFile | undefined {
  return files.find(
    (f) =>
      (f.file_type === "TRANSCRIPT" || f.recording_type === "audio_transcript") &&
      f.status === "completed"
  );
}

export function transformZoomMeetingToListItem(meeting: ZoomMeeting): {
  id: string;
  title: string;
  space: string;
  duration: string;
  speakers: number;
  status: string;
  createdAt: string;
} | null {
  const videoFile = findVideoFile(meeting.recording_files);
  if (!videoFile) return null;

  const mins = meeting.duration;
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

  return {
    id: meeting.uuid,
    title: meeting.topic,
    space: "Zoom Meetings",
    duration,
    speakers: meeting.participant_audio_files?.length || 0,
    status: meeting.recording_files.every((f) => f.status === "completed")
      ? "Processed"
      : "Processing",
    createdAt: meeting.start_time,
  };
}

export async function transformZoomMeeting(
  meeting: ZoomMeeting,
  downloadAccessToken?: string,
  fetchTranscript?: (url: string) => Promise<string>
): Promise<Recording | null> {
  const videoFile = findVideoFile(meeting.recording_files);
  if (!videoFile) return null;

  const transcriptFile = findTranscriptFile(meeting.recording_files);
  let transcript: TranscriptSegment[] = [];
  let speakers: Speaker[] = [];

  if (transcriptFile && fetchTranscript) {
    try {
      const content = await fetchTranscript(transcriptFile.download_url);
      transcript = parseTranscript(content);
      speakers = extractSpeakers(transcript);
    } catch (error) {
      console.error("[Zoom] Failed to fetch transcript:", error);
    }
  }

  // Build video URL with access token for authenticated playback
  const videoUrl = downloadAccessToken
    ? `${videoFile.download_url}?access_token=${downloadAccessToken}`
    : videoFile.download_url;

  return {
    id: meeting.uuid,
    title: meeting.topic,
    description: `Zoom meeting recorded on ${new Date(meeting.start_time).toLocaleDateString()}`,
    videoUrl,
    posterUrl: undefined,
    duration: meeting.duration * 60,
    space: "Zoom Meetings",
    createdAt: meeting.start_time,
    speakers,
    transcript,
  };
}
