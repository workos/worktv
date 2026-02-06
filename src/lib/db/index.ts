// Cloudflare D1 Database Layer
import type { Recording, TranscriptSegment, Speaker, Clip, Participant } from "@/types/video";

// Get D1 database from Cloudflare bindings
// In Cloudflare Workers via OpenNext, the DB binding is available on process.env
function getDb(): D1Database {
  if (typeof process !== "undefined" && process.env.DB) {
    return (process.env as { DB: D1Database }).DB;
  }
  throw new Error("D1 database not available. Make sure DB binding is configured in wrangler.toml");
}

// --- Type exports ---

export interface RecordingRow {
  id: string;
  title: string;
  custom_title: string | null;
  description: string | null;
  video_url: string;
  duration: number;
  space: string;
  source: string;
  media_type: string | null;
  media_url_expires_at: string | null;
  created_at: string;
  synced_at: string;
  poster_url: string | null;
  preview_gif_url: string | null;
}

export interface SegmentRow {
  id: string;
  recording_id: string;
  start_time: number;
  end_time: number;
  speaker: string;
  text: string;
}

export interface SpeakerRow {
  id: string;
  recording_id: string;
  name: string;
  color: string;
}

export interface VideoFileRow {
  id: string;
  recording_id: string;
  view_type: string;
  video_url: string;
}

export interface ChatMessageRow {
  id: string;
  recording_id: string;
  timestamp: number;
  sender: string;
  message: string;
}

export interface SummaryRow {
  id: string;
  recording_id: string;
  content: string;
  model: string;
  generated_at: string;
}

export interface ClipRow {
  id: string;
  recording_id: string;
  title: string | null;
  start_time: number;
  end_time: number;
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  recording_id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  join_time: string | null;
  leave_time: string | null;
  duration: number | null;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SearchResultRow extends RecordingRow {
  match_type: "title" | "custom_title" | "transcript" | "speaker";
  match_text: string | null;
  match_time: number | null;
}

export interface ClipWithRecordingRow extends ClipRow {
  recording_title: string;
}

// --- Utility functions ---

function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export function isMediaUrlExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

// --- Pure transform functions ---

export function dbRowToRecording(
  row: RecordingRow,
  segments: SegmentRow[],
  speakers: SpeakerRow[],
  accessToken?: string
): Recording {
  const videoUrl =
    accessToken && row.source === "zoom"
      ? `${row.video_url}?access_token=${accessToken}`
      : row.video_url;

  return {
    id: row.id,
    title: row.title,
    customTitle: row.custom_title ?? undefined,
    description: row.description ?? undefined,
    videoUrl,
    posterUrl: undefined,
    duration: row.duration,
    space: row.space,
    source: row.source || "zoom",
    mediaType: (row.media_type as "video" | "audio") || "video",
    createdAt: row.created_at,
    speakers: speakers.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
    })),
    transcript: segments.map((s) => ({
      id: s.id,
      startTime: s.start_time,
      endTime: s.end_time,
      speaker: s.speaker,
      text: s.text,
    })),
  };
}

export function dbRowToClip(row: ClipRow): Clip {
  return {
    id: row.id,
    recordingId: row.recording_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
  };
}

// --- Query functions ---

export async function getAllRecordings(): Promise<RecordingRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM recordings WHERE duration >= 60 ORDER BY created_at DESC`)
    .all<RecordingRow>();
  return result.results ?? [];
}

export async function getRecordingsBySource(
  source: "zoom" | "gong" | "all"
): Promise<RecordingRow[]> {
  if (source === "all") {
    return getAllRecordings();
  }
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT * FROM recordings WHERE duration >= 60 AND source = ? ORDER BY created_at DESC`
    )
    .bind(source)
    .all<RecordingRow>();
  return result.results ?? [];
}

export async function getTotalRecordingsCount(
  source: "zoom" | "gong" | "all" = "all"
): Promise<number> {
  const db = getDb();
  let result;
  if (source === "all") {
    result = await db
      .prepare(`SELECT COUNT(*) as count FROM recordings WHERE duration >= 60`)
      .first<{ count: number }>();
  } else {
    result = await db
      .prepare(
        `SELECT COUNT(*) as count FROM recordings WHERE duration >= 60 AND source = ?`
      )
      .bind(source)
      .first<{ count: number }>();
  }
  return result?.count ?? 0;
}

