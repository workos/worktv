import { config } from "dotenv";
import Database from "better-sqlite3";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { parseTranscript as parseZoomTranscript, extractSpeakers as extractZoomSpeakers } from "@/lib/zoom/transform";

// Load .env.local file
config({ path: join(process.cwd(), ".env.local") });

// Types
interface ZoomAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ZoomRecordingFile {
  id: string;
  file_type: string;
  recording_type: string;
  download_url: string;
  status: string;
}

interface ZoomMeeting {
  uuid: string;
  topic: string;
  start_time: string;
  duration: number;
  recording_files: ZoomRecordingFile[];
  agenda?: string;
}

interface ZoomMeetingSummary {
  meeting_host_id: string;
  meeting_host_email: string;
  meeting_uuid: string;
  meeting_id: number;
  meeting_topic: string;
  meeting_start_time: string;
  meeting_end_time: string;
  summary_start_time: string;
  summary_end_time: string;
  summary_created_time: string;
  summary_last_modified_time: string;
  summary_title: string;
  summary_overview: string;
  summary_details?: {
    label: string;
    summary: string;
  }[];
  next_steps?: string[];
  edited_summary?: {
    summary_overview?: string;
    summary_details?: {
      label: string;
      summary: string;
    }[];
    next_steps?: string[];
  };
}

interface ZoomRecordingsResponse {
  meetings: ZoomMeeting[];
  next_page_token?: string;
}

interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

interface Speaker {
  id: string;
  name: string;
  color: string;
}

// Config
const DB_PATH = join(process.cwd(), "data", "recordings.db");
const SCHEMA_PATH = join(process.cwd(), "src", "lib", "db", "schema.sql");

// Zoom API
async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Missing Zoom credentials in environment variables");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as ZoomAccessToken;
  return data.access_token;
}

// Fetch a single 30-day window of recordings (with pagination)
async function fetchDateRange(
  accessToken: string,
  from: string,
  to: string
): Promise<ZoomMeeting[]> {
  const meetings: ZoomMeeting[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = new URL("https://api.zoom.us/v2/users/me/recordings");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) {
      url.searchParams.set("next_page_token", nextPageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list recordings: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as ZoomRecordingsResponse;

    if (data.meetings) {
      meetings.push(...data.meetings);
    }

    nextPageToken = data.next_page_token;
  } while (nextPageToken);

  return meetings;
}

async function listRecordings(accessToken: string, years: number = 3, parallelWindows: number = 6): Promise<ZoomMeeting[]> {
  // Zoom API only allows 30-day ranges, so we need to make multiple requests
  const now = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);

  // Build all date ranges first
  const dateRanges: { from: string; to: string }[] = [];
  let currentEnd = new Date(now);

  while (currentEnd > startDate) {
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - 30);

    // Don't go before start date
    if (currentStart < startDate) {
      currentStart.setTime(startDate.getTime());
    }

    dateRanges.push({
      from: currentStart.toISOString().split("T")[0],
      to: currentEnd.toISOString().split("T")[0],
    });

    // Move to previous 30-day window
    currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() - 1);
  }

  console.log(`   Fetching ${dateRanges.length} date ranges (${parallelWindows} parallel)...`);

  // Fetch all date ranges in parallel
  const results = await processInParallel(
    dateRanges,
    async (range) => {
      const meetings = await fetchDateRange(accessToken, range.from, range.to);
      console.log(`   ✓ ${range.from} to ${range.to}: ${meetings.length} recordings`);
      return meetings;
    },
    parallelWindows
  );

  // Flatten results
  return results.flat();
}

async function getRecordingDetails(
  accessToken: string,
  meetingId: string
): Promise<ZoomMeeting & { download_access_token?: string }> {
  const encodedId =
    meetingId.startsWith("/") || meetingId.includes("//")
      ? encodeURIComponent(encodeURIComponent(meetingId))
      : encodeURIComponent(meetingId);

  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodedId}/recordings?include_fields=download_access_token`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to get recording details: ${response.status} - ${error}`
    );
  }

  return response.json();
}