export async function getRecordingsPaginated(
  source: "zoom" | "gong" | "all",
  limit: number = 20,
  cursor?: string
): Promise<PaginatedResult<RecordingRow>> {
  const db = getDb();
  const sourceFilter = source !== "all" ? "AND source = ?" : "";

  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const parts = cursor.split("|");
    cursorCreatedAt = parts[0];
    cursorId = parts[1] || null;
  }

  const cursorFilter = cursorCreatedAt
    ? cursorId
      ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
      : "AND created_at < ?"
    : "";

  const params: (string | number)[] = [];
  if (source !== "all") params.push(source);
  if (cursorCreatedAt) {
    params.push(cursorCreatedAt);
    if (cursorId) {
      params.push(cursorCreatedAt);
      params.push(cursorId);
    }
  }
  params.push(limit + 1);

  const result = await db
    .prepare(
      `SELECT * FROM recordings
       WHERE duration >= 60 ${sourceFilter} ${cursorFilter}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(...params)
    .all<RecordingRow>();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? `${lastItem.created_at}|${lastItem.id}` : null;

  return { items, hasMore, nextCursor };
}

export async function getRecordingById(id: string): Promise<RecordingRow | undefined> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM recordings WHERE id = ?`)
    .bind(id)
    .first<RecordingRow>();
  return result ?? undefined;
}

const GENERIC_TITLES = [
  "Google Calendar Meeting (not synced)",
  "Zoom Meeting",
  "Personal Meeting Room",
];

export async function getRelatedRecordings(title: string, excludeId: string): Promise<RecordingRow[]> {
  if (GENERIC_TITLES.includes(title)) {
    return [];
  }

  const db = getDb();
  const result = await db
    .prepare(
      `SELECT * FROM recordings
       WHERE title = ? AND id != ? AND duration >= 60
       ORDER BY created_at DESC`
    )
    .bind(title, excludeId)
    .all<RecordingRow>();
  return result.results ?? [];
}

export async function updateMediaUrl(
  id: string,
  videoUrl: string,
  expiresAt: string
): Promise<void> {
  const db = getDb();
  await db
    .prepare(
      `UPDATE recordings SET video_url = ?, media_url_expires_at = ?, synced_at = ? WHERE id = ?`
    )
    .bind(videoUrl, expiresAt, new Date().toISOString(), id)
    .run();
}

export async function updateRecordingCustomTitle(
  id: string,
  customTitle: string | null
): Promise<void> {
  const db = getDb();
  await db
    .prepare(`UPDATE recordings SET custom_title = ? WHERE id = ?`)
    .bind(customTitle, id)
    .run();
}

// --- Search functions ---

export async function searchRecordings(
  query: string,
  source?: "zoom" | "gong" | "all"
): Promise<RecordingRow[]> {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;

  if (source && source !== "all") {
    const result = await db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60 AND r.source = ? AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .bind(source, searchTerm, searchTerm, searchTerm, searchTerm)
      .all<RecordingRow>();
    return result.results ?? [];
  }

  const result = await db
    .prepare(
      `SELECT DISTINCT r.* FROM recordings r
       LEFT JOIN segments s ON r.id = s.recording_id
       WHERE r.duration >= 60 AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
       ORDER BY r.created_at DESC`
    )
    .bind(searchTerm, searchTerm, searchTerm, searchTerm)
    .all<RecordingRow>();
  return result.results ?? [];
}