async function getMeetingSummary(
  accessToken: string,
  meetingId: string
): Promise<string | undefined> {
  const encodedId =
    meetingId.startsWith("/") || meetingId.includes("//")
      ? encodeURIComponent(encodeURIComponent(meetingId))
      : encodeURIComponent(meetingId);

  try {
    const response = await fetch(
      `https://api.zoom.us/v2/meetings/${encodedId}/meeting_summary`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      // Summary not available (404) or feature not enabled
      return undefined;
    }

    const data = (await response.json()) as ZoomMeetingSummary;

    // Prefer edited summary if available
    const overview = data.edited_summary?.summary_overview || data.summary_overview;
    return overview || undefined;
  } catch {
    return undefined;
  }
}

async function fetchTranscript(
  accessToken: string,
  url: string
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  return response.text();
}

const VIEW_PRIORITY = [
  "shared_screen_with_speaker_view",
  "active_speaker",
  "speaker_view",
  "gallery_view",
  "shared_screen",
];

function findVideoFile(files: ZoomRecordingFile[]): ZoomRecordingFile | undefined {
  for (const type of VIEW_PRIORITY) {
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

function findAllVideoFiles(files: ZoomRecordingFile[]): ZoomRecordingFile[] {
  return files.filter(
    (f) => f.file_type === "MP4" && f.status === "completed"
  );
}

function findTranscriptFile(
  files: ZoomRecordingFile[]
): ZoomRecordingFile | undefined {
  return files.find(
    (f) =>
      (f.file_type === "TRANSCRIPT" || f.recording_type === "audio_transcript") &&
      f.status === "completed"
  );
}

function findChatFile(
  files: ZoomRecordingFile[]
): ZoomRecordingFile | undefined {
  return files.find(
    (f) => f.file_type === "CHAT" && f.status === "completed"
  );
}

interface ChatMessage {
  id: string;
  timestamp: number;
  sender: string;
  message: string;
}

async function fetchChatFile(
  accessToken: string,
  url: string
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch chat: ${response.status}`);
  }

  return response.text();
}

function parseChatFile(content: string, meetingStartTime: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const lines = content.split("\n");
  const meetingStart = new Date(meetingStartTime);

  let id = 0;
  for (const line of lines) {
    if (!line.trim()) continue;

    // Zoom chat format: "HH:MM:SS\tFrom Sender Name : message" or "HH:MM:SS\tFrom Sender Name to Everyone : message"
    const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+From\s+(.+?)(?:\s+to\s+.+?)?\s*:\s*(.+)$/);
    if (match) {
      const [, timeStr, sender, message] = match;
      const [hours, minutes, seconds] = timeStr.split(":").map(Number);

      const messageTime = new Date(meetingStart);
      messageTime.setHours(hours, minutes, seconds, 0);
      // If the chat timestamp is earlier than meeting start (crossed midnight), roll to next day
      if (messageTime < meetingStart) {
        messageTime.setDate(messageTime.getDate() + 1);
      }

      const timestamp =
        (messageTime.getTime() - meetingStart.getTime()) / 1000;

      messages.push({
        id: `chat-${++id}`,
        timestamp,
        sender: sender.trim(),
        message: message.trim(),
      });
    }
  }

  return messages;
}

// Database operations
function initDb(): Database.Database {
  // Ensure data directory exists
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  return db;
}

function upsertRecording(
  db: Database.Database,
  recording: {
    id: string;
    title: string;
    description?: string;
    videoUrl: string;
    duration: number;
    space: string;
    source: string;
    createdAt: string;
  }
): void {
  db.prepare(
    `INSERT OR REPLACE INTO recordings (id, title, description, video_url, duration, space, source, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    recording.id,
    recording.title,
    recording.description,
    recording.videoUrl,
    recording.duration,
    recording.space,
    recording.source,
    recording.createdAt,
    new Date().toISOString()
  );
}

function deleteRecordingData(db: Database.Database, recordingId: string): void {
  db.prepare(`DELETE FROM segments WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM speakers WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM video_files WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM chat_messages WHERE recording_id = ?`).run(recordingId);
}

function insertSegments(
  db: Database.Database,
  recordingId: string,
  segments: TranscriptSegment[]
): void {
  const stmt = db.prepare(
    `INSERT INTO segments (id, recording_id, start_time, end_time, speaker, text)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((segs: TranscriptSegment[]) => {
    for (const seg of segs) {
      stmt.run(
        `${recordingId}-${seg.id}`,
        recordingId,
        seg.startTime,
        seg.endTime,
        seg.speaker,
        seg.text
      );
    }
  });

  insertMany(segments);
}

function insertSpeakers(
  db: Database.Database,
  recordingId: string,
  speakers: Speaker[]
): void {
  const stmt = db.prepare(
    `INSERT INTO speakers (id, recording_id, name, color)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction((spks: Speaker[]) => {
    for (const spk of spks) {
      stmt.run(`${recordingId}-${spk.id}`, recordingId, spk.name, spk.color);
    }
  });

  insertMany(speakers);
}

function insertVideoFiles(
  db: Database.Database,
  recordingId: string,
  videoFiles: { viewType: string; videoUrl: string }[]
): void {
  const stmt = db.prepare(
    `INSERT INTO video_files (id, recording_id, view_type, video_url)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction(
    (files: { viewType: string; videoUrl: string }[]) => {
      for (const file of files) {
        stmt.run(
          `${recordingId}-${file.viewType}`,
          recordingId,
          file.viewType,
          file.videoUrl
        );
      }
    }
  );

  insertMany(videoFiles);
}

function insertChatMessages(
  db: Database.Database,
  recordingId: string,
  messages: ChatMessage[]
): void {
  const stmt = db.prepare(
    `INSERT INTO chat_messages (id, recording_id, timestamp, sender, message)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((msgs: ChatMessage[]) => {
    for (const msg of msgs) {
      stmt.run(
        `${recordingId}-${msg.id}`,
        recordingId,
        msg.timestamp,
        msg.sender,
        msg.message
      );
    }
  });

  insertMany(messages);
}

function isRecentlySynced(db: Database.Database, recordingId: string): boolean {
  const row = db
    .prepare(`SELECT synced_at FROM recordings WHERE id = ?`)
    .get(recordingId) as { synced_at: string } | undefined;

  if (!row) return false;

  // Consider synced if within the last hour
  const syncedAt = new Date(row.synced_at);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return syncedAt > oneHourAgo;
}

// Parallel processing helper with concurrency limit
async function processInParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      results[index] = await fn(item);
    }
  }

  // Start workers
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

// Process a single recording
async function processRecording(
  db: Database.Database,
  meeting: ZoomMeeting,
  accessToken: string,
  force: boolean = false
): Promise<{ synced: boolean; skipped: boolean; topic: string }> {
  const videoFile = findVideoFile(meeting.recording_files);
  if (!videoFile) {
    return { synced: false, skipped: true, topic: meeting.topic };
  }

  // Prefix ID with zoom_ to avoid collisions with other sources
  const recordingId = `zoom_${meeting.uuid}`;

  // Skip if recently synced (unless force)
  if (!force && isRecentlySynced(db, recordingId)) {
    return { synced: false, skipped: true, topic: meeting.topic };
  }

  console.log(`📥 Syncing "${meeting.topic}"...`);

  try {
    // Get recording details with download token
    const details = await getRecordingDetails(accessToken, meeting.uuid);

    // Find files we need to fetch
    const transcriptFile = findTranscriptFile(details.recording_files);
    const chatFile = findChatFile(details.recording_files);

    // Fetch summary, transcript, and chat in parallel (independent network calls)
    const [summary, transcriptContent, chatResult] = await Promise.all([
      // Fetch meeting summary from Zoom AI
      getMeetingSummary(accessToken, meeting.uuid),
      // Fetch transcript if available
      transcriptFile
        ? fetchTranscript(accessToken, transcriptFile.download_url)
        : Promise.resolve(null),
      // Fetch chat if available
      chatFile
        ? fetchChatFile(accessToken, chatFile.download_url)
            .then((content) => ({ success: true, content }))
            .catch(() => ({ success: false, content: null }))
        : Promise.resolve({ success: false, content: null }),
    ]);

    // Use summary, or agenda, or fallback to date
    const description =
      summary ||
      meeting.agenda ||
      undefined;

    // Insert/update recording
    upsertRecording(db, {
      id: recordingId,
      title: meeting.topic,
      description,
      videoUrl: videoFile.download_url,
      duration: meeting.duration * 60,
      space: "Zoom Meetings",
      source: "zoom",
      createdAt: meeting.start_time,
    });

    // Clear existing segments, speakers, and video files
    deleteRecordingData(db, recordingId);

    // Save all video views
    const allVideoFiles = findAllVideoFiles(details.recording_files);
    if (allVideoFiles.length > 0) {
      insertVideoFiles(
        db,
        recordingId,
        allVideoFiles.map((f) => ({
          viewType: f.recording_type,
          videoUrl: f.download_url,
        }))
      );
    }

    // Process transcript
    let transcriptInfo = "no transcript";
    if (transcriptContent) {
      const segments = parseZoomTranscript(transcriptContent);
      const speakers = extractZoomSpeakers(segments);

      insertSegments(db, recordingId, segments);
      insertSpeakers(db, recordingId, speakers);
      transcriptInfo = `${segments.length} segments, ${speakers.length} speakers`;
    }

    // Process chat messages
    let chatInfo = "no chat";
    if (chatResult.success && chatResult.content) {
      const messages = parseChatFile(chatResult.content, meeting.start_time);
      if (messages.length > 0) {
        insertChatMessages(db, recordingId, messages);
        chatInfo = `${messages.length} chat messages`;
      }
    } else if (chatFile && !chatResult.success) {
      chatInfo = "chat fetch failed";
    }

    console.log(
      `   ✓ "${meeting.topic}" - ${transcriptInfo}, ${chatInfo}, ${allVideoFiles.length} views`
    );

    return { synced: true, skipped: false, topic: meeting.topic };
  } catch (error) {
    console.log(`   ❌ "${meeting.topic}" - Error: ${error}`);
    return { synced: false, skipped: false, topic: meeting.topic };
  }
}

// Parse numeric arg like --arg=N
function parseNumericArg(prefix: string, defaultValue: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return arg ? parseInt(arg.split("=")[1], 10) : defaultValue;
}

// Main sync function
async function sync(): Promise<void> {
  const force = process.argv.includes("--force");

  // Parse arguments
  const years = parseNumericArg("years", 3);
  const parallelWindows = parseNumericArg("parallel-windows", 6);
  const parallelRecordings = parseNumericArg("parallel", 5);

  console.log("🔄 Starting Zoom sync...\n");
  if (force) {
    console.log("   ⚠️  Force mode: re-syncing all recordings\n");
  }

  // Initialize database
  console.log("📦 Initializing database...");
  const db = initDb();
  console.log(`   Database: ${DB_PATH}\n`);

  // Get Zoom access token
  console.log("🔑 Authenticating with Zoom...");
  const accessToken = await getZoomAccessToken();
  console.log("   ✓ Authenticated\n");

  // List all recordings (with parallel date range fetching)
  console.log(`📋 Fetching recordings list (last ${years} year${years > 1 ? "s" : ""})...`);
  const meetings = await listRecordings(accessToken, years, parallelWindows);
  console.log(`   Found ${meetings.length} total recordings\n`);

  // Process recordings in parallel
  console.log(`📥 Syncing recordings (${parallelRecordings} parallel)...\n`);
  const results = await processInParallel(
    meetings,
    (meeting) => processRecording(db, meeting, accessToken, force),
    parallelRecordings
  );

  const synced = results.filter((r) => r.synced).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.synced && !r.skipped).length;

  console.log(`\n✅ Sync complete!`);
  console.log(`   Synced: ${synced}`);
  console.log(`   Skipped: ${skipped} (already synced or no video)`);
  if (failed > 0) {
    console.log(`   Failed: ${failed}`);
  }

  db.close();
}

// Run
sync().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