export async function searchRecordingsWithContext(
  query: string,
  source?: "zoom" | "gong" | "all"
): Promise<SearchResultRow[]> {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;
  const sourceFilter = source && source !== "all" ? "AND r.source = ?" : "";

  const sql = `
    SELECT DISTINCT r.*,
      CASE
        WHEN r.custom_title LIKE ? ESCAPE '\\' THEN 'custom_title'
        WHEN r.title LIKE ? ESCAPE '\\' THEN 'title'
        WHEN EXISTS (SELECT 1 FROM segments WHERE recording_id = r.id AND speaker LIKE ? ESCAPE '\\') THEN 'speaker'
        ELSE 'transcript'
      END as match_type,
      CASE
        WHEN r.custom_title LIKE ? ESCAPE '\\' THEN r.custom_title
        WHEN r.title LIKE ? ESCAPE '\\' THEN r.title
        WHEN EXISTS (SELECT 1 FROM segments WHERE recording_id = r.id AND speaker LIKE ? ESCAPE '\\')
          THEN (SELECT speaker FROM segments WHERE recording_id = r.id AND speaker LIKE ? ESCAPE '\\' LIMIT 1)
        ELSE (SELECT text FROM segments WHERE recording_id = r.id AND text LIKE ? ESCAPE '\\' LIMIT 1)
      END as match_text,
      CASE
        WHEN r.custom_title LIKE ? ESCAPE '\\' OR r.title LIKE ? ESCAPE '\\' THEN NULL
        ELSE (SELECT start_time FROM segments WHERE recording_id = r.id AND (text LIKE ? ESCAPE '\\' OR speaker LIKE ? ESCAPE '\\') LIMIT 1)
      END as match_time
    FROM recordings r
    LEFT JOIN segments s ON r.id = s.recording_id
    WHERE r.duration >= 60 ${sourceFilter}
      AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
    ORDER BY r.created_at DESC
  `;

  const params = [
    searchTerm, searchTerm, searchTerm, // match_type CASE
    searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, // match_text CASE
    searchTerm, searchTerm, searchTerm, searchTerm, // match_time CASE
    ...(source && source !== "all" ? [source] : []),
    searchTerm, searchTerm, searchTerm, searchTerm, // WHERE clause
  ];

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<SearchResultRow>();
  return result.results ?? [];
}

export async function searchRecordingsWithSpeaker(
  query: string,
  speakerNames: string | string[],
  source?: "zoom" | "gong" | "all"
): Promise<RecordingRow[]> {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;
  const sourceFilter = source && source !== "all" ? source : null;

  const speakers = Array.isArray(speakerNames) ? speakerNames : [speakerNames];
  if (speakers.length === 0) return [];

  const placeholders = speakers.map(() => "?").join(", ");
  const speakerFilter = `
    (SELECT COUNT(DISTINCT sp.name) FROM speakers sp
     WHERE sp.recording_id = r.id AND sp.name IN (${placeholders})) = ?`;

  if (query.trim()) {
    const baseQuery = `
      SELECT DISTINCT r.* FROM recordings r
      LEFT JOIN segments s ON r.id = s.recording_id
      WHERE r.duration >= 60
        AND ${speakerFilter}
        ${sourceFilter ? "AND r.source = ?" : ""}
        AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
      ORDER BY r.created_at DESC`;

    const params = sourceFilter
      ? [...speakers, speakers.length, sourceFilter, searchTerm, searchTerm, searchTerm, searchTerm]
      : [...speakers, speakers.length, searchTerm, searchTerm, searchTerm, searchTerm];

    const result = await db.prepare(baseQuery).bind(...params).all<RecordingRow>();
    return result.results ?? [];
  } else {
    const baseQuery = `
      SELECT DISTINCT r.* FROM recordings r
      WHERE r.duration >= 60
        AND ${speakerFilter}
        ${sourceFilter ? "AND r.source = ?" : ""}
      ORDER BY r.created_at DESC`;

    const params = sourceFilter
      ? [...speakers, speakers.length, sourceFilter]
      : [...speakers, speakers.length];

    const result = await db.prepare(baseQuery).bind(...params).all<RecordingRow>();
    return result.results ?? [];
  }
}

export async function searchRecordingsWithParticipant(
  query: string,
  participantEmail: string,
  source?: "zoom" | "gong" | "all"
): Promise<RecordingRow[]> {
  const db = getDb();
  const searchTerm = `%${escapeLikeWildcards(query)}%`;
  const sourceFilter = source && source !== "all" ? source : null;

  if (query.trim()) {
    if (sourceFilter) {
      const result = await db
        .prepare(
          `SELECT DISTINCT r.* FROM recordings r
           INNER JOIN participants p ON r.id = p.recording_id
           LEFT JOIN segments s ON r.id = s.recording_id
           WHERE r.duration >= 60
             AND r.source = ?
             AND p.email = ?
             AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
           ORDER BY r.created_at DESC`
        )
        .bind(sourceFilter, participantEmail, searchTerm, searchTerm, searchTerm, searchTerm)
        .all<RecordingRow>();
      return result.results ?? [];
    }
    const result = await db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         INNER JOIN participants p ON r.id = p.recording_id
         LEFT JOIN segments s ON r.id = s.recording_id
         WHERE r.duration >= 60
           AND p.email = ?
           AND (r.title LIKE ? ESCAPE '\\' OR r.custom_title LIKE ? ESCAPE '\\' OR s.text LIKE ? ESCAPE '\\' OR s.speaker LIKE ? ESCAPE '\\')
         ORDER BY r.created_at DESC`
      )
      .bind(participantEmail, searchTerm, searchTerm, searchTerm, searchTerm)
      .all<RecordingRow>();
    return result.results ?? [];
  } else {
    if (sourceFilter) {
      const result = await db
        .prepare(
          `SELECT DISTINCT r.* FROM recordings r
           INNER JOIN participants p ON r.id = p.recording_id
           WHERE r.duration >= 60 AND r.source = ? AND p.email = ?
           ORDER BY r.created_at DESC`
        )
        .bind(sourceFilter, participantEmail)
        .all<RecordingRow>();
      return result.results ?? [];
    }
    const result = await db
      .prepare(
        `SELECT DISTINCT r.* FROM recordings r
         INNER JOIN participants p ON r.id = p.recording_id
         WHERE r.duration >= 60 AND p.email = ?
         ORDER BY r.created_at DESC`
      )
      .bind(participantEmail)
      .all<RecordingRow>();
    return result.results ?? [];
  }
}

// --- Segment functions ---

export async function getSegmentsByRecordingId(recordingId: string): Promise<SegmentRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM segments WHERE recording_id = ? ORDER BY start_time`)
    .bind(recordingId)
    .all<SegmentRow>();
  return result.results ?? [];
}

// --- Speaker functions ---

export async function getSpeakersByRecordingId(recordingId: string): Promise<SpeakerRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM speakers WHERE recording_id = ?`)
    .bind(recordingId)
    .all<SpeakerRow>();
  return result.results ?? [];
}

export async function getSpeakersByRecordingIds(
  recordingIds: string[]
): Promise<Record<string, SpeakerRow[]>> {
  if (recordingIds.length === 0) return {};

  const db = getDb();
  const placeholders = recordingIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT * FROM speakers WHERE recording_id IN (${placeholders})`
    )
    .bind(...recordingIds)
    .all<SpeakerRow>();

  const rows = result.results ?? [];
  return rows.reduce<Record<string, SpeakerRow[]>>((acc, row) => {
    if (!acc[row.recording_id]) acc[row.recording_id] = [];
    acc[row.recording_id].push(row);
    return acc;
  }, {});
}

export async function getAllUniqueSpeakers(): Promise<{ name: string; color: string; count: number }[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT name, color, COUNT(DISTINCT recording_id) as count
       FROM speakers
       GROUP BY name
       ORDER BY count DESC, name ASC`
    )
    .all<{ name: string; color: string; count: number }>();
  return result.results ?? [];
}

// --- Participant functions ---

export async function getParticipantsByRecordingId(recordingId: string): Promise<ParticipantRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM participants WHERE recording_id = ?`)
    .bind(recordingId)
    .all<ParticipantRow>();
  return result.results ?? [];
}

export async function getParticipantsByRecordingIds(
  recordingIds: string[]
): Promise<Record<string, ParticipantRow[]>> {
  if (recordingIds.length === 0) return {};

  const db = getDb();
  const placeholders = recordingIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT * FROM participants WHERE recording_id IN (${placeholders})`
    )
    .bind(...recordingIds)
    .all<ParticipantRow>();

  const rows = result.results ?? [];
  return rows.reduce<Record<string, ParticipantRow[]>>((acc, row) => {
    if (!acc[row.recording_id]) acc[row.recording_id] = [];
    acc[row.recording_id].push(row);
    return acc;
  }, {});
}

export async function getAllUniqueParticipants(): Promise<{ email: string; name: string; count: number }[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT email, name, COUNT(DISTINCT recording_id) as count
       FROM participants
       WHERE email IS NOT NULL AND email != ''
       GROUP BY email
       ORDER BY count DESC, name ASC`
    )
    .all<{ email: string; name: string; count: number }>();
  return result.results ?? [];
}

// --- Video file functions ---

export async function getVideoFilesByRecordingId(recordingId: string): Promise<VideoFileRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM video_files WHERE recording_id = ?`)
    .bind(recordingId)
    .all<VideoFileRow>();
  return result.results ?? [];
}

// --- Chat message functions ---

export async function getChatMessagesByRecordingId(recordingId: string): Promise<ChatMessageRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM chat_messages WHERE recording_id = ? ORDER BY timestamp`)
    .bind(recordingId)
    .all<ChatMessageRow>();
  return result.results ?? [];
}

// --- Summary functions ---

export async function getSummaryByRecordingId(recordingId: string): Promise<SummaryRow | undefined> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM summaries WHERE recording_id = ?`)
    .bind(recordingId)
    .first<SummaryRow>();
  return result ?? undefined;
}

export async function getSummariesByRecordingIds(recordingIds: string[]): Promise<Record<string, SummaryRow>> {
  if (recordingIds.length === 0) return {};

  const db = getDb();
  const placeholders = recordingIds.map(() => "?").join(",");
  const result = await db
    .prepare(`SELECT * FROM summaries WHERE recording_id IN (${placeholders})`)
    .bind(...recordingIds)
    .all<SummaryRow>();

  const rows = result.results ?? [];
  const map: Record<string, SummaryRow> = {};
  for (const row of rows) {
    map[row.recording_id] = row;
  }
  return map;
}

export async function upsertSummary(summary: {
  recordingId: string;
  content: string;
  model: string;
}): Promise<void> {
  const db = getDb();
  const id = `summary-${summary.recordingId}`;
  await db
    .prepare(
      `INSERT OR REPLACE INTO summaries (id, recording_id, content, model, generated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      summary.recordingId,
      summary.content,
      summary.model,
      new Date().toISOString()
    )
    .run();
}

// --- Clip functions ---

export async function getAllClipsWithRecordingTitle(): Promise<ClipWithRecordingRow[]> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT c.*, COALESCE(r.custom_title, r.title) as recording_title
       FROM clips c
       INNER JOIN recordings r ON c.recording_id = r.id
       ORDER BY c.created_at DESC`
    )
    .all<ClipWithRecordingRow>();
  return result.results ?? [];
}

export async function getClipById(id: string): Promise<ClipRow | undefined> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM clips WHERE id = ?`)
    .bind(id)
    .first<ClipRow>();
  return result ?? undefined;
}

export async function getClipsByRecordingId(recordingId: string): Promise<ClipRow[]> {
  const db = getDb();
  const result = await db
    .prepare(`SELECT * FROM clips WHERE recording_id = ? ORDER BY start_time`)
    .bind(recordingId)
    .all<ClipRow>();
  return result.results ?? [];
}

async function generateClipTitle(recordingId: string, startTime: number, endTime: number): Promise<string | null> {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT text FROM segments
       WHERE recording_id = ? AND start_time < ? AND end_time > ?
       ORDER BY start_time
       LIMIT 5`
    )
    .bind(recordingId, endTime, startTime)
    .all<{ text: string }>();

  const segments = result.results ?? [];
  if (segments.length === 0) return null;

  const combinedText = segments.map((s) => s.text).join(" ");
  if (combinedText.length <= 60) return combinedText;
  return combinedText.slice(0, 57) + "...";
}

export async function insertClip(clip: {
  id: string;
  recordingId: string;
  title?: string;
  startTime: number;
  endTime: number;
}): Promise<ClipRow> {
  const db = getDb();
  const title = clip.title || await generateClipTitle(clip.recordingId, clip.startTime, clip.endTime);
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO clips (id, recording_id, title, start_time, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(clip.id, clip.recordingId, title, clip.startTime, clip.endTime, createdAt)
    .run();

  return {
    id: clip.id,
    recording_id: clip.recordingId,
    title,
    start_time: clip.startTime,
    end_time: clip.endTime,
    created_at: createdAt,
  };
}

export async function deleteClip(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .prepare(`DELETE FROM clips WHERE id = ?`)
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
